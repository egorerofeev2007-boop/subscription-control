from django.urls import path, re_path
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.static import serve
from .settings import MVP_FRONTEND
from mvp import views

UUID_PATTERN = r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}'

@ensure_csrf_cookie
def home(request):
    return serve(request, 'index.html', document_root=MVP_FRONTEND)

urlpatterns = [
    path('', home),
    path('index.html', home),
    path('api/login', views.login_view),
    path('api/register', views.register_view),
    path('api/logout', views.logout_view),
    path('api/state', views.state_view),
    path('api/profile', views.profile_view),
    path('api/categories', views.categories_view),
    path('api/subscriptions', views.subscriptions_view),
    re_path(rf'^api/subscriptions/(?P<subscription_id>{UUID_PATTERN})/?$', views.subscription_view),
    re_path(rf'^api/subscriptions/(?P<subscription_id>{UUID_PATTERN})/deactivate/?$', views.deactivate_view),
    re_path(r'^(?P<path>.*)$', lambda request, path='': serve(request, path or 'index.html', document_root=MVP_FRONTEND)),
]
