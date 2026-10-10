// Strona ticketa: /ticket/?id=... — pełny chat jak messenger.
const API = 'https://jofzsdbebwbjbsitetli.supabase.co/functions/v1/ticket-chat';
const PRICE_DAY = 1, PRICE_MONTH = 30, PRICE_LIFE = 99, MAX_DAYS = 30;
(function page() {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = new URLSearchParams(location.search);
  let ticketId = q.get('id') || null;
  let days = 1;
  let busy = false;
  const price = () => {
    if (days === 'lifetime') return PRICE_LIFE;
    const n = Math.max(1, Math.min(MAX_DAYS, days | 0));
    return n >= 30 ? PRICE_MONTH : Math.min(n * PRICE_DAY, PRICE_MONTH);
  };
  document.querySelectorAll('.chat-days button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.chat-days button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const d = b.dataset.days;
    days = d === 'lifetime' ? 'lifetime' : parseInt(d, 10);
    $('t-days').value = '';
    $('t-price').textContent = price() + ' zł';
  });
  $('t-days').oninput = (e) => {
    const n = parseInt(e.target.value, 10);
    if (Number.isFinite(n) && n >= 1) {
      days = Math.min(MAX_DAYS, n);
      document.querySelectorAll('.chat-days button').forEach(x => x.classList.remove('active'));
      $('t-price').textContent = price() + ' zł';
    }
  };
  function bubble(who, text, ts) {
    const d = document.createElement('div');
    d.className = 'tm m-' + who;
    const t = ts ? new Date(ts).toLocaleString('pl-PL') : '';
    const label = who === 'user' ? 'ty' : who;
    d.innerHTML = `<small>${esc(label)} · ${esc(t)}</small><p>${esc(text)}</p>`;
    $('t-msgs').appendChild(d);
    $('t-msgs').scrollTop = $('t-msgs').scrollHeight;
  }
  function setMode(chat) {
    $('t-form').classList.toggle('hidden', chat);
    $('t-input').classList.toggle('hidden', !chat);
    $('t-close').classList.toggle('hidden', !chat);
  }
  async function poll() {
    if (!ticketId) return;
    try {
      const r = await fetch(API + '/poll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId })
      });
      const j = await r.json();
      if (r.status === 404) {
        $('t-pill').textContent = 'brak';
        $('t-pill').className = 'pill err';
        bubble('auto', 'Nie ma takiego ticketa. Załóż nowy poniżej.');
        ticketId = null;
        setMode(false);
        history.replaceState(null, '', location.pathname);
        return;
      }
      if (!r.ok || !j.ticket) return;
      $('t-ref').textContent = '#' + String(j.ticket.id).slice(0, 8);
      $('t-sub').textContent = `${j.ticket.nick} · plan ${j.ticket.plan || '?'} · status: ${j.ticket.status}`;
      const pill = $('t-pill');
      pill.textContent = j.ticket.status;
      pill.className = 'pill ' + (j.ticket.status === 'open' ? 'ok' : '');
      const have = $('t-msgs').querySelectorAll('.tm').length;
      if ((j.messages || []).length !== have) {
        $('t-msgs').innerHTML = '';
        (j.messages || []).forEach(m => bubble(m.sender, m.text, m.created_at));
      }
      if (j.ticket.status !== 'open') $('t-close').classList.add('hidden');
    } catch {}
  }
  $('t-start').onclick = async () => {
    if (busy) return;
    const nick = $('t-nick').value.trim().slice(0, 24);
    const contact = $('t-contact').value.trim().slice(0, 64);
    if (!nick || !contact) { bubble('auto', 'uzupełnij nick i kontakt'); return; }
    busy = true;
    try {
      const r = await fetch(API + '/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nick, contact, days })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'błąd');
      ticketId = j.id;
      try { localStorage.setItem('polonium-ticket', JSON.stringify({ id: ticketId })); } catch {}
      history.replaceState(null, '', '?id=' + encodeURIComponent(ticketId));
      setMode(true);
      poll();
    } catch (e) {
      bubble('auto', 'błąd: ' + String(e.message || e).slice(0, 120));
    }
    busy = false;
  };
  async function send() {
    if (busy) return;
    const text = $('t-text').value.trim().slice(0, 1000);
    if (!text || !ticketId) return;
    busy = true;
    $('t-text').value = '';
    try {
      const r = await fetch(API + '/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, text })
      });
      const j = await r.json();
      if (r.status === 404 || r.status === 403) {
        ticketId = null;
        setMode(false);
        $('t-msgs').innerHTML = '';
        history.replaceState(null, '', location.pathname);
        bubble('auto', 'Ticket nieaktywny — załóż nowy.');
      } else if (!r.ok) {
        bubble('auto', 'błąd wysyłki: ' + ((j && j.error) || r.status));
      } else poll();
    } catch {
      bubble('auto', 'błąd sieci — spróbuj ponownie');
    }
    busy = false;
  }
  $('t-send').onclick = send;
  $('t-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  $('t-close').onclick = async () => {
    if (!ticketId || !confirm('Na pewno zamknąć ticket?')) return;
    try {
      await fetch(API + '/close', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId })
      });
    } catch {}
    poll();
  };
  if (ticketId) setMode(true);
  poll();
  setInterval(poll, 4000);
})();
