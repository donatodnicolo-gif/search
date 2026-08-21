// Coda richiami: regole di follow-up dopo la visita.
import type { Place, Visit } from '@/types';
import { daRicontattare, placeIdConTrattativaAperta, visiteUltimi7Giorni } from '@/lib/metrics';

const OGGI = new Date('2026-07-15T12:00:00Z');

function place(id: string, stato: Place['stato'] = 'visitato'): Place {
  return {
    id,
    nome: `Negozio ${id}`,
    indirizzo: null,
    lat: 45.46,
    lng: 9.19,
    settore: null,
    categoria: null,
    priorita: 'P2',
    linea_ipotizzata: null,
    aggancio_apertura: null,
    fuoco_espansione: null,
    stato,
    zona: null,
    hubspot_company_id: null,
    created_at: '2026-07-01T00:00:00Z',
  };
}

function visita(placeId: string, giorniFa: number, esito: Visit['esito']): Visit {
  return {
    id: `${placeId}-${giorniFa}`,
    place_id: placeId,
    data: new Date(OGGI.getTime() - giorniFa * 86400000).toISOString(),
    lat: null,
    lng: null,
    esito,
    briefing: null,
    note_post_meeting: null,
    esito_analisi: null,
    next_step: 'x',
    linea_proposta: null,
    cross_sell: null,
    concorrenti: null,
    foto_url: null,
    owner: null,
    hubspot_synced: false,
    created_at: '2026-07-01T00:00:00Z',
  };
}

describe('daRicontattare', () => {
  it('include interessato e da_richiamare, esclude non_target e chiuso', () => {
    const places = [place('a'), place('b'), place('c'), place('d')];
    const visits = [
      visita('a', 1, 'interessato'),
      visita('b', 1, 'da_richiamare'),
      visita('c', 1, 'non_target'),
      visita('d', 1, 'chiuso'),
    ];
    const ids = daRicontattare(places, visits, OGGI).map((r) => r.place.id);
    expect(ids.sort()).toEqual(['a', 'b']);
  });

  it('conta solo l\'ULTIMA visita del negozio', () => {
    const places = [place('a')];
    const visits = [visita('a', 10, 'da_richiamare'), visita('a', 1, 'non_target')];
    expect(daRicontattare(places, visits, OGGI)).toHaveLength(0);
  });

  it('esclude i negozi già chiusi come cliente o perso', () => {
    const places = [place('a', 'cliente'), place('b', 'perso')];
    const visits = [visita('a', 1, 'interessato'), visita('b', 1, 'da_richiamare')];
    expect(daRicontattare(places, visits, OGGI)).toHaveLength(0);
  });

  it('segna il ritardo: interessato oltre 3 giorni, da_richiamare oltre 7', () => {
    const places = [place('a'), place('b'), place('c'), place('d')];
    const visits = [
      visita('a', 2, 'interessato'), // in tempo
      visita('b', 4, 'interessato'), // in ritardo
      visita('c', 7, 'da_richiamare'), // in tempo
      visita('d', 8, 'da_richiamare'), // in ritardo
    ];
    const perId = Object.fromEntries(daRicontattare(places, visits, OGGI).map((r) => [r.place.id, r.inRitardo]));
    expect(perId).toEqual({ a: false, b: true, c: false, d: true });
  });

  it('ordina prima i ritardi, poi i più vecchi', () => {
    const places = [place('a'), place('b'), place('c')];
    const visits = [
      visita('a', 2, 'interessato'), // in tempo
      visita('b', 10, 'da_richiamare'), // ritardo, più vecchio
      visita('c', 5, 'interessato'), // ritardo
    ];
    const ids = daRicontattare(places, visits, OGGI).map((r) => r.place.id);
    expect(ids).toEqual(['b', 'c', 'a']);
  });

  // Il caso vero del 21/08/2026: «Moncler Milano Montenapoleone» compariva in
  // Home come richiamo in ritardo di 36 giorni mentre era già in trattativa.
  // Sui dati reali erano 35 negozi in coda, tutti e 35 con una trattativa aperta.
  it('esclude i negozi con una trattativa aperta', () => {
    const places = [place('a'), place('b')];
    const visits = [visita('a', 30, 'interessato'), visita('b', 30, 'interessato')];
    const conTrattativaAperta = new Set(['a']);
    const ids = daRicontattare(places, visits, OGGI, { conTrattativaAperta }).map((r) => r.place.id);
    expect(ids).toEqual(['b']);
  });

  it('una trattativa vinta o persa NON toglie il negozio dalla coda', () => {
    const places = [place('a')];
    const visits = [visita('a', 30, 'interessato')];
    const chiuse = placeIdConTrattativaAperta([
      { place_id: 'a', fase: 'closedwon' },
      { place_id: 'a', fase: 'closedlost' },
    ]);
    expect(chiuse.size).toBe(0);
    expect(daRicontattare(places, visits, OGGI, { conTrattativaAperta: chiuse })).toHaveLength(1);
  });

  it('un contatto dopo la visita fa ripartire il conto dei giorni', () => {
    const places = [place('a')];
    const visits = [visita('a', 30, 'interessato')];
    const ieri = new Date(OGGI.getTime() - 86400000).toISOString();
    const [r] = daRicontattare(places, visits, OGGI, { ultimoContatto: new Map([['a', ieri]]) });
    expect(r.giorni).toBe(1);
    expect(r.inRitardo).toBe(false);
    expect(r.ultimoContatto).toBe(ieri);
  });

  // La «×» della coda: si salva QUANDO è stato chiuso, non un flag.
  it('un richiamo chiuso dopo la visita esce dalla coda', () => {
    const chiuso = { ...place('a'), richiamo_chiuso_il: new Date(OGGI.getTime() - 86400000).toISOString() };
    const visits = [visita('a', 10, 'interessato')];
    expect(daRicontattare([chiuso], visits, OGGI)).toHaveLength(0);
  });

  it('una visita più recente della chiusura rimette il negozio in coda', () => {
    // Chiuso 10 giorni fa, ma ieri ci siamo tornati e ha detto "interessato".
    const riaperto = { ...place('a'), richiamo_chiuso_il: new Date(OGGI.getTime() - 10 * 86400000).toISOString() };
    const visits = [visita('a', 1, 'interessato')];
    expect(daRicontattare([riaperto], visits, OGGI)).toHaveLength(1);
  });

  it('un contatto PRIMA della visita non conta', () => {
    const places = [place('a')];
    const visits = [visita('a', 5, 'interessato')];
    const vecchio = new Date(OGGI.getTime() - 20 * 86400000).toISOString();
    const [r] = daRicontattare(places, visits, OGGI, { ultimoContatto: new Map([['a', vecchio]]) });
    expect(r.giorni).toBe(5);
    expect(r.inRitardo).toBe(true);
    expect(r.ultimoContatto).toBeUndefined();
  });
});

describe('placeIdConTrattativaAperta', () => {
  it('tiene le aperte, scarta chiuse e righe senza negozio', () => {
    const s = placeIdConTrattativaAperta([
      { place_id: 'a', fase: 'appointmentscheduled' },
      { place_id: 'b', fase: 'closedwon' },
      { place_id: 'c', fase: 'closedlost' },
      { place_id: null, fase: 'appointmentscheduled' },
      { place_id: 'd', fase: null },
    ]);
    expect([...s].sort()).toEqual(['a', 'd']);
  });
});

describe('visiteUltimi7Giorni', () => {
  it('conta solo le visite dentro la finestra', () => {
    const visits = [visita('a', 0, null), visita('b', 6, null), visita('c', 8, null)];
    expect(visiteUltimi7Giorni(visits, OGGI)).toBe(2);
  });
});
