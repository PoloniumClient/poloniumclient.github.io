const MODS = [
  // combat (9)
  { n: 'killaura', c: 'combat', d: 'auto-atak ghost, pvp 1.8 / 1.9' },
  { n: 'reach', c: 'combat', d: 'większy zasięg ataku' },
  { n: 'velocity', c: 'combat', d: 'mniejszy odrzut po hitach' },
  { n: 'antibot', c: 'combat', d: 'filtruje boty na serwerach' },
  { n: 'keepsprint', c: 'combat', d: 'sprint nie spada po hicie' },
  { n: 'autoweapon', c: 'combat', d: 'broń i tool pod celownik' },
  { n: 'autototem', c: 'combat', d: 'totem automatycznie do offhanda' },
  { n: 'autopot', c: 'combat', d: 'auto splash-heal w walce' },
  { n: 'crystal aura', c: 'combat', d: 'automatyczne wybuchanie crystali' },
  // player (1)
  { n: 'autoarmor', c: 'player', d: 'zakłada najlepszą zbroję' },
  // movement (6)
  { n: 'sprint', c: 'movement', d: 'stały sprint' },
  { n: 'speed', c: 'movement', d: 'szybkie poruszanie z autohopem' },
  { n: 'safewalk', c: 'movement', d: 'auto-shift na krawędzi bloku' },
  { n: 'nofall', c: 'movement', d: 'blokuje obrażenia z upadku' },
  { n: 'mlg', c: 'movement', d: 'auto-woda przy upadku z wysokości' },
  { n: 'scaffold', c: 'movement', d: 'auto-stawianie bloków pod nogi' },
  // render (2)
  { n: 'esp', c: 'render', d: 'boxy graczy i mobów przez ściany' },
  { n: 'fullbright', c: 'render', d: 'pełna jasność w ciemności' },
  // hud (5)
  { n: 'fps-hud', c: 'hud', d: 'licznik fps na ekranie' },
  { n: 'cps-hud', c: 'hud', d: 'licznik kliknięć lpm i ppm' },
  { n: 'keystrokes', c: 'hud', d: 'podgląd klawiszy i przycisków myszy' },
  { n: 'armor-hud', c: 'hud', d: 'stan zbroi i wytrzymałość' },
  { n: 'arraylist', c: 'hud', d: 'lista włączonych modułów' },
];
const VERSIONS = ['1.21.11'];

// Grupowanie w glowne linie: 1.8.x, 1.9.x ... 1.21.x, 26.x
function majorOf(v) {
  if (String(v).indexOf('26.') === 0) return '26.x';
  const p = String(v).split('.');
  return p[0] + '.' + (p[1] || '0') + '.x';
}
const VGROUPS = [];
VERSIONS.forEach(v => {
  const m = majorOf(v);
  let g = VGROUPS.find(g => g.m === m);
  if (!g) { g = { m, vs: [] }; VGROUPS.push(g); }
  g.vs.push(v);
});
const vhtml = VGROUPS.map(g =>
  `<div class="vg"><b>${g.m}</b><i>${g.vs.length}</i><div>${g.vs.map(v => `<span>${v}</span>`).join('')}</div></div>`
).join('');
document.getElementById('vlist').innerHTML = vhtml;
document.getElementById('vlist2').innerHTML = vhtml;
document.getElementById('year').textContent = new Date().getFullYear();

function renderMods(cat) {
  document.getElementById('modgrid').innerHTML = MODS
    .filter(m => cat === 'all' || m.c === cat)
    .map(m => `<div><b>${m.n}</b><small>${m.c}</small><p>${m.d}</p></div>`).join('');
}
renderMods('all');
document.querySelectorAll('.filter button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.filter button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  renderMods(b.dataset.cat);
});

// seg pokazowy
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.seg button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  document.getElementById('play-sub').textContent = b.textContent.includes('Obviously') ? 'cheats on • 1.21.11' : 'vanilla • 1.21.11';
});

// os tabs
document.querySelectorAll('.os').forEach(b => b.onclick = () => {
  document.querySelectorAll('.os').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
});

// faq
document.querySelectorAll('.qa button').forEach(b => b.onclick = () => {
  const qa = b.parentElement;
  const open = qa.classList.toggle('open');
  b.querySelector('i').textContent = open ? '–' : '+';
});

// latest release
fetch('https://api.github.com/repos/poloniumclient/polonium/releases/latest')
  .then(r => r.ok ? r.json() : null)
  .then(d => { if (d && d.tag_name) { document.getElementById('latest').textContent = d.tag_name; const t = document.getElementById('latest-top'); if (t) t.textContent = d.tag_name; } })
  .catch(() => {});

// liczniki
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.querySelectorAll('[data-count]').forEach(el => {
    const end = +el.dataset.count, t0 = performance.now();
    (function tick(t) {
      const p = Math.min(1, (t - t0) / 1200);
      el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString('pl-PL');
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  });
  io.unobserve(e.target);
}), { threshold: 0.3 });
document.querySelectorAll('.stats').forEach(s => io.observe(s));

// reveal
const ro = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); }
}), { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => ro.observe(el));

// ---------- LIVE COUNTER (Supabase) ----------
// +1 przy wejściu (upsert wiersza karty), −1 sam wypada z liczby po ~60 s
// (liczymy tylko wiersze odświeżone w ostatniej minucie, heartbeat co 20 s).
// Setup (2 min, SQL Editor w dashboardzie Supabase):
//   create table if not exists presence (id text primary key, seen timestamptz default now());
//   alter table presence enable row level security;
//   create policy "open" on presence for all to anon using (true) with check (true);
// Projekt unifikowany z launcherem (licencje, tickety, live, admin).
// Klucz anon JEST publiczny z natury, nigdy nie wklejaj tu service_role ani hasła do bazy.
const SUPABASE = { url: 'https://jofzsdbebwbjbsitetli.supabase.co', anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvZnpzZGJlYndiamJzaXRldGxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1ODkxMTgsImV4cCI6MjEwNzE2NTExOH0.OrfEkY_SWHfl1TaJZAyKxDrzICch-L48ft8o1LfNyws' };

const __liveEls = [document.getElementById('live-big')].filter(Boolean);
function paintLive(n) {
  const t = typeof n === 'number' ? n.toLocaleString('pl-PL') : n;
  __liveEls.forEach(el => el.textContent = t);
}

if (SUPABASE && window.supabase) {
  const sb = window.supabase.createClient(SUPABASE.url, SUPABASE.anon);
  let tabId = sessionStorage.getItem('polonium-tab');
  if (!tabId) {
    tabId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
    sessionStorage.setItem('polonium-tab', tabId);
  }
  const fresh = () => new Date(Date.now() - 60000).toISOString();
  const beat = () => sb.from('presence').upsert({ id: tabId, seen: new Date().toISOString() }).then(() => {});
  const count = () => sb.from('presence').select('id', { count: 'exact', head: true }).gt('seen', fresh())
    .then(({ count: n }) => { if (typeof n === 'number') paintLive(n); }).catch(() => {});
  beat(); count();
  setInterval(beat, 20000);   // heartbeat: karta żyje
  setInterval(count, 5000);   // ping bazy co 5 s, bez refreshu strony
  window.addEventListener('pagehide', () => { try { sb.from('presence').delete().eq('id', tabId); } catch {} });
} else {
  paintLive('—'); // brak configu = pauza, zero ściemy
}

// ---------- BUY LICENSE → CHAT (Edge Function ticket-chat, id = sekret) ----------
// Cennik lustrzany z funkcją: 1zł/dzień, cap 30zł (30D flat), lifetime 99zł.
const CHAT_API = 'https://jofzsdbebwbjbsitetli.supabase.co/functions/v1/ticket-chat';
const PRICE_DAY = 1, PRICE_MONTH = 30, PRICE_LIFE = 99, MAX_DAYS = 30;
(function chat() {
  const fab = document.getElementById('chat-fab');
  const panel = document.getElementById('chat-panel');
  if (!fab || !panel) return;
  const msgs = document.getElementById('chat-msgs');
  const inputRow = document.getElementById('chat-input');
  const form = document.getElementById('chat-form');
  const priceEl = document.getElementById('chat-price');
  let days = 1;
  let ticketId = null;
  try { ticketId = (JSON.parse(localStorage.getItem('polonium-ticket') || 'null') || {}).id || null; } catch {}
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const price = () => {
    if (days === 'lifetime') return PRICE_LIFE;
    const n = Math.max(1, Math.min(MAX_DAYS, days | 0));
    return n >= 30 ? PRICE_MONTH : Math.min(n * PRICE_DAY, PRICE_MONTH);
  };
  const open = () => panel.classList.remove('hidden');
  const close = () => panel.classList.add('hidden');
  document.querySelectorAll('.buy-open').forEach(b => b.onclick = open);
  fab.onclick = () => panel.classList.contains('hidden') ? open() : close();
  document.getElementById('chat-x').onclick = close;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.querySelectorAll('.chat-days button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.chat-days button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const d = b.dataset.days;
    days = d === 'lifetime' ? 'lifetime' : parseInt(d, 10);
    document.getElementById('chat-days').value = '';
    priceEl.textContent = price() + ' zł';
  });
  document.getElementById('chat-days').oninput = (e) => {
    const n = parseInt(e.target.value, 10);
    if (Number.isFinite(n) && n >= 1) {
      days = Math.min(MAX_DAYS, n);
      document.querySelectorAll('.chat-days button').forEach(x => x.classList.remove('active'));
      priceEl.textContent = price() + ' zł';
    }
  };
  function bubble(who, text, ts) {
    const d = document.createElement('div');
    d.className = 'msg m-' + who;
    const t = ts ? new Date(ts).toLocaleString('pl-PL') : '';
    d.innerHTML = `<small>${esc(who === 'user' ? 'ty' : who)} · ${esc(t)}</small><p>${esc(text)}</p>`;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function resetChat(msg) {
    ticketId = null;
    try { localStorage.removeItem('polonium-ticket'); } catch {}
    form.classList.remove('hidden');
    document.getElementById('chat-plan').style.display = '';
    inputRow.classList.add('hidden');
    msgs.innerHTML = '';
    if (msg) bubble('auto', msg);
  }
  async function poll() {
    if (!ticketId || panel.classList.contains('hidden')) return;
    try {
      const r = await fetch(CHAT_API + '/poll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId })
      });
      const j = await r.json();
      if (r.status === 404) { resetChat('ticket nie istnieje — zacznij od nowa'); return; }
      if (!r.ok) return;
      const have = msgs.querySelectorAll('.msg').length;
      if ((j.messages || []).length !== have) {
        msgs.innerHTML = '';
        (j.messages || []).forEach(m => bubble(m.sender, m.text, m.created_at));
      }
    } catch {}
  }
  document.getElementById('chat-start').onclick = async () => {
    const nick = document.getElementById('chat-nick').value.trim().slice(0, 24);
    const contact = document.getElementById('chat-contact').value.trim().slice(0, 64);
    if (!nick || !contact) { bubble('auto', 'uzupełnij nick i kontakt'); return; }
    try {
      const r = await fetch(CHAT_API + '/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nick, contact, days })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'błąd');
      ticketId = j.id;
      try { localStorage.setItem('polonium-ticket', JSON.stringify({ id: ticketId })); } catch {}
      form.classList.add('hidden');
      document.getElementById('chat-plan').style.display = 'none';
      inputRow.classList.remove('hidden');
      poll();
    } catch (e) {
      bubble('auto', 'błąd: ' + String(e.message || e).slice(0, 120));
    }
  };
  let sendBusy = false;
  async function send() {
    if (sendBusy) return;
    const inp = document.getElementById('chat-text');
    const text = inp.value.trim().slice(0, 1000);
    if (!text || !ticketId) return;
    sendBusy = true;
    inp.value = '';
    try {
      const r = await fetch(CHAT_API + '/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, text })
      });
      const j = await r.json();
      sendBusy = false;
      if (r.status === 404 || r.status === 403) { resetChat('ticket nieaktywny — zacznij od nowa'); return; }
      if (!r.ok) { bubble('auto', 'błąd wysyłki: ' + ((j && j.error) || r.status)); return; }
      poll();
    } catch {
      sendBusy = false;
      bubble('auto', 'błąd sieci — spróbuj ponownie');
    }
  }
  document.getElementById('chat-send').onclick = send;
  document.getElementById('chat-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  if (ticketId) { form.classList.add('hidden'); document.getElementById('chat-plan').style.display = 'none'; inputRow.classList.remove('hidden'); poll(); }
  setInterval(poll, 5000);
})();

// dvd screensaver
(function dvd() {
  const el = document.getElementById('dvd');
  if (!el) return;
  const colors = ['#caff3d', '#7dd3fc', '#ffffff', '#ffb400', '#ff5d5d', '#4ade80'];
  let x = 60, y = 80, vx = 0.6, vy = 0.45, ci = 0;
  const W = 120, H = 34;
  function frame() {
    const bw = window.innerWidth, bh = window.innerHeight;
    x += vx; y += vy;
    let hit = false;
    if (x <= 0) { x = 0; vx = Math.abs(vx); hit = true; }
    if (x + W >= bw) { x = bw - W; vx = -Math.abs(vx); hit = true; }
    if (y <= 0) { y = 0; vy = Math.abs(vy); hit = true; }
    if (y + H >= bh) { y = bh - H; vy = -Math.abs(vy); hit = true; }
    if (hit) { ci = (ci + 1) % colors.length; el.style.color = colors[ci]; }
    el.style.transform = `translate(${x}px,${y}px)`;
    requestAnimationFrame(frame);
  }
  el.style.color = colors[0];
  requestAnimationFrame(frame);
})();
