import hashlib
import json
from datetime import date
from decimal import Decimal
from pathlib import Path
from django.contrib.postgres.fields import DateRangeField
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from psycopg.types.range import Range

from explorer.models import (
    Dataset,
    DatasetDimension,
    DatasetFamily,
    DatasetItemMapping,
    DatasetVersion,
    Indicator,
    IngestionJob,
    IngestionSlice,
    Metric,
    NormalizationRule,
    Observation,
    Period,
    RawObservation,
    Region,
    TaxOwner,
    Unit,
)
from explorer.pipeline.normalizer import normalize_job
from explorer.pipeline.publisher import publish_job


class Command(BaseCommand):
    help = "Ingest official 2010-2024 Gangnam-gu local acquisition tax collection data from KOSIS (TX_11007_A123)"

    def handle(self, *args, **options):
        raw_file = Path("var/raw/kosis_gangnam_tax_2010_2024.json")
        if not raw_file.exists():
            self.stderr.write(self.style.ERROR(f"File {raw_file} not found."))
            return

        with open(raw_file, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

        self.stdout.write(f"Loaded {len(raw_data)} rows from KOSIS Gangnam tax dataset.")

        # Filter only 취득세 (C1 == 15110AD6AM) and 징수액 (ITM_ID == 16110AAW3)
        tax_rows = [
            r for r in raw_data
            if r.get("C1") == "15110AD6AM" and r.get("ITM_ID") == "16110AAW3"
        ]
        self.stdout.write(f"Filtered {len(tax_rows)} 취득세 징수액 rows across 2010-2024.")

        with transaction.atomic():
            # 1. Semantic Currency Unit (KRW) & Thousand KRW Rule
            unit_krw, _ = Unit.objects.get_or_create(
                unit_key="KRW",
                defaults={"name": "원", "dimension": "CURRENCY", "symbol": "원"},
            )
            unit_thousand_krw, _ = Unit.objects.get_or_create(
                unit_key="THOUSAND_KRW",
                defaults={"name": "천원", "dimension": "CURRENCY", "symbol": "천원"},
            )

            # Normalization Rule for THOUSAND_KRW -> KRW (x 1,000)
            norm_rule, _ = NormalizationRule.objects.get_or_create(
                rule_key="THOUSAND_KRW_TO_KRW",
                defaults={
                    "rule_type": "UNIT_SCALE",
                    "parameters": {"source_unit": "THOUSAND_KRW", "target_unit": "KRW", "multiplier": 1000},
                    "checksum": hashlib.sha256(b"THOUSAND_KRW_TO_KRW").hexdigest(),
                    "version": 1,
                    "status": "ACTIVE",
                },
            )

            metric_col, _ = Metric.objects.get_or_create(
                metric_key="COLLECTED",
                defaults={"name": "징수액", "description": "실제 징수된 지방세 세입 결산액"},
            )
            tax_owner_basic, _ = TaxOwner.objects.get_or_create(
                tax_owner_key="BASIC_LOCAL_GOV",
                defaults={"name": "시·군·구청장", "jurisdiction_level": "BASIC_LOCAL_GOVERNMENT"},
            )

            ind_tax, _ = Indicator.objects.get_or_create(
                indicator_key="ACQUISITION_TAX",
                defaults={
                    "name": "취득세",
                    "description": "부동산 및 차량 등 취득 행위에 부과되는 지방세(시세/도세)",
                    "category": "TAX",
                    "canonical_unit": unit_krw,
                    "value_type": "CURRENCY",
                    "aggregation_method": "SUM",
                    "geography_requirement": "MANDATORY",
                    "default_frequency": "YEAR",
                    "source_type": "OFFICIAL",
                    "status": "ACTIVE",
                },
            )

            # 2. Dataset Catalog Setup for Gangnam Tax
            family, _ = DatasetFamily.objects.get_or_create(
                family_key="LOCAL_TAX_FAMILY",
                defaults={"name": "지방세 부과징수실적", "description": "기초자치단체별 지방세 세목별 부과징수 결산"},
            )

            dataset, _ = Dataset.objects.get_or_create(
                dataset_key="KOSIS_GANGNAM_TAX",
                defaults={
                    "family": family,
                    "source_provider": "KOSIS",
                    "source_org_id": "110",
                    "source_table_id": "TX_11007_A123",
                    "source_table_name": "기초자치단체별 부과징수 현황-강남구(시세)",
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
                    "metadata_checksum": hashlib.sha256(b"KOSIS_TX_11007_A123_v1").hexdigest(),
                    "metadata_snapshot": {"tableId": "TX_11007_A123", "orgId": "110"},
                },
            )

            # Fixed dimensions: Region is Gangnam-gu (KR_11680), C1 is 취득세 (15110AD6AM)
            DatasetDimension.objects.get_or_create(
                dataset_version=version,
                semantic_dimension="REGION",
                defaults={
                    "source_dimension": None,
                    "required": True,
                    "selection_strategy": "FIXED",
                    "default_value": "KR_11680",
                    "ordinal": 1,
                },
            )
            DatasetDimension.objects.get_or_create(
                dataset_version=version,
                semantic_dimension="TAX_TYPE",
                defaults={
                    "source_dimension": "c1",
                    "required": True,
                    "selection_strategy": "FIXED",
                    "default_value": "15110AD6AM",
                    "ordinal": 2,
                },
            )

            # Item Mapping for 징수액 (16110AAW3) -> ACQUISITION_TAX / COLLECTED
            DatasetItemMapping.objects.get_or_create(
                dataset_version=version,
                source_item_id="16110AAW3",
                defaults={
                    "source_item_name": "징수액",
                    "indicator": ind_tax,
                    "metric": metric_col,
                    "tax_owner": tax_owner_basic,
                    "source_unit_id": "THOUSAND_KRW",
                    "valid_period": Range(date(2010, 1, 1), None, "[)"),
                    "comparability_status": "COMPARABLE",
                },
            )

            # 3. Create IngestionJob & Slice
            job, _ = IngestionJob.objects.get_or_create(
                dataset_version=version,
                idempotency_key="LIVE_KOSIS_GANGNAM_TAX_2010_2024",
                defaults={
                    "job_type": "FULL_BACKFILL",
                    "status": "RUNNING",
                    "started_at": timezone.now(),
                    "raw_row_count": len(tax_rows),
                },
            )
            slice_row, _ = IngestionSlice.objects.get_or_create(
                ingestion_job=job,
                slice_key="SLICE_KOSIS_GANGNAM_TAX_2010_2024",
                defaults={
                    "request_parameters": {
                        "orgId": "110",
                        "tblId": "TX_11007_A123",
                        "itmId": "ALL",
                        "objL1": "ALL",
                        "prdSe": "Y",
                        "startPrdDe": "2010",
                        "endPrdDe": "2024",
                    },
                    "status": "SUCCESS",
                },
            )

            # Clean previous run observations
            existing_raw_ids = RawObservation.objects.filter(ingestion_job=job).values_list("id", flat=True)
            Observation.objects.filter(source_raw_observation_id__in=existing_raw_ids).delete()
            RawObservation.objects.filter(ingestion_job=job).delete()

            raw_obs_to_create = []
            for r in tax_rows:
                row_hash = hashlib.sha256(
                    f"{r.get('PRD_DE')}_{r.get('C1')}_{r.get('ITM_ID')}_{r.get('DT')}".encode("utf-8")
                ).hexdigest()
                raw_obs_to_create.append(
                    RawObservation(
                        ingestion_job=job,
                        ingestion_slice=slice_row,
                        dataset_version=version,
                        org_id=r.get("ORG_ID", "110"),
                        tbl_id=r.get("TBL_ID", "TX_11007_A123"),
                        c1=r.get("C1", ""),
                        c1_nm=r.get("C1_NM", ""),
                        itm_id=r.get("ITM_ID", ""),
                        itm_nm=r.get("ITM_NM", "징수액"),
                        unit_id="THOUSAND_KRW",
                        unit_nm=r.get("UNIT_NM", "천원"),
                        prd_se="Y",
                        prd_de=r.get("PRD_DE", ""),
                        dt=r.get("DT", ""),
                        raw_payload=r,
                        source_row_hash=row_hash,
                        quality_status="VALIDATED",
                    )
                )

            RawObservation.objects.bulk_create(raw_obs_to_create)
            job.raw_row_count = len(raw_obs_to_create)
            job.save(update_fields=["raw_row_count"])

        self.stdout.write(f"Inserted {len(raw_obs_to_create)} raw tax observations for Gangnam-gu.")

        # 4. Normalize
        self.stdout.write("Normalizing Gangnam tax raw observations...")
        norm_res = normalize_job(job.id)
        self.stdout.write(f"Normalized {norm_res.normalized_count} observations (failures: {norm_res.failed_count}).")

        # 5. Publish & Calculate Derived 1인당 취득세
        self.stdout.write("Publishing observations & calculating derived metrics...")
        pub_res = publish_job(job.id)
        self.stdout.write(
            self.style.SUCCESS(
                f"Published {pub_res.published_count} tax observations, "
                f"derived {pub_res.derived_count} per-capita tax observations!"
            )
        )
