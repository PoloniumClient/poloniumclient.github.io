// Polonium admin — login (Supabase Auth) + tickety / licencje / kill-switch / update / próby.
// Działa na GitHub Pages (statyczny), cała autoryzacja po stronie Supabase (RLS).
const SUPABASE = { url: 'https://jofzsdbebwbjbsitetli.supabase.co', anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvZnpzZGJlYndiamJzaXRldGxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1ODkxMTgsImV4cCI6MjEwNzE2NTExOH0.OrfEkY_SWHfl1TaJZAyKxDrzICch-L48ft8o1LfNyws' };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sb = window.supabase.createClient(SUPABASE.url, SUPABASE.anon);

function showPanel(on) {
  $('login-view').classList.toggle('hidden', on);
  $('panel-view').classList.toggle('hidden', !on);
}

// --- auth ---
async function refresh() {
  const { data } = await sb.auth.getSession();
  if (data && data.session) { showPanel(true); loadAll(); }
  else showPanel(false);
}
$('a-login').onclick = async () => {
  $('a-err').textContent = '';
  const email = $('a-email').value.trim();
  const password = $('a-pass').value;
  if (!email || !password) { $('a-err').textContent = 'podaj e-mail i hasło'; return; }
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { $('a-err').textContent = 'błąd: ' + error.message.slice(0, 120); return; }
// --- pobrania moda (kto ściągnął jar) ---
async function loadDownloads() {
  const box = $('dl-list');
  const { data, error } = await sb.from('mod_downloads').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { box.innerHTML = 'err: ' + esc(error.message); return; }
  box.innerHTML = (data || []).map(d =>
    `<div class="arow2"><b>${esc(d.mc)}</b>` +
    `<small>${new Date(d.created_at).toLocaleString('pl-PL')} · fp ${esc(d.key_fp.slice(0, 8))} · hwid ${esc((d.hwid || '').slice(0, 8))}</small></div>`
  ).join('') || 'brak pobrań';
}

refresh();
};
$('a-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('a-login').click(); });
$('a-logout').onclick = async () => { await sb.auth.signOut(); showPanel(false); };

// --- tabs ---
document.querySelectorAll('.atabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.atabs button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  document.querySelectorAll('.atab').forEach(v => v.classList.remove('active'));
  $('tab-' + b.dataset.t).classList.add('active');
});

function loadAll() { loadTickets(); loadLicenses(); loadKill(); loadUpdates(); loadAttempts(); loadDownloads(); }

// --- tickety ---
async function loadTickets() {
  const box = $('ticket-list');
  box.innerHTML = '...';
  const { data, error } = await sb.from('tickets').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) { box.innerHTML = 'err: ' + esc(error.message); return; }
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
        await sb.from('tickets').update({ status: 'closed' }).eq('id', t.id);
        loadTickets();
      };
    }
    box.appendChild(d);
  });
}

// --- licencje ---
function genKey() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rnd = new Uint32Array(12);
  (crypto.getRandomValues ? crypto.getRandomValues(rnd) : rnd.map(() => Math.floor(Math.random() * 1e9)));
  let s = '';
  for (let i = 0; i < 12; i++) {
    if (i && i % 4 === 0) s += '-';
    s += abc[rnd[i] % abc.length];
  }
  return s;
}
$('lic-gen').onclick = async () => {
  const label = $('lic-label').value.trim().slice(0, 32);
  const key = genKey();
  const { error } = await sb.from('licenses').insert({ key, label, active: true });
  if (error) { $('lic-new').textContent = 'err: ' + error.message.slice(0, 120); return; }
  $('lic-new').textContent = 'NOWY KLUCZ: ' + key + ' — skopiuj, nie pokaże się znowu w całości';
  $('lic-label').value = '';
  loadLicenses();
};
async function loadLicenses() {
  const box = $('lic-list');
  box.innerHTML = '...';
  const { data, error } = await sb.from('licenses').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) { box.innerHTML = 'err: ' + esc(error.message); return; }
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
    b1.onclick = async () => { await sb.from('licenses').update({ active: !l.active }).eq('id', l.id); loadLicenses(); };
    b2.onclick = async () => { await sb.from('licenses').update({ hwid: null }).eq('id', l.id); loadLicenses(); };
    b3.onclick = async () => { if (confirm('usunąć ' + l.key + '?')) { await sb.from('licenses').delete().eq('id', l.id); loadLicenses(); } };
    box.appendChild(d);
  });
}

// --- kill-switch ---
async function loadKill() {
  const box = $('kill-box');
  box.innerHTML = '...';
  const { data, error } = await sb.from('module_config').select('*').eq('id', 'global').single();
  if (error) { box.innerHTML = 'err: ' + esc(error.message); return; }
  box.innerHTML = `<div class="big">global: <span class="${data.enabled ? 'ok-dot' : 'err-dot'}">${data.enabled ? 'ON (serwery żyją)' : 'OFF (start zablokowany)'}</span></div>` +
    `<button class="abtn" id="kill-flip">${data.enabled ? 'WYŁĄCZ (kill)' : 'WŁĄCZ'}</button>`;
  $('kill-flip').onclick = async () => {
    await sb.from('module_config').update({ enabled: !data.enabled, updated_at: new Date().toISOString() }).eq('id', 'global');
    loadKill();
  };
}

// --- update ---
$('up-add').onclick = async () => {
  const version = $('up-ver').value.trim().replace(/^v/, '');
  const url = $('up-url').value.trim();
  const changelog = $('up-log').value.trim().slice(0, 500);
  if (!version || !url) return;
  const { error } = await sb.from('app_updates').insert({ version, url, changelog, mc: '1.21.11' });
  if (error) return;
  $('up-ver').value = ''; $('up-url').value = ''; $('up-log').value = '';
  loadUpdates();
};
async function loadUpdates() {
  const box = $('up-list');
  const { data, error } = await sb.from('app_updates').select('*').order('created_at', { ascending: false }).limit(10);
  if (error) { box.innerHTML = 'err: ' + esc(error.message); return; }
  box.innerHTML = (data || []).map(u =>
    `<div class="urow"><b>v${esc(u.version)}</b><small>${esc(u.url)}</small>${u.changelog ? `<small>${esc(u.changelog)}</small>` : ''}</div>`
  ).join('') || 'brak wpisów';
}

// --- próby (anty-bruteforce podgląd) ---
async function loadAttempts() {
  const box = $('att-list');
  const { data, error } = await sb.from('license_attempts').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { box.innerHTML = 'err: ' + esc(error.message); return; }
  box.innerHTML = (data || []).map(a =>
    `<div class="arow2"><b class="${a.ok ? 'ok-dot' : 'err-dot'}">${a.ok ? 'OK' : 'FAIL'}</b> ${esc(a.reason)}` +
    `<small>${new Date(a.created_at).toLocaleString('pl-PL')} · fp ${esc(a.key_fp.slice(0, 8))} · hwid ${esc((a.hwid || '').slice(0, 8))}</small></div>`
  ).join('') || 'brak prób';
}

refresh();
