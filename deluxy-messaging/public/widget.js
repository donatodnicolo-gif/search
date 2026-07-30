// Deluxy Customer Service — widget di chat per i siti.
//
// Uso minimo:
//   <script src="https://deluxy-messaging.vercel.app/widget.js" defer></script>
//
// Con l'aspetto scelto:
//   <script src="…/widget.js" defer
//           data-tema="caldo" data-accento="#9c5b3f"
//           data-posizione="destra" data-etichetta="Scrivici"></script>
//
// Aprire la chat da un punto d'ingresso del sito (una voce «Live Chat» nel menu
// contatti, un bottone in una landing):
//   window.DeluxyChat.apri()      // .chiudi() .alterna() .eAperta()
//
// ⚠️ PERCHÉ TUTTO STA DENTRO UNO SHADOW DOM
// Questo script gira su siti che non controlliamo: temi Shopify, WordPress,
// pagine fatte a mano. Il loro CSS colpisce qualunque cosa attacchiamo alla
// pagina — basta un `button { text-transform: uppercase !important }` o un
// reset che azzera i border-radius e il bottone diventa un rettangolo storto.
// Con `attachShadow` gli stili del sito non entrano e i nostri non escono: è
// l'unico modo per avere lo stesso aspetto su ogni sito senza rincorrere i CSS
// altrui a colpi di !important.
(function () {
  var script = document.currentScript;
  if (!script) return;
  var origine = new URL(script.src).origin;

  function dato(nome, difetto) {
    var v = script.getAttribute('data-' + nome);
    return v === null || v === '' ? difetto : v;
  }

  var TEMI = ['chiaro', 'scuro', 'deluxy', 'caldo', 'minimale', 'automatico'];
  var tema = String(dato('tema', 'chiaro')).toLowerCase();
  if (TEMI.indexOf(tema) === -1) tema = 'chiaro';
  var accento = /^#[0-9a-f]{6}$/i.test(dato('accento', '')) ? dato('accento', '') : '';
  var aSinistra = String(dato('posizione', 'destra')).toLowerCase() === 'sinistra';
  var margine = parseInt(dato('margine', '20'), 10);
  if (isNaN(margine) || margine < 0 || margine > 200) margine = 20;
  var etichetta = dato('etichetta', ''); // testo accanto al bottone, facoltativo
  // DA QUALE SITO arriva la chat: decide titolo e saluto, e in Inbox la colonna
  // del marchio. Senza `data-sito` tutto funziona come prima, coi testi
  // generali: gli snippet già incollati sui siti non vanno toccati.
  var sito = String(dato('sito', '')).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);

  // I colori del BOTTONE, che vive sul sito ospite e non dentro l'iframe:
  // devono corrispondere al tema scelto, altrimenti si vede una pastiglia nera
  // sopra una chat avorio.
  var TAVOLOZZA = {
    chiaro: { sfondo: '#111318', segno: '#ffffff' },
    scuro: { sfondo: '#f2f2f4', segno: '#16171a' },
    deluxy: { sfondo: '#111318', segno: '#b8963e' },
    caldo: { sfondo: '#9c5b3f', segno: '#ffffff' },
    minimale: { sfondo: '#1d1d1f', segno: '#ffffff' },
    automatico: { sfondo: '#111318', segno: '#ffffff' },
  };
  var colori = TAVOLOZZA[tema] || TAVOLOZZA.chiaro;
  if (accento) colori = { sfondo: accento, segno: '#ffffff' };

  var lato = aSinistra ? 'left' : 'right';

  // ── Il contenitore isolato ────────────────────────────────────────────────
  var ospite = document.createElement('div');
  ospite.id = 'deluxy-chat';
  // `all: initial` protegge anche il contenitore: lo shadow DOM ferma gli stili
  // che entrano, ma il div che lo porta è pur sempre un elemento del sito.
  ospite.style.cssText = 'all: initial; position: fixed; z-index: 2147483000;';
  var radice = ospite.attachShadow ? ospite.attachShadow({ mode: 'open' }) : null;
  var dentro = radice || ospite; // browser antichi: si degrada, non si rompe

  var stile = document.createElement('style');
  stile.textContent = [
    ':host, * { box-sizing: border-box; }',
    '.avvio {',
    '  position: fixed; ' + lato + ': ' + margine + 'px; bottom: ' + margine + 'px;',
    '  display: flex; align-items: center; justify-content: center; gap: 10px;',
    '  height: 56px; min-width: 56px; padding: 0 ' + (etichetta ? '20px' : '0') + ';',
    '  border: none; border-radius: 980px; cursor: pointer;',
    '  background: ' + colori.sfondo + '; color: ' + colori.segno + ';',
    "  font: 500 15px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;",
    '  box-shadow: 0 4px 12px rgba(0,0,0,.18), 0 24px 60px rgba(0,0,0,.12);',
    '  transition: transform .2s cubic-bezier(.25,.1,.25,1), box-shadow .2s;',
    '}',
    '.avvio:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,.22), 0 28px 70px rgba(0,0,0,.16); }',
    '.avvio:active { transform: translateY(0); }',
    '.avvio:focus-visible { outline: 2px solid ' + colori.sfondo + '; outline-offset: 3px; }',
    '.avvio svg { flex: none; }',
    '.avvio .testo { white-space: nowrap; }',
    '.pannello {',
    '  position: fixed; ' + lato + ': ' + margine + 'px; bottom: ' + (margine + 68) + 'px;',
    '  width: 380px; height: 580px;',
    '  max-width: calc(100vw - ' + margine * 2 + 'px);',
    '  max-height: calc(100vh - ' + (margine + 88) + 'px);',
    '  border: none; border-radius: 20px; overflow: hidden;',
    '  box-shadow: 0 4px 12px rgba(0,0,0,.18), 0 24px 60px rgba(0,0,0,.22);',
    '  background: transparent; display: none;',
    '  opacity: 0; transform: translateY(8px) scale(.98);',
    '  transition: opacity .18s cubic-bezier(.25,.1,.25,1), transform .18s cubic-bezier(.25,.1,.25,1);',
    '}',
    '.pannello.visibile { display: block; }',
    '.pannello.aperto { opacity: 1; transform: none; }',
    // Telefono: la chat prende tutto lo schermo. Una finestrella da 380px su un
    // display da 360 esce dai bordi e il campo di scrittura finisce sotto la
    // tastiera. Il bottone sparisce: dentro c'è la ×.
    '@media (max-width: 480px) {',
    '  .pannello { right: 0; left: 0; top: 0; bottom: 0;',
    '    width: 100%; height: 100%; max-width: none; max-height: none; border-radius: 0; }',
    '  .avvio.nascosto { display: none; }',
    '}',
    // Chi ha chiesto meno animazioni non le vede: è un'impostazione di
    // accessibilità del sistema, non una preferenza estetica.
    '@media (prefers-reduced-motion: reduce) {',
    '  .avvio, .pannello { transition: none; }',
    '}',
  ].join('\n');

  var ICONA_CHAT =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.9 8.9 0 0 1-3.2-.6L3 21l1.8-5.2a8 8 0 0 1-.8-3.5A8.4 8.4 0 0 1 12.5 4 8.4 8.4 0 0 1 21 11.5z"/></svg>';
  var ICONA_CHIUDI =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function segnoBottone(chiuso) {
    return chiuso
      ? ICONA_CHAT + (etichetta ? '<span class="testo"></span>' : '')
      : ICONA_CHIUDI;
  }

  var bottone = document.createElement('button');
  bottone.className = 'avvio';
  bottone.type = 'button';
  bottone.setAttribute('aria-label', 'Apri la chat');
  bottone.setAttribute('aria-expanded', 'false');
  bottone.innerHTML = segnoBottone(true);
  if (etichetta) bottone.querySelector('.testo').textContent = etichetta;

  // ── DA DOVE ARRIVA CHI SCRIVE ────────────────────────────────────────────
  //
  // Chi apre la chat dopo aver cliccato un annuncio non è chi arriva dal
  // passaparola: cambia l'urgenza e cambia cosa vale la pena proporgli. Queste
  // informazioni le ha solo la PAGINA OSPITE — dentro l'iframe `document.referrer`
  // è il sito, non Google — quindi si leggono qui e si passano di là.
  //
  // ⚠️ Si legge solo quello che c'è ADESSO: niente cookie, niente storia salvata
  // sul sito ospite. Chi clicca l'annuncio oggi e scrive fra due giorni risulta
  // «diretto», ed è meglio dirlo che costruirci sopra un tracciamento.
  // ⚠️ Della pagina si prende il PERCORSO, non la query: in quei parametri può
  // finire di tutto, email comprese, e non è roba da mettere in un URL nostro.
  var provenienza = (function () {
    try {
      var q = new URLSearchParams(window.location.search);
      var dati = {};
      var utm = ['utm_source', 'utm_medium', 'utm_campaign'];
      for (var i = 0; i < utm.length; i++) {
        var v = q.get(utm[i]);
        if (v) dati[utm[i]] = String(v).slice(0, 60);
      }
      // `gclid` c'è solo se il clic viene da Google Ads; `fbclid` da Meta. Si
      // tiene il FATTO che ci sono, non il loro valore: quello identifica il
      // singolo clic e a noi non serve.
      if (q.get('gclid') || q.get('gbraid') || q.get('wbraid')) dati.gclid = '1';
      if (q.get('fbclid') || q.get('ttclid')) dati.fbclid = '1';
      if (document.referrer) {
        try {
          var r = new URL(document.referrer);
          if (r.hostname !== window.location.hostname) dati.rif = r.hostname.slice(0, 80);
        } catch (e) {}
      }
      dati.pagina = String(window.location.pathname || '/').slice(0, 120);
      return dati;
    } catch (e) {
      return {};
    }
  })();

  var iframe = document.createElement('iframe');
  var parametri = 'tema=' + encodeURIComponent(tema);
  for (var chiave in provenienza) {
    if (Object.prototype.hasOwnProperty.call(provenienza, chiave)) {
      parametri += '&' + chiave + '=' + encodeURIComponent(provenienza[chiave]);
    }
  }
  if (accento) parametri += '&accento=' + encodeURIComponent(accento);
  if (sito) parametri += '&sito=' + encodeURIComponent(sito);
  iframe.src = origine + '/widget?' + parametri;
  iframe.title = 'Chat con il servizio clienti';
  iframe.className = 'pannello';

  var aperto = false;
  function apri(vero) {
    aperto = vero;
    bottone.setAttribute('aria-expanded', vero ? 'true' : 'false');
    bottone.setAttribute('aria-label', vero ? 'Chiudi la chat' : 'Apri la chat');
    bottone.innerHTML = segnoBottone(!vero);
    if (!vero && etichetta) bottone.querySelector('.testo').textContent = etichetta;
    bottone.classList.toggle('nascosto', vero);
    if (vero) {
      iframe.classList.add('visibile');
      // Due fotogrammi: il primo monta l'elemento, il secondo fa partire la
      // transizione. Con uno solo il browser salta l'animazione.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          iframe.classList.add('aperto');
        });
      });
    } else {
      iframe.classList.remove('aperto');
      setTimeout(function () {
        if (!aperto) iframe.classList.remove('visibile');
      }, 200);
    }
  }

  bottone.addEventListener('click', function () {
    apri(!aperto);
  });

  // La × dentro la chat (sul telefono) chiede al sito di chiudere.
  window.addEventListener('message', function (ev) {
    if (ev.origin === origine && ev.data === 'deluxy-widget:chiudi') apri(false);
  });

  // Esc chiude, come ogni finestra sovrapposta.
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && aperto) apri(false);
  });

  // ── Aprire la chat da fuori ───────────────────────────────────────────────
  // Diversi siti hanno già il loro punto d'ingresso — la voce «Live Chat» nel
  // menu contatti, un bottone dentro una landing — e vogliono che sia quello ad
  // aprire la chat. Senza questo appiglio l'unica via è il bottone flottante:
  // il resto è chiuso qui dentro e dentro uno shadow DOM, irraggiungibile.
  window.DeluxyChat = {
    apri: function () { apri(true); },
    chiudi: function () { apri(false); },
    alterna: function () { apri(!aperto); },
    eAperta: function () { return aperto; },
  };

  // ── Aprire la chat da un elemento CHE C'È GIÀ SUL SITO ───────────────────
  //
  // Caso reale: nel menu contatti c'è già una voce «Live Chat» che punta a un
  // servizio esterno — `<a class="dialogify" href="https://chatting.page/…">`.
  // Cambiare quel link vorrebbe dire mettere le mani nel tema; con
  // `data-apri-da="a.dialogify"` invece la stessa voce apre la nostra chat e
  // basta lo snippet.
  //
  // ⚠️ Il click si ascolta sul DOCUMENTO, non sull'elemento: i menu dei temi
  // Shopify si costruiscono con JavaScript e spesso quel link non esiste ancora
  // quando questo script parte. Con la delega funziona anche se compare dopo, e
  // funziona per tutti gli elementi che combaciano, non solo per il primo.
  var selettoreApri = dato('apri-da', '');
  if (selettoreApri) {
    document.addEventListener(
      'click',
      function (ev) {
        var partenza = ev.target;
        if (!partenza || !partenza.closest) return;
        var bersaglio;
        try {
          bersaglio = partenza.closest(selettoreApri);
        } catch (e) {
          return; // selettore scritto male: non si rompe il sito per un refuso
        }
        if (!bersaglio) return;
        // `preventDefault` perché quel link porterebbe altrove — è il punto:
        // il visitatore resta sulla pagina e la chat si apre qui.
        ev.preventDefault();
        apri(true);
      },
      true
    );
  }

  // ── I link rapidi della chat portano il visitatore sul sito ──────────────
  //
  // I bottoni («Regali per oggi») vivono dentro l'iframe, su un altro dominio:
  // da là dentro il browser NON lascia cambiare l'indirizzo della pagina che
  // ospita. Quindi la chat chiede, e qui si decide.
  //
  // ⚠️ Il controllo è qui e non di là: un messaggio può arrivare da chiunque
  // abbia un iframe in questa pagina. Si accettano solo i messaggi che vengono
  // dal NOSTRO iframe e solo indirizzi di questo stesso sito — un link a un
  // dominio esterno si apre in una scheda nuova, non porta via il visitatore.
  window.addEventListener('message', function (ev) {
    if (ev.source !== iframe.contentWindow) return;
    if (ev.origin !== origine) return;
    var dati = ev.data;
    if (!dati || dati.tipo !== 'deluxy-chat-vai' || !dati.url) return;
    var url;
    try {
      url = new URL(String(dati.url), window.location.href);
    } catch (e) {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.hostname === window.location.hostname) window.location.href = url.href;
    else window.open(url.href, '_blank', 'noopener');
  });

  dentro.appendChild(stile);
  dentro.appendChild(iframe);
  // Il bottone flottante si può togliere: se la chat si apre dalla voce di menu
  // che c'era già, due punti d'ingresso sono uno di troppo — e in fondo a destra
  // c'è spesso già il carrello o il consenso ai cookie.
  if (String(dato('bottone', 'si')).toLowerCase() !== 'no') dentro.appendChild(bottone);

  function monta() {
    document.body.appendChild(ospite);
    if (dato('apri-subito', '') === 'si') apri(true);
  }
  if (document.body) monta();
  else document.addEventListener('DOMContentLoaded', monta);
})();
