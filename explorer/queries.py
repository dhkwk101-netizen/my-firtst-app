from datetime import date
from decimal import Decimal
from typing import Any
from django.db.models import F
from explorer.models import (
    BoundaryFeature,
    BoundarySet,
    Indicator,
    Observation,
    Region,
    RegionName,
)


PROVINCE_MAP = {
    "KR_11": {"name": "서울특별시", "short": "서울", "lat": 37.5665, "lng": 126.9780, "zoom": 11},
    "KR_26": {"name": "부산광역시", "short": "부산", "lat": 35.1796, "lng": 129.0756, "zoom": 11},
    "KR_27": {"name": "대구광역시", "short": "대구", "lat": 35.8714, "lng": 128.6014, "zoom": 11},
    "KR_28": {"name": "인천광역시", "short": "인천", "lat": 37.4563, "lng": 126.7052, "zoom": 10},
    "KR_29": {"name": "광주광역시", "short": "광주", "lat": 35.1595, "lng": 126.8526, "zoom": 11},
    "KR_30": {"name": "대전광역시", "short": "대전", "lat": 36.3504, "lng": 127.3845, "zoom": 11},
    "KR_31": {"name": "울산광역시", "short": "울산", "lat": 35.5384, "lng": 129.3114, "zoom": 11},
    "KR_36": {"name": "세종특별자치시", "short": "세종", "lat": 36.4800, "lng": 127.2890, "zoom": 11},
    "KR_41": {"name": "경기도", "short": "경기", "lat": 37.4138, "lng": 127.5183, "zoom": 9},
    "KR_43": {"name": "충청북도", "short": "충북", "lat": 36.6357, "lng": 127.4912, "zoom": 9},
    "KR_44": {"name": "충청남도", "short": "충남", "lat": 36.5184, "lng": 126.8000, "zoom": 9},
    "KR_46": {"name": "전라남도", "short": "전남", "lat": 34.8679, "lng": 126.9910, "zoom": 8},
    "KR_47": {"name": "경상북도", "short": "경북", "lat": 36.5760, "lng": 128.5056, "zoom": 8},
    "KR_48": {"name": "경상남도", "short": "경남", "lat": 35.4606, "lng": 128.2132, "zoom": 9},
    "KR_50": {"name": "제주특별자치도", "short": "제주", "lat": 33.4996, "lng": 126.5312, "zoom": 10},
    "KR_51": {"name": "강원특별자치도", "short": "강원", "lat": 37.8228, "lng": 128.1555, "zoom": 8},
    "KR_52": {"name": "전북특별자치도", "short": "전북", "lat": 35.7175, "lng": 127.1530, "zoom": 9},
}


def query_regions() -> list[dict[str, Any]]:
    regions = Region.objects.filter(status="ACTIVE").order_by("region_key")
    out = []
    for r in regions:
        # Get official or latest name
        name_obj = r.names.filter(is_official=True).first() or r.names.first()
        name_str = name_obj.name if name_obj else r.region_key
        prefix = r.region_key[:5]
        prov = PROVINCE_MAP.get(prefix)
        prov_name = prov["name"] if prov else None
        short_prov = prov["short"] if prov else None
        full_name = f"{prov_name} {name_str}" if prov_name else name_str

        out.append(
            {
                "regionKey": r.region_key,
                "name": name_str,
                "fullName": full_name,
                "provinceCode": prefix if prov else None,
                "provinceName": prov_name,
                "shortProvinceName": short_prov,
                "level": r.region_level,
                "kind": r.region_kind,
            }
        )
    return out



CATEGORY_LABELS = {
    "TAX": "🏛️ 지방세 및 부유도",
    "FISCAL": "💰 지자체 재정",
    "DEMOGRAPHY": "👥 인구 동향 및 소멸 지표",
    "POPULATION": "👥 주민등록 인구",
    "ECONOMY": "💼 소득 & 일자리 & 경제",
}

CATEGORY_ORDER = ["TAX", "FISCAL", "DEMOGRAPHY", "POPULATION", "ECONOMY"]


def query_indicators() -> list[dict[str, Any]]:
    indicators = Indicator.objects.filter(status="ACTIVE").select_related("canonical_unit")
    # Order by custom category order then name
    sorted_inds = sorted(
        indicators,
        key=lambda i: (
            CATEGORY_ORDER.index(i.category) if i.category in CATEGORY_ORDER else 99,
            i.name,
        ),
    )
    return [
        {
            "indicatorKey": ind.indicator_key,
            "name": ind.name,
            "category": ind.category,
            "categoryLabel": CATEGORY_LABELS.get(ind.category, ind.category),
            "unit": ind.canonical_unit.name if ind.canonical_unit else "",
            "unitSymbol": ind.canonical_unit.symbol if ind.canonical_unit else "",
            "valueType": ind.value_type,
            "sourceType": ind.source_type,
        }
        for ind in sorted_inds
    ]


def query_series(
    region_keys: tuple[str, ...],
    indicator_key: str,
    metric_key: str | None = None,
    tax_owner_key: str | None = None,
    start_year: int = 2010,
    end_year: int = 2024,
) -> dict[str, Any]:
    qs = (
        Observation.objects.filter(
            status="PUBLISHED",
            superseded_at__isnull=True,
            region__region_key__in=region_keys,
            indicator__indicator_key=indicator_key,
            period__period_start__gte=date(start_year, 1, 1),
            period__period_end__lte=date(end_year, 12, 31),
        )
        .select_related(
            "region",
            "period",
            "indicator",
            "metric",
            "tax_owner",
            "canonical_unit",
            "source_raw_observation",
            "source_dataset_version__dataset",
            "derived_indicator",
        )
        .order_by("period__period_start")
    )

    if metric_key:
        qs = qs.filter(metric__metric_key=metric_key)
    if tax_owner_key:
        qs = qs.filter(tax_owner__tax_owner_key=tax_owner_key)

    values = []
    source_info: dict[str, Any] = {}

    for obs in qs:
        # Numeric value formatting
        val = float(obs.numeric_value) if obs.numeric_value is not None else None
        values.append(
            {
                "regionKey": obs.region.region_key,
                "period": str(obs.period.period_start.year),
                "value": val,
                "status": "PRESENT" if obs.numeric_value is not None else "MISSING",
                "symbol": obs.symbol,
            }
        )

        if not source_info:
            if obs.source_dataset_version:
                ds = obs.source_dataset_version.dataset
                source_info = {
                    "derived": False,
                    "provider": ds.source_provider,
                    "tableId": ds.source_table_id,
                    "tableName": ds.source_table_name,
                    "unit": obs.canonical_unit.name,
                    "unitSymbol": obs.canonical_unit.symbol,
                }
            elif obs.derived_indicator:
                inputs_list = []
                for inp in obs.inputs.select_related("input_observation__indicator"):
                    inputs_list.append({
                        "role": inp.input_role,
                        "indicatorKey": inp.input_observation.indicator.indicator_key,
                    })
                source_info = {
                    "derived": True,
                    "evaluator": obs.derived_indicator.evaluator_key,
                    "unit": obs.canonical_unit.name,
                    "unitSymbol": obs.canonical_unit.symbol,
                    "inputs": inputs_list,
                }

    return {
        "indicatorKey": indicator_key,
        "regionKeys": list(region_keys),
        "startYear": start_year,
        "endYear": end_year,
        "values": values,
        "source": source_info,
    }


def query_rankings(
    indicator_key: str,
    year: int,
    metric_key: str | None = None,
    tax_owner_key: str | None = None,
    province_code: str | None = None,
) -> dict[str, Any]:
    boundary_set = BoundarySet.objects.filter(reference_year=year, status="ACTIVE").first()
    if not boundary_set:
        boundary_set = BoundarySet.objects.filter(status="ACTIVE").order_by("-reference_year").first()
    boundary_version = str(boundary_set.reference_year) if boundary_set else str(year)

    # Pre-fetch boundary features
    feature_map: dict[int, str] = {}
    if boundary_set:
        for feat in BoundaryFeature.objects.filter(boundary_set=boundary_set):
            feature_map[feat.region_id] = feat.feature_key

    qs = (
        Observation.objects.filter(
            status="PUBLISHED",
            superseded_at__isnull=True,
            indicator__indicator_key=indicator_key,
            period__period_start__lte=date(year, 12, 31),
            period__period_end__gte=date(year, 1, 1),
        )
        .select_related("region", "indicator", "metric", "tax_owner", "canonical_unit")
        .order_by("-numeric_value")
    )

    if province_code:
        qs = qs.filter(region__region_key__startswith=province_code)

    if metric_key:
        qs = qs.filter(metric__metric_key=metric_key)
    if tax_owner_key:
        qs = qs.filter(tax_owner__tax_owner_key=tax_owner_key)

    # Pre-fetch official region names
    region_names: dict[int, str] = {
        rn.region_id: rn.name
        for rn in RegionName.objects.filter(is_official=True)
    }

    rankings = []
    current_rank = 1
    for obs in qs:
        val = float(obs.numeric_value) if obs.numeric_value is not None else None
        rank = None
        if val is not None:
            rank = current_rank
            current_rank += 1

        feature_key = feature_map.get(obs.region_id, obs.region.region_key)
        region_name = region_names.get(obs.region_id, obs.region.region_key)
        prefix = obs.region.region_key[:5]
        prov = PROVINCE_MAP.get(prefix)
        prov_name = prov["name"] if prov else None
        short_prov = prov["short"] if prov else None
        full_name = f"{prov_name} {region_name}" if prov_name else region_name

        rankings.append(
            {
                "regionKey": obs.region.region_key,
                "regionName": region_name,
                "fullName": full_name,
                "provinceCode": prefix if prov else None,
                "provinceName": prov_name,
                "shortProvinceName": short_prov,
                "featureKey": feature_key,
                "value": val,
                "rank": rank,
                "status": "PRESENT" if val is not None else "MISSING",
            }
        )

    ind_obj = Indicator.objects.filter(indicator_key=indicator_key).select_related("canonical_unit").first()

    return {
        "indicatorKey": indicator_key,
        "indicatorName": ind_obj.name if ind_obj else indicator_key,
        "indicatorCategory": ind_obj.category if ind_obj else "",
        "unit": ind_obj.canonical_unit.name if ind_obj and ind_obj.canonical_unit else "",
        "unitSymbol": ind_obj.canonical_unit.symbol if ind_obj and ind_obj.canonical_unit else "",
        "valueType": ind_obj.value_type if ind_obj else "",
        "year": year,
        "provinceCode": province_code,
        "boundaryVersion": boundary_version,
        "boundaryUrl": boundary_set.asset_uri if boundary_set else f"/static/geo/boundaries/{boundary_version}.geojson",
        "values": rankings,
        "rankings": rankings,
    }


def query_race_data(
    indicator_key: str,
    start_year: int = 2010,
    end_year: int = 2024,
    top_n: int = 15,
    province_code: str | None = None,
) -> dict[str, Any]:
    """Retrieve multi-year chronological top ranking data formatted for Bar Chart Race animations."""
    ind_obj = Indicator.objects.filter(indicator_key=indicator_key).select_related("canonical_unit").first()
    region_names: dict[int, str] = {
        rn.region_id: rn.name for rn in RegionName.objects.filter(is_official=True)
    }

    obs_qs = (
        Observation.objects.filter(
            status="PUBLISHED",
            superseded_at__isnull=True,
            indicator__indicator_key=indicator_key,
            period__period_start__gte=date(start_year, 1, 1),
            period__period_end__lte=date(end_year, 12, 31),
        )
    )

    if province_code == "SUDOGWON":
        from django.db.models import Q
        obs_qs = obs_qs.filter(
            Q(region__region_key__startswith="KR_11") |
            Q(region__region_key__startswith="KR_41") |
            Q(region__region_key__startswith="KR_28")
        )
    elif province_code and province_code in PROVINCE_MAP:
        obs_qs = obs_qs.filter(region__region_key__startswith=province_code)

    obs_qs = obs_qs.values("period__period_start__year", "region_id", "region__region_key", "numeric_value").order_by("period__period_start__year", "-numeric_value")

    # Group observations by year
    years_data: dict[int, list[dict[str, Any]]] = {}
    for y in range(start_year, end_year + 1):
        years_data[y] = []

    for row in obs_qs:
        y = row["period__period_start__year"]
        val = float(row["numeric_value"]) if row["numeric_value"] is not None else None
        if val is None or val <= 0:
            continue
        reg_id = row["region_id"]
        reg_key = row["region__region_key"]
        reg_name = region_names.get(reg_id, reg_key)
        prefix = reg_key[:5]
        prov = PROVINCE_MAP.get(prefix)
        prov_name = prov["name"] if prov else ""
        short_prov = prov["short"] if prov else ""

        years_data[y].append({
            "regionKey": reg_key,
            "regionName": reg_name,
            "provinceName": prov_name,
            "shortProvinceName": short_prov,
            "value": val,
        })

    # For each year, sort descending, assign ranks, and slice to top_n
    race_frames = []
    for y in range(start_year, end_year + 1):
        raw_list = sorted(years_data.get(y, []), key=lambda x: x["value"], reverse=True)
        top_list = []
        for rank, item in enumerate(raw_list[:top_n], start=1):
            top_list.append({
                "rank": rank,
                "regionKey": item["regionKey"],
                "name": item["regionName"],
                "fullName": f"{item['shortProvinceName']} {item['regionName']}".strip(),
                "province": item["provinceName"],
                "value": item["value"],
            })
        race_frames.append({
            "year": y,
            "items": top_list,
        })

    # Prune trailing empty frames so video animation never drops to 0 at the end
    while len(race_frames) > 1 and len(race_frames[-1]["items"]) == 0:
        race_frames.pop()

    # Also prune leading empty frames if start_year had no data
    while len(race_frames) > 1 and len(race_frames[0]["items"]) == 0:
        race_frames.pop(0)

    actual_start_year = race_frames[0]["year"] if race_frames else start_year
    actual_end_year = race_frames[-1]["year"] if race_frames else end_year

    prov_info = PROVINCE_MAP.get(province_code) if province_code else None
    display_prov_name = "수도권" if province_code == "SUDOGWON" else (prov_info["name"] if prov_info else "전국")
    display_prov_short = "수도권" if province_code == "SUDOGWON" else (prov_info["short"] if prov_info else "전국")

    return {
        "indicatorKey": indicator_key,
        "indicatorName": ind_obj.name if ind_obj else indicator_key,
        "unit": ind_obj.canonical_unit.name if ind_obj and ind_obj.canonical_unit else "",
        "unitSymbol": ind_obj.canonical_unit.symbol if ind_obj and ind_obj.canonical_unit else "",
        "valueType": ind_obj.value_type if ind_obj else "",
        "startYear": actual_start_year,
        "endYear": actual_end_year,
        "topN": top_n,
        "provinceCode": province_code or "",
        "provinceName": display_prov_name,
        "shortProvinceName": display_prov_short,
        "frames": race_frames,
    }


def query_regional_dashboard(region_key: str, baseline_year: int = 2024) -> dict[str, Any]:
    """Retrieve comprehensive multi-domain metrics, YoY growths, and timeseries for a regional dashboard."""
    reg = Region.objects.filter(region_key=region_key).first()
    if not reg:
        return {"error": f"Region {region_key} not found"}

    name_obj = reg.names.filter(is_official=True).first() or reg.names.first()
    reg_name = name_obj.name if name_obj else reg.region_key
    prefix = reg.region_key[:5]
    prov = PROVINCE_MAP.get(prefix)
    prov_name = prov["name"] if prov else ""
    short_prov = prov["short"] if prov else ""
    full_name = f"{prov_name} {reg_name}" if prov_name else reg_name

    obs_qs = (
        Observation.objects.filter(
            region=reg,
            status="PUBLISHED",
            superseded_at__isnull=True,
        )
        .values("period__period_start__year", "indicator__indicator_key", "numeric_value")
        .order_by("period__period_start__year")
    )

    data_by_year: dict[int, dict[str, float]] = {}
    for row in obs_qs:
        y = row["period__period_start__year"]
        k = row["indicator__indicator_key"]
        v = float(row["numeric_value"]) if row["numeric_value"] is not None else None
        if y not in data_by_year:
            data_by_year[y] = {}
        data_by_year[y][k] = v

    years = sorted(data_by_year.keys())
    if not years:
        years = [baseline_year]

    def get_val(yr: int, ind_k: str) -> float | None:
        return data_by_year.get(yr, {}).get(ind_k)

    def calc_yoy(yr: int, ind_k: str):
        val = get_val(yr, ind_k)
        prev_val = get_val(yr - 1, ind_k)
        diff = (val - prev_val) if (val is not None and prev_val is not None) else None
        pct = ((diff / abs(prev_val)) * 100) if (diff is not None and prev_val and prev_val != 0) else None
        return val, diff, pct

    # Determine best year for each metric for executive KPIs
    # If baseline_year doesn't have tax data yet (e.g. 2025), fallback to 2024 for taxes
    def get_effective_kpi_year(ind_k: str, pref_year: int) -> int:
        if get_val(pref_year, ind_k) is not None:
            return pref_year
        # Search backwards
        for yr in sorted(years, reverse=True):
            if get_val(yr, ind_k) is not None:
                return yr
        return pref_year

    def get_rank_info(ind_k: str, target_yr: int, target_val: float | None):
        if target_val is None:
            return None, None, None
        qs = Observation.objects.filter(
            indicator__indicator_key=ind_k,
            period__period_start__year=target_yr,
            status="PUBLISHED",
            superseded_at__isnull=True,
            numeric_value__isnull=False,
        )
        total = qs.count()
        if total == 0:
            return None, None, None
        rank = qs.filter(numeric_value__gt=target_val).count() + 1
        top_pct = round((rank / total) * 100, 1)
        return rank, total, top_pct

    # -------------------------------------------------------------
    # 4-Pillar Indicators Computation
    # -------------------------------------------------------------
    # Pillar 1: Demographic Vitality (인구 활력)
    pop_yr = get_effective_kpi_year("POPULATION", baseline_year)
    pop_val, pop_diff, pop_pct = calc_yoy(pop_yr, "POPULATION")
    pop_rank, pop_total, pop_top_pct = get_rank_info("POPULATION", pop_yr, pop_val)

    mig_yr = get_effective_kpi_year("NET_MIGRATION", baseline_year)
    mig_val, mig_diff, _ = calc_yoy(mig_yr, "NET_MIGRATION")
    mig_rate = get_val(mig_yr, "NET_MIGRATION_RATE")
    mig_rank, mig_total, mig_top_pct = get_rank_info("NET_MIGRATION", mig_yr, mig_val)

    fert_yr = get_effective_kpi_year("TOTAL_FERTILITY_RATE", baseline_year)
    fert_val = get_val(fert_yr, "TOTAL_FERTILITY_RATE")
    fert_rank, fert_total, fert_top_pct = get_rank_info("TOTAL_FERTILITY_RATE", fert_yr, fert_val)

    elder_yr = get_effective_kpi_year("ELDERLY_POPULATION_RATIO", baseline_year)
    elder_val, elder_diff, _ = calc_yoy(elder_yr, "ELDERLY_POPULATION_RATIO")
    elder_rank, elder_total, elder_top_pct = get_rank_info("ELDERLY_POPULATION_RATIO", elder_yr, elder_val)

    # Pillar 2: Income & Jobs (소득 & 일자리)
    # Real Resident Annual Wage (국세청 주소지별 근로소득 연말정산)
    wage_yr = get_effective_kpi_year("AVERAGE_WAGE", baseline_year)
    wage_val, wage_diff, wage_pct = calc_yoy(wage_yr, "AVERAGE_WAGE")
    wage_rank, wage_total, wage_top_pct = get_rank_info("AVERAGE_WAGE", wage_yr, wage_val)

    # Corporate Total Payroll (관내 기업 총급여 지급액)
    corp_yr = get_effective_kpi_year("CORPORATE_TOTAL_PAYROLL", baseline_year)
    corp_val, corp_diff, corp_pct = calc_yoy(corp_yr, "CORPORATE_TOTAL_PAYROLL")
    corp_rank, corp_total, corp_top_pct = get_rank_info("CORPORATE_TOTAL_PAYROLL", corp_yr, corp_val)

    # Withholding Tax (관내 기업 원천징수세액)
    withhold_yr = get_effective_kpi_year("WITHHOLDING_TAX", baseline_year)
    withhold_val, withhold_diff, withhold_pct = calc_yoy(withhold_yr, "WITHHOLDING_TAX")
    withhold_rank, withhold_total, withhold_top_pct = get_rank_info("WITHHOLDING_TAX", withhold_yr, withhold_val)

    # Workplace Workers (사업장 소속 근로자수)
    work_workers_yr = get_effective_kpi_year("WORKPLACE_WAGE_EARNERS", baseline_year)
    work_workers_val, work_workers_diff, work_workers_pct = calc_yoy(work_workers_yr, "WORKPLACE_WAGE_EARNERS")
    work_workers_rank, work_workers_total, work_workers_top_pct = get_rank_info("WORKPLACE_WAGE_EARNERS", work_workers_yr, work_workers_val)

    # Local Income Tax per capita & Businesses
    pc_inc_yr = get_effective_kpi_year("LOCAL_INCOME_TAX_PER_CAPITA", baseline_year)
    pc_inc_val, pc_inc_diff, pc_inc_pct = calc_yoy(pc_inc_yr, "LOCAL_INCOME_TAX_PER_CAPITA")
    pc_inc_rank, pc_inc_total, pc_inc_top_pct = get_rank_info("LOCAL_INCOME_TAX_PER_CAPITA", pc_inc_yr, pc_inc_val)

    biz_yr = get_effective_kpi_year("BUSINESS_ESTABLISHMENTS", baseline_year)
    biz_val, biz_diff, biz_pct = calc_yoy(biz_yr, "BUSINESS_ESTABLISHMENTS")
    biz_rank, biz_total, biz_top_pct = get_rank_info("BUSINESS_ESTABLISHMENTS", biz_yr, biz_val)
    biz_per_thou = get_val(biz_yr, "BUSINESSES_PER_THOUSAND")

    # Pillar 3: Housing & Asset Appeal (자산 & 주거 매력)
    acq_yr = get_effective_kpi_year("ACQUISITION_TAX", baseline_year)
    acq_val, acq_diff, acq_pct = calc_yoy(acq_yr, "ACQUISITION_TAX")
    acq_rank, acq_total, acq_top_pct = get_rank_info("ACQUISITION_TAX", acq_yr, acq_val)

    prop_yr = get_effective_kpi_year("PROPERTY_TAX", baseline_year)
    prop_val, prop_diff, prop_pct = calc_yoy(prop_yr, "PROPERTY_TAX")
    prop_rank, prop_total, prop_top_pct = get_rank_info("PROPERTY_TAX", prop_yr, prop_val)

    pc_acq_yr = get_effective_kpi_year("ACQUISITION_TAX_PER_CAPITA", baseline_year)
    pc_acq_val = get_val(pc_acq_yr, "ACQUISITION_TAX_PER_CAPITA")
    pc_acq_rank, pc_acq_total, pc_acq_top_pct = get_rank_info("ACQUISITION_TAX_PER_CAPITA", pc_acq_yr, pc_acq_val)

    # Pillar 4: Fiscal Capability & Administration (지자체 행정 여력)
    tax_yr = get_effective_kpi_year("LOCAL_TAX_TOTAL", baseline_year)
    tax_val, tax_diff, tax_pct = calc_yoy(tax_yr, "LOCAL_TAX_TOTAL")
    tax_rank, tax_total, tax_top_pct = get_rank_info("LOCAL_TAX_TOTAL", tax_yr, tax_val)

    fisc_yr = get_effective_kpi_year("FISCAL_INDEPENDENCE", baseline_year)
    fisc_val, fisc_diff, _ = calc_yoy(fisc_yr, "FISCAL_INDEPENDENCE")
    fisc_rank, fisc_total, fisc_top_pct = get_rank_info("FISCAL_INDEPENDENCE", fisc_yr, fisc_val)

    pc_tax_yr = get_effective_kpi_year("LOCAL_TAX_TOTAL_PER_CAPITA", baseline_year)
    pc_tax_val, pc_tax_diff, pc_tax_pct = calc_yoy(pc_tax_yr, "LOCAL_TAX_TOTAL_PER_CAPITA")
    pc_tax_rank, pc_tax_total, pc_tax_top_pct = get_rank_info("LOCAL_TAX_TOTAL_PER_CAPITA", pc_tax_yr, pc_tax_val)

    # 5 radar axes percentile scores (0 ~ 100, where 100 is best / highest in nation)
    radar_scores = {
        "fiscalIndependence": round(100.0 - fisc_top_pct, 1) if fisc_top_pct is not None else 50.0,
        "perCapitaTax": round(100.0 - pc_tax_top_pct, 1) if pc_tax_top_pct is not None else 50.0,
        "population": round(100.0 - pop_top_pct, 1) if pop_top_pct is not None else 50.0,
        "fertilityRate": round(100.0 - fert_top_pct, 1) if fert_top_pct is not None else 50.0,
        "businesses": round(100.0 - biz_top_pct, 1) if biz_top_pct is not None else 50.0,
    }

    # -------------------------------------------------------------
    # 10-Year Long Term Vitality Changes (e.g. 2024 vs 2014)
    # -------------------------------------------------------------
    ref_yr_now = 2024 if 2024 in years else (years[-1] if years else baseline_year)
    ref_yr_past = (ref_yr_now - 10) if (ref_yr_now - 10) in years else (years[0] if years else baseline_year)

    def calc_period_change(ind_k: str):
        v_now = get_val(ref_yr_now, ind_k)
        v_past = get_val(ref_yr_past, ind_k)
        if v_now is not None and v_past is not None and v_past != 0:
            pct = ((v_now - v_past) / abs(v_past)) * 100
            diff = v_now - v_past
            return round(pct, 1), diff
        return None, None

    pop_10yr_pct, pop_10yr_diff = calc_period_change("POPULATION")
    inc_10yr_pct, inc_10yr_diff = calc_period_change("LOCAL_INCOME_TAX_PER_CAPITA")
    tax_10yr_pct, tax_10yr_diff = calc_period_change("LOCAL_TAX_TOTAL")

    # -------------------------------------------------------------
    # Diagnostic Verdict & 4-Pillar Traffic Lights (신호등)
    # -------------------------------------------------------------
    # 1. Demographic Grade
    if mig_val is not None and mig_val > 500 and (elder_val is None or elder_val < 16.0):
        demo_score, demo_grade, demo_status, demo_desc = "A", "우수", "good", "청년·인구 순유입 우위 및 낮은 고령화율"
    elif mig_val is not None and mig_val >= -500 and (elder_val is None or elder_val < 20.0):
        demo_score, demo_grade, demo_status, demo_desc = "B", "양호", "normal", "인구 규모 안정적 유지"
    elif elder_val is not None and elder_val >= 25.0:
        demo_score, demo_grade, demo_status, demo_desc = "D", "주의", "warning", "초고령사회 진입 및 인구 자연감소 압력"
    else:
        demo_score, demo_grade, demo_status, demo_desc = "C", "보통", "neutral", "인구 정체 또는 소폭 순유출 지속"

    # 2. Income/Job Grade
    if (wage_top_pct is not None and wage_top_pct <= 20.0) or (pc_inc_top_pct is not None and pc_inc_top_pct <= 20.0):
        inc_score, inc_grade, inc_status = "A", "우수", "good"
        inc_desc = f"주민 평균 연봉 {round(wage_val/10000):,}만원(상위 {wage_top_pct}%) 고소득·양질의 일자리" if wage_val else "전국 상위 20% 이내 높은 1인당 소득세"
    elif (wage_top_pct is not None and wage_top_pct <= 50.0) or (pc_inc_top_pct is not None and pc_inc_top_pct <= 50.0):
        inc_score, inc_grade, inc_status = "B", "양호", "normal"
        inc_desc = f"주민 평균 연봉 {round(wage_val/10000):,}만원(중상위권) 안정적 소득" if wage_val else "전국 평균 이상의 안정적 근로·사업 소득"
    elif (wage_top_pct is not None and wage_top_pct <= 75.0) or (pc_inc_top_pct is not None and pc_inc_top_pct <= 75.0):
        inc_score, inc_grade, inc_status = "C", "보통", "neutral"
        inc_desc = "평균 수준 소득 및 사업체 기반"
    else:
        inc_score, inc_grade, inc_status = "D", "주의", "warning"
        inc_desc = "주민 소득 및 1인당 소득세 전국 하위권 (자족 일자리 필요)"

    # 3. Housing/Asset Grade
    if acq_top_pct is not None and acq_top_pct <= 20.0:
        house_score, house_grade, house_status, house_desc = "A", "우수", "good", "부동산 자산 가치 및 매매 유입 최상위"
    elif acq_top_pct is not None and acq_top_pct <= 50.0:
        house_score, house_grade, house_status, house_desc = "B", "양호", "normal", "안정적인 부동산 거래 및 자산 보유"
    elif acq_top_pct is not None and acq_top_pct <= 75.0:
        house_score, house_grade, house_status, house_desc = "C", "보통", "neutral", "부동산 거래 보통 수준 유지"
    else:
        house_score, house_grade, house_status, house_desc = "D", "주의", "warning", "부동산 거래 둔화 및 자산 가치 정체"

    # 4. Fiscal Capacity Grade
    if fisc_val is not None and fisc_val >= 45.0:
        fisc_score, fisc_grade, fisc_status, fisc_desc = "A", "우수", "good", "자체 세수 기반 매우 우수 (재정자립도 45%↑)"
    elif fisc_val is not None and fisc_val >= 28.0:
        fisc_score, fisc_grade, fisc_status, fisc_desc = "B", "양호", "normal", "자립 재정 양호 (복지·인프라 안정)"
    elif fisc_val is not None and fisc_val >= 16.0:
        fisc_score, fisc_grade, fisc_status, fisc_desc = "C", "보통", "neutral", "자립도 보통 (중앙 교부세 의존 시작)"
    else:
        fisc_score, fisc_grade, fisc_status, fisc_desc = "D", "주의", "warning", "재정자립도 취약 (중앙정부 보조금 필수 의존)"

    # Synthesis Archetype Verdict
    if mig_val is not None and mig_val > 1000 and (pop_10yr_pct is not None and pop_10yr_pct > 10.0) and (fisc_val is not None and fisc_val >= 35.0):
        verdict_title = "청년 유입 & 자립 급성장형 도시"
        verdict_badge_class = "bg-emerald-50 text-emerald-800 border-emerald-300"
        verdict_theme = "emerald"
    elif pc_inc_top_pct is not None and pc_inc_top_pct <= 15.0 and (fisc_val is not None and fisc_val >= 40.0):
        verdict_title = "고소득 & 자산 중심형 명품 주거지"
        verdict_badge_class = "bg-sky-50 text-sky-800 border-sky-300"
        verdict_theme = "sky"
    elif (mig_val is not None and mig_val >= 0) or (pop_10yr_pct is not None and pop_10yr_pct >= 0):
        verdict_title = "성숙기 대도시 & 안정적 정주형 도시"
        verdict_badge_class = "bg-cyan-50 text-cyan-800 border-cyan-300"
        verdict_theme = "cyan"
    elif elder_val is not None and elder_val >= 25.0 and (fisc_val is not None and fisc_val < 20.0):
        verdict_title = "초고령화 & 재정 의존 심화 주의형"
        verdict_badge_class = "bg-rose-50 text-rose-800 border-rose-300"
        verdict_theme = "rose"
    elif mig_val is not None and mig_val < 0 and (fisc_val is not None and fisc_val < 25.0):
        verdict_title = "인구 유출 & 재정 자립 약화 주의형"
        verdict_badge_class = "bg-amber-50 text-amber-800 border-amber-300"
        verdict_theme = "amber"
    else:
        verdict_title = "주거·산업 전환기 관리형 도시"
        verdict_badge_class = "bg-indigo-50 text-indigo-800 border-indigo-300"
        verdict_theme = "indigo"

    # Executive Briefing Line
    pop_phrase = f"인구 {pop_10yr_pct:+.1f}%" if pop_10yr_pct is not None else ""
    inc_phrase = f"1인당 소득세 {inc_10yr_pct:+.1f}%" if inc_10yr_pct is not None else ""
    tax_phrase = f"지방세 총액 {tax_10yr_pct:+.1f}%" if tax_10yr_pct is not None else ""
    parts = [p for p in [pop_phrase, inc_phrase, tax_phrase] if p]
    metric_summary = ", ".join(parts)
    
    if (pop_10yr_pct or 0) > 0 and (tax_10yr_pct or 0) > 0:
        trend_word = "지속적으로 개선 및 성장하고 있습니다."
    elif (pop_10yr_pct or 0) < 0 and (tax_10yr_pct or 0) < 0:
        trend_word = "다소 정체 및 둔화 압력을 받고 있어 맞춤형 활성화 정책이 요구됩니다."
    else:
        trend_word = "자립 기반과 주거 안정성 사이에서 균형을 유지하고 있습니다."

    briefing_text = f"10년 전({ref_yr_past}년) 대비 {metric_summary}를 기록하여, 지역의 정주 여건과 경제 활력이 {trend_word}"

    diagnosis = {
        "verdictTitle": verdict_title,
        "verdictClass": verdict_badge_class,
        "verdictTheme": verdict_theme,
        "briefing": briefing_text,
        "refYearNow": ref_yr_now,
        "refYearPast": ref_yr_past,
        "tenYearPopChangePct": pop_10yr_pct,
        "tenYearIncTaxChangePct": inc_10yr_pct,
        "tenYearTotalTaxChangePct": tax_10yr_pct,
        "pillars": {
            "demography": {"score": demo_score, "grade": demo_grade, "status": demo_status, "desc": demo_desc},
            "incomeJobs": {"score": inc_score, "grade": inc_grade, "status": inc_status, "desc": inc_desc},
            "housingAssets": {"score": house_score, "grade": house_grade, "status": house_status, "desc": house_desc},
            "fiscalCapacity": {"score": fisc_score, "grade": fisc_grade, "status": fisc_status, "desc": fisc_desc},
        }
    }

    # Structured 4-Pillar KPIs + Backward Compatibility Aliases
    kpis = {
        # 4 Pillars
        "pillar1_demography": {
            "title": "인구 활력",
            "question": "젊은 사람들이 들어오고 있는가?",
            "year": pop_yr,
            "population": {"value": pop_val, "yoyDiff": pop_diff, "yoyPct": round(pop_pct, 2) if pop_pct is not None else None, "rank": pop_rank, "totalCount": pop_total, "topPct": pop_top_pct},
            "netMigration": {"value": mig_val, "rate": mig_rate, "yoyDiff": mig_diff, "rank": mig_rank, "totalCount": mig_total, "topPct": mig_top_pct},
            "fertilityRate": {"value": fert_val, "rank": fert_rank, "totalCount": fert_total, "topPct": fert_top_pct},
            "elderlyRatio": {"value": elder_val, "yoyDiff": round(elder_diff, 2) if elder_diff is not None else None, "rank": elder_rank, "totalCount": elder_total, "topPct": elder_top_pct},
        },
        "pillar2_incomeJobs": {
            "title": "소득 & 일자리",
            "question": "이 지역 주민과 기업이 돈을 잘 버는가?",
            "year": wage_yr or pc_inc_yr,
            "averageWage": {"value": wage_val, "year": wage_yr, "yoyDiff": wage_diff, "yoyPct": round(wage_pct, 2) if wage_pct is not None else None, "rank": wage_rank, "totalCount": wage_total, "topPct": wage_top_pct},
            "corporatePayroll": {"value": corp_val, "year": corp_yr, "yoyDiff": corp_diff, "yoyPct": round(corp_pct, 2) if corp_pct is not None else None, "rank": corp_rank, "totalCount": corp_total, "topPct": corp_top_pct},
            "withholdingTax": {"value": withhold_val, "year": withhold_yr, "yoyDiff": withhold_diff, "yoyPct": round(withhold_pct, 2) if withhold_pct is not None else None, "rank": withhold_rank, "totalCount": withhold_total, "topPct": withhold_top_pct},
            "workplaceWorkers": {"value": work_workers_val, "year": work_workers_yr, "yoyDiff": work_workers_diff, "yoyPct": round(work_workers_pct, 2) if work_workers_pct is not None else None, "rank": work_workers_rank, "totalCount": work_workers_total, "topPct": work_workers_top_pct},
            "pcIncomeTax": {"value": pc_inc_val, "year": pc_inc_yr, "yoyDiff": pc_inc_diff, "yoyPct": round(pc_inc_pct, 2) if pc_inc_pct is not None else None, "rank": pc_inc_rank, "totalCount": pc_inc_total, "topPct": pc_inc_top_pct},
            "businesses": {"value": biz_val, "year": biz_yr, "yoyDiff": biz_diff, "yoyPct": round(biz_pct, 2) if biz_pct is not None else None, "rank": biz_rank, "totalCount": biz_total, "topPct": biz_top_pct},
            "businessesPerThousand": {"value": biz_per_thou},
        },
        "pillar3_housingAssets": {
            "title": "자산 & 주거 매력",
            "question": "사람들이 집을 사고 정착하고 싶어 하는가?",
            "year": acq_yr,
            "acquisitionTax": {"value": acq_val, "yoyDiff": acq_diff, "yoyPct": round(acq_pct, 2) if acq_pct is not None else None, "rank": acq_rank, "totalCount": acq_total, "topPct": acq_top_pct},
            "propertyTax": {"value": prop_val, "yoyDiff": prop_diff, "yoyPct": round(prop_pct, 2) if prop_pct is not None else None, "rank": prop_rank, "totalCount": prop_total, "topPct": prop_top_pct},
            "pcAcquisitionTax": {"value": pc_acq_val, "rank": pc_acq_rank, "totalCount": pc_acq_total, "topPct": pc_acq_top_pct},
        },
        "pillar4_fiscalCapacity": {
            "title": "지자체 행정 여력",
            "question": "살림살이가 넉넉해서 주민 복지를 챙길 수 있는가?",
            "year": tax_yr,
            "localTaxTotal": {"value": tax_val, "yoyDiff": tax_diff, "yoyPct": round(tax_pct, 2) if tax_pct is not None else None, "rank": tax_rank, "totalCount": tax_total, "topPct": tax_top_pct},
            "fiscalIndependence": {"value": fisc_val, "yoyDiff": round(fisc_diff, 2) if fisc_diff is not None else None, "rank": fisc_rank, "totalCount": fisc_total, "topPct": fisc_top_pct},
            "perCapitaTax": {"value": pc_tax_val, "yoyDiff": pc_tax_diff, "yoyPct": round(pc_tax_pct, 2) if pc_tax_pct is not None else None, "rank": pc_tax_rank, "totalCount": pc_tax_total, "topPct": pc_tax_top_pct},
        },
        # Flat legacy aliases
        "population": {"value": pop_val, "year": pop_yr, "yoyDiff": pop_diff, "yoyPct": round(pop_pct, 2) if pop_pct is not None else None, "rank": pop_rank, "totalCount": pop_total, "topPct": pop_top_pct},
        "netMigration": {"value": mig_val, "year": mig_yr, "rate": mig_rate, "yoyDiff": mig_diff, "rank": mig_rank, "totalCount": mig_total, "topPct": mig_top_pct},
        "localTaxTotal": {"value": tax_val, "year": tax_yr, "yoyDiff": tax_diff, "yoyPct": round(tax_pct, 2) if tax_pct is not None else None, "rank": tax_rank, "totalCount": tax_total, "topPct": tax_top_pct},
        "fiscalIndependence": {"value": fisc_val, "year": fisc_yr, "yoyDiff": round(fisc_diff, 2) if fisc_diff is not None else None, "rank": fisc_rank, "totalCount": fisc_total, "topPct": fisc_top_pct},
        "perCapitaTax": {"value": pc_tax_val, "year": pc_tax_yr, "yoyDiff": pc_tax_diff, "yoyPct": round(pc_tax_pct, 2) if pc_tax_pct is not None else None, "rank": pc_tax_rank, "totalCount": pc_tax_total, "topPct": pc_tax_top_pct},
        "businesses": {"value": biz_val, "year": biz_yr, "perThousand": biz_per_thou, "yoyDiff": biz_diff, "yoyPct": round(biz_pct, 2) if biz_pct is not None else None, "rank": biz_rank, "totalCount": biz_total, "topPct": biz_top_pct},
        "averageWage": {"value": wage_val, "year": wage_yr, "yoyDiff": wage_diff, "yoyPct": round(wage_pct, 2) if wage_pct is not None else None, "rank": wage_rank, "totalCount": wage_total, "topPct": wage_top_pct},
        "corporatePayroll": {"value": corp_val, "year": corp_yr, "yoyDiff": corp_diff, "yoyPct": round(corp_pct, 2) if corp_pct is not None else None, "rank": corp_rank, "totalCount": corp_total, "topPct": corp_top_pct},
        "withholdingTax": {"value": withhold_val, "year": withhold_yr, "yoyDiff": withhold_diff, "yoyPct": round(withhold_pct, 2) if withhold_pct is not None else None, "rank": withhold_rank, "totalCount": withhold_total, "topPct": withhold_top_pct},
    }

    # Chart timeseries
    charts = {
        "years": years,
        "population": [get_val(y, "POPULATION") for y in years],
        "netMigration": [get_val(y, "NET_MIGRATION") for y in years],
        "netMigrationRate": [get_val(y, "NET_MIGRATION_RATE") for y in years],
        "fertilityRate": [get_val(y, "TOTAL_FERTILITY_RATE") for y in years],
        "elderlyRatio": [get_val(y, "ELDERLY_POPULATION_RATIO") for y in years],
        "averageWage": [get_val(y, "AVERAGE_WAGE") for y in years],
        "corporatePayroll": [get_val(y, "CORPORATE_TOTAL_PAYROLL") for y in years],
        "withholdingTax": [get_val(y, "WITHHOLDING_TAX") for y in years],
        "workplaceWorkers": [get_val(y, "WORKPLACE_WAGE_EARNERS") for y in years],
        "pcIncomeTax": [get_val(y, "LOCAL_INCOME_TAX_PER_CAPITA") for y in years],
        "localIncomeTax": [get_val(y, "LOCAL_INCOME_TAX") for y in years],
        "businesses": [get_val(y, "BUSINESS_ESTABLISHMENTS") for y in years],
        "businessesPerThousand": [get_val(y, "BUSINESSES_PER_THOUSAND") for y in years],
        "acquisitionTax": [get_val(y, "ACQUISITION_TAX") for y in years],
        "propertyTax": [get_val(y, "PROPERTY_TAX") for y in years],
        "pcAcquisitionTax": [get_val(y, "ACQUISITION_TAX_PER_CAPITA") for y in years],
        "localTaxTotal": [get_val(y, "LOCAL_TAX_TOTAL") for y in years],
        "fiscalIndependence": [get_val(y, "FISCAL_INDEPENDENCE") for y in years],
        "perCapitaTax": [get_val(y, "LOCAL_TAX_TOTAL_PER_CAPITA") for y in years],
    }

    # Comprehensive 4-Pillar Historical Matrix Table
    table_rows = []
    for yr in reversed(years):
        pval, pdiff, ppct = calc_yoy(yr, "POPULATION")
        mval = get_val(yr, "NET_MIGRATION")
        mrate = get_val(yr, "NET_MIGRATION_RATE")
        fert_row = get_val(yr, "TOTAL_FERTILITY_RATE")
        elder_row = get_val(yr, "ELDERLY_POPULATION_RATIO")

        w_val, w_diff, w_pct = calc_yoy(yr, "AVERAGE_WAGE")
        cp_val, cp_diff, cp_pct = calc_yoy(yr, "CORPORATE_TOTAL_PAYROLL")
        wh_val = get_val(yr, "WITHHOLDING_TAX")
        ww_val = get_val(yr, "WORKPLACE_WAGE_EARNERS")

        pc_inc_row = get_val(yr, "LOCAL_INCOME_TAX_PER_CAPITA")
        inc_val = get_val(yr, "LOCAL_INCOME_TAX")
        bval = get_val(yr, "BUSINESS_ESTABLISHMENTS")
        b_thou_row = get_val(yr, "BUSINESSES_PER_THOUSAND")

        acq_val = get_val(yr, "ACQUISITION_TAX")
        prop_val = get_val(yr, "PROPERTY_TAX")
        pc_acq_row = get_val(yr, "ACQUISITION_TAX_PER_CAPITA")

        tval, tdiff, tpct = calc_yoy(yr, "LOCAL_TAX_TOTAL")
        fval, fdiff, _ = calc_yoy(yr, "FISCAL_INDEPENDENCE")
        pctax = get_val(yr, "LOCAL_TAX_TOTAL_PER_CAPITA")

        table_rows.append({
            "year": yr,
            "isBaseline": yr == baseline_year,
            # Pillar 1: Demographic
            "population": pval,
            "populationYoY": pdiff,
            "populationYoYPct": round(ppct, 2) if ppct is not None else None,
            "netMigration": mval,
            "netMigrationRate": mrate,
            "fertilityRate": fert_row,
            "elderlyRatio": elder_row,
            # Pillar 2: Income & Jobs
            "averageWage": w_val,
            "averageWageYoY": w_diff,
            "averageWageYoYPct": round(w_pct, 2) if w_pct is not None else None,
            "corporatePayroll": cp_val,
            "corporatePayrollYoY": cp_diff,
            "withholdingTax": wh_val,
            "workplaceWorkers": ww_val,
            "pcIncomeTax": pc_inc_row,
            "localIncomeTax": inc_val,
            "businesses": bval,
            "businessesPerThousand": b_thou_row,
            # Pillar 3: Housing & Assets
            "acquisitionTax": acq_val,
            "propertyTax": prop_val,
            "pcAcquisitionTax": pc_acq_row,
            # Pillar 4: Fiscal & Administration
            "localTaxTotal": tval,
            "taxYoY": tdiff,
            "taxYoYPct": round(tpct, 2) if tpct is not None else None,
            "fiscalIndependence": fval,
            "fiscalYoYDiff": round(fdiff, 2) if fdiff is not None else None,
            "perCapitaTax": pctax,
        })

    return {
        "region": {
            "regionKey": reg.region_key,
            "name": reg_name,
            "fullName": full_name,
            "provinceName": prov_name,
            "provinceCode": prefix,
            "shortProvince": short_prov,
        },
        "baselineYear": baseline_year,
        "diagnosis": diagnosis,
        "kpis": kpis,
        "radarScores": radar_scores,
        "charts": charts,
        "table": table_rows,
    }


