from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class KosisApiError(Exception):
    code: str
    message: str
    retryable: bool = False

    def __str__(self):
        return f"[{self.code}] {self.message}"


@dataclass(frozen=True)
class ParsedKosisRow:
    org_id: str
    tbl_id: str
    tbl_nm: str
    c1: str
    c1_nm: str
    c1_obj_nm: str
    c2: str
    c2_nm: str
    c2_obj_nm: str
    c3: str
    c3_nm: str
    c3_obj_nm: str
    c4: str
    c4_nm: str
    c4_obj_nm: str
    c5: str
    c5_nm: str
    c5_obj_nm: str
    c6: str
    c6_nm: str
    c6_obj_nm: str
    c7: str
    c7_nm: str
    c7_obj_nm: str
    c8: str
    c8_nm: str
    c8_obj_nm: str
    itm_id: str
    itm_nm: str
    unit_id: str
    unit_nm: str
    prd_se: str
    prd_de: str
    dt: str
    symbol: str
    source_updated_at: str
    raw_payload: dict[str, Any]
    source_row_hash: str


@dataclass(frozen=True)
class KosisResponse:
    rows: tuple[ParsedKosisRow, ...]
    raw_body: bytes
