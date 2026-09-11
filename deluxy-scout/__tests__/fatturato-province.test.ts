// Il fatturato di una provincia, letto come lo legge la Copertura (11/09/2026).
import { euroBreve, sommaPerSigla } from '@/lib/fatturato-province';

describe('sommaPerSigla', () => {
  it('somma per sigla, qualunque forma abbia la provincia negli ordini', () => {
    const m = sommaPerSigla([
      { provincia: 'MI', lordo: 800_000 },
      { provincia: 'Milano', lordo: 56_000 },
      { provincia: 'Città Metropolitana di Milano', lordo: 1_000 },
      { provincia: 'RM', lordo: 312_000 },
    ]);
    expect(m.get('MI')).toBe(857_000);
    expect(m.get('RM')).toBe(312_000);
  });
  it('i valori esteri restano fuori: non sono province italiane', () => {
    const m = sommaPerSigla([
      { provincia: 'ENG', lordo: 9_000 },
      { provincia: '', lordo: 4_000 },
      { provincia: 'NA', lordo: 16_000 },
    ]);
    expect([...m.keys()]).toEqual(['NA']);
  });
});

describe('euroBreve', () => {
  it('la stessa forma della Copertura: k sopra il migliaio, euro sotto', () => {
    expect(euroBreve(856_000)).toBe('856k €');
    expect(euroBreve(12_400)).toBe('12k €');
    expect(euroBreve(922)).toBe('922 €');
  });
  it('il punto delle migliaia c’è anche senza ICU', () => {
    expect(euroBreve(1_234_000)).toBe('1.234k €');
  });
  it('zero e vuoto sono un trattino, non «0 €»', () => {
    expect(euroBreve(0)).toBe('—');
    expect(euroBreve(null)).toBe('—');
    expect(euroBreve(undefined)).toBe('—');
  });
});
