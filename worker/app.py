import base64
import json
import os
import subprocess
import tempfile
from pathlib import Path

from flask import Flask, jsonify, request


app = Flask(__name__)

REPO_ROOT = Path(__file__).resolve().parents[1]
EXPORT_SCRIPT = REPO_ROOT / "scripts" / "export_wochenbericht.py"
PYTHON_BIN = os.environ.get("PYTHON_BIN", "python")


def _json_error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def _check_auth():
    expected = os.environ.get("EXPORT_WORKER_TOKEN", "").strip()
    if not expected:
        return None

    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
      token = auth[7:]
    else:
      token = request.headers.get("X-Export-Worker-Token", "")
    if token != expected:
      return _json_error("Unauthorized", 401)
    return None


def _run_python_export(payload_path: Path, output_path: Path):
    proc = subprocess.run(
        [PYTHON_BIN, str(EXPORT_SCRIPT), "--payload-file", str(payload_path), "--output", str(output_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"Python export failed ({proc.returncode}): {msg}")

    try:
        return json.loads(proc.stdout or "{}")
    except Exception:
        return {"warnings": [proc.stdout.strip()]} if (proc.stdout or "").strip() else {}


def _try_pdf_convert(xlsx_path: Path):
    if os.environ.get("ENABLE_PDF_EXPORT", "0").strip() not in {"1", "true", "TRUE"}:
        return None, "PDF export disabled on worker."

    configured = os.environ.get("SOFFICE_PATH", "").strip()
    candidates = [c for c in [
        configured,
        "soffice",
        "/usr/bin/soffice",
        "/usr/lib/libreoffice/program/soffice",
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ] if c]

    for candidate in candidates:
        try:
            proc = subprocess.run(
                [candidate, "--headless", "--convert-to", "pdf", "--outdir", str(xlsx_path.parent), str(xlsx_path)],
                capture_output=True,
                text=True,
                check=False,
            )
            if proc.returncode == 0:
                pdf_path = xlsx_path.with_suffix(".pdf")
                if pdf_path.exists():
                    return pdf_path, None
        except Exception:
            continue

    return None, "PDF export requires LibreOffice (soffice) on worker."


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.post("/export-week")
def export_week():
    auth_error = _check_auth()
    if auth_error is not None:
        return auth_error

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return _json_error("Invalid JSON body")

    fmt = str(body.get("format") or "xlsx").lower()
    if fmt not in {"xlsx", "pdf", "both"}:
        return _json_error("Invalid format")

    template_b64 = body.get("templateBase64")
    template_filename = str(body.get("templateFilename") or "template.xlsx")
    segments = body.get("segments")

    if not isinstance(template_b64, str) or not template_b64.strip():
        return _json_error("templateBase64 is required")
    if not isinstance(segments, list) or not segments:
        return _json_error("segments is required")

    try:
        template_bytes = base64.b64decode(template_b64, validate=True)
    except Exception:
        return _json_error("templateBase64 is invalid")

    reports = []

    try:
        with tempfile.TemporaryDirectory(prefix="wb_worker_") as tmp_dir:
            tmp = Path(tmp_dir)
            template_path = tmp / Path(template_filename).name
            template_path.write_bytes(template_bytes)

            for idx, segment in enumerate(segments):
                if not isinstance(segment, dict):
                    return _json_error(f"Invalid segment at index {idx}")

                base_name = str(segment.get("baseName") or f"segment_{idx}")
                payload = segment.get("payload")
                if not isinstance(payload, dict):
                    return _json_error(f"Missing payload for segment '{base_name}'")

                payload_wrapper = {
                    "templatePath": str(template_path),
                    "payload": payload,
                }

                payload_path = tmp / f"{base_name}.json"
                xlsx_path = tmp / f"{base_name}.xlsx"
                payload_path.write_text(json.dumps(payload_wrapper), encoding="utf-8")

                py_result = _run_python_export(payload_path, xlsx_path)
                warnings = list(py_result.get("warnings") or [])

                pdf_b64 = None
                if fmt in {"pdf", "both"}:
                    pdf_path, pdf_warning = _try_pdf_convert(xlsx_path)
                    if pdf_path and pdf_path.exists():
                        pdf_b64 = base64.b64encode(pdf_path.read_bytes()).decode("ascii")
                    elif pdf_warning:
                        warnings.append(pdf_warning)

                reports.append({
                    "baseName": base_name,
                    "segmentKey": segment.get("segmentKey", ""),
                    "month": segment.get("month"),
                    "dates": segment.get("dates", []),
                    "reportYear": segment.get("reportYear"),
                    "reportKw": segment.get("reportKw"),
                    "isCarryOverToNextYear": bool(segment.get("isCarryOverToNextYear")),
                    "warnings": warnings,
                    "rowsWritten": py_result.get("rows_written"),
                    "rowsTruncated": py_result.get("rows_truncated"),
                    "xlsxBase64": base64.b64encode(xlsx_path.read_bytes()).decode("ascii"),
                    "pdfBase64": pdf_b64,
                })

        return jsonify({"reports": reports})
    except Exception as exc:
        return _json_error(str(exc), 500)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
