from datetime import date
from decimal import Decimal
import hashlib
import json
from pathlib import Path
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from psycopg.types.range import Range

from explorer.models import (
    BoundaryFeature,
    BoundarySet,
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
    Observation,
    Period,
    RawObservation,
    Region,
    RegionIdentifier,
    RegionName,
    Unit,
)
from explorer.pipeline.normalizer import normalize_job
from explorer.pipeline.publisher import publish_job


class Command(BaseCommand):
    help = "Ingest official 2010-2024 national resident population data from KOSIS (DT_1B040A3) for all ~250+ districts"

    def handle(self, *args, **options):
        raw_file = Path("var/raw/kosis_population_2010_2024.json")
        if not raw_file.exists():
            self.stderr.write(self.style.ERROR(f"File {raw_file} not found. Run discovery/cache first."))
            return

        with open(raw_file, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

        self.stdout.write(f"Loaded {len(raw_data)} rows from KOSIS population dataset.")

        # Filter only 5-digit basic local governments (시·군·구) and total population item 'T20'
        sigungu_rows = [
            r for r in raw_data 
            if len(r.get("C1", "")) == 5 and r.get("ITM_ID") == "T20"
        ]
        self.stdout.write(f"Filtered {len(sigungu_rows)} district-level population rows across 2010-2024.")

        # 1. Semantic Unit & Metric & Indicator
        with transaction.atomic():
            unit_person, _ = Unit.objects.get_or_create(
                unit_key="PERSON",
                defaults={"name": "명", "dimension": "COUNT", "symbol": "명"},
            )
            metric_pop, _ = Metric.objects.get_or_create(
                metric_key="POPULATION_COUNT",
                defaults={"name": "주민등록인구수", "description": "행정안전부 주민등록 인구현황"},
            )
            ind_pop, _ = Indicator.objects.get_or_create(
                indicator_key="POPULATION",
                defaults={
                    "name": "주민등록인구",
                    "category": "POPULATION",
                    "canonical_unit": unit_person,
                    "value_type": "COUNT",
                    "aggregation_method": "LAST",
                    "geography_requirement": "MANDATORY",
                    "default_frequency": "YEAR",
                    "source_type": "OFFICIAL",
                    "status": "ACTIVE",
                },
            )

            # 2. Periods (2010-2024)
            for y in range(2010, 2025):
                bset, _ = BoundarySet.objects.get_or_create(
                    reference_year=y,
                    defaults={
                        "reference_date": date(y, 1, 1),
                        "source_name": "SGIS",
                        "source_uri": f"https://sgis.kostat.go.kr/{y}",
                        "asset_uri": f"/static/geo/boundaries/{y}.geojson",
                        "checksum": f"{y}" * 16,
                        "status": "ACTIVE",
                    },
                )
                Period.objects.get_or_create(
                    period_key=f"Y_{y}",
                    defaults={
                        "period_type": "YEAR",
                        "period_start": date(y, 1, 1),
                        "period_end": date(y, 12, 31),
                        "boundary_set": bset,
                    },
                )

            # 3. Create all Regions from KOSIS C1/C1_NM
            distinct_districts = {}
            for r in sigungu_rows:
                code = r["C1"]
                name = r["C1_NM"]
                distinct_districts[code] = name

            self.stdout.write(f"Synchronizing {len(distinct_districts)} distinct administrative districts into geo.region...")
            created_regions = 0
            for code, name in distinct_districts.items():
                reg, created = Region.objects.get_or_create(
                    region_key=f"KR_{code}",
                    defaults={
                        "region_level": "BASIC_LOCAL_GOVERNMENT",
                        "region_kind": "MUNICIPAL_DISTRICT",
                        "valid_period": Range(date(2010, 1, 1), None, "[)"),
                        "status": "ACTIVE",
                    },
                )
                if created:
                    created_regions += 1
                RegionName.objects.get_or_create(
                    region=reg,
                    name=name,
                    valid_period=Range(date(2010, 1, 1), None, "[)"),
                    defaults={"is_official": True, "name_type": "OFFICIAL"},
                )
                RegionIdentifier.objects.get_or_create(
                    region=reg,
                    code_system="KOSIS_ADM_CD",
                    code=code,
                    valid_period=Range(date(2010, 1, 1), None, "[)"),
                    defaults={"source": "KOSIS_DT_1B040A3"},
                )
                RegionIdentifier.objects.get_or_create(
                    region=reg,
                    code_system="SGIS_ADM_CD",
                    code=code,
                    valid_period=Range(date(2010, 1, 1), None, "[)"),
                    defaults={"source": "SGIS_MAPPING"},
                )

            self.stdout.write(f"Created {created_regions} new regions. (Total districts: {len(distinct_districts)})")

            # 4. Dataset Catalog Setup
            family, _ = DatasetFamily.objects.get_or_create(
                family_key="KOSIS_POPULATION_FAMILY",
                defaults={"name": "주민등록인구현황"},
            )
            dataset, _ = Dataset.objects.get_or_create(
                dataset_key="KOSIS_RESIDENT_POPULATION",
                defaults={
                    "family": family,
                    "source_provider": "KOSIS",
                    "source_org_id": "101",
                    "source_table_id": "DT_1B040A3",
                    "source_table_name": "행정구역(시군구)별 주민등록인구현황",
                    "geography_level": "BASIC_LOCAL_GOVERNMENT",
                    "frequency": "YEAR",
                },
            )
            checksum = hashlib.sha256(b"KOSIS_DT_1B040A3_POPULATION_V1").hexdigest()
            version, _ = DatasetVersion.objects.get_or_create(
                dataset=dataset,
                version=1,
                defaults={
                    "status": "ACTIVE",
                    "metadata_checksum": checksum,
                    "metadata_snapshot": {"table": "DT_1B040A3", "org": "101"},
                    "approved_at": timezone.now(),
                    "approval_note": "Approved official 2010-2024 national resident population from KOSIS",
                },
            )
            DatasetDimension.objects.get_or_create(
                dataset_version=version,
                semantic_dimension="REGION",
                defaults={
                    "source_dimension": "C1",
                    "required": True,
                    "selection_strategy": "ALL_MAPPED",
                    "ordinal": 1,
                },
            )
            DatasetItemMapping.objects.get_or_create(
                dataset_version=version,
                source_item_id="T20",
                defaults={
                    "source_item_name": "총인구수",
                    "indicator": ind_pop,
                    "metric": metric_pop,
                    "source_unit_id": "PERSON",
                    "valid_period": Range(date(2010, 1, 1), None, "[)"),
                    "comparability_status": "COMPARABLE",
                },
            )

            for code, name in distinct_districts.items():
                reg = Region.objects.get(region_key=f"KR_{code}")
                DatasetRegionMapping.objects.get_or_create(
                    dataset_version=version,
                    source_dimension="C1",
                    source_region_code=code,
                    defaults={
                        "source_region_name": name,
                        "region": reg,
                        "valid_period": Range(date(2010, 1, 1), None, "[)"),
                        "mapping_method": "DIRECT",
                        "approved_at": timezone.now(),
                    },
                )

            # 5. Ingestion Job & Slice
            job, _ = IngestionJob.objects.get_or_create(
                dataset_version=version,
                idempotency_key="LIVE_KOSIS_POPULATION_2010_2024",
                defaults={
                    "job_type": "FULL_BACKFILL",
                    "status": "RUNNING",
                    "started_at": timezone.now(),
                },
            )
            slice_row, _ = IngestionSlice.objects.get_or_create(
                ingestion_job=job,
                slice_key="SLICE_KOSIS_POP_2010_2024",
                defaults={
                    "request_parameters": {
                        "orgId": "101",
                        "tblId": "DT_1B040A3",
                        "itmId": "T20",
                        "prdSe": "Y",
                        "startPrdDe": "2010",
                        "endPrdDe": "2024",
                    },
                    "status": "SUCCESS",
                },
            )

            # 6. RawObservation Insertion
            raw_obs_to_create = []
            for r in sigungu_rows:
                payload = json.dumps(r, sort_keys=True, ensure_ascii=False)
                row_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
                raw_obs_to_create.append(
                    RawObservation(
                        ingestion_job=job,
                        ingestion_slice=slice_row,
                        dataset_version=version,
                        org_id=r.get("ORG_ID", "101"),
                        tbl_id=r.get("TBL_ID", "DT_1B040A3"),
                        c1=r.get("C1", ""),
                        c1_nm=r.get("C1_NM", ""),
                        itm_id=r.get("ITM_ID", "T20"),
                        itm_nm=r.get("ITM_NM", "총인구수"),
                        unit_id="PERSON",
                        unit_nm=r.get("UNIT_NM", "명"),
                        prd_se="Y",
                        prd_de=r.get("PRD_DE", ""),
                        dt=r.get("DT", ""),
                        raw_payload=r,
                        source_row_hash=row_hash,
                        quality_status="VALIDATED",
                    )
                )

            # Clean up previous run data for this job cleanly (observations first due to PROTECT FK)
            existing_raw_ids = RawObservation.objects.filter(ingestion_job=job).values_list("id", flat=True)
            Observation.objects.filter(source_raw_observation_id__in=existing_raw_ids).delete()
            RawObservation.objects.filter(ingestion_job=job).delete()
            RawObservation.objects.bulk_create(raw_obs_to_create)
            job.raw_row_count = len(raw_obs_to_create)
            job.save(update_fields=["raw_row_count"])

        self.stdout.write(f"Inserted {len(raw_obs_to_create)} raw observations.")

        # 7. Normalize into Mart
        self.stdout.write("Normalizing raw observations into mart.observation...")
        norm_result = normalize_job(job.id)
        self.stdout.write(f"Normalized {norm_result.normalized_count} observations (failures: {norm_result.failed_count}).")

        # 8. Publish
        self.stdout.write("Publishing observations...")
        pub_result = publish_job(job.id)
        self.stdout.write(
            self.style.SUCCESS(
                f"Published {pub_result.published_count} official population observations across {len(distinct_districts)} districts!"
            )
        )
