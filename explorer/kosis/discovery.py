import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any
from explorer.kosis.client import KosisClient, sanitize_params


@dataclass(frozen=True)
class DiscoveryIntent:
    indicator_key: str
    metric_keys: tuple[str, ...]
    geography_level: str
    start_year: int
    end_year: int
    search_terms: tuple[str, ...]


@dataclass(frozen=True)
class DimensionProposal:
    source_dimension: str
    semantic_dimension: str
    selection_strategy: str
    default_value: str | None = None
    evidence: str = ""


@dataclass(frozen=True)
class ItemProposal:
    source_item_id: str
    source_item_name: str
    indicator_key: str
    metric_key: str
    tax_owner_key: str | None = None
    human_confirmed: bool = False


@dataclass(frozen=True)
class CoverageSummary:
    mapped_count: int
    missing_count: int
    start_year: int
    end_year: int
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class DiscoveryCandidate:
    source_provider: str
    source_org_id: str
    source_table_id: str
    source_table_name: str
    geography_level: str
    frequency: str
    registry_status: str
    family_key: str
    metadata_checksum: str
    structure_fingerprint: str
    metadata_snapshot: dict[str, Any]
    dimension_proposals: tuple[DimensionProposal, ...]
    item_proposals: tuple[ItemProposal, ...]
    coverage: CoverageSummary


@dataclass(frozen=True)
class DatasetFamilyProposal:
    family_key: str
    name: str
    description: str


@dataclass(frozen=True)
class DiscoveryManifest:
    intent: DiscoveryIntent
    dataset_families: tuple[DatasetFamilyProposal, ...]
    candidates: tuple[DiscoveryCandidate, ...]


def _canonicalize(data: Any) -> Any:
    if isinstance(data, dict):
        clean = {}
        for k, v in sorted(data.items()):
            if k.lower() in ("apikey", "timestamp", "collected_at", "transport_time"):
                continue
            clean[k] = _canonicalize(v)
        return clean
    elif isinstance(data, (list, tuple)):
        canonicalized = [_canonicalize(x) for x in data]
        try:
            return sorted(canonicalized, key=lambda x: json.dumps(x, sort_keys=True, ensure_ascii=False))
        except Exception:
            return canonicalized
    return data


def metadata_checksum(snapshot: Any) -> str:
    canonical = _canonicalize(snapshot)
    serialized = json.dumps(canonical, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _extract_family_key(table_name: str) -> tuple[str, str]:
    # Strip (시세), (구세), or parenthetical suffixes to find family base
    base_name = re.sub(r"\(.*?\)", "", table_name).strip()
    if not base_name:
        base_name = table_name.strip()
    clean_key = re.sub(r"[^a-zA-Z0-9가-힣]+", "_", base_name).strip("_").upper()
    return clean_key, base_name


def discover(intent: DiscoveryIntent, client: KosisClient | Any) -> DiscoveryManifest:
    # Query client for table search / metadata
    params = {
        "method": "getList",
        "searchWord": " ".join(intent.search_terms),
    }
    response = client.fetch(params)

    # Group response rows by table_id
    tables: dict[str, list[Any]] = {}
    for r in response.rows:
        tables.setdefault(r.tbl_id, []).append(r)

    candidates: list[DiscoveryCandidate] = []
    families_map: dict[str, DatasetFamilyProposal] = {}

    for tbl_id, rows in tables.items():
        sample_row = rows[0]
        table_name = sample_row.tbl_nm or f"Table {tbl_id}"
        org_id = sample_row.org_id or "KOSIS"
        family_key, family_name = _extract_family_key(table_name)

        if family_key not in families_map:
            families_map[family_key] = DatasetFamilyProposal(
                family_key=family_key,
                name=family_name,
                description=f"Family for {family_name}",
            )

        # Snapshot for table
        table_snapshot = {
            "org_id": org_id,
            "tbl_id": tbl_id,
            "tbl_nm": table_name,
            "rows": [r.raw_payload for r in rows],
        }
        checksum = metadata_checksum(table_snapshot)

        # Propose dimensions based on C1-C8 presence
        dim_proposals: list[DimensionProposal] = []
        if sample_row.c1_nm or sample_row.c1:
            dim_proposals.append(
                DimensionProposal(
                    source_dimension="C1",
                    semantic_dimension="REGION",
                    selection_strategy="ALL_MAPPED",
                    evidence=f"C1_OBJ_NM={sample_row.c1_obj_nm}, C1_NM={sample_row.c1_nm}",
                )
            )

        # Propose items based on ITM_NM
        item_proposals: list[ItemProposal] = []
        tax_owner = None
        if "시세" in table_name:
            tax_owner = "METROPOLITAN_CITY"
        elif "구세" in table_name:
            tax_owner = "AUTONOMOUS_DISTRICT"

        for r in rows:
            item_proposals.append(
                ItemProposal(
                    source_item_id=r.itm_id,
                    source_item_name=r.itm_nm,
                    indicator_key=intent.indicator_key,
                    metric_key=intent.metric_keys[0] if intent.metric_keys else "AMOUNT",
                    tax_owner_key=tax_owner,
                    human_confirmed=False,
                )
            )

        fingerprint = f"{sample_row.prd_se}:dims={len(dim_proposals)}:items={len(item_proposals)}"

        candidates.append(
            DiscoveryCandidate(
                source_provider="KOSIS",
                source_org_id=org_id,
                source_table_id=tbl_id,
                source_table_name=table_name,
                geography_level=intent.geography_level,
                frequency="YEAR" if sample_row.prd_se == "Y" else "MONTH",
                registry_status="DRAFT",
                family_key=family_key,
                metadata_checksum=checksum,
                structure_fingerprint=fingerprint,
                metadata_snapshot=table_snapshot,
                dimension_proposals=tuple(dim_proposals),
                item_proposals=tuple(item_proposals),
                coverage=CoverageSummary(
                    mapped_count=len(rows),
                    missing_count=0,
                    start_year=intent.start_year,
                    end_year=intent.end_year,
                ),
            )
        )

    return DiscoveryManifest(
        intent=intent,
        dataset_families=tuple(families_map.values()),
        candidates=tuple(candidates),
    )
