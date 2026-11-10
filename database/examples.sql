-- UTF-8. Примеры только чтения; фиксированная дата 16.09.2026.
-- Это запросы к данным, а не реализация C06/календаря с привязкой 31-го числа.
BEGIN READ ONLY;
SET LOCAL search_path = subscription_control, public;
SET LOCAL TIME ZONE 'UTC';
-- Количество строк в каждой таблице после seed.sql.
SELECT 'app_user' AS table_name,count(*) AS row_count FROM app_user
UNION ALL SELECT 'category',count(*) FROM category
UNION ALL SELECT 'subscription',count(*) FROM subscription
UNION ALL SELECT 'condition_version',count(*) FROM condition_version
UNION ALL SELECT 'auth_session',count(*) FROM auth_session
UNION ALL SELECT 'request_operation',count(*) FROM request_operation
UNION ALL SELECT 'login_attempt',count(*) FROM login_attempt
UNION ALL SELECT 'audit_event',count(*) FROM audit_event
UNION ALL SELECT 'backup_run',count(*) FROM backup_run;
-- Личные карточки и только действующие на эталонную дату условия: 3 строки.
WITH current_conditions AS (
    SELECT DISTINCT ON (subscription_id) *
    FROM condition_version WHERE valid_from <= DATE '2026-09-16'
    ORDER BY subscription_id,valid_from DESC
)
SELECT u.email,c.name AS category_name,s.name AS subscription_name,
       v.price_kopecks,v.period_count,v.period_unit,v.anchor_date,v.valid_from
FROM app_user u JOIN subscription s ON s.owner_id=u.id
JOIN category c ON c.id=s.category_id AND c.owner_id=s.owner_id
JOIN current_conditions v ON v.subscription_id=s.id
WHERE u.id='00000000-0000-0000-0000-000000000001'
ORDER BY s.id;
-- Средняя месячная нагрузка 89800 копеек = 898,00 руб.
-- Суммируются точные numeric-вклады, округляется только общий результат.
WITH current_conditions AS (
    SELECT DISTINCT ON (subscription_id) *
    FROM condition_version WHERE valid_from <= DATE '2026-09-16'
    ORDER BY subscription_id,valid_from DESC
)
SELECT round(coalesce(sum(CASE v.period_unit
    WHEN 'month' THEN v.price_kopecks::numeric/v.period_count
    WHEN 'year' THEN v.price_kopecks::numeric/(v.period_count*12)
    WHEN 'week' THEN v.price_kopecks::numeric*52/(v.period_count*12)
END),0),0)::bigint AS average_kopecks
FROM subscription s JOIN current_conditions v ON v.subscription_id=s.id
WHERE s.owner_id='00000000-0000-0000-0000-000000000001'
  AND (s.deactivated_from IS NULL OR s.deactivated_from > DATE '2026-09-16');
-- Метаданные ключа: действующий результат есть, исходный ID равен ссылке.
SELECT owner_id,operation_key,original_result_id,subscription_id,result_version
FROM request_operation
WHERE owner_id='00000000-0000-0000-0000-000000000001';
COMMIT;
