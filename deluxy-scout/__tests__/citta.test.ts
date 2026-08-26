// Il bucket città filtra le basi di Dashboard, Storico, Trattative e Rubrica:
// un comune che ci entra per sbaglio non è un'etichetta storta, è un numero
// sbagliato.
import { bucketCitta, passaFiltroCitta } from '@/lib/citta';

describe('bucketCitta — le città vere', () => {
  it('riconosce la città comunque sia scritta', () => {
    expect(bucketCitta('MILANO')).toBe('Milano');
    expect(bucketCitta('Milano')).toBe('Milano');
    expect(bucketCitta('via Torino, Milano')).toBe('Milano');
    expect(bucketCitta('Milano (MI)')).toBe('Milano');
    expect(bucketCitta('ROMA')).toBe('Roma');
    expect(bucketCitta('Firenze centro')).toBe('Firenze');
  });
});

describe('bucketCitta — i posti che ci finivano per sbaglio', () => {
  it('Milano Marittima è in provincia di Ravenna, non a Milano', () => {
    expect(bucketCitta('MILANO MARITTIMA')).toBe('Altre');
  });
  it('Romano di Lombardia e Romans d\'Isonzo non sono Roma', () => {
    expect(bucketCitta('ROMANO DI LOMBARDIA')).toBe('Altre');
    expect(bucketCitta("Romans d'Isonzo")).toBe('Altre');
  });
  it('il vuoto non è una città', () => {
    expect(bucketCitta(null)).toBe('Altre');
    expect(bucketCitta('')).toBe('Altre');
    expect(bucketCitta('   ')).toBe('Altre');
  });
});

describe('passaFiltroCitta', () => {
  it('«Tutte» o nessun filtro fa passare tutto', () => {
    expect(passaFiltroCitta('MILANO MARITTIMA', null)).toBe(true);
    expect(passaFiltroCitta(null, 'Tutte')).toBe(true);
  });
  it('il filtro Milano non si porta dietro Milano Marittima', () => {
    expect(passaFiltroCitta('MILANO', 'Milano')).toBe(true);
    expect(passaFiltroCitta('MILANO MARITTIMA', 'Milano')).toBe(false);
    expect(passaFiltroCitta('MILANO MARITTIMA', 'Altre')).toBe(true);
  });
});
