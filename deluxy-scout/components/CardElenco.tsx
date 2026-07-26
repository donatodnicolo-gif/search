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
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={styles.iconaBox}>
          <Ionicons name={icona} size={20} color={colors.goldStrong} />
        </View>
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
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // minWidth: 0 serve perche' un figlio flex non scenda sotto il suo contenuto
  // e schiacci il nome del negozio.
  cardTesto: { flex: 1, minWidth: 0 },
  iconaBox: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  meta: { color: colors.testoSoft, fontSize: 13, marginTop: 1 },
  account: { color: colors.grigio, fontSize: 12, marginTop: 2 },
  lineeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  lineaTag: { backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  lineaTagTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 11 },
  badgeCol: { alignItems: 'flex-end', gap: 4 },
});
