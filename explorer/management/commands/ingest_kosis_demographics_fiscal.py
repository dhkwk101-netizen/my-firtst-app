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
    help = "Ingest official 2010-2024 demographic and fiscal indicators (Fiscal Independence, Elderly Ratio, Fertility Rate, Net Migration)"

    def handle(self, *args, **options):
        self.stdout.write("Starting demographic and fiscal indicators ingestion (2010-2024)...")

        # 1. Base Units & Metrics
        with transaction.atomic():
            unit_pct, _ = Unit.objects.get_or_create(
                unit_key="PERCENT",
                defaults={"name": "%", "dimension": "RATIO", "symbol": "%"},
            )
            unit_person, _ = Unit.objects.get_or_create(
                unit_key="PERSON",
                defaults={"name": "명", "dimension": "COUNT", "symbol": "명"},
            )
            metric_rate, _ = Metric.objects.get_or_create(
                metric_key="RATE",
                defaults={"name": "비율/지수", "description": "백분율 또는 지표율"},
            )
            metric_count, _ = Metric.objects.get_or_create(
                metric_key="COUNT",
                defaults={"name": "인원/건수", "description": "총 수량"},
            )

            # 2. Indicators
            ind_fiscal, _ = Indicator.objects.get_or_create(
                indicator_key="FISCAL_INDEPENDENCE",
                defaults={
                    "name": "재정자립도",
                    "description": "일반회계 세입 중 자체수입(지방세+세외수입)이 차지하는 비율",
                    "category": "FISCAL",
                    "canonical_unit": unit_pct,
                    "value_type": "PERCENT",
                    "aggregation_method": "AVG",
                    "geography_requirement": "MANDATORY",
                    "default_frequency": "YEAR",
                    "source_type": "OFFICIAL",
                    "status": "ACTIVE",
                },
            )

            ind_elderly, _ = Indicator.objects.get_or_create(
                indicator_key="ELDERLY_POPULATION_RATIO",
                defaults={
                    "name": "고령인구 비율",
                    "description": "총 주민등록 인구 중 65세 이상 고령 인구가 차지하는 백분율",
                    "category": "DEMOGRAPHY",
                    "canonical_unit": unit_pct,
                    "value_type": "PERCENT",
                    "aggregation_method": "AVG",
                    "geography_requirement": "MANDATORY",
                    "default_frequency": "YEAR",
                    "source_type": "OFFICIAL",
                    "status": "ACTIVE",
                },
            )

            ind_fertility, _ = Indicator.objects.get_or_create(
                indicator_key="TOTAL_FERTILITY_RATE",
                defaults={
                    "name": "합계출산율",
                    "description": "가임기 여성 1명이 평생 낳을 것으로 예상되는 평균 출생아 수",
                    "category": "DEMOGRAPHY",
                    "canonical_unit": unit_person,
                    "value_type": "RATE",
                    "aggregation_method": "AVG",
                    "geography_requirement": "MANDATORY",
                    "default_frequency": "YEAR",
                    "source_type": "OFFICIAL",
                    "status": "ACTIVE",
                },
            )

            ind_migration_rate, _ = Indicator.objects.get_or_create(
                indicator_key="NET_MIGRATION_RATE",
                defaults={
                    "name": "순이동률",
                    "description": "해당 지역으로 전입한 인구에서 전출한 인구를 뺀 순이동자의 주민등록인구 대비 비율",
                    "category": "DEMOGRAPHY",
                    "canonical_unit": unit_pct,
                    "value_type": "PERCENT",
                    "aggregation_method": "AVG",
                    "geography_requirement": "MANDATORY",
                    "default_frequency": "YEAR",
                    "source_type": "DERIVED",
                    "status": "ACTIVE",
                },
            )

            deriv_migration_rate, _ = DerivedIndicator.objects.get_or_create(
                indicator=ind_migration_rate,
                version=1,
                defaults={
                    "evaluator_key": "NET_MIGRATION_RATE",
                    "parameters": {"formula": "NET_MIGRATION / POPULATION * 100"},
                    "output_unit": unit_pct,
                    "checksum": hashlib.sha256(b"DERIV_NET_MIGRATION_RATE_v1").hexdigest(),
                    "status": "ACTIVE",
                },
            )

            ind_migration, _ = Indicator.objects.get_or_create(
                indicator_key="NET_MIGRATION",
                defaults={
                    "name": "순이동인구",
                    "description": "총전입자 수에서 총전출자 수를 뺀 순인구이동량",
                    "category": "DEMOGRAPHY",
                    "canonical_unit": unit_person,
                    "value_type": "COUNT",
                    "aggregation_method": "SUM",
                    "geography_requirement": "MANDATORY",
                    "default_frequency": "YEAR",
                    "source_type": "OFFICIAL",
                    "status": "ACTIVE",
                },
            )

        # Pre-build region mapping lookup
        KOSIS_PROV_MAP = {
            "11": "KR_11", "21": "KR_26", "22": "KR_27", "23": "KR_28",
            "24": "KR_29", "25": "KR_30", "26": "KR_31", "29": "KR_36",
            "31": "KR_41", "32": "KR_51", "33": "KR_43", "34": "KR_44",
            "35": "KR_52", "36": "KR_46", "37": "KR_47", "38": "KR_48",
            "39": "KR_50",
        }

        # (prov_key, clean_name) -> Region
        prov_name_to_region = {}
        for r in Region.objects.filter(region_level="BASIC_LOCAL_GOVERNMENT").prefetch_related("names"):
            if r.region_key.startswith("TEST_"):
                continue
            prov_key = r.region_key[:5]
            for n in r.names.filter(name_type="OFFICIAL"):
                clean = n.name.replace(" ", "").strip()
                prov_name_to_region[(prov_key, clean)] = r

        name_to_region = {}
        for rn in RegionName.objects.filter(is_official=True).select_related("region"):
            clean = rn.name.replace(" ", "").strip()
            name_to_region[clean] = rn.region

        code_to_region = {}
        for ri in RegionIdentifier.objects.filter(code_system="KOSIS_ADM_CD").select_related("region"):
            code_to_region[ri.code] = ri.region

        # Pre-build population map for Net Migration Rate calculation: (region_id, year) -> population
        pop_map = {}
        for obs in Observation.objects.filter(
            indicator__indicator_key="POPULATION",
            status="PUBLISHED",
            superseded_at__isnull=True,
        ).select_related("period"):
            yr = obs.period.period_start.year
            if obs.numeric_value and obs.numeric_value > 0:
                pop_map[(obs.region_id, yr)] = obs.numeric_value

        # Dataset specs:
        # (spec_key, raw_file, itm_matcher, indicator, metric, unit, value_extractor_fn)
        datasets_to_process = [
            (
                "FISCAL_INDEPENDENCE",
                "var/raw/demographics/DT_1YL20921_fiscal_independence.json",
                ind_fiscal,
                metric_rate,
                unit_pct,
                "재정자립도",
                "KOSIS_FISCAL_FAMILY",
            ),
            (
                "ELDERLY_POPULATION_RATIO",
                "var/raw/demographics/DT_1YL20631_elderly_ratio.json",
                ind_elderly,
                metric_rate,
                unit_pct,
                "고령인구비율",
                "KOSIS_DEMOGRAPHY_FAMILY",
            ),
            (
                "TOTAL_FERTILITY_RATE",
                "var/raw/demographics/DT_1B81A17_fertility_rate.json",
                ind_fertility,
                metric_rate,
                unit_person,
                "합계출산율",
                "KOSIS_DEMOGRAPHY_FAMILY",
            ),
            (
                "NET_MIGRATION",
                "var/raw/demographics/DT_1B26001_A01_migration.json",
                ind_migration,
                metric_count,
                unit_person,
                "순이동인구",
                "KOSIS_DEMOGRAPHY_FAMILY",
            ),
        ]

        total_published = 0

        for spec_key, fpath_str, indicator_obj, metric_obj, unit_obj, ds_name, fam_key in datasets_to_process:
            fpath = Path(fpath_str)
            if not fpath.exists():
                self.stderr.write(f"File {fpath} not found! Skipping {spec_key}.")
                continue

            with open(fpath, "r", encoding="utf-8") as f:
                raw_rows = json.load(f)

            self.stdout.write(f"\nProcessing {spec_key} ({len(raw_rows)} rows)...")

            # Filter relevant rows per indicator
            filtered = []
            if spec_key == "FISCAL_INDEPENDENCE":
                # Prefer T20 (개편후); if year < 2014, use T10 (개편전)
                by_dist_year = {}
                for r in raw_rows:
                    if len(r.get("C1", "")) != 5:
                        continue
                    itm = r.get("ITM_ID")
                    yr = r.get("PRD_DE")
                    c1 = r.get("C1")
                    key = (c1, yr)
                    if itm == "T20" and r.get("DT"):
                        by_dist_year[key] = r
                    elif itm == "T10" and key not in by_dist_year:
                        by_dist_year[key] = r
                filtered = list(by_dist_year.values())

            elif spec_key == "ELDERLY_POPULATION_RATIO":
                filtered = [r for r in raw_rows if len(r.get("C1", "")) == 5 and r.get("ITM_ID") == "T10"]

            elif spec_key == "TOTAL_FERTILITY_RATE":
                filtered = [r for r in raw_rows if len(r.get("C1", "")) == 5 and r.get("ITM_ID") == "T1"]

            elif spec_key == "NET_MIGRATION":
                filtered = [r for r in raw_rows if len(r.get("C1", "")) == 5 and r.get("ITM_ID") == "T25"]

            # Map to Region
            valid_rows = []
            region_mappings = {}
            for r in filtered:
                c1 = r.get("C1", "")
                nm = r.get("C1_NM", "").replace(" ", "").strip()
                prov_key = KOSIS_PROV_MAP.get(c1[:2])
                reg = prov_name_to_region.get((prov_key, nm)) or code_to_region.get(c1) or name_to_region.get(nm)
                if reg:
                    valid_rows.append((r, reg, c1, nm))
                    region_mappings[c1] = (reg, nm)

            self.stdout.write(f"  Mapped {len(region_mappings)} districts, {len(valid_rows)} observation rows.")
            if not valid_rows:
                continue

            with transaction.atomic():
                family, _ = DatasetFamily.objects.get_or_create(
                    family_key=fam_key,
                    defaults={"name": ds_name},
                )
                tbl_id = valid_rows[0][0].get("TBL_ID", spec_key)
                dataset, _ = Dataset.objects.get_or_create(
                    source_provider="KOSIS",
                    source_org_id="101",
                    source_table_id=tbl_id,
                    defaults={
                        "dataset_key": f"KOSIS_{spec_key}",
                        "family": family,
                        "source_table_name": ds_name,
                        "geography_level": "BASIC_LOCAL_GOVERNMENT",
                        "frequency": "YEAR",
                    },
                )
                # Retire previous versions if creating new active version
                dataset.versions.filter(status="ACTIVE").exclude(version=2).update(status="RETIRED")

                version, _ = DatasetVersion.objects.get_or_create(
                    dataset=dataset,
                    version=2,
                    defaults={
                        "status": "ACTIVE",
                        "available_period": Range(date(2010, 1, 1), date(2025, 1, 1), "[)"),
                        "metadata_checksum": hashlib.sha256(f"KOSIS_{spec_key}_v2".encode()).hexdigest(),
                        "metadata_snapshot": {"spec": spec_key, "tblId": tbl_id},
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

                distinct_items = set(r.get("ITM_ID") for r, _, _, _ in valid_rows if r.get("ITM_ID"))
                for itm_id in distinct_items:
                    DatasetItemMapping.objects.get_or_create(
                        dataset_version=version,
                        source_item_id=itm_id,
                        defaults={
                            "source_item_name": ds_name,
                            "indicator": indicator_obj,
                            "metric": metric_obj,
                            "source_unit_id": unit_obj.unit_key,
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
                    idempotency_key=f"LIVE_KOSIS_{spec_key}_2010_2024_v2",
                    defaults={
                        "job_type": "FULL_BACKFILL",
                        "status": "RUNNING",
                        "started_at": timezone.now(),
                        "raw_row_count": len(valid_rows),
                    },
                )
                slice_row, _ = IngestionSlice.objects.get_or_create(
                    ingestion_job=job,
                    slice_key=f"SLICE_KOSIS_{spec_key}_2010_2024_v2",
                    defaults={
                        "request_parameters": {
                            "orgId": "101",
                            "tblId": tbl_id,
                            "spec": spec_key,
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
                    row_hash = hashlib.sha256(f"{prd}_{c1}_{spec_key}_{dt_str}".encode("utf-8")).hexdigest()
                    raw_obs_to_create.append(
                        RawObservation(
                            ingestion_job=job,
                            ingestion_slice=slice_row,
                            dataset_version=version,
                            org_id=r.get("ORG_ID", "101"),
                            tbl_id=tbl_id,
                            c1=c1,
                            c1_nm=nm,
                            c2="",
                            c2_nm="",
                            itm_id=r.get("ITM_ID", "ITM_1"),
                            itm_nm=r.get("ITM_NM", ds_name),
                            unit_id=unit_obj.unit_key,
                            unit_nm=unit_obj.symbol,
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
            total_published += pub_res.published_count
            self.stdout.write(f"  Published {pub_res.published_count} observations for {spec_key}.")

            # If NET_MIGRATION, also derive NET_MIGRATION_RATE
            if spec_key == "NET_MIGRATION":
                self.stdout.write("  Calculating derived NET_MIGRATION_RATE (% of population)...")
                now = timezone.now()
                rate_obs_to_create = []
                for obs in Observation.objects.filter(
                    indicator=ind_migration,
                    status="PUBLISHED",
                    superseded_at__isnull=True,
                ).select_related("region", "period"):
                    yr = obs.period.period_start.year
                    pop_val = pop_map.get((obs.region_id, yr))
                    if pop_val and pop_val > 0 and obs.numeric_value is not None:
                        mig_rate = (Decimal(str(obs.numeric_value)) / Decimal(str(pop_val))) * Decimal("100")
                        rate_obs_to_create.append(
                            Observation(
                                region=obs.region,
                                period=obs.period,
                                indicator=ind_migration_rate,
                                metric=metric_rate,
                                numeric_value=round(mig_rate, 2),
                                canonical_unit=unit_pct,
                                raw_value=str(round(mig_rate, 2)),
                                status="PUBLISHED",
                                derived_indicator=deriv_migration_rate,
                                published_at=now,
                            )
                        )
                # Supersede existing active NET_MIGRATION_RATE rows
                Observation.objects.filter(
                    indicator=ind_migration_rate,
                    status="PUBLISHED",
                    superseded_at__isnull=True,
                ).update(status="SUPERSEDED", superseded_at=now)
                Observation.objects.bulk_create(rate_obs_to_create)
                total_published += len(rate_obs_to_create)
                self.stdout.write(f"  Published {len(rate_obs_to_create)} NET_MIGRATION_RATE observations.")

        self.stdout.write(
            self.style.SUCCESS(
                f"\n=== Demographics & Fiscal Indicators Complete! ===\n"
                f"Total Published Observations: {total_published}"
            )
        )
