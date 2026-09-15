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
    RegionName,
    Unit,
)


class Command(BaseCommand):
    help = "Ingest official 2016-2023 National Tax Service (NTS) Year-End Tax Settlement datasets from KOSIS (DT_133001N_4215, DT_133001N_4214)"

    def handle(self, *args, **options):
        fpath_res = Path("var/raw/income/DT_133001N_4215_residence_income.json")
        fpath_work = Path("var/raw/income/DT_133001N_4214_workplace_income.json")

        if not fpath_res.exists() or not fpath_work.exists():
            self.stderr.write("Raw data files not found in var/raw/income/")
            return

        with open(fpath_res, "r", encoding="utf-8") as f:
            raw_res = json.load(f)
        with open(fpath_work, "r", encoding="utf-8") as f:
            raw_work = json.load(f)

        self.stdout.write(f"Loaded {len(raw_res)} residence rows, {len(raw_work)} workplace rows.")

        # 1. Ensure Units & Metrics
        unit_krw, _ = Unit.objects.get_or_create(
            unit_key="KRW",
            defaults={"name": "원", "dimension": "CURRENCY", "symbol": "원"},
        )
        unit_person, _ = Unit.objects.get_or_create(
            unit_key="PERSON",
            defaults={"name": "명", "dimension": "COUNT", "symbol": "명"},
        )
        metric_amount, _ = Metric.objects.get_or_create(
            metric_key="AMOUNT",
            defaults={"name": "금액", "description": "통화 금액 (총액 또는 평균)"},
        )
        metric_count, _ = Metric.objects.get_or_create(
            metric_key="COUNT",
            defaults={"name": "인원/건수", "description": "총 수량"},
        )

        # 2. Indicators & Derivations
        ind_avg_wage, _ = Indicator.objects.get_or_create(
            indicator_key="AVERAGE_WAGE",
            defaults={
                "name": "주민 1인당 평균 연봉",
                "description": "국세청 근로소득 연말정산 신고 기준 관내 거주 근로자 1인당 평균 총급여액 (주민 실질 소득)",
                "category": "ECONOMY",
                "canonical_unit": unit_krw,
                "value_type": "CURRENCY",
                "aggregation_method": "AVG",
                "geography_requirement": "MANDATORY",
                "default_frequency": "YEAR",
                "source_type": "OFFICIAL",
                "status": "ACTIVE",
            },
        )
        deriv_avg_wage, _ = DerivedIndicator.objects.get_or_create(
            indicator=ind_avg_wage,
            version=1,
            defaults={"evaluator_key": "RATIO", "output_unit": unit_krw, "status": "ACTIVE", "checksum": "AVG_WAGE_V1"},
        )

        ind_corp_payroll, _ = Indicator.objects.get_or_create(
            indicator_key="CORPORATE_TOTAL_PAYROLL",
            defaults={
                "name": "사업장 총급여액",
                "description": "관내 기업 및 사업장(원천징수의무자)이 소속 근로자에게 지급한 총급여액 (일자리 경제 규모)",
                "category": "ECONOMY",
                "canonical_unit": unit_krw,
                "value_type": "CURRENCY",
                "aggregation_method": "SUM",
                "geography_requirement": "MANDATORY",
                "default_frequency": "YEAR",
                "source_type": "OFFICIAL",
                "status": "ACTIVE",
            },
        )
        deriv_corp_payroll, _ = DerivedIndicator.objects.get_or_create(
            indicator=ind_corp_payroll,
            version=1,
            defaults={"evaluator_key": "SCALE", "output_unit": unit_krw, "status": "ACTIVE", "checksum": "CORP_PAYROLL_V1"},
        )

        ind_withholding, _ = Indicator.objects.get_or_create(
            indicator_key="WITHHOLDING_TAX",
            defaults={
                "name": "원천징수세액",
                "description": "관내 사업장(원천징수의무자)에서 원천징수하여 납부한 근로소득 결정세액",
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
        deriv_withholding, _ = DerivedIndicator.objects.get_or_create(
            indicator=ind_withholding,
            version=1,
            defaults={"evaluator_key": "SCALE", "output_unit": unit_krw, "status": "ACTIVE", "checksum": "WITHHOLDING_TAX_V1"},
        )

        ind_workers, _ = Indicator.objects.get_or_create(
            indicator_key="WORKPLACE_WAGE_EARNERS",
            defaults={
                "name": "사업장 근로자수",
                "description": "해당 시·군·구 소재 사업장(원천징수의무자)에 소속된 연말정산 근로자수",
                "category": "ECONOMY",
                "canonical_unit": unit_person,
                "value_type": "COUNT",
                "aggregation_method": "SUM",
                "geography_requirement": "MANDATORY",
                "default_frequency": "YEAR",
                "source_type": "OFFICIAL",
                "status": "ACTIVE",
            },
        )
        deriv_workers, _ = DerivedIndicator.objects.get_or_create(
            indicator=ind_workers,
            version=1,
            defaults={"evaluator_key": "IDENTITY", "output_unit": unit_person, "status": "ACTIVE", "checksum": "WORKERS_V1"},
        )

        # 3. District Mapping
        name_to_region = {}
        for rn in RegionName.objects.filter(is_official=True).select_related("region"):
            clean = rn.name.replace(" ", "").strip()
            name_to_region[clean] = rn.region

        def resolve_region(c1_code: str, c1_nm: str) -> Region | None:
            clean = c1_nm.replace(" ", "").strip()
            if clean == "미추홀구(남구)":
                clean = "미추홀구"
            return name_to_region.get(clean)

        # 4. Process DT_133001N_4215 (주소지별 - 거주민 소득)
        self.stdout.write("Processing residence income dataset (DT_133001N_4215)...")
        res_data = {}  # (reg, year) -> {"earners": N, "payroll_mil": M}
        for r in raw_res:
            c1 = r.get("C1", "")
            if len(c1) != 5:  # Only municipal districts
                continue
            nm = r.get("C1_NM", "")
            reg = resolve_region(c1, nm)
            if not reg:
                continue
            
            prd = r.get("PRD_DE", "")
            if not prd or not prd.isdigit():
                continue
            yr = int(prd)
            
            c2_nm = r.get("C2_NM", "")
            itm_nm = r.get("ITM_NM", "")
            dt_str = str(r.get("DT", "") or "").strip()
            if not dt_str or dt_str in ("-", "…", "null"):
                continue

            try:
                dt_val = Decimal(dt_str)
            except Exception:
                continue

            key = (reg, yr)
            if key not in res_data:
                res_data[key] = {}

            if c2_nm == "과세대상근로소득(총급여)":
                if itm_nm == "인원":
                    res_data[key]["earners"] = dt_val
                elif itm_nm == "금액":
                    res_data[key]["payroll_mil"] = dt_val

        # 5. Process DT_133001N_4214 (원천징수지별 - 사업장/일자리/세액)
        self.stdout.write("Processing workplace income dataset (DT_133001N_4214)...")
        work_data = {}  # (reg, year) -> {"payroll_mil": M, "earners": N, "tax_mil": T}
        for r in raw_work:
            c1 = r.get("C1", "")
            if len(c1) != 5:
                continue
            nm = r.get("C1_NM", "")
            reg = resolve_region(c1, nm)
            if not reg:
                continue

            prd = r.get("PRD_DE", "")
            if not prd or not prd.isdigit():
                continue
            yr = int(prd)

            c2_nm = r.get("C2_NM", "")
            itm_nm = r.get("ITM_NM", "")
            dt_str = str(r.get("DT", "") or "").strip()
            if not dt_str or dt_str in ("-", "…", "null"):
                continue

            try:
                dt_val = Decimal(dt_str)
            except Exception:
                continue

            key = (reg, yr)
            if key not in work_data:
                work_data[key] = {}

            if c2_nm == "과세대상근로소득(총급여)":
                if itm_nm == "금액":
                    work_data[key]["payroll_mil"] = dt_val
                elif itm_nm == "인원":
                    work_data[key]["earners"] = dt_val
            elif c2_nm == "결정세액":
                if itm_nm == "금액":
                    work_data[key]["tax_mil"] = dt_val

        # 6. Preload Periods
        periods_by_year = {
            p.period_start.year: p
            for p in Period.objects.filter(period_type="YEAR")
        }

        # 7. Build Observations
        obs_to_create = []
        target_inds = [ind_avg_wage, ind_corp_payroll, ind_withholding, ind_workers]

        with transaction.atomic():
            Observation.objects.filter(
                indicator__in=target_inds,
                status="PUBLISHED",
            ).delete()

            # (A) Resident Average Wage
            for (reg, yr), vals in res_data.items():
                period = periods_by_year.get(yr)
                if not period:
                    continue
                earners = vals.get("earners")
                payroll_mil = vals.get("payroll_mil")
                if earners and earners > 0 and payroll_mil is not None:
                    avg_wage = Decimal(round((payroll_mil * Decimal(1_000_000)) / earners))
                    obs_to_create.append(
                        Observation(
                            region=reg,
                            period=period,
                            indicator=ind_avg_wage,
                            metric=metric_amount,
                            derived_indicator=deriv_avg_wage,
                            numeric_value=avg_wage,
                            canonical_unit=unit_krw,
                            raw_value=str(avg_wage),
                            status="PUBLISHED",
                            quality_status="PASSED",
                        )
                    )

            # (B) Workplace Corporate Payroll, Workers, Withholding Tax
            for (reg, yr), vals in work_data.items():
                period = periods_by_year.get(yr)
                if not period:
                    continue

                payroll_mil = vals.get("payroll_mil")
                if payroll_mil is not None:
                    corp_payroll = payroll_mil * Decimal(1_000_000)
                    obs_to_create.append(
                        Observation(
                            region=reg,
                            period=period,
                            indicator=ind_corp_payroll,
                            metric=metric_amount,
                            derived_indicator=deriv_corp_payroll,
                            numeric_value=corp_payroll,
                            canonical_unit=unit_krw,
                            raw_value=str(corp_payroll),
                            status="PUBLISHED",
                            quality_status="PASSED",
                        )
                    )

                earners = vals.get("earners")
                if earners is not None:
                    obs_to_create.append(
                        Observation(
                            region=reg,
                            period=period,
                            indicator=ind_workers,
                            metric=metric_count,
                            derived_indicator=deriv_workers,
                            numeric_value=earners,
                            canonical_unit=unit_person,
                            raw_value=str(earners),
                            status="PUBLISHED",
                            quality_status="PASSED",
                        )
                    )

                tax_mil = vals.get("tax_mil")
                if tax_mil is not None:
                    withholding = tax_mil * Decimal(1_000_000)
                    obs_to_create.append(
                        Observation(
                            region=reg,
                            period=period,
                            indicator=ind_withholding,
                            metric=metric_amount,
                            derived_indicator=deriv_withholding,
                            numeric_value=withholding,
                            canonical_unit=unit_krw,
                            raw_value=str(withholding),
                            status="PUBLISHED",
                            quality_status="PASSED",
                        )
                    )

            Observation.objects.bulk_create(obs_to_create, batch_size=2000)

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully ingested and published {len(obs_to_create)} observations across 4 income indicators (2016-2023)!"
            )
        )
