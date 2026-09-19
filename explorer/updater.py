import hashlib
import json
import logging
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from psycopg.types.range import Range

from explorer.kosis.client import KosisClient
from explorer.kosis.types import KosisApiError
from explorer.models import (
    BoundarySet,
    Dataset,
    DatasetVersion,
    IngestionJob,
    IngestionSlice,
    Observation,
    Period,
    RawObservation,
    Region,
)
from explorer.pipeline.normalizer import normalize_job
from explorer.pipeline.publisher import publish_job

logger = logging.getLogger(__name__)

CACHE_DIR = Path("var/cache")
CACHE_FILE = CACHE_DIR / "kosis_update_status.json"

CATEGORIES = {
    "POPULATION": {
        "key": "POPULATION",
        "name": "주민등록 인구 및 소멸 지표",
        "provider": "행정안전부 / 통계청",
        "description": "전국 시·군·구 주민등록 총인구 및 인구 통계",
        "tbl_id": "DT_1B040A3",
        "org_id": "101",
        "ping_params": {
            "orgId": "101",
            "tblId": "DT_1B040A3",
            "itmId": "T20",
            "objL1": "00",
            "prdSe": "Y",
        },
        "indicators": [
            "POPULATION",
            "ELDERLY_POPULATION_RATIO",
            "TOTAL_FERTILITY_RATE",
            "NET_MIGRATION",
            "NET_MIGRATION_RATE",
        ],
    },
    "TAX": {
        "key": "TAX",
        "name": "지방세 세입액 (취득·재산·소득세)",
        "provider": "행정안전부 지방세정",
        "description": "17개 시도별 지자체 결산 세입액 (가장 늦게 공표)",
        "tbl_id": "TX_11007_A058",
        "org_id": "110",
        "ping_params": {
            "orgId": "110",
            "tblId": "TX_11007_A058",
            "itmId": "16110ABC9",
            "objL1": "15110AR000",
            "objL2": "15110AD600",
            "prdSe": "Y",
        },
        "indicators": [
            "ACQUISITION_TAX",
            "PROPERTY_TAX",
            "LOCAL_INCOME_TAX",
            "LOCAL_TAX_TOTAL",
            "ACQUISITION_TAX_PER_CAPITA",
            "PROPERTY_TAX_PER_CAPITA",
            "LOCAL_INCOME_TAX_PER_CAPITA",
            "LOCAL_TAX_TOTAL_PER_CAPITA",
        ],
    },
    "FISCAL": {
        "key": "FISCAL",
        "name": "지자체 재정자립도",
        "provider": "행정안전부 지방재정365",
        "description": "전국 자치단체 재정자립도(%)",
        "tbl_id": "DT_1YL20921",
        "org_id": "101",
        "ping_params": {
            "orgId": "101",
            "tblId": "DT_1YL20921",
            "itmId": "T20",
            "objL1": "00",
            "prdSe": "Y",
        },
        "indicators": ["FISCAL_INDEPENDENCE"],
    },
    "ECONOMY": {
        "key": "ECONOMY",
        "name": "가동 사업체 및 경제",
        "provider": "통계청 전국사업체조사",
        "description": "전국 시·군·구 가동 사업체 수",
        "tbl_id": "DT_133N_A9811",
        "org_id": "133",
        "ping_params": {
            "orgId": "133",
            "tblId": "DT_133N_A9811",
            "itmId": "T01",
            "objL1": "15133JYB00",
            "objL2": "16133T2008_0245",
            "prdSe": "Y",
        },
        "indicators": ["BUSINESS_ESTABLISHMENTS", "BUSINESSES_PER_THOUSAND"],
    },
}


def get_local_category_max_year(indicators: list[str]) -> int:
    """Find the max year for a set of indicators in the local DB."""
    max_date = Observation.objects.filter(
        status="PUBLISHED",
        indicator__indicator_key__in=indicators,
    ).aggregate(m=Max("period__period_end"))["m"]
    return max_date.year if max_date else 2024


def ping_kosis_for_year(category_config: dict[str, Any], test_year: int, client: KosisClient) -> bool:
    """Ping KOSIS API to check if a specific year's data is published."""
    params = dict(category_config["ping_params"])
    params["startPrdDe"] = str(test_year)
    params["endPrdDe"] = str(test_year)
    try:
        res = client.fetch(params)
        return len(res.rows) > 0
    except KosisApiError:
        return False
    except Exception as exc:
        logger.warning("Ping failed for %s (%s): %s", category_config["key"], test_year, exc)
        return False


def get_kosis_latest_year(category_config: dict[str, Any], start_year: int, client: KosisClient) -> int:
    """Search KOSIS API for the latest published year starting from start_year up to +5 years."""
    params = dict(category_config["ping_params"])
    max_test_year = max(start_year + 5, 2030)
    params["startPrdDe"] = str(start_year)
    params["endPrdDe"] = str(max_test_year)
    try:
        res = client.fetch(params)
        years = [int(r.prd_de) for r in res.rows if r.prd_de and r.prd_de.isdigit()]
        if years:
            return max(years)
    except Exception as exc:
        logger.debug("Range check failed for %s: %s, falling back to sequential check", category_config["key"], exc)

    # Fallback to year-by-year check
    latest = start_year - 1
    for yr in range(start_year, start_year + 4):
        if ping_kosis_for_year(category_config, yr, client):
            latest = yr
        else:
            break
    return latest if latest >= start_year else start_year - 1


def check_updates(force: bool = False) -> dict[str, Any]:
    """Check KOSIS for new data across all 4 categories, caching results for 12 hours."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    if not force and CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                cached = json.load(f)
            cached_time = datetime.fromisoformat(cached.get("checked_at", "2000-01-01"))
            if datetime.now() - cached_time < timedelta(hours=12):
                return cached
        except Exception:
            pass

    client = KosisClient()
    results = []
    overall_update_available = False

    # Supported categories for one-click synchronization
    SUPPORTED_SYNC_CATEGORIES = {"POPULATION", "FISCAL", "ECONOMY"}

    for cat_key, config in CATEGORIES.items():
        local_year = get_local_category_max_year(config["indicators"])
        kosis_latest = get_kosis_latest_year(config, local_year + 1, client)

        is_available = kosis_latest > local_year
        available_year = kosis_latest if is_available else local_year

        if is_available:
            overall_update_available = True
            status = "UPDATE_AVAILABLE"
            status_text = f"🎉 KOSIS {available_year}년 데이터 등록됨 (최신화 가능)"
        else:
            status = "UP_TO_DATE"
            next_year = local_year + 1
            status_text = f"✅ 최신 반영 완료 ({local_year}년, {next_year}년 통계청 미공표)"

        can_sync = (cat_key in SUPPORTED_SYNC_CATEGORIES) and is_available

        results.append({
            "key": cat_key,
            "name": config["name"],
            "provider": config["provider"],
            "description": config["description"],
            "local_year": local_year,
            "available_year": available_year,
            "has_update": is_available,
            "status": status,
            "status_text": status_text,
            "can_sync": can_sync,
        })

    payload = {
        "checked_at": datetime.now().isoformat(),
        "checked_at_human": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "overall_update_available": overall_update_available,
        "categories": results,
    }

    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as exc:
        logger.warning("Failed to save update cache: %s", exc)

    return payload


def sync_population_year(target_year: int) -> dict[str, Any]:
    """Ingest resident population for the specified year directly from KOSIS API."""
    client = KosisClient()
    logger.info("Fetching resident population for %s from KOSIS...", target_year)

    res = client.fetch({
        "orgId": "101",
        "tblId": "DT_1B040A3",
        "itmId": "T20",
        "objL1": "ALL",
        "prdSe": "Y",
        "startPrdDe": str(target_year),
        "endPrdDe": str(target_year),
    })

    sigungu_rows = [
        row for row in res.rows
        if len(row.c1) == 5 and row.itm_id == "T20"
    ]
    if not sigungu_rows:
        return {"success": False, "message": f"KOSIS에서 {target_year}년 시군구 인구 데이터를 찾을 수 없습니다."}

    with transaction.atomic():
        ds = Dataset.objects.filter(source_table_id="DT_1B040A3").first()
        if not ds:
            return {"success": False, "message": "Dataset DT_1B040A3 does not exist in DB."}
        version = ds.versions.filter(status="ACTIVE").first() or ds.versions.first()

        bset = BoundarySet.objects.filter(reference_year=target_year, status="ACTIVE").first()
        if not bset:
            bset = BoundarySet.objects.filter(status="ACTIVE").order_by("-reference_year").first()

        period_key = f"Y_{target_year}"
        Period.objects.get_or_create(
            period_key=period_key,
            defaults={
                "period_type": "YEAR",
                "period_start": date(target_year, 1, 1),
                "period_end": date(target_year, 12, 31),
                "boundary_set": bset,
            },
        )

        job_key = f"LIVE_KOSIS_POPULATION_{target_year}"
        job, _ = IngestionJob.objects.get_or_create(
            dataset_version=version,
            idempotency_key=job_key,
            defaults={
                "job_type": "INCREMENTAL",
                "status": "RUNNING",
                "started_at": timezone.now(),
            },
        )
        slice_key = f"SLICE_KOSIS_POP_{target_year}"
        slice_row, _ = IngestionSlice.objects.get_or_create(
            ingestion_job=job,
            slice_key=slice_key,
            defaults={
                "request_parameters": {
                    "orgId": "101",
                    "tblId": "DT_1B040A3",
                    "itmId": "T20",
                    "prdSe": "Y",
                    "startPrdDe": str(target_year),
                    "endPrdDe": str(target_year),
                },
                "status": "SUCCESS",
            },
        )

        raw_obs_to_create = []
        for r in sigungu_rows:
            payload = json.dumps(r.raw_payload, sort_keys=True, ensure_ascii=False)
            row_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
            raw_obs_to_create.append(
                RawObservation(
                    ingestion_job=job,
                    ingestion_slice=slice_row,
                    dataset_version=version,
                    org_id=r.org_id,
                    tbl_id=r.tbl_id,
                    c1=r.c1,
                    c1_nm=r.c1_nm,
                    itm_id=r.itm_id,
                    itm_nm=r.itm_nm,
                    unit_id="PERSON",
                    unit_nm="명",
                    prd_se="Y",
                    prd_de=r.prd_de,
                    dt=r.dt,
                    raw_payload=r.raw_payload,
                    source_row_hash=row_hash,
                    quality_status="VALIDATED",
                )
            )

        existing_raw_ids = RawObservation.objects.filter(ingestion_job=job).values_list("id", flat=True)
        Observation.objects.filter(source_raw_observation_id__in=existing_raw_ids).delete()
        RawObservation.objects.filter(ingestion_job=job).delete()
        RawObservation.objects.bulk_create(raw_obs_to_create)
        job.raw_row_count = len(raw_obs_to_create)
        job.save(update_fields=["raw_row_count"])

    norm_res = normalize_job(job.id)
    pub_res = publish_job(job.id)

    if CACHE_FILE.exists():
        try:
            CACHE_FILE.unlink()
        except Exception:
            pass

    return {
        "success": True,
        "category": "POPULATION",
        "year": target_year,
        "collected_districts": len(sigungu_rows),
        "normalized": norm_res.normalized_count,
        "published": pub_res.published_count,
        "message": f"성공! {target_year}년 주민등록 인구 데이터 {pub_res.published_count}개 지자체 적재 완료.",
    }


def sync_fiscal_year(target_year: int) -> dict[str, Any]:
    """Ingest fiscal independence for the specified year directly from KOSIS API."""
    client = KosisClient()
    logger.info("Fetching fiscal independence for %s from KOSIS...", target_year)

    res = client.fetch({
        "orgId": "101",
        "tblId": "DT_1YL20921",
        "itmId": "T20",
        "objL1": "ALL",
        "prdSe": "Y",
        "startPrdDe": str(target_year),
        "endPrdDe": str(target_year),
    })

    sigungu_rows = [
        row for row in res.rows
        if len(row.c1) == 5 and row.itm_id == "T20"
    ]
    if not sigungu_rows:
        return {"success": False, "message": f"KOSIS에서 {target_year}년 시군구 재정자립도 데이터를 찾을 수 없습니다."}

    with transaction.atomic():
        ds = Dataset.objects.filter(source_table_id="DT_1YL20921").first()
        if not ds:
            return {"success": False, "message": "Dataset DT_1YL20921 does not exist in DB."}
        version = ds.versions.filter(status="ACTIVE").first() or ds.versions.first()

        bset = BoundarySet.objects.filter(reference_year=target_year, status="ACTIVE").first()
        if not bset:
            bset = BoundarySet.objects.filter(status="ACTIVE").order_by("-reference_year").first()

        period_key = f"Y_{target_year}"
        Period.objects.get_or_create(
            period_key=period_key,
            defaults={
                "period_type": "YEAR",
                "period_start": date(target_year, 1, 1),
                "period_end": date(target_year, 12, 31),
                "boundary_set": bset,
            },
        )

        job_key = f"LIVE_KOSIS_FISCAL_{target_year}"
        job, _ = IngestionJob.objects.get_or_create(
            dataset_version=version,
            idempotency_key=job_key,
            defaults={
                "job_type": "INCREMENTAL",
                "status": "RUNNING",
                "started_at": timezone.now(),
            },
        )
        slice_key = f"SLICE_KOSIS_FISCAL_{target_year}"
        slice_row, _ = IngestionSlice.objects.get_or_create(
            ingestion_job=job,
            slice_key=slice_key,
            defaults={
                "request_parameters": {
                    "orgId": "101",
                    "tblId": "DT_1YL20921",
                    "itmId": "T20",
                    "prdSe": "Y",
                    "startPrdDe": str(target_year),
                    "endPrdDe": str(target_year),
                },
                "status": "SUCCESS",
            },
        )

        raw_obs_to_create = []
        for r in sigungu_rows:
            payload = json.dumps(r.raw_payload, sort_keys=True, ensure_ascii=False)
            row_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
            raw_obs_to_create.append(
                RawObservation(
                    ingestion_job=job,
                    ingestion_slice=slice_row,
                    dataset_version=version,
                    org_id=r.org_id,
                    tbl_id=r.tbl_id,
                    c1=r.c1,
                    c1_nm=r.c1_nm,
                    itm_id=r.itm_id,
                    itm_nm=r.itm_nm,
                    unit_id="PERCENT",
                    unit_nm="%",
                    prd_se="Y",
                    prd_de=r.prd_de,
                    dt=r.dt,
                    raw_payload=r.raw_payload,
                    source_row_hash=row_hash,
                    quality_status="VALIDATED",
                )
            )

        existing_raw_ids = RawObservation.objects.filter(ingestion_job=job).values_list("id", flat=True)
        Observation.objects.filter(source_raw_observation_id__in=existing_raw_ids).delete()
        RawObservation.objects.filter(ingestion_job=job).delete()
        RawObservation.objects.bulk_create(raw_obs_to_create)
        job.raw_row_count = len(raw_obs_to_create)
        job.save(update_fields=["raw_row_count"])

    norm_res = normalize_job(job.id)
    pub_res = publish_job(job.id)

    if CACHE_FILE.exists():
        try:
            CACHE_FILE.unlink()
        except Exception:
            pass

    return {
        "success": True,
        "category": "FISCAL",
        "year": target_year,
        "collected_districts": len(sigungu_rows),
        "normalized": norm_res.normalized_count,
        "published": pub_res.published_count,
        "message": f"성공! {target_year}년 재정자립도 데이터 {pub_res.published_count}개 지자체 적재 완료.",
    }


def sync_economy_year(target_year: int) -> dict[str, Any]:
    """Ingest business establishments for the specified year directly from KOSIS API."""
    client = KosisClient()
    logger.info("Fetching business establishments for %s from KOSIS...", target_year)

    res = client.fetch({
        "orgId": "133",
        "tblId": "DT_133N_A9811",
        "itmId": "T01",
        "objL1": "ALL",
        "objL2": "16133T2008_0245",
        "prdSe": "Y",
        "startPrdDe": str(target_year),
        "endPrdDe": str(target_year),
    })

    with transaction.atomic():
        ds = Dataset.objects.filter(source_table_id="DT_133N_A9811").first()
        if not ds:
            return {"success": False, "message": "Dataset DT_133N_A9811 does not exist in DB."}
        version = ds.versions.filter(status="ACTIVE").first() or ds.versions.first()

        bset = BoundarySet.objects.filter(reference_year=target_year, status="ACTIVE").first()
        if not bset:
            bset = BoundarySet.objects.filter(status="ACTIVE").order_by("-reference_year").first()

        period_key = f"Y_{target_year}"
        Period.objects.get_or_create(
            period_key=period_key,
            defaults={
                "period_type": "YEAR",
                "period_start": date(target_year, 1, 1),
                "period_end": date(target_year, 12, 31),
                "boundary_set": bset,
            },
        )

        job_key = f"LIVE_KOSIS_ECONOMY_{target_year}"
        job, _ = IngestionJob.objects.get_or_create(
            dataset_version=version,
            idempotency_key=job_key,
            defaults={
                "job_type": "INCREMENTAL",
                "status": "RUNNING",
                "started_at": timezone.now(),
            },
        )
        slice_key = f"SLICE_KOSIS_ECON_{target_year}"
        slice_row, _ = IngestionSlice.objects.get_or_create(
            ingestion_job=job,
            slice_key=slice_key,
            defaults={
                "request_parameters": {
                    "orgId": "133",
                    "tblId": "DT_133N_A9811",
                    "itmId": "T01",
                    "prdSe": "Y",
                    "startPrdDe": str(target_year),
                    "endPrdDe": str(target_year),
                },
                "status": "SUCCESS",
            },
        )

        raw_obs_to_create = []
        for r in res.rows:
            # Exclude nationwide or higher-level rows that don't match sigungu format
            payload = json.dumps(r.raw_payload, sort_keys=True, ensure_ascii=False)
            row_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
            raw_obs_to_create.append(
                RawObservation(
                    ingestion_job=job,
                    ingestion_slice=slice_row,
                    dataset_version=version,
                    org_id=r.org_id,
                    tbl_id=r.tbl_id,
                    c1=r.c1,
                    c1_nm=r.c1_nm,
                    c2=getattr(r, "c2", None),
                    c2_nm=getattr(r, "c2_nm", None),
                    itm_id=r.itm_id,
                    itm_nm=r.itm_nm,
                    unit_id="ESTABLISHMENT",
                    unit_nm="개",
                    prd_se="Y",
                    prd_de=r.prd_de,
                    dt=r.dt,
                    raw_payload=r.raw_payload,
                    source_row_hash=row_hash,
                    quality_status="VALIDATED",
                )
            )

        existing_raw_ids = RawObservation.objects.filter(ingestion_job=job).values_list("id", flat=True)
        Observation.objects.filter(source_raw_observation_id__in=existing_raw_ids).delete()
        RawObservation.objects.filter(ingestion_job=job).delete()
        RawObservation.objects.bulk_create(raw_obs_to_create)
        job.raw_row_count = len(raw_obs_to_create)
        job.save(update_fields=["raw_row_count"])

    norm_res = normalize_job(job.id)
    pub_res = publish_job(job.id)

    if CACHE_FILE.exists():
        try:
            CACHE_FILE.unlink()
        except Exception:
            pass

    return {
        "success": True,
        "category": "ECONOMY",
        "year": target_year,
        "collected_districts": len(raw_obs_to_create),
        "normalized": norm_res.normalized_count,
        "published": pub_res.published_count,
        "message": f"성공! {target_year}년 사업체 수 데이터 {pub_res.published_count}개 지자체 적재 완료.",
    }