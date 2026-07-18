// Card "Anagrafica dal registro": legge LIVE dal registro Deluxy Anagrafiche
// (fonte di verità) i dati del negozio — stato, interessi (tipologia autorevole),
// referenti — invece di dedurli dalla copia locale.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StatoAffiliazione } from '@/types';
import { coloreAffiliazione, colors, labelAffiliazione, radius, spacing } from '@/lib/theme';
import { cercaAnagrafica, type PartnerRegistro } from '@/lib/anagrafiche';

// Etichette leggibili per gli "interessi" del registro (la tipologia autorevole).
const LABEL_INTERESSE: Record<string, string> = {
  consegne: 'Consegne',
  affiliazione: 'Affiliazione',
  gifting: 'Gifting',
  catering: 'Catering',
  eventi: 'Eventi',
  pr_activation: 'PR / Activation',
  in_store: 'In-store',
  vendor: 'Vendor',
};

export function AnagraficaRegistroCard({ nome, citta }: { nome: string; citta?: string | null }) {
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<PartnerRegistro | null>(null);
  const [esatto, setEsatto] = useState(false);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setErrore(false);
    cercaAnagrafica(nome, citta)
      .then((r) => {
        if (!vivo) return;
        setPartner(r.partner);
        setEsatto(r.esatto);
      })
      .catch(() => vivo && setErrore(true))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [nome, citta]);

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.titolo}>Anagrafica dal registro</Text>
          <ActivityIndicator size="small" color={colors.oro} />
        </View>
      </View>
    );
  }
  if (errore || !partner) {
    return (
      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.titolo}>Anagrafica dal registro</Text>
        </View>
        <Text style={styles.vuoto}>{errore ? 'Registro non raggiungibile.' : 'Non presente nel registro Anagrafiche.'}</Text>
      </View>
    );
  }

  const stato = partner.stato as StatoAffiliazione | null;
  const colore = stato ? coloreAffiliazione[stato] ?? colors.grigio : colors.grigio;
  const contatti = (partner.contatti ?? []).filter((c) => c.nome || c.telefono || c.email);

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.titolo}>Anagrafica dal registro</Text>
        {!esatto ? <Text style={styles.probabile}>corrispondenza probabile</Text> : null}
      </View>

      <View style={styles.metaRow}>
        {stato ? (
          <View style={styles.badge}>
            <View style={[styles.dot, { backgroundColor: colore }]} />
            <Text style={[styles.badgeTxt, { color: colore }]}>{labelAffiliazione[stato] ?? stato}</Text>
          </View>
        ) : null}
        {partner.categoria ? <Text style={styles.categoria}>{partner.categoria}</Text> : null}
        {partner.account ? <Text style={styles.account}>· {partner.account}</Text> : null}
      </View>

      {/* Interessi = tipologia di interesse autorevole (dal registro) */}
      {partner.interessi?.length ? (
        <View style={styles.chipRow}>
          {partner.interessi.map((i) => (
            <View key={i} style={styles.chip}>
              <Text style={styles.chipTxt}>{LABEL_INTERESSE[i] ?? i}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.notaInteressi}>Interessi non ancora indicati nel registro.</Text>
      )}

      {partner.telefono || partner.email ? (
        <View style={styles.recapiti}>
          {partner.telefono ? (
            <Text style={styles.recapito}>
              <Ionicons name="call-outline" size={12} color={colors.testoSoft} /> {partner.telefono}
            </Text>
          ) : null}
          {partner.email ? (
            <Text style={styles.recapito} numberOfLines={1}>
              <Ionicons name="mail-outline" size={12} color={colors.testoSoft} /> {partner.email}
            </Text>
          ) : null}
        </View>
      ) : null}

      {contatti.length ? (
        <View style={styles.contatti}>
          {contatti.slice(0, 4).map((c, i) => (
            <Text key={i} style={styles.contattoRiga} numberOfLines={1}>
              • {c.nome ?? 'Referente'}
              {c.ruolo ? ` (${c.ruolo})` : ''}
              {c.telefono ? ` · ${c.telefono}` : ''}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: 8,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titolo: { fontSize: 12, fontWeight: '800', color: colors.oro, letterSpacing: 0.6, textTransform: 'uppercase' },
  probabile: { fontSize: 11, color: colors.grigio, fontStyle: 'italic' },
  vuoto: { color: colors.grigio, fontStyle: 'italic', fontSize: 13 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.sfondo, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeTxt: { fontWeight: '800', fontSize: 12 },
  categoria: { color: colors.testoSoft, fontWeight: '700', fontSize: 12 },
  account: { color: colors.grigio, fontSize: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  chipTxt: { color: colors.goldStrong, fontWeight: '800', fontSize: 12 },
  notaInteressi: { color: colors.grigio, fontSize: 12, fontStyle: 'italic' },
  recapiti: { gap: 2 },
  recapito: { color: colors.testoSoft, fontSize: 13 },
  contatti: { gap: 2, borderTopWidth: 1, borderTopColor: colors.grigioChiaro, paddingTop: 6 },
  contattoRiga: { color: colors.testo, fontSize: 13 },
});
