import hashlib
import json
from datetime import date
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from psycopg.types.range import Range

from explorer.models import (
    Dataset,
    DatasetDimension,
    DatasetFamily,
    DatasetItemMapping,
    DatasetRegionMapping,
    DatasetVersion,
    DerivedIndicator,
    Indicator,
    IngestionJob,
    IngestionSlice,
    Metric,
    Observation,
    RawObservation,
    Region,
    RegionName,
    Unit,
)
from explorer.pipeline.normalizer import normalize_job
from explorer.pipeline.publisher import publish_job


class Command(BaseCommand):
    help = "Ingest official 2010-2024 active business establishments dataset from NTS/KOSIS (DT_133N_A9811)"

    def handle(self, *args, **options):
        fpath = Path("var/raw/economy/DT_133N_A9811_businesses.json")
        if not fpath.exists():
            self.stderr.write(f"File {fpath} not found!")
            return

        with open(fpath, "r", encoding="utf-8") as f:
            raw_rows = json.load(f)

        self.stdout.write(f"Loaded {len(raw_rows)} business rows.")

        unit_est, _ = Unit.objects.get_or_create(
            unit_key="ESTABLISHMENT",
            defaults={"name": "개", "dimension": "COUNT", "symbol": "개"},
        )
        unit_krw = Unit.objects.get(unit_key="KRW")
        metric_count, _ = Metric.objects.get_or_create(
            metric_key="COUNT",
            defaults={"name": "인원/건수", "description": "총 수량"},
        )

        ind_biz, _ = Indicator.objects.get_or_create(
            indicator_key="BUSINESS_ESTABLISHMENTS",
            defaults={
                "name": "사업체 수",
                "description": "국세청 등록 기준 해당 시·군·구 내 실제 사업 활동 중인 가동사업자(개인+법인) 총수",
                "category": "ECONOMY",
                "canonical_unit": unit_est,
                "value_type": "COUNT",
                "aggregation_method": "SUM",
                "geography_requirement": "MANDATORY",
                "default_frequency": "YEAR",
                "source_type": "OFFICIAL",
                "status": "ACTIVE",
            },
        )

        # Region Mapping
        name_to_region = {}
        for rn in RegionName.objects.filter(is_official=True).select_related("region"):
            clean = rn.name.replace(" ", "").strip()
            name_to_region[clean] = rn.region

        valid_rows = []
        region_mappings = {}
        for r in raw_rows:
            nm = r.get("C1_NM", "").replace(" ", "").strip()
            c1 = r.get("C1", "")
            if nm in ("지역별", "총계", "합계", "시세", "도세") or "본청" in nm:
                continue
            reg = name_to_region.get(nm)
            if reg:
                valid_rows.append((r, reg, c1, nm))
                region_mappings[c1] = (reg, nm)

        self.stdout.write(f"Mapped {len(region_mappings)} districts, {len(valid_rows)} observation rows.")

        with transaction.atomic():
            family, _ = DatasetFamily.objects.get_or_create(
                family_key="KOSIS_ECONOMY_FAMILY",
                defaults={"name": "국세통계 가동사업자 현황"},
            )
            dataset, _ = Dataset.objects.get_or_create(
                source_provider="KOSIS",
                source_org_id="133",
                source_table_id="DT_133N_A9811",
                defaults={
                    "dataset_key": "KOSIS_BUSINESS_ESTABLISHMENTS",
                    "family": family,
                    "source_table_name": "시군구별 가동사업자 현황",
                    "geography_level": "BASIC_LOCAL_GOVERNMENT",
                    "frequency": "YEAR",
                },
            )
            version, _ = DatasetVersion.objects.get_or_create(
                dataset=dataset,
                version=1,
                defaults={
                    "status": "ACTIVE",
                    "available_period": Range(date(2010, 1, 1), date(2025, 1, 1), "[)"),
                    "metadata_checksum": hashlib.sha256(b"KOSIS_DT_133N_A9811_v1").hexdigest(),
                    "metadata_snapshot": {"tableId": "DT_133N_A9811", "orgId": "133"},
                },
            )

            DatasetDimension.objects.get_or_create(
                dataset_version=version,
                semantic_dimension="REGION",
                defaults={
                    "source_dimension": "c1",
                    "required": True,
                    "selection_strategy": "ALL_MAPPED",
                    "ordinal": 1,
                },
            )

            DatasetItemMapping.objects.get_or_create(
                dataset_version=version,
                source_item_id="T01",
                defaults={
                    "source_item_name": "가동사업자 현황",
                    "indicator": ind_biz,
                    "metric": metric_count,
                    "source_unit_id": "ESTABLISHMENT",
                    "valid_period": Range(date(2010, 1, 1), None, "[)"),
                    "comparability_status": "COMPARABLE",
                },
            )

            for c1_code, (reg_obj, dname) in region_mappings.items():
                DatasetRegionMapping.objects.get_or_create(
                    dataset_version=version,
                    source_dimension="c1",
                    source_region_code=c1_code,
                    defaults={
                        "source_region_name": dname,
                        "region": reg_obj,
                        "valid_period": Range(date(2010, 1, 1), None, "[)"),
                        "mapping_method": "DIRECT",
                        "approved_at": timezone.now(),
                    },
                )

            job, _ = IngestionJob.objects.get_or_create(
                dataset_version=version,
                idempotency_key="LIVE_KOSIS_BUSINESS_ESTABLISHMENTS_2010_2024",
                defaults={
                    "job_type": "FULL_BACKFILL",
                    "status": "RUNNING",
                    "started_at": timezone.now(),
                    "raw_row_count": len(valid_rows),
                },
            )
            slice_row, _ = IngestionSlice.objects.get_or_create(
                ingestion_job=job,
                slice_key="SLICE_KOSIS_BUSINESS_ESTABLISHMENTS_2010_2024",
                defaults={
                    "request_parameters": {
                        "orgId": "133",
                        "tblId": "DT_133N_A9811",
                        "prdSe": "Y",
                        "startPrdDe": "2010",
                        "endPrdDe": "2024",
                    },
                    "status": "SUCCESS",
                },
            )

            existing_raw_ids = RawObservation.objects.filter(ingestion_job=job).values_list("id", flat=True)
            Observation.objects.filter(source_raw_observation_id__in=existing_raw_ids).delete()
            RawObservation.objects.filter(ingestion_job=job).delete()

            raw_obs_to_create = []
            for r, reg, c1, nm in valid_rows:
                prd = r.get("PRD_DE", "")
                dt_str = str(r.get("DT", "") or "").strip()
                if not dt_str or dt_str in ("-", "…", "null"):
                    continue
                row_hash = hashlib.sha256(f"{prd}_{c1}_BIZ_{dt_str}".encode("utf-8")).hexdigest()
                raw_obs_to_create.append(
                    RawObservation(
                        ingestion_job=job,
                        ingestion_slice=slice_row,
                        dataset_version=version,
                        org_id="133",
                        tbl_id="DT_133N_A9811",
                        c1=c1,
                        c1_nm=nm,
                        c2=r.get("C2", ""),
                        c2_nm=r.get("C2_NM", ""),
                        itm_id="T01",
                        itm_nm="가동사업자 현황",
                        unit_id="ESTABLISHMENT",
                        unit_nm="개",
                        prd_se="Y",
                        prd_de=prd,
                        dt=dt_str,
                        raw_payload=r,
                        source_row_hash=row_hash,
                        quality_status="VALIDATED",
                    )
                )

            RawObservation.objects.bulk_create(raw_obs_to_create)
            job.raw_row_count = len(raw_obs_to_create)
            job.save(update_fields=["raw_row_count"])

        normalize_job(job.id)
        pub_res = publish_job(job.id)
        self.stdout.write(
            self.style.SUCCESS(
                f"Published {pub_res.published_count} observations for BUSINESS_ESTABLISHMENTS!"
            )
        )
