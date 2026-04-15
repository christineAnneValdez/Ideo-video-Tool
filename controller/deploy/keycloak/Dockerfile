FROM quay.io/keycloak/keycloak:24.0.5

USER root

COPY deploy/keycloak/entrypoint.sh /opt/keycloak/bin/opentalk-entrypoint.sh
RUN chmod 755 /opt/keycloak/bin/opentalk-entrypoint.sh

USER keycloak

ENTRYPOINT ["/opt/keycloak/bin/opentalk-entrypoint.sh"]
