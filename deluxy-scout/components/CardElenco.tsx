import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * La scheda di un elenco: icona a sinistra, blocco di testo al centro, badge a
 * destra e le azioni in fondo.
 *
 * Nasce dalla scheda di **Clienti**: l'utente ha chiesto che Prospect e Clienti
 * abbiano lo stesso identico stile, e con due strutture separate sarebbero
 * tornati a divergere al primo ritocco. Il contenuto lo decide chi la usa, la
 * forma è qui.
 */
export function CardElenco({
  icona = 'storefront-outline',
  coloreIcona,
  titoloIcona,
  selezionabile,
  selezionato,
  nome,
  meta,
  account,
  tag,
  badge,
  extra,
  azioni,
  onPress,
}: {
  /** Icona nel riquadro oro a sinistra. */
  icona?: IconName;
  /**
   * Colore dell'icona quando deve dire qualcosa (il semaforo della visita, vedi
   * `lib/statoVisita.ts`). Senza, resta oro come sempre: il colore va usato
   * quando significa, non per decorare.
   */
  coloreIcona?: string;
  /** Cosa vuol dire quel colore, per chi ci passa sopra o usa il lettore. */
  titoloIcona?: string;
  /**
   * Modalità scelta multipla: al posto dell'icona compare la casella, e il tap
   * sulla scheda seleziona invece di aprire il dettaglio. Chi la usa deve
   * cambiare `onPress` di conseguenza — qui la scheda non decide da sola.
   */
  selezionabile?: boolean;
  selezionato?: boolean;
  /** Nome del negozio/cliente: mai troncato oltre le 3 righe. */
  nome: string;
  /** Riga secondaria (zona · categoria, oppure indirizzo). */
  meta?: string | null;
  /** Riga "Account: …" con l'icona valigetta. */
  account?: string | null;
  /** Etichette color oro sotto il testo (linee di interesse). */
  tag?: string[];
  /** Badge di stato, incolonnati a destra. */
  badge?: ReactNode;
  /** Righe libere sotto il blocco principale (es. "Inserito il…"). */
  extra?: ReactNode;
  /** Cerchietti delle azioni, in fondo (vedi AzioniRiga). */
  azioni?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={[styles.card, selezionabile && selezionato && styles.cardScelta]}
      onPress={onPress}
      accessibilityState={selezionabile ? { selected: Boolean(selezionato) } : undefined}
    >
      <View style={styles.cardTop}>
        {selezionabile ? (
          // La casella prende il posto dell'icona invece di aggiungersi: su una
          // riga già piena di badge e bottoni, un elemento in più stringerebbe
          // il nome — che è la cosa che deve restare leggibile.
          <View style={[styles.iconaBox, styles.casella, selezionato && styles.casellaOn]}>
            <Ionicons
              name={selezionato ? 'checkmark' : 'square-outline'}
              size={selezionato ? 22 : 20}
              color={selezionato ? colors.bianco : colors.grigio}
            />
          </View>
        ) : (
          <View
            style={[styles.iconaBox, coloreIcona ? { backgroundColor: coloreIcona + '1A', borderColor: coloreIcona + '40' } : null]}
            accessibilityLabel={titoloIcona}
            // Sul web il titolo compare come tooltip: il colore da solo non basta
            // a dire cosa significa (e non tutti lo distinguono).
            {...(titoloIcona ? { title: titoloIcona } : {})}
          >
            <Ionicons name={icona} size={20} color={coloreIcona ?? colors.goldStrong} />
          </View>
        )}
        <View style={styles.cardTesto}>
          <Text numberOfLines={3} style={styles.nome}>
            {nome}
          </Text>
          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {account !== undefined ? (
            <Text style={styles.account} numberOfLines={1}>
              <Ionicons name="briefcase-outline" size={11} color={colors.grigio} />{' '}
              {account ? `Account: ${account}` : 'Account non assegnato'}
            </Text>
          ) : null}
          {tag?.length ? (
            <View style={styles.lineeRow}>
              {tag.slice(0, 3).map((t) => (
                <View key={t} style={styles.lineaTag}>
                  <Text style={styles.lineaTagTxt}>{t}</Text>
                </View>
              ))}
              {/* Oltre i tre la riga diventa illeggibile, ma **tacere** che ce
                  ne sono altri fa credere che siano tutti lì: si dice quanti. */}
              {tag.length > 3 ? <Text style={styles.lineaAltri}>+{tag.length - 3}</Text> : null}
            </View>
          ) : null}
        </View>
        {badge ? <View style={styles.badgeCol}>{badge}</View> : null}
      </View>
      {extra}
      {azioni}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
  },
  // Scelta multipla: bordo scuro e sfondo appena tinto. Non solo la casella —
  // scorrendo un elenco lungo si deve capire cos'è dentro senza rileggere ogni
  // singola riga.
  cardScelta: { borderColor: colors.ink, backgroundColor: colors.fill },
  casella: { backgroundColor: colors.bianco, borderColor: colors.grigioChiaro },
  casellaOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // minWidth: 0 serve perche' un figlio flex non scenda sotto il suo contenuto
  // e schiacci il nome del negozio.
  cardTesto: { flex: 1, minWidth: 0 },
  iconaBox: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.goldSoft,
    // Trasparente di default: c'è solo quando il riquadro prende un colore che
    // significa qualcosa (semaforo della visita).
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  meta: { color: colors.testoSoft, fontSize: 13, marginTop: 1 },
  account: { color: colors.grigio, fontSize: 12, marginTop: 2 },
  lineeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  lineaTag: { backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  lineaTagTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 11 },
  lineaAltri: { color: colors.testoSoft, fontWeight: '700', fontSize: 11, alignSelf: 'center' },
  badgeCol: { alignItems: 'flex-end', gap: 4 },
});
