import type { Deal, Place, Visit } from '@/types';
import {
  chiusePerse,
  coperturaZone,
  dealApertiPerLinea,
  followupAffiliazioni,
  tassoAvanzamento,
  visitePerVenditore,
} from '@/lib/metrics';

function deal(p: Partial<Deal>): Deal {
  return {
    id: p.id ?? 'd',
    place_id: 'x',
    linea: p.linea ?? null,
    fase: p.fase ?? 'appointmentscheduled',
    valore_atteso: p.valore_atteso ?? null,
    next_action: null,
    owner: null,
    hubspot_deal_id: null,
  };
}

function place(p: Partial<Place>): Place {
  return {
    id: p.id ?? 'p',
    nome: 'x',
    indirizzo: null,
    lat: 45,
    lng: 9,
    settore: null,
    categoria: null,
    priorita: 'P3',
    linea_ipotizzata: null,
    aggancio_apertura: null,
    fuoco_espansione: null,
    stato: p.stato ?? 'da_visitare',
    zona: p.zona ?? null,
    hubspot_company_id: null,
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('tassoAvanzamento', () => {
  it('calcola la % di trattative oltre appuntamento', () => {
    const deals = [
      deal({ fase: 'appointmentscheduled' }),
      deal({ fase: 'decisionmakerboughtin' }),
      deal({ fase: 'contractsent' }),
      deal({ fase: 'closedlost' }), // escluso dal denominatore
    ];
    const t = tassoAvanzamento(deals);
    expect(t.den).toBe(3);
    expect(t.num).toBe(2);
    expect(t.pct).toBe(67);
  });
});

describe('dealApertiPerLinea', () => {
  it('conta solo i deal aperti', () => {
    const deals = [
      deal({ linea: 'Consegne', fase: 'appointmentscheduled' }),
      deal({ linea: 'Consegne', fase: 'decisionmakerboughtin' }),
      deal({ linea: 'Catering', fase: 'closedwon' }), // chiuso, escluso
    ];
    const out = dealApertiPerLinea(deals);
    expect(out.find((d) => d.label === 'Consegne')?.value).toBe(2);
    expect(out.find((d) => d.label === 'Catering')).toBeUndefined();
  });
});

describe('coperturaZone', () => {
  it('calcola visitati/totali e percentuale per zona', () => {
    const places = [
      place({ zona: 'Centro', stato: 'visitato' }),
      place({ zona: 'Centro', stato: 'da_visitare' }),
      place({ zona: 'Brera', stato: 'cliente' }),
    ];
    const cop = coperturaZone(places);
    const centro = cop.find((z) => z.zona === 'Centro')!;
    expect(centro.totali).toBe(2);
    expect(centro.visitati).toBe(1);
    expect(centro.pct).toBe(50);
  });
});

describe('liste recupero/follow-up', () => {
  it('chiusePerse ritorna solo closedlost', () => {
    const deals = [deal({ fase: 'closedlost' }), deal({ fase: 'closedwon' })];
    expect(chiusePerse(deals)).toHaveLength(1);
  });

  it('followupAffiliazioni filtra Affiliazioni/Re-seller aperti', () => {
    const deals = [
      deal({ linea: 'Re-seller', fase: 'appointmentscheduled' }),
      deal({ linea: 'Affiliazioni', fase: 'closedwon' }), // chiuso, escluso
      deal({ linea: 'Consegne', fase: 'appointmentscheduled' }), // linea diversa
    ];
    const out = followupAffiliazioni(deals);
    expect(out).toHaveLength(1);
    expect(out[0].linea).toBe('Re-seller');
  });
});

describe('visitePerVenditore', () => {
  it('raggruppa per owner', () => {
    const visits: Visit[] = [
      { owner: 'aaaaaa-1' } as unknown as Visit,
      { owner: 'aaaaaa-1' } as unknown as Visit,
      { owner: null } as unknown as Visit,
    ];
    const out = visitePerVenditore(visits);
    expect(out.find((v) => v.label === 'aaaaaa')?.value).toBe(2);
    expect(out.find((v) => v.label === 'n/d')?.value).toBe(1);
  });
});
