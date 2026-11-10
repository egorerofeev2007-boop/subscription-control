# Установка и запуск

## Среда

- Windows 10/11;
- Python 3.12;
- Django 5.2;
- PostgreSQL 16;
- Psycopg 3;
- браузер Chrome, Edge или Firefox;
- Git.

## PostgreSQL

Создайте базу `subscription_control`. В PowerShell из каталога `database` выполните:

```powershell
psql -U postgres -d subscription_control -v ON_ERROR_STOP=1 -f schema.sql
psql -U postgres -d subscription_control -v ON_ERROR_STOP=1 -f seed.sql
```

Повторно выполнять `schema.sql` в той же базе не нужно: он создает новую учебную схему.

## Python

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Задайте пароль PostgreSQL для запуска:

```powershell
$env:POSTGRES_PASSWORD = 'пароль_пользователя_postgres'
```

Запустите приложение:

```powershell
.\.venv\Scripts\python.exe manage.py runserver
```

Откройте `http://127.0.0.1:8000/`. Кнопка демонстрационного кабинета использует запись `usera@example.com` из seed.sql и пароль `TestPass123!`.

## Git

```powershell
git init
git add .
git commit -m "Реализован MVP учета подписок"
```

В боевой среде замените `DJANGO_SECRET_KEY`, включите HTTPS и задайте `DJANGO_DEBUG=0`.
