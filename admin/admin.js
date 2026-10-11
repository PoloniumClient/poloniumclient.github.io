// Polonium admin — wszystko przez Edge Function + cookies (logged=false/true).
// Zero bezpośredniego dostępu do bazy ze strony statycznej.
const API = 'https://jofzsdbebwbjbsitetli.supabase.co/functions/v1/admin';
const MS_CLIENT_ID = '825aea54-7021-4f34-85bc-909e943ce704';
const MS_REDIRECT = 'https://poloniumclient.github.io/admin/';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(action, params = {}) {
  const r = await fetch(API + '/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action, ...params })
  });
  if (r.status === 401) { showPanel(false); throw new Error('logged=false'); }
  const j = await r.json();
  if (j && j.error) throw new Error(j.error);
  return j;
}

function showPanel(on) {
  $('login-view').classList.toggle('hidden', on);
  $('panel-view').classList.toggle('hidden', !on);
}

// --- auth (ciastka stawia endpoint) ---
async function refresh() {
  try {
    const me = await api('me');
    if (me && me.logged) { showPanel(true); loadAll(); return; }
  } catch {}
  showPanel(false);
}
$('a-login').onclick = async () => {
  $('a-err').textContent = '';
  const email = $('a-email').value.trim();
  const password = $('a-pass').value;
  if (!email || !password) { $('a-err').textContent = 'podaj e-mail i hasło'; return; }
  try {
    const r = await fetch(API + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const j = await r.json();
    if (!r.ok) throw new Error((j && j.error) || 'błąd');
    $('a-pass').value = '';
    refresh();
  } catch (e) {
    $('a-err').textContent = 'błąd: ' + String(e.message || e).slice(0, 120);
  }
};
$('a-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('a-login').click(); });
$('a-logout').onclick = async () => {
  try {
    await fetch(API + '/logout', { method: 'POST', credentials: 'include' });
  } catch {}
  showPanel(false);
};
$('a-setpass').onclick = async () => {
  const pw = $('a-newpass').value;
  if (!pw || pw.length < 12) { $('a-passmsg').textContent = 'min. 12 znaków'; return; }
  try {
    await api('password.change', { password: pw });
    $('a-newpass').value = '';
    $('a-passmsg').textContent = 'hasło zmienione';
  } catch (e) {
    $('a-passmsg').textContent = 'błąd: ' + String(e.message || e).slice(0, 100);
  }
};

// --- login Microsoft (Entra code flow, sekret po stronie funkcji) ---
$('a-ms').onclick = () => {
  const st = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
  try { sessionStorage.setItem('ms_state', st); } catch {}
  const u = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  u.searchParams.set('client_id', MS_CLIENT_ID);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('redirect_uri', MS_REDIRECT);
  u.searchParams.set('scope', 'openid profile email User.Read');
  u.searchParams.set('state', st);
  u.searchParams.set('response_mode', 'query');
  u.searchParams.set('prompt', 'consent');
  location.href = u.toString();
};
async function msCallback() {
  const q = new URLSearchParams(location.search);
  const code = q.get('code'), state = q.get('state');
  if (!code) return false;
  let saved = null;
  try { saved = sessionStorage.getItem('ms_state'); sessionStorage.removeItem('ms_state'); } catch {}
  try { history.replaceState(null, '', location.pathname); } catch {}
  if (!state || state !== saved) { $('a-err').textContent = 'ms: zły state'; return true; }
  try {
    const r = await fetch(API + '/ms-exchange', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ code })
    });
    const j = await r.json();
    if (!r.ok) throw new Error((j && j.error) || 'błąd');
  } catch (e) {
    $('a-err').textContent = 'ms: ' + String(e.message || e).slice(0, 120);
  }
  return true;
}

// --- tabs ---
document.querySelectorAll('.atabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.atabs button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  document.querySelectorAll('.atab').forEach(v => v.classList.remove('active'));
  $('tab-' + b.dataset.t).classList.add('active');
});

async function loadAll() {
  try { await Promise.all([loadTickets(), loadBugs(), loadLicenses(), loadKill(), loadUpdates(), loadAttempts(), loadDownloads(), loadAdmins()]); }
  catch (e) { /* 401 handled in api() */ }
}

// --- admin e-maile (allowlista Microsoft) ---
async function loadAdmins() {
  try {
    const r = await api('admins.get');
    $('adm-emails').value = (r.emails || []).join(', ');
  } catch {}
}
$('adm-save').onclick = async () => {
  const emails = $('adm-emails').value.split(/[,\s;]+/).map(s => s.trim()).filter(Boolean);
  try {
    await api('admins.set', { emails });
    $('adm-msg').textContent = 'zapisano';
  } catch (e) {
    $('adm-msg').textContent = 'błąd: ' + String(e.message || e).slice(0, 100);
  }
};

// --- live: nowe tickety same się otwierają, nowe wiadomości = toast + dźwięk ---
const knownAct = { tickets: new Set(), msgs: new Map(), init: false };
function beep() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    const ctx = new C();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.12;
    o.start(); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.stop(ctx.currentTime + 0.45);
  } catch {}
}
function toast(text, ticketId) {
  const box = $('toast-box');
  if (!box) return;
  const d = document.createElement('div');
  d.className = 'toast';
  d.innerHTML = `<span>${esc(text)}</span><button>Otwórz</button>`;
  d.querySelector('button').onclick = () => {
    try { d.remove(); } catch {}
    try { document.querySelector('.atabs button[data-t="tickets"]').click(); } catch {}
    openTicket(ticketId);
  };
  box.appendChild(d);
  setTimeout(() => { try { d.remove(); } catch {} }, 25000);
  beep();
  try { document.title = '(•) Polonium — admin'; } catch {}
}
document.addEventListener('pointerdown', () => {
  try { if (!$('toast-box').querySelector('.toast')) document.title = 'Polonium — admin'; } catch {}
});
async function activityTick() {
  try {
    if ($('panel-view').classList.contains('hidden')) return;
    const a = await api('activity.recent');
    const ids = new Set((a.tickets || []).map(t => t.id));
    if (!knownAct.init) {
      ids.forEach(id => knownAct.tickets.add(id));
      (a.messages || []).forEach(m => {
        const cur = knownAct.msgs.get(m.ticket_id) || 0;
        if (m.id > cur) knownAct.msgs.set(m.ticket_id, m.id);
      });
      knownAct.init = true;
      return;
    }
    for (const t of (a.tickets || [])) {
      if (!knownAct.tickets.has(t.id)) {
        knownAct.tickets.add(t.id);
        loadTickets();
        const typing = (($('conv-input') && $('conv-input').value.trim()) ||
          (document.activeElement && document.activeElement.tagName === 'INPUT'));
        if (!typing) openTicket(t.id);
        else toast('Nowy ticket', t.id);
      }
    }
    for (const m of (a.messages || [])) {
      const cur = knownAct.msgs.get(m.ticket_id) || 0;
      if (m.id > cur) {
        knownAct.msgs.set(m.ticket_id, m.id);
        if (m.sender === 'user' && m.ticket_id !== convId) {
          const nm = (m.tickets && m.tickets.nick) || String(m.ticket_id).slice(0, 8);
          toast('Nowa wiadomość: ' + nm, m.ticket_id);
        }
      }
    }
    if (convId) loadConv(true);
  } catch {}
}
setInterval(activityTick, 8000);
async function loadStats() {
  try {
    if ($('panel-view').classList.contains('hidden')) return;
    const [tickets, licenses, dls, atts] = await Promise.all([
      api('tickets.list'), api('licenses.list'),
      api('downloads.list'), api('attempts.list')
    ]);
    const day = Date.now() - 24 * 3600 * 1000;
    const now = new Date();
    $('st-open').textContent = tickets.filter(t => t.status === 'open').length;
    $('st-lic').textContent = licenses.filter(l => l.active && (!l.expires_at || new Date(l.expires_at) > now)).length;
    $('st-dl').textContent = dls.filter(d => new Date(d.created_at).getTime() > day).length;
    $('st-fail').textContent = atts.filter(a => !a.ok && new Date(a.created_at).getTime() > day).length;
  } catch {}
}
setInterval(loadStats, 12000);
setTimeout(loadStats, 1500);

// --- tickety ---
let ticketFilter = 'open';
document.querySelectorAll('#tab-tickets .tfilters button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tab-tickets .tfilters button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  ticketFilter = b.dataset.f;
  loadTickets();
});
async function loadTickets() {
  const box = $('ticket-list');
  box.innerHTML = '...';
  const data = await api('tickets.list');
  const open = data.filter(t => t.status === 'open').length;
  $('c-tickets').textContent = open ? `(${open})` : '';
  const counts = { open: 0, closed: 0, cancelled: 0, all: data.length };
  data.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
  document.querySelectorAll('#tab-tickets .tfilters button').forEach(b => {
    const f = b.dataset.f;
    const base = { open: 'otwarte', closed: 'zamknięte', cancelled: 'anulowane', all: 'wszystkie' }[f];
    b.textContent = counts[f] ? base + ' (' + counts[f] + ')' : base;
  });
  const list = ticketFilter === 'all' ? data : data.filter(t => t.status === ticketFilter);
  box.innerHTML = list.length ? '' : (ticketFilter === 'open' ? 'brak otwartych ticketów' : ticketFilter === 'closed' ? 'brak zamkniętych' : ticketFilter === 'cancelled' ? 'brak anulowanych' : 'brak ticketów');
  list.forEach(t => {
    const d = document.createElement('div');
    d.className = 'trow';
    const stCls = t.status === 'open' ? 'st-open' : (t.status === 'cancelled' ? 'st-off' : 'st-closed');
    d.innerHTML = `<b>${esc(t.nick)}</b> → ${esc(t.contact)} <span class="${stCls}">${esc(t.status)}</span>` +
      `<small>${esc(t.plan || '')} · ${new Date(t.created_at).toLocaleString('pl-PL')} · #${esc(t.id.slice(0, 8))}</small>` +
      `<div class="ops"><button class="abtn ghost">otwórz</button></div>`;
    d.querySelector('button').onclick = () => openTicket(t.id);
    box.appendChild(d);
  });
}

let convId = null, convTimer = null;
function adminNick() {
  try { return (localStorage.getItem('polonium-admin-nick') || '').trim().slice(0, 24); } catch { return ''; }
}
async function openTicket(id) {
  convId = id;
  $('ticket-list').classList.add('hidden');
  $('ticket-conv').classList.remove('hidden');
  await loadConv();
  clearInterval(convTimer);
  convTimer = setInterval(() => { if (convId) loadConv(true); }, 4000);
}
function closeConv() {
  convId = null;
  clearInterval(convTimer);
  $('ticket-conv').classList.add('hidden');
  $('ticket-list').classList.remove('hidden');
}
async function loadConv(silent) {
  if (!convId) return;
  try {
    const rows = await api('tickets.list');
    const t = (rows || []).find(x => x.id === convId);
    if (!t) { closeConv(); loadTickets(); return; }
    const msgs = await api('tickets.messages', { id: convId });
    const stCls = t.status === 'open' ? 'st-open' : (t.status === 'cancelled' ? 'st-off' : 'st-closed');
    $('conv-head').innerHTML = `<b>${esc(t.nick)}</b> → ${esc(t.contact)} <span class="${stCls}">${esc(t.status)}</span>` +
      `<small>${esc(t.plan || '')} · ${new Date(t.created_at).toLocaleString('pl-PL')} · #${esc(t.id.slice(0, 8))}</small>`;
    const ops = $('conv-ops');
    ops.innerHTML = '';
    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'abtn ghost ' + (cls || '');
      b.textContent = label;
      b.onclick = fn;
      ops.appendChild(b);
    };
    if (t.status === 'open') {
      mk('zamknij', '', async () => { await api('tickets.close', { id: convId }); loadConv(); loadTickets(); });
      mk('anuluj', 'danger', async () => {
        if (confirm('anulować ticket ' + t.nick + '?')) { await api('tickets.cancel', { id: convId }); loadConv(); loadTickets(); }
      });
    } else {
      mk('otwórz ponownie', '', async () => { await api('tickets.reopen', { id: convId }); loadConv(); loadTickets(); });
    }
    const mb = $('conv-msgs');
    const nick = adminNick();
    mb.innerHTML = (msgs || []).map(m => {
      const cls = m.sender === 'user' ? 'user' : (m.sender === 'auto' ? 'auto' : 'admin');
      const who = m.sender === 'user' ? esc(t.nick) : (m.sender === 'auto' ? 'auto' : esc(m.sender));
      return `<div class="cmsg c-${cls}"><b>${who}</b><p>${esc(m.text)}</p>` +
        `<small>${new Date(m.created_at).toLocaleString('pl-PL')}</small></div>`;
    }).join('') || '<div class="cmsg c-auto"><p>brak wiadomości</p></div>';
    mb.scrollTop = mb.scrollHeight;
    $('conv-qf').style.display = t.status === 'open' ? '' : 'none';
    $('conv-reply').style.display = t.status === 'open' ? '' : 'none';
  } catch (e) {
    if (!silent) $('conv-msgs').innerHTML = 'err: ' + esc(String(e.message || e).slice(0, 80));
  }
}
async function convSend() {
  const inp = $('conv-input');
  const text = inp.value.trim().slice(0, 1000);
  if (!text || !convId) return;
  inp.value = '';
  try {
    await api('tickets.reply', { id: convId, text, sender: adminNick() || 'admin' });
    loadConv(true);
  } catch {}
}
function convFill(text) {
  const inp = $('conv-input');
  inp.value = text;
  inp.focus();
}
async function convKeygen() {
  try {
    const rows = await api('tickets.list');
    const t = (rows || []).find(x => x.id === convId);
    const r = await api('licenses.create', {
      label: (((t && t.nick) || '') + ' • ' + ((t && t.plan) || '')).slice(0, 32),
      days: planDays(t && t.plan)
    });
    convFill('Twój klucz: ' + r.key + ' — wpisz go w launcherze w zakładce Licencja.');
    loadLicenses();
  } catch {}
}
function planDays(plan) {
  const p = String(plan || '').toLowerCase();
  if (p.includes('life')) return 'lifetime';
  const m = p.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 30;
}
$('conv-back').onclick = closeConv;
$('conv-send').onclick = convSend;
$('conv-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') convSend(); });
$('conv-keygen').onclick = convKeygen;
document.querySelectorAll('#conv-qf .abtn.ghost[data-t]').forEach(b => b.onclick = () => convFill(b.dataset.t));
try { $('a-nick').value = adminNick(); } catch {}
$('a-nick').addEventListener('input', (e) => {
  try { localStorage.setItem('polonium-admin-nick', e.target.value.trim().slice(0, 24)); } catch {}
});

// --- bugi (bug-reporty z gry i strony, osobna funkcja bug-admin + token) ---
const BUG_API = 'https://jofzsdbebwbjbsitetli.supabase.co/functions/v1/bug-admin';
function bugToken() {
  try { return sessionStorage.getItem('polonium-bugadm') || ''; } catch { return ''; }
}
async function bugApi(action, params = {}) {
  const r = await fetch(BUG_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: bugToken(), action, ...params })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j && j.error) || ('http ' + r.status));
  return j;
}
let bugFilter = 'new';
document.querySelectorAll('#tab-bugs .tfilters button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tab-bugs .tfilters button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  bugFilter = b.dataset.f;
  loadBugs();
});
try { $('bug-token').value = bugToken(); } catch {}
$('bug-tok-save').onclick = () => {
  try { sessionStorage.setItem('polonium-bugadm', $('bug-token').value.trim()); } catch {}
  $('bug-tok-msg').textContent = 'zapisano (na tę sesję karty)';
  loadBugs();
};
const BUG_STATUS_PL = { queued: 'kolejka', new: 'nowe', accepted: 'przyjęte', fixed: 'naprawione', rejected: 'odrzucone' };
async function loadBugs() {
  const box = $('bug-list');
  if (!bugToken()) { box.innerHTML = 'wklej token bug-admin powyżej'; $('c-bugs').textContent = ''; return; }
  box.innerHTML = '...';
  let bugs = [];
  try {
    const r = await bugApi('bugs.list');
    bugs = r.bugs || [];
  } catch (e) {
    box.innerHTML = 'err: ' + esc(String(e.message || e).slice(0, 100));
    return;
  }
  const fresh = bugs.filter(b => b.status === 'queued' || b.status === 'new').length;
  $('c-bugs').textContent = fresh ? `(${fresh})` : '';
  const list = bugFilter === 'all' ? bugs : bugs.filter(b =>
    bugFilter === 'new' ? (b.status === 'new' || b.status === 'queued') : b.status === bugFilter);
  box.innerHTML = list.length ? '' : 'brak bugów w tym filtrze';
  list.forEach(b => {
    const d = document.createElement('div');
    d.className = 'trow';
    const stCls = (b.status === 'new' || b.status === 'queued') ? 'st-open' : (b.status === 'rejected' ? 'st-off' : 'st-closed');
    d.innerHTML = `<b>${esc(b.nick)}</b> [${esc(b.module)}] ${esc(b.title)} <span class="${stCls}">${esc(BUG_STATUS_PL[b.status] || b.status)}</span>` +
      `<small>${b.contact ? esc(b.contact) + ' · ' : ''}${new Date(b.created_at).toLocaleString('pl-PL')} · #${esc(String(b.id).slice(0, 8))}</small>` +
      `<p style="margin:6px 0">${esc(b.text)}</p>` +
      `<div class="ops"><button class="abtn ghost b-acc">przyjmij</button>` +
      `<button class="abtn ghost b-fix">naprawione ✓</button>` +
      `<button class="abtn ghost b-rej">odrzuć</button>` +
      `<button class="abtn danger b-del">usuń</button></div>`;
    const [ba, bf, br, bd] = d.querySelectorAll('button');
    const set = async (status) => { try { await bugApi('bugs.set', { id: b.id, status }); loadBugs(); } catch {} };
    ba.onclick = () => set('accepted');
    bf.onclick = () => set('fixed');
    br.onclick = () => set('rejected');
    bd.onclick = async () => { if (confirm('usunąć raport ' + b.nick + '?')) { try { await bugApi('bugs.delete', { id: b.id }); loadBugs(); } catch {} } };
    box.appendChild(d);
  });
}

// --- licencje (klucze generuje endpoint) ---
$('lic-gen').onclick = async () => {
  const label = $('lic-label').value.trim().slice(0, 32);
  const days = $('lic-days').value;
  try {
    const r = await api('licenses.create', { label, days });
    $('lic-new').textContent = 'NOWY KLUCZ: ' + r.key + ' — skopiuj, nie pokaże się znowu w całości';
    $('lic-label').value = '';
    loadLicenses();
  } catch (e) {
    $('lic-new').textContent = 'err: ' + String(e.message || e).slice(0, 120);
  }
};
async function loadLicenses() {
  const box = $('lic-list');
  box.innerHTML = '...';
  const data = await api('licenses.list');
  box.innerHTML = data.length ? '' : 'brak kluczy';
  data.forEach(l => {
    const d = document.createElement('div');
    d.className = 'lrow';
    d.innerHTML = `<b>${esc(l.key)}</b> ${l.active ? '' : '<span class="st-off">OFF</span>'}` +
      (l.expires_at && new Date(l.expires_at) <= new Date() ? ' <span class="st-off">WYGASŁ</span>' : '') +
      `<small>${esc(l.label || '')} · hwid: ${esc(l.hwid || '—')} · seen: ${l.last_seen_at ? new Date(l.last_seen_at).toLocaleString('pl-PL') : '—'} · wygasa: ${l.expires_at ? new Date(l.expires_at).toLocaleString('pl-PL') : '∞'}</small>` +
      `<div class="ops"><button class="abtn ghost t1">${l.active ? 'wyłącz' : 'włącz'}</button>` +
      `<button class="abtn ghost t2">reset hwid</button>` +
      `<button class="abtn danger t3">usuń</button></div>`;
    const [b1, b2, b3] = d.querySelectorAll('button');
    b1.onclick = async () => { await api('licenses.toggle', { id: l.id, active: !l.active }); loadLicenses(); };
    b2.onclick = async () => { await api('licenses.resetHwid', { id: l.id }); loadLicenses(); };
    b3.onclick = async () => { if (confirm('usunąć ' + l.key + '?')) { await api('licenses.delete', { id: l.id }); loadLicenses(); } };
    box.appendChild(d);
  });
}

// --- kill-switch ---
async function loadKill() {
  const box = $('kill-box');
  box.innerHTML = '...';
  const rows = await api('config.get');
  const data = rows[0];
  if (!data) { box.innerHTML = 'brak wiersza global'; return; }
  box.innerHTML = `<div class="big">global: <span class="${data.enabled ? 'ok-dot' : 'err-dot'}">${data.enabled ? 'ON (serwery żyją)' : 'OFF (start zablokowany)'}</span></div>` +
    `<button class="abtn" id="kill-flip">${data.enabled ? 'WYŁĄCZ (kill)' : 'WŁĄCZ'}</button>`;
  $('kill-flip').onclick = async () => {
    await api('config.setGlobal', { enabled: !data.enabled });
    loadKill();
  };
}

// --- update ---
$('up-add').onclick = async () => {
  const version = $('up-ver').value.trim().replace(/^v/, '');
  const url = $('up-url').value.trim();
  const changelog = $('up-log').value.trim().slice(0, 500);
  if (!version || !url) return;
  try {
    await api('updates.add', { version, url, changelog });
    $('up-ver').value = ''; $('up-url').value = ''; $('up-log').value = '';
    loadUpdates();
  } catch {}
};
async function loadUpdates() {
  const box = $('up-list');
  const data = await api('updates.list');
  box.innerHTML = (data || []).map(u =>
    `<div class="urow"><b>v${esc(u.version)}</b><small>${esc(u.url)}</small>${u.changelog ? `<small>${esc(u.changelog)}</small>` : ''}</div>`
  ).join('') || 'brak wpisów';
}

// --- próby / pobrania ---
async function loadAttempts() {
  const box = $('att-list');
  const data = await api('attempts.list');
  box.innerHTML = (data || []).map(a =>
    `<div class="arow2"><b class="${a.ok ? 'ok-dot' : 'err-dot'}">${a.ok ? 'OK' : 'FAIL'}</b> ${esc(a.reason)}` +
    `<small>${new Date(a.created_at).toLocaleString('pl-PL')} · fp ${esc(a.key_fp.slice(0, 8))} · hwid ${esc((a.hwid || '').slice(0, 8))}</small></div>`
  ).join('') || 'brak prób';
}
async function loadDownloads() {
  const box = $('dl-list');
  const data = await api('downloads.list');
  box.innerHTML = (data || []).map(d =>
    `<div class="arow2"><b>${esc(d.mc)}</b>` +
    `<small>${new Date(d.created_at).toLocaleString('pl-PL')} · fp ${esc(d.key_fp.slice(0, 8))} · hwid ${esc((d.hwid || '').slice(0, 8))}</small></div>`
  ).join('') || 'brak pobrań';
}

(async () => { await msCallback(); refresh(); })();
