from django.http import HttpRequest, JsonResponse
from django.db.models import Min, Max
from explorer.models import Observation
from explorer.queries import (
    query_indicators,
    query_race_data,
    query_rankings,
    query_regions,
    query_regional_dashboard,
    query_series,
    query_versus_data,
    query_region_report_card,
)

def _get_year_bounds(indicator_id: str | None = None):
    qs = Observation.objects.filter(status="PUBLISHED", superseded_at__isnull=True)
    if indicator_id:
        qs = qs.filter(indicator__indicator_key=indicator_id)
    agg = qs.aggregate(
        min_y=Min('period__period_start__year'),
        max_y=Max('period__period_end__year')
    )
    min_bound = min(agg['min_y'] or 2010, 2010)
    max_bound = max(agg['max_y'] or 2024, 2024)
    return min_bound, max_bound

def api_regions(request: HttpRequest) -> JsonResponse:
    regions = query_regions()
    return JsonResponse({"regions": regions})

def api_indicators(request: HttpRequest) -> JsonResponse:
    indicators = query_indicators()
    return JsonResponse({"indicators": indicators})

def api_series(request: HttpRequest) -> JsonResponse:
    indicator_id = request.GET.get("indicatorId")
    min_year, max_year = _get_year_bounds(indicator_id)
    
    region_id = request.GET.get("regionId")
    indicator_id = request.GET.get("indicatorId")
    from_year_str = request.GET.get("from", str(min_year))
    to_year_str = request.GET.get("to", str(max_year))
    metric_key = request.GET.get("metric")
    tax_owner_key = request.GET.get("taxOwner")

    if not region_id or not indicator_id:
        return JsonResponse({"error": "regionId and indicatorId are required"}, status=400)

    try:
        from_year = int(from_year_str)
        to_year = int(to_year_str)
    except ValueError:
        return JsonResponse({"error": "from and to must be integers"}, status=400)

    if from_year < min_year or to_year > max_year or from_year > to_year:
        return JsonResponse({"error": f"Requested year range must be within {min_year}-{max_year}"}, status=400)

    region_keys = tuple([r.strip() for r in region_id.split(",") if r.strip()])
    series = query_series(
        region_keys=region_keys,
        indicator_key=indicator_id,
        metric_key=metric_key,
        tax_owner_key=tax_owner_key,
        start_year=from_year,
        end_year=to_year,
    )
    return JsonResponse(series)


def api_rankings(request: HttpRequest) -> JsonResponse:
    indicator_id = request.GET.get("indicatorId")
    if not indicator_id:
        return JsonResponse({"error": "indicatorId is required"}, status=400)

    min_year, max_year = _get_year_bounds(indicator_id)
    year_str = request.GET.get("year")
    if year_str:
        try:
            year = int(year_str)
        except ValueError:
            year = max_year
        if year > max_year:
            year = max_year
        elif year < min_year:
            year = min_year
    else:
        year = max_year

    metric_key = request.GET.get("metric")
    tax_owner_key = request.GET.get("taxOwner")
    province_code = request.GET.get("province")

    rankings = query_rankings(
        indicator_key=indicator_id,
        year=year,
        metric_key=metric_key,
        tax_owner_key=tax_owner_key,
        province_code=province_code,
    )
    return JsonResponse(rankings)


def api_race_data(request: HttpRequest) -> JsonResponse:
    indicator_id = request.GET.get("indicatorId", "ACQUISITION_TAX")
    min_year, max_year = _get_year_bounds(indicator_id)
    
    top_n_str = request.GET.get("topN", "10")
    try:
        top_n = max(5, min(50, int(top_n_str)))
    except ValueError:
        top_n = 10

    start_year = int(request.GET.get("startYear") or min_year)
    end_year = int(request.GET.get("endYear") or max_year)
    province_code = request.GET.get("provinceCode", "").strip() or None
    ranking_mode = request.GET.get("rankingMode", "VALUE").strip() or "VALUE"

    data = query_race_data(
        indicator_key=indicator_id,
        start_year=start_year,
        end_year=end_year,
        top_n=top_n,
        province_code=province_code,
        ranking_mode=ranking_mode,
    )
    return JsonResponse(data)


def api_versus_data(request: HttpRequest) -> JsonResponse:
    region_a = request.GET.get("regionA", "KR_41590") # Default: 화성시
    region_b = request.GET.get("regionB", "KR_41130") # Default: 성남시
    year_str = request.GET.get("year", "2024")
    try:
        baseline_year = int(year_str)
    except ValueError:
        baseline_year = 2024

    data = query_versus_data(region_key_a=region_a, region_key_b=region_b, baseline_year=baseline_year)
    if "error" in data:
        return JsonResponse(data, status=400)
    return JsonResponse(data)


def api_report_card(request: HttpRequest) -> JsonResponse:
    region_id = request.GET.get("regionId", "KR_41590") # Default: 화성시
    year_str = request.GET.get("year", "2024")
    try:
        baseline_year = int(year_str)
    except ValueError:
        baseline_year = 2024

    data = query_region_report_card(region_key=region_id, baseline_year=baseline_year)
    if "error" in data:
        return JsonResponse(data, status=404)
    return JsonResponse(data)


def api_regional_dashboard(request: HttpRequest) -> JsonResponse:
    region_id = request.GET.get("regionId")
    if not region_id:
        return JsonResponse({"error": "regionId parameter is required"}, status=400)

    year_str = request.GET.get("year", "2024")
    try:
        baseline_year = int(year_str)
    except ValueError:
        baseline_year = 2024

    data = query_regional_dashboard(region_key=region_id, baseline_year=baseline_year)
    if "error" in data:
        return JsonResponse(data, status=404)
    return JsonResponse(data)


from django.views.decorators.csrf import csrf_exempt


def api_check_updates(request: HttpRequest) -> JsonResponse:
    from explorer.updater import check_updates
    force = request.GET.get("force", "").lower() in ("1", "true", "yes")
    data = check_updates(force=force)
    return JsonResponse(data)


@csrf_exempt
def api_sync_updates(request: HttpRequest) -> JsonResponse:
    from explorer.updater import sync_population_year
    category = request.POST.get("category") or request.GET.get("category") or "POPULATION"
    year_str = request.POST.get("year") or request.GET.get("year") or "2025"
    try:
        year = int(year_str)
    except ValueError:
        return JsonResponse({"success": False, "error": "Invalid year"}, status=400)

    if category == "POPULATION":
        res = sync_population_year(year)
        return JsonResponse(res)
    else:
        return JsonResponse({
            "success": False,
            "message": f"'{category}' 지표는 아직 정부(통계청/행안부)에서 {year}년 자료를 공표하지 않았습니다."
        })
