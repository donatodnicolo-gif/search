// Dashboard di Team: rollup attività per venditore.
import type { Deal, Profilo, Visit } from '@/types';
import { attivitaPerGiorno, attivitaPerVenditore, nomeVenditore } from '@/lib/metrics';

const OGGI = new Date('2026-07-15T12:00:00Z');

function visita(owner: string | null, giorniFa: number, esito: Visit['esito']): Visit {
  return {
    id: `${owner}-${giorniFa}-${esito}`,
    place_id: 'p1',
    data: new Date(OGGI.getTime() - giorniFa * 86400000).toISOString(),
    lat: null,
    lng: null,
    esito,
    briefing: null,
    note_post_meeting: null,
    esito_analisi: null,
    next_step: 'x',
    linea_proposta: null,
    cross_sell: null,
    concorrenti: null,
    foto_url: null,
    owner,
    hubspot_synced: false,
    created_at: '2026-07-01T00:00:00Z',
  };
}

function deal(owner: string | null, fase: Deal['fase']): Deal {
  return { id: `${owner}-${fase}`, place_id: 'p1', linea: null, fase, valore_atteso: null, next_action: null, owner, hubspot_deal_id: null };
}

const PROFILI: Profilo[] = [
  { id: 'u1', email: 'mario.rossi@deluxy.it', nome: 'Mario Rossi' },
  { id: 'u2', email: 'lucia@deluxy.it', nome: null },
];

describe('nomeVenditore', () => {
  const m = new Map(PROFILI.map((p) => [p.id, p]));
  it('usa il nome del profilo se presente', () => {
    expect(nomeVenditore('u1', m)).toBe('Mario Rossi');
  });
  it('ripiega sulla parte prima della @ se manca il nome', () => {
    expect(nomeVenditore('u2', m)).toBe('lucia');
  });
  it('ripiego leggibile se il profilo non esiste', () => {
    expect(nomeVenditore('abcdef12-0000', m)).toBe('Utente abcdef');
  });
  it('gestisce owner nullo', () => {
    expect(nomeVenditore(null, m)).toBe('Non attribuito');
  });
});

describe('attivitaPerVenditore', () => {
  it('aggrega visite ed esiti per owner', () => {
    const visits = [
      visita('u1', 1, 'interessato'),
      visita('u1', 2, 'da_richiamare'),
      visita('u1', 10, 'non_target'),
      visita('u2', 0, 'interessato'),
    ];
    const stats = attivitaPerVenditore(visits, [], PROFILI, OGGI);
    const u1 = stats.find((s) => s.ownerId === 'u1')!;
    expect(u1.visite).toBe(3);
    expect(u1.visite7).toBe(2); // la visita di 10 giorni fa è fuori finestra
    expect(u1.interessati).toBe(1);
    expect(u1.daRichiamare).toBe(1);
    expect(u1.nome).toBe('Mario Rossi');
  });

  it('conta i deal aperti e vinti, esclude i persi', () => {
    const deals = [deal('u1', 'appointmentscheduled'), deal('u1', 'closedwon'), deal('u1', 'closedlost')];
    const u1 = attivitaPerVenditore([], deals, PROFILI, OGGI).find((s) => s.ownerId === 'u1')!;
    expect(u1.dealAperti).toBe(1);
    expect(u1.dealVinti).toBe(1);
  });

  it('ordina per visite negli ultimi 7 giorni', () => {
    const visits = [
      visita('u1', 1, 'interessato'),
      visita('u2', 1, 'interessato'),
      visita('u2', 2, 'interessato'),
    ];
    const ids = attivitaPerVenditore(visits, [], PROFILI, OGGI).map((s) => s.ownerId);
    expect(ids[0]).toBe('u2'); // 2 visite in 7g > 1
  });

  it('raggruppa le visite senza owner sotto "Non attribuito"', () => {
    const stats = attivitaPerVenditore([visita(null, 1, 'chiuso')], [], PROFILI, OGGI);
    expect(stats.find((s) => s.ownerId === null)?.nome).toBe('Non attribuito');
  });
});

describe('attivitaPerGiorno', () => {
  // Visita con data ISO esplicita per controllare il raggruppamento giornaliero.
  function vGiorno(owner: string | null, iso: string, esito: Visit['esito']): Visit {
    return { ...visita(owner, 0, esito), id: `${owner}-${iso}-${esito}`, data: iso };
  }

  it('filtra per venditore e raggruppa per giorno (più recente in cima)', () => {
    const visits = [
      vGiorno('u1', '2026-07-15T09:00:00Z', 'interessato'),
      vGiorno('u1', '2026-07-15T15:00:00Z', 'chiuso'),
      vGiorno('u1', '2026-07-14T10:00:00Z', 'non_target'),
      vGiorno('u2', '2026-07-15T11:00:00Z', 'interessato'), // altro venditore, escluso
    ];
    const giorni = attivitaPerGiorno(visits, 'u1');
    expect(giorni.map((g) => g.giorno)).toEqual(['2026-07-15', '2026-07-14']);
    expect(giorni[0].totale).toBe(2);
    expect(giorni[0].interessati).toBe(1);
    expect(giorni[0].chiusi).toBe(1);
  });

  it('calcola le KPI del giorno (contatti = interessati + chiusi)', () => {
    const visits = [
      vGiorno('u1', '2026-07-15T09:00:00Z', 'interessato'),
      vGiorno('u1', '2026-07-15T10:00:00Z', 'chiuso'),
      vGiorno('u1', '2026-07-15T11:00:00Z', 'da_richiamare'),
    ];
    const [g] = attivitaPerGiorno(visits, 'u1');
    expect(g.contatti).toBe(2);
    expect(g.daRichiamare).toBe(1);
  });

  it('ordina le visite del giorno dalla più recente', () => {
    const visits = [
      vGiorno('u1', '2026-07-15T09:00:00Z', 'interessato'),
      vGiorno('u1', '2026-07-15T17:00:00Z', 'chiuso'),
    ];
    const [g] = attivitaPerGiorno(visits, 'u1');
    expect(g.visite[0].data).toBe('2026-07-15T17:00:00Z');
  });
});
