# OpenTalk deployment on Dokploy

This repository includes two deployment paths:

1. Single-stack deployment (recommended for your "one deploy action" goal)
2. Controller-only deployment (use external Keycloak/LiveKit/MinIO)

## Option A: Single-stack deployment (Controller + Frontend + Keycloak + deps)

Use this when you want deployment behavior similar to local startup, where auth is included automatically.

### 1) Create a Compose app in Dokploy

- Compose file path: `controller/docker-compose.dokploy.yml`
- Environment file base: `controller/dokploy.stack.env.example`

### 2) Configure required public values

At minimum set these values in Dokploy:

- `FRONTEND_BASE_URL`
- `FRONTEND_CONTROLLER_HOST`
- `OIDC_ISSUER_PUBLIC_URL`
- `LIVEKIT_PUBLIC_URL`
- `CONTROLLER_OIDC_CLIENT_SECRET`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `KEYCLOAK_ADMIN_PASSWORD`
- `POSTGRES_PASSWORD`
- `KEYCLOAK_DB_PASSWORD`
- `MINIO_ROOT_PASSWORD`

Important:

- `FRONTEND_BASE_URL` is also used to generate Keycloak redirect URIs automatically.
- Keep `OIDC_ISSUER_PUBLIC_URL` browser-reachable (for example `https://auth.your-domain.com/realms/OPENTALK`).
- Keep `FRONTEND_CONTROLLER_HOST` browser-reachable (for example `api.your-domain.com`).

### 3) Expose routes/domains in Dokploy

Expose at least:

- Frontend (`frontend`, container port `80`)
- Controller (`controller`, container port `11311`)
- Keycloak (`keycloak`, container port `8080`)
- LiveKit (`livekit`, container port `7880`)

### 4) First start checks

- Keycloak logs show it imported realm `OPENTALK`.
- Controller logs show DB connect and HTTP bind.
- Frontend opens and redirects to Keycloak login.

Default bootstrap user:

- Username: `admin`
- Password: `admin`

Change this user/password in Keycloak after first login.

## Option B: Controller-only deployment (external services)

If you already host Keycloak/LiveKit/MinIO/Postgres externally, deploy only the controller image with:

- Build context: `controller`
- Dockerfile path: `Dockerfile`
- Port: `11311`
- Environment values from `dokploy.env.example`

## Notes

- The controller image includes `/etc/opentalk/controller.toml` from `example/controller.toml`.
- `OPENTALK_CTRL_*` environment values override file values.
