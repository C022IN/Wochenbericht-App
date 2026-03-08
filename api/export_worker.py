import json
from http.server import BaseHTTPRequestHandler

from worker.export_service import handle_export_week_request, health_payload


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send_json(200, health_payload())

    def do_POST(self):
        content_length = int(self.headers.get("content-length") or "0")
        raw_body = self.rfile.read(content_length) if content_length > 0 else b""
        try:
            body = json.loads(raw_body.decode("utf-8")) if raw_body else None
        except Exception:
            body = None

        payload, status = handle_export_week_request(
            body,
            authorization=self.headers.get("Authorization"),
            token_header=self.headers.get("X-Export-Worker-Token"),
        )
        self._send_json(status, payload)
