// Coda richiami: regole di follow-up dopo la visita.
import type { Place, Visit } from '@/types';
import { daRicontattare, visiteUltimi7Giorni } from '@/lib/metrics';

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
});

describe('visiteUltimi7Giorni', () => {
  it('conta solo le visite dentro la finestra', () => {
    const visits = [visita('a', 0, null), visita('b', 6, null), visita('c', 8, null)];
    expect(visiteUltimi7Giorni(visits, OGGI)).toBe(2);
  });
});
