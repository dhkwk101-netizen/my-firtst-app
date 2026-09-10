import glob
import hashlib
import json
import os
from datetime import date
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
    Indicator,
    IngestionJob,
    IngestionSlice,
    Metric,
    NormalizationRule,
    Observation,
    RawObservation,
    Region,
    RegionName,
    TaxOwner,
    Unit,
)
from explorer.pipeline.normalizer import normalize_job
from explorer.pipeline.publisher import publish_job


PROVINCE_METADATA = {
    "TX_11007_A058": ("서울특별시", "15110AD6ABAN", "KR_11"),
    "TX_11007_A059": ("부산광역시", "15110AD6ABAN", "KR_26"),
    "TX_11007_A060": ("대구광역시", "15110AD6ABAN", "KR_27"),
    "TX_11007_A061": ("인천광역시", "15110AD6ABAN", "KR_28"),
    "TX_11007_A062": ("광주광역시", "15110AD6ABAN", "KR_29"),
    "TX_11007_A063": ("대전광역시", "15110AD6ABAN", "KR_30"),
    "TX_11007_A064": ("울산광역시", "15110AD6ABAN", "KR_31"),
    "TX_11007_A065": ("경기도", "15110AD6CPAA", "KR_41"),
    "TX_11007_A066": ("강원특별자치도", "15110AD6CPAA", "KR_51"),
    "TX_11007_A067": ("충청북도", "15110AD6CPAA", "KR_43"),
    "TX_11007_A068": ("충청남도", "15110AD6CPAA", "KR_44"),
    "TX_11007_A069": ("전북특별자치도", "15110AD6CPAA", "KR_52"),
    "TX_11007_A070": ("전라남도", "15110AD6CPAA", "KR_46"),
    "TX_11007_A071": ("경상북도", "15110AD6CPAA", "KR_47"),
    "TX_11007_A072": ("경상남도", "15110AD6CPAA", "KR_48"),
    "TX_11007_A073": ("제주특별자치도", "15110AD6CPAA", "KR_50"),
}


class Command(BaseCommand):
    help = "Ingest official 2010-2024 acquisition tax data for all nationwide municipal districts from KOSIS"

    def handle(self, *args, **options):
        self.stdout.write("Starting nationwide local acquisition tax ingestion (2010-2024)...")

        # 1. Base Semantic Setup
        unit_krw, _ = Unit.objects.get_or_create(
            unit_key="KRW",
            defaults={"name": "원", "dimension": "CURRENCY", "symbol": "원"},
        )
        unit_thousand_krw, _ = Unit.objects.get_or_create(
            unit_key="THOUSAND_KRW",
            defaults={"name": "천원", "dimension": "CURRENCY", "symbol": "천원"},
        )
        NormalizationRule.objects.get_or_create(
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
        family, _ = DatasetFamily.objects.get_or_create(
            family_key="LOCAL_TAX_FAMILY",
            defaults={"name": "지방세 부과징수실적", "description": "기초자치단체별 지방세 세목별 부과징수 결산"},
        )

        total_published_tax = 0
        total_derived_per_capita = 0

        # Process each province file
        for tbl_id, (prov_name, c2_tax_code, reg_prefix) in PROVINCE_METADATA.items():
            fpath = Path(f"var/raw/national_tax/{tbl_id}.json")
            if not fpath.exists():
                self.stderr.write(f"File {fpath} not found. Skipping.")
                continue

            with open(fpath, "r", encoding="utf-8") as f:
                raw_data = json.load(f)

            if not isinstance(raw_data, list):
                self.stderr.write(f"File {fpath} does not contain a list. Skipping.")
                continue

            # Filter rows where C2 matches 취득세
            tax_rows = [
                r for r in raw_data
                if r.get("C2") == c2_tax_code
            ]

            if not tax_rows:
                self.stdout.write(f"No tax rows found for {tbl_id} ({prov_name}).")
                continue

            # Identify distinct districts in C1 and map to geo.Region
            c1_to_region = {}
            for r in tax_rows:
                c1 = r.get("C1")
                nm = r.get("C1_NM", "").replace(" ", "").strip()
                if c1 in c1_to_region or nm in ("합계", "총계", "시세", "도세", "군세", "구세") or "본청" in nm:
                    continue

                # Query RegionName within region prefix first, then fallback
                rn = RegionName.objects.filter(
                    name=nm,
                    region__region_key__startswith=reg_prefix,
                    is_official=True,
                ).first()
                if not rn:
                    rn = RegionName.objects.filter(name=nm, is_official=True).first()

                if rn:
                    c1_to_region[c1] = (rn.region, nm)

            valid_tax_rows = [r for r in tax_rows if r.get("C1") in c1_to_region]
            self.stdout.write(
                f"[{tbl_id}] {prov_name}: mapped {len(c1_to_region)} districts, {len(valid_tax_rows)} rows."
            )

            if not valid_tax_rows:
                continue

            with transaction.atomic():
                # Catalog Dataset
                dataset, _ = Dataset.objects.get_or_create(
                    source_provider="KOSIS",
                    source_org_id="110",
                    source_table_id=tbl_id,
                    defaults={
                        "dataset_key": f"KOSIS_TAX_{tbl_id}",
                        "family": family,
                        "source_table_name": f"{prov_name} 지방세 징수실적",
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
                        "metadata_checksum": hashlib.sha256(f"KOSIS_{tbl_id}_v1".encode()).hexdigest(),
                        "metadata_snapshot": {"tableId": tbl_id, "orgId": "110", "provName": prov_name},
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
                DatasetDimension.objects.get_or_create(
                    dataset_version=version,
                    semantic_dimension="TAX_TYPE",
                    defaults={
                        "source_dimension": "c2",
                        "required": True,
                        "selection_strategy": "FIXED",
                        "default_value": c2_tax_code,
                        "ordinal": 2,
                    },
                )

                # Item Mapping
                itm_sample = valid_tax_rows[0].get("ITM_ID", "16110ABC9")
                DatasetItemMapping.objects.get_or_create(
                    dataset_version=version,
                    source_item_id=itm_sample,
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

                # Region Mappings
                for c1_code, (reg_obj, dname) in c1_to_region.items():
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

                # Ingestion Job & Slice
                job, _ = IngestionJob.objects.get_or_create(
                    dataset_version=version,
                    idempotency_key=f"LIVE_KOSIS_{tbl_id}_2010_2024",
                    defaults={
                        "job_type": "FULL_BACKFILL",
                        "status": "RUNNING",
                        "started_at": timezone.now(),
                        "raw_row_count": len(valid_tax_rows),
                    },
                )
                slice_row, _ = IngestionSlice.objects.get_or_create(
                    ingestion_job=job,
                    slice_key=f"SLICE_KOSIS_{tbl_id}_2010_2024",
                    defaults={
                        "request_parameters": {
                            "orgId": "110",
                            "tblId": tbl_id,
                            "itmId": "ALL",
                            "objL1": "ALL",
                            "objL2": c2_tax_code,
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
                for r in valid_tax_rows:
                    row_hash = hashlib.sha256(
                        f"{r.get('PRD_DE')}_{r.get('C1')}_{r.get('C2')}_{r.get('ITM_ID')}_{r.get('DT')}".encode("utf-8")
                    ).hexdigest()
                    raw_obs_to_create.append(
                        RawObservation(
                            ingestion_job=job,
                            ingestion_slice=slice_row,
                            dataset_version=version,
                            org_id=r.get("ORG_ID", "110"),
                            tbl_id=tbl_id,
                            c1=r.get("C1", ""),
                            c1_nm=r.get("C1_NM", ""),
                            c2=r.get("C2", ""),
                            c2_nm=r.get("C2_NM", ""),
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

            # Normalize and Publish
            norm_res = normalize_job(job.id)
            pub_res = publish_job(job.id)

            total_published_tax += pub_res.published_count
            total_derived_per_capita += pub_res.derived_count
            self.stdout.write(
                f"  -> Published {pub_res.published_count} tax rows, derived {pub_res.derived_count} per-capita rows."
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"\n=== Nationwide Ingestion Complete! ===\n"
                f"Total Published Tax Observations: {total_published_tax}\n"
                f"Total Derived Per Capita Observations: {total_derived_per_capita}"
            )
        )
