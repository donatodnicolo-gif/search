// Sezione "Mail" nella scheda cliente: le ultime mail ricevute dai contatti del
// negozio, lette da AI Mail (deluxy-mail) via la Edge Function proxy `mail`.
// Si mostra solo se il negozio ha almeno un contatto con email e ci sono mail.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { mailDaContatto, type MailMessaggio } from '@/lib/mail';

const dataBreve = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return '';
  }
};

export function MailContattoCard({ emails }: { emails: string[] }) {
  const distinte = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, 3);
  const chiave = distinte.join(',');
  const [stato, setStato] = useState<'loading' | 'ok' | 'vuoto'>('loading');
  const [msg, setMsg] = useState<MailMessaggio[]>([]);

  useEffect(() => {
    if (!distinte.length) return; // nessun contatto con email da controllare
    let vivo = true;
    setStato('loading');
    Promise.all(distinte.map((e) => mailDaContatto(e, 10)))
      .then((liste) => {
        if (!vivo) return;
        const tutte = liste.flat();
        const perId = new Map(tutte.map((m) => [m.id, m]));
        const ordinate = [...perId.values()].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 10);
        setMsg(ordinate);
        setStato(ordinate.length ? 'ok' : 'vuoto');
      })
      .catch(() => vivo && setStato('vuoto'));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave]);

  // Nessun contatto con email: la sezione non compare affatto.
  if (!distinte.length) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="mail-outline" size={16} color={colors.goldStrong} />
        <Text style={styles.titolo}>Mail{msg.length ? ` · ${msg.length}` : ''}</Text>
      </View>
      {stato === 'loading' ? (
        <ActivityIndicator color={colors.testoSoft} size="small" style={{ alignSelf: 'flex-start', marginTop: 4 }} />
      ) : stato === 'vuoto' ? (
        <Text style={styles.vuoto}>Nessuna conversazione recente con questo contatto (controllato anche sul server di posta).</Text>
      ) : (
        msg.map((m) => (
          <Pressable
            key={m.id}
            style={styles.riga}
            onPress={() => Linking.openURL(`https://deluxy-mail.vercel.app/messaggio/${m.id}`)}
          >
            <View style={styles.rigaHead}>
              <Text style={styles.mittente} numberOfLines={1}>{m.da}</Text>
              <Text style={styles.data}>{dataBreve(m.data)}</Text>
            </View>
            <Text style={[styles.oggetto, !m.letto && styles.nonLetto]} numberOfLines={1}>
              {m.allegati ? '📎 ' : ''}{m.oggetto || '(senza oggetto)'}
            </Text>
            {m.anteprima ? <Text style={styles.anteprima} numberOfLines={1}>{m.anteprima}</Text> : null}
          </Pressable>
        ))
      )}
      {stato === 'ok' ? <Text style={styles.nota}>Ultime mail ricevute · da AI Mail.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bianco, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.grigioChiaro, padding: spacing.md, gap: 8, marginTop: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titolo: { color: colors.testo, fontWeight: '700', fontSize: 15, letterSpacing: -0.2 },
  riga: { borderTopWidth: 1, borderTopColor: colors.grigioChiaro, paddingTop: 8, gap: 2 },
  rigaHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  mittente: { flex: 1, color: colors.testo, fontWeight: '700', fontSize: 13 },
  data: { color: colors.grigio, fontSize: 12 },
  oggetto: { color: colors.testoSoft, fontSize: 13.5 },
  nonLetto: { color: colors.testo, fontWeight: '800' },
  anteprima: { color: colors.grigio, fontSize: 12.5 },
  nota: { color: colors.grigio, fontSize: 11, fontStyle: 'italic' },
  vuoto: { color: colors.grigio, fontSize: 13, fontStyle: 'italic' },
});
