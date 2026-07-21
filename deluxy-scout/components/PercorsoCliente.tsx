// Storyline visiva del percorso commerciale verso il cliente.
// Tappe: Target → Visitato → Trattativa → Cliente. "Perso" è un ramo terminale
// (mostrato in rosso, percorso spento). Lo stadio si ricava dallo stato del
// negozio + la presenza di una trattativa aperta.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StatoPlace } from '@/types';
import { colors, radius } from '@/lib/theme';

const TAPPE = ['Target', 'Visitato', 'Trattativa', 'Cliente'] as const;

/** Indice della tappa raggiunta (0..3) dato lo stato del negozio. */
export function tappaPercorso(stato: StatoPlace | null | undefined, inTrattativa: boolean): number {
  if (stato === 'cliente') return 3;
  if (inTrattativa) return 2;
  if (stato === 'visitato') return 1;
  return 0; // da_visitare / sconosciuto
}

export function PercorsoCliente({
  stato,
  inTrattativa,
  compatto,
}: {
  stato: StatoPlace | null | undefined;
  inTrattativa: boolean;
  compatto?: boolean;
}) {
  const perso = stato === 'perso';
  const corrente = tappaPercorso(stato, inTrattativa);
  const dot = compatto ? 12 : 16;

  if (perso) {
    return (
      <View style={styles.persoRow}>
        <Ionicons name="close-circle" size={dot} color={colors.errore} />
        <Text style={styles.persoTxt}>Percorso chiuso — Perso</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.row}>
        {TAPPE.map((t, i) => {
          const fatto = i < corrente; // tappa superata
          const attivo = i === corrente; // tappa attuale
          const cliente = attivo && i === 3;
          const coloreDot = cliente ? colors.successo : attivo ? colors.gold : fatto ? colors.ink : colors.grigioChiaro;
          return (
            <View key={t} style={styles.step}>
              <View style={styles.dotWrap}>
                {/* Linea di collegamento a sinistra (tranne la prima). */}
                {i > 0 ? <View style={[styles.linea, { backgroundColor: i <= corrente ? colors.ink : colors.grigioChiaro }]} /> : <View style={styles.lineaSpazio} />}
                <View
                  style={[
                    styles.dot,
                    { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: coloreDot },
                    attivo && styles.dotAttivo,
                  ]}
                >
                  {fatto ? <Ionicons name="checkmark" size={dot - 5} color={colors.bianco} /> : null}
                </View>
                {/* Linea a destra (tranne l'ultima). */}
                {i < TAPPE.length - 1 ? <View style={[styles.linea, { backgroundColor: i < corrente ? colors.ink : colors.grigioChiaro }]} /> : <View style={styles.lineaSpazio} />}
              </View>
              {!compatto ? (
                <Text style={[styles.label, attivo && styles.labelAttivo, fatto && styles.labelFatto]} numberOfLines={1}>
                  {t}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      {compatto ? (
        <Text style={styles.stadioTxt}>
          {corrente === 3 ? 'Cliente' : `In corso: ${TAPPE[corrente]}`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  step: { flex: 1, alignItems: 'center' },
  dotWrap: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' },
  linea: { flex: 1, height: 2, borderRadius: 1 },
  lineaSpazio: { flex: 1, height: 2 },
  dot: { alignItems: 'center', justifyContent: 'center' },
  dotAttivo: {
    borderWidth: 2,
    borderColor: colors.bianco,
    shadowColor: colors.gold,
    shadowOpacity: 0.5,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  label: { fontSize: 10.5, color: colors.grigio, marginTop: 4, fontWeight: '600' },
  labelAttivo: { color: colors.testo, fontWeight: '800' },
  labelFatto: { color: colors.testoSoft },
  stadioTxt: { fontSize: 11, color: colors.testoSoft, fontWeight: '700', marginTop: 4, alignSelf: 'center' },
  persoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${colors.errore}14`,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  persoTxt: { color: colors.errore, fontSize: 12, fontWeight: '700' },
});
