// Calendar 6 front end. Everything comes from the five endpoints in calendar/php/:
// config.php and calendar.php (JSON), html.php (pages, by key), get.php (other files,
// by key) and auth.php (not used yet). Course files are never fetched by path.

const API = 'calendar/php/';
const LIBS = {              // vendored in app/vendor/, so the site needs no other host
  hljs: 'app/vendor/highlight/highlight.min.js',
  hljsLight: 'app/vendor/highlight/github.min.css',
  hljsDark: 'app/vendor/highlight/github-dark.min.css',
  mathjax: 'app/vendor/mathjax/tex-chtml.js',
};
const REFRESH_MS = 5 * 60 * 1000;

const main = document.getElementById('main');
const state = {
  config: null,
  cal: null,
  calText: '',          // the last calendar.php body, to skip re-rendering when unchanged
  calLoaded: 0,
  keys: new Map(),      // file key -> {event, box} | {page}
  section: store('section') || '',
  view: store('view') || (matchMedia('(max-width: 760px)').matches ? 'list' : 'grid'),
  hiddenTypes: new Set(),
  query: '',
  showPast: false,      // earlier weeks are folded away until asked for
  calScroll: null,      // scroll position of the calendar, restored when coming back
  onCalendar: false,
};
let navToken = 0;

/* ---------- small helpers ---------- */

function store(name, value) {
  try {
    if (value === undefined) return localStorage.getItem('cal6.' + name);
    if (value === null || value === '') localStorage.removeItem('cal6.' + name);
    else localStorage.setItem('cal6.' + name, value);
  } catch { /* storage may be unavailable */ }
  return null;
}

// h('a', {class: 'x', href: '#/'}, 'text', child, ...): strings always become text nodes.
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat(Infinity).filter(k => k != null && k !== false));
  return el;
}

async function api(path, init) {
  const r = await fetch(API + path, {credentials: 'same-origin', ...init});
  if (!r.ok) {
    let message = '';
    try { message = (await r.clone().json()).error; } catch { /* not JSON */ }
    throw Object.assign(new Error(message || r.statusText), {status: r.status, response: r});
  }
  return r;
}

const getUrl = (key, download) => `${API}get.php?file=${encodeURIComponent(key)}${download ? '&download=1' : ''}`;
const eventRoute = (id, box) => `#/event/${encodeURIComponent(id)}${box ? '/' + encodeURIComponent(box) : ''}`;

/* ---------- dates (all plain YYYY-MM-DD strings, in the course's timezone) ---------- */

const toDate = s => new Date(s + 'T00:00:00Z');
const toStr = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return toStr(d); };
const weekday = s => (toDate(s).getUTCDay() + 6) % 7;            // Monday = 0
const monday = s => addDays(s, -weekday(s));
const fmt = (s, opts) => new Intl.DateTimeFormat(undefined, {timeZone: 'UTC', ...opts}).format(toDate(s));
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function today() {
  const tz = state.config?.course.timezone;
  try {
    return new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  } catch {
    return toStr(new Date());
  }
}

function relativeDay(date) {
  const t = today();
  if (date === t) return 'Today';
  if (date === addDays(t, 1)) return 'Tomorrow';
  return fmt(date, {weekday: 'long', month: 'short', day: 'numeric'});
}

/* ---------- data ---------- */

async function loadConfig() {
  const config = await (await api('config.php')).json();
  const before = state.config?.version.software;
  if (before && before !== config.version.software) { location.reload(); return; }
  state.config = config;
}

// Returns true when the calendar changed.
async function loadCalendar() {
  let r;
  try {
    r = await api('calendar.php' + (state.section ? '?section=' + encodeURIComponent(state.section) : ''));
  } catch (e) {
    if (e.status === 404 && state.section) {       // the remembered section no longer exists
      state.section = '';
      store('section', null);
      return loadCalendar();
    }
    throw e;
  }
  const text = await r.text();
  state.calLoaded = Date.now();
  if (text === state.calText) return false;
  state.calText = text;
  state.cal = JSON.parse(text);
  state.keys = new Map();
  for (const [name, page] of Object.entries(state.cal.pages)) {
    if (page.key) state.keys.set(page.key, {page: name});
  }
  for (const [id, ev] of Object.entries(state.cal.events)) {
    for (const box of ev.boxes) state.keys.set(box.key, {event: id, box: box.box});
  }
  return true;
}

async function refresh() {
  try {
    await loadConfig();
    const changed = await loadCalendar();
    renderChrome();
    if (changed && state.onCalendar) renderCalendar();
  } catch { /* keep showing what we have */ }
}

const typeLabel = type => state.config.types[type]?.label || type;
const typeClass = type => 't' + Math.max(0, Object.keys(state.config.types).indexOf(type)) % 6;
const boxLabel = id => state.config.boxes.find(b => b.box === id)?.label || id;
const eventName = ev => `${typeLabel(ev.type)} ${ev.number}`;
const canOpen = ev => ev.boxes.length > 0 || (ev.notes || []).some(n => n.text.trim());

function boxHref(eventId, box) {
  return box.kind === 'html' ? eventRoute(eventId, box.box) : getUrl(box.key);
}

/* ---------- header ---------- */

function renderChrome() {
  const {config, cal} = state;
  document.getElementById('brand-number').textContent = config.course.number;
  document.getElementById('brand-name').textContent = config.course.name;

  const nav = document.getElementById('site-nav');
  nav.replaceChildren(
    h('a', {href: '#/', 'data-nav': 'calendar'}, 'Calendar'),
    ...config.pages.filter(p => cal.pages[p.page]?.key).map(p =>
      h('a', {href: '#/page/' + encodeURIComponent(p.page), 'data-nav': 'page:' + p.page}, p.label)),
  );
  markNav();

  const picker = document.getElementById('section-picker');
  const select = document.getElementById('section-select');
  picker.hidden = config.sections.length === 0;
  select.replaceChildren(
    h('option', {value: ''}, 'All (no times)'),
    ...config.sections.map(s => h('option', {value: s.section}, s.instructor ? `${s.section} · ${s.instructor}` : s.section)),
  );
  select.value = state.section;

  const viewer = document.getElementById('viewer');
  viewer.hidden = !cal.viewer.user;
  viewer.textContent = cal.viewer.user ? cal.viewer.user + (cal.viewer.instructor ? ' (instructor)' : '') : '';
}

let currentNav = 'calendar';
function markNav(name) {
  if (name !== undefined) currentNav = name;
  for (const a of document.querySelectorAll('#site-nav a')) {
    if (a.dataset.nav === currentNav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

document.getElementById('section-select').addEventListener('change', async e => {
  state.section = e.target.value;
  store('section', state.section);
  await loadCalendar();
  route(true);
});

/* ---------- routing ---------- */

function parseRoute() {
  let s = location.hash.replace(/^#\/?/, '');
  let anchor = '', query = '';
  const a = s.indexOf('#');
  if (a >= 0) { anchor = s.slice(a + 1); s = s.slice(0, a); }
  const q = s.indexOf('?');
  if (q >= 0) { query = s.slice(q + 1); s = s.slice(0, q); }
  const parts = s.split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } });
  return {parts, query, anchor};
}

function route(keepScroll) {
  const token = ++navToken;
  const {parts, query, anchor} = parseRoute();
  if (state.onCalendar) state.calScroll = scrollY;
  state.onCalendar = false;

  if (parts.length === 0 || parts[0] === 'calendar') {
    state.onCalendar = true;
    markNav('calendar');
    document.title = `${state.config.course.number} · Calendar`;
    renderCalendar();
    if (!keepScroll) {
      scrollTo(0, state.calScroll || 0);
    }
    return;
  }
  if (parts[0] === 'event' && parts[1]) return showEvent(token, parts[1], parts[2], query, anchor);
  if (parts[0] === 'page' && parts[1]) {
    const page = state.cal.pages[parts[1]];
    if (page?.key) return showDoc(token, {key: page.key, query, anchor, page: parts[1]});
  }
  if (parts[0] === 'view' && parts[1]) {
    const known = state.keys.get(parts[1]);
    if (known?.event) return showEvent(token, known.event, known.box, query, anchor);
    return showDoc(token, {key: parts[1], query, anchor, page: known?.page});
  }
  markNav('');
  main.replaceChildren(notice('Page not found', 'That address does not match anything on this site.'));
}

function notice(title, text) {
  return h('div', {class: 'notice'},
    h('h1', null, title),
    h('p', null, text),
    h('p', null, h('a', {class: 'button', href: '#/'}, 'Back to the calendar')));
}

/* ---------- calendar ---------- */

function matches(item) {
  if (state.hiddenTypes.has(item.type)) return false;
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return `${eventName(item)} ${item.title}`.toLowerCase().includes(q);
}

function renderCalendar() {
  const {config, cal} = state;
  const usedTypes = Object.keys(config.types).filter(t => Object.values(cal.events).some(e => e.type === t));

  const toolbar = h('div', {class: 'toolbar'},
    h('div', {class: 'toolbar-group'},
      h('button', {class: 'button', type: 'button', onclick: () => scrollToToday(true)}, 'Today'),
      h('div', {class: 'segmented', role: 'group', 'aria-label': 'View'},
        ['grid', 'list'].map(v => h('button', {
          type: 'button', 'aria-pressed': String(state.view === v),
          onclick: () => { state.view = v; store('view', v); renderCalendar(); },
        }, v === 'grid' ? 'Weeks' : 'List')))),
    h('div', {class: 'toolbar-group legend'},
      usedTypes.map(t => h('button', {
        type: 'button', class: 'legend-item ' + typeClass(t), 'aria-pressed': String(!state.hiddenTypes.has(t)),
        title: 'Show or hide ' + typeLabel(t),
        onclick: () => { state.hiddenTypes.has(t) ? state.hiddenTypes.delete(t) : state.hiddenTypes.add(t); renderCalendar(); },
      }, h('span', {class: 'dot'}), typeLabel(t)))),
    h('input', {
      class: 'search', type: 'search', placeholder: 'Filter by title…', 'aria-label': 'Filter events by title', value: state.query,
      oninput: e => { state.query = e.target.value; renderBody(); },
    }));

  const body = h('div', {id: 'cal-body'});
  main.replaceChildren(upNext(), toolbar, body);
  renderBody();

  function renderBody() {
    body.replaceChildren(state.view === 'grid' ? renderGrid() : renderList());
  }
}

function scrollToToday(smooth) {
  const el = document.querySelector('.is-today') || document.querySelector('.is-current-week');
  if (el) el.scrollIntoView({block: 'center', behavior: smooth ? 'smooth' : 'auto'});
  else scrollTo(0, 0);
}

// The next day that has something on it, with direct links to its material.
function upNext() {
  const {cal} = state;
  const t = today();
  const date = Object.keys(cal.days).find(d => d >= t && cal.days[d].some(i => i.event));
  if (!date) return null;
  return h('section', {class: 'upnext'},
    h('h2', {class: 'upnext-when'}, relativeDay(date)),
    h('div', {class: 'upnext-cards'},
      cal.days[date].filter(i => i.event).map(item => {
        const ev = cal.events[item.event];
        return h('article', {class: 'card ' + typeClass(ev.type)},
          h('div', {class: 'card-kind'}, eventName(ev), meetingText(item) && h('span', {class: 'card-time'}, meetingText(item))),
          h('h3', null, canOpen(ev) ? h('a', {href: eventRoute(item.event)}, ev.title || eventName(ev)) : (ev.title || eventName(ev))),
          ev.boxes.length
            ? h('div', {class: 'box-links'}, ev.boxes.map(b => boxLink(item.event, b)))
            : h('p', {class: 'muted'}, 'Material is not available yet.'));
      })));
}

function meetingText(item) {
  const parts = [];
  if (item.cancelled) parts.push('Cancelled');
  else if (item.start) parts.push(`${item.start}–${item.end}`);
  if (item.room) parts.push(item.room);
  return parts.join(' · ');
}

function boxLink(eventId, box) {
  const external = box.kind !== 'html';
  return h('a', {
    class: 'box-link' + (box.visible === false ? ' is-hidden-item' : ''),
    href: boxHref(eventId, box),
    target: external ? '_blank' : null,
    title: box.visible === false ? hiddenHint(box) : box.filename,
  }, boxLabel(box.box), external && h('span', {class: 'ext', 'aria-hidden': 'true'}, fileTag(box.filename)));
}

const fileTag = name => (name.includes('.') ? name.split('.').pop() : 'file').toUpperCase();
const hiddenHint = item => item.opens
  ? 'Hidden from students until ' + new Date(item.opens).toLocaleString()
  : 'Hidden from students';

function eventChip(item, compact) {
  const ev = state.cal.events[item.event];
  const open = canOpen(ev);
  const inner = [
    h('span', {class: 'chip-kind'}, eventName(ev)),
    item.start && !item.cancelled && h('span', {class: 'chip-time'}, item.start),
    item.cancelled && h('span', {class: 'chip-flag'}, 'Cancelled'),
    h('span', {class: 'chip-title'}, ev.title),
  ];
  const cls = `chip ${typeClass(ev.type)}${open ? '' : ' is-locked'}${item.cancelled ? ' is-cancelled' : ''}`;
  const chip = open
    ? h('a', {class: cls, href: eventRoute(item.event)}, inner)
    : h('div', {class: cls, title: 'Not available yet'}, inner);
  const extras = ev.boxes.slice(1);
  if (compact && extras.length === 0) return chip;
  return h('div', {class: 'chip-wrap'}, chip,
    extras.length > 0 && h('div', {class: 'box-links small'}, extras.map(b => boxLink(item.event, b))));
}

function weeks() {
  const {semester} = state.config;
  const out = [];
  for (let start = monday(semester.start), n = 1; start <= semester.end; start = addDays(start, 7), n++) out.push({start, n});
  return out;
}

// The weeks to draw: from last week on, unless earlier weeks were asked for (or a
// filter is on, which searches the whole semester). Returns the weeks and a button
// that unfolds the rest.
function shownWeeks() {
  const all = weeks();
  const from = addDays(monday(today()), -7);
  const filtering = state.query.trim() !== '';
  const folded = state.showPast || filtering || from > state.config.semester.end ? 0 : all.filter(w => w.start < from).length;
  const more = folded > 0 && h('button', {
    class: 'show-past', type: 'button',
    onclick: () => { state.showPast = true; const y = document.documentElement.scrollHeight - scrollY; renderCalendar(); scrollTo(0, document.documentElement.scrollHeight - y); },
  }, `Show ${folded} earlier week${folded === 1 ? '' : 's'}`);
  return {list: all.slice(folded), more};
}

function markerText(marker) {
  if (!marker) return '';
  if (marker.label) return marker.label;
  if (marker.title === 'holiday') return 'Holiday';
  if (marker.schedule) return state.config.periods[marker.schedule]?.label || marker.schedule;
  return '';
}

function renderGrid() {
  const {config, cal} = state;
  const cols = config.semester.weekends ? 7 : 5;
  const t = today();
  const {list: shown, more} = shownWeeks();
  const grid = h('div', {class: 'grid', style: `--cols:${cols}`},
    h('div', {class: 'grid-head'}, h('div', {class: 'gutter'}), WEEKDAYS.slice(0, cols).map(d => h('div', null, d))),
    more);
  let lastMonth = '';
  for (const week of shown) {
    const isCurrent = t >= week.start && t <= addDays(week.start, 6);
    const month = fmt(addDays(week.start, cols - 1), {month: 'short'});
    const row = h('div', {class: 'week' + (isCurrent ? ' is-current-week' : '')},
      h('div', {class: 'gutter'},
        month !== lastMonth && h('span', {class: 'gutter-month'}, month),
        h('span', {class: 'gutter-week'}, 'Wk ' + week.n)));
    lastMonth = month;
    for (let i = 0; i < cols; i++) {
      const date = addDays(week.start, i);
      const items = cal.days[date];
      if (!items) { row.append(h('div', {class: 'day is-outside'})); continue; }
      const marker = items.find(x => !x.event);
      const events = items.filter(x => x.event && matches(x));
      const day = toDate(date).getUTCDate();
      row.append(h('div', {
        class: 'day' + (date === t ? ' is-today' : '') + (date < t ? ' is-past' : '') + (marker?.title === 'holiday' ? ' is-holiday' : ''),
      },
        h('div', {class: 'day-head'},
          h('span', {class: 'day-num'}, day === 1 ? fmt(date, {month: 'short', day: 'numeric'}) : String(day)),
          markerText(marker) && h('span', {class: 'day-label'}, markerText(marker))),
        events.map(item => eventChip(item, true))));
    }
    grid.append(row);
  }
  return grid;
}

function renderList() {
  const {cal} = state;
  const t = today();
  const {list: shown, more} = shownWeeks();
  const list = h('div', {class: 'list'}, more);
  for (const week of shown) {
    const rows = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(week.start, i);
      const items = cal.days[date];
      if (!items) continue;
      const marker = items.find(x => !x.event);
      const events = items.filter(x => x.event && matches(x));
      if (!events.length && !(markerText(marker) && !state.query && !state.hiddenTypes.size)) continue;
      rows.push(h('div', {class: 'list-day' + (date === t ? ' is-today' : '') + (date < t ? ' is-past' : '') + (marker?.title === 'holiday' ? ' is-holiday' : '')},
        h('div', {class: 'list-date'},
          h('span', {class: 'list-dow'}, fmt(date, {weekday: 'short'})),
          h('span', {class: 'list-dom'}, fmt(date, {month: 'short', day: 'numeric'}))),
        h('div', {class: 'list-items'},
          markerText(marker) && h('div', {class: 'day-label'}, markerText(marker)),
          events.map(item => h('div', {class: 'list-item'},
            eventChip(item, false),
            (item.start || item.room || item.cancelled) && h('div', {class: 'list-meta'},
              [meetingText(item), item.instructor].filter(Boolean).join(' · ')))))));
    }
    if (!rows.length) continue;
    const isCurrent = t >= week.start && t <= addDays(week.start, 6);
    list.append(h('section', {class: 'list-week' + (isCurrent ? ' is-current-week' : '')},
      h('h2', null, `Week ${week.n}`, h('span', null, `${fmt(week.start, {month: 'short', day: 'numeric'})} – ${fmt(addDays(week.start, 4), {month: 'short', day: 'numeric'})}`)),
      rows));
  }
  if (!list.querySelector('.list-week')) list.append(h('p', {class: 'status'}, 'Nothing matches.'));
  return list;
}

/* ---------- events ---------- */

function siblings(id) {
  const ev = state.cal.events[id];
  const same = Object.entries(state.cal.events)
    .filter(([, e]) => e.type === ev.type && e.date)
    .sort(([, a], [, b]) => a.date.localeCompare(b.date) || a.number - b.number);
  const i = same.findIndex(([k]) => k === id);
  return {prev: i > 0 ? same[i - 1] : null, next: i >= 0 && i < same.length - 1 ? same[i + 1] : null};
}

function eventHeader(id, activeBox) {
  const ev = state.cal.events[id];
  const {prev, next} = siblings(id);
  const meta = [
    ev.date && fmt(ev.date, {weekday: 'long', month: 'long', day: 'numeric'}),
    ev.cancelled ? 'Cancelled' : ev.start && `${ev.start}–${ev.end}`,
    ev.room, ev.instructor,
  ].filter(Boolean);
  const step = (entry, label, cls) => entry
    ? h('a', {class: 'step ' + cls, href: eventRoute(entry[0]), title: entry[1].title}, label)
    : h('span', {class: 'step is-disabled ' + cls}, label);

  return h('header', {class: 'event-head ' + typeClass(ev.type)},
    h('div', {class: 'event-top'},
      h('a', {class: 'back', href: '#/'}, '← Calendar'),
      h('div', {class: 'steps'}, step(prev, '‹ Previous', 'prev'), step(next, 'Next ›', 'next'))),
    h('div', {class: 'event-kind'}, eventName(ev)),
    h('h1', null, ev.title || eventName(ev)),
    meta.length > 0 && h('p', {class: 'event-meta'}, meta.join(' · ')),
    (ev.notes || []).filter(n => n.text.trim()).map(n => h('div', {class: 'note' + (n.visible === false ? ' is-hidden-item' : '')},
      h('span', {class: 'note-label'}, noteLabel(n.filename)), h('span', null, noteContent(n.text)))),
    ev.boxes.length > 0 && h('nav', {class: 'tabs', 'aria-label': 'Material'},
      ev.boxes.map(b => h('a', {
        href: eventRoute(id, b.box),
        'aria-current': b.box === activeBox ? 'page' : null,
        class: b.visible === false ? 'is-hidden-item' : null,
        title: b.visible === false ? hiddenHint(b) : null,
      }, boxLabel(b.box), b.kind !== 'html' && h('span', {class: 'ext'}, fileTag(b.filename))))));
}

function noteLabel(filename) {
  const stem = filename.replace(/\.[^.]*$/, '');
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

// Notes are the file as written and may hold a little HTML: keep text, simple
// formatting and http(s) links; drop everything else.
function noteContent(text) {
  if (!/[<&]/.test(text)) return text;
  const allowed = new Set(['A', 'B', 'I', 'U', 'EM', 'STRONG', 'CODE', 'BR']);
  const out = document.createDocumentFragment();
  (function walk(src, dst) {
    for (const n of src.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) dst.append(n.textContent);
      if (n.nodeType !== Node.ELEMENT_NODE || ['SCRIPT', 'STYLE', 'TEMPLATE'].includes(n.tagName)) continue;
      if (!allowed.has(n.tagName)) { walk(n, dst); continue; }
      const el = document.createElement(n.tagName);
      const href = (n.getAttribute('href') || '').trim();
      if (n.tagName === 'A' && /^https?:\/\//i.test(href)) { el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer'; }
      dst.append(el);
      walk(n, el);
    }
  })(new DOMParser().parseFromString(text, 'text/html').body, out);
  return out;
}

function showEvent(token, id, boxId, query, anchor) {
  const ev = state.cal.events[id];
  markNav('calendar');
  if (!ev) {
    main.replaceChildren(notice('Event not found', 'This event is not on the calendar (it may have moved).'));
    return;
  }
  document.title = `${state.config.course.number} · ${eventName(ev)}: ${ev.title}`;
  const box = ev.boxes.find(b => b.box === boxId) || (boxId ? null : ev.boxes[0]);
  const header = eventHeader(id, box?.box);

  if (!box) {
    main.replaceChildren(header, h('p', {class: 'status'},
      boxId ? 'That part of this event is not available.' : 'The material for this event is not available yet.'));
    scrollTo(0, 0);
    return;
  }
  if (box.kind === 'html') return showDoc(token, {key: box.key, query, anchor, header});

  // Any other file comes from get.php: show PDFs in place, offer everything as a download.
  const isPdf = /\.pdf$/i.test(box.filename);
  main.replaceChildren(header,
    h('div', {class: 'file-bar'},
      h('span', {class: 'file-name'}, box.filename),
      h('a', {class: 'button', href: getUrl(box.key), target: '_blank'}, 'Open'),
      h('a', {class: 'button', href: getUrl(box.key, true)}, 'Download')),
    isPdf && h('iframe', {class: 'file-frame', src: getUrl(box.key), title: box.filename}));
  scrollTo(0, 0);
}

/* ---------- pages (html.php) ---------- */

async function showDoc(token, {key, query, anchor, header, page}) {
  if (page !== undefined || !header) markNav(page ? 'page:' + page : header ? 'calendar' : '');
  if (page) document.title = `${state.config.course.number} · ${state.cal.pages[page].title}`;

  const article = h('article', {class: 'doc'}, h('p', {class: 'status'}, 'Loading…'));
  const toc = h('aside', {class: 'toc', hidden: true});
  main.replaceChildren(header || '', h('div', {class: 'doc-layout'}, article, toc));
  scrollTo(0, 0);

  const url = `html.php?file=${encodeURIComponent(key)}${query ? '&' + query : ''}`;
  let html;
  try {
    html = await (await api(url)).text();
  } catch (e) {
    if (token !== navToken) return;
    article.replaceChildren(e.status === 404
      ? notice('Not available', 'This page does not exist, or it has not been released yet.')
      : notice('Something went wrong', e.message));
    return;
  }
  if (token !== navToken) return;

  article.addEventListener('click', e => docClick(e, article));
  article.addEventListener('submit', e => lockSubmit(e, token, article, toc));
  await renderDoc(token, article, toc, html);
  if (token === navToken && anchor) scrollToAnchor(article, anchor);
}

async function renderDoc(token, article, toc, html) {
  // Parse, don't paste: pages may be fragments or whole documents.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const headParts = [...doc.head.querySelectorAll('style, link[rel~="stylesheet" i], script')];
  doc.querySelectorAll('title, base, meta').forEach(n => n.remove());
  article.replaceChildren(...doc.body.childNodes, ...headParts);

  // Keep a page's own styles inside the page, so they can not restyle the app.
  for (const style of article.querySelectorAll('style')) {
    if (CSS.supports('selector(:scope)') && 'CSSScopeRule' in window && !/@import/i.test(style.textContent)) {
      style.textContent = `@scope (.doc) {\n${style.textContent}\n}`;
    }
  }
  for (const a of article.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (href.startsWith('#')) continue;
    a.target = '_blank';                                  // files (get.php) and external sites
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) a.rel = 'noopener noreferrer';
  }
  article.querySelectorAll('table').forEach(t => {
    if (!t.closest('.table-scroll')) { const w = h('div', {class: 'table-scroll'}); t.replaceWith(w); w.append(t); }
  });

  await runScripts(token, article);
  if (token !== navToken) return;
  buildToc(article, toc);
  enhance(article);
}

// Scripts moved in from a parsed document do not run: replace each with a fresh one,
// in order. Handlers a page registers for DOMContentLoaded / load are called once the
// scripts are in, because those events have long since fired for the app.
const ranInline = new Set();
async function runScripts(token, article) {
  const scripts = [...article.querySelectorAll('script')].filter(s => /^(|module|(text|application)\/(java|ecma)script)$/i.test(s.type.trim()));
  if (!scripts.length) return;

  const ready = [];
  const patched = [document, window].map(target => {
    const original = target.addEventListener;
    target.addEventListener = function (type, fn, ...rest) {
      if (type === 'DOMContentLoaded' || (type === 'load' && target === window)) ready.push(fn);
      else original.call(this, type, fn, ...rest);
    };
    return () => { target.addEventListener = original; };
  });

  try {
    for (const old of scripts) {
      if (token !== navToken) return;
      const fresh = document.createElement('script');
      for (const {name, value} of old.attributes) fresh.setAttribute(name, value);
      if (old.src) {
        fresh.async = false;
        await new Promise(done => { fresh.onload = fresh.onerror = done; old.replaceWith(fresh); });
      } else {
        // On a second visit, top-level let/const/class would fail as "already declared":
        // a block keeps them local while functions and vars stay global.
        const text = old.textContent;
        fresh.textContent = ranInline.has(text) && fresh.type !== 'module' ? `{\n${text}\n}` : text;
        ranInline.add(text);
        old.replaceWith(fresh);
      }
    }
  } finally {
    patched.forEach(restore => restore());
  }
  for (const fn of ready) {
    try { typeof fn === 'function' ? fn.call(document, new Event('DOMContentLoaded')) : fn.handleEvent(new Event('DOMContentLoaded')); }
    catch (e) { console.error(e); }
  }
}

function docClick(e, article) {
  const a = e.target.closest('a[href]');
  if (!a || !article.contains(a)) return;
  const href = a.getAttribute('href');
  if (href.startsWith('#') && !href.startsWith('#/')) {     // an anchor within the page
    e.preventDefault();
    scrollToAnchor(article, href.slice(1));
  }
}

function scrollToAnchor(article, name) {
  let id = name;
  try { id = decodeURIComponent(name); } catch { /* keep as written */ }
  const target = id && (article.querySelector('#' + CSS.escape(id)) || article.querySelector(`[name="${CSS.escape(id)}"]`));
  if (target) target.scrollIntoView({behavior: 'smooth', block: 'start'});
  else if (!id) scrollTo({top: 0, behavior: 'smooth'});
}

async function lockSubmit(e, token, article, toc) {
  const form = e.target.closest('form.cal6-lock');
  if (!form) return;
  e.preventDefault();
  const say = text => {
    form.querySelector('.cal6-lock-message')?.remove();
    form.append(h('p', {class: 'cal6-lock-message'}, text));
  };
  try {
    const r = await fetch(form.action, {method: 'POST', body: new FormData(form), credentials: 'same-origin'});
    if (token !== navToken) return;
    if (r.ok) {
      const y = scrollY;
      await renderDoc(token, article, toc, await r.text());
      scrollTo(0, y);
      if (article.querySelector('form.cal6-lock')) article.querySelectorAll('form.cal6-lock').forEach(f => f.classList.add('is-wrong'));
    } else if (r.status === 403) route(true);              // the form's token expired: fetch the page again
    else if (r.status === 429) say('Too many attempts. Try again later.');
    else say('The code could not be checked. Try again later.');
  } catch {
    say('The code could not be sent. Check your connection.');
  }
}

function buildToc(article, toc) {
  const heads = [...article.querySelectorAll('h1, h2, h3')].filter(x => x.textContent.trim() && !x.closest('details:not([open])'));
  toc.hidden = heads.length < 3;
  if (toc.hidden) { toc.replaceChildren(); return; }
  const top = Math.min(...heads.map(x => +x.tagName[1]));
  const used = new Set([...article.querySelectorAll('[id]')].map(x => x.id));
  toc.replaceChildren(
    h('div', {class: 'toc-title'}, 'On this page'),
    h('nav', null, heads.map(head => {
      if (!head.id) {
        let id = 'sec-' + head.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40), n = 1;
        const base = id;
        while (used.has(id) || document.getElementById(id)) id = `${base}-${++n}`;
        used.add(id);
        head.id = id;
      }
      return h('a', {
        class: 'toc-l' + Math.min(3, +head.tagName[1] - top + 1), href: '#' + head.id,
        onclick: e => { e.preventDefault(); head.scrollIntoView({behavior: 'smooth', block: 'start'}); },
      }, head.textContent.trim());
    })));
}

/* ---------- code highlighting and math, loaded only when a page needs them ---------- */

const loading = new Map();
function loadScript(src) {
  if (!loading.has(src)) {
    loading.set(src, new Promise((ok, fail) => {
      document.head.append(h('script', {src, async: true, onload: ok, onerror: fail}));
    }));
  }
  return loading.get(src);
}

async function enhance(article) {
  const code = article.querySelectorAll('pre code, pre.cal6-ace');
  if (code.length) {
    try {
      if (!window.hljs) {
        document.head.append(
          h('link', {rel: 'stylesheet', href: LIBS.hljsLight, media: '(prefers-color-scheme: light)'}),
          h('link', {rel: 'stylesheet', href: LIBS.hljsDark, media: '(prefers-color-scheme: dark)'}));
        await loadScript(LIBS.hljs);
        window.hljs.configure({ignoreUnescapedHTML: true});
      }
      article.querySelectorAll('pre code').forEach(el => { if (el.isConnected) window.hljs.highlightElement(el); });
    } catch { /* the page is still readable without it */ }
  }
  if (/\\\(|\\\[|\$\$/.test(article.textContent)) {
    try {
      window.MathJax ??= {
        tex: {inlineMath: [['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']]},
        options: {skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']},
        startup: {typeset: false},
      };
      await loadScript(LIBS.mathjax);
      await window.MathJax.startup.promise;
      if (article.isConnected) await window.MathJax.typesetPromise([article]);
    } catch { /* the page is still readable without it */ }
  }
}

/* ---------- start ---------- */

async function start() {
  try {
    await Promise.all([loadConfig(), loadCalendar()]);
  } catch (e) {
    main.replaceChildren(h('div', {class: 'notice'},
      h('h1', null, 'The calendar could not be loaded'),
      h('p', null, e.status === 500
        ? 'The course is not set up yet: check that calendar/ points to calendar6 and that config/config.ini has a secret.'
        : e.message || 'The server did not answer.'),
      h('p', null, h('button', {class: 'button', type: 'button', onclick: () => location.reload()}, 'Try again'))));
    return;
  }
  renderChrome();
  addEventListener('hashchange', () => route());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - state.calLoaded > 60 * 1000) refresh();
  });
  setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
  route();
}

start();
