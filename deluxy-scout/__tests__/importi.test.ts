// Un importo scritto a mano vale soldi veri: se lo si legge male, il numero
// sbagliato non protesta. Prima di questi test la stessa regola era ricopiata
// in cinque schermate e in tre era sbagliata — in due direzioni opposte.
import { leggiImporto, leggiImportoPositivo, scriviImporto } from '@/lib/importi';

describe('leggiImporto — la scrittura italiana', () => {
  it('«1.500,50» sono millecinquecento euro e cinquanta', () => {
    expect(leggiImporto('1.500,50')).toBe(1500.5);
  });

  it('«1.500» sono millecinquecento, NON uno e cinquanta', () => {
    // ⚠️ È il difetto che faceva partire al cliente una richiesta di pagamento
    // da 1,50 € al posto di 1.500 €.
    expect(leggiImporto('1.500')).toBe(1500);
  });

  it('«1.234.567» regge più separatori di migliaia', () => {
    expect(leggiImporto('1.234.567')).toBe(1234567);
  });

  it('«1500,50» senza migliaia', () => {
    expect(leggiImporto('1500,50')).toBe(1500.5);
  });

  it('il simbolo e le parole non fanno perdere il prezzo', () => {
    // ⚠️ Prima «€ 1.250» diventava NaN e il preventivo si salvava SENZA prezzo,
    // in silenzio: spariva dal confronto e il margine restava «—».
    expect(leggiImporto('€ 1.250')).toBe(1250);
    expect(leggiImporto('1250 euro')).toBe(1250);
    expect(leggiImporto('1.250 €')).toBe(1250);
  });

  it('regge gli spazi del copia-incolla', () => {
    expect(leggiImporto('1 500,50')).toBe(1500.5);
    expect(leggiImporto(' € 1.500')).toBe(1500);
  });
});

describe('leggiImporto — il punto «all\'inglese» dei nostri stessi campi', () => {
  it('«1500.5» è quello che il database rimette nel campo', () => {
    // ⚠️ Il campo «Valore atteso» si riapre precompilato con il numero del
    // database: prima bastava salvare senza toccarlo per scrivere 15005.
    expect(leggiImporto('1500.5')).toBe(1500.5);
  });

  it('«12.75» è un decimale, «12.750» sono migliaia', () => {
    expect(leggiImporto('12.75')).toBe(12.75);
    expect(leggiImporto('12.750')).toBe(12750);
  });
});

describe('leggiImporto — chi non capisce non inventa', () => {
  it('il vuoto è «non lo so», non zero', () => {
    expect(leggiImporto('')).toBeNull();
    expect(leggiImporto('   ')).toBeNull();
    expect(leggiImporto(null)).toBeNull();
    expect(leggiImporto(undefined)).toBeNull();
  });

  it('una parola non è un numero', () => {
    expect(leggiImporto('milleecinquecento')).toBeNull();
    expect(leggiImporto('da concordare')).toBeNull();
  });

  it('due virgole non si indovinano', () => {
    expect(leggiImporto('1,5,3')).toBeNull();
  });

  it('lo zero scritto è zero, e resta zero', () => {
    // ⚠️ Zero è una risposta, e non va confuso col silenzio.
    expect(leggiImporto('0')).toBe(0);
    expect(leggiImportoPositivo('0')).toBeNull();
  });
});

describe('scriviImporto — il valore che torna dentro il campo', () => {
  it('rimette la virgola italiana', () => {
    expect(scriviImporto(1500.5)).toBe('1500,5');
    expect(scriviImporto(1500)).toBe('1500');
  });

  it('il niente resta niente', () => {
    expect(scriviImporto(null)).toBe('');
  });

  it('quello che scrive si rilegge uguale (andata e ritorno)', () => {
    for (const n of [0, 12.75, 1500, 1500.5, 1234567]) {
      expect(leggiImporto(scriviImporto(n))).toBe(n);
    }
  });
});
