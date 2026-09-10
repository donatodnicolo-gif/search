// I link dentro un testo: si riconoscono e si separano dalla punteggiatura
// che il testo gli attacca in coda (10/09/2026).
import { pulisciUrl, spezzaLink } from '@/lib/link-nel-testo';

describe('link nelle note del registro', () => {
  it('trova i due link di una nota Google Maps, uno per riga', () => {
    const nota =
      'Da Google Maps:\nSito: https://www.facebook.com/Il-mondo-fiorito-101717895326605\nCAP: 23822\nScheda: https://maps.google.com/?cid=16073102330648286783\nGoogle place id: ChIJr9ATNdkXhEcRP1bLKGkhD98';
    const link = spezzaLink(nota).filter((p) => 'url' in p);
    expect(link).toEqual([
      { url: 'https://www.facebook.com/Il-mondo-fiorito-101717895326605', coda: '' },
      { url: 'https://maps.google.com/?cid=16073102330648286783', coda: '' },
    ]);
  });
  it('il testo intorno ai link resta com’è, a capo compresi', () => {
    const pezzi = spezzaLink('Sito: https://deluxy.it\nCAP: 23822');
    expect(pezzi).toEqual([{ testo: 'Sito: ' }, { url: 'https://deluxy.it', coda: '' }, { testo: '\nCAP: 23822' }]);
  });
  it('la punteggiatura in coda resta testo, non link', () => {
    expect(pulisciUrl('https://deluxy.it/pagina.')).toEqual({ url: 'https://deluxy.it/pagina', coda: '.' });
    expect(pulisciUrl('https://deluxy.it/?a=1),')).toEqual({ url: 'https://deluxy.it/?a=1', coda: '),' });
    expect(pulisciUrl('https://deluxy.it')).toEqual({ url: 'https://deluxy.it', coda: '' });
  });
  it('un testo senza link è un pezzo solo', () => {
    expect(spezzaLink('Chiuso il lunedì.')).toEqual([{ testo: 'Chiuso il lunedì.' }]);
  });
});
