// Sandbox: il modulo DeluxyConsegna + il carrello (delivery_date_hour_c) con un'API finta
// (la risposta vera dell'API locale, salvata in ../consegna.json) e un mini-jQuery.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const qui = path.dirname(fileURLToPath(import.meta.url));
const risposta = JSON.parse(fs.readFileSync(path.join(qui, '..', 'consegna.json'), 'utf8'));
// Rendo un giorno chiuso, per provare il blocco
risposta.giorni[2].ok = false; risposta.giorni[2].motivo = 'Il negozio è chiuso sab 12/09/2026 (inventario).'; risposta.giorni[2].fasce = [];
const OGGI = risposta.adesso.data;

function liquid(t, locale = 'it') {
  return t
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '')
    .replace(/\{%-?\s*if request\.locale\.iso_code == 'it'\s*-?%\}([\s\S]*?)\{%-?\s*else\s*-?%\}([\s\S]*?)\{%-?\s*endif\s*-?%\}/g, locale === 'it' ? '$1' : '$2')
    .replace(/\{%-?\s*if request\.locale\.iso_code != 'it'\s*-?%\}([\s\S]*?)\{%-?\s*endif\s*-?%\}/g, locale === 'it' ? '' : '$1')
    .replace(/\{\{\s*shop\.permanent_domain\s*\|\s*json\s*\}\}/g, '"deluxygifts.myshopify.com"')
    .replace(/\{\{[^}]*\|\s*json\s*\}\}/g, '0')
    .replace(/\{\{[^}]*\|\s*t\s*\}\}/g, 'testo')
    .replace(/\{\{[^}]*\}\}/g, '"x"')
    .replace(/\{%-?[^%]*-?%\}/g, '');
}
const scripts = (t) => [...t.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);

// ── il mondo finto ──
const mem = {};
const localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const sessionStorage = { getItem: () => null, setItem() {} };
let chiamateApi = [], chiamateCart = [];
const fetch = (url, init) => {
  if (String(url).includes('/api/pubblico/consegna')) { chiamateApi.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(risposta))) }); }
  chiamateCart.push({ url, body: init && init.body }); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
};
const elementi = {};
function el(id) { return elementi[id] || (elementi[id] = { id, value: '', innerHTML: '', textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } }); }
const document = { getElementById: (id) => el(id), addEventListener() {}, body: { classList: { contains: () => true } } };
const opzioni = []; // la tendina
let bloccoMsg = '', checkoutDisabilitato = false, picker = null;
function Option(text, value) { this.text = text; this.value = value; }
function $(sel) {
  const s = typeof sel === 'string' ? sel : '__oggetto__';
  return {
    ready(fn) { $.readyFns.push(fn); },
    children() { return { remove() { if (s === '#ddlFasciaOraria') opzioni.length = 0; } }; },
    append(o) { if (s === '#ddlFasciaOraria') opzioni.push(o); },
    html(v) { if (s === '#divCheckDelivery' && v !== undefined) bloccoMsg = v === '&nbsp;' ? '' : v; },
    text(v) { if (s === '#divCheckDelivery' && v !== undefined) bloccoMsg = v; },
    css() {}, removeAttr(k) { if (s === '#bntCheckout' && k === 'disabled') checkoutDisabilitato = false; }, attr(k, v) { if (s === '#bntCheckout' && k === 'disabled') { checkoutDisabilitato = true; return; } if (s === '.pickup_date' && k === 'min') return el('DeliveryDate_def').attrs.min; return undefined; },
    datepicker(opts) { picker = opts; }, on() {},
  };
}
$.readyFns = [];
const jQuery = $;
const window = { DeluxyConsegna: undefined, location: {}, jQuery, addEventListener() {} };
const console2 = { log() {}, error() {} };

// ── carico il modulo ──
const allTags = fs.readFileSync(path.join(qui, 'out', 'snippets__all_tags_and_script.liquid'), 'utf8');
const modulo = scripts(liquid(allTags)).find((b) => b.includes('window.DeluxyConsegna'));
new Function('window', 'localStorage', 'fetch', 'Intl', 'AbortController', 'setTimeout', 'clearTimeout', 'Promise', 'JSON', modulo)(window, localStorage, fetch, Intl, undefined, setTimeout, clearTimeout, Promise, JSON);
const DC = window.DeluxyConsegna;
let male = 0;
const prova = (nome, ok, det = '') => { if (!ok) male++; console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${det ? '  — ' + det : ''}`); };

await DC.pronto;
prova('modulo: API chiamata una volta con dominio e vincoli', chiamateApi.length === 1 && chiamateApi[0].includes('dominio=deluxygifts.myshopify.com') && chiamateApi[0].includes('oraMinima=0'), chiamateApi[0]);
prova('modulo: attivo dopo la risposta', DC.attivo() && DC.stato.fonte === 'api');
prova('modulo: primo giorno = oggi', DC.primoGiorno() === OGGI, String(DC.primoGiorno()));
prova('modulo: il giorno chiuso è fra gli spenti', DC.giorniSpenti().length === 1 && DC.iso(DC.giorniSpenti()[0]) === risposta.giorni[2].data);
prova('modulo: cache scritta per oggi', !!mem.dlx_consegna_v1 && JSON.parse(mem.dlx_consegna_v1).data === OGGI);

// ── carico il carrello ──
const carrello = fs.readFileSync(path.join(qui, 'out', 'snippets__delivery_date_hour_c.liquid'), 'utf8');
const blocchi = scripts(liquid(carrello));
const ctx = { window, document, localStorage, sessionStorage, $, jQuery, Option, console: console2, Intl, DeluxyConsegna: DC, Number, String, Date, Math, Promise, setTimeout, clearTimeout };
const esegui = (codice) => new Function(...Object.keys(ctx), codice + '\n;return { fnCheckDate: typeof fnCheckDate === "function" ? fnCheckDate : null };')(...Object.values(ctx));
const esito1 = esegui(blocchi[0]);
esegui(blocchi[1]);
// gli handler ready aspettano la promessa: li lancio e attendo
for (const fn of $.readyFns) fn();
await new Promise((r) => setTimeout(r, 30));
await DC.pronto; await new Promise((r) => setTimeout(r, 30));

prova('carrello: data di partenza = primo giorno del CS', el('DeliveryDate_def').value === OGGI, el('DeliveryDate_def').value);
prova('carrello: min del datepicker = primo giorno', el('DeliveryDate_def').attrs.min === OGGI, el('DeliveryDate_def').attrs.min);
prova('carrello: tendina di oggi = fasce del CS (etichetta cliente, value tema)', opzioni.length === 1 + risposta.giorni[0].fasce.length && opzioni[1].value === risposta.giorni[0].fasce[0].valore && opzioni[1].text === risposta.giorni[0].fasce[0].etichetta, opzioni.map((o) => o.value + '=' + o.text).join(' '));
prova('carrello: checkout attivo e nessun messaggio', !checkoutDisabilitato && !bloccoMsg, bloccoMsg);
prova('carrello: fonte segnata sul carrello (Fasce_Fonte)', chiamateCart.some((c) => String(c.body).includes('Fasce_Fonte')));
prova('carrello: datepicker con beforeShowDay', picker && typeof picker.beforeShowDay === 'function');
if (picker) {
  const chiuso = picker.beforeShowDay(DC.daIso(risposta.giorni[2].data));
  const aperto = picker.beforeShowDay(DC.daIso(risposta.giorni[1].data));
  prova('datepicker: il giorno chiuso non si clicca e mostra il motivo', chiuso[0] === false && chiuso[2].includes('chiuso'), chiuso[2]);
  prova('datepicker: il giorno aperto si clicca', aperto[0] === true);
}
// cambio data: domani → 7 fasce da 2 ore
esito1.fnCheckDate(risposta.giorni[1].data);
prova('fnCheckDate(domani): 7 fasce di 2 ore', opzioni.length === 8 && opzioni[1].value === '08-10' && opzioni[7].value === '20-22', opzioni.map((o) => o.value).join(' '));
prova('fnCheckDate(domani): data salvata nel campo e in localStorage', el('DeliveryDate_def').value === risposta.giorni[1].data && /2026/.test(mem.delivery_date_val || ''), mem.delivery_date_val);
// giorno chiuso → blocco con motivo
esito1.fnCheckDate(risposta.giorni[2].data);
prova('fnCheckDate(giorno chiuso): checkout bloccato col motivo del CS', checkoutDisabilitato && bloccoMsg.includes('inventario'), bloccoMsg);
// oltre l'orizzonte dell'API → ripiego alle regole del tema (nessun crash)
esito1.fnCheckDate('2027-03-03');
prova('fnCheckDate(oltre orizzonte): ripiego del tema, fasce orarie', opzioni.length > 1 && opzioni[1].value === '08-09', opzioni.map((o) => o.value).slice(0, 4).join(' '));

// ── senza API (fetch che fallisce) → il tema resta com'era ──
{
  const w2 = { location: {}, jQuery, addEventListener() {} };
  const ls2 = { getItem: () => null, setItem() {}, removeItem() {} };
  new Function('window', 'localStorage', 'fetch', 'Intl', 'AbortController', 'setTimeout', 'clearTimeout', 'Promise', 'JSON', modulo)(w2, ls2, () => Promise.reject(new Error('giù')), Intl, undefined, setTimeout, clearTimeout, Promise, JSON);
  await w2.DeluxyConsegna.pronto;
  prova('senza API: modulo non attivo, il tema tiene le sue regole', !w2.DeluxyConsegna.attivo() && w2.DeluxyConsegna.primoGiorno() === null);
}
// ── negozio non configurato ──
{
  const w3 = { location: {}, jQuery, addEventListener() {} };
  const ls3 = { getItem: () => null, setItem() {}, removeItem() {} };
  new Function('window', 'localStorage', 'fetch', 'Intl', 'AbortController', 'setTimeout', 'clearTimeout', 'Promise', 'JSON', modulo)(w3, ls3, () => Promise.resolve({ ok: true, json: () => Promise.resolve({ configurato: false, giorni: [] }) }), Intl, undefined, setTimeout, clearTimeout, Promise, JSON);
  await w3.DeluxyConsegna.pronto;
  prova('non configurato: modulo non attivo (fonte "non-configurato")', !w3.DeluxyConsegna.attivo() && w3.DeluxyConsegna.stato.fonte === 'non-configurato');
}
console.log(male ? `\n${male} prove NON passate` : '\nTutte le prove del carrello passate');
process.exit(male ? 1 : 0);
