// Sezione "Mail" nella scheda cliente: le ultime mail ricevute dai contatti del
// negozio, lette da AI Mail (deluxy-mail). Per essere veloce mostra SUBITO le mail
// locali (ultimi 30 giorni) e solo dopo interroga il server IMAP in background.
// Con "Carica altri 30 giorni" si estende la finestra a ritroso.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { mailDaContatto, type MailMessaggio } from '@/lib/mail';

const GIORNI = 30 * 24 * 60 * 60 * 1000;

const dataBreve = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return '';
  }
};

// Unione per id, ordinata dalla più recente.
function unisci(a: MailMessaggio[], b: MailMessaggio[]): MailMessaggio[] {
  const perId = new Map<string, MailMessaggio>();
  for (const m of [...a, ...b]) perId.set(m.id, m);
  return [...perId.values()].sort((x, y) => (x.data < y.data ? 1 : -1));
}

export function MailContattoCard({ emails }: { emails: string[] }) {
  const distinte = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, 3);
  const chiave = distinte.join(',');
  const [stato, setStato] = useState<'loading' | 'ok' | 'cerco-server' | 'vuoto'>('loading');
  const [msg, setMsg] = useState<MailMessaggio[]>([]);
  const [caricandoAltri, setCaricandoAltri] = useState(false);
  const finestraDa = useRef<number>(0); // ms: inizio della finestra più vecchia caricata

  // Carica una finestra [da, a] per tutti i contatti e unisce i risultati.
  async function caricaFinestra(da: number, a: number, server: boolean): Promise<MailMessaggio[]> {
    const liste = await Promise.all(
      distinte.map((e) => mailDaContatto(e, { da: new Date(da).toISOString(), a: new Date(a).toISOString(), server })),
    );
    return liste.flat();
  }

  useEffect(() => {
    if (!distinte.length) return;
    let vivo = true;
    setStato('loading');
    setMsg([]);
    const a = Date.now();
    const da = a - GIORNI;
    finestraDa.current = da;
    (async () => {
      // 1) Locale, subito.
      const locali = await caricaFinestra(da, a, false);
      if (!vivo) return;
      setMsg(unisci([], locali));
      setStato(locali.length ? 'ok' : 'cerco-server');
      // 2) Server IMAP, in background.
      const conServer = await caricaFinestra(da, a, true);
      if (!vivo) return;
      setMsg((prev) => {
        const tutte = unisci(prev, conServer);
        setStato(tutte.length ? 'ok' : 'vuoto');
        return tutte;
      });
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave]);

  // Estende la finestra di altri 30 giorni a ritroso (i più vecchi in coda).
  async function caricaAltri() {
    if (caricandoAltri) return;
    setCaricandoAltri(true);
    const a = finestraDa.current;
    const da = a - GIORNI;
    try {
      const piu = await caricaFinestra(da, a, false);
      setMsg((prev) => unisci(prev, piu));
      finestraDa.current = da;
    } finally {
      setCaricandoAltri(false);
    }
  }

  if (!distinte.length) return null; // nessun contatto con email da controllare

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="mail-outline" size={16} color={colors.goldStrong} />
        <Text style={styles.titolo}>Mail{msg.length ? ` · ${msg.length}` : ''}</Text>
      </View>

      {stato === 'loading' ? (
        <ActivityIndicator color={colors.testoSoft} size="small" style={{ alignSelf: 'flex-start', marginTop: 4 }} />
      ) : (
        <>
          {msg.map((m) => (
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
          ))}

          {/* Ancora vuoto ma sto controllando il server. */}
          {stato === 'cerco-server' && !msg.length ? (
            <View style={styles.serverRow}>
              <ActivityIndicator color={colors.testoSoft} size="small" />
              <Text style={styles.vuoto}>Controllo il server di posta…</Text>
            </View>
          ) : null}

          {/* Server controllato: davvero nessuna conversazione. */}
          {stato === 'vuoto' ? (
            <Text style={styles.vuoto}>Nessuna conversazione recente con questo contatto (controllato anche sul server di posta).</Text>
          ) : null}

          {/* Carica finestre più vecchie di 30 giorni (dopo la ricerca server). */}
          {stato === 'ok' || stato === 'vuoto' ? (
            <Pressable style={styles.btnAltri} onPress={caricaAltri} disabled={caricandoAltri}>
              {caricandoAltri ? (
                <ActivityIndicator color={colors.navy} size="small" />
              ) : (
                <Text style={styles.btnAltriTxt}>Carica altri 30 giorni</Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}

      {stato === 'ok' ? <Text style={styles.nota}>Da AI Mail · finestra estendibile a 30 giorni per volta.</Text> : null}
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
  serverRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  vuoto: { color: colors.grigio, fontSize: 13, fontStyle: 'italic' },
  btnAltri: { alignSelf: 'flex-start', marginTop: 4, borderWidth: 1.5, borderColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  btnAltriTxt: { color: colors.navy, fontWeight: '700', fontSize: 13 },
  nota: { color: colors.grigio, fontSize: 11, fontStyle: 'italic' },
});
