# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM nginxinc/nginx-unprivileged:alpine-slim

USER root
RUN apk --no-cache update && apk --no-cache upgrade

COPY --from=builder /app/dist /usr/share/nginx/html

ENV CONTROLLER_HOST=localhost:11311
ENV INSECURE=false
ENV OIDC_ISSUER=localhost:8080
ENV OIDC_CLIENT_ID=Frontend
ENV USERID=1000
ENV BASE_URL=""
ENV GROUPID=1000
ENV PORT=80

EXPOSE 80

COPY ./ci/entrypoint.sh /docker-entrypoint.d/40-configure-app.sh
RUN chmod +x /docker-entrypoint.d/40-configure-app.sh
COPY ./ci/nginx-default.conf.template /etc/nginx/templates/default.conf.template
COPY ./ci/nginx.conf /etc/nginx/

RUN chown -R nobody:nobody /usr/share/nginx/html && \
    chmod -R 777 /usr/share/nginx/html && \
    chown -R nobody:nobody /var/cache/nginx && \
    chown -R nobody:nobody /var/log/nginx && \
    chown -R nobody:nobody /etc/nginx && \
    chmod -Rf 777 /etc/nginx

USER $USERID:$GROUPID

CMD ["nginx", "-g", "daemon off;"]
