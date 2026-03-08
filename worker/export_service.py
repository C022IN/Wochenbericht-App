import base64
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Mapping

from scripts.export_wochenbericht import export_payload_wrapper


def _get_token_from_headers(authorization: str | None, token_header: str | None):
    auth = (authorization or "").strip()
    if auth.startswith("Bearer "):
        return auth[7:]
    return (token_header or "").strip()


def authorize_request(authorization: str | None = None, token_header: str | None = None):
    expected = os.environ.get("EXPORT_WORKER_TOKEN", "").strip()
    if not expected:
        return None

    if _get_token_from_headers(authorization, token_header) != expected:
        return {"error": "Unauthorized"}, 401
    return None


def health_payload():
    return {"ok": True}


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


def _validate_export_request(body: object):
    if not isinstance(body, dict):
        return None, {"error": "Invalid JSON body"}, 400

    fmt = str(body.get("format") or "xlsx").lower()
    if fmt not in {"xlsx", "pdf", "both"}:
        return None, {"error": "Invalid format"}, 400

    template_b64 = body.get("templateBase64")
    template_filename = str(body.get("templateFilename") or "template.xlsx")
    segments = body.get("segments")

    if not isinstance(template_b64, str) or not template_b64.strip():
        return None, {"error": "templateBase64 is required"}, 400
    if not isinstance(segments, list) or not segments:
        return None, {"error": "segments is required"}, 400

    try:
        template_bytes = base64.b64decode(template_b64, validate=True)
    except Exception:
        return None, {"error": "templateBase64 is invalid"}, 400

    return {
        "format": fmt,
        "template_bytes": template_bytes,
        "template_filename": Path(template_filename).name or "template.xlsx",
        "segments": segments,
    }, None, None


def handle_export_week_request(
    body: object,
    authorization: str | None = None,
    token_header: str | None = None,
):
    auth_error = authorize_request(authorization=authorization, token_header=token_header)
    if auth_error is not None:
        return auth_error

    request_data, error_body, error_status = _validate_export_request(body)
    if error_body is not None and error_status is not None:
        return error_body, error_status

    fmt = request_data["format"]
    template_bytes = request_data["template_bytes"]
    template_filename = request_data["template_filename"]
    segments = request_data["segments"]

    reports = []

    try:
        with tempfile.TemporaryDirectory(prefix="wb_worker_") as tmp_dir:
            tmp = Path(tmp_dir)
            template_path = tmp / template_filename
            template_path.write_bytes(template_bytes)

            for idx, segment in enumerate(segments):
                if not isinstance(segment, dict):
                    return {"error": f"Invalid segment at index {idx}"}, 400

                base_name = str(segment.get("baseName") or f"segment_{idx}")
                payload = segment.get("payload")
                if not isinstance(payload, dict):
                    return {"error": f"Missing payload for segment '{base_name}'"}, 400

                file_base_name = Path(base_name).name or f"segment_{idx}"
                xlsx_path = tmp / f"{file_base_name}.xlsx"
                py_result = export_payload_wrapper(
                    {
                        "templatePath": str(template_path),
                        "payload": payload,
                    },
                    xlsx_path,
                )
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

        return {"reports": reports}, 200
    except Exception as exc:
        return {"error": str(exc)}, 500
