import json
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render
from django.db.models import Min, Max
from explorer.models import Observation, Indicator

def health(request: HttpRequest) -> JsonResponse:
    return JsonResponse({"status": "ok"})

def index(request: HttpRequest) -> HttpResponse:
    agg = Observation.objects.filter(status="PUBLISHED", superseded_at__isnull=True).aggregate(
        min_y=Min('period__period_start__year'),
        max_y=Max('period__period_end__year')
    )
    min_year = agg['min_y'] or 2010
    max_year = agg['max_y'] or 2026
    years = list(range(max_year, min_year - 1, -1))
    total_years = max_year - min_year + 1

    bounds = {}
    for ind in Indicator.objects.filter(status="ACTIVE"):
        i_agg = Observation.objects.filter(
            indicator=ind,
            status="PUBLISHED",
            superseded_at__isnull=True,
        ).aggregate(
            min_y=Min('period__period_start__year'),
            max_y=Max('period__period_end__year')
        )
        if i_agg['min_y'] and i_agg['max_y']:
            bounds[ind.indicator_key] = {"min": i_agg['min_y'], "max": i_agg['max_y']}

    context = {
        "min_year": min_year,
        "max_year": max_year,
        "years": years,
        "total_years": total_years,
        "indicator_bounds_json": json.dumps(bounds),
    }
    return render(request, "explorer/index.html", context)

