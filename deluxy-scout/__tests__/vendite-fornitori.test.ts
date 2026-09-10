// Le vendite di un fornitore lette dal Customer Service (10/09/2026): come si
// aggancia un partner del registro a una riga del CS, e come si scrive.
import {
  chiaveNome,
  euroTondo,
  piuRecente,
  fornitoriNonNelRegistro,
  indiceVendite,
  riassuntoVendite,
  venditeDi,
  type VenditeFornitore,
} from '@/lib/vendite-fornitori';

const riga = (p: Partial<VenditeFornitore> & { nome: string }): VenditeFornitore => ({
  id: '',
  chiave: chiaveNome(p.nome),
  ordini30: 0,
  ordiniLunga: 0,
  venduto30: 0,
  vendutoLunga: 0,
  ultimoIl: null,
  ultimoNumero: '',
  ...p,
});

describe('chiaveNome', () => {
  it('è identico a quello del Customer Service: accenti via, minuscole, uno spazio', () => {
    expect(chiaveNome('  Caffè  Rossi & C. ')).toBe('caffe rossi c');
    expect(chiaveNome('MARYFLOR di GERARDI VINCENZO')).toBe('maryflor di gerardi vincenzo');
    expect(chiaveNome(null)).toBe('');
  });
});

describe('venditeDi', () => {
  const indice = indiceVendite(
    [
      riga({ id: 'reg-1', nome: 'Enrico Rizzi', ordini30: 2, ordiniLunga: 7, venduto30: 300, vendutoLunga: 1200, ultimoIl: '2026-09-01T00:00:00.000Z', ultimoNumero: '#12901' }),
      riga({ nome: 'Petit Jardin - Fioreria', ordiniLunga: 1, vendutoLunga: 85, ultimoIl: '2026-06-01T00:00:00.000Z', ultimoNumero: '#1833' }),
    ],
    { giorniLunga: 180, asOf: '2026-09-10T10:00:00.000Z' },
  );

  it('aggancia per id del registro, che vince sul nome', () => {
    const v = venditeDi({ id: 'reg-1', nome: 'Enrico Rizzi Milano' }, indice);
    expect(v?.ordini30).toBe(2);
    expect(v?.ordiniLunga).toBe(7);
  });

  it('ripiega sul nome normalizzato quando il CS non ha agganciato il fornitore', () => {
    const v = venditeDi({ id: 'reg-9', nome: 'PETIT JARDIN – FIORERIA' }, indice);
    expect(v?.ordiniLunga).toBe(1);
    expect(v?.vendutoLunga).toBe(85);
  });

  it('null se il CS non gli ha dato ordini — e null anche senza indice (non lo sappiamo)', () => {
    expect(venditeDi({ id: 'reg-2', nome: 'Armani Fiori' }, indice)).toBeNull();
    expect(venditeDi({ id: 'reg-1', nome: 'Enrico Rizzi' }, null)).toBeNull();
  });

  it('due righe con lo stesso nome (prima e dopo l’aggancio) si sommano per nome', () => {
    const i2 = indiceVendite([
      riga({ id: 'reg-1', nome: 'Enrico Rizzi', ordini30: 1, ordiniLunga: 1, venduto30: 100, vendutoLunga: 100, ultimoIl: '2026-09-01T00:00:00.000Z', ultimoNumero: '#2' }),
      riga({ nome: 'Enrico Rizzi', ordiniLunga: 3, vendutoLunga: 500, ultimoIl: '2026-05-01T00:00:00.000Z', ultimoNumero: '#1' }),
    ]);
    const perNome = venditeDi({ id: 'x', nome: 'enrico rizzi' }, i2);
    expect(perNome?.ordiniLunga).toBe(4);
    expect(perNome?.vendutoLunga).toBe(600);
    expect(perNome?.ultimoNumero).toBe('#2');
    // Anche per id si trova la SOMMA: il caso vero è «FLEURS ET PLUS», 3
    // ordini con id e 3 senza — chi ha l'id deve vederne 6, non 3.
    expect(venditeDi({ id: 'reg-1', nome: 'altro' }, i2)?.ordiniLunga).toBe(4);
  });
});

describe('riassuntoVendite', () => {
  it('zero ordini è un trattino, non «0 · € 0»', () => {
    expect(riassuntoVendite(0, 0)).toBe('—');
  });
  it('singolare e plurale, importo arrotondato all’euro', () => {
    expect(riassuntoVendite(1, 85.4)).toBe('1 ordine · € 85');
    expect(riassuntoVendite(3, 1234.5)).toBe('3 ordini · € 1.235');
  });
  it('senza venduto resta il solo conteggio', () => {
    expect(riassuntoVendite(2, 0)).toBe('2 ordini');
  });
  it('il punto delle migliaia è scritto a mano, anche senza ICU', () => {
    expect(euroTondo(999)).toBe('€ 999');
    expect(euroTondo(1000)).toBe('€ 1.000');
    expect(euroTondo(1234567.89)).toBe('€ 1.234.568');
    expect(euroTondo(-1500)).toBe('€ -1.500');
  });
});

describe('fornitoriNonNelRegistro', () => {
  it('elenca chi il CS usa ma non sta fra i partner, per ordini decrescenti', () => {
    const indice = indiceVendite([
      riga({ id: 'reg-1', nome: 'Enrico Rizzi', ordiniLunga: 7 }),
      riga({ nome: 'Angolo Fiorito', ordiniLunga: 2 }),
      riga({ nome: 'Artista Locale', ordiniLunga: 5 }),
    ]);
    const fuori = fornitoriNonNelRegistro(indice, [{ id: 'reg-1', nome: 'Enrico Rizzi' }]);
    expect(fuori.map((f) => f.nome)).toEqual(['Artista Locale', 'Angolo Fiorito']);
  });
  it('un partner del registro con lo stesso nome (ma altro id) non è «fuori»', () => {
    const indice = indiceVendite([riga({ nome: 'Angolo Fiorito', ordiniLunga: 2 })]);
    expect(fornitoriNonNelRegistro(indice, [{ id: 'reg-5', nome: 'ANGOLO FIORITO' }])).toEqual([]);
  });
});

describe('ultimo pagamento (10/09/2026, «ultimo aggiornamento»)', () => {
  it('sommando due righe dello stesso nome vince il pagamento più recente', () => {
    const i = indiceVendite([
      riga({ id: 'reg-1', nome: 'Enrico Rizzi', ordiniLunga: 1, ultimoPagamentoIl: '2026-08-01T00:00:00.000Z' }),
      riga({ nome: 'Enrico Rizzi', ordiniLunga: 1, ultimoPagamentoIl: '2026-09-09T00:00:00.000Z' }),
    ]);
    expect(venditeDi({ id: 'reg-1', nome: 'x' }, i)?.ultimoPagamentoIl).toBe('2026-09-09T00:00:00.000Z');
  });
  it('piuRecente ignora i vuoti', () => {
    expect(piuRecente(null, '2026-08-23', undefined, '2026-09-09')).toBe('2026-09-09');
    expect(piuRecente(null, undefined)).toBeNull();
  });
});
