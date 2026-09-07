// I recapiti di una richiesta web: un punto solo, tre livelli di fiducia
// (migr. 0119). L'euristica sull'@ era ricopiata in cinque schermate: qui si
// prova che la copia sopravvissuta fa quello che facevano tutte, e in più
// tiene i due recapiti insieme.
import { recapitiLead, soloCifre } from '@/lib/lead-parse';

const MODULO =
  'New customer message Country Code: IT Name: Maria Rossi Email: maria@negozio.it Phone: +39 333 1234567 Body: vorrei un preventivo';

describe('recapitiLead', () => {
  it('le colonne scritte a mano vincono su tutto', () => {
    const r = recapitiLead({
      nome: 'Business Deluxy (Shopify)',
      messaggio: MODULO,
      contatto: 'vecchio@esempio.it',
      email: 'giusta@negozio.it',
      telefono: '02 1111111',
    });
    expect(r.email).toBe('giusta@negozio.it');
    expect(r.telefono).toBe('02 1111111');
  });

  it('senza colonne legge il modulo del sito, e prende ENTRAMBI i recapiti', () => {
    const r = recapitiLead({ nome: 'Business Deluxy (Shopify)', messaggio: MODULO, contatto: null });
    expect(r.email).toBe('maria@negozio.it');
    expect(r.telefono).toBe('+39 333 1234567');
  });

  it('sulle righe vecchie ripiega su contatto, spacchettato con l-euristica dell-@', () => {
    const conMail = recapitiLead({ nome: 'Fioreria Bianchi', messaggio: null, contatto: 'info@bianchi.it' });
    expect(conMail.email).toBe('info@bianchi.it');
    expect(conMail.telefono).toBeNull();

    const conTel = recapitiLead({ nome: 'Fioreria Bianchi', messaggio: null, contatto: '333 999888' });
    expect(conTel.email).toBeNull();
    expect(conTel.telefono).toBe('333 999888');
  });

  it('una colonna vuota non nasconde il ripiego, una piena a meta-ne copre solo la sua', () => {
    const r = recapitiLead({
      nome: 'Fioreria Bianchi',
      messaggio: null,
      contatto: 'info@bianchi.it',
      email: '   ',
      telefono: '333 111222',
    });
    expect(r.email).toBe('info@bianchi.it');
    expect(r.telefono).toBe('333 111222');
  });

  it('niente recapiti = due null, mai una stringa vuota', () => {
    const r = recapitiLead({ nome: 'Tal dei Tali', messaggio: 'ciao', contatto: null });
    expect(r.email).toBeNull();
    expect(r.telefono).toBeNull();
  });
});

describe('soloCifre', () => {
  it('lascia solo cifre e prefisso: il link tel: deve poterlo comporre', () => {
    expect(soloCifre('+39 333 123.45-67')).toBe('+393331234567');
    expect(soloCifre('(02) 1111 111')).toBe('021111111');
  });
});
