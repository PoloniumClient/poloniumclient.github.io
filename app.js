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

// ---------- BUY LICENSE → TICKET (Supabase tickets, anon insert) ----------
(function ticket() {
  const modal = document.getElementById('ticket-modal');
  if (!modal || !window.supabase) return;
  const sb = window.supabase.createClient(SUPABASE.url, SUPABASE.anon);
  const status = document.getElementById('ticket-status');
  const open = () => { modal.classList.remove('hidden'); status.textContent = ''; };
  const close = () => modal.classList.add('hidden');
  document.querySelectorAll('.buy-open').forEach(b => b.onclick = open);
  const cb = document.getElementById('ticket-close');
  if (cb) cb.onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  let busy = false, lastSend = 0;
  document.getElementById('ticket-send').onclick = async () => {
    if (busy) return;
    if (Date.now() - lastSend < 15000) { status.textContent = 'zwolnij (15s)'; return; } // anty-spam
    const nick = document.getElementById('t-nick').value.trim().slice(0, 24);
    const contact = document.getElementById('t-contact').value.trim().slice(0, 64);
    const plan = document.getElementById('t-plan').value;
    const message = document.getElementById('t-msg').value.trim().slice(0, 500);
    if (!nick || !contact) { status.textContent = 'uzupełnij nick i kontakt'; return; }
    busy = true; lastSend = Date.now();
    status.textContent = 'wysyłam...';
    try {
      // id generujemy po stronie klienta (anon nie ma prawa odczytu ticketa z powrotem)
      const tid = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }));
      const { error } = await sb.from('tickets').insert({ id: tid, nick, contact, plan, message });
      if (error) throw error;
      status.textContent = 'ticket przyjęty #' + tid.slice(0, 8) + ' — admin odezwie się na podany kontakt';
      document.getElementById('t-msg').value = '';
    } catch (e) {
      status.textContent = 'błąd: ' + (e.message || e).slice(0, 100);
    }
    busy = false;
  };
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
