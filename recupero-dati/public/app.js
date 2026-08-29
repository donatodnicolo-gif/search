'use strict';
// Logica dell'interfaccia: elenca i dispositivi, avvia il recupero, mostra il
// progresso e i file ritrovati in tempo reale (via Server-Sent Events).

const $ = (s) => document.querySelector(s);
let selected = null;   // { target, size, sectorSize, label }
let jobId = null;
let outLive = null;
let searchJobId = null;
let recoveredNames = [];   // nomi dei file ritrovati col nome, per il controllo copie vive

function human(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

function diskIcon(d) {
  if (d.removable || /USB/i.test(d.bus)) return '💾';
  if (/SD|MMC/i.test(d.bus)) return '🗂️';
  return '🖴';
}

function select(target, label, size, sectorSize) {
  selected = { target, label, size: size || 0, sectorSize: sectorSize || 512 };
  document.querySelectorAll('.device').forEach((n) => n.classList.remove('sel'));
  const box = $('#selected');
  box.classList.remove('hidden');
  box.innerHTML = `Sorgente scelta: <b>${label}</b> <span class="muted">(${target}${size ? ', ' + human(size) : ''})</span>`;
  $('#start').disabled = false;
}

async function loadDevices() {
  $('#devices').innerHTML = '<p class="muted">Cerco i dispositivi…</p>';
  let data;
  try { data = await (await fetch('/api/devices')).json(); } catch (e) { $('#devices').innerHTML = '<p class="muted">Errore nel leggere i dispositivi.</p>'; return; }
  if (!$('#outDir').value) $('#outDir').value = data.suggestedOut || '';

  const box = $('#devices'); box.innerHTML = '';
  if (data.rawAccess === false) {
    const warn = el('div', 'admin-warn',
      '<b>Attenzione: il server gira SENZA permessi di amministratore.</b> ' +
      'La lettura dei dischi e delle chiavette reali fallira\' (zero file trovati). ' +
      'Chiudi il server e riavvialo da un PowerShell <b>aperto come amministratore</b>: ' +
      '<code>node C:\\Users\\nicol\\scoutwt\\recupero-dati\\src\\server.js</code>. ' +
      'La ricerca del passo 0 e i file immagine funzionano comunque.');
    box.appendChild(warn);
  } else if (data.rawAccess === true) {
    box.appendChild(el('div', 'admin-ok', '<span class="badge rem"><span class="dot"></span>Permessi di amministratore attivi: posso leggere i dischi reali.</span>'));
  }
  if (!data.disks.length && !data.phones.length) {
    box.innerHTML += '<p class="muted">Nessun dispositivo. Se hai attaccato una chiavetta, avvia l\'app come <b>amministratore</b> e premi Aggiorna.</p>';
  }

  for (const d of data.disks) {
    const card = el('div', 'device');
    const vols = d.volumes.map((v) => `<span class="badge">${v.letter ? v.letter + ':' : '—'} ${v.fs || '?'}</span>`).join('');
    card.innerHTML = `
      <div class="ico">${diskIcon(d)}</div>
      <div class="d-main">
        <div class="d-title">${d.model}</div>
        <div class="d-meta">${human(d.size)} · ${d.bus || 'disco'} · settore ${d.sectorSize}b</div>
        <div class="vols">
          ${d.removable ? '<span class="badge rem"><span class="dot"></span>rimovibile</span>' : '<span class="badge"><span class="dot"></span>fisso</span>'}
          ${vols}
        </div>
      </div>`;
    card.addEventListener('click', () => select(d.devicePath, d.model + ' (disco intero)', d.size, d.sectorSize));
    box.appendChild(card);

    // scorciatoie per singolo volume
    for (const v of d.volumes.filter((x) => x.letter)) {
      const sub = el('div', 'device');
      sub.style.marginLeft = '22px';
      sub.innerHTML = `<div class="ico">📁</div><div class="d-main"><div class="d-title">Volume ${v.letter}: <span class="badge">${v.fs || '?'}</span></div><div class="d-meta">${v.label || 'senza etichetta'} · ${human(v.size)}</div></div>`;
      sub.addEventListener('click', () => select(`\\\\.\\${v.letter}:`, `Volume ${v.letter}: (${v.fs || '?'})`, v.size, d.sectorSize));
      box.appendChild(sub);
    }
  }

  for (const p of data.phones) {
    const card = el('div', 'device');
    card.innerHTML = `<div class="ico">📱</div><div class="d-main"><div class="d-title">${p.name}</div><div class="d-meta">${p.type} — cerca e copia i file che il telefono espone</div></div>`;
    const panel = el('div', 'phone-panel hidden');
    panel.innerHTML = `
      <p class="muted small">Il telefono non mostra al PC la memoria come un disco (MTP + cifratura): niente scansione profonda dei cancellati senza root.
      Ma le foto cancellate spesso vivono ancora: <b>Galleria → Eliminati di recente</b> (30 giorni), <b>Google Foto → Cestino</b> (60 giorni, o ancora nel cloud),
      per le foto WhatsApp riapri la chat. Qui sotto cerchi per nome fra i file che il telefono espone (cestini nascosti inclusi, se visibili).
      <b>Serve: telefono sbloccato e USB in modalita' "Trasferimento file" — e va tenuto SBLOCCATO per tutta la ricerca</b> (se lo schermo si spegne, il telefono smette di rispondere al PC).</p>
      <div class="searchbar">
        <input class="input ph-pattern" type="text" placeholder="Parte del nome, es. WA0011" />
        <button class="btn btn-primary ph-search">Cerca nel telefono</button>
        <button class="btn btn-ghost ph-copy">Cerca e copia sul PC</button>
      </div>
      <div class="muted small ph-status hidden"></div>
      <div class="res-list search-list ph-results hidden"></div>`;
    card.addEventListener('click', () => panel.classList.toggle('hidden'));
    const statusEl = panel.querySelector('.ph-status');
    const listEl = panel.querySelector('.ph-results');
    const go = (copy) => {
      const pattern = panel.querySelector('.ph-pattern').value.trim();
      if (pattern.length < 3) { statusEl.classList.remove('hidden'); statusEl.textContent = 'Scrivi almeno 3 caratteri del nome.'; return; }
      statusEl.classList.remove('hidden'); statusEl.textContent = 'Avvio la ricerca nel telefono…';
      listEl.innerHTML = ''; listEl.classList.add('hidden');
      panel.querySelector('.ph-search').disabled = true; panel.querySelector('.ph-copy').disabled = true;
      fetch('/api/phone-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device: p.name, pattern, copy, outDir: $('#outDir').value.trim() }) })
        .then((r) => r.json())
        .then((res) => {
          if (res.error) { statusEl.textContent = res.error; phDone(panel); return; }
          const es = new EventSource('/api/events/' + res.jobId);
          es.onmessage = (msg) => {
            const ev = JSON.parse(msg.data);
            if (ev.type === 'phase') statusEl.textContent = ev.label + '…';
            else if (ev.type === 'search-progress') statusEl.textContent = `Cerco nel telefono… ${ev.files.toLocaleString('it')} file esaminati`;
            else if (ev.type === 'match') {
              listEl.classList.remove('hidden');
              const row = el('div', 'res-row');
              row.innerHTML = `<span class="badge type">telefono</span><span class="path">${ev.match.path}</span><span class="size">${human(ev.match.size)}</span>`;
              listEl.appendChild(row);
            } else if (ev.type === 'done') {
              const s = ev.summary || {};
              statusEl.textContent = s.matches
                ? `Trovati ${s.matches} file nel telefono${copy ? ` — copiati ${s.copied} in ${s.copyDest}` : ''}.`
                : (s.files
                  ? `Nessun file con questo nome fra i ${s.files.toLocaleString('it')} che il telefono espone. Controlla i cestini di Galleria e Google Foto (vedi sopra).`
                  : 'Il telefono non espone alcun file: sbloccalo e imposta USB su "Trasferimento file", poi riprova.');
              es.close(); phDone(panel);
            } else if (ev.type === 'error') { statusEl.textContent = 'Errore: ' + ev.message; es.close(); phDone(panel); }
          };
          es.onerror = () => { es.close(); phDone(panel); };
        })
        .catch((e) => { statusEl.textContent = 'Errore: ' + e; phDone(panel); });
    };
    panel.querySelector('.ph-search').addEventListener('click', (e) => { e.stopPropagation(); go(false); });
    panel.querySelector('.ph-copy').addEventListener('click', (e) => { e.stopPropagation(); go(true); });
    panel.addEventListener('click', (e) => e.stopPropagation());
    box.appendChild(card);
    box.appendChild(panel);
  }

  const pr = data.photorec || {};
  $('#prBox').innerHTML = pr.available
    ? `<span class="badge gold"><span class="dot"></span>PhotoRec disponibile</span> <span class="muted">verra' proposto per i casi difficili</span>`
    : `<span class="muted">PhotoRec non installato — il motore interno lavora comunque. Per i casi difficili: scaricalo da cgsecurity.org.</span>`;
}

// ---------- Passo 0: ricerca tra i file esistenti ----------
function openPath(p) {
  fetch('/api/open-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) });
}

function renderMatch(list, m) {
  const row = el('div', 'res-row');
  const badge = m.source === 'cestino'
    ? '<span class="badge cest">Cestino</span>'
    : '<span class="badge vivo">esiste</span>';
  const extra = m.source === 'cestino'
    ? `<span class="size">${m.cancellato || ''}</span>`
    : `<span class="size">${human(m.size)}</span>`;
  row.innerHTML = `${badge}<span class="path" title="${m.path}">${m.path}</span>${extra}`;
  if (m.source === 'disco') {
    const b = el('button', 'open', 'apri');
    b.addEventListener('click', () => openPath(m.path));
    row.appendChild(b);
  }
  list.appendChild(row);
}

function runSearch(patterns, { statusEl, listEl, doneMsg }) {
  return fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patterns }) })
    .then((r) => r.json())
    .then((res) => {
      if (res.error) { statusEl.textContent = res.error; return; }
      searchJobId = res.jobId;
      let matches = 0;
      const es = new EventSource('/api/events/' + res.jobId);
      es.onmessage = (msg) => {
        const ev = JSON.parse(msg.data);
        if (ev.type === 'phase') statusEl.textContent = ev.label + '…';
        else if (ev.type === 'search-progress') statusEl.textContent = `Cerco… ${ev.files.toLocaleString('it')} file esaminati · ${ev.matches} trovati`;
        else if (ev.type === 'match') { matches++; renderMatch(listEl, ev.match); listEl.classList.remove('hidden'); }
        else if (ev.type === 'done') {
          statusEl.textContent = matches
            ? (doneMsg ? doneMsg(matches) : `Trovati ${matches} file con questo nome: il file potrebbe non essere perso affatto.`)
            : 'Nessun file esistente con questo nome: ha senso passare al recupero (passi 1-3).';
          es.close(); searchDone();
        }
        else if (ev.type === 'error') { statusEl.textContent = 'Errore: ' + ev.message; es.close(); searchDone(); }
      };
      es.onerror = () => { es.close(); searchDone(); };
    })
    .catch((e) => { statusEl.textContent = 'Errore: ' + e; searchDone(); });
}

function searchDone() { $('#searchBtn').disabled = false; $('#searchStop').classList.add('hidden'); }
function phDone(panel) { panel.querySelector('.ph-search').disabled = false; panel.querySelector('.ph-copy').disabled = false; }

function startSearch() {
  const q = $('#searchName').value.trim();
  const statusEl = $('#searchStatus');
  if (q.length < 3) { statusEl.classList.remove('hidden'); statusEl.textContent = 'Scrivi almeno 3 caratteri del nome.'; return; }
  const listEl = $('#searchResults');
  listEl.innerHTML = ''; listEl.classList.add('hidden');
  statusEl.classList.remove('hidden'); statusEl.textContent = 'Avvio la ricerca…';
  $('#searchBtn').disabled = true; $('#searchStop').classList.remove('hidden');
  runSearch([q], { statusEl, listEl });
}

// ---------- Recupero ----------
function startRecover() {
  if (!selected) return;
  const mode = document.querySelector('input[name=mode]:checked').value;
  const body = {
    target: selected.target, outDir: $('#outDir').value.trim(), label: selected.label,
    mode, includeLive: $('#live').checked, sectorSize: selected.sectorSize, size: selected.size,
  };
  $('#results').classList.remove('hidden');
  $('#progress').classList.remove('hidden');
  $('#resList').innerHTML = ''; $('#counts').innerHTML = '';
  recoveredNames = [];
  $('#liveCheck').classList.add('hidden'); $('#liveCheckOut').innerHTML = '';
  $('#start').disabled = true; $('#stop').classList.remove('hidden'); $('#openOut').classList.add('hidden');
  $('#phase').textContent = 'Avvio…'; $('#bar').style.width = '0%'; $('#pct').textContent = '0%'; $('#found').textContent = '0';

  const counts = {}; let total = 0;

  fetch('/api/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .then((res) => {
      if (res.error) { $('#phase').textContent = 'Errore: ' + res.error; resetButtons(); return; }
      jobId = res.jobId; outLive = res.outDir;
      const es = new EventSource('/api/events/' + jobId);
      es.onmessage = (m) => {
        const ev = JSON.parse(m.data);
        if (ev.type === 'phase') { $('#phase').textContent = ev.label; }
        else if (ev.type === 'progress') {
          const pct = ev.total ? ((ev.scanned / ev.total) * 100) : 0;
          $('#bar').style.width = pct + '%'; $('#pct').textContent = pct.toFixed(1) + '%';
          // durante la scansione mostra gli inizi di file individuati (l'estrazione viene dopo)
          if (ev.found > total) $('#found').textContent = ev.found + ' inizi di file individuati — estrazione a fine scansione';
        }
        else if (ev.type === 'file') {
          total++; $('#found').textContent = total;
          const f = ev.file; const cat = f.category || (f.group === 'filesystem' ? (f.fs || 'con-nome') : f.group);
          counts[cat] = (counts[cat] || 0) + 1; renderCounts(counts);
          if (f.name && f.deleted) recoveredNames.push(f.name);
          const row = el('div', 'res-row');
          const badge = f.type ? `<span class="badge type">${f.type}</span>` : `<span class="badge">${f.fs || 'file'}</span>`;
          row.innerHTML = `${badge}<span class="name">${f.name || f.file}</span>${f.deleted ? '<span class="badge del">cancellato</span>' : ''}<span class="size">${human(f.size)}</span>`;
          const list = $('#resList'); list.insertBefore(row, list.firstChild);
        }
        else if (ev.type === 'done') { $('#phase').textContent = `Fatto — ${total} file recuperati`; $('#bar').style.width = '100%'; $('#pct').textContent = '100%'; es.close(); finish(); }
        else if (ev.type === 'error') { $('#phase').textContent = 'Errore: ' + ev.message; es.close(); resetButtons(); }
      };
      es.onerror = () => { es.close(); };
    })
    .catch((e) => { $('#phase').textContent = 'Errore: ' + e; resetButtons(); });
}

function renderCounts(counts) {
  $('#counts').innerHTML = Object.entries(counts).map(([k, v]) => `<span class="badge">${k}: <b>&nbsp;${v}</b></span>`).join('');
}
function resetButtons() { $('#start').disabled = false; $('#stop').classList.add('hidden'); }
function finish() {
  resetButtons();
  if (outLive) $('#openOut').classList.remove('hidden');
  // avviso: per i file recuperati col nome si puo' controllare se esistono ancora copie vive
  if (recoveredNames.length) {
    $('#liveCheck').classList.remove('hidden');
    $('#liveCheckOut').textContent = `${recoveredNames.length} file recuperati col nome: posso cercare se ne esistono ancora copie in altre cartelle o unita'.`;
  }
}

function checkLiveCopies() {
  const names = [...new Set(recoveredNames)].slice(0, 100); // dedup, con un tetto ragionevole
  if (!names.length) return;
  $('#liveCheckBtn').disabled = true;
  const statusEl = $('#liveCheckOut');
  const listEl = el('div', 'res-list search-list');
  $('#liveCheck').appendChild(listEl);
  runSearch(names, {
    statusEl, listEl,
    doneMsg: (n) => `Attenzione: ${n} copie ancora VIVE trovate — questi file esistono gia' da altre parti (righe verdi qui sotto).`,
  }).then(() => { $('#liveCheckBtn').disabled = false; });
}

$('#refresh').addEventListener('click', loadDevices);
$('#searchBtn').addEventListener('click', startSearch);
$('#searchName').addEventListener('keydown', (e) => { if (e.key === 'Enter') startSearch(); });
$('#searchStop').addEventListener('click', () => { if (searchJobId) fetch('/api/stop/' + searchJobId, { method: 'POST' }); });
$('#liveCheckBtn').addEventListener('click', checkLiveCopies);
$('#start').addEventListener('click', startRecover);
$('#stop').addEventListener('click', () => { if (jobId) fetch('/api/stop/' + jobId, { method: 'POST' }); });
$('#openOut').addEventListener('click', () => { if (outLive) fetch('/api/open-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: outLive }) }); });
$('#pickManual').addEventListener('click', () => { const v = $('#manual').value.trim(); if (v) select(v, 'Percorso manuale', 0, 512); });

loadDevices();
