# Controller deployment on Dokploy

This project now uses `Dockerfile` for building the `opentalk-controller` image with public base images.

## 1) Prepare services in Dokploy

Create these services first (same network/project):

- PostgreSQL
- Keycloak (or another compatible OIDC provider)
- LiveKit
- MinIO
- Optional: RabbitMQ, Redis

## 2) Create the controller app in Dokploy

- Source: your Git repository
- Build context: `controller`
- Dockerfile path: `Dockerfile`
- Exposed/container port: `11311`

## 3) Configure environment variables

Use `dokploy.env.example` as your base and set real values in Dokploy UI.

Minimum required variables:

- `OPENTALK_CTRL_FRONTEND__BASE_URL`
- `OPENTALK_CTRL_DATABASE__URL`
- `OPENTALK_CTRL_OIDC__AUTHORITY`
- `OPENTALK_CTRL_OIDC__FRONTEND__CLIENT_ID`
- `OPENTALK_CTRL_OIDC__CONTROLLER__CLIENT_ID`
- `OPENTALK_CTRL_OIDC__CONTROLLER__CLIENT_SECRET`
- `OPENTALK_CTRL_USER_SEARCH__BACKEND`
- `OPENTALK_CTRL_USER_SEARCH__API_BASE_URL`
- `OPENTALK_CTRL_LIVEKIT__PUBLIC_URL`
- `OPENTALK_CTRL_LIVEKIT__SERVICE_URL`
- `OPENTALK_CTRL_LIVEKIT__API_KEY`
- `OPENTALK_CTRL_LIVEKIT__API_SECRET`
- `OPENTALK_CTRL_MINIO__URI`
- `OPENTALK_CTRL_MINIO__BUCKET`
- `OPENTALK_CTRL_MINIO__ACCESS_KEY`
- `OPENTALK_CTRL_MINIO__SECRET_KEY`

Recommended for container hosting:

- `OPENTALK_CTRL_HTTP__ADDR=0.0.0.0`
- `OPENTALK_CTRL_HTTP__PORT=11311`

## 4) Route traffic

Expose the app via your Dokploy domain/reverse proxy to port `11311` of the container.

## 5) First start checks

- Controller logs should show successful DB migration/connect and HTTP bind.
- Optional health endpoint:
  - set `OPENTALK_CTRL_MONITORING__ADDR=0.0.0.0`
  - set `OPENTALK_CTRL_MONITORING__PORT=11411`
  - then check `http://<container-or-domain>:11411/health`
- If startup fails, check service DNS names used in env values (for example `postgres`, `minio`, `livekit`) match Dokploy internal service names.

## Notes

- The image includes `/etc/opentalk/controller.toml` from `example/controller.toml`.
- Your environment variables (`OPENTALK_CTRL_*`) override file values.
