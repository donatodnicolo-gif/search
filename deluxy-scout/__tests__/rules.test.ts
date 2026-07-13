// Mock del client Supabase: i test sono sulla logica pura, non toccano la rete.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { REGOLE_FALLBACK, regolaPerCategoria } from '@/lib/categoryRules';
import { statoDaEsito } from '@/lib/syncQueue';
import { LINEE_STANDBY } from '@/types';

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
  addEventListener: jest.fn(),
}));

describe('Regole di categoria', () => {
  it('mappa la categoria giusta (match esatto)', () => {
    const r = regolaPerCategoria('gioielleria', REGOLE_FALLBACK);
    expect(r?.linea_ipotizzata).toBe('Consegne');
    expect(r?.priorita).toBe('P1');
  });

  it('è tollerante su varianti (match parziale)', () => {
    const r = regolaPerCategoria('Ristorante Premium Stellato', REGOLE_FALLBACK);
    expect(r?.linea_ipotizzata).toBe('Food Supplier');
  });

  it('cade su "altro" (P3) per categorie sconosciute', () => {
    const r = regolaPerCategoria('categoria-inventata-xyz', REGOLE_FALLBACK);
    expect(r?.priorita).toBe('P3');
  });

  it('fioraio e pasticceria → Re-seller P1', () => {
    for (const c of ['fioraio', 'pasticceria']) {
      const r = regolaPerCategoria(c, REGOLE_FALLBACK);
      expect(r?.linea_ipotizzata).toBe('Re-seller');
      expect(r?.priorita).toBe('P1');
    }
  });
});

describe('Regola di prodotto: linee in standby mai come ipotesi primaria', () => {
  it('nessuna regola di categoria propone una linea standby', () => {
    for (const regola of REGOLE_FALLBACK) {
      expect(LINEE_STANDBY).not.toContain(regola.linea_ipotizzata);
    }
  });
});

describe('Mappatura esito → stato place', () => {
  it('associa correttamente ogni esito', () => {
    expect(statoDaEsito.interessato).toBe('visitato');
    expect(statoDaEsito.da_richiamare).toBe('visitato');
    expect(statoDaEsito.non_target).toBe('perso');
    expect(statoDaEsito.chiuso).toBe('cliente');
  });
});
