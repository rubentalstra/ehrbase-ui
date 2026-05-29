#!/usr/bin/env bash
# Sync the Grafana OIDC client into the running Keycloak realm.
#
# Why this script exists
# ----------------------
# Keycloak's `start-dev --import-realm` only imports the realm JSON when the
# realm does NOT already exist in the Keycloak database (`Strategy:
# IGNORE_EXISTING`). On a fresh `docker compose down -v && up` the import
# fires; on every subsequent `up` the import skips, and any NEW client we've
# added to the realm JSON since the first boot is silently absent. That is
# what happened to the Grafana client landing in M5 — operators who upgraded
# from M4 saw `error="client_not_found"` when Grafana attempted SSO.
#
# Self-healing: this script is idempotent. It checks for the `grafana` client
# in the `ehrbase` realm and either creates it (on first boot) or updates it
# in-place so the redirect URIs / web origins / secret / attributes always
# match the realm JSON's desired state. Running on every compose up takes
# < 1 s and removes the "did you wipe the volume?" deployment trap.
#
# Inviolable rule 9: no AI-attribution lines.

set -uo pipefail

KCADM="/opt/keycloak/bin/kcadm.sh"
SERVER="${KEYCLOAK_INTERNAL_URL:-http://keycloak:8080}"
REALM="ehrbase"
ADMIN_USER="${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}"
ADMIN_PASS="${KC_BOOTSTRAP_ADMIN_PASSWORD:-admin}"

CLIENT_ID="grafana"
CLIENT_SECRET="${GRAFANA_OIDC_CLIENT_SECRET:-dev-only-rotate-in-prod}"
REDIRECT_URI="http://localhost:3030/login/generic_oauth"
WEB_ORIGIN="http://localhost:3030"

echo "[grafana-sync] authenticating as ${ADMIN_USER} against ${SERVER}"
$KCADM config credentials \
  --server "$SERVER" \
  --realm master \
  --user "$ADMIN_USER" \
  --password "$ADMIN_PASS"

# Find the client. `get clients` filtered by clientId returns an array; we
# extract the internal UUID with a tiny shell parser (no jq in this image).
CLIENT_UUID=$(
  $KCADM get clients \
    -r "$REALM" \
    -q "clientId=${CLIENT_ID}" \
    --fields id 2>/dev/null \
  | sed -nE 's/.*"id" *: *"([^"]+)".*/\1/p' \
  | head -n1
)

build_client_payload() {
  # Single source of truth for the client's desired state. Mirrors the JSON
  # in keycloak/import/ehrbase.json — keep them in sync.
  cat <<EOF
{
  "clientId": "${CLIENT_ID}",
  "name": "Grafana",
  "description": "Grafana OSS dashboards — confidential OAuth client with PKCE. Synced by keycloak-sync-grafana-client. See docs/architecture.md §13.",
  "enabled": true,
  "alwaysDisplayInConsole": false,
  "clientAuthenticatorType": "client-secret",
  "secret": "${CLIENT_SECRET}",
  "redirectUris": ["${REDIRECT_URI}"],
  "webOrigins": ["${WEB_ORIGIN}"],
  "publicClient": false,
  "protocol": "openid-connect",
  "standardFlowEnabled": true,
  "implicitFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": false,
  "fullScopeAllowed": true,
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": "${WEB_ORIGIN}/login##${WEB_ORIGIN}/*",
    "use.refresh.tokens": "true",
    "client_credentials.use_refresh_token": "false"
  },
  "defaultClientScopes": ["web-origins", "profile", "roles", "email"],
  "optionalClientScopes": ["offline_access", "phone", "address"]
}
EOF
}

PAYLOAD_FILE=$(mktemp)
build_client_payload >"$PAYLOAD_FILE"

if [ -z "$CLIENT_UUID" ]; then
  echo "[grafana-sync] client '${CLIENT_ID}' missing — creating"
  $KCADM create clients -r "$REALM" -f "$PAYLOAD_FILE" >/dev/null
  echo "[grafana-sync] created"
else
  echo "[grafana-sync] client '${CLIENT_ID}' present (uuid=${CLIENT_UUID}) — updating in place"
  $KCADM update "clients/${CLIENT_UUID}" -r "$REALM" -f "$PAYLOAD_FILE" >/dev/null
  echo "[grafana-sync] updated"
fi

rm -f "$PAYLOAD_FILE"

echo "[grafana-sync] done"
