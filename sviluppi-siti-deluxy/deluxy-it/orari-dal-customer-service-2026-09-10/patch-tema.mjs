// Produce in ./out i sei file del tema deluxy.it con le date e le fasce lette dal Customer Service.
// Sostituzioni ANCORATE (ogni ancora deve essere unica), poi controllo di sintassi dei blocchi <script>
// dopo una simulazione del rendering Liquid, confrontata con il file originale come baseline.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const qui = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(qui, 'out');
fs.mkdirSync(out, { recursive: true });

function leggi(nome) { return fs.readFileSync(path.join(qui, nome.replace('/', '__')), 'utf8'); }
function scrivi(nome, t) { fs.writeFileSync(path.join(out, nome.replace('/', '__')), t, 'utf8'); }
function sost(t, a, b, nome) {
  const n = t.split(a).length - 1;
  if (n !== 1) throw new Error(`${nome}: ancora trovata ${n} volte: ${a.slice(0, 80)}`);
  return t.replace(a, b);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. IL MODULO, in coda a snippets/all_tags_and_script.liquid (head di ogni pagina)
// ─────────────────────────────────────────────────────────────────────────────
const MODULO = `
<!-- ⭐ 10/09/2026 — DATE E FASCE DI CONSEGNA DAL CUSTOMER SERVICE (deluxy-messaging.vercel.app).
     Le regole (giorni aperti, chiusure, fasce per oggi/domani/oltre, ora limite) hanno UNA casa: il
     Customer Service, pagina «Orari negozi». Il tema le LEGGE da /api/pubblico/consegna e da qui
     costruisce i calendari (giorni spenti col motivo) e la tendina delle fasce. Se l'API non risponde
     entro 3 s: l'ultima risposta buona di oggi (localStorage); altrimenti le regole cablate nel tema
     restano come ripiego. Se il Customer Service dice «non configurato», il tema tiene le sue regole.
     Vincoli che conosce solo il sito e passa all'API: il preavviso (prodotto.consegna, la variante
     prima del prodotto) e l'orario minimo (custom.minimo_orario) dei prodotti in carrello — e, sulla
     scheda prodotto, del prodotto che si sta guardando. -->
<script>
window.DeluxyConsegna = (function () {
  var API = 'https://deluxy-messaging.vercel.app/api/pubblico/consegna';
  var DOMINIO = {{ shop.permanent_domain | json }};
  var lead = 0, oraMin = 0, codici = [];
  {%- for item in cart.items -%}
    {%- assign dlx_lead = item.product.metafields.prodotto.consegna -%}
    {%- if item.product.variants.size > 1 and item.variant.metafields.prodotto.consegna != blank -%}{%- assign dlx_lead = item.variant.metafields.prodotto.consegna -%}{%- endif -%}
  lead = Math.max(lead, Number({{ dlx_lead | default: 0 | json }}) || 0);
  oraMin = Math.max(oraMin, Number({{ item.product.metafields.custom.minimo_orario | default: 0 | json }}) || 0);
  {%- if item.sku != blank -%}codici.push({{ item.sku | json }});{%- endif -%}
  {%- endfor -%}
  {%- if product -%}
  lead = Math.max(lead, Number({{ product.metafields.prodotto.consegna | default: 0 | json }}) || 0);
  oraMin = Math.max(oraMin, Number({{ product.metafields.custom.minimo_orario | default: 0 | json }}) || 0);
  {%- if product.selected_or_first_available_variant.sku != blank -%}codici.push({{ product.selected_or_first_available_variant.sku | json }});{%- endif -%}
  {%- endif -%}
  // Gli SKU dei prodotti in carrello (e della scheda): con quelli il Customer Service chiede alla
  // piattaforma consegne il calendario del PARTNER che li prepara — giorni chiusi, ora di apertura,
  // «chiuso per oggi» — e lo mette nel calendario che ci manda.
  codici = codici.filter(function (c, i) { return c && codici.indexOf(c) === i; }).slice(0, 30).sort();
  var CHIAVE = 'dlx_consegna_v1';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function adesso() {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).reduce(function (a, x) { a[x.type] = x.value; return a; }, {});
    return { data: p.year + '-' + p.month + '-' + p.day, minuti: (Number(p.hour) % 24) * 60 + Number(p.minute) };
  }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daIso(s) { var p = String(s).split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
  var stato = { dati: null, fonte: '', mappa: {} };
  function applica(dati, fonte) {
    stato.dati = dati; stato.fonte = fonte; stato.mappa = {};
    var g = (dati && dati.giorni) || [];
    for (var i = 0; i < g.length; i++) { stato.mappa[g[i].data] = g[i]; }
  }
  function leggiCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CHIAVE) || 'null');
      if (c && c.data === adesso().data && c.lead === lead && c.oraMin === oraMin && c.codici === codici.join(',') && c.dati) { return c.dati; }
    } catch (e) {}
    return null;
  }
  function scriviCache(dati) {
    try { localStorage.setItem(CHIAVE, JSON.stringify({ data: adesso().data, lead: lead, oraMin: oraMin, codici: codici.join(','), dati: dati })); } catch (e) {}
  }
  var inCache = leggiCache();
  if (inCache) { applica(inCache, 'cache'); }
  var pronto = new Promise(function (risolvi) {
    var url = API + '?dominio=' + encodeURIComponent(DOMINIO) + '&oraMinima=' + oraMin + '&leadGiorni=' + lead + (codici.length ? '&codici=' + encodeURIComponent(codici.join(',')) : '');
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) { ctrl.abort(); } }, 3000);
    var f = (typeof fetch === 'function') ? fetch(url, { signal: ctrl ? ctrl.signal : undefined, credentials: 'omit' }) : Promise.reject(new Error('no fetch'));
    f.then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        clearTimeout(timer);
        if (d && d.configurato) { applica(d, 'api'); scriviCache(d); }
        else if (d && d.configurato === false) { applica(null, 'non-configurato'); }
        risolvi(stato);
      })
      .catch(function () { clearTimeout(timer); risolvi(stato); });
  });
  function attivo() { return !!(stato.dati && stato.dati.configurato); }
  function giorno(isoData) { return attivo() ? (stato.mappa[isoData] || null) : null; }
  function primoGiorno() { return attivo() ? (stato.dati.primoGiorno || null) : null; }
  function primoGiornoDate() { var p = primoGiorno(); return p ? daIso(p) : null; }
  function giorniSpenti() {
    if (!attivo()) { return []; }
    var g = stato.dati.giorni, spenti = [];
    for (var i = 0; i < g.length; i++) { if (!g[i].ok) { spenti.push(daIso(g[i].data)); } }
    return spenti;
  }
  // La FONTE delle fasce scelte, scritta sul carrello (attributo Fasce_Fonte) e riscritta ogni
  // volta che cambia: «customer-service (api|cache)» quando le fasce vengono da qui, «tema
  // (regole cablate)» quando il carrello è ricaduto sulle sue regole (API muta o data oltre
  // l'orizzonte). Trovato dal test del 10/09: prima restava «customer-service» anche sul ripiego.
  var fonteSegnata = '';
  function segnaFonte(fonte) {
    var valore = fonte === 'tema' ? 'tema (regole cablate)' : (attivo() ? 'customer-service (' + stato.fonte + ')' : 'tema (regole cablate)');
    if (fonteSegnata === valore) { return; }
    fonteSegnata = valore;
    try {
      fetch('/cart/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attributes: { 'Fasce_Fonte': valore } }) }).catch(function () {});
    } catch (e) {}
  }
  return { pronto: pronto, attivo: attivo, giorno: giorno, primoGiorno: primoGiorno, primoGiornoDate: primoGiornoDate, giorniSpenti: giorniSpenti, iso: iso, daIso: daIso, adesso: adesso, segnaFonte: segnaFonte, stato: stato, vincoli: { lead: lead, oraMin: oraMin, codici: codici } };
})();
</script>`;

{
  const nome = 'snippets/all_tags_and_script.liquid';
  let t = leggi(nome);
  if (t.includes('window.DeluxyConsegna')) throw new Error(nome + ': modulo già presente');
  t = t.replace(/\s*$/, '') + '\n' + MODULO + '\n';
  scrivi(nome, t);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. IL CARRELLO: snippets/delivery_date_hour_c.liquid
// ─────────────────────────────────────────────────────────────────────────────
{
  const nome = 'snippets/delivery_date_hour_c.liquid';
  let t = leggi(nome);
  // a) l'avvio aspetta le regole (fino a 3 s), con un testo sobrio nel frattempo
  t = sost(t, `  $( window ).ready(function() {\n\n      var currentDate = new Date();`,
`  $( window ).ready(function() {
    // ⭐ 10/09/2026: prima si aspettano le regole del Customer Service (fino a 3 s), poi si costruisce il calendario.
    var __dlxDiv = document.getElementById('date_disp2');
    if (__dlxDiv && window.DeluxyConsegna) { __dlxDiv.textContent = {% if request.locale.iso_code == 'it' %}'Calcolo le consegne disponibili…'{% else %}'Checking available delivery dates…'{% endif %}; }
    var __dlxAvvio = function () {
    if (__dlxDiv) { __dlxDiv.innerHTML = ''; }

      var currentDate = new Date();`, nome);
  t = sost(t, `        }\n  });\n\nfunction formatDate(dateString) {`,
`        }
    };
    if (window.DeluxyConsegna) { DeluxyConsegna.pronto.then(__dlxAvvio, __dlxAvvio); } else { __dlxAvvio(); }
  });

function formatDate(dateString) {`, nome);
  // b) la prima data la dice il Customer Service
  t = sost(t, `        var today =  days + "-" + month + "-" +  year;\n        var div = document.getElementById('date_disp2');`,
`        var today =  days + "-" + month + "-" +  year;
        // ⭐ Customer Service: la prima data buona secondo le sue regole (giorni chiusi, ora limite, preavviso, orario minimo).
        if (window.DeluxyConsegna && DeluxyConsegna.attivo() && DeluxyConsegna.primoGiorno()) {
            today2 = DeluxyConsegna.primoGiorno();
            today = today2.substr(8, 2) + '-' + today2.substr(5, 2) + '-' + today2.substr(0, 4);
            year = Number(today2.substr(0, 4)); month = today2.substr(5, 2); days = today2.substr(8, 2);
        }
        var div = document.getElementById('date_disp2');`, nome);
  // c) la data ricordata dal browser, se non si può più scegliere, lascia il posto alla prima buona
  t = sost(t, `          var localDeliveryDate = localDeliveryDate.replace(/,(\\s+)?$/, '');\n\n          //alert(localDay);`,
`          var localDeliveryDate = localDeliveryDate.replace(/,(\\s+)?$/, '');
          // ⭐ Se la data ricordata non si può più scegliere (giorno chiuso, ora limite passata, prima del preavviso), si parte dalla prima buona.
          if (window.DeluxyConsegna && DeluxyConsegna.attivo()) {
              var __gRic = DeluxyConsegna.giorno(localDeliveryDate);
              if ((__gRic && !__gRic.ok) || localDeliveryDate < today2) {
                  localDeliveryDate = today2; localDeliveryDateInit = today2; localDate = today;
              }
          }

          //alert(localDay);`, nome);
  // c2) «prima data disponibile»: se la data ricordata non è la prima, si dicono tutte e due
  t = sost(t, `          var primadata='{{ 'cart.general.earliest_avilabletime' | t }}  <br>' + localDate + ' ' ;
          div.innerHTML += primadata ;`,
`          var primadata='{{ 'cart.general.earliest_avilabletime' | t }}  <br>' + localDate + ' ' ;
          // ⭐ 10/09/2026 (test di acquisto): se la data ricordata NON è la prima disponibile, si dicono tutte e due —
          // «la prima disponibile è oggi» e «data scelta: domani» — invece di chiamare «prima data» quella scelta.
          if (window.DeluxyConsegna && DeluxyConsegna.attivo() && DeluxyConsegna.primoGiorno() && DeluxyConsegna.primoGiorno() !== localDeliveryDate) {
              var __pg = DeluxyConsegna.primoGiorno();
              primadata = '{{ 'cart.general.earliest_avilabletime' | t }}  <br>' + __pg.substr(8, 2) + '-' + __pg.substr(5, 2) + '-' + __pg.substr(0, 4) + ' · ' + {% if request.locale.iso_code == 'it' %}'data scelta: '{% else %}'chosen date: '{% endif %} + localDate + ' ';
          }
          div.innerHTML += primadata ;`, nome);
  // d) il datepicker: giorni chiusi non cliccabili, col motivo; parte dopo le regole
  t = sost(t, `    jQuery(document).ready(function () {
        jQuery('.datepicker').datepicker({
            dateFormat: 'yy-mm-dd',
            minDate: $('.pickup_date').attr('min'),
            startDate: '+1d'
        });
      
    });`,
`    jQuery(document).ready(function () {
        var __dlxPicker = function () {
        jQuery('.datepicker').datepicker({
            dateFormat: 'yy-mm-dd',
            minDate: $('.pickup_date').attr('min'),
            startDate: '+1d',
            // ⭐ 10/09/2026 (test mobile): il calendario parlava inglese con la domenica per prima, mentre
            // home e modale partono dal lunedì in italiano — stessa griglia ovunque.
            firstDay: 1,
            {% if request.locale.iso_code == 'it' %}
            monthNames: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'],
            monthNamesShort: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'],
            dayNames: ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'],
            dayNamesShort: ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'],
            dayNamesMin: ['Do', 'Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa'],
            prevText: 'Mese precedente',
            nextText: 'Mese successivo',
            {% endif %}
            // ⭐ 10/09/2026: i giorni che il Customer Service dice chiusi non si cliccano, e il motivo si legge passandoci sopra.
            beforeShowDay: function (d) {
                if (!window.DeluxyConsegna || !DeluxyConsegna.attivo()) { return [true, '', '']; }
                var g = DeluxyConsegna.giorno(DeluxyConsegna.iso(d));
                if (!g) { return [true, '', '']; }
                return [g.ok, g.ok ? '' : 'dlx-giorno-chiuso', g.ok ? '' : g.motivo];
            }
        });
        };
        if (window.DeluxyConsegna) { DeluxyConsegna.pronto.then(__dlxPicker, __dlxPicker); } else { __dlxPicker(); }
    });`, nome);
  // e) le fasce dal Customer Service, prima delle regole cablate (che restano come ripiego)
  t = sost(t, `    if (tmpDate == today) {\n        // OGGI: fasce di 2 ore`,
`    // ⭐ 10/09/2026 — LE FASCE LE DICE IL CUSTOMER SERVICE (pagina «Orari negozi»): giorni chiusi, ora limite,
    // fasce di oggi/domani/oltre, orario minimo e preavviso dei prodotti. Le regole cablate qui sotto restano
    // solo come ripiego quando l'API non ha risposto (o per una data oltre il suo orizzonte).
    if (window.DeluxyConsegna && DeluxyConsegna.attivo()) {
        var __iso = tmpDate.substr(6, 4) + '-' + tmpDate.substr(3, 2) + '-' + tmpDate.substr(0, 2);
        var __g = DeluxyConsegna.giorno(__iso);
        if (__g) {
            if (!__g.ok) { blockCheckout({% if request.locale.iso_code == 'it' %}__g.motivo{% else %}'Not available for delivery. ' + __g.motivo{% endif %}); return; }
            for (var __k = 0; __k < __g.fasce.length; __k++) {
                $('#ddlFasciaOraria').append(new Option(__g.fasce[__k].etichetta, __g.fasce[__k].valore));
            }
            enableCheckout();
            DeluxyConsegna.segnaFonte();
            __dlxSalvaData(tmpDate);
            return;
        }
    }

    if (window.DeluxyConsegna) { DeluxyConsegna.segnaFonte('tema'); }

    if (tmpDate == today) {
        // OGGI: fasce di 2 ore`, nome);
  // e2) le fasce di ripiego usano lo stesso trattino «–» delle fasce dell'API (test mobile: «08:00-10:00» vs «08:00–10:00»)
  t = sost(t, `        $('#ddlFasciaOraria').append(new Option(pad(a) + ':00-' + pad(b) + ':00', pad(a) + '-' + pad(b)));`,
`        $('#ddlFasciaOraria').append(new Option(pad(a) + ':00\u2013' + pad(b) + ':00', pad(a) + '-' + pad(b)));`, nome);
  t = sost(t, `            if (ora_min_def <= 8) { $('#ddlFasciaOraria').append(new Option('08:00-10:00', '08-10')); }`,
`            if (ora_min_def <= 8) { $('#ddlFasciaOraria').append(new Option('08:00\u201310:00', '08-10')); }`, nome);
  // f) la coda che salva la data diventa una funzione, usata da tutte e due le strade
  t = sost(t, `    // Salva la data scelta (localStorage + campo hidden formato YYYY-MM-DD)\n    if (!tmpDate.includes('/')) { return; }`,
`    __dlxSalvaData(tmpDate);
}

function __dlxSalvaData(tmpDate) {
    // Salva la data scelta (localStorage + campo hidden formato YYYY-MM-DD)
    if (!tmpDate.includes('/')) { return; }`, nome);
  // g) stile dei giorni chiusi
  t = sost(t, `.ui-datepicker-unselectable .ui-state-default {\n  color: #eee;\n  border: 2px solid transparent;\n}`,
`.ui-datepicker-unselectable .ui-state-default {
  color: #eee;
  border: 2px solid transparent;
}
/* 10/09/2026: giorni chiusi secondo il Customer Service */
.ui-datepicker td.dlx-giorno-chiuso .ui-state-default { text-decoration: line-through; opacity: 0.45; }
/* 10/09/2026 (test mobile): bersagli del tocco almeno 44 px — il bottone del checkout era 37 px a 12 px,
   le celle del calendario 35 px, le frecce 28 px (design system §2.7). */
@media (pointer: coarse) {
  #bntCheckout { min-height: 44px; font-size: 14px; }
  .ui-datepicker { width: auto; }
  .ui-datepicker .ui-state-default, .ui-widget-content .ui-state-default { width: 44px !important; height: 44px !important; line-height: 44px !important; }
  /* le frecce: la scatola era 1.8em (28 px) del tema base di jQuery UI; la freccia disegnata col :after resta alla stessa altezza */
  .ui-datepicker .ui-datepicker-prev, .ui-datepicker .ui-datepicker-next { width: 44px; height: 44px; top: 3px; margin-top: 0; }
  .ui-datepicker .ui-datepicker-prev:after, .ui-datepicker .ui-datepicker-next:after { margin: -37px 0 0 18px; }
}`, nome);
  scrivi(nome, t);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. I TRE CALENDARI Semantic UI (header, home vecchia, home nuova)
// ─────────────────────────────────────────────────────────────────────────────
for (const [nome, sel] of [
  ['sections/header.liquid', "'#header_deliverydate'"],
  ['snippets/home-delivery.liquid', "'#deliverydate'"],
  ['sections/home-delivery-section-new.liquid', "'#deliverydate'"],
]) {
  let t = leggi(nome);
  const ancoraA = `if (Number(__dlxP.hour) >= 20) { today.setDate(today.getDate() + 1); }`;
  const indent = t.match(new RegExp(`([ \\t]*)${ancoraA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))[1];
  t = sost(t, ancoraA,
`${ancoraA}
${indent}// ⭐ 10/09/2026: la prima data e i giorni chiusi li dice il Customer Service (subito se già in cache, poi appena risponde).
${indent}if (window.DeluxyConsegna && DeluxyConsegna.primoGiornoDate()) { today = DeluxyConsegna.primoGiornoDate(); }
${indent}if (window.DeluxyConsegna) { DeluxyConsegna.pronto.then(function () {
${indent}  var __p = DeluxyConsegna.primoGiornoDate(); if (!__p) { return; }
${indent}  try { $(${sel}).calendar('setting', 'minDate', __p); $(${sel}).calendar('setting', 'disabledDates', DeluxyConsegna.giorniSpenti()); $(${sel}).calendar('refresh'); } catch (e) {}
${indent}}); }`, nome);
  t = sost(t, `minDate: new Date(today.getFullYear(), today.getMonth(), today.getDate()),`,
`minDate: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
${indent}  disabledDates: (window.DeluxyConsegna ? DeluxyConsegna.giorniSpenti() : []),`, nome);
  scrivi(nome, t);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. LA SCHEDA PRODOTTO
// ─────────────────────────────────────────────────────────────────────────────
{
  const nome = 'snippets/product-delivery-date.liquid';
  let t = leggi(nome);
  t = sost(t, `      if (lead == 0 && Number(p.hour) >= 20) { dd.setDate(dd.getDate() + 1); }\n      return dd;`,
`      if (lead == 0 && Number(p.hour) >= 20) { dd.setDate(dd.getDate() + 1); }
      // ⭐ 10/09/2026: la prima data la dice il Customer Service, se è più avanti (giorni chiusi, ora limite, preavviso).
      if (window.DeluxyConsegna) { var __pp = DeluxyConsegna.primoGiornoDate(); if (__pp && __pp > dd) { dd = __pp; } }
      return dd;`, nome);
  t = sost(t, `  $(".product-calendar").calendar({\n        inline: true,`,
`  if (window.DeluxyConsegna) { DeluxyConsegna.pronto.then(function () {
    var __p = DeluxyConsegna.primoGiornoDate(); if (!__p) { return; }
    try { $(".product-calendar").calendar('setting', 'minDate', __p); $(".product-calendar").calendar('setting', 'disabledDates', DeluxyConsegna.giorniSpenti()); $(".product-calendar").calendar('refresh'); } catch (e) {}
  }); }
  $(".product-calendar").calendar({
        inline: true,`, nome);
  t = sost(t, `        minDate: new Date(start.getFullYear(), start.getMonth(), start.getDate()),`,
`        minDate: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
        disabledDates: (window.DeluxyConsegna ? DeluxyConsegna.giorniSpenti() : []),`, nome);
  scrivi(nome, t);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CONTROLLO DI SINTASSI dei blocchi <script>, dopo una simulazione del Liquid
// ─────────────────────────────────────────────────────────────────────────────
function simulaLiquid(t) {
  return t
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '')
    // {% if %}A{% else %}B{% endif %} su una riga → resta A (nel tema i due rami sono stringhe alternative)
    .replace(/\{%-?\s*if\b[^%]*%\}([^{]*?)\{%-?\s*else\s*-?%\}[^{]*?\{%-?\s*endif\s*-?%\}/g, '$1')
    .replace(/\{\{[^}]*\|\s*json\s*\}\}/g, '0')
    .replace(/\{\{[^}]*\|\s*t\s*\}\}/g, 'testo')
    .replace(/\{\{[^}]*\}\}/g, '"x"')
    .replace(/\{%-?[^%]*-?%\}/g, '');
}
function controlla(nome, t) {
  const blocchi = [...simulaLiquid(t).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const errori = [];
  blocchi.forEach((b, i) => { try { new Function(b); } catch (e) { errori.push(`blocco ${i + 1}: ${e.message}`); } });
  return { blocchi: blocchi.length, errori };
}
let male = 0;
for (const nome of ['snippets/all_tags_and_script.liquid', 'snippets/delivery_date_hour_c.liquid', 'sections/header.liquid', 'snippets/home-delivery.liquid', 'sections/home-delivery-section-new.liquid', 'snippets/product-delivery-date.liquid']) {
  const prima = controlla(nome, leggi(nome));
  const dopo = controlla(nome, fs.readFileSync(path.join(out, nome.replace('/', '__')), 'utf8'));
  const nuoviErrori = dopo.errori.filter((e) => !prima.errori.some((p) => p.split(':').slice(1).join(':') === e.split(':').slice(1).join(':')));
  const dim = fs.statSync(path.join(out, nome.replace('/', '__'))).size;
  console.log(`${nuoviErrori.length ? 'NO ' : 'ok '} ${nome.padEnd(45)} ${String(dim).padStart(6)} byte · script ${dopo.blocchi} · errori prima ${prima.errori.length} dopo ${dopo.errori.length}`);
  if (prima.errori.length) console.log('     (baseline già con errori: ' + prima.errori.join(' | ').slice(0, 200) + ')');
  if (nuoviErrori.length) { male++; console.log('     NUOVI: ' + nuoviErrori.join(' | ')); }
}
console.log(male ? `\n${male} file con errori NUOVI` : '\nSintassi: nessun errore nuovo');
process.exit(male ? 1 : 0);
