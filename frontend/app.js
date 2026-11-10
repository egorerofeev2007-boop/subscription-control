(function () {
  'use strict';
  const E = window.SubscriptionEngine, app = document.getElementById('app');
  const state = { user: null, timezone: 'Asia/Magadan', month: '', day: '', category: '', status: 'all', categories: [], subscriptions: [] };
  let lastFocus = null;
  async function api(url, method = 'GET', data) {
    const headers = {};
    if (method !== 'GET') {
      const token = document.cookie.split('; ').find(cookie => cookie.startsWith('csrftoken='));
      headers['X-CSRFToken'] = token?.slice('csrftoken='.length) || '';
    }
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const message = response.status === 403 ? 'Обновите страницу и повторите действие.' : 'Сервер не смог выполнить запрос.';
      throw new Error(result?.error || message);
    }
    return result;
  }
  function applyState(data) {
    state.user = data.email;
    state.timezone = data.timezone;
    state.categories = data.categories;
    state.subscriptions = data.subscriptions;
    if (!state.day) setCurrentDay();
  }
  function setCurrentDay() {
    state.day = today();
    state.month = state.day.slice(0, 7);
  }
  async function refreshServerState() {
    applyState(await api('/api/state'));
  }
  async function signIn(endpoint, details) {
    const data = await api(endpoint, 'POST', details);
    Object.assign(state, { category: '', status: 'all', day: '' });
    applyState(data);
    go('subscriptions');
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function today() {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: state.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = t => p.find(x => x.type === t).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  const categoryName = id => state.categories.find(c => c.id === id)?.name || 'Без категории';
  const monthName = month => new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month + '-01T00:00:00Z')).replace(' г.', '');
  const period = v => `каждые ${v.count} ${v.unit === 'month' ? 'мес.' : v.unit === 'year' ? 'г.' : 'нед.'}`;
  const active = s => !s.deactivatedFrom || s.deactivatedFrom > today();
  const versionForDisplay = s => E.currentVersion(s, today()) || [...s.versions].sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0];
  function announce(text, error = false) {
    const notice = document.getElementById('notice');
    notice.textContent = text; notice.className = 'notice' + (error ? ' failure' : ''); notice.hidden = false;
  }
  function hideNotice() { document.getElementById('notice').hidden = true; }
  function route() { return location.hash.slice(1) || 'login'; }
  function go(path) { if (route() === path) render(); else location.hash = path; }
  function heading(title, description, button = '') {
    return `<div class="page-heading"><div><h1 tabindex="-1">${title}</h1><p>${description}</p></div>${button}</div>`;
  }
  function shell(body, nav) {
    const links = [['subscriptions', '◈', 'Подписки'], ['calendar', '▦', 'Календарь'], ['expenses', '↗', 'Расходы'], ['profile', '○', 'Профиль']];
    return `<div class="shell"><aside class="sidebar"><a class="brand" href="#subscriptions"><span class="brand-mark">✓</span><span>Подписки<br>под контролем</span></a><nav aria-label="Основные разделы">${links.map(([id, icon, title]) => `<a class="nav-link ${id === nav ? 'active' : ''}" ${id === nav ? 'aria-current="page"' : ''} href="#${id}"><span class="nav-symbol" aria-hidden="true">${icon}</span>${title}</a>`).join('')}</nav><div class="sidebar-footer"><p><strong>Базовый учёт</strong></p><p class="small">Бесплатно · в рублях</p></div></aside><main id="main" class="content"><div class="top-line"><p class="small">Сегодня ${E.human(today())}</p><div class="account"><span class="avatar" aria-hidden="true">Я</span><span>${escape(state.user)}</span><button class="text-button" data-action="logout">Выйти</button></div></div>${body}</main></div>`;
  }
  function field(id, label, value = '', attrs = '', hint = '') {
    return `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id}" value="${escape(value)}" ${attrs} aria-describedby="${id}-hint ${id}-error"><small id="${id}-hint">${hint}</small><p id="${id}-error" class="error" aria-live="polite"></p></div>`;
  }
  function errors(map) {
    Object.keys(map).forEach(id => {
      const input = document.getElementById(id), label = document.getElementById(id + '-error');
      if (input) input.setAttribute('aria-invalid', 'true'); if (label) label.textContent = map[id];
    });
    const first = document.getElementById(Object.keys(map)[0]); if (first) first.focus();
  }
  function clearErrors(form) {
    form.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
    form.querySelectorAll('.error,.form-message').forEach(x => x.textContent = '');
  }
  function auth(register) {
    return `<main id="main" class="auth-shell"><section class="auth-intro"><a class="brand" href="#login"><span class="brand-mark">✓</span>Подписки под контролем</a><h1 tabindex="-1">Платежи —<br>в одном месте</h1><p>Планируйте расходы на любимые сервисы и заранее проверяйте даты продления.</p><ul><li>Подписки и личные категории</li><li>Календарь всех платежей</li><li>План месяца и средняя нагрузка</li></ul><p class="small">Базовый учёт бесплатный. Сервис не оплачивает и не отменяет подписки у поставщиков.</p></section><section class="panel auth-card"><nav class="auth-tabs" aria-label="Доступ"><a href="#login" class="${register ? '' : 'active'}">Вход</a><a href="#register" class="${register ? 'active' : ''}">Регистрация</a></nav><h2>${register ? 'Создать личный кабинет' : 'Войти в личный кабинет'}</h2><form id="auth-form" novalidate>${field('email', 'Электронная почта', '', 'type="email" maxlength="254" autocomplete="off"', 'Например, usera@example.com')}${field('password', 'Пароль', '', 'type="password" maxlength="128" autocomplete="off"', 'От 12 до 128 символов')}${register ? field('repeat', 'Повторите пароль', '', 'type="password" maxlength="128" autocomplete="off"') + timezoneField() : ''}<p id="auth-message" class="form-message" role="alert"></p><div class="actions"><button type="submit">${register ? 'Зарегистрироваться' : 'Войти'}</button></div></form>${register ? '<p class="small">После регистрации вы сможете снова войти по указанным почте и паролю.</p>' : '<div class="demo-hint"><p><strong>Посмотреть готовый пример</strong><br>Видео, музыка и обучение — без ввода личных данных.</p><button type="button" class="secondary" data-action="demo-login">Открыть демонстрационный кабинет</button><p class="small">Для проверки формы: usera@example.com<br>Пароль: TestPass123!</p></div>'}</section></main>`;
  }
  function timezoneField() {
    return `<div class="field"><label for="timezone">Часовой пояс</label><select id="timezone"><option value="Asia/Magadan" ${state.timezone === 'Asia/Magadan' ? 'selected' : ''}>Магадан UTC+11</option><option value="Europe/Moscow" ${state.timezone === 'Europe/Moscow' ? 'selected' : ''}>Москва UTC+3</option><option value="Etc/UTC" ${state.timezone === 'Etc/UTC' ? 'selected' : ''}>UTC</option></select><small>По нему определяется текущий день.</small></div>`;
  }
  function nextEvent(s) { return E.events(s, today(), E.MAX)[0]; }
  function subscriptions() {
    const events = E.monthEvents(state.subscriptions, state.month), sum = events.reduce((n, e) => n + e.price, 0);
    const avg = E.average(state.subscriptions, today());
    const next = state.subscriptions.flatMap(s => { const n = nextEvent(s); return n ? [n] : []; }).sort((a, b) => a.date.localeCompare(b.date))[0];
    const list = state.subscriptions.filter(s => (!state.category || s.categoryId === state.category) && (state.status === 'all' || active(s) === (state.status === 'active')));
    let body = heading('Мои подписки', 'Все услуги, условия и ближайшие продления.', '<button data-action="add">+ Добавить подписку</button>');
    body += `<section class="metrics" aria-label="Краткая сводка"><div class="metric accent"><p>План на ${monthName(state.month)}</p><strong>${E.money(sum)}</strong><span>Все платежи выбранного месяца</span></div><div class="metric"><p>Средняя нагрузка</p><strong>${E.money(avg.price)}</strong><span>В месяц · по активным сегодня</span></div><div class="metric"><p>Ближайший платёж</p><strong>${next ? E.human(next.date) : 'Нет платежей'}</strong><span>${next ? escape(next.name) + ' · ' + E.money(next.price) : 'Добавьте первую подписку'}</span></div></section>`;
    body += `<section class="panel"><div class="toolbar"><div class="field grow"><label for="category-filter">Категория</label><select id="category-filter"><option value="">Все категории</option>${state.categories.map(c => `<option value="${c.id}" ${state.category === c.id ? 'selected' : ''}>${escape(c.name)}</option>`).join('')}</select></div><div class="field"><label for="status-filter">Статус</label><select id="status-filter"><option value="all" ${state.status === 'all' ? 'selected' : ''}>Все подписки</option><option value="active" ${state.status === 'active' ? 'selected' : ''}>Активные</option><option value="inactive" ${state.status === 'inactive' ? 'selected' : ''}>Учёт отключён</option></select></div><button class="secondary" data-action="clear-filters">Сбросить фильтры</button></div>`;
    body += list.length ? `<table class="subscriptions"><thead><tr><th>Подписка</th><th>Условия</th><th>Следующий платёж</th><th>Статус</th><th><span class="muted">Действие</span></th></tr></thead><tbody>${list.map(s => {
      const v = versionForDisplay(s), n = nextEvent(s), status = !active(s) ? 'inactive' : v.validFrom > today() ? 'scheduled' : '';
      return `<tr><td><a href="#detail/${s.id}" class="subscription-link service-name"><span class="service-icon ${s.categoryId === 'education' ? 'education' : ''}" aria-hidden="true">${s.id === 'music' ? '♪' : s.categoryId === 'education' ? '□' : '▷'}</span><span>${escape(s.name)}<br><span class="small">${escape(categoryName(s.categoryId))}</span></span></a></td><td data-label="Условия"><span>${E.money(v.price)}<br><span class="small">${period(v)}</span></span></td><td data-label="Платёж">${n ? E.human(n.date) : '—'}</td><td data-label="Статус"><span class="badge ${status}">${!active(s) ? 'Учёт отключён' : status ? 'Запланирована' : 'Активна'}</span></td><td><a href="#detail/${s.id}" aria-label="Открыть ${escape(s.name)}">Открыть</a></td></tr>`;
    }).join('')}</tbody></table><p class="small">Показано ${list.length} из ${state.subscriptions.length}.</p>` : `<div class="empty"><h2>${state.subscriptions.length ? 'В этой категории пока пусто' : 'Пока нет подписок'}</h2><p>${state.subscriptions.length ? 'Измените фильтр или добавьте подходящую услугу.' : 'Добавьте первую услугу, чтобы увидеть календарь и план расходов.'}</p><button data-action="add">Добавить подписку</button></div>`;
    body += `<div class="category-create"><h3>Личные категории</h3><form id="category-form" class="toolbar" novalidate><div class="field grow"><label for="new-category">Название новой категории</label><input id="new-category" maxlength="50" aria-describedby="new-category-error"><p id="new-category-error" class="error" aria-live="polite"></p></div><button type="submit" class="secondary">Создать категорию</button></form></div></section><p class="small">План — ожидаемые платежи. Приложение не подтверждает фактические списания.</p>`;
    return shell(body, 'subscriptions');
  }
  function subscriptionForm(sub) {
    const v = sub ? versionForDisplay(sub) : { price: null, count: 1, unit: 'month', anchorDate: today(), validFrom: today() };
    return shell(`<a class="back-link" href="${sub ? '#detail/' + sub.id : '#subscriptions'}">← ${sub ? 'К карточке подписки' : 'К списку подписок'}</a>${heading(sub ? 'Изменить подписку' : 'Добавить подписку', sub ? 'Прошлые платежи сохраняются. Укажите дату начала новых условий.' : 'Заполните условия услуги и проверьте следующие даты.')}<div class="form-layout"><section class="panel"><form id="subscription-form" novalidate data-id="${sub?.id || ''}"><div class="form-grid"><div class="span-2">${field('name', 'Название подписки', sub?.name || '', 'maxlength="100" autocomplete="off"', 'От 1 до 100 символов')}</div>${field('price', 'Стоимость в рублях', v.price ? E.priceInput(v.price) : '', 'inputmode="decimal" autocomplete="off"', 'От 0,01 до 999 999,99; не более 2 знаков')}${field('count', 'Интервал оплаты', v.count, 'inputmode="numeric" autocomplete="off"', 'Целое число от 1 до 120')}<div class="field"><label for="unit">Единица периода</label><select id="unit"><option value="month" ${v.unit === 'month' ? 'selected' : ''}>Месяцы</option><option value="week" ${v.unit === 'week' ? 'selected' : ''}>Недели</option><option value="year" ${v.unit === 'year' ? 'selected' : ''}>Годы</option></select></div>${field('anchor', sub ? 'Исходная дата расписания' : 'Ближайшая дата платежа', E.human(v.anchorDate), 'inputmode="numeric" autocomplete="off" placeholder="ДД.ММ.ГГГГ"', sub ? 'При смене только цены оставьте прежнюю дату.' : 'ДД.ММ.ГГГГ; 2000–2100 гг.')}<div class="field span-2"><label for="category">Категория</label><select id="category"><option value="">Выберите категорию</option>${state.categories.map(c => `<option value="${c.id}" ${sub?.categoryId === c.id ? 'selected' : ''}>${escape(c.name)}</option>`).join('')}</select><p id="category-error" class="error" aria-live="polite"></p><button type="button" class="text-button" data-action="toggle-category">+ Новая категория</button><div id="inline-category" class="inline-category">${field('inline-category-name', 'Название категории', '', 'maxlength="50"')}<button type="button" class="secondary" data-action="inline-add-category">Добавить категорию</button></div></div>${sub ? '<div class="span-2">' + field('valid-from', 'Новые условия действуют с', E.human(today()), 'inputmode="numeric" placeholder="ДД.ММ.ГГГГ"', 'Не раньше текущего дня по профилю.') + '</div>' : ''}</div><p id="save-message" class="form-message" role="alert"></p><div class="actions"><button type="submit">Сохранить</button><a href="${sub ? '#detail/' + sub.id : '#subscriptions'}">Отмена</a></div></form></section><aside><section class="panel preview"><h2>Следующие даты</h2><div id="date-preview" aria-live="polite"></div><p class="explanation">Если в месяце нет исходного числа, используется последний день месяца. Затем исходная привязка возвращается.</p></section></aside></div>`, 'subscriptions');
  }
  function detail(sub) {
    const v = versionForDisplay(sub), dates = E.events(sub, today(), E.MAX).slice(0, 3);
    const future = active(sub) && v.validFrom > today();
    const priceLabel = future ? 'Ближайшая стоимость' : active(sub) ? 'Стоимость сегодня' : 'Исходные условия';
    const statusText = !active(sub) ? 'Учёт отключён с ' + E.human(sub.deactivatedFrom) : future ? 'Запланирована' : 'Активна';
    return shell(`<a class="back-link" href="#subscriptions">← К списку подписок</a>${heading(escape(sub.name), escape(categoryName(sub.categoryId)))}<div class="detail-grid"><section class="panel"><h2>Условия подписки</h2><dl class="details-list"><div><dt>${priceLabel}</dt><dd>${E.money(v.price)}</dd></div><div><dt>Период</dt><dd>${period(v)}</dd></div><div><dt>Исходная дата</dt><dd>${E.human(v.anchorDate)}</dd></div><div><dt>Статус</dt><dd><span class="badge ${!active(sub) ? 'inactive' : future ? 'scheduled' : ''}">${statusText}</span></dd></div></dl><div class="actions" style="margin-top:24px"><button data-action="edit" data-id="${sub.id}" ${active(sub) ? '' : 'disabled'}>Изменить</button><button class="secondary" data-action="deactivate" data-id="${sub.id}" ${active(sub) ? '' : 'disabled'}>Отключить учёт</button></div><p class="explanation">Отключение исключает платежи с текущего дня. Оно не отменяет услугу у поставщика.</p><button class="text-button" data-action="delete" data-id="${sub.id}" style="color:var(--danger)">Удалить подписку</button></section><section class="panel preview"><h2>Ближайшие платежи</h2>${dates.length ? '<ol>' + dates.map(x => `<li>${E.human(x.date)} · ${E.money(x.price)}</li>`).join('') + '</ol>' : '<p class="muted">Новых платежей нет.</p>'}<p class="small">На основе всех версий условий.</p></section></div><section class="panel"><h2>История условий</h2>${[...sub.versions].sort((a, b) => a.validFrom.localeCompare(b.validFrom)).map(x => `<div class="history"><p><strong>С ${E.human(x.validFrom)} — ${E.money(x.price)}, ${period(x)}</strong></p><p class="small">Привязка расписания: ${E.human(x.anchorDate)}${x.validFrom > today() ? ' · будущие условия' : ''}</p></div>`).join('')}</section>`, 'subscriptions');
  }
  function monthSwitch() {
    return `<div class="month-switch"><button class="secondary" data-action="month-prev" aria-label="Предыдущий месяц" ${state.month === '2000-01' ? 'disabled' : ''}>←</button><label for="month">Месяц</label><input type="month" id="month" min="2000-01" max="2100-12" value="${state.month}"><button class="secondary" data-action="month-next" aria-label="Следующий месяц" ${state.month === '2100-12' ? 'disabled' : ''}>→</button><button class="text-button" data-action="month-today">Текущий месяц</button></div>`;
  }
  function calendar() {
    const es = E.monthEvents(state.subscriptions, state.month), b = E.monthBounds(state.month), days = Number(b[1].slice(-2));
    const shift = (new Date(b[0] + 'T00:00:00Z').getUTCDay() + 6) % 7;
    if (!state.day.startsWith(state.month)) state.day = b[0];
    const dayEvents = es.filter(e => e.date === state.day), total = es.reduce((n, x) => n + x.price, 0);
    let grid = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(x => `<div class="weekday" aria-hidden="true">${x}</div>`).join('') + '<div class="day blank"></div>'.repeat(shift);
    for (let i = 1; i <= days; i++) {
      const d = state.month + '-' + String(i).padStart(2, '0'), rows = es.filter(x => x.date === d), sum = rows.reduce((n, e) => n + e.price, 0);
      grid += `<button class="day ${d === state.day ? 'selected' : ''} ${d === today() ? 'today' : ''}" data-action="day" data-date="${d}" aria-pressed="${d === state.day}" aria-label="${E.human(d)}, ${rows.length ? rows.length + ' платежа, ' + E.money(sum) : 'платежей нет'}"><span>${i}</span>${rows.length ? `<span class="amount">${E.money(sum)}</span><span class="count">Платежей: ${rows.length}</span>` : ''}</button>`;
    }
    return shell(`${heading('Календарь платежей', 'Выберите день, чтобы увидеть все услуги и итоговую сумму.')}${monthSwitch()}<div class="calendar-layout"><section class="panel"><h2>${monthName(state.month)}</h2><div class="calendar" role="group" aria-label="Дни месяца">${grid}</div><p class="small">За месяц: <strong>${E.money(total)}</strong></p></section><section class="panel"><h2>${E.human(state.day)}</h2>${dayEvents.length ? dayEvents.map(e => `<div class="event"><a href="#detail/${e.id}">${escape(e.name)}</a><span>${E.money(e.price)}</span></div>`).join('') + `<div class="total-row"><span>Итого за день</span><span>${E.money(dayEvents.reduce((n, x) => n + x.price, 0))}</span></div>` : '<p class="muted">В этот день платежей нет.</p>'}</section></div>`, 'calendar');
  }
  function expenses() {
    const es = E.monthEvents(state.subscriptions, state.month), total = es.reduce((n, e) => n + e.price, 0), avg = E.average(state.subscriptions, today());
    const groups = state.categories.map(c => ({ ...c, sum: es.filter(e => e.categoryId === c.id).reduce((n, e) => n + e.price, 0) })).filter(c => c.sum);
    return shell(`${heading('Расходы', 'Сравните платежи выбранного месяца со средней месячной нагрузкой.')}${monthSwitch()}<div class="expense-grid"><section class="panel"><p class="muted">План на ${monthName(state.month)}</p><div class="expense-total">${E.money(total)}</div><p class="small">${es.length ? 'Ожидаемые платежи по расписанию.' : 'В выбранном месяце платежей нет.'}</p><h2 style="margin-top:26px">По категориям</h2>${groups.length ? groups.map(c => `<div class="category-row"><div><span>${escape(c.name)}</span><strong>${E.money(c.sum)}</strong></div><div class="bar" aria-hidden="true"><span style="width:${c.sum / total * 100}%"></span></div></div>`).join('') : '<p class="muted">Нет расходов по категориям.</p>'}<div class="total-row"><span>Сумма категорий</span><span>${E.money(total)}</span></div></section><section class="panel"><h2>Средняя нагрузка</h2><div class="expense-total">${E.money(avg.price)}</div><p><strong>В месяц</strong> · по условиям, активным сегодня.</p><p class="explanation">Этот показатель не зависит от выбранного месяца. Годовая стоимость делится на 12 месяцев, месячная — на число месяцев периода.</p><p class="small">Для недель: стоимость × 52 ÷ число недель ÷ 12. Недельная оценка приблизительна.${avg.approximate ? ' В текущем наборе есть недельные подписки.' : ''}</p><p class="small">Сумма округляется до копеек после общего расчёта.</p></section></div><p class="small">План не подтверждает оплату и не списывает деньги.</p>`, 'expenses');
  }
  function profile() {
    return shell(`${heading('Профиль', 'Настройки личного кабинета и текущего дня.')}<section class="panel" style="max-width:670px"><form id="profile-form" novalidate>${field('profile-email', 'Электронная почта', state.user, 'readonly')}${timezoneField()}<button type="submit">Сохранить часовой пояс</button></form><p class="explanation">Часовой пояс сохраняется в профиле и используется для определения текущего дня.</p></section>`, 'profile');
  }
  function render() {
    const path = route();
    if (!state.user && !['login', 'register'].includes(path)) { go('login'); return; }
    const [screen, id] = path.split('/');
    if (!state.user) app.innerHTML = auth(screen === 'register');
    else if (screen === 'calendar') app.innerHTML = calendar();
    else if (screen === 'expenses') app.innerHTML = expenses();
    else if (screen === 'profile') app.innerHTML = profile();
    else if (screen === 'add') app.innerHTML = subscriptionForm(null);
    else if (['detail', 'edit'].includes(screen)) {
      const sub = state.subscriptions.find(s => s.id === id);
      app.innerHTML = sub ? (screen === 'edit' ? subscriptionForm(sub) : detail(sub)) : shell(heading('Подписка не найдена', 'Запись удалена или недоступна.') + '<a href="#subscriptions">Вернуться к списку</a>', 'subscriptions');
    } else app.innerHTML = subscriptions();
    if (screen === 'add' || screen === 'edit') updatePreview();
    app.querySelector('h1')?.focus({ preventScroll: true });
  }
  function updatePreview() {
    const out = document.getElementById('date-preview'); if (!out) return;
    const a = E.parseDate(document.getElementById('anchor').value), raw = document.getElementById('count').value;
    const count = Number(raw), unit = document.getElementById('unit').value;
    if (!a || !/^\d+$/.test(raw) || count < 1 || count > 120) { out.innerHTML = '<p class="muted">Введите допустимые дату и период.</p>'; return; }
    const sub = state.subscriptions.find(s => s.id === document.getElementById('subscription-form').dataset.id);
    const start = sub ? E.parseDate(document.getElementById('valid-from').value) : a;
    const v = { anchorDate: a, count, unit, validFrom: start || a };
    const dates = E.events({ id: 'preview', name: '', categoryId: '', versions: [{ ...v, price: 1 }] }, start || a, E.MAX).slice(0, 3);
    out.innerHTML = '<ol>' + dates.map(x => `<li>${E.human(x.date)}</li>`).join('') + '</ol>' + (dates.length < 3 ? '<p class="small">До конца 2100 года доступны только указанные даты.</p>' : '');
  }
  async function addCategory(inputId) {
    const input = document.getElementById(inputId), name = input.value.trim(), map = {};
    if (!name || name.length > 50) map[inputId] = 'Введите от 1 до 50 символов.';
    else if (state.categories.some(c => c.name === name)) map[inputId] = 'Категория с таким названием уже существует.';
    if (Object.keys(map).length) { errors(map); return; }
    try {
      const category = await api('/api/categories', 'POST', { name });
      state.categories.push(category);
      if (inputId === 'inline-category-name') {
        const select = document.getElementById('category');
        if (select) {
          select.add(new Option(category.name, category.id, true, true));
          document.getElementById('inline-category').classList.remove('open');
          input.value = '';
          select.focus();
        }
      } else render();
      announce('Категория сохранена.');
    } catch (error) {
      announce(error.message, true);
    }
  }
  async function saveSubscription(form) {
    clearErrors(form);
    const read = id => document.getElementById(id).value.trim();
    const name = read('name'), price = E.parsePrice(read('price')), count = Number(read('count')), unit = read('unit'), anchorDate = E.parseDate(read('anchor')), categoryId = read('category');
    const sub = state.subscriptions.find(s => s.id === form.dataset.id), validFrom = sub ? E.parseDate(read('valid-from')) : anchorDate, map = {};
    if (!name || name.length > 100) map.name = 'Введите название от 1 до 100 символов.';
    if (price === null) map.price = 'Введите сумму от 0,01 до 999 999,99 с точностью до 2 знаков.';
    if (!/^\d+$/.test(read('count')) || count < 1 || count > 120) map.count = 'Введите целое число от 1 до 120.';
    if (!anchorDate) map.anchor = 'Введите действительную дату ДД.ММ.ГГГГ за 2000–2100 гг.';
    if (!state.categories.some(c => c.id === categoryId)) map.category = 'Выберите категорию.';
    if (sub && (!validFrom || validFrom < today())) map['valid-from'] = 'Дата новых условий должна быть не раньше ' + E.human(today()) + '.';
    if (sub && anchorDate && validFrom) {
      const old = versionForDisplay(sub), changed = old.count !== count || old.unit !== unit || old.anchorDate !== anchorDate;
      if (changed && anchorDate < validFrom) map.anchor = 'Для нового расписания исходная дата должна быть не раньше даты новых условий.';
      if (sub.versions.some(v => v.validFrom === validFrom)) map['valid-from'] = 'На эту дату уже есть версия условий. Выберите другую дату.';
    }
    if (Object.keys(map).length) { errors(map); return; }
    const submit = form.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      const endpoint = sub ? '/api/subscriptions/' + sub.id : '/api/subscriptions';
      const data = await api(endpoint, sub ? 'PATCH' : 'POST', { name, price, count, unit, anchorDate, validFrom, categoryId });
      await refreshServerState();
      go('detail/' + (sub?.id || data.id));
      announce(sub ? 'Новые условия сохранены.' : 'Подписка сохранена.');
    } catch (error) {
      form.querySelector('#save-message').textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }
  function confirmAction(title, description, button, handler) {
    const dialog = document.getElementById('confirm-dialog'); lastFocus = document.activeElement;
    document.getElementById('dialog-title').textContent = title; document.getElementById('dialog-description').textContent = description;
    const ok = document.getElementById('dialog-confirm'); ok.textContent = button;
    ok.onclick = () => { dialog.close(); handler(); };
    document.getElementById('dialog-cancel').onclick = () => { dialog.close(); lastFocus?.focus(); };
    dialog.showModal(); document.getElementById('dialog-cancel').focus();
  }
  app.addEventListener('submit', async event => {
    event.preventDefault(); hideNotice(); const form = event.target;
    if (form.id === 'subscription-form') return saveSubscription(form);
    if (form.id === 'category-form') { clearErrors(form); return addCategory('new-category'); }
    if (form.id === 'profile-form') {
      try {
        const data = await api('/api/profile', 'PATCH', { timezone: form.querySelector('#timezone').value });
        state.timezone = data.timezone;
        setCurrentDay();
        render();
        announce('Часовой пояс сохранён.');
      } catch (error) {
        announce(error.message, true);
      }
      return;
    }
    if (form.id === 'auth-form') {
      clearErrors(form); const email = document.getElementById('email').value.trim(), password = document.getElementById('password').value, register = route() === 'register', map = {};
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) map.email = 'Введите корректную электронную почту до 254 символов.';
      if (password.length < 12 || password.length > 128) map.password = 'Пароль должен содержать от 12 до 128 символов.';
      if (register && password !== document.getElementById('repeat').value) map.repeat = 'Пароли не совпадают.';
      if (Object.keys(map).length) return errors(map);
      const details = { email, password };
      if (register) details.timezone = form.querySelector('#timezone').value;
      try {
        await signIn(register ? '/api/register' : '/api/login', details);
      } catch (error) {
        form.querySelector('#auth-message').textContent = error.message;
      }
    }
  });
  app.addEventListener('change', event => {
    if (event.target.id === 'category-filter') { state.category = event.target.value; render(); }
    if (event.target.id === 'status-filter') { state.status = event.target.value; render(); }
    if (event.target.id === 'month') {
      if (!E.monthBounds(event.target.value)) { event.target.value = state.month; announce('Выберите месяц с января 2000 по декабрь 2100.', true); }
      else { state.month = event.target.value; render(); }
    }
    if (['unit','category'].includes(event.target.id)) updatePreview();
  });
  app.addEventListener('input', event => { if (['anchor', 'count', 'valid-from'].includes(event.target.id)) updatePreview(); });
  app.addEventListener('click', async event => {
    const b = event.target.closest('[data-action]'); if (!b) return;
    const { action, id } = b.dataset, sub = state.subscriptions.find(s => s.id === id); hideNotice();
    if (action === 'demo-login' || action === 'logout') {
      try {
        if (action === 'demo-login') {
          await signIn('/api/login', { email: 'usera@example.com', password: 'TestPass123!' });
        } else {
          await api('/api/logout', 'POST');
          Object.assign(state, { user: null, subscriptions: [], categories: [], day: '', month: '' });
          go('login');
        }
      } catch (error) {
        announce(error.message, true);
      }
      return;
    }
    if (action === 'add') go('add');
    if (action === 'edit') go('edit/' + id);
    if (action === 'toggle-category') { document.getElementById('inline-category').classList.toggle('open'); document.getElementById('inline-category-name').focus(); }
    if (action === 'inline-add-category') addCategory('inline-category-name');
    if (action === 'clear-filters') { state.category = ''; state.status = 'all'; render(); }
    if (action === 'month-today') { state.month = today().slice(0, 7); state.day = today(); render(); }
    if (action === 'month-next' || action === 'month-prev') {
      const [y, m] = state.month.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + (action === 'month-next' ? 1 : -1), 1));
      const next = d.toISOString().slice(0, 7); if (E.monthBounds(next)) { state.month = next; render(); }
    }
    if (action === 'day') { state.day = b.dataset.date; render(); }
    if (sub && action === 'deactivate') {
      const description = 'Платежи «' + sub.name + '» с ' + E.human(today()) + ' исчезнут из плана. Прошлые платежи сохранятся.';
      confirmAction('Отключить учёт подписки', description, 'Отключить учёт', async () => {
        try {
          await api('/api/subscriptions/' + id + '/deactivate', 'POST');
          await refreshServerState();
          render();
          announce('Учёт отключён.');
        } catch (error) {
          announce(error.message, true);
        }
      });
    }
    if (sub && action === 'delete') {
      const description = 'Будут удалены «' + sub.name + '» и вся история условий этой подписки.';
      confirmAction('Удалить подписку', description, 'Удалить подписку', async () => {
        try {
          await api('/api/subscriptions/' + id, 'DELETE');
          await refreshServerState();
          go('subscriptions');
          announce('Подписка удалена.');
        } catch (error) {
          announce(error.message, true);
        }
      });
    }
  });
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault(); const main = document.getElementById('main');
    main.setAttribute('tabindex', '-1'); main.focus();
  });
  refreshServerState().then(render, render);
})();
