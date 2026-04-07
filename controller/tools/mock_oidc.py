#!/usr/bin/env python3
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


HOST = "127.0.0.1"
PORT = 18080
ISSUER = f"http://{HOST}:{PORT}/oidc"


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/oidc/.well-known/openid-configuration":
            self._send_json(
                {
                    "issuer": ISSUER,
                    "authorization_endpoint": f"{ISSUER}/auth",
                    "token_endpoint": f"{ISSUER}/token",
                    "jwks_uri": f"{ISSUER}/jwks",
                    "userinfo_endpoint": f"{ISSUER}/userinfo",
                    "introspection_endpoint": f"{ISSUER}/introspect",
                    "response_types_supported": ["code"],
                    "subject_types_supported": ["public"],
                    "id_token_signing_alg_values_supported": ["RS256"],
                    "token_endpoint_auth_methods_supported": ["client_secret_post"],
                }
            )
            return

        if self.path == "/oidc/jwks":
            self._send_json({"keys": []})
            return

        if self.path == "/oidc/userinfo":
            self._send_json({})
            return

        self._send_json({"error": "not found"}, status=404)

    def do_POST(self):
        if self.path == "/oidc/introspect":
            self._send_json({"active": False})
            return

        if self.path == "/oidc/token":
            self._send_json({"error": "unsupported"}, status=400)
            return

        self._send_json({"error": "not found"}, status=404)

    def log_message(self, _fmt, *_args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
