import hashlib
import json
from dataclasses import dataclass
from typing import Any
from django.db import transaction
from django.utils import timezone
from explorer.kosis.client import KosisClient, sanitize_params
from explorer.kosis.types import KosisApiError
from explorer.models import IngestionJob, IngestionSlice, RawObservation

NO_RETRY_CODES = frozenset({"10", "11", "20", "21"})
SPLIT_CODES = frozenset({"31", "41"})
BACKOFF_CODES = frozenset({"40", "42", "50"})
MAX_RETRIES = 3


@dataclass
class CollectionResult:
    total_slices: int = 0
    successful_slices: int = 0
    failed_slices: int = 0
    skipped_slices: int = 0
    split_slices: int = 0
    raw_rows_collected: int = 0


def _split_slice_params(params: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]] | None:
    start_str = params.get("startPrdDe")
    end_str = params.get("endPrdDe")
    if start_str and end_str:
        try:
            start_yr = int(start_str)
            end_yr = int(end_str)
            if end_yr > start_yr:
                mid = (start_yr + end_yr) // 2
                p1 = dict(params)
                p1["startPrdDe"] = str(start_yr)
                p1["endPrdDe"] = str(mid)
                p2 = dict(params)
                p2["startPrdDe"] = str(mid + 1)
                p2["endPrdDe"] = str(end_yr)
                return p1, p2
        except ValueError:
            pass

    itm_id = params.get("itmId")
    if itm_id and "+" in itm_id:
        items = itm_id.split("+")
        mid = len(items) // 2
        p1 = dict(params)
        p1["itmId"] = "+".join(items[:mid])
        p2 = dict(params)
        p2["itmId"] = "+".join(items[mid:])
        return p1, p2

    return None


def collect_job(job_id: int, client: KosisClient | Any) -> CollectionResult:
    job = IngestionJob.objects.get(id=job_id)
    if job.status == "PENDING":
        job.status = "RUNNING"
        job.started_at = timezone.now()
        job.save()

    result = CollectionResult()

    # Track already completed slices
    completed_count = IngestionSlice.objects.filter(
        ingestion_job=job, status__in=["SUCCESS", "SUCCESS_EMPTY"]
    ).count()
    result.skipped_slices += completed_count

    while True:
        # Fetch pending or retrying slices with lock
        with transaction.atomic():
            slice_row = (
                IngestionSlice.objects.select_for_update(skip_locked=True)
                .filter(ingestion_job=job, status__in=["PENDING", "RETRYING"])
                .order_by("id")
                .first()
            )
            if not slice_row:
                break

            slice_row.status = "RUNNING"
            slice_row.started_at = timezone.now()
            slice_row.save(update_fields=["status", "started_at"])

        # Execute slice outside lock
        result.total_slices += 1
        try:
            response = client.fetch(slice_row.request_parameters)
            rows_to_insert = []
            for r in response.rows:
                rows_to_insert.append(
                    RawObservation(
                        ingestion_job=job,
                        ingestion_slice=slice_row,
                        dataset_version=job.dataset_version,
                        org_id=r.org_id,
                        tbl_id=r.tbl_id,
                        c1=r.c1,
                        c1_nm=r.c1_nm,
                        c1_obj_nm=r.c1_obj_nm,
                        c2=r.c2,
                        c2_nm=r.c2_nm,
                        c2_obj_nm=r.c2_obj_nm,
                        c3=r.c3,
                        c3_nm=r.c3_nm,
                        c3_obj_nm=r.c3_obj_nm,
                        c4=r.c4,
                        c4_nm=r.c4_nm,
                        c4_obj_nm=r.c4_obj_nm,
                        c5=r.c5,
                        c5_nm=r.c5_nm,
                        c5_obj_nm=r.c5_obj_nm,
                        c6=r.c6,
                        c6_nm=r.c6_nm,
                        c6_obj_nm=r.c6_obj_nm,
                        c7=r.c7,
                        c7_nm=r.c7_nm,
                        c7_obj_nm=r.c7_obj_nm,
                        c8=r.c8,
                        c8_nm=r.c8_nm,
                        c8_obj_nm=r.c8_obj_nm,
                        itm_id=r.itm_id,
                        itm_nm=r.itm_nm,
                        unit_id=r.unit_id,
                        unit_nm=r.unit_nm,
                        prd_se=r.prd_se,
                        prd_de=r.prd_de,
                        dt=r.dt,
                        symbol=r.symbol,
                        raw_payload=r.raw_payload,
                        source_row_hash=r.source_row_hash,
                        quality_status="UNVALIDATED",
                    )
                )

            with transaction.atomic():
                RawObservation.objects.bulk_create(rows_to_insert, ignore_conflicts=True)
                slice_row.status = "SUCCESS" if rows_to_insert else "SUCCESS_EMPTY"
                slice_row.response_row_count = len(rows_to_insert)
                slice_row.finished_at = timezone.now()
                slice_row.save(
                    update_fields=["status", "response_row_count", "finished_at"]
                )

            result.successful_slices += 1
            result.raw_rows_collected += len(rows_to_insert)

        except KosisApiError as exc:
            slice_row.error_code = exc.code
            slice_row.error_message = exc.message

            if exc.code in SPLIT_CODES:
                slice_row.status = "SPLIT"
                slice_row.finished_at = timezone.now()
                slice_row.save()
                result.split_slices += 1

                split_res = _split_slice_params(slice_row.request_parameters)
                if split_res:
                    p1, p2 = split_res
                    key1 = hashlib.sha256(
                        f"{slice_row.slice_key}_1_{json.dumps(p1, sort_keys=True)}".encode("utf-8")
                    ).hexdigest()
                    key2 = hashlib.sha256(
                        f"{slice_row.slice_key}_2_{json.dumps(p2, sort_keys=True)}".encode("utf-8")
                    ).hexdigest()
                    IngestionSlice.objects.create(
                        ingestion_job=job,
                        slice_key=key1,
                        request_parameters=p1,
                        status="PENDING",
                    )
                    IngestionSlice.objects.create(
                        ingestion_job=job,
                        slice_key=key2,
                        request_parameters=p2,
                        status="PENDING",
                    )
                else:
                    slice_row.status = "FAILED"
                    slice_row.save()
                    result.failed_slices += 1

            elif exc.code in NO_RETRY_CODES:
                slice_row.status = "FAILED"
                slice_row.finished_at = timezone.now()
                slice_row.attempts = slice_row.attempts + 1
                slice_row.save()
                result.failed_slices += 1
                job.status = "FAILED"
                job.error_message = f"[{exc.code}] {exc.message}"
                job.finished_at = timezone.now()
                job.save()
                break

            else:
                slice_row.attempts = slice_row.attempts + 1
                if slice_row.attempts >= MAX_RETRIES:
                    slice_row.status = "FAILED"
                    slice_row.finished_at = timezone.now()
                    slice_row.save()
                    result.failed_slices += 1
                else:
                    slice_row.status = "RETRYING"
                    slice_row.save()

    # Refresh and set final job status
    job.refresh_from_db()
    if job.status != "FAILED":
        all_slices = IngestionSlice.objects.filter(ingestion_job=job).exclude(status="SPLIT")
        failed_count = all_slices.filter(status="FAILED").count()
        success_count = all_slices.filter(status__in=["SUCCESS", "SUCCESS_EMPTY"]).count()

        if failed_count == 0 and success_count > 0:
            job.status = "SUCCESS"
        elif success_count > 0 and failed_count > 0:
            job.status = "PARTIAL_SUCCESS"
        elif failed_count > 0:
            job.status = "FAILED"
        job.finished_at = timezone.now()
        job.raw_row_count = RawObservation.objects.filter(ingestion_job=job).count()
        job.save()

    return result
