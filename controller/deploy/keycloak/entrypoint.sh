#!/bin/bash
set -euo pipefail

KEYCLOAK_REALM="${KEYCLOAK_REALM:-OPENTALK}"
KEYCLOAK_FRONTEND_ORIGIN="${KEYCLOAK_FRONTEND_ORIGIN:-http://localhost:3000}"
KEYCLOAK_CONTROLLER_CLIENT_SECRET="${KEYCLOAK_CONTROLLER_CLIENT_SECRET:-local-dev-secret}"
REALM_FILE="/opt/keycloak/data/import/opentalk-realm.json"

cat >"${REALM_FILE}" <<EOF
{
  "realm": "${KEYCLOAK_REALM}",
  "enabled": true,
  "displayName": "OpenTalk",
  "sslRequired": "none",
  "registrationAllowed": false,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": true,
  "clients": [
    {
      "clientId": "Frontend",
      "name": "Frontend",
      "enabled": true,
      "publicClient": true,
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": true,
      "redirectUris": [
        "${KEYCLOAK_FRONTEND_ORIGIN}/*"
      ],
      "webOrigins": [
        "${KEYCLOAK_FRONTEND_ORIGIN}"
      ],
      "protocol": "openid-connect"
    },
    {
      "clientId": "Controller",
      "name": "Controller",
      "enabled": true,
      "publicClient": false,
      "secret": "${KEYCLOAK_CONTROLLER_CLIENT_SECRET}",
      "serviceAccountsEnabled": true,
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": true,
      "protocol": "openid-connect"
    }
  ],
  "users": [
    {
      "username": "admin",
      "enabled": true,
      "emailVerified": true,
      "firstName": "Admin",
      "lastName": "Local",
      "email": "admin@example.local",
      "credentials": [
        {
          "type": "password",
          "value": "admin",
          "temporary": false
        }
      ]
    }
  ]
}
EOF

exec /opt/keycloak/bin/kc.sh start-dev --http-port=8080 --import-realm
