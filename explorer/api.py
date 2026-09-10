from django.http import HttpRequest, JsonResponse
from explorer.queries import (
    query_indicators,
    query_rankings,
    query_regions,
    query_series,
)


def api_regions(request: HttpRequest) -> JsonResponse:
    regions = query_regions()
    return JsonResponse({"regions": regions})


def api_indicators(request: HttpRequest) -> JsonResponse:
    indicators = query_indicators()
    return JsonResponse({"indicators": indicators})


def api_series(request: HttpRequest) -> JsonResponse:
    region_id = request.GET.get("regionId")
    indicator_id = request.GET.get("indicatorId")
    from_year_str = request.GET.get("from", "2010")
    to_year_str = request.GET.get("to", "2024")
    metric_key = request.GET.get("metric")
    tax_owner_key = request.GET.get("taxOwner")

    if not region_id or not indicator_id:
        return JsonResponse({"error": "regionId and indicatorId are required"}, status=400)

    try:
        from_year = int(from_year_str)
        to_year = int(to_year_str)
    except ValueError:
        return JsonResponse({"error": "from and to must be integers"}, status=400)

    if from_year < 2010 or to_year > 2024 or from_year > to_year:
        return JsonResponse({"error": "Requested year range must be within 2010-2024"}, status=400)

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
    year_str = request.GET.get("year", "2024")
    metric_key = request.GET.get("metric")
    tax_owner_key = request.GET.get("taxOwner")
    province_code = request.GET.get("province")

    if not indicator_id:
        return JsonResponse({"error": "indicatorId is required"}, status=400)

    try:
        year = int(year_str)
    except ValueError:
        return JsonResponse({"error": "year must be an integer"}, status=400)

    if year < 2010 or year > 2024:
        return JsonResponse({"error": "year must be between 2010 and 2024"}, status=400)

    rankings = query_rankings(
        indicator_key=indicator_id,
        year=year,
        metric_key=metric_key,
        tax_owner_key=tax_owner_key,
        province_code=province_code,
    )
    return JsonResponse(rankings)
