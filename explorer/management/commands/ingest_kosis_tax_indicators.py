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
    DerivedIndicatorInput,
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
    "TX_11007_A058": ("서울특별시", "KR_11"),
    "TX_11007_A059": ("부산광역시", "KR_26"),
    "TX_11007_A060": ("대구광역시", "KR_27"),
    "TX_11007_A061": ("인천광역시", "KR_28"),
    "TX_11007_A062": ("광주광역시", "KR_29"),
    "TX_11007_A063": ("대전광역시", "KR_30"),
    "TX_11007_A064": ("울산광역시", "KR_31"),
    "TX_11007_A065": ("경기도", "KR_41"),
    "TX_11007_A066": ("강원특별자치도", "KR_51"),
    "TX_11007_A067": ("충청북도", "KR_43"),
    "TX_11007_A068": ("충청남도", "KR_44"),
    "TX_11007_A069": ("전북특별자치도", "KR_52"),
    "TX_11007_A070": ("전라남도", "KR_46"),
    "TX_11007_A071": ("경상북도", "KR_47"),
    "TX_11007_A072": ("경상남도", "KR_48"),
    "TX_11007_A073": ("제주특별자치도", "KR_50"),
}


class Command(BaseCommand):
    help = "Ingest official 2010-2024 local tax indicators (Total, Property, Income) for all nationwide districts"

    def handle(self, *args, **options):
        self.stdout.write("Starting nationwide local tax indicators ingestion (Total, Property, Income)...")

        # 1. Base Setup
        unit_krw, _ = Unit.objects.get_or_create(
            unit_key="KRW",
            defaults={"name": "원", "dimension": "CURRENCY", "symbol": "원"},
        )
        unit_thousand_krw, _ = Unit.objects.get_or_create(
            unit_key="THOUSAND_KRW",
            defaults={"name": "천원", "dimension": "CURRENCY", "symbol": "천원"},
        )
        metric_col, _ = Metric.objects.get_or_create(
            metric_key="COLLECTED",
            defaults={"name": "징수액", "description": "실제 징수된 지방세 세입 결산액"},
        )
        metric_pop = Metric.objects.filter(metric_key="POPULATION_COUNT").first()
        tax_owner_basic, _ = TaxOwner.objects.get_or_create(
            tax_owner_key="BASIC_LOCAL_GOV",
            defaults={"name": "시·군·구청장", "jurisdiction_level": "BASIC_LOCAL_GOVERNMENT"},
        )
        family, _ = DatasetFamily.objects.get_or_create(
            family_key="LOCAL_TAX_FAMILY",
            defaults={"name": "지방세 부과징수실적", "description": "기초자치단체별 지방세 세목별 부과징수 결산"},
        )
        ind_pop = Indicator.objects.filter(indicator_key="POPULATION").first()

        # Target tax definitions: (indicator_key, name, desc, per_capita_key, per_capita_name)
        tax_defs = [
            (
                "LOCAL_TAX_TOTAL",
                "지방세 총세입",
                "기초자치단체 관할 구역에서 징수된 지방세 총 결산액(합계)",
                "LOCAL_TAX_TOTAL_PER_CAPITA",
                "1인당 지방세",
            ),
            (
                "PROPERTY_TAX",
                "재산세",
                "토지, 주택, 건축물, 선박, 항공기 보유에 부과되는 재산세 세입액",
                "PROPERTY_TAX_PER_CAPITA",
                "1인당 재산세",
            ),
            (
                "LOCAL_INCOME_TAX",
                "지방소득세",
                "개인 및 법인의 소득에 부과되는 지방소득세 총 세입액",
                "LOCAL_INCOME_TAX_PER_CAPITA",
                "1인당 지방소득세",
            ),
        ]

        tax_indicators = {}
        for ind_key, name, desc, per_cap_key, per_cap_name in tax_defs:
            ind_obj, _ = Indicator.objects.get_or_create(
                indicator_key=ind_key,
                defaults={
                    "name": name,
                    "description": desc,
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
            tax_indicators[ind_key] = ind_obj

            # Register derived per capita indicator
            ind_per_cap, _ = Indicator.objects.get_or_create(
                indicator_key=per_cap_key,
                defaults={
                    "name": per_cap_name,
                    "description": f"주민 1인당 {name} 결산액 (총액 / 주민등록인구)",
                    "category": "TAX",
                    "canonical_unit": unit_krw,
                    "value_type": "CURRENCY",
                    "aggregation_method": "AVG",
                    "geography_requirement": "MANDATORY",
                    "default_frequency": "YEAR",
                    "source_type": "DERIVED",
                    "status": "ACTIVE",
                },
            )

            # Register DerivedIndicator rule
            if ind_pop and metric_pop:
                deriv_obj, _ = DerivedIndicator.objects.get_or_create(
                    indicator=ind_per_cap,
                    version=1,
                    defaults={
                        "evaluator_key": "PER_CAPITA",
                        "parameters": {"formula": "TAX / POPULATION"},
                        "output_unit": unit_krw,
                        "checksum": hashlib.sha256(f"DERIV_{per_cap_key}_v1".encode()).hexdigest(),
                        "status": "ACTIVE",
                    },
                )
                DerivedIndicatorInput.objects.get_or_create(
                    derived_indicator=deriv_obj,
                    role="TAX",
                    defaults={"input_indicator": ind_obj, "input_metric": metric_col},
                )
                DerivedIndicatorInput.objects.get_or_create(
                    derived_indicator=deriv_obj,
                    role="POPULATION",
                    defaults={"input_indicator": ind_pop, "input_metric": metric_pop},
                )

        total_published = 0
        total_derived = 0

        # Process each province file
        for tbl_id, (prov_name, reg_prefix) in PROVINCE_METADATA.items():
            fpath = Path(f"var/raw/national_tax/{tbl_id}.json")
            if not fpath.exists():
                self.stderr.write(f"File {fpath} not found. Skipping.")
                continue

            with open(fpath, "r", encoding="utf-8") as f:
                raw_data = json.load(f)

            if not isinstance(raw_data, list):
                continue

            # Identify distinct districts in C1 and map to geo.Region
            c1_to_region = {}
            for r in raw_data:
                c1 = r.get("C1")
                nm = r.get("C1_NM", "").replace(" ", "").strip()
                if c1 in c1_to_region or nm in ("합계", "총계", "시세", "도세", "군세", "구세") or "본청" in nm:
                    continue

                rn = RegionName.objects.filter(
                    name=nm,
                    region__region_key__startswith=reg_prefix,
                    is_official=True,
                ).first()
                if not rn:
                    rn = RegionName.objects.filter(name=nm, is_official=True).first()

                if rn:
                    c1_to_region[c1] = (rn.region, nm)

            self.stdout.write(f"[{tbl_id}] {prov_name}: mapped {len(c1_to_region)} districts.")
            if not c1_to_region:
                continue

            # Ingest each of the 3 tax types
            for ind_key, name, desc, per_cap_key, per_cap_name in tax_defs:
                ind_obj = tax_indicators[ind_key]

                # Extract and aggregate rows
                # For LOCAL_TAX_TOTAL: C2 == '15110AD600'
                # For PROPERTY_TAX: C2_NM == '재산세'
                # For LOCAL_INCOME_TAX: C2_NM == '지방소득세'
                agg_rows = {}  # (prd_de, c1) -> sum(dt)
                sample_meta = {}

                for r in raw_data:
                    c1 = r.get("C1")
                    if c1 not in c1_to_region:
                        continue
                    c2_nm = (r.get("C2_NM") or "").strip()
                    c2 = r.get("C2", "")

                    is_match = False
                    if ind_key == "LOCAL_TAX_TOTAL" and c2 == "15110AD600":
                        is_match = True
                    elif ind_key == "PROPERTY_TAX" and c2_nm == "재산세":
                        is_match = True
                    elif ind_key == "LOCAL_INCOME_TAX" and c2_nm == "지방소득세":
                        is_match = True

                    if is_match:
                        prd = r.get("PRD_DE")
                        key = (prd, c1)
                        try:
                            val = Decimal(str(r.get("DT", "0") or "0"))
                        except Exception:
                            val = Decimal("0")
                        agg_rows[key] = agg_rows.get(key, Decimal("0")) + val
                        if key not in sample_meta:
                            sample_meta[key] = r

                if not agg_rows:
                    continue

                with transaction.atomic():
                    dataset, _ = Dataset.objects.get_or_create(
                        source_provider="KOSIS",
                        source_org_id="110",
                        source_table_id=f"{tbl_id}_{ind_key}",
                        defaults={
                            "dataset_key": f"KOSIS_{tbl_id}_{ind_key}",
                            "family": family,
                            "source_table_name": f"{prov_name} {name}",
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
                            "metadata_checksum": hashlib.sha256(f"KOSIS_{tbl_id}_{ind_key}_v1".encode()).hexdigest(),
                            "metadata_snapshot": {"tableId": tbl_id, "orgId": "110", "indicator": ind_key},
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

                    # Item Mapping
                    DatasetItemMapping.objects.get_or_create(
                        dataset_version=version,
                        source_item_id=f"ITEM_{ind_key}",
                        defaults={
                            "source_item_name": name,
                            "indicator": ind_obj,
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

                    # Ingestion Job
                    job, _ = IngestionJob.objects.get_or_create(
                        dataset_version=version,
                        idempotency_key=f"LIVE_KOSIS_{tbl_id}_{ind_key}_2010_2024",
                        defaults={
                            "job_type": "FULL_BACKFILL",
                            "status": "RUNNING",
                            "started_at": timezone.now(),
                            "raw_row_count": len(agg_rows),
                        },
                    )
                    slice_row, _ = IngestionSlice.objects.get_or_create(
                        ingestion_job=job,
                        slice_key=f"SLICE_KOSIS_{tbl_id}_{ind_key}_2010_2024",
                        defaults={
                            "request_parameters": {
                                "orgId": "110",
                                "tblId": tbl_id,
                                "indicator": ind_key,
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
                    for (prd, c1), total_val in agg_rows.items():
                        r_sample = sample_meta[(prd, c1)]
                        row_hash = hashlib.sha256(
                            f"{prd}_{c1}_{ind_key}_{total_val}".encode("utf-8")
                        ).hexdigest()
                        raw_obs_to_create.append(
                            RawObservation(
                                ingestion_job=job,
                                ingestion_slice=slice_row,
                                dataset_version=version,
                                org_id="110",
                                tbl_id=tbl_id,
                                c1=c1,
                                c1_nm=r_sample.get("C1_NM", ""),
                                c2=r_sample.get("C2", ""),
                                c2_nm=name,
                                itm_id=f"ITEM_{ind_key}",
                                itm_nm=name,
                                unit_id="THOUSAND_KRW",
                                unit_nm="천원",
                                prd_se="Y",
                                prd_de=prd,
                                dt=str(total_val),
                                raw_payload={"aggregated_sum": str(total_val), "sample": r_sample},
                                source_row_hash=row_hash,
                                quality_status="VALIDATED",
                            )
                        )

                    RawObservation.objects.bulk_create(raw_obs_to_create)
                    job.raw_row_count = len(raw_obs_to_create)
                    job.save(update_fields=["raw_row_count"])

                # Normalize & Publish
                normalize_job(job.id)
                pub_res = publish_job(job.id)
                total_published += pub_res.published_count
                total_derived += pub_res.derived_count
                self.stdout.write(
                    f"  [{ind_key}] Published {pub_res.published_count} rows, derived {pub_res.derived_count} per-capita rows."
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"\n=== Tax Indicators Ingestion Complete! ===\n"
                f"Total Published Tax Rows: {total_published}\n"
                f"Total Derived Per-Capita Rows: {total_derived}"
            )
        )
