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
(async () => { await msCallback(); refresh(); })();
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
  u.search.set('client_id', MS_CLIENT_ID);
  u.search.set('response_type', 'code');
  u.search.set('redirect_uri', MS_REDIRECT);
  u.search.set('scope', 'openid profile email');
  u.search.set('state', st);
  u.search.set('response_mode', 'query');
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
  try { await Promise.all([loadTickets(), loadLicenses(), loadKill(), loadUpdates(), loadAttempts(), loadDownloads(), loadAdmins()]); }
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

// --- tickety ---
async function loadTickets() {
  const box = $('ticket-list');
  box.innerHTML = '...';
  const data = await api('tickets.list');
  const open = data.filter(t => t.status === 'open').length;
  $('c-tickets').textContent = open ? `(${open})` : '';
  box.innerHTML = data.length ? '' : 'brak ticketów';
  data.forEach(t => {
    const d = document.createElement('div');
    d.className = 'trow';
    d.innerHTML = `<b>${esc(t.nick)}</b> → ${esc(t.contact)} <span class="${t.status === 'open' ? 'st-open' : 'st-closed'}">${esc(t.status)}</span>` +
      `<small>plan: ${esc(t.plan)} · ${new Date(t.created_at).toLocaleString('pl-PL')}</small>` +
      (t.message ? `<small>msg: ${esc(t.message)}</small>` : '') +
      `<small class="dim">#${esc(t.id.slice(0, 8))}</small>` +
      (t.status === 'open' ? `<div class="ops"><button class="abtn ghost">zamknij</button></div>` : '');
    if (t.status === 'open') {
      d.querySelector('button').onclick = async () => {
        await api('tickets.close', { id: t.id });
        loadTickets();
      };
    }
    box.appendChild(d);
  });
}

// --- licencje (klucze generuje endpoint) ---
$('lic-gen').onclick = async () => {
  const label = $('lic-label').value.trim().slice(0, 32);
  try {
    const r = await api('licenses.create', { label });
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
      `<small>${esc(l.label || '')} · hwid: ${esc(l.hwid || '—')} · seen: ${l.last_seen_at ? new Date(l.last_seen_at).toLocaleString('pl-PL') : '—'}</small>` +
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

refresh();
