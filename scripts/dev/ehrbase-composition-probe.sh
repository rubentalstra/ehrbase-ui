#!/usr/bin/env bash
# DEV-ONLY live check for Tranche 1c: exercise the EHRbase 2.31.0 COMPOSITION
# contract that server/functions/composition.server.ts relies on, at the raw
# REST level — upload the OPT, create an EHR, FLAT-write a real composition,
# read it back, force a stale If-Match (expect 412), then inspect the
# CONTRIBUTION committer (proves committer-from-token, ADR-0024 addendum).
#
# Uses the vendored openEHR_SDK FLAT fixture (ehrn_vital_signs.v2) — a known-good
# template+composition pair. Same temp-client pattern as the version/template
# probes; client deleted on exit.
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
# EHRbase 2.31 expects the FLAT body as application/json + ?format=FLAT (it
# rejects application/openehr.wt.flat+json with 415 — verified live 2026-05-30).
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
  TOKEN=$(curl -s -d grant_type=password -d client_id='"$CLIENT"' -d username=dev-clinician -d "password=DevClinician123!" \
    http://keycloak:8080/realms/'"$REALM"'/protocol/openid-connect/token | sed -n "s/.*\"access_token\":\"\([^\"]*\)\".*/\1/p")
  [ -z "$TOKEN" ] && { echo "[probe] FAILED to get token"; exit 1; }
  AUTH="Authorization: Bearer $TOKEN"

  # 1) upload OPT (tolerate 409 already-exists)
  curl -s -o /tmp/opt.xml "'"$OPT_URL"'"
  echo "[1] upload OPT → $(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/definition/template/adl1.4" -H "$AUTH" \
    -H "Content-Type: application/xml" --data-binary @/tmp/opt.xml)"

  # 2) create EHR → ehr_id from ETag ("<uuid>"), fallback to Location last segment
  curl -s -D /tmp/h -o /dev/null -X POST "$B/ehr" -H "$AUTH" -H "Prefer: return=minimal"
  EHR=$(grep -i "^etag:" /tmp/h | tr -d "\r\"" | sed "s/.*: *//")
  [ -z "$EHR" ] && EHR=$(grep -i "^location:" /tmp/h | tr -d "\r" | sed "s#.*/##")
  echo "[2] created EHR → $EHR"
  [ -z "$EHR" ] && { echo "[probe] no ehr_id"; exit 1; }

  # 3) FLAT write — EHRbase needs templateId as a QUERY PARAM (flat bodies do not
  #    carry it). Endpoint: ?format=FLAT and templateId=ID, Content-Type app/json.
  TID_ENC="EHRN%20Vital%20signs.v2"
  echo "[3] FLAT write  ?format=FLAT&templateId=$TID_ENC :"
  curl -s -D /tmp/h -o /tmp/b -X POST "$B/ehr/$EHR/composition?format=FLAT&templateId=$TID_ENC" -H "$AUTH" \
    -H "Content-Type: '"$FLAT_CT"'" -H "Prefer: return=representation" --data-binary @/tmp/comp.json
  echo "    $(grep -i "^HTTP" /tmp/h | tail -1 | tr -d "\r")"
  echo "    raw ETag:     $(grep -i "^etag:" /tmp/h | tr -d "\r")"
  echo "    raw Location: $(grep -i "^location:" /tmp/h | tr -d "\r")"
  # version_uid = the full triple in the ETag (uuid::system::ver). Location only
  # carries the bare object id, so ETag is the source of truth for concurrency.
  VUID=$(grep -i "^etag:" /tmp/h | tr -d "\r\"" | sed "s/.*etag: *//I")
  echo "    version_uid = $VUID"
  [ -z "$VUID" ] && { echo "[probe] no version_uid — see headers above; stopping here"; exit 0; }

  # 4) read it back
  echo "[4] FLAT read  → $(curl -s -o /dev/null -w "%{http_code}" "$B/ehr/$EHR/composition/$VUID?format=FLAT" -H "$AUTH" -H "Accept: '"$FLAT_CT"'")"

  # 5) optimistic concurrency. version_uid object id = first :: segment.
  OBJ=$(echo "$VUID" | sed "s/::.*//")
  echo "[5] OBJ=[$OBJ]  (len $(printf %s "$OBJ" | wc -c)) — expect a 36-char UUID"
  # 5a) valid update with the CURRENT full version_uid (v1) in If-Match.
  curl -s -D /tmp/h2 -o /tmp/b2 -X PUT "$B/ehr/$EHR/composition/$OBJ?format=FLAT&templateId=$TID_ENC" \
    -H "$AUTH" -H "Content-Type: '"$FLAT_CT"'" -H "If-Match: \"$VUID\"" --data-binary @/tmp/comp.json
  echo "[5a] update (If-Match full version_uid) → $(grep -i "^HTTP" /tmp/h2 | tail -1 | tr -d "\r")  $(head -c 160 /tmp/b2)"
  V2=$(grep -i "^etag:" /tmp/h2 | tr -d "\r\"" | sed "s/.*etag: *//I")
  echo "     new version_uid = $V2"
  # 5a-alt) same update, full version_uid but WITHOUT surrounding quotes
  # (hypothesis: EHRbase FLAT-PUT does not strip the spec-mandated quotes).
  curl -s -D /tmp/h3 -o /tmp/b3 -X PUT "$B/ehr/$EHR/composition/$OBJ?format=FLAT&templateId=$TID_ENC" \
    -H "$AUTH" -H "Content-Type: '"$FLAT_CT"'" -H "If-Match: $VUID" --data-binary @/tmp/comp.json
  echo "[5a-alt] update (If-Match unquoted version_uid) → $(grep -i "^HTTP" /tmp/h3 | tail -1 | tr -d "\r")  $(head -c 120 /tmp/b3)  etag:$(grep -i "^etag:" /tmp/h3 | tr -d "\r" | sed "s/.*: //")"
  [ -z "$V2" ] && V2=$(grep -i "^etag:" /tmp/h3 | tr -d "\r\"" | sed "s/.*etag: *//I")
  # 5b) re-use the now-SUPERSEDED v1 (unquoted, valid format, stale) → 412.
  echo "[5b] stale update (unquoted If-Match v1 again) → $(curl -s -o /dev/null -w "%{http_code}" -X PUT "$B/ehr/$EHR/composition/$OBJ?format=FLAT&templateId=$TID_ENC" \
    -H "$AUTH" -H "Content-Type: '"$FLAT_CT"'" -H "If-Match: $VUID" --data-binary @/tmp/comp.json)  (want 412)"

  # 6) committer (ADR-0024) — canonical version GET → commit_audit.committer.name
  echo "[6] committer (from token):"
  curl -s "$B/ehr/$EHR/versioned_composition/$OBJ/version/$VUID" -H "$AUTH" -H "Accept: application/json" \
    | sed "s/,/,\n/g" | grep -iE "\"committer\"|\"name\"|change_type|\"value\"" | head -6 || echo "    (version endpoint shape varies; committer is auth-derived)"
'
echo "[probe] PASS criteria: [3] 201, [4] 200, [5] 412, [6] committer name = dev-clinician’s identity."
