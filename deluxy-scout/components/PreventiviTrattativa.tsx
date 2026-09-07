// I PREVENTIVI FORNITORE visti DALLA TRATTATIVA (07/09/2026, richiesta
// dell'utente: «fai vedere anche in trattative e per trattativa quali sono i
// preventivi che abbiamo ricevuto»).
//
// Fino a ieri dalla trattativa c'era solo un link — «Preventivi fornitori
// ricevuti ›» — dentro il foglio di modifica: per sapere se era arrivato
// qualcosa bisognava uscire dalla pagina, e nell'elenco non se ne vedeva
// traccia. Il preventivo è quanto ci COSTA quella vendita: è metà del conto, e
// stava dall'altra parte dell'app.
//
// Qui ci sono le due misure della stessa cosa:
//   · `RiassuntoPreventivi` — una riga per l'elenco (quanti, quanto, chi);
//   · `ElencoPreventivi`    — la lista vera per la scheda, uno per riga.
// Sono nello stesso file di proposito: sono la stessa informazione detta corta
// e detta lunga, e devono cambiare insieme.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { StatusBadge } from '@/components/ui';
import {
  COLORE_STATO_PREVENTIVO,
  LABEL_STATO_PREVENTIVO,
  type Preventivo,
  type RiepilogoPreventivi,
} from '@/lib/preventivi';

const euro = (n: number | null | undefined) =>
  n == null ? '—' : `€ ${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** gg/mm/aa, o niente: una data illeggibile è peggio di nessuna data. */
function dataBreve(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/**
 * ⚠️ QUANTO COSTA = LA SOMMA SUI LAVORI, non l'importo del «migliore».
 *
 * Una trattativa può avere due lavori (le composizioni e il trasporto): il
 * miglior preventivo di uno solo non è il costo della vendita, è metà. Il
 * totale si fa lavoro per lavoro, prendendo per ciascuno lo SCELTO se c'è e il
 * più basso ricevuto se no — la stessa regola di `costiPerChiave`, che è quella
 * che alimenta il margine degli Ordini: se qui dicesse un altro numero, la
 * stessa vendita costerebbe due cifre diverse in due schermate.
 */

/**
 * La riga corta per l'elenco. Torna `null` quando non c'è nulla da dire: una
 * trattativa senza preventivi non guadagna niente da un «—» in più, e
 * l'elenco è già fitto.
 */
export function RiassuntoPreventivi({
  riepilogo,
  costo,
  compatto,
}: {
  riepilogo: RiepilogoPreventivi | undefined;
  /** Il totale da `costiPerChiave`: la stessa cifra del margine degli Ordini. */
  costo?: { costo: number; definitivo: boolean } | undefined;
  /** Nell'elenco a tabella lo spazio è poco: solo la cifra e il conteggio. */
  compatto?: boolean;
}) {
  if (!riepilogo) return null;
  const { ricevuti, inAttesa, scelto } = riepilogo;
  if (!ricevuti.length && !inAttesa.length) return null;

  // Quanti prezzi abbiamo davvero in mano, e quanti ne stiamo ancora aspettando.
  const nRic = ricevuti.length;
  const nAtt = inAttesa.length;
  const totale = costo?.costo ?? null;
  // «Scelto» è una decisione presa; senza, il numero è la stima più bassa e va
  // detto — un costo provvisorio spacciato per definitivo falsa il margine.
  const definitivo = costo?.definitivo ?? Boolean(scelto);

  if (compatto) {
    return (
      <View style={stili.compatto}>
        {totale != null ? (
          <Text style={[stili.costo, definitivo && stili.costoScelto]} numberOfLines={1}>
            {definitivo ? '' : '~ '}
            {euro(totale)}
          </Text>
        ) : null}
        <Text style={stili.compattoNota} numberOfLines={1}>
          {nRic ? `${nRic} prev.` : ''}
          {nRic && nAtt ? ' · ' : ''}
          {nAtt ? `${nAtt} in attesa` : ''}
        </Text>
      </View>
    );
  }

  return (
    <View style={stili.riga}>
      <Ionicons name="calculator-outline" size={14} color={colors.grigio} />
      <Text style={stili.rigaTxt} numberOfLines={1}>
        {nRic
          ? `${nRic} ${nRic === 1 ? 'preventivo' : 'preventivi'} · costo ${definitivo ? '' : 'stimato '}${euro(totale)}`
          : 'preventivi chiesti, nessun prezzo ancora'}
        {nAtt ? ` · ${nAtt} in attesa` : ''}
      </Text>
    </View>
  );
}

/**
 * L'elenco vero, per la scheda della trattativa: CHI ce l'ha mandato e quanto,
 * uno per riga. È la risposta alla domanda «quali sono», che il riassunto non
 * dà — e senza il nome del fornitore un prezzo non serve a chiamare nessuno.
 *
 * ⚠️ Ci sono anche quelli SENZA prezzo: un fornitore a cui abbiamo chiesto e
 * che non ha risposto è la ragione per cui si sollecita, e nasconderlo fa
 * sembrare che non gli avessimo mai scritto.
 */
export function ElencoPreventivi({
  riepilogo,
  costo,
  onApri,
}: {
  riepilogo: RiepilogoPreventivi | undefined;
  costo?: { costo: number; definitivo: boolean } | undefined;
  /** Apre la schermata Preventivi su questa trattativa (per aggiungerne). */
  onApri?: () => void;
}) {
  const tutti = riepilogo?.tutti ?? [];
  if (!tutti.length) {
    return (
      <View style={stili.vuoto}>
        <Text style={stili.vuotoTxt}>
          Nessun preventivo fornitore per questa trattativa.
        </Text>
        {onApri ? (
          <Pressable onPress={onApri} hitSlop={6}>
            <Text style={stili.link}>Chiedine uno ›</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const totale = costo?.costo ?? null;
  const definitivo = costo?.definitivo ?? Boolean(riepilogo?.scelto);
  // Il più basso fra quelli in gioco: si segna, ma NON è «lo scelto». Con un
  // preventivo già scelto il confronto è chiuso, e mettere una spilla sul più
  // economico rimetterebbe in discussione una decisione presa.
  const idMigliore = riepilogo?.scelto ? null : (riepilogo?.migliore?.id ?? null);

  return (
    <View style={stili.blocco}>
      {tutti.map((p) => (
        <RigaPreventivo key={p.id} p={p} evidenzia={p.id === idMigliore} />
      ))}
      <View style={stili.piede}>
        <Text style={stili.piedeTxt}>
          {totale != null
            ? `Costo ${definitivo ? 'della vendita' : 'stimato'}: ${euro(totale)}`
            : 'Nessun prezzo ricevuto: il costo di questa vendita non si sa ancora.'}
          {riepilogo && riepilogo.lavori > 1 ? ` · ${riepilogo.lavori} lavori` : ''}
        </Text>
        {onApri ? (
          <Pressable onPress={onApri} hitSlop={6}>
            <Text style={stili.link}>Aprili ›</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function RigaPreventivo({ p, evidenzia }: { p: Preventivo; evidenzia: boolean }) {
  const quando = dataBreve(p.created_at);
  const scartato = p.stato === 'scartato';
  return (
    <View style={[stili.prev, evidenzia && stili.prevMigliore, scartato && stili.prevScartato]}>
      <View style={stili.prevTesta}>
        <Text style={[stili.fornitore, scartato && stili.testoSpento]} numberOfLines={1}>
          {p.fornitore || 'Fornitore senza nome'}
        </Text>
        <Text style={[stili.importo, scartato && stili.testoSpento]}>
          {/* NULL non è zero: è «non ha ancora risposto». Scriverlo «€ 0»
              farebbe credere che ci costi niente. */}
          {p.importo == null ? 'in attesa' : euro(p.importo)}
        </Text>
      </View>
      <View style={stili.prevMeta}>
        <StatusBadge
          small
          label={LABEL_STATO_PREVENTIVO[p.stato]}
          colore={COLORE_STATO_PREVENTIVO[p.stato] ?? colors.grigio}
        />
        {evidenzia ? <Text style={stili.piuBasso}>il più basso</Text> : null}
        {/* Da dove viene il numero: scritto a mano o letto dalla mail del
            fornitore. Un importo senza provenienza è un numero di cui non ci
            si fida (stessa regola della schermata Preventivi). */}
        {p.origine === 'mail' ? <Text style={stili.meta}>da mail</Text> : null}
        {p.tempi ? <Text style={stili.meta} numberOfLines={1}>{p.tempi}</Text> : null}
        {quando ? <Text style={stili.meta}>{quando}</Text> : null}
      </View>
    </View>
  );
}

const stili = StyleSheet.create({
  // — riassunto compatto (tabella) —
  // stretch, non solo flex-end: dentro una colonna a larghezza fissa il testo
  // deve poter usare tutta la riga prima di troncare.
  compatto: { alignSelf: 'stretch' },
  costo: {
    textAlign: 'right',
    color: colors.testo,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  costoScelto: { color: colors.successo },
  compattoNota: { textAlign: 'right', color: colors.grigio, fontSize: 11, marginTop: 1 },

  // — riassunto a riga (scheda mobile) —
  riga: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rigaTxt: { color: colors.testoSoft, fontSize: 12.5, flexShrink: 1 },

  // — elenco (scheda della trattativa) —
  blocco: { gap: 6 },
  prev: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.m,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
  },
  prevMigliore: { borderColor: colors.successo },
  prevScartato: { backgroundColor: colors.sfondo },
  testoSpento: { color: colors.grigio, textDecorationLine: 'line-through' },
  prevTesta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fornitore: { flex: 1, minWidth: 0, color: colors.navy, fontWeight: '700', fontSize: 13.5 },
  importo: { color: colors.testo, fontWeight: '700', fontSize: 13.5, fontVariant: ['tabular-nums'] },
  prevMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  piuBasso: { color: colors.successo, fontWeight: '700', fontSize: 11 },
  meta: { color: colors.grigio, fontSize: 11.5, flexShrink: 1 },
  piede: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  piedeTxt: { flex: 1, minWidth: 0, color: colors.testoSoft, fontSize: 12.5, lineHeight: 17 },
  link: { color: colors.navy, fontWeight: '700', fontSize: 12.5 },
  vuoto: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  vuotoTxt: { flex: 1, minWidth: 0, color: colors.grigio, fontSize: 12.5, lineHeight: 17 },
});
