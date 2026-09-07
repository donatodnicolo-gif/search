// Il COSTO di un ordine viene dai preventivi fornitore — ma il lavoro può
// essere agganciato a tre posti diversi (trattativa, richiesta cliente,
// ordine, migr. 0077). Se la lettura ne guarda uno solo, il margine di quel
// ordine sparisce senza dirlo: si vede «—» dov'era un numero, e nessuno sa
// perché. Questi test tengono ferme le tre strade.
// ⚠️ `lib/preventivi` importa il client Supabase, che all'avvio pretende le
// variabili d'ambiente: qui si prova il CONTO, non la connessione, quindi il
// client si sostituisce con un guscio vuoto.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import {
  costiPerOrdine,
  costiPerChiave,
  chiaveVendita,
  preventiviPerChiave,
  perTrattativa,
  trattativaDelLavoro,
  costoDeiLavori,
  type LavoroConPreventivi,
  type Preventivo,
} from '@/lib/preventivi';

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

describe('l\'etichetta del fornitore conta i FORNITORI, non i lavori', () => {
  it('due fornitori su tre lavori sono «2 fornitori»', () => {
    // ⚠️ Prima si componeva col numero di lavori, e dopo la prima differenza il
    // confronto restava vero per sempre: usciva «3 fornitori» con due veri.
    const l = (chi: string, imp: number) =>
      ({
        id: `l-${chi}-${imp}`,
        deal_id: 'D1',
        preventivi: [{ id: `p${imp}`, fornitore: chi, importo: imp, stato: 'ricevuto', created_at: '2026-08-26T10:00:00Z' }],
      }) as unknown as LavoroConPreventivi;
    const m = costiPerChiave([l('A', 10), l('A', 20), l('B', 30)]);
    expect(m.get('deal:D1')?.fornitore).toBe('2 fornitori');
    expect(m.get('deal:D1')?.lavori).toBe(3);
    expect(m.get('deal:D1')?.costo).toBe(60);
  });

  it('lo stesso fornitore su tre lavori resta il suo nome', () => {
    const l = (imp: number) =>
      ({
        id: `l${imp}`,
        deal_id: 'D2',
        preventivi: [{ id: `p${imp}`, fornitore: 'Rossi', importo: imp, stato: 'ricevuto', created_at: '2026-08-26T10:00:00Z' }],
      }) as unknown as LavoroConPreventivi;
    expect(costiPerChiave([l(10), l(20), l(30)]).get('deal:D2')?.fornitore).toBe('Rossi');
  });
});

// ── I preventivi VISTI DALLA TRATTATIVA (07/09/2026) ─────────────────────────
// `costiPerChiave` dice quanto costa; questo dice QUALI sono. Le due mappe
// devono parlare della stessa vendita, o l'elenco mostrerebbe un costo che la
// scheda non sa spiegare.

/** Un lavoro con preventivi in stati diversi, scritti a mano. */
function conStati(legami: Partial<LavoroConPreventivi>, prev: Partial<Preventivo>[]): LavoroConPreventivi {
  return {
    id: 'L',
    titolo: 'Lavoro',
    stato: 'aperto',
    created_at: '2026-09-01T10:00:00Z',
    ...legami,
    preventivi: prev.map((x, i) => ({
      id: `p${i}`,
      lavoro_id: 'L',
      fornitore: `F${i}`,
      importo: null,
      stato: 'ricevuto',
      created_at: `2026-09-01T1${i}:00:00Z`,
      ...x,
    })),
  } as unknown as LavoroConPreventivi;
}

describe('chiaveVendita — il legame più vicino vince, e HubSpot parla la sua lingua', () => {
  it('ordine batte trattativa, trattativa batte niente', () => {
    expect(chiaveVendita({ ordine_id: 'O1', deal_id: 'D1' })).toBe('ordine:O1');
    expect(chiaveVendita({ deal_id: 'D1' })).toBe('deal:D1');
    expect(chiaveVendita({ richiesta_id: 'R1', deal_id: 'D1' })).toBe('richiesta:R1');
  });

  it('la trattativa di HubSpot usa l id sintetico dell elenco', () => {
    expect(chiaveVendita({ hubspot_deal_id: '512059002060' })).toBe('deal:hs_512059002060');
  });

  it('un lavoro senza nessun legame non ha chiave (e non finisce su nessuna vendita)', () => {
    expect(chiaveVendita({})).toBeNull();
  });
});

describe('preventiviPerChiave — quali preventivi ha una trattativa', () => {
  it('separa i ricevuti da quelli ancora in attesa', () => {
    const m = preventiviPerChiave([
      conStati({ deal_id: 'D1' }, [
        { importo: 180 },
        { importo: null, stato: 'richiesto' },
        { importo: 250 },
      ]),
    ]);
    const r = m.get('deal:D1')!;
    expect(r.ricevuti.map((p) => p.importo)).toEqual([180, 250]);
    expect(r.inAttesa).toHaveLength(1);
    expect(r.tutti).toHaveLength(3);
    expect(r.migliore?.importo).toBe(180);
  });

  it('lo SCELTO vince sul più basso: è una decisione, non un confronto', () => {
    const m = preventiviPerChiave([
      conStati({ deal_id: 'D1' }, [{ importo: 180 }, { importo: 300, stato: 'scelto' }]),
    ]);
    const r = m.get('deal:D1')!;
    expect(r.scelto?.importo).toBe(300);
    expect(r.migliore?.importo).toBe(300);
  });

  it('lo SCARTATO resta in elenco ma non è né ricevuto né in gioco', () => {
    const m = preventiviPerChiave([
      conStati({ deal_id: 'D1' }, [{ importo: 90, stato: 'scartato' }, { importo: 200 }]),
    ]);
    const r = m.get('deal:D1')!;
    expect(r.tutti).toHaveLength(2);
    expect(r.ricevuti.map((p) => p.importo)).toEqual([200]);
    expect(r.migliore?.importo).toBe(200);
  });

  it('due lavori sulla stessa trattativa stanno in una voce sola', () => {
    const m = preventiviPerChiave([
      conStati({ deal_id: 'D1' }, [{ importo: 100 }]),
      conStati({ deal_id: 'D1' }, [{ importo: 40 }]),
    ]);
    const r = m.get('deal:D1')!;
    expect(r.lavori).toBe(2);
    expect(r.ricevuti).toHaveLength(2);
  });

  it('una trattativa con un lavoro e ZERO preventivi c è, ma vuota', () => {
    const m = preventiviPerChiave([conStati({ deal_id: 'D1' }, [])]);
    const r = m.get('deal:D1')!;
    expect(r.tutti).toHaveLength(0);
    expect(r.migliore).toBeNull();
  });

  it('⭐ parla la stessa lingua di costiPerChiave: stessa vendita, stessa cifra', () => {
    const lavori = [
      conStati({ deal_id: 'D1' }, [{ importo: 100 }, { importo: 250 }]),
      conStati({ deal_id: 'D1' }, [{ importo: 40 }]),
    ];
    const costo = costiPerChiave(lavori).get('deal:D1')!;
    const riep = preventiviPerChiave(lavori).get('deal:D1')!;
    // 100 (il più basso del primo lavoro) + 40 (l'unico del secondo)
    expect(costo.costo).toBe(140);
    expect(riep.lavori).toBe(costo.lavori);
    // Il «migliore» è il più basso in assoluto, NON il totale: sono due numeri
    // diversi apposta, ed è il motivo per cui la schermata mostra il totale.
    expect(riep.migliore?.importo).toBe(40);
  });
});

// ── La RISALITA dall'ordine alla trattativa (07/09/2026) ─────────────────────
// Il giorno in cui la trattativa ha iniziato a mostrare i suoi preventivi, sul
// database 14 lavori su 15 erano agganciati a un ORDINE e uno solo alla
// trattativa: guardando il solo legame diretto la schermata sarebbe nata vuota
// su quasi tutto, e avrebbe detto «nessun preventivo» dove i preventivi
// c'erano. Questi test tengono ferma la risalita.

describe('trattativaDelLavoro — il legame diretto vince, poi si risale', () => {
  const daOrdine = new Map([['O1', 'D9']]);

  it('il lavoro agganciato alla trattativa è di QUELLA, anche se l ordine ne ha un altra', () => {
    expect(trattativaDelLavoro({ deal_id: 'D1', ordine_id: 'O1' }, daOrdine)).toBe('D1');
  });

  it('il lavoro agganciato a un ordine risale alla trattativa di quell ordine', () => {
    expect(trattativaDelLavoro({ ordine_id: 'O1' }, daOrdine)).toBe('D9');
  });

  it('un ordine SENZA trattativa non inventa un legame', () => {
    expect(trattativaDelLavoro({ ordine_id: 'ignoto' }, daOrdine)).toBeNull();
  });

  it('una RICHIESTA CLIENTE non risale: non è una trattativa', () => {
    expect(trattativaDelLavoro({ richiesta_id: 'R1' }, daOrdine)).toBeNull();
  });
});

describe('perTrattativa — i preventivi che una trattativa mostra', () => {
  it('mette insieme il lavoro suo e quelli dei suoi ordini', () => {
    const m = perTrattativa(
      [
        conStati({ deal_id: 'D1' }, [{ importo: 100 }]),
        conStati({ ordine_id: 'O1' }, [{ importo: 40 }]),
      ],
      [{ id: 'O1', deal_id: 'D1' }],
    );
    const v = m.get('D1')!;
    expect(v.riepilogo.ricevuti).toHaveLength(2);
    expect(v.riepilogo.lavori).toBe(2);
    // 100 + 40: due lavori sono due costi, non il più basso dei due.
    expect(v.costo?.costo).toBe(140);
  });

  it('⭐ senza la risalita la trattativa sarebbe vuota: è il caso dei 14 su 15', () => {
    const lavori = [conStati({ ordine_id: 'O1' }, [{ importo: 250, stato: 'scelto' }])];
    // Con la mappa degli ordini: si vede.
    expect(perTrattativa(lavori, [{ id: 'O1', deal_id: 'D1' }]).get('D1')?.riepilogo.ricevuti)
      .toHaveLength(1);
    // Senza: non si vede niente, ed è esattamente il difetto che si correggeva.
    expect(perTrattativa(lavori, []).size).toBe(0);
  });

  it('la trattativa di HubSpot si chiama hs_<id>, come nell elenco', () => {
    const m = perTrattativa([conStati({ hubspot_deal_id: '512059002060' }, [{ importo: 80 }])], []);
    expect(m.get('hs_512059002060')?.riepilogo.ricevuti).toHaveLength(1);
  });

  it('un costo NON si inventa: senza prezzi ricevuti resta null, mai zero', () => {
    const m = perTrattativa(
      [conStati({ deal_id: 'D1' }, [{ importo: null, stato: 'richiesto' }])],
      [],
    );
    const v = m.get('D1')!;
    expect(v.costo).toBeNull();
    expect(v.riepilogo.inAttesa).toHaveLength(1);
  });

  it('basta un lavoro non deciso perché il totale sia una STIMA', () => {
    const deciso = costoDeiLavori([conStati({}, [{ importo: 100, stato: 'scelto' }])]);
    expect(deciso).toEqual({ costo: 100, definitivo: true, lavori: 1 });
    const misto = costoDeiLavori([
      conStati({}, [{ importo: 100, stato: 'scelto' }]),
      conStati({}, [{ importo: 40 }]),
    ]);
    expect(misto?.definitivo).toBe(false);
    expect(misto?.costo).toBe(140);
  });
});
