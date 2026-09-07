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
} from '@/lib/pianificazione-settimana';
import type { PianoGiorno } from '@/types';

const att = (over: Partial<PianoGiorno>): PianoGiorno => ({
  id: Math.random().toString(36).slice(2),
  owner: 'u',
  giorno_settimana: 1,
  settimana: null,
  tipo: 'visita',
  titolo: 'x',
  strade: [],
  zona: null,
  note: null,
  gruppo: null,
  ordine: 0,
  created_at: '2026-09-01T00:00:00Z',
  ...over,
});

describe('settimane e giorni', () => {
  test('lunedì della settimana, anche di domenica e a cavallo del mese', () => {
    expect(lunediDi('2026-09-07')).toBe('2026-09-07'); // è già lunedì
    expect(lunediDi('2026-09-13')).toBe('2026-09-07'); // domenica → il lunedì prima
    expect(lunediDi('2026-10-01')).toBe('2026-09-28'); // giovedì 1 ottobre
  });
  test('giorno 1..7 con la domenica in fondo', () => {
    expect(giornoSettimanaDi('2026-09-07')).toBe(1);
    expect(giornoSettimanaDi('2026-09-13')).toBe(7);
  });
  test('spostare e leggere la settimana', () => {
    expect(spostaSettimana('2026-09-07', 1)).toBe('2026-09-14');
    expect(spostaSettimana('2026-09-07', -1)).toBe('2026-08-31');
    expect(dataDelGiorno('2026-09-07', 3)).toBe('2026-09-09');
    expect(etichettaSettimana('2026-09-07')).toBe('7 – 13 set 2026');
    expect(etichettaSettimana('2026-09-28')).toBe('28 set – 4 ott 2026');
  });
});

describe('le attività di un giorno', () => {
  test('fisse della settimana + ricorrenti, ordinate; le altre settimane no', () => {
    const righe = [
      att({ titolo: 'ricorrente', giorno_settimana: 2, ordine: 1 }),
      att({ titolo: 'fissa', giorno_settimana: 2, settimana: '2026-09-07', ordine: 1 }),
      att({ titolo: 'altra-settimana', giorno_settimana: 2, settimana: '2026-09-14' }),
      att({ titolo: 'altro-giorno', giorno_settimana: 3, settimana: '2026-09-07' }),
      att({ titolo: 'prima', giorno_settimana: 2, settimana: '2026-09-07', ordine: 0 }),
    ];
    expect(attivitaDelGiorno(righe, '2026-09-07', 2).map((r) => r.titolo)).toEqual(['prima', 'fissa', 'ricorrente']);
  });
  test('il piano di oggi passa dalla data', () => {
    const righe = [att({ titolo: 'mer', giorno_settimana: 3 })];
    expect(pianoDelGiorno(righe, '2026-09-09').map((r) => r.titolo)).toEqual(['mer']);
    expect(pianoDelGiorno(righe, '2026-09-10')).toEqual([]);
  });
});

describe('strade', () => {
  test('una per riga o virgola, senza doppioni, spazi puliti', () => {
    expect(normalizzaStrade('Via  Torino,\ncorso Buenos Aires; via torino,,')).toEqual(['Via Torino', 'corso Buenos Aires']);
    expect(normalizzaStrade(['  ', 'Via Spiga'])).toEqual(['Via Spiga']);
  });
  test('Maps con la città (Milano se non detta)', () => {
    expect(urlStrada('Via Torino')).toContain(encodeURIComponent('Via Torino, Milano'));
    expect(urlStrada('Via Roma', 'Monza')).toContain(encodeURIComponent('Via Roma, Monza'));
  });
});
