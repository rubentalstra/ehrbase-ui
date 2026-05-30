#!/usr/bin/env bash
# DEV-ONLY: seed the local EHRbase 2.31.0 dev stack with openEHR Operational
# Templates (OPTs) so the workbench (template explorer / compose form / AQL) has
# real templates to render against — no manual upload needed.
#
# Sources (in order, all idempotent — a template already present is skipped):
#   1. CURATED remote OPTs  — stable openEHR_SDK test-data URLs (default; these
#      match the round-trip fixtures the openehr-flat/web-template tests use).
#   2. LOCAL drop-in dir    — any *.opt you place in scripts/dev/seed-templates/
#      (download .opt files from the openEHR CKM https://ckm.openehr.org/ckm/ or
#      export from a template tool, drop them here, re-run).
#   3. SANDBOX (--from-sandbox) — pull every template from the public EHRbase
#      sandbox https://sandkiste.ehrbase.org and upload it. Best-effort: the
#      sandbox is public + may change; logs each id it finds.
#
# Auth mirrors scripts/dev/ehrbase-template-probe.sh: the local EHRbase is
# OAuth-gated, so we mint a dev-clinician token INSIDE the docker network (token
# `iss` must match the http://keycloak:8080 issuer EHRbase validates). A
# temporary public Keycloak client is created and deleted on exit. Everything
# runs inside one curl container that has BOTH internet (for the OPT sources) and
# docker-network access (for keycloak:8080 + ehrbase:8080).
#
#   bash scripts/dev/seed-templates.sh                 # curated + local dir
#   bash scripts/dev/seed-templates.sh --from-sandbox  # + pull the public sandbox
#
# Requires the dev stack up: docker compose --profile demo up -d --wait
set -euo pipefail

NET="ehrbase-ui_ehrbase-net"
KC="/opt/keycloak/bin/kcadm.sh"
CLIENT="tmp-seed-templates"
REALM="ehrbase"
EHRBASE="http://ehrbase:8080/ehrbase/rest/openehr/v1"
SANDBOX_URL="${SANDBOX_URL:-https://sandkiste.ehrbase.org/ehrbase/rest/openehr/v1}"
SEED_DIR="$(cd "$(dirname "$0")" && pwd)/seed-templates"

FROM_SANDBOX=0
[ "${1:-}" = "--from-sandbox" ] && FROM_SANDBOX=1

# Curated, stable OPT URLs (extend freely — see the openEHR_SDK test-data dir:
# https://github.com/ehrbase/openEHR_SDK/tree/develop/test-data/src/main/resources/operationaltemplate).
CURATED_OPTS=(
  "https://raw.githubusercontent.com/ehrbase/openEHR_SDK/develop/test-data/src/main/resources/operationaltemplate/EHRN%20Vital%20signs.v2.opt"
)

cleanup() {
  ID=$(docker compose exec -T keycloak "$KC" get clients -r "$REALM" -q clientId="$CLIENT" --fields id --format csv 2>/dev/null | tr -d '"' || true)
  [ -n "${ID:-}" ] && docker compose exec -T keycloak "$KC" delete "clients/$ID" -r "$REALM" >/dev/null 2>&1 && echo "[seed] deleted temp client"
}
trap cleanup EXIT

echo "[seed] creating temp public Keycloak client…"
docker compose exec -T keycloak "$KC" config credentials --server http://localhost:8080 --realm master --user admin --password admin >/dev/null
docker compose exec -T keycloak "$KC" create clients -r "$REALM" \
  -s clientId="$CLIENT" -s publicClient=true -s directAccessGrantsEnabled=true -s enabled=true >/dev/null

echo "[seed] seeding templates (curated${FROM_SANDBOX:+ + sandbox} + local drop-in)…"
docker run --rm --network "$NET" -v "$SEED_DIR:/seed:ro" \
  -e CURATED="${CURATED_OPTS[*]}" -e SANDBOX_URL="$SANDBOX_URL" -e FROM_SANDBOX="$FROM_SANDBOX" \
  -e EHRBASE="$EHRBASE" -e CLIENT="$CLIENT" -e REALM="$REALM" \
  curlimages/curl:8.11.1 sh -c '
  set -e
  TOKEN=$(curl -s -d grant_type=password -d client_id="$CLIENT" -d username=dev-clinician -d "password=DevClinician123!" \
    http://keycloak:8080/realms/"$REALM"/protocol/openid-connect/token | sed -n "s/.*\"access_token\":\"\([^\"]*\)\".*/\1/p")
  [ -z "$TOKEN" ] && { echo "[seed] FAILED to mint token"; exit 1; }

  present() { curl -s "$EHRBASE/definition/template/adl1.4" -H "Authorization: Bearer $TOKEN" -H "Accept: application/json"; }
  # Upload an OPT file unless its <template_id> is already registered locally.
  upload() {
    f="$1"; src="$2"
    tid=$(grep -oE "<template_id>[^<]+</template_id>" "$f" | head -1 | sed "s/<[^>]*>//g")
    [ -z "$tid" ] && tid=$(grep -oE "<id>[^<]+</id>" "$f" | head -1 | sed "s/<[^>]*>//g")
    if [ -n "$tid" ] && present | grep -qF "\"$tid\""; then
      echo "[seed] skip (already present): $tid   <$src>"; return 0
    fi
    code=$(curl -s -o /tmp/r -w "%{http_code}" -X POST "$EHRBASE/definition/template/adl1.4" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/xml" --data-binary @"$f")
    echo "[seed] upload ${tid:-?} → HTTP $code   <$src>"
  }

  # 1. curated remote OPTs
  i=0
  for url in $CURATED; do
    i=$((i+1)); out="/tmp/curated_$i.opt"
    if curl -fsS -o "$out" "$url"; then upload "$out" "$url"; else echo "[seed] WARN could not fetch $url"; fi
  done

  # 2. local drop-in dir
  for f in /seed/*.opt; do
    [ -e "$f" ] || continue
    upload "$f" "$(basename "$f")"
  done

  # 3. optional sandbox pull
  if [ "$FROM_SANDBOX" = "1" ]; then
    echo "[seed] listing sandbox templates: $SANDBOX_URL/definition/template/adl1.4"
    curl -fsS "$SANDBOX_URL/definition/template/adl1.4" -H "Accept: application/json" > /tmp/sb.json || { echo "[seed] WARN sandbox list failed"; exit 0; }
    ids=$(grep -oE "\"template_id\" *: *\"[^\"]*\"" /tmp/sb.json | sed "s/.*: *\"//;s/\"//")
    echo "[seed] sandbox templates: $(echo "$ids" | tr "\n" " ")"
    j=0
    echo "$ids" | while IFS= read -r tid; do
      [ -z "$tid" ] && continue
      j=$((j+1)); enc=$(echo "$tid" | sed "s/ /%20/g"); out="/tmp/sb_$j.opt"
      if curl -fsS -o "$out" "$SANDBOX_URL/definition/template/adl1.4/$enc" -H "Accept: application/xml"; then
        upload "$out" "sandbox:$tid"
      else
        echo "[seed] WARN could not fetch sandbox OPT for $tid"
      fi
    done
  fi

  echo "[seed] done. local template_ids now: $(present | grep -oE "\"template_id\" *: *\"[^\"]*\"" | sed "s/.*: *//" | tr "\n" " ")"
'
echo "[seed] templates seeded into the local EHRbase. Open the workbench → Templates."
