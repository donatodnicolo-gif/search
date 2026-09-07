import {
  attivitaDelGiorno,
  dataDelGiorno,
  etichettaSettimana,
  giornoSettimanaDi,
  lunediDi,
  normalizzaStrade,
  pianoDelGiorno,
  spostaSettimana,
  urlStrada,
} from '@/lib/pianificazione';
import type { PianoAttivita } from '@/types';

function riga(p: Partial<PianoAttivita>): PianoAttivita {
  return {
    id: p.id ?? Math.random().toString(36),
    owner: 'u1',
    giorno_settimana: 1,
    settimana: null,
    tipo: 'visita',
    titolo: 'x',
    strade: [],
    zona: null,
    note: null,
    ordine: 0,
    created_at: '2026-09-01T00:00:00Z',
    ...p,
  };
}

describe('date della settimana', () => {
  test('lunedì della settimana (lunedì-first) e giorno 1..7', () => {
    expect(lunediDi('2026-09-07')).toBe('2026-09-07'); // è un lunedì
    expect(lunediDi('2026-09-13')).toBe('2026-09-07'); // domenica → stesso lunedì
    expect(lunediDi('2026-09-14')).toBe('2026-09-14');
    expect(giornoSettimanaDi('2026-09-07')).toBe(1);
    expect(giornoSettimanaDi('2026-09-13')).toBe(7);
  });

  test('spostamento settimane e data del giorno', () => {
    expect(spostaSettimana('2026-09-07', 1)).toBe('2026-09-14');
    expect(spostaSettimana('2026-09-07', -1)).toBe('2026-08-31');
    expect(dataDelGiorno('2026-09-07', 3)).toBe('2026-09-09');
    expect(dataDelGiorno('2026-09-28', 7)).toBe('2026-10-04'); // cambio mese
  });

  test('etichetta settimana, anche a cavallo di mese', () => {
    expect(etichettaSettimana('2026-09-07')).toBe('7 – 13 set 2026');
    expect(etichettaSettimana('2026-09-28')).toBe('28 set – 4 ott 2026');
  });
});

describe('attività del giorno: fisse + ricorrenti', () => {
  const rows = [
    riga({ id: 'ric-lun', giorno_settimana: 1, settimana: null, titolo: 'ogni lunedì', ordine: 1 }),
    riga({ id: 'fix-lun', giorno_settimana: 1, settimana: '2026-09-07', titolo: 'solo questa', ordine: 1, created_at: '2026-09-02T00:00:00Z' }),
    riga({ id: 'altra-sett', giorno_settimana: 1, settimana: '2026-09-14', titolo: 'settimana dopo', ordine: 1 }),
    riga({ id: 'mar', giorno_settimana: 2, settimana: '2026-09-07', titolo: 'martedì' }),
  ];

  test('include le ricorrenti e le fisse della settimana, esclude le altre settimane', () => {
    const lun = attivitaDelGiorno(rows, '2026-09-07', 1).map((r) => r.id);
    expect(lun).toEqual(['fix-lun', 'ric-lun']); // stessa ordine → fissa prima della ricorrente
    expect(attivitaDelGiorno(rows, '2026-09-14', 1).map((r) => r.id)).toEqual(['altra-sett', 'ric-lun']);
    expect(attivitaDelGiorno(rows, '2026-09-07', 2).map((r) => r.id)).toEqual(['mar']);
    expect(attivitaDelGiorno(rows, '2026-09-07', 3)).toEqual([]);
  });

  test('piano di una data precisa', () => {
    expect(pianoDelGiorno(rows, '2026-09-08').map((r) => r.id)).toEqual(['mar']);
    expect(pianoDelGiorno(rows, '2026-09-21').map((r) => r.id)).toEqual(['ric-lun']);
  });
});

describe('strade', () => {
  test('normalizza righe/virgole, spazi e doppioni', () => {
    expect(normalizzaStrade('Via Montenapoleone, via della  Spiga\nvia montenapoleone; ')).toEqual([
      'Via Montenapoleone',
      'via della Spiga',
    ]);
    expect(normalizzaStrade(['', ' Corso Como '])).toEqual(['Corso Como']);
  });

  test('url di ricerca su Google Maps con la città', () => {
    expect(urlStrada('Via della Spiga')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Via%20della%20Spiga%2C%20Milano',
    );
  });
});
