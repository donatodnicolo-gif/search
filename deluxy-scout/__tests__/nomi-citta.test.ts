// Il nome come si legge, e città/provincia ricavate dall'indirizzo (10/09/2026).
import { nomeLeggibile } from '@/lib/nomi';
import { cittaEProvincia } from '@/lib/citta-provincia';

describe('nomeLeggibile', () => {
  it('ogni parola in maiuscolo iniziale, il resto minuscolo', () => {
    expect(nomeLeggibile('MICAELA FLORAL DESIGN')).toBe('Micaela Floral Design');
    expect(nomeLeggibile('pasticceria bar giglio')).toBe('Pasticceria Bar Giglio');
  });
  it('gli articoli e le preposizioni restano minuscoli, ma non all’inizio', () => {
    expect(nomeLeggibile('PASTICCERIA BAR GIGLIO DI GIANLUCA BIANCHI')).toBe('Pasticceria Bar Giglio di Gianluca Bianchi');
    expect(nomeLeggibile('IL QUADRIFOGLIO')).toBe('Il Quadrifoglio');
  });
  it('dopo l’apostrofo di un articolo si ricomincia', () => {
    expect(nomeLeggibile("L'ATELIER DEL FIORE")).toBe("L'Atelier del Fiore");
  });
  it('le sigle societarie restano maiuscole; i trattini si tengono', () => {
    expect(nomeLeggibile('sa commercial garden group srls')).toBe('Sa Commercial Garden Group SRLS');
    expect(nomeLeggibile('IL-MONDO FIORITO')).toBe('Il-Mondo Fiorito');
  });
  it('vuoto resta vuoto', () => {
    expect(nomeLeggibile(null)).toBe('');
  });
});

describe('cittaEProvincia', () => {
  it('la sigla in coda all’indirizzo, e la città da zona', () => {
    expect(cittaEProvincia({ zona: 'Milano', indirizzo: 'Via Italo Bargagna, 12, 20100 Milano MI' })).toEqual({ citta: 'Milano', provincia: 'MI' });
  });
  it('senza zona la città sta fra il CAP e la sigla; «Italia» in coda non disturba', () => {
    expect(cittaEProvincia({ zona: null, indirizzo: 'Corso Roma, 93, 28021 Borgomanero NO, Italia' })).toEqual({ citta: 'Borgomanero', provincia: 'NO' });
    expect(cittaEProvincia({ zona: null, indirizzo: 'Via Belfiore, 11, 20145 Milano (MI)' })).toEqual({ citta: 'Milano', provincia: 'MI' });
  });
  it('un capoluogo scritto solo come città dà la provincia', () => {
    expect(cittaEProvincia({ zona: 'Torino', indirizzo: 'Via Roma 1' })).toEqual({ citta: 'Torino', provincia: 'TO' });
  });
  it('due lettere che non sono una provincia non contano', () => {
    expect(cittaEProvincia({ zona: null, indirizzo: 'Piazza XX' })).toEqual({ citta: null, provincia: null });
  });
});
