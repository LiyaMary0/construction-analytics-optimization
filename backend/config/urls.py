from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"status": "ok", "service": "fortesite-api"})


urlpatterns = [
    path("", health),
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    path("api/auth/", include("accounts.urls")),
    path("api/users/", include("accounts.user_urls")),
    path("api/roles/", include("accounts.role_urls")),
    path("api/attendance/", include("attendance.urls")),
    path("api/projects/", include("projects.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
