-- PostgreSQL 16.x, UTF-8. Проверка структуры на отдельной учебной БД.
-- Запуск после schema.sql и seed.sql: psql -v ON_ERROR_STOP=1 --csv -f verify.sql.
-- Все изменения в проверках отменяются итоговым ROLLBACK. Сеансы/HTTP/нагрузка
-- и работа резервного узла этим SQL-скриптом не испытываются.
BEGIN;
SET LOCAL search_path = subscription_control, public;
SET LOCAL TIME ZONE 'UTC';
CREATE TEMP TABLE verification_result (
    test_id text PRIMARY KEY, title text NOT NULL, expected text NOT NULL,
    actual text NOT NULL, sqlstate text NOT NULL, status text NOT NULL
) ON COMMIT DROP;
CREATE FUNCTION pg_temp.expect_state(p_id text,p_title text,p_sql text,p_expected text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_state text := '00000'; v_constraint text := ''; v_actual text;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_constraint = CONSTRAINT_NAME;
    END;
    v_actual := CASE WHEN v_state = '00000' THEN 'Принято' ELSE 'Отклонено ' || v_constraint END;
    INSERT INTO verification_result VALUES
        (p_id,p_title,p_expected,v_actual,v_state,CASE WHEN v_state=p_expected THEN 'PASS' ELSE 'FAIL' END);
END;
$f$;
CREATE FUNCTION pg_temp.expect_value(p_id text,p_title text,p_sql text,p_expected text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_actual text; v_state text := '00000';
BEGIN
    BEGIN
        EXECUTE p_sql INTO v_actual;
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_actual := 'Ошибка выполнения';
    END;
    INSERT INTO verification_result VALUES
        (p_id,p_title,p_expected,coalesce(v_actual,'NULL'),v_state,
        CASE WHEN v_state='00000' AND v_actual IS NOT DISTINCT FROM p_expected THEN 'PASS' ELSE 'FAIL' END);
END;
$f$;

DO $run$ BEGIN PERFORM pg_temp.expect_value('DB-01','Созданы девять таблиц',$q$SELECT count(*)::text FROM information_schema.tables WHERE table_schema='subscription_control' AND table_type='BASE TABLE'$q$,'9'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_value('DB-02','Число строк seed по всем таблицам',$q$SELECT concat((SELECT count(*) FROM app_user),',',(SELECT count(*) FROM category),',',(SELECT count(*) FROM subscription),',',(SELECT count(*) FROM condition_version),',',(SELECT count(*) FROM auth_session),',',(SELECT count(*) FROM request_operation),',',(SELECT count(*) FROM login_attempt),',',(SELECT count(*) FROM audit_event),',',(SELECT count(*) FROM backup_run))$q$,'2,4,4,6,1,1,1,1,1'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_value('DB-03','SELECT сохраняет кириллицу и копейки',$q$SELECT name || ':' || (SELECT price_kopecks::text FROM condition_version WHERE subscription_id='30000000-0000-0000-0000-000000000002' AND valid_from='2026-06-15') FROM subscription WHERE id='30000000-0000-0000-0000-000000000002'$q$,'Музыка:29900'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_value('DB-04','JOIN четырех сущностей: пользователь, категория, подписка, версия',$q$SELECT count(*)::text FROM app_user u JOIN subscription s ON s.owner_id=u.id JOIN category c ON c.id=s.category_id AND c.owner_id=s.owner_id JOIN condition_version v ON v.subscription_id=s.id WHERE u.id='00000000-0000-0000-0000-000000000001'$q$,'5'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-05','INSERT корректной личной категории',$q$INSERT INTO category VALUES ('20000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','Проверка')$q$,'00000'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-06','UNIQUE: та же категория у другого владельца допустима',$q$INSERT INTO category VALUES ('20000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000002','Проверка')$q$,'00000'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-07','UNIQUE: повтор категории у одного владельца запрещен',$q$INSERT INTO category VALUES ('20000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000001','Проверка')$q$,'23505'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-08','UNIQUE: почта в другом регистре запрещена',$q$INSERT INTO app_user(id,email,password_hash,timezone) VALUES ('00000000-0000-0000-0000-000000000101','USERA@example.com','synthetic_hash','Asia/Magadan')$q$,'23505'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-09','NOT NULL: email обязателен',$q$INSERT INTO app_user(id,email,password_hash,timezone) VALUES ('00000000-0000-0000-0000-000000000102',NULL,'synthetic_hash','Asia/Magadan')$q$,'23502'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-10','NOT NULL: название подписки обязательно',$q$INSERT INTO subscription(id,owner_id,category_id,name) VALUES ('30000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',NULL)$q$,'23502'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-11','FK: владелец категории должен существовать',$q$INSERT INTO category VALUES ('20000000-0000-0000-0000-000000000104','ffffffff-ffff-ffff-ffff-ffffffffffff','Нет владельца')$q$,'23503'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-12','FK: категория подписки должна существовать',$q$INSERT INTO subscription(id,owner_id,category_id,name) VALUES ('30000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000001','ffffffff-ffff-ffff-ffff-ffffffffffff','Нет категории')$q$,'23503'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-13','Составной FK: чужая категория запрещена',$q$INSERT INTO subscription(id,owner_id,category_id,name) VALUES ('30000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','Чужая категория')$q$,'23503'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-14','CHECK: пустое имя категории запрещено',$q$INSERT INTO category VALUES ('20000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000001','')$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-15','CHECK: пробелы по краям названия запрещены',$q$INSERT INTO subscription(id,owner_id,category_id,name) VALUES ('30000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',' Имя ')$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-16','Длина: 101 символ названия запрещен',$q$INSERT INTO subscription(id,owner_id,category_id,name) VALUES ('30000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',repeat('А',101))$q$,'22001'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-17','FK: версия несуществующей подписки запрещена',$q$INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit) VALUES ('40000000-0000-0000-0000-000000000101','ffffffff-ffff-ffff-ffff-ffffffffffff','2027-01-01','2026-06-15',29900,1,'month')$q$,'23503'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-18','UNIQUE: две версии на одну дату запрещены',$q$INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit) VALUES ('40000000-0000-0000-0000-000000000102','30000000-0000-0000-0000-000000000002','2026-10-01','2026-06-15',29900,1,'month')$q$,'23505'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-19','CHECK: цена 0 копеек запрещена',$q$INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit) VALUES ('40000000-0000-0000-0000-000000000103','30000000-0000-0000-0000-000000000002','2027-01-01','2026-06-15',0,1,'month')$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-20','CHECK: цена сверх 99999999 копеек запрещена',$q$INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit) VALUES ('40000000-0000-0000-0000-000000000104','30000000-0000-0000-0000-000000000002','2027-01-01','2026-06-15',100000000,1,'month')$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-21','CHECK: нижняя граница цены и периода допустима',$q$INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit) VALUES ('40000000-0000-0000-0000-000000000105','30000000-0000-0000-0000-000000000002','2027-01-01','2026-06-15',1,1,'month')$q$,'00000'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-22','CHECK: верхняя граница цены и периода допустима',$q$INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit) VALUES ('40000000-0000-0000-0000-000000000106','30000000-0000-0000-0000-000000000002','2027-02-01','2026-06-15',99999999,120,'week')$q$,'00000'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-23','CHECK: период 0 запрещен',$q$INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit) VALUES ('40000000-0000-0000-0000-000000000107','30000000-0000-0000-0000-000000000002','2027-01-01','2026-06-15',29900,0,'month')$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-24','CHECK: период 121 запрещен',$q$INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit) VALUES ('40000000-0000-0000-0000-000000000108','30000000-0000-0000-0000-000000000002','2027-01-01','2026-06-15',29900,121,'month')$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-25','CHECK: неизвестная единица периода запрещена',$q$INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit) VALUES ('40000000-0000-0000-0000-000000000109','30000000-0000-0000-0000-000000000002','2027-01-01','2026-06-15',29900,1,'day')$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-26','CHECK: дата привязки до 2000 запрещена',$q$INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit) VALUES ('40000000-0000-0000-0000-000000000110','30000000-0000-0000-0000-000000000002','2027-01-01','1999-12-31',29900,1,'month')$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-27','CHECK: дата действия после 2100 запрещена',$q$INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit) VALUES ('40000000-0000-0000-0000-000000000111','30000000-0000-0000-0000-000000000002','2101-01-01','2026-06-15',29900,1,'month')$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-28','Старая привязка новой версии цены допустима',$q$INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit) VALUES ('40000000-0000-0000-0000-000000000112','30000000-0000-0000-0000-000000000002','2027-03-01','2026-06-15',29900,1,'month')$q$,'00000'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-29','CHECK: нулевая row_version запрещена',$q$UPDATE subscription SET row_version=0 WHERE id='30000000-0000-0000-0000-000000000002'$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-30','FK: удаление используемой категории запрещено',$q$DELETE FROM category WHERE id='20000000-0000-0000-0000-000000000001'$q$,'23503'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-31','UNIQUE: повтор owner/key запрещен',$q$INSERT INTO request_operation SELECT * FROM request_operation WHERE owner_id='00000000-0000-0000-0000-000000000001'$q$,'23505'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-32','Составной FK: операция на чужую подписку запрещена',$q$INSERT INTO request_operation VALUES ('00000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000102',repeat('a',64),'30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000004',1,'2026-09-16 01:00+00')$q$,'23503'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-33','CHECK: неверный хеш ключа сеанса запрещен',$q$INSERT INTO auth_session VALUES ('50000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000001',repeat('z',64),'2026-09-16 00:00+00','2026-09-16 00:01+00',NULL)$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-34','CHECK: активность раньше создания запрещена',$q$INSERT INTO auth_session VALUES ('50000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000001',repeat('b',64),'2026-09-16 00:02+00','2026-09-16 00:01+00',NULL)$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-35','CHECK: неизвестный результат попытки входа запрещен',$q$INSERT INTO login_attempt(ip_digest,attempted_at,outcome) VALUES (repeat('c',64),'2026-09-16 01:00+00','unknown')$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-36','CHECK: неизвестное событие аудита запрещено',$q$INSERT INTO audit_event(occurred_at,event_type,result) VALUES ('2026-09-16 01:00+00','unknown','success')$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-37','CHECK: успех резервирования без завершения запрещен',$q$INSERT INTO backup_run(id,started_at,operation_type,status,archive_key) VALUES ('70000000-0000-0000-0000-000000000102','2026-09-16 01:00+00','backup','success','synthetic/test')$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-38','CHECK: завершенная успешная запись требует хеш и размер',$q$INSERT INTO backup_run(id,started_at,finished_at,operation_type,status,archive_key) VALUES ('70000000-0000-0000-0000-000000000103','2026-09-16 01:00+00','2026-09-16 01:01+00','backup','success','synthetic/test')$q$,'23514'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-39','Метаданные завершения с контрольной суммой допустимы',$q$INSERT INTO backup_run VALUES ('70000000-0000-0000-0000-000000000104','2026-09-16 01:00+00','2026-09-16 01:01+00','backup','success','synthetic/test',repeat('d',64),1024)$q$,'00000'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_value('DB-40','Условный UPDATE с актуальной версией изменяет одну строку',$q$WITH changed AS (UPDATE subscription SET row_version=row_version+1 WHERE id='30000000-0000-0000-0000-000000000002' AND owner_id='00000000-0000-0000-0000-000000000001' AND row_version=1 RETURNING id) SELECT count(*)::text FROM changed$q$,'1'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_value('DB-41','Устаревшая версия не перезаписывает строку',$q$WITH changed AS (UPDATE subscription SET name='Не должно сохраниться',row_version=row_version+1 WHERE id='30000000-0000-0000-0000-000000000002' AND owner_id='00000000-0000-0000-0000-000000000001' AND row_version=1 RETURNING id) SELECT count(*)::text FROM changed$q$,'0'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_value('DB-42','Имя после конфликта не изменилось',$q$SELECT name FROM subscription WHERE id='30000000-0000-0000-0000-000000000002'$q$,'Музыка'); END; $run$;

-- Вложенный блок PL/pgSQL создает под-транзакцию. Намеренная ошибка
-- отменяет и вставку подписки, и вставку версии; сам тест затем регистрируется.
DO $f$
DECLARE v_state text;
BEGIN
    BEGIN
        INSERT INTO subscription(id,owner_id,category_id,name) VALUES
            ('30000000-0000-0000-0000-000000000199','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Проверка отката');
        INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit)
        VALUES ('40000000-0000-0000-0000-000000000199','30000000-0000-0000-0000-000000000199','2026-09-16','2026-09-16',0,1,'month');
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
    END;
    INSERT INTO verification_result VALUES
        ('DB-43','Откат связанных вставок после ошибки','23514 и 0 строк',
        coalesce(v_state,'00000') || ' и ' || (SELECT count(*)::text FROM subscription WHERE id='30000000-0000-0000-0000-000000000199') || ' строк',
        coalesce(v_state,'00000'),CASE WHEN v_state='23514' AND NOT EXISTS
        (SELECT 1 FROM subscription WHERE id='30000000-0000-0000-0000-000000000199') THEN 'PASS' ELSE 'FAIL' END);
END;
$f$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-44','Удаление подписки с версиями и операцией',$q$DELETE FROM subscription WHERE id='30000000-0000-0000-0000-000000000002'$q$,'00000'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_value('DB-45','CASCADE удаляет все версии удаленной подписки',$q$SELECT count(*)::text FROM condition_version WHERE subscription_id='30000000-0000-0000-0000-000000000002'$q$,'0'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_value('DB-46','Ключ и исторический ID остаются, живая ссылка очищена',$q$SELECT count(*)::text FROM request_operation WHERE owner_id='00000000-0000-0000-0000-000000000001' AND operation_key='60000000-0000-0000-0000-000000000001' AND subscription_id IS NULL AND original_result_id='30000000-0000-0000-0000-000000000002'$q$,'1'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_state('DB-47','Повтор уже обработанного ключа после удаления запрещен',$q$INSERT INTO request_operation SELECT * FROM request_operation WHERE owner_id='00000000-0000-0000-0000-000000000001'$q$,'23505'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_value('DB-48','Проверка ключа не создала удаленную подписку',$q$SELECT count(*)::text FROM subscription WHERE id='30000000-0000-0000-0000-000000000002'$q$,'0'); END; $run$;

DO $run$ BEGIN PERFORM pg_temp.expect_value('DB-49','Историческая запись аудита сохранилась',$q$SELECT count(*)::text FROM audit_event WHERE object_id='30000000-0000-0000-0000-000000000002'$q$,'1'); END; $run$;

-- Единственный табличный результат предназначен для протокола проверки.
SELECT test_id,title,expected,actual,sqlstate,status FROM verification_result ORDER BY test_id;
DO $f$
BEGIN
    IF EXISTS(SELECT 1 FROM verification_result WHERE status <> 'PASS') THEN
        RAISE EXCEPTION 'Не все проверки БД прошли; см. verification_result в выводе';
    END IF;
END;
$f$;
ROLLBACK;
