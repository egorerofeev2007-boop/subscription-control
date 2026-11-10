/* Учебная модель C06. Работает в памяти вкладки, не обращается к API. */
(function (root) {
  'use strict';
  const MIN = '2000-01-01', MAX = '2100-12-31';
  const toISO = d => d.toISOString().slice(0, 10);
  const date = s => new Date(s + 'T00:00:00Z');
  const dayNumber = s => Math.floor(date(s).getTime() / 86400000);
  function parseDate(text) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
    if (!m) return null;
    const iso = `${m[3]}-${m[2]}-${m[1]}`, d = date(iso);
    return Number.isNaN(d.getTime()) || toISO(d) !== iso || iso < MIN || iso > MAX ? null : iso;
  }
  function human(iso) { return iso ? iso.split('-').reverse().join('.') : '—'; }
  function money(value) {
    return (Number(value) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  }
  function parsePrice(text) {
    const s = text.trim().replace(',', '.');
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
    const [whole, part = ''] = s.split('.');
    const n = Number(whole) * 100 + Number(part.padEnd(2, '0'));
    return n >= 1 && n <= 99999999 ? n : null;
  }
  function priceInput(n) { return (n / 100).toFixed(2).replace('.', ','); }
  function occurrence(v, n) {
    const a = date(v.anchorDate);
    if (v.unit === 'week') return toISO(new Date(a.getTime() + n * v.count * 7 * 86400000));
    const step = v.count * (v.unit === 'year' ? 12 : 1);
    const total = a.getUTCFullYear() * 12 + a.getUTCMonth() + n * step;
    const y = Math.floor(total / 12), m = total % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return toISO(new Date(Date.UTC(y, m, Math.min(a.getUTCDate(), last))));
  }
  function startIndex(v, start) {
    if (v.unit === 'week') return Math.max(0, Math.floor((dayNumber(start) - dayNumber(v.anchorDate)) / (v.count * 7)) - 1);
    const a = date(v.anchorDate), b = date(start);
    const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
    return Math.max(0, Math.floor(months / (v.count * (v.unit === 'year' ? 12 : 1))) - 1);
  }
  function events(sub, start, end) {
    const out = [], versions = [...sub.versions].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    versions.forEach((v, i) => {
      const next = versions[i + 1]?.validFrom;
      const low = [start, v.validFrom, v.anchorDate, MIN].sort().at(-1);
      if (low > end || (next && low >= next) || (sub.deactivatedFrom && low >= sub.deactivatedFrom)) return;
      for (let n = startIndex(v, low); ; n++) {
        const d = occurrence(v, n);
        if (d > end || d > MAX || (next && d >= next) || (sub.deactivatedFrom && d >= sub.deactivatedFrom)) break;
        if (d >= low) out.push({ date: d, price: v.price, id: sub.id, name: sub.name, categoryId: sub.categoryId });
      }
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  function monthBounds(month) {
    if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month)) return null;
    const [y, m] = month.split('-').map(Number);
    return [month + '-01', toISO(new Date(Date.UTC(y, m, 0)))];
  }
  function monthEvents(subs, month) {
    const b = monthBounds(month); if (!b) return [];
    return subs.flatMap(s => events(s, ...b)).sort((a, c) => a.date.localeCompare(c.date) || a.name.localeCompare(c.name, 'ru'));
  }
  function currentVersion(sub, today) {
    if (sub.deactivatedFrom && sub.deactivatedFrom <= today) return null;
    return sub.versions.filter(v => v.validFrom <= today).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] || null;
  }
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  function average(subs, today) {
    let numerator = 0n, denominator = 1n, approximate = false;
    for (const s of subs) {
      const v = currentVersion(s, today); if (!v) continue;
      const n = BigInt(v.price) * (v.unit === 'week' ? 52n : 1n);
      const d = BigInt(v.count) * (v.unit === 'month' ? 1n : 12n);
      numerator = numerator * d + n * denominator; denominator *= d;
      const g = gcd(numerator, denominator); numerator /= g; denominator /= g;
      approximate ||= v.unit === 'week';
    }
    return { price: Number((2n * numerator + denominator) / (2n * denominator)), approximate };
  }
  function preview(v, n = 3) {
    const out = [];
    for (let i = 0; i < n; i++) { const d = occurrence(v, i); if (d > MAX) break; out.push(d); }
    return out;
  }
  function seed() {
    return {
      categories: [{ id: 'entertainment', name: 'Развлечения' }, { id: 'education', name: 'Обучение' }],
      subscriptions: [
        { id: 'video', name: 'Видео', categoryId: 'entertainment', deactivatedFrom: null, versions: [{ price: 39900, count: 1, unit: 'month', anchorDate: '2026-06-15', validFrom: '2026-06-15' }] },
        { id: 'music', name: 'Музыка', categoryId: 'entertainment', deactivatedFrom: null, versions: [{ price: 29900, count: 1, unit: 'month', anchorDate: '2026-06-15', validFrom: '2026-06-15' }] },
        { id: 'learning', name: 'Обучение', categoryId: 'education', deactivatedFrom: null, versions: [{ price: 240000, count: 1, unit: 'year', anchorDate: '2026-09-15', validFrom: '2026-09-15' }] }
      ]
    };
  }
  root.SubscriptionEngine = { MIN, MAX, parseDate, human, money, parsePrice, priceInput, occurrence, events, monthBounds, monthEvents, currentVersion, average, preview, seed };
})(typeof window === 'undefined' ? globalThis : window);
