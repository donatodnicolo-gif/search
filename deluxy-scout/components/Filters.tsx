import { StyleSheet, View } from 'react-native';
import type { StatoPlace } from '@/types';
import { labelStato, spacing } from '@/lib/theme';
import { OPZIONI_CITTA } from '@/lib/citta';
import { PannelloFiltri } from '@/components/PannelloFiltri';
import { GruppoFiltro } from '@/components/GruppoFiltro';

/**
 * I filtri sono **liste**: si spuntano più valori per gruppo (richiesta utente
 * del 28/07/2026 — «di selezionare più interessi, idem per gli altri»).
 *
 * Lista vuota = filtro spento. Più valori valgono in **OR**: «Milano o Roma»,
 * non «Milano e Roma» — un negozio sta in una città sola, e l'AND darebbe
 * sempre zero righe.
 */
export interface FiltriMappa {
  zona: string[]; // bucket città: Milano/Roma/Firenze/Altre
  priorita: string[];
  settore: string[];
  linea: string[];
  stato: string[];
  account: string[]; // solo admin: venditore che segue (anagrafiche_account)
  creatore: string[]; // solo admin: chi ha inserito il target (creato_da_nome)
}

/**
 * Filtri azzerati, **nuovi ogni volta**.
 *
 * È una funzione e non una costante perché ora i valori sono array: una
 * costante condivisa fra Mappa, Lista e Affiliazioni verrebbe copiata con
 * `{...filtriVuoti}`, che copia i *riferimenti* — e un `push` fatto per
 * distrazione da una schermata comparirebbe in tutte le altre, in modo
 * silenzioso e impossibile da ricondurre a chi l'ha scritto.
 */
export function filtriVuoti(): FiltriMappa {
  return { zona: [], priorita: [], settore: [], linea: [], stato: [], account: [], creatore: [] };
}

interface Props {
  filtri: FiltriMappa;
  opzioni: { zone: string[]; settori: string[]; linee: string[]; account?: string[]; creatori?: string[] };
  onChange: (f: FiltriMappa) => void;
  admin?: boolean; // mostra i filtri per utente (account, creatore)
  citta?: boolean; // false = nasconde il filtro Città (sulla Mappa è ridondante: hai già cercato l'indirizzo)
}

const PRIORITA = ['P1', 'P2', 'P3'];
const STATI = ['da_visitare', 'visitato', 'cliente', 'perso'];

// Etichette leggibili nei chip (mai valori tecnici con underscore o sigle nude).
const LABEL_PRIORITA: Record<string, string> = { P1: 'P1 · Alta', P2: 'P2 · Media', P3: 'P3 · Bassa' };
const labelChipStato = (v: string) => labelStato[v as StatoPlace] ?? v;

/** Barra filtri orizzontale in cima alla mappa/lista. */
export function Filters({ filtri, opzioni, onChange, admin, citta = true }: Props) {
  // Aggiunge o toglie un valore dal gruppo: ogni pillola è un interruttore.
  function toggle(key: keyof FiltriMappa, val: string) {
    const attuali = filtri[key];
    onChange({
      ...filtri,
      [key]: attuali.includes(val) ? attuali.filter((v) => v !== val) : [...attuali, val],
    });
  }
  // Svuota un gruppo ("Tutti"): senza, per tornare a vedere tutto bisognerebbe
  // ricordarsi cosa si era spuntato e rispegnerlo una voce per volta.
  function azzeraGruppo(key: keyof FiltriMappa) {
    onChange({ ...filtri, [key]: [] });
  }

  // Quanti VALORI sono spuntati in tutto (non quanti gruppi): il numero sul
  // bottone deve dire quanto si è ristretto, così una lista filtrata non sembra
  // mai vuota "senza motivo" quando il pannello è chiuso.
  const nAttivi = Object.values(filtri).reduce((s, v) => s + v.length, 0);

  return (
    // Gruppi impilati e chip che vanno a capo: in scorrimento orizzontale, sul
    // telefono, meta' dei filtri (Stato, Citta', Interessi...) restava fuori
    // schermo senza alcun segnale che ci fosse dell'altro. E tutto dietro un
    // bottone, perché aperto occupava più di una schermata prima della lista.
    <PannelloFiltri attivi={nAttivi} onAzzera={() => onChange(filtriVuoti())}>
    <View style={styles.row}>
      <GruppoFiltro
        titolo="Priorità"
        valori={PRIORITA}
        attivi={filtri.priorita}
        onTap={(v) => toggle('priorita', v)}
        onTutti={() => azzeraGruppo('priorita')}
        label={(v) => LABEL_PRIORITA[v] ?? v}
      />
      <GruppoFiltro
        titolo="Stato"
        valori={STATI}
        attivi={filtri.stato}
        onTap={(v) => toggle('stato', v)}
        onTutti={() => azzeraGruppo('stato')}
        label={labelChipStato}
      />
      {citta ? (
        <GruppoFiltro
          titolo="Città"
          // "Tutte" non è un valore fra gli altri: è il modo di svuotare il
          // gruppo, e la mette il componente.
          valori={(OPZIONI_CITTA as unknown as string[]).filter((v) => v !== 'Tutte')}
          attivi={filtri.zona}
          onTap={(v) => toggle('zona', v)}
          onTutti={() => azzeraGruppo('zona')}
          etichettaTutti="Tutte"
        />
      ) : null}
      <GruppoFiltro
        titolo="Settore"
        valori={opzioni.settori}
        attivi={filtri.settore}
        onTap={(v) => toggle('settore', v)}
        onTutti={() => azzeraGruppo('settore')}
      />
      <GruppoFiltro
        titolo="Interessi"
        valori={opzioni.linee}
        attivi={filtri.linea}
        onTap={(v) => toggle('linea', v)}
        onTutti={() => azzeraGruppo('linea')}
      />
      {admin ? (
        <>
          <GruppoFiltro
            titolo="Account"
            valori={opzioni.account ?? []}
            attivi={filtri.account}
            onTap={(v) => toggle('account', v)}
            onTutti={() => azzeraGruppo('account')}
          />
          <GruppoFiltro
            titolo="Inserito da"
            valori={opzioni.creatori ?? []}
            attivi={filtri.creatore}
            onTap={(v) => toggle('creatore', v)}
            onTutti={() => azzeraGruppo('creatore')}
          />
        </>
      ) : null}
    </View>
    </PannelloFiltri>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
});
