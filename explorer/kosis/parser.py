import hashlib
import json
import xml.etree.ElementTree as ET
from typing import Any
from explorer.kosis.types import KosisApiError, KosisResponse, ParsedKosisRow


def compute_row_hash(raw_payload: dict[str, Any]) -> str:
    serialized = json.dumps(raw_payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def parse_kosis_response(content_type: str, body: bytes) -> KosisResponse:
    stripped = body.strip()
    if not stripped:
        return KosisResponse(rows=(), raw_body=body)

    # Check for XML error response regardless of Content-Type header
    if stripped.startswith(b"<") or "xml" in content_type.lower():
        try:
            root = ET.fromstring(stripped)
            err_elem = root.find("err")
            msg_elem = root.find("errMsg")
            if err_elem is not None and err_elem.text:
                err_code = err_elem.text.strip()
                err_msg = msg_elem.text.strip() if (msg_elem is not None and msg_elem.text) else ""
                retryable = err_code in ("40", "41", "42", "50", "99")
                raise KosisApiError(code=err_code, message=err_msg, retryable=retryable)
        except ET.ParseError:
            pass

    # Attempt JSON decoding
    try:
        decoded_text = stripped.decode("utf-8")
    except UnicodeDecodeError:
        decoded_text = stripped.decode("cp949", errors="replace")

    try:
        payload = json.loads(decoded_text)
    except json.JSONDecodeError as exc:
        raise KosisApiError(code="PARSE_ERROR", message="Invalid JSON response from source") from exc

    # Check for JSON error object: {"err": "...", "errMsg": "..."}
    if isinstance(payload, dict):
        if "err" in payload:
            err_code = str(payload.get("err", "")).strip()
            err_msg = str(payload.get("errMsg", "")).strip()
            retryable = err_code in ("40", "41", "42", "50", "99")
            raise KosisApiError(code=err_code, message=err_msg, retryable=retryable)
        raise KosisApiError(code="UNEXPECTED_STRUCTURE", message="Expected list of rows in response")

    if not isinstance(payload, list):
        raise KosisApiError(code="UNEXPECTED_STRUCTURE", message="Expected list of rows in response")

    rows: list[ParsedKosisRow] = []
    for item in payload:
        if not isinstance(item, dict):
            continue

        # Preserve exact string representation of DT and other fields
        dt_val = item.get("DT")
        if dt_val is None:
            dt_str = ""
        else:
            dt_str = str(dt_val)

        row = ParsedKosisRow(
            org_id=str(item.get("ORG_ID") or item.get("org_id") or ""),
            tbl_id=str(item.get("TBL_ID") or item.get("tbl_id") or ""),
            tbl_nm=str(item.get("TBL_NM") or item.get("tbl_nm") or ""),
            c1=str(item.get("C1") or item.get("c1") or ""),
            c1_nm=str(item.get("C1_NM") or item.get("c1_nm") or ""),
            c1_obj_nm=str(item.get("C1_OBJ_NM") or item.get("c1_obj_nm") or ""),
            c2=str(item.get("C2") or item.get("c2") or ""),
            c2_nm=str(item.get("C2_NM") or item.get("c2_nm") or ""),
            c2_obj_nm=str(item.get("C2_OBJ_NM") or item.get("c2_obj_nm") or ""),
            c3=str(item.get("C3") or item.get("c3") or ""),
            c3_nm=str(item.get("C3_NM") or item.get("c3_nm") or ""),
            c3_obj_nm=str(item.get("C3_OBJ_NM") or item.get("c3_obj_nm") or ""),
            c4=str(item.get("C4") or item.get("c4") or ""),
            c4_nm=str(item.get("C4_NM") or item.get("c4_nm") or ""),
            c4_obj_nm=str(item.get("C4_OBJ_NM") or item.get("c4_obj_nm") or ""),
            c5=str(item.get("C5") or item.get("c5") or ""),
            c5_nm=str(item.get("C5_NM") or item.get("c5_nm") or ""),
            c5_obj_nm=str(item.get("C5_OBJ_NM") or item.get("c5_obj_nm") or ""),
            c6=str(item.get("C6") or item.get("c6") or ""),
            c6_nm=str(item.get("C6_NM") or item.get("c6_nm") or ""),
            c6_obj_nm=str(item.get("C6_OBJ_NM") or item.get("c6_obj_nm") or ""),
            c7=str(item.get("C7") or item.get("c7") or ""),
            c7_nm=str(item.get("C7_NM") or item.get("c7_nm") or ""),
            c7_obj_nm=str(item.get("C7_OBJ_NM") or item.get("c7_obj_nm") or ""),
            c8=str(item.get("C8") or item.get("c8") or ""),
            c8_nm=str(item.get("C8_NM") or item.get("c8_nm") or ""),
            c8_obj_nm=str(item.get("C8_OBJ_NM") or item.get("c8_obj_nm") or ""),
            itm_id=str(item.get("ITM_ID") or item.get("itm_id") or ""),
            itm_nm=str(item.get("ITM_NM") or item.get("itm_nm") or ""),
            unit_id=str(item.get("UNIT_ID") or item.get("unit_id") or ""),
            unit_nm=str(item.get("UNIT_NM") or item.get("unit_nm") or ""),
            prd_se=str(item.get("PRD_SE") or item.get("prd_se") or ""),
            prd_de=str(item.get("PRD_DE") or item.get("prd_de") or ""),
            dt=dt_str,
            symbol=str(item.get("SYMBOL") or item.get("symbol") or ""),
            source_updated_at=str(item.get("LST_CHN_DE") or item.get("source_updated_at") or ""),
            raw_payload=item,
            source_row_hash=compute_row_hash(item),
        )
        rows.append(row)

    return KosisResponse(rows=tuple(rows), raw_body=body)
