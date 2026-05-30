#!/usr/bin/env bash
# DEV-ONLY live regression check for the EHRbase 2.31.0 COMPOSITION contract that
# server/functions/composition.server.ts relies on. It makes ONLY the calls our
# code makes (the correct, verified contract) — no diagnostic wrong-way attempts —
# so a clean run produces no EHRbase error logs:
#
#   create EHR → FLAT write → read back → update (unquoted If-Match) → committer,
#   then ONE deliberate optimistic-concurrency conflict that MUST return 412.
#
# Verified EHRbase 2.31 FLAT contract:
#   • body media type = application/json + ?format=FLAT  (NOT openehr.wt.flat+json)
#   • template id passed as &templateId=<id>             (flat body omits it)
#   • version_uid = the full triple in the ETag          (Location = bare obj id)
#   • If-Match = the BARE version_uid, NOT double-quoted  (quotes → 400)
#
# Uses the vendored openEHR_SDK FLAT fixture (ehrn_vital_signs.v2). Same
# temp-client pattern as the version/template probes; client deleted on exit.
#
#   bash scripts/dev/ehrbase-composition-probe.sh
set -euo pipefail

NET="ehrbase-ui_ehrbase-net"
KC="/opt/keycloak/bin/kcadm.sh"
CLIENT="tmp-composition-probe"
REALM="ehrbase"
EHRBASE="http://ehrbase:8080/ehrbase/rest/openehr/v1"
OPT_URL="https://raw.githubusercontent.com/ehrbase/openEHR_SDK/develop/test-data/src/main/resources/operationaltemplate/EHRN%20Vital%20signs.v2.opt"
FIXTURE="$PWD/packages/openehr-flat/src/__tests__/fixtures/vitalsigns.flat.json"
FLAT_CT="application/json"

[ -f "$FIXTURE" ] || { echo "[probe] fixture not found: $FIXTURE"; exit 1; }

cleanup() {
  ID=$(docker compose exec -T keycloak "$KC" get clients -r "$REALM" -q clientId="$CLIENT" --fields id --format csv 2>/dev/null | tr -d '"' || true)
  [ -n "${ID:-}" ] && docker compose exec -T keycloak "$KC" delete "clients/$ID" -r "$REALM" >/dev/null 2>&1 && echo "[probe] deleted temp client"
}
trap cleanup EXIT

echo "[probe] creating temp public client…"
docker compose exec -T keycloak "$KC" config credentials --server http://localhost:8080 --realm master --user admin --password admin >/dev/null
docker compose exec -T keycloak "$KC" create clients -r "$REALM" \
  -s clientId="$CLIENT" -s publicClient=true -s directAccessGrantsEnabled=true -s enabled=true >/dev/null

echo "[probe] running composition round-trip inside the docker network…"
docker run --rm --network "$NET" -v "$FIXTURE:/tmp/comp.json:ro" curlimages/curl:8.11.1 sh -c '
  set -e
  B="'"$EHRBASE"'"
  CT="'"$FLAT_CT"'"
  TID_ENC="EHRN%20Vital%20signs.v2"
  TID="EHRN Vital signs.v2"
  FAIL=0
  TOKEN=$(curl -s -d grant_type=password -d client_id='"$CLIENT"' -d username=dev-clinician -d "password=DevClinician123!" \
    http://keycloak:8080/realms/'"$REALM"'/protocol/openid-connect/token | sed -n "s/.*\"access_token\":\"\([^\"]*\)\".*/\1/p")
  [ -z "$TOKEN" ] && { echo "[probe] FAILED to get token"; exit 1; }
  AUTH="Authorization: Bearer $TOKEN"

  # 1) ensure the template exists — upload ONLY if absent (avoids a 409 log line)
  if curl -s "$B/definition/template/adl1.4" -H "$AUTH" -H "Accept: application/json" | grep -q "$TID"; then
    echo "[1] template present → no upload needed"
  else
    curl -s -o /tmp/opt.xml "'"$OPT_URL"'"
    echo "[1] upload OPT → $(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/definition/template/adl1.4" -H "$AUTH" -H "Content-Type: application/xml" --data-binary @/tmp/opt.xml)"
  fi

  # 2) create EHR
  curl -s -D /tmp/h -o /dev/null -X POST "$B/ehr" -H "$AUTH" -H "Prefer: return=minimal"
  EHR=$(grep -i "^etag:" /tmp/h | tr -d "\r\"" | sed "s/.*: *//")
  [ -z "$EHR" ] && EHR=$(grep -i "^location:" /tmp/h | tr -d "\r" | sed "s#.*/##")
  echo "[2] created EHR → $EHR"
  [ -z "$EHR" ] && { echo "[probe] no ehr_id"; exit 1; }

  # 3) FLAT write — exactly as composition.server: application/json + ?format=FLAT&templateId
  curl -s -D /tmp/h -o /tmp/b -X POST "$B/ehr/$EHR/composition?format=FLAT&templateId=$TID_ENC" \
    -H "$AUTH" -H "Content-Type: $CT" -H "Prefer: return=representation" --data-binary @/tmp/comp.json
  W=$(grep -i "^HTTP" /tmp/h | tail -1 | tr -d "\r" | awk "{print \$2}")
  VUID=$(grep -i "^etag:" /tmp/h | tr -d "\r\"" | sed "s/.*etag: *//I")
  OBJ=$(echo "$VUID" | sed "s/::.*//")
  echo "[3] FLAT write → $W   version_uid=$VUID"
  [ "$W" = "201" ] || FAIL=1

  # 4) read it back
  R=$(curl -s -o /dev/null -w "%{http_code}" "$B/ehr/$EHR/composition/$VUID?format=FLAT" -H "$AUTH" -H "Accept: $CT")
  echo "[4] FLAT read  → $R"
  [ "$R" = "200" ] || FAIL=1

  # 5) update — exactly as composition.server: BARE (unquoted) version_uid in If-Match
  curl -s -D /tmp/h2 -o /dev/null -X PUT "$B/ehr/$EHR/composition/$OBJ?format=FLAT&templateId=$TID_ENC" \
    -H "$AUTH" -H "Content-Type: $CT" -H "If-Match: $VUID" --data-binary @/tmp/comp.json
  U=$(grep -i "^HTTP" /tmp/h2 | tail -1 | tr -d "\r" | awk "{print \$2}")
  V2=$(grep -i "^etag:" /tmp/h2 | tr -d "\r\"" | sed "s/.*etag: *//I")
  echo "[5] FLAT update (unquoted If-Match) → $U   new version_uid=$V2"
  [ "$U" = "204" ] || [ "$U" = "200" ] || FAIL=1

  # 6) committer (ADR-0024) — auth-derived, not from headers
  echo "[6] CONTRIBUTION committer (auth-derived):"
  curl -s "$B/ehr/$EHR/versioned_composition/$OBJ/version/$V2" -H "$AUTH" -H "Accept: application/json" \
    | sed "s/,/,\n/g" | grep -iE "\"committer\"|\"name\"|change_type" | head -4

  # 7) optimistic-concurrency GUARD (the ONE deliberate negative case): re-send the
  #    now-superseded v1. A 412 is the REQUIRED, correct outcome — it proves the
  #    guard works. EHRbase logs exactly one expected WARN here
  #    ("If-Match version_uid does not match latest version"); that WARN is the
  #    feature firing, NOT a fault.
  C=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$B/ehr/$EHR/composition/$OBJ?format=FLAT&templateId=$TID_ENC" \
    -H "$AUTH" -H "Content-Type: $CT" -H "If-Match: $VUID" --data-binary @/tmp/comp.json)
  echo "[7] concurrency guard: stale write correctly rejected → $C (412 = pass)"
  [ "$C" = "412" ] || FAIL=1

  echo ""
  [ "$FAIL" = "0" ] && echo "[probe] RESULT: ALL CHECKS PASSED — no unexpected errors." \
                     || echo "[probe] RESULT: a check did not return its expected status — see above."
  exit $FAIL
'
