// Il COSTO di un ordine viene dai preventivi fornitore — ma il lavoro può
// essere agganciato a tre posti diversi (trattativa, richiesta cliente,
// ordine, migr. 0077). Se la lettura ne guarda uno solo, il margine di quel
// ordine sparisce senza dirlo: si vede «—» dov'era un numero, e nessuno sa
// perché. Questi test tengono ferme le tre strade.
// ⚠️ `lib/preventivi` importa il client Supabase, che all'avvio pretende le
// variabili d'ambiente: qui si prova il CONTO, non la connessione, quindi il
// client si sostituisce con un guscio vuoto.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { costiPerOrdine, costiPerChiave, type LavoroConPreventivi } from '@/lib/preventivi';

function lavoro(legami: Partial<LavoroConPreventivi>, importi: (number | null)[], scelto = -1): LavoroConPreventivi {
  return {
    id: `l${Math.abs(importi[0] ?? 0)}`,
    owner: 'u',
    titolo: 'Lavoro',
    stato: 'aperto',
    created_at: '2026-08-26T10:00:00Z',
    ...legami,
    preventivi: importi.map((imp, i) => ({
      id: `p${i}`,
      lavoro_id: 'l',
      fornitore: `Fornitore ${i}`,
      importo: imp,
      stato: i === scelto ? 'scelto' : 'ricevuto',
      created_at: `2026-08-26T1${i}:00:00Z`,
    })),
  } as unknown as LavoroConPreventivi;
}

describe('costiPerOrdine — le tre strade portano allo stesso ordine', () => {
  it('prende il costo dal lavoro agganciato direttamente all ordine', () => {
    const m = costiPerOrdine([lavoro({ ordine_id: 'O1' }, [100, 80])], [{ id: 'O1' }]);
    expect(m.get('O1')?.costo).toBe(80);
    expect(m.get('O1')?.definitivo).toBe(false);
  });

  it('prende il costo dalla TRATTATIVA da cui l ordine è nato', () => {
    const m = costiPerOrdine([lavoro({ deal_id: 'D1' }, [250])], [{ id: 'O1', deal_id: 'D1' }]);
    expect(m.get('O1')?.costo).toBe(250);
  });

  it('prende il costo dalla RICHIESTA CLIENTE da cui l ordine è nato', () => {
    const m = costiPerOrdine([lavoro({ richiesta_id: 'R1' }, [90])], [{ id: 'O1', richiesta_id: 'R1' }]);
    expect(m.get('O1')?.costo).toBe(90);
  });

  it('il preventivo SCELTO batte il più basso, e lo dichiara definitivo', () => {
    const m = costiPerOrdine([lavoro({ ordine_id: 'O1' }, [70, 120], 1)], [{ id: 'O1' }]);
    expect(m.get('O1')?.costo).toBe(120);
    expect(m.get('O1')?.definitivo).toBe(true);
  });

  it('un ordine senza preventivi NON entra nella mappa (mai costo zero)', () => {
    // ⚠️ Contarlo zero darebbe un margine pari al prezzo pieno: meglio «—».
    const m = costiPerOrdine([lavoro({ deal_id: 'D1' }, [10])], [{ id: 'O2', deal_id: 'D9' }]);
    expect(m.has('O2')).toBe(false);
  });

  it('il legame più vicino vince: l ordine batte la trattativa', () => {
    const lavori = [lavoro({ ordine_id: 'O1' }, [55]), lavoro({ deal_id: 'D1' }, [999])];
    const m = costiPerOrdine(lavori, [{ id: 'O1', deal_id: 'D1' }]);
    expect(m.get('O1')?.costo).toBe(55);
  });
});

describe('costiPerChiave — più lavori sulla stessa vendita si sommano', () => {
  it('somma i lavori e dice quanti fornitori sono', () => {
    const m = costiPerChiave([lavoro({ deal_id: 'D1' }, [100]), lavoro({ deal_id: 'D1' }, [40])]);
    const c = m.get('deal:D1');
    expect(c?.costo).toBe(140);
    expect(c?.lavori).toBe(2);
    // Basta un lavoro ancora da decidere perché il totale resti una stima.
    expect(c?.definitivo).toBe(false);
  });

  it('i preventivi senza importo non fanno costo', () => {
    const m = costiPerChiave([lavoro({ richiesta_id: 'R1' }, [null, null])]);
    expect(m.has('richiesta:R1')).toBe(false);
  });
});
