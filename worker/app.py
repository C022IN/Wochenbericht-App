from flask import Flask, jsonify, request
from worker.export_service import handle_export_week_request, health_payload


app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify(health_payload())


@app.post("/export-week")
def export_week():
    payload, status = handle_export_week_request(
        request.get_json(silent=True),
        authorization=request.headers.get("Authorization"),
        token_header=request.headers.get("X-Export-Worker-Token"),
    )
    return jsonify(payload), status


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
