import { chiaveTrattativa, ordinaTrattative, prioritaDi, richiedeMotivoChiusura } from '@/lib/trattative';

describe('priorità trattative', () => {
  test('senza valore vale P2', () => {
    expect(prioritaDi({})).toBe('P2');
    expect(prioritaDi({ priorita: 'P0' })).toBe('P0');
  });

  test('ordina P0 → P3, poi scadenza vicina, poi valore alto; chiuse in fondo', () => {
    const rows = [
      { id: 'a', priorita: 'P2' as const, scadenza: null, valore_atteso: 100, fase: 'appointmentscheduled' as const, place_nome: 'Zeta' },
      { id: 'b', priorita: 'P0' as const, scadenza: '2026-09-20', valore_atteso: null, fase: 'contractsent' as const, place_nome: 'Beta' },
      { id: 'c', priorita: 'P0' as const, scadenza: '2026-09-10', valore_atteso: null, fase: 'contractsent' as const, place_nome: 'Gamma' },
      { id: 'd', priorita: undefined, scadenza: null, valore_atteso: 900, fase: 'appointmentscheduled' as const, place_nome: 'Alfa' },
      { id: 'e', priorita: 'P0' as const, scadenza: '2026-09-01', valore_atteso: 5000, fase: 'closedwon' as const, place_nome: 'Chiusa' },
      { id: 'f', priorita: 'P3' as const, scadenza: null, valore_atteso: null, fase: 'appointmentscheduled' as const, place_nome: 'Fine' },
    ];
    expect(ordinaTrattative(rows).map((r) => r.id)).toEqual(['c', 'b', 'e', 'd', 'a', 'f']);
  });
});

describe('motivo di chiusura', () => {
  test('richiesto solo quando si PASSA a vinta/persa', () => {
    expect(richiedeMotivoChiusura('contractsent', 'closedwon')).toBe(true);
    expect(richiedeMotivoChiusura(undefined, 'closedlost')).toBe(true);
    expect(richiedeMotivoChiusura('closedwon', 'closedwon')).toBe(false);
    expect(richiedeMotivoChiusura('closedwon', 'contractsent')).toBe(false);
    expect(richiedeMotivoChiusura('appointmentscheduled', 'decisionmakerboughtin')).toBe(false);
  });
});

describe('chiave allegati', () => {
  test('Scout → uuid, HubSpot → hs_<id>', () => {
    expect(chiaveTrattativa({ id: 'uuid-1', origine: 'scout', hubspot_deal_id: '99' })).toBe('uuid-1');
    expect(chiaveTrattativa({ id: 'hs_99', origine: 'hubspot', hubspot_deal_id: '99' })).toBe('hs_99');
  });
});
