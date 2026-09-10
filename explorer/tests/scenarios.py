from dataclasses import dataclass
from datetime import date
from decimal import Decimal
import json
from pathlib import Path
from typing import Sequence
from psycopg.types.range import Range

from explorer.boundaries import build_boundary_set
from explorer.models import (
    BoundarySet,
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
    Metric,
    Period,
    Region,
    RegionIdentifier,
    RegionName,
    TaxOwner,
    Unit,
)
from explorer.pipeline.collector import collect_job
from explorer.pipeline.normalizer import normalize_job
from explorer.pipeline.publisher import publish_job
from explorer.tests.fakes import FakeKosisClient


FIXTURES = Path(__file__).parent / "fixtures"


@dataclass
class SyntheticMvpScenario:
    years: Sequence[int]
    tax_job: IngestionJob
    pop_job: IngestionJob
    tax_client: FakeKosisClient
    pop_client: FakeKosisClient

    def run_pipeline(self):
        # 1. Collect
        collect_job(self.tax_job.id, self.tax_client)
        collect_job(self.pop_job.id, self.pop_client)

        # 2. Normalize
        normalize_job(self.tax_job.id)
        normalize_job(self.pop_job.id)

        # 3. Publish & Derive
        publish_job(self.tax_job.id)
        publish_job(self.pop_job.id)


def load_synthetic_mvp(years: Sequence[int] = range(2010, 2025)) -> SyntheticMvpScenario:
    # 1. Units
    unit_krw, _ = Unit.objects.get_or_create(
        unit_key="KRW_THOUSAND",
        defaults={"name": "천원", "dimension": "CURRENCY", "symbol": "천원"},
    )
    unit_person, _ = Unit.objects.get_or_create(
        unit_key="PERSON",
        defaults={"name": "명", "dimension": "COUNT", "symbol": "명"},
    )
    unit_per_cap, _ = Unit.objects.get_or_create(
        unit_key="KRW_PER_PERSON",
        defaults={"name": "천원/명", "dimension": "RATIO", "symbol": "천원/명"},
    )

    # 2. Metrics & TaxOwners
    metric_col, _ = Metric.objects.get_or_create(
        metric_key="COLLECTED",
        defaults={"name": "징수액", "description": "원천 수납액"},
    )
    metric_pop, _ = Metric.objects.get_or_create(
        metric_key="POPULATION_COUNT",
        defaults={"name": "인구수", "description": "주민등록 인구수"},
    )
    tax_owner, _ = TaxOwner.objects.get_or_create(
        tax_owner_key="BASIC_LOCAL_GOV",
        defaults={"name": "시군구세"},
    )

    # 3. Indicators
    ind_tax, _ = Indicator.objects.get_or_create(
        indicator_key="ACQUISITION_TAX",
        defaults={
            "name": "취득세",
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
    ind_per_cap, _ = Indicator.objects.get_or_create(
        indicator_key="ACQUISITION_TAX_PER_CAPITA",
        defaults={
            "name": "1인당 취득세",
            "category": "DERIVED",
            "canonical_unit": unit_per_cap,
            "value_type": "RATIO",
            "aggregation_method": "AVG",
            "geography_requirement": "MANDATORY",
            "default_frequency": "YEAR",
            "source_type": "DERIVED",
            "status": "ACTIVE",
        },
    )

    # 4. Derived indicator configuration
    derived_ind, _ = DerivedIndicator.objects.get_or_create(
        indicator=ind_per_cap,
        defaults={
            "version": 1,
            "evaluator_key": "PER_CAPITA",
            "parameters": {"formula": "ACQUISITION_TAX / POPULATION"},
            "output_unit": unit_per_cap,
            "status": "ACTIVE",
            "checksum": "d" * 64,
        },
    )
    DerivedIndicatorInput.objects.get_or_create(
        derived_indicator=derived_ind,
        role="TAX",
        defaults={"input_indicator": ind_tax, "input_metric": metric_col},
    )
    DerivedIndicatorInput.objects.get_or_create(
        derived_indicator=derived_ind,
        role="POPULATION",
        defaults={"input_indicator": ind_pop, "input_metric": metric_pop},
    )

    # 5. Regions
    reg_a, _ = Region.objects.get_or_create(
        region_key="TEST_REGION_A",
        defaults={
            "region_level": "BASIC_LOCAL_GOVERNMENT",
            "region_kind": "AUTONOMOUS_DISTRICT",
            "valid_period": Range(date(2010, 1, 1), None, "[)"),
            "status": "ACTIVE",
        },
    )
    RegionName.objects.get_or_create(
        region=reg_a,
        name="지역A",
        valid_period=Range(date(2010, 1, 1), None, "[)"),
        defaults={"is_official": True},
    )
    RegionIdentifier.objects.get_or_create(
        region=reg_a,
        code_system="SGIS_ADM_CD",
        code="TEST_FEATURE_A",
        valid_period=Range(date(2010, 1, 1), None, "[)"),
        defaults={"source": "SYNTHETIC_SGIS"},
    )

    reg_b, _ = Region.objects.get_or_create(
        region_key="TEST_REGION_B",
        defaults={
            "region_level": "BASIC_LOCAL_GOVERNMENT",
            "region_kind": "AUTONOMOUS_DISTRICT",
            "valid_period": Range(date(2010, 1, 1), None, "[)"),
            "status": "ACTIVE",
        },
    )
    RegionName.objects.get_or_create(
        region=reg_b,
        name="지역B",
        valid_period=Range(date(2010, 1, 1), None, "[)"),
        defaults={"is_official": True},
    )
    RegionIdentifier.objects.get_or_create(
        region=reg_b,
        code_system="SGIS_ADM_CD",
        code="TEST_FEATURE_B",
        valid_period=Range(date(2010, 1, 1), None, "[)"),
        defaults={"source": "SYNTHETIC_SGIS"},
    )

    # 6. Boundary sets & Periods
    for y in years:
        boundary_geojson = {
            "type": "FeatureCollection",
            "year": y,
            "features": [
                {
                    "type": "Feature",
                    "properties": {"adm_cd": "TEST_FEATURE_A", "adm_nm": "지역A"},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[126.97, 37.56], [126.98, 37.56], [126.98, 37.57], [126.97, 37.57], [126.97, 37.56]]],
                    },
                },
                {
                    "type": "Feature",
                    "properties": {"adm_cd": "TEST_FEATURE_B", "adm_nm": "지역B"},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[127.00, 37.56], [127.01, 37.56], [127.01, 37.57], [127.00, 37.57], [127.00, 37.56]]],
                    },
                },
            ],
        }
        raw_bytes = json.dumps(boundary_geojson).encode("utf-8")
        build_boundary_set(year=y, raw_geojson=raw_bytes, source_crs="EPSG:4326")

        bset = BoundarySet.objects.get(reference_year=y)
        Period.objects.get_or_create(
            period_key=f"Y_{y}",
            defaults={
                "period_type": "YEAR",
                "period_start": date(y, 1, 1),
                "period_end": date(y, 12, 31),
                "boundary_set": bset,
            },
        )

    # 7. Dataset Catalog for Acquisition Tax
    tax_family, _ = DatasetFamily.objects.get_or_create(
        family_key="LOCAL_TAX_FAMILY",
        defaults={"name": "지방세 결산"},
    )
    tax_dataset, _ = Dataset.objects.get_or_create(
        dataset_key="LOCAL_ACQUISITION_TAX",
        defaults={
            "family": tax_family,
            "source_provider": "KOSIS",
            "source_org_id": "TEST_ORG",
            "source_table_id": "TBL_TAX",
            "source_table_name": "기초단체별 취득세 결산",
            "geography_level": "BASIC_LOCAL_GOVERNMENT",
            "frequency": "YEAR",
        },
    )
    tax_version, _ = DatasetVersion.objects.get_or_create(
        dataset=tax_dataset,
        version=1,
        defaults={
            "status": "ACTIVE",
            "metadata_checksum": "a" * 64,
            "metadata_snapshot": {"table": "TBL_TAX"},
        },
    )
    DatasetDimension.objects.get_or_create(
        dataset_version=tax_version,
        semantic_dimension="REGION",
        defaults={
            "source_dimension": "C1",
            "required": True,
            "selection_strategy": "ALL_MAPPED",
            "ordinal": 1,
        },
    )
    DatasetItemMapping.objects.get_or_create(
        dataset_version=tax_version,
        source_item_id="TAX_COL",
        defaults={
            "source_item_name": "취득세",
            "indicator": ind_tax,
            "metric": metric_col,
            "tax_owner": tax_owner,
            "source_unit_id": "KRW_THOUSAND",
            "valid_period": Range(date(2010, 1, 1), None, "[)"),
            "comparability_status": "COMPARABLE",
        },
    )
    DatasetRegionMapping.objects.get_or_create(
        dataset_version=tax_version,
        source_dimension="C1",
        source_region_code="REG_A",
        defaults={
            "source_region_name": "지역A",
            "region": reg_a,
            "valid_period": Range(date(2010, 1, 1), None, "[)"),
            "mapping_method": "DIRECT",
        },
    )
    DatasetRegionMapping.objects.get_or_create(
        dataset_version=tax_version,
        source_dimension="C1",
        source_region_code="REG_B",
        defaults={
            "source_region_name": "지역B",
            "region": reg_b,
            "valid_period": Range(date(2010, 1, 1), None, "[)"),
            "mapping_method": "DIRECT",
        },
    )

    # 8. Dataset Catalog for Population
    pop_family, _ = DatasetFamily.objects.get_or_create(
        family_key="POPULATION_FAMILY",
        defaults={"name": "주민등록인구 현황"},
    )
    pop_dataset, _ = Dataset.objects.get_or_create(
        dataset_key="RESIDENT_POPULATION",
        defaults={
            "family": pop_family,
            "source_provider": "KOSIS",
            "source_org_id": "TEST_ORG",
            "source_table_id": "TBL_POP",
            "source_table_name": "주민등록인구통계",
            "geography_level": "BASIC_LOCAL_GOVERNMENT",
            "frequency": "YEAR",
        },
    )
    pop_version, _ = DatasetVersion.objects.get_or_create(
        dataset=pop_dataset,
        version=1,
        defaults={
            "status": "ACTIVE",
            "metadata_checksum": "b" * 64,
            "metadata_snapshot": {"table": "TBL_POP"},
        },
    )
    DatasetDimension.objects.get_or_create(
        dataset_version=pop_version,
        semantic_dimension="REGION",
        defaults={
            "source_dimension": "C1",
            "required": True,
            "selection_strategy": "ALL_MAPPED",
            "ordinal": 1,
        },
    )
    DatasetItemMapping.objects.get_or_create(
        dataset_version=pop_version,
        source_item_id="POP_TOTAL",
        defaults={
            "source_item_name": "총인구",
            "indicator": ind_pop,
            "metric": metric_pop,
            "tax_owner": None,
            "source_unit_id": "PERSON",
            "valid_period": Range(date(2010, 1, 1), None, "[)"),
            "comparability_status": "COMPARABLE",
        },
    )
    DatasetRegionMapping.objects.get_or_create(
        dataset_version=pop_version,
        source_dimension="C1",
        source_region_code="REG_A",
        defaults={
            "source_region_name": "지역A",
            "region": reg_a,
            "valid_period": Range(date(2010, 1, 1), None, "[)"),
            "mapping_method": "DIRECT",
        },
    )
    DatasetRegionMapping.objects.get_or_create(
        dataset_version=pop_version,
        source_dimension="C1",
        source_region_code="REG_B",
        defaults={
            "source_region_name": "지역B",
            "region": reg_b,
            "valid_period": Range(date(2010, 1, 1), None, "[)"),
            "mapping_method": "DIRECT",
        },
    )

    # 9. Ingestion Jobs and Slices
    tax_job = IngestionJob.objects.create(
        dataset_version=tax_version,
        job_type="FULL_BACKFILL",
        status="RUNNING",
        idempotency_key="MVP_SYNTHETIC_TAX_JOB",
    )
    tax_job.slices.create(
        slice_key="MVP_TAX_SLICE_1",
        request_parameters={"orgId": "TEST_ORG", "tblId": "TBL_TAX", "startPrdDe": "2010", "endPrdDe": "2024"},
        status="PENDING",
    )

    pop_job = IngestionJob.objects.create(
        dataset_version=pop_version,
        job_type="FULL_BACKFILL",
        status="RUNNING",
        idempotency_key="MVP_SYNTHETIC_POP_JOB",
    )
    pop_job.slices.create(
        slice_key="MVP_POP_SLICE_1",
        request_parameters={"orgId": "TEST_ORG", "tblId": "TBL_POP", "startPrdDe": "2010", "endPrdDe": "2024"},
        status="PENDING",
    )

    tax_client = FakeKosisClient.from_fixture("mvp_acquisition_tax.json")
    pop_client = FakeKosisClient.from_fixture("mvp_population.json")

    return SyntheticMvpScenario(
        years=years,
        tax_job=tax_job,
        pop_job=pop_job,
        tax_client=tax_client,
        pop_client=pop_client,
    )
