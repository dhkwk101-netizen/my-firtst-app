from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from explorer.views import health

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health", health, name="health"),
    path("", include("explorer.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.BASE_DIR / "explorer" / "static")

