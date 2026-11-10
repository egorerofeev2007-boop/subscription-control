from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent
secret_key_file = os.environ.get('DJANGO_SECRET_KEY_FILE')
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY') or (
    Path(secret_key_file).read_text(encoding='utf-8').strip()
    if secret_key_file else 'dev-only-change-me'
)
DEBUG = os.environ.get('DJANGO_DEBUG', '1') == '1'
ALLOWED_HOSTS = [x for x in os.environ.get('DJANGO_ALLOWED_HOSTS', '127.0.0.1,localhost').split(',') if x]
ROOT_URLCONF = 'mvp_project.urls'
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
]
INSTALLED_APPS = ['django.contrib.sessions', 'django.contrib.contenttypes', 'mvp']
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('POSTGRES_DB', 'subscription_control'),
        'USER': os.environ.get('POSTGRES_USER', 'postgres'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
        'HOST': os.environ.get('POSTGRES_HOST', '127.0.0.1'),
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        'OPTIONS': {'options': '-c search_path=subscription_control,public'},
    }
}
SESSION_ENGINE = 'django.contrib.sessions.backends.signed_cookies'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'
LANGUAGE_CODE = 'ru-ru'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MVP_FRONTEND = BASE_DIR / 'frontend'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
