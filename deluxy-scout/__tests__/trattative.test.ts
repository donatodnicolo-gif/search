import {
  chiaveTrattativa,
  linkApribile,
  normalizzaLink,
  ordinaTrattative,
  prioritaDi,
  prioritaMassima,
  richiedeMotivoChiusura,
} from '@/lib/trattative';
import type { Deal } from '@/types';

type Riga = Pick<Deal, 'priorita' | 'scadenza' | 'valore_atteso' | 'fase' | 'created_at'> & { place_nome?: string | null };

const riga = (over: Partial<Riga>): Riga => ({
  priorita: 'P2',
  scadenza: null,
  valore_atteso: null,
  fase: 'appointmentscheduled',
  created_at: '2026-09-01T10:00:00Z',
  ...over,
});

describe('priorità delle trattative', () => {
  test('senza priorità (HubSpot, registro, righe vecchie) vale P2', () => {
    expect(prioritaDi({ priorita: null })).toBe('P2');
    expect(prioritaDi({ priorita: undefined })).toBe('P2');
    expect(prioritaDi({ priorita: 'P0' })).toBe('P0');
  });

  test('P0 prima di tutto, poi le chiuse in fondo a parità di priorità', () => {
    const r = ordinaTrattative([
      riga({ place_nome: 'c', priorita: 'P2' }),
      riga({ place_nome: 'a-vinta', priorita: 'P0', fase: 'closedwon' }),
      riga({ place_nome: 'b', priorita: 'P0' }),
      riga({ place_nome: 'd', priorita: 'P3' }),
    ]);
    expect(r.map((x) => x.place_nome)).toEqual(['b', 'a-vinta', 'c', 'd']);
  });

  test('a parità di priorità: scadenza più vicina, chi non ne ha dopo, poi la più recente', () => {
    const r = ordinaTrattative([
      riga({ place_nome: 'senza', scadenza: null, created_at: '2026-09-05T00:00:00Z' }),
      riga({ place_nome: 'senza-vecchia', scadenza: null, created_at: '2026-08-01T00:00:00Z' }),
      riga({ place_nome: 'lontana', scadenza: '2026-10-01' }),
      riga({ place_nome: 'vicina', scadenza: '2026-09-10' }),
    ]);
    expect(r.map((x) => x.place_nome)).toEqual(['vicina', 'lontana', 'senza', 'senza-vecchia']);
  });

  test('con tutte a P2 l’ordine è quello di prima (la priorità non si fa sentire)', () => {
    const r = ordinaTrattative([
      riga({ place_nome: 'x', created_at: '2026-09-01T00:00:00Z' }),
      riga({ place_nome: 'y', created_at: '2026-09-03T00:00:00Z' }),
    ]);
    expect(r.map((x) => x.place_nome)).toEqual(['y', 'x']);
  });

  test('la priorità massima di un gruppo', () => {
    expect(prioritaMassima([{ priorita: 'P3' }, { priorita: 'P1' }, { priorita: null }])).toBe('P1');
    expect(prioritaMassima([])).toBe('P2');
  });
});

describe('motivo di chiusura', () => {
  test('serve quando si PASSA a vinta o persa', () => {
    expect(richiedeMotivoChiusura('appointmentscheduled', 'closedwon')).toBe(true);
    expect(richiedeMotivoChiusura(null, 'closedlost')).toBe(true);
    expect(richiedeMotivoChiusura(undefined, 'closedlost')).toBe(true);
  });
  test('non serve risalvando una già chiusa nella stessa fase, né su una aperta', () => {
    expect(richiedeMotivoChiusura('closedwon', 'closedwon')).toBe(false);
    expect(richiedeMotivoChiusura('closedlost', 'closedlost')).toBe(false);
    expect(richiedeMotivoChiusura('closedwon', 'contractsent')).toBe(false);
  });
  test('da vinta a persa è una chiusura nuova: serve', () => {
    expect(richiedeMotivoChiusura('closedwon', 'closedlost')).toBe(true);
  });
});

describe('allegati e link', () => {
  test('la chiave: uuid per Scout, hs_<id> per HubSpot', () => {
    expect(chiaveTrattativa({ id: 'abc', origine: 'scout' })).toBe('abc');
    expect(chiaveTrattativa({ id: 'hs_1', origine: 'hubspot', hubspot_deal_id: '1' })).toBe('hs_1');
    expect(chiaveTrattativa({ id: 'abc', hubspot_deal_id: '1' })).toBe('abc');
  });
  test('si aprono solo http(s)', () => {
    expect(linkApribile('https://drive.google.com/x')).toBe(true);
    expect(linkApribile('javascript:alert(1)')).toBe(false);
    expect(linkApribile('')).toBe(false);
    expect(linkApribile(null)).toBe(false);
  });
  test('un link scritto senza schema prende https', () => {
    expect(normalizzaLink('drive.google.com/abc')).toBe('https://drive.google.com/abc');
    expect(normalizzaLink('http://x.it')).toBe('http://x.it');
    expect(normalizzaLink('   ')).toBeNull();
  });
});
