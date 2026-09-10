from pathlib import Path
from typing import Any
from explorer.kosis.client import sanitize_params
from explorer.kosis.parser import compute_row_hash, parse_kosis_response
from explorer.kosis.types import KosisApiError, KosisResponse, ParsedKosisRow

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class FakeKosisClient:
    def __init__(self):
        self.queue: list[KosisResponse | Exception] = []
        self.calls: list[dict[str, str]] = []

    def enqueue_response(self, response: KosisResponse | Exception) -> None:
        self.queue.append(response)

    @classmethod
    def from_fixture(cls, fixture_name: str) -> "FakeKosisClient":
        client = cls()
        fixture_path = FIXTURES_DIR / fixture_name
        body = fixture_path.read_bytes()
        content_type = "application/xml" if fixture_name.endswith(".xml") else "application/json"
        response = parse_kosis_response(content_type, body)
        client.enqueue_response(response)
        return client

    @classmethod
    def success(cls, raw_rows: list[dict[str, Any]]) -> "FakeKosisClient":
        client = cls()
        parsed_rows: list[ParsedKosisRow] = []
        for item in raw_rows:
            parsed_rows.append(
                ParsedKosisRow(
                    org_id=str(item.get("ORG_ID") or ""),
                    tbl_id=str(item.get("TBL_ID") or ""),
                    tbl_nm=str(item.get("TBL_NM") or ""),
                    c1=str(item.get("C1") or ""),
                    c1_nm=str(item.get("C1_NM") or ""),
                    c1_obj_nm=str(item.get("C1_OBJ_NM") or ""),
                    c2=str(item.get("C2") or ""),
                    c2_nm=str(item.get("C2_NM") or ""),
                    c2_obj_nm=str(item.get("C2_OBJ_NM") or ""),
                    c3=str(item.get("C3") or ""),
                    c3_nm=str(item.get("C3_NM") or ""),
                    c3_obj_nm=str(item.get("C3_OBJ_NM") or ""),
                    c4=str(item.get("C4") or ""),
                    c4_nm=str(item.get("C4_NM") or ""),
                    c4_obj_nm=str(item.get("C4_OBJ_NM") or ""),
                    c5=str(item.get("C5") or ""),
                    c5_nm=str(item.get("C5_NM") or ""),
                    c5_obj_nm=str(item.get("C5_OBJ_NM") or ""),
                    c6=str(item.get("C6") or ""),
                    c6_nm=str(item.get("C6_NM") or ""),
                    c6_obj_nm=str(item.get("C6_OBJ_NM") or ""),
                    c7=str(item.get("C7") or ""),
                    c7_nm=str(item.get("C7_NM") or ""),
                    c7_obj_nm=str(item.get("C7_OBJ_NM") or ""),
                    c8=str(item.get("C8") or ""),
                    c8_nm=str(item.get("C8_NM") or ""),
                    c8_obj_nm=str(item.get("C8_OBJ_NM") or ""),
                    itm_id=str(item.get("ITM_ID") or ""),
                    itm_nm=str(item.get("ITM_NM") or ""),
                    unit_id=str(item.get("UNIT_ID") or ""),
                    unit_nm=str(item.get("UNIT_NM") or ""),
                    prd_se=str(item.get("PRD_SE") or ""),
                    prd_de=str(item.get("PRD_DE") or ""),
                    dt=str(item.get("DT") or ""),
                    symbol=str(item.get("SYMBOL") or ""),
                    source_updated_at=str(item.get("LST_CHN_DE") or ""),
                    raw_payload=item,
                    source_row_hash=compute_row_hash(item),
                )
            )
        client.enqueue_response(KosisResponse(rows=tuple(parsed_rows), raw_body=b"[]"))
        return client

    def fetch(self, params: dict[str, Any]) -> KosisResponse:
        self.calls.append(sanitize_params(params))
        if not self.queue:
            raise KosisApiError(code="EMPTY_QUEUE", message="No queued response in FakeKosisClient")
        item = self.queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item
