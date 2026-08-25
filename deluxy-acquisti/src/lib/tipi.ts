// Forme "serializzabili" dei dati passati dal server (page.tsx) ai componenti
// client: le date sono stringhe ISO, gli importi numeri.

export type MovimentoDTO = {
  id: string;
  tipo: string;
  importo: number;
  valuta: string;
  stato: string;
  metodo: string | null;
  riferimento: string | null;
  data: string;
  scadenza: string | null;
  note: string | null;
  creatoDa: string | null;
};

export type AcquistoDTO = {
  id: string;
  numero: number;
  descrizione: string;
  categoria: string | null;
  fornitoreNome: string;
  fornitorePiva: string | null;
  imponibile: number;
  iva: number;
  totale: number;
  valuta: string;
  stato: string;
  numeroFattura: string | null;
  dataFattura: string | null;
  dataOrdine: string;
  dataConsegnaPrevista: string | null;
  dataConsegna: string | null;
  note: string | null;
  creatoDa: string | null;
  creatoIl: string;
  movimenti: MovimentoDTO[];
  pagato: number; // somma movimenti eseguiti (note credito/rimborsi in negativo)
};

export type RichiestaDTO = {
  id: string;
  numero: number;
  richiedenteNome: string | null;
  richiedenteEmail: string;
  titolo: string;
  descrizione: string | null;
  categoria: string | null;
  fornitoreSuggerito: string | null;
  importoStimato: number | null;
  valuta: string;
  priorita: string;
  dataNecessita: string | null;
  stato: string;
  approvatoreNome: string | null;
  decisoIl: string | null;
  notaDecisione: string | null;
  acquistoId: string | null;
  creataIl: string;
};

export type Riepilogo = {
  richiesteDaApprovare: number;
  acquistiAperti: number;
  daPagare: number; // importo residuo totale
  speso12Mesi: number; // pagato negli ultimi 12 mesi
  valuta: string;
};
