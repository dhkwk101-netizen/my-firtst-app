from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render
from django.db.models import Min, Max
from explorer.models import Observation

def health(request: HttpRequest) -> JsonResponse:
    return JsonResponse({"status": "ok"})

def index(request: HttpRequest) -> HttpResponse:
    agg = Observation.objects.aggregate(
        min_y=Min('period__period_start__year'),
        max_y=Max('period__period_end__year')
    )
    min_year = agg['min_y'] or 2010
    max_year = min(agg['max_y'] or 2024, 2024)
    years = list(range(max_year, min_year - 1, -1))
    total_years = max_year - min_year + 1
    
    context = {
        "min_year": min_year,
        "max_year": max_year,
        "years": years,
        "total_years": total_years,
    }
    return render(request, "explorer/index.html", context)
