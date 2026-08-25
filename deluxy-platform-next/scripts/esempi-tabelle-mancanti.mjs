/**
 * Che cosa contengono, davvero, le tabelle del legacy che qui non hanno casa.
 *
 * Serve a decidere: una tabella si giudica dal suo contenuto, non dal nome.
 * «partner-reminder» può essere un promemoria interno o un automatismo che
 * scrive ai partner — e sono due lavori diversi.
 *
 * Sola lettura.
 */
import { leggiCsv } from './leggi-csv.mjs';

const B = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/';
const carica = (f) => { try { return leggiCsv(B + f); } catch { return null; } };
const vivo = (r) => !r.deletedAt;
const linea = (c) => console.log((c || '─').repeat(78));
const n = (x) => Number(x).toLocaleString('it-IT');

/** I nomi, per rendere leggibili gli id. */
const nomiPartner = new Map((carica('partner.csv') ?? []).map((x) => [String(x.id), x.businessName || x.name || x.agency]));
const nomiValet = new Map((carica('expert.csv') ?? []).map((x) => [String(x.id), `${x.surname ?? ''} ${x.name ?? ''}`.trim()]));
const nomiProv = new Map((carica('provinces.csv') ?? []).map((x) => [String(x.id), x.name || x.code]));
const nomiCons = new Map((carica('delivery.csv') ?? []).map((x) => [String(x.id), x]));

function scheda(file, titolo, mostra, quante = 5) {
  const righe = carica(file);
  console.log('');
  linea('═');
  console.log('  ' + titolo);
  linea('═');
  if (!righe) { console.log('  (file non leggibile)'); return; }
  const vive = righe.filter(vivo);
  console.log('  ' + file + ' — ' + n(vive.length) + ' righe vive su ' + n(righe.length));
  console.log('  colonne: ' + Object.keys(righe[0] ?? {}).join(', '));
  console.log('');
  mostra(vive);
}

// ─────────────────────────── VEICOLI DEI VALET ───────────────────────────
scheda('expert-vehicle.csv', 'VEICOLI DEI VALET', (v) => {
  const per = {};
  for (const x of v) { const k = (x.type ?? x.vehicleType ?? x.name ?? '—'); per[k] = (per[k] ?? 0) + 1; }
  console.log('  per tipo: ' + Object.entries(per).sort((a, b) => b[1] - a[1]).map(([k, q]) => k + '=' + q).join(' · '));
  console.log('');
  for (const x of v.slice(0, 5)) {
    console.log('     ' + Object.entries(x).filter(([k, val]) => val && val !== 'NULL' && !['createdAt', 'updatedAt', 'deletedAt'].includes(k))
      .map(([k, val]) => k + '=' + String(val).slice(0, 26)).join(' · '));
  }
});

// ─────────────────────────────── RECLAMI ────────────────────────────────
scheda('delivery-complaint.csv', 'RECLAMI SULLE CONSEGNE', (v) => {
  const per = {};
  for (const x of v) { const k = String(x.status ?? x.type ?? '—'); per[k] = (per[k] ?? 0) + 1; }
  console.log('  per stato/tipo: ' + Object.entries(per).sort((a, b) => b[1] - a[1]).map(([k, q]) => k + '=' + q).join(' · '));
  console.log('');
  for (const x of v.slice(0, 4)) {
    const c = nomiCons.get(String(x.deliveryId));
    console.log('  reclamo #' + x.id + '  sulla consegna ' + x.deliveryId +
      (c ? '  (' + String(c.deliveryDate ?? '').slice(0, 10) + ', ' + (nomiPartner.get(String(c.partnerId)) ?? '—') + ')' : ''));
    for (const [k, val] of Object.entries(x)) {
      if (!val || val === 'NULL' || ['id', 'deliveryId', 'createdAt', 'updatedAt', 'deletedAt'].includes(k)) continue;
      console.log('       ' + k.padEnd(18) + String(val).replace(/\s+/g, ' ').slice(0, 90));
    }
    console.log('');
  }
});

// ────────────────────────────── RIMBORSI ────────────────────────────────
scheda('refund-requests.csv', 'RICHIESTE DI RIMBORSO', (v) => {
  const per = {};
  for (const x of v) { const k = String(x.status ?? '—'); per[k] = (per[k] ?? 0) + 1; }
  console.log('  per stato: ' + Object.entries(per).sort((a, b) => b[1] - a[1]).map(([k, q]) => k + '=' + q).join(' · '));
  const chi = { valet: 0, partner: 0, altro: 0 };
  for (const x of v) {
    if (!['', 'NULL', 'null'].includes(String(x.expertId ?? ''))) chi.valet++;
    else if (!['', 'NULL', 'null'].includes(String(x.partnerId ?? ''))) chi.partner++;
    else chi.altro++;
  }
  console.log('  chi la fa: valet=' + chi.valet + ' · partner=' + chi.partner + ' · nessuno dei due=' + chi.altro);
  console.log('');
  for (const x of v.slice(0, 4)) {
    console.log('  richiesta #' + x.id +
      (nomiValet.get(String(x.expertId)) ? '  valet: ' + nomiValet.get(String(x.expertId)) : '') +
      (nomiPartner.get(String(x.partnerId)) ? '  partner: ' + nomiPartner.get(String(x.partnerId)) : ''));
    for (const [k, val] of Object.entries(x)) {
      if (!val || val === 'NULL' || ['id', 'expertId', 'partnerId', 'updatedAt', 'deletedAt'].includes(k)) continue;
      console.log('       ' + k.padEnd(18) + String(val).replace(/\s+/g, ' ').slice(0, 90));
    }
    console.log('');
  }
});

// ───────────────────── PROMEMORIA AI PARTNER ────────────────────────────
scheda('partner-reminder.csv', 'PROMEMORIA AI PARTNER', (v) => {
  const per = {};
  for (const x of v) { const k = String(x.status ?? x.type ?? '—'); per[k] = (per[k] ?? 0) + 1; }
  console.log('  per stato/tipo: ' + Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, q]) => k + '=' + q).join(' · '));
  const anni = {};
  for (const x of v) { const a = String(x.createdAt ?? '').slice(0, 4) || '—'; anni[a] = (anni[a] ?? 0) + 1; }
  console.log('  per anno: ' + Object.entries(anni).sort().map(([k, q]) => k + '=' + q).join(' · '));
  const partnerDistinti = new Set(v.map((x) => String(x.partnerId))).size;
  console.log('  partner distinti: ' + partnerDistinti);
  console.log('');
  for (const x of v.slice(0, 4)) {
    console.log('  promemoria #' + x.id + '  partner: ' + (nomiPartner.get(String(x.partnerId)) ?? x.partnerId));
    for (const [k, val] of Object.entries(x)) {
      if (!val || val === 'NULL' || ['id', 'partnerId', 'updatedAt', 'deletedAt'].includes(k)) continue;
      console.log('       ' + k.padEnd(18) + String(val).replace(/\s+/g, ' ').slice(0, 100));
    }
    console.log('');
  }
});

// ──────────────── VALET ↔ PARTNER ↔ PROVINCIA (tabella-89) ──────────────
scheda('tabella-89.csv', 'VALET ↔ PARTNER ↔ PROVINCIA (tabella-89)', (v) => {
  const perValet = {};
  for (const x of v) { const k = String(x.expertId); perValet[k] = (perValet[k] ?? 0) + 1; }
  const conteggi = Object.values(perValet);
  console.log('  valet coinvolti: ' + Object.keys(perValet).length +
    ' · righe per valet: media ' + (conteggi.reduce((s, q) => s + q, 0) / conteggi.length).toFixed(1) +
    ', massimo ' + Math.max(...conteggi));
  console.log('');
  const primo = Object.entries(perValet).sort((a, b) => b[1] - a[1])[0];
  console.log('  Il valet con più righe — ' + (nomiValet.get(primo[0]) ?? primo[0]) + ' (' + primo[1] + '):');
  for (const x of v.filter((r) => String(r.expertId) === primo[0]).slice(0, 6)) {
    console.log('       partner ' + String(nomiPartner.get(String(x.partnerId)) ?? x.partnerId).slice(0, 30).padEnd(32) +
      'provincia ' + (nomiProv.get(String(x.provinceId)) ?? x.provinceId));
  }
});

// ───────────────────────── LE RESTANTI, IN BREVE ────────────────────────
console.log('');
linea('═');
console.log('  LE RESTANTI, IN BREVE');
linea('═');
for (const [f, che] of [
  ['tabella-85.csv', 'valet ↔ partner'],
  ['tabella-5.csv', 'eccezioni settimanali partner/valet'],
  ['tabella-53.csv', 'categoria ↔ provincia'],
  ['tabella-36.csv', 'priorità dei valet'],
  ['shop-collection.csv', 'collezioni del negozio'],
  ['tabella-76.csv', 'collezione ↔ prodotto'],
  ['stripe-card.csv', 'carte Stripe'],
  ['tabella-38.csv', 'tipi di servizio (?)'],
  ['tabella-44.csv', 'anagrafica con solo nome'],
  ['tabella-78.csv', 'note per partner (?)'],
  ['team-leader-province.csv', 'province dei team leader'],
  ['tabella-50.csv', 'impostazioni promemoria'],
  ['web-push-subscription.csv', 'iscrizioni alle notifiche push'],
]) {
  const r = carica(f);
  if (!r) { console.log('\n  ' + f.padEnd(30) + '(non leggibile)'); continue; }
  const v = r.filter(vivo);
  console.log('');
  console.log('  ' + f.replace('.csv', '').padEnd(28) + n(v.length) + ' righe   — ' + che);
  console.log('     colonne: ' + Object.keys(r[0] ?? {}).join(', '));
  const x = v[0];
  if (x) {
    const pieni = Object.entries(x).filter(([k, val]) => val && val !== 'NULL' && !['createdAt', 'updatedAt', 'deletedAt'].includes(k));
    console.log('     esempio: ' + pieni.map(([k, val]) => k + '=' + String(val).slice(0, 30)).join(' · ').slice(0, 220));
  }
}
console.log('');
