// Top 3 fornitori per un ordine — pensata per essere chiamata da un'AI o dal plugin:
//   GET /api/fornitori?brand=<brand>&number=<numero>[&categoria=fiorai|pasticcerie][&ts=ISO]
//   header: x-app-password (+ x-app-user)
// Recupera l'ordine (stessa logica di /api/order, che registra anche il check nello
// Storico), geocodifica l'indirizzo di consegna, cerca i negozi più vicini con
// Google Places (type=florist/bakery) e ritorna i 3 migliori con contatti e
// distanza stradale (OSRM, gratuito; in mancanza linea d'aria).
//
// La chiave Google è quella in cassaforte (config:v1.googleKey): funziona lato
// server SOLO finché non le si mette la restrizione referrer (verificato 20/07/2026).

import { authUser, readConfig } from './_auth.js';

const R_TERRA = 6371; // km
function haversineKm(a, b) {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TERRA * Math.asin(Math.sqrt(h));
}

// distanze stradali dal punto di consegna (OSRM pubblico, nessuna chiave; 4s max)
async function osrm(origin, dests) {
  const pts = [origin, ...dests].map(p => p.lng + ',' + p.lat).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${pts}?sources=0&annotations=distance,duration`;
  const r = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined });
  if (!r.ok) throw new Error('OSRM HTTP ' + r.status);
  const j = await r.json();
  if (j.code !== 'Ok') throw new Error('OSRM ' + j.code);
  return dests.map((_, i) => ({
    km: j.distances[0][i + 1] != null ? Math.round(j.distances[0][i + 1] / 100) / 10 : null,
    minuti: j.durations[0][i + 1] != null ? Math.round(j.durations[0][i + 1] / 60) : null,
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, x-app-user, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const auth = await authUser(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const brand = String(req.query.brand || '');
    const number = String(req.query.number || '');
    if (!brand || !number) return res.status(400).json({ error: 'Servono brand e number.' });

    const cfg = await readConfig();
    const key = (cfg.googleKey || '').trim();
    if (!key) return res.status(500).json({ error: 'Manca la chiave Google in Impostazioni.' });

    // 1) ordine — riusa /api/order dello stesso deployment (registra anche il check)
    const base = 'https://' + req.headers.host;
    const ordR = await fetch(base + '/api/order?brand=' + encodeURIComponent(brand)
      + '&number=' + encodeURIComponent(number) + '&ts=' + encodeURIComponent(String(req.query.ts || '')), {
      headers: { 'x-app-password': req.headers['x-app-password'] || '', 'x-app-user': req.headers['x-app-user'] || '' },
    });
    const ordine = await ordR.json().catch(() => ({}));
    if (!ordR.ok) return res.status(ordR.status).json({ error: ordine.error || 'Ordine non trovato.' });
    if (!ordine.address) return res.status(422).json({ error: 'L\'ordine non ha un indirizzo di consegna.' });

    // 2) geocodifica dell'indirizzo di consegna
    const geoR = await fetch('https://maps.googleapis.com/maps/api/geocode/json?address='
      + encodeURIComponent(ordine.address) + '&key=' + key);
    const geo = await geoR.json();
    if (geo.status !== 'OK' || !geo.results.length) {
      return res.status(422).json({ error: 'Indirizzo non geocodificabile: ' + ordine.address + ' (' + geo.status + ')' });
    }
    const loc = geo.results[0].geometry.location; // {lat,lng}

    // 3) negozi più vicini (rankby=distance li ordina già per vicinanza)
    const cat = String(req.query.categoria || (brand === 'cakedesign.me' ? 'pasticcerie' : 'fiorai'));
    const type = cat === 'pasticcerie' ? 'bakery' : 'florist';
    const nearR = await fetch('https://maps.googleapis.com/maps/api/place/nearbysearch/json?location='
      + loc.lat + ',' + loc.lng + '&rankby=distance&type=' + type + '&key=' + key);
    const near = await nearR.json();
    if (near.status !== 'OK' || !near.results.length) {
      return res.status(200).json({ ok: true, ordine: riepilogo(ordine), categoria: cat, fornitori: [], nota: 'Nessun ' + type + ' trovato vicino alla consegna (' + near.status + ').' });
    }

    // 4) dettagli (telefono, sito, orari) dei primi 3 con un telefono utile
    const fields = 'name,formatted_address,international_phone_number,website,opening_hours,rating,user_ratings_total,geometry,url';
    const fornitori = [];
    for (const p of near.results.slice(0, 8)) {
      if (fornitori.length >= 3) break;
      const detR = await fetch('https://maps.googleapis.com/maps/api/place/details/json?place_id='
        + p.place_id + '&fields=' + fields + '&key=' + key);
      const det = (await detR.json()).result || {};
      const tel = det.international_phone_number || '';
      const digits = tel.replace(/[^\d]/g, '');
      fornitori.push({
        nome: det.name || p.name,
        indirizzo: det.formatted_address || p.vicinity || '',
        telefono: tel,
        whatsapp: digits.length >= 8 ? 'https://wa.me/' + digits : null,
        whatsappProbabile: /^39 ?3/.test(tel.replace('+', '')) || null,  // heuristica solo per numeri IT
        sito: det.website || null,
        mappa: det.url || null,
        apertoOra: det.opening_hours ? !!det.opening_hours.open_now : null,
        valutazione: det.rating || null,
        numeroRecensioni: det.user_ratings_total || null,
        _loc: det.geometry ? det.geometry.location : null,
      });
    }

    // 5) distanza stradale (ripiego: linea d'aria)
    const conLoc = fornitori.filter(f => f._loc);
    try {
      const d = await osrm(loc, conLoc.map(f => f._loc));
      conLoc.forEach((f, i) => { f.distanzaKm = d[i].km; f.minutiAuto = d[i].minuti; f.distanzaTipo = 'strada'; });
    } catch (e) {
      conLoc.forEach(f => { f.distanzaKm = Math.round(haversineKm(loc, f._loc) * 10) / 10; f.distanzaTipo = 'linea d\'aria'; });
    }
    fornitori.forEach(f => delete f._loc);

    return res.status(200).json({ ok: true, ordine: riepilogo(ordine), categoria: cat, consegna: { indirizzo: ordine.address, lat: loc.lat, lng: loc.lng }, fornitori });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}

function riepilogo(o) {
  return {
    numero: o.orderName, brand: o.brand, valore: o.amountPaid, valuta: o.currency,
    destinatario: o.recipient, indirizzo: o.address, data: o.date, orario: o.time,
    prodotto: (o.items || []).map(i => i.title).join(' · '),
  };
}
