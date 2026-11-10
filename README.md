# MVP «Подписки под контролем»

## Быстрый запуск

1. Установите Python 3.12 и PostgreSQL 16.
2. Создайте базу `subscription_control`.
3. Выполните `database/schema.sql`, затем `database/seed.sql`.
4. Создайте окружение и установите зависимости из `requirements.txt`.
5. Запустите `python manage.py runserver`.
6. Откройте `http://127.0.0.1:8000/`.

## Состав

- `mvp_project/` и `mvp/` — Django-конфигурация и API.
- `database/` — схема, тестовые данные и SQL-проверка из практики 6.
- `docs/mvp/` — состав MVP, запуск, тесты и ограничения.

Демо-пароль из seed.sql: `TestPass123!`.
