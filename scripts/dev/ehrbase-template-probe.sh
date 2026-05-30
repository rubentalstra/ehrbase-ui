#!/usr/bin/env bash
# DEV-ONLY live check for Tranche 1b: upload a real OPT to the running EHRbase
# 2.31.0 dev stack and fetch its web template (Accept: application/json) — the
# exact contract server/functions/template.server.ts::fetchWebTemplate relies on.
# Mirrors scripts/dev/ehrbase-version-probe.sh: temporary public Keycloak client,
# dev-clinician token minted inside the docker network, client deleted on exit.
#
#   bash scripts/dev/ehrbase-template-probe.sh
set -euo pipefail

NET="ehrbase-ui_ehrbase-net"
KC="/opt/keycloak/bin/kcadm.sh"
CLIENT="tmp-template-probe"
REALM="ehrbase"
EHRBASE="http://ehrbase:8080/ehrbase/rest/openehr/v1"
OPT_URL="https://raw.githubusercontent.com/ehrbase/openEHR_SDK/develop/test-data/src/main/resources/operationaltemplate/EHRN%20Vital%20signs.v2.opt"

cleanup() {
  ID=$(docker compose exec -T keycloak "$KC" get clients -r "$REALM" -q clientId="$CLIENT" --fields id --format csv 2>/dev/null | tr -d '"' || true)
  [ -n "${ID:-}" ] && docker compose exec -T keycloak "$KC" delete "clients/$ID" -r "$REALM" >/dev/null 2>&1 && echo "[probe] deleted temp client"
}
trap cleanup EXIT

echo "[probe] creating temp public client…"
docker compose exec -T keycloak "$KC" config credentials --server http://localhost:8080 --realm master --user admin --password admin >/dev/null
docker compose exec -T keycloak "$KC" create clients -r "$REALM" \
  -s clientId="$CLIENT" -s publicClient=true -s directAccessGrantsEnabled=true -s enabled=true >/dev/null

echo "[probe] uploading OPT + fetching its web template (inside the docker network)…"
docker run --rm --network "$NET" curlimages/curl:8.11.1 sh -c '
  set -e
  TOKEN=$(curl -s -d grant_type=password -d client_id='"$CLIENT"' -d username=dev-clinician -d "password=DevClinician123!" \
    http://keycloak:8080/realms/'"$REALM"'/protocol/openid-connect/token | sed -n "s/.*\"access_token\":\"\([^\"]*\)\".*/\1/p")
  [ -z "$TOKEN" ] && { echo "[probe] FAILED to get token"; exit 1; }
  curl -s -o /tmp/opt.xml "'"$OPT_URL"'"
  echo "[probe] POST OPT → $(curl -s -o /dev/null -w "%{http_code}" -X POST "'"$EHRBASE"'/definition/template/adl1.4" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/xml" --data-binary @/tmp/opt.xml)"
  echo "[probe] GET web template (Accept: application/json):"
  curl -s "'"$EHRBASE"'/definition/template/adl1.4/ehrn_vital_signs.v2" \
    -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
    | sed "s/,/,\n/g" | grep -E "\"templateId\"|\"rmType\"|\"semVer\"|\"defaultLanguage\"" | head -8
'
echo "[probe] If you see templateId + rmType=COMPOSITION above, EHRbase returns the web-template shape parseWebTemplate accepts."
