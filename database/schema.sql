-- Практическая работа № 6. PostgreSQL 16.x. Кодировка файла UTF-8.
-- Выполнять в отдельной новой учебной БД: psql -v ON_ERROR_STOP=1 -f schema.sql.
-- Существующие объекты и базы не удаляются. Повторный запуск DDL отклоняется.
-- В приложении эта схема оформляется миграциями Django; данный файл — учебная
-- физическая модель, а не замена миграциям или проверкам HTTP/авторизации.
BEGIN;
CREATE SCHEMA subscription_control;
SET LOCAL search_path = subscription_control, public;

CREATE TABLE app_user (
    id uuid PRIMARY KEY,
    email varchar(254) NOT NULL,
    password_hash varchar(256) NOT NULL,
    timezone varchar(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    blocked_until timestamptz,
    CONSTRAINT ck_user_email CHECK (email = btrim(email) AND char_length(email) BETWEEN 1 AND 254),
    CONSTRAINT ck_user_password_hash CHECK (btrim(password_hash) <> ''),
    CONSTRAINT ck_user_timezone CHECK (timezone = btrim(timezone) AND timezone <> '')
);
CREATE UNIQUE INDEX uq_user_email_lower ON app_user (lower(email));

CREATE TABLE category (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    name varchar(50) NOT NULL,
    CONSTRAINT ck_category_name CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 50),
    CONSTRAINT uq_category_owner_name UNIQUE (owner_id, name),
    CONSTRAINT uq_category_id_owner UNIQUE (id, owner_id)
);

CREATE TABLE subscription (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    category_id uuid NOT NULL,
    name varchar(100) NOT NULL,
    deactivated_from date,
    row_version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_subscription_id_owner UNIQUE (id, owner_id),
    CONSTRAINT fk_subscription_owned_category FOREIGN KEY (category_id, owner_id)
        REFERENCES category(id, owner_id) ON DELETE RESTRICT,
    CONSTRAINT ck_subscription_name CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 100),
    CONSTRAINT ck_subscription_deactivated CHECK (deactivated_from IS NULL OR
        deactivated_from BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
    CONSTRAINT ck_subscription_row_version CHECK (row_version >= 1),
    CONSTRAINT ck_subscription_times CHECK (updated_at >= created_at)
);
CREATE INDEX ix_subscription_owner_category_id ON subscription(owner_id, category_id, id);

CREATE TABLE condition_version (
    id uuid PRIMARY KEY,
    subscription_id uuid NOT NULL REFERENCES subscription(id) ON DELETE CASCADE,
    valid_from date NOT NULL,
    anchor_date date NOT NULL,
    price_kopecks bigint NOT NULL,
    period_count smallint NOT NULL,
    period_unit varchar(5) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_condition_subscription_valid_from UNIQUE (subscription_id, valid_from),
    CONSTRAINT ck_condition_valid_from CHECK (valid_from BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
    CONSTRAINT ck_condition_anchor_date CHECK (anchor_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
    CONSTRAINT ck_condition_price CHECK (price_kopecks BETWEEN 1 AND 99999999),
    CONSTRAINT ck_condition_period_count CHECK (period_count BETWEEN 1 AND 120),
    CONSTRAINT ck_condition_period_unit CHECK (period_unit IN ('week', 'month', 'year'))
);
-- UNIQUE(subscription_id, valid_from) одновременно является индексом выборки версий.
-- anchor_date не сравнивается с valid_from: при изменении только цены привязка сохраняется.

CREATE TABLE auth_session (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CONSTRAINT ck_session_token_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_session_times CHECK (last_seen_at >= created_at AND
        (revoked_at IS NULL OR revoked_at >= last_seen_at))
);
CREATE INDEX ix_session_user ON auth_session(user_id);
CREATE INDEX ix_session_last_seen ON auth_session(last_seen_at);

CREATE TABLE request_operation (
    owner_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    operation_key uuid NOT NULL,
    payload_hash char(64) NOT NULL,
    original_result_id uuid NOT NULL,
    subscription_id uuid,
    result_version bigint NOT NULL,
    completed_at timestamptz NOT NULL,
    CONSTRAINT pk_request_operation PRIMARY KEY (owner_id, operation_key),
    CONSTRAINT fk_operation_owned_subscription FOREIGN KEY (subscription_id, owner_id)
        REFERENCES subscription(id, owner_id) ON DELETE SET NULL (subscription_id),
    CONSTRAINT ck_operation_hash CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_operation_version CHECK (result_version >= 1),
    CONSTRAINT ck_operation_result CHECK (subscription_id IS NULL OR subscription_id = original_result_id)
);
CREATE INDEX ix_operation_subscription ON request_operation(subscription_id) WHERE subscription_id IS NOT NULL;
-- NULL subscription_id — обработанный результат удален; original_result_id и ключ
-- остаются историческими. C04 возвращает результат/отметку удаления, не делает новый INSERT.

CREATE TABLE login_attempt (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
    ip_digest char(64) NOT NULL,
    attempted_at timestamptz NOT NULL,
    outcome varchar(16) NOT NULL,
    CONSTRAINT ck_login_ip_digest CHECK (ip_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_login_outcome CHECK (outcome IN ('ok', 'wrong_password', 'blocked', 'invalid'))
);
CREATE INDEX ix_login_account_time ON login_attempt(account_id, attempted_at);
CREATE INDEX ix_login_ip_time ON login_attempt(ip_digest, attempted_at);
CREATE INDEX ix_login_time ON login_attempt(attempted_at);
-- ip_digest в рабочей системе — HMAC IP с серверным секретом; не простой SHA IP.
-- C03 сериализует проверки по учетной записи и IP; C09 удаляет попытки старше 15 минут.

CREATE TABLE audit_event (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at timestamptz NOT NULL,
    event_type varchar(32) NOT NULL,
    actor_id uuid,
    object_type varchar(32),
    object_id uuid,
    result varchar(7) NOT NULL,
    CONSTRAINT ck_audit_event_type CHECK (event_type IN ('login', 'login_refused', 'logout',
        'access_denied', 'subscription_created', 'subscription_changed',
        'subscription_deactivated', 'subscription_deleted', 'backup', 'restore')),
    CONSTRAINT ck_audit_result CHECK (result IN ('success', 'failure', 'denied')),
    CONSTRAINT ck_audit_object_type CHECK (object_type IS NULL OR
        (object_type = btrim(object_type) AND object_type <> '')),
    CONSTRAINT ck_audit_object_pair CHECK ((object_type IS NULL) = (object_id IS NULL))
);
CREATE INDEX ix_audit_time ON audit_event(occurred_at);
CREATE INDEX ix_audit_actor_time ON audit_event(actor_id, occurred_at);
-- actor_id/object_id — исторические ID без FK; удаление объектов не уничтожает аудит.
-- Пароли, cookie, IP, названия и цены подписок в аудит не записываются. Срок — 30 дней.

CREATE TABLE backup_run (
    id uuid PRIMARY KEY,
    started_at timestamptz NOT NULL,
    finished_at timestamptz,
    operation_type varchar(7) NOT NULL,
    status varchar(7) NOT NULL,
    archive_key varchar(200) NOT NULL,
    checksum char(64),
    bytes_count bigint,
    CONSTRAINT ck_backup_operation CHECK (operation_type IN ('backup', 'restore')),
    CONSTRAINT ck_backup_status CHECK (status IN ('running', 'success', 'failure')),
    CONSTRAINT ck_backup_key CHECK (archive_key = btrim(archive_key) AND archive_key <> ''),
    CONSTRAINT ck_backup_checksum CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_backup_bytes CHECK (bytes_count IS NULL OR bytes_count >= 0),
    CONSTRAINT ck_backup_finish CHECK ((status = 'running' AND finished_at IS NULL) OR
        (status IN ('success', 'failure') AND finished_at IS NOT NULL AND finished_at >= started_at)),
    CONSTRAINT ck_backup_success CHECK (status <> 'success' OR (checksum IS NOT NULL AND bytes_count IS NOT NULL))
);
CREATE INDEX ix_backup_started ON backup_run(started_at);
-- Здесь только метаданные. Файл резервной копии размещается на другом узле,
-- шифрование/расписание/7 копий/очистка/восстановление реализуются C09, не CHECK.
COMMIT;
