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
    max_bound = agg['max_y'] or 2026
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
    from explorer.updater import sync_population_year, sync_fiscal_year, sync_economy_year
    category = request.POST.get("category") or request.GET.get("category") or "POPULATION"
    year_str = request.POST.get("year") or request.GET.get("year") or "2025"
    try:
        year = int(year_str)
    except ValueError:
        return JsonResponse({"success": False, "error": "Invalid year"}, status=400)

    if category == "POPULATION":
        res = sync_population_year(year)
        return JsonResponse(res)
    elif category == "FISCAL":
        res = sync_fiscal_year(year)
        return JsonResponse(res)
    elif category == "ECONOMY":
        res = sync_economy_year(year)
        return JsonResponse(res)
    else:
        return JsonResponse({
            "success": False,
            "message": f"'{category}' 지표는 아직 정부(통계청/행안부)에서 {year}년 자료를 공표하지 않았거나 수기 공표 항목입니다."
        })


def api_drive_status(request: HttpRequest) -> JsonResponse:
    """Returns Google Drive integration status and recent files."""
    from explorer.drive_client import drive_client
    try:
        files = drive_client.list_folder_files()
        return JsonResponse({
            "connected": True,
            "folderId": drive_client.folder_id,
            "files": files,
        })
    except Exception as e:
        return JsonResponse({
            "connected": False,
            "folderId": drive_client.folder_id,
            "error": str(e),
        })


@csrf_exempt
def api_drive_upload(request: HttpRequest) -> JsonResponse:
    """Uploads CSV, raw JSON dataset, or custom content directly to Google Drive."""
    import json
    from explorer.drive_client import drive_client

    if request.method != "POST":
        return JsonResponse({"error": "POST method required"}, status=405)

    try:
        data = json.loads(request.body.decode("utf-8")) if request.body else {}
    except Exception:
        data = request.POST.dict()

    action = request.POST.get("action") or data.get("action", "csv")
    filename = request.POST.get("filename") or data.get("filename", "kosis_export.csv")

    try:
        # 1. Handle file uploaded via FormData (multipart/form-data, e.g. webm video, png image)
        if "file" in request.FILES:
            uploaded_file = request.FILES["file"]
            file_bytes = uploaded_file.read()
            mimetype = uploaded_file.content_type
            if not mimetype:
                if filename.endswith(".png"):
                    mimetype = "image/png"
                elif filename.endswith(".jpg") or filename.endswith(".jpeg"):
                    mimetype = "image/jpeg"
                elif filename.endswith(".webm"):
                    mimetype = "video/webm"
                else:
                    mimetype = "application/octet-stream"

            res = drive_client.upload_bytes(
                data=file_bytes,
                remote_name=filename,
                mimetype=mimetype,
                overwrite=True
            )
            return JsonResponse({
                "success": True,
                "file": res,
                "message": f"구글 드라이브(STATRACE)에 '{filename}' 파일 저장 완료!"
            })


        # 2. Handle raw_zip archive
        if action == "raw_zip":
            from upload_results_to_drive import archive_and_upload
            res = archive_and_upload(archive_name=filename)
            return JsonResponse({
                "success": True,
                "file": res,
                "message": f"성공적으로 구글 드라이브에 {filename} 파일을 업로드했습니다!"
            })

        # 3. Direct text/json/csv content upload
        content = data.get("content", "")
        content_bytes = content.encode("utf-8")
        mimetype = "text/csv;charset=utf-8" if filename.endswith(".csv") else "application/json;charset=utf-8"
        res = drive_client.upload_bytes(
            data=content_bytes,
            remote_name=filename,
            mimetype=mimetype,
            overwrite=True
        )
        return JsonResponse({
            "success": True,
            "file": res,
            "message": f"구글 드라이브 '{filename}' 업로드 완료!"
        })
    except Exception as e:
        return JsonResponse({
            "success": False,
            "error": str(e)
        }, status=500)


