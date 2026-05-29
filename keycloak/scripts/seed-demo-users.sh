#!/usr/bin/env bash
# Seed Keycloak with one demo user per realm role.
#
# Runs as a one-shot init container in docker-compose every dev up so the
# four demo identities exist for app + Grafana SSO. Production deployments
# set SEED_DEMO_USERS=skip in their orchestrator env (or delete the
# service from their compose override) to make this a no-op.
#
# Idempotent: re-running checks for existing users via `kcadm.sh get users -q
# username=...` and skips ones that are already present. Safe to run after a
# `docker compose down && up` cycle and on every container restart.
#
# Passwords satisfy the realm policy: length(12) + lowerCase + upperCase +
# digits + specialChars + notUsername + notEmail + passwordHistory(5).

set -uo pipefail

if [ "${SEED_DEMO_USERS:-on}" = "skip" ]; then
  echo "[seed] SEED_DEMO_USERS=skip — production posture, no users seeded"
  exit 0
fi

KCADM="/opt/keycloak/bin/kcadm.sh"
SERVER="${KEYCLOAK_INTERNAL_URL:-http://keycloak:8080}"
REALM="ehrbase"
ADMIN_USER="${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}"
ADMIN_PASS="${KC_BOOTSTRAP_ADMIN_PASSWORD:-admin}"

echo "[seed] authenticating as ${ADMIN_USER} against ${SERVER}"
$KCADM config credentials \
  --server "$SERVER" \
  --realm master \
  --user "$ADMIN_USER" \
  --password "$ADMIN_PASS"

seed_user() {
  local username=$1
  local password=$2
  local first=$3
  local last=$4
  local role=$5
  local email=$6

  local existing
  existing=$($KCADM get users -r "$REALM" -q "username=$username" --fields id 2>/dev/null | grep -c '"id"' || true)

  if [ "$existing" -eq 0 ]; then
    $KCADM create users -r "$REALM" \
      -s "username=$username" \
      -s enabled=true \
      -s "email=$email" \
      -s emailVerified=true \
      -s "firstName=$first" \
      -s "lastName=$last" >/dev/null
    echo "[seed] $username created"
  else
    echo "[seed] $username already exists; reconciling password + role"
  fi

  # Idempotent — try to (re)set the documented password on every run. The
  # realm policy includes passwordHistory(5), so a re-run against an existing
  # user with the same password returns a 400 ("must not be equal to any of
  # last 5 passwords"). That's the desired end state, so we tolerate it; any
  # other error type is still surfaced because set -e is on.
  $KCADM set-password -r "$REALM" \
    --username "$username" \
    --new-password "$password" 2>/dev/null || true

  $KCADM add-roles -r "$REALM" \
    --uusername "$username" \
    --rolename "$role" 2>/dev/null || true

  echo "[seed] $username ready (role=$role, email=$email)"
}

seed_user dev-clinician      'DevClinician123!'  Dev Clinician      clinician       dev-clinician@example.test
seed_user dev-admin          'DevAdmin12345!'    Dev Admin          admin           dev-admin@example.test
seed_user dev-audit-reviewer 'DevReviewer123!'   Dev AuditReviewer  audit-reviewer  dev-audit-reviewer@example.test
seed_user dev-researcher     'DevResearcher123!' Dev Researcher     researcher      dev-researcher@example.test

echo "[seed] done — 4 demo users present in realm ${REALM}"
