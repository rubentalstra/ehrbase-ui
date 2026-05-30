#!/usr/bin/env bash
# DEV-ONLY empirical version probe for the running EHRbase 2.31.0 dev stack.
#
# EHRbase's /rest/status (which reports the EHRbase + openEHR-SDK/archie versions)
# is OAuth-gated, and the seeded dev clients are browser-auth-code-flow only. This
# script creates a TEMPORARY public client with direct-access-grants, mints a
# dev-clinician token from INSIDE the docker network (so the token `iss` matches
# the http://keycloak:8080 issuer EHRbase validates against), reads /rest/status,
# and DELETES the temp client again. Nothing persistent is left behind.
#
# Run from the repo root:  bash scripts/dev/ehrbase-version-probe.sh
set -euo pipefail

NET="ehrbase-ui_ehrbase-net"
KC="/opt/keycloak/bin/kcadm.sh"
CLIENT="tmp-version-probe"
REALM="ehrbase"

cleanup() {
  ID=$(docker compose exec -T keycloak "$KC" get clients -r "$REALM" -q clientId="$CLIENT" --fields id --format csv 2>/dev/null | tr -d '"' || true)
  if [ -n "${ID:-}" ]; then
    docker compose exec -T keycloak "$KC" delete "clients/$ID" -r "$REALM" >/dev/null 2>&1 || true
    echo "[probe] deleted temporary client $CLIENT"
  fi
}
trap cleanup EXIT

echo "[probe] logging in to Keycloak (dev admin) + creating temporary public client…"
docker compose exec -T keycloak "$KC" config credentials --server http://localhost:8080 --realm master --user admin --password admin >/dev/null
docker compose exec -T keycloak "$KC" create clients -r "$REALM" \
  -s clientId="$CLIENT" -s publicClient=true -s directAccessGrantsEnabled=true -s enabled=true >/dev/null

echo "[probe] minting a dev-clinician token inside the docker network…"
TOKEN=$(docker run --rm --network "$NET" curlimages/curl:8.11.1 -s \
  -d grant_type=password -d client_id="$CLIENT" \
  -d username=dev-clinician -d 'password=DevClinician123!' \
  http://keycloak:8080/realms/"$REALM"/protocol/openid-connect/token \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)

if [ -z "${TOKEN:-}" ]; then
  echo "[probe] FAILED to obtain a token" >&2
  exit 1
fi

echo "[probe] GET /ehrbase/rest/status →"
docker run --rm --network "$NET" curlimages/curl:8.11.1 -s \
  -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  http://ehrbase:8080/ehrbase/rest/status | python3 -m json.tool
