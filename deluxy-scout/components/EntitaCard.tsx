// L'ENTITÀ del cliente sulla scheda del negozio: tutte le società e le sedi
// che commercialmente sono lo stesso cliente.
//
// Richiesta dell'utente (28/08/2026): «mostrare il fatturato dell'ENTITÀ (tutte
// le società di quel cliente) accanto a quello del singolo negozio — perché
// CHANEL sono tre società che fatturano separatamente ma commercialmente sono
// un cliente solo».
//
// ⚠️⚠️ **IL TOTALE DELL'ENTITÀ NON SI MOSTRA FINCHÉ NON LO DÀ FINANCE**, e non
// è pigrizia: è il caso misurato che ha fatto nascere questo modello. CHANEL in
// FINANCE sono tre schede — MILANO 65.485 €, ROMA 52.600 €, FIRENZE 20.509 € =
// 138.595 € — ma nel registro il gruppo CHANEL oggi tiene **una sola sede**.
// Sommando quello che si riesce a leggere verrebbe 65.485 €: un numero che
// torna, con la faccia di uno giusto, **sbagliato del 38%**. Meglio dire «non
// disponibile» che dire una cifra falsa.
//
// Quando FINANCE esporrà `GET /api/v1/fatturato?gruppo=<id>` (con l'elenco di
// cosa NON ha contato), il totale entra qui e questa nota si toglie.
//
// ⚠️ Quello che si mostra invece è VERO e serve: di quali società e sedi è
// fatta l'entità secondo il registro. Se un negozio che dovrebbe esserci non
// c'è, si vede — ed è esattamente il modo in cui ci si accorge che il gruppo va
// completato in Anagrafiche.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { fetchEntitaDelNegozio, urlSchedaRegistro, type Entita } from '@/lib/anagrafiche';

export function EntitaCard({
  anagraficaId,
  nomeNegozio,
}: {
  anagraficaId: string | null | undefined;
  nomeNegozio: string;
}) {
  const [stato, setStato] = useState<'carico' | 'ok' | 'senza' | 'errore'>('carico');
  const [entita, setEntita] = useState<Entita | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    if (!anagraficaId) {
      setStato('senza');
      return;
    }
    let vivo = true;
    setStato('carico');
    fetchEntitaDelNegozio(anagraficaId)
      .then((e) => {
        if (!vivo) return;
        if (e) {
          setEntita(e);
          setStato('ok');
        } else {
          setStato('senza');
        }
      })
      .catch((err) => {
        if (!vivo) return;
        // ⚠️ L'errore si MOSTRA (Libro v1.10: nessun click muto). Una card che
        // sparisce quando il registro non risponde fa credere che il cliente
        // non abbia un'entità — e sono due fatti diversi.
        setErrore(String((err as Error)?.message ?? err));
        setStato('errore');
      });
    return () => {
      vivo = false;
    };
  }, [anagraficaId]);

  if (stato === 'carico') {
    return (
      <View style={styles.card}>
        <Intestazione />
        <ActivityIndicator color={colors.testoSoft} size="small" style={{ alignSelf: 'flex-start', marginTop: 6 }} />
      </View>
    );
  }

  if (stato === 'errore') {
    return (
      <View style={styles.card}>
        <Intestazione />
        <Text style={styles.errore}>Non sono riuscito a leggerla dal registro: {errore}</Text>
      </View>
    );
  }

  if (stato === 'senza') {
    return (
      <View style={styles.card}>
        <Intestazione />
        <Text style={styles.nota}>
          {anagraficaId
            ? `«${nomeNegozio}» non fa parte di nessuna entità: si assegna in Anagrafiche, alla sua società. Finché non c'è, il fatturato che si legge è solo il suo.`
            : 'Questo negozio non è collegato al registro Anagrafiche, quindi non si sa di quale cliente faccia parte.'}
        </Text>
      </View>
    );
  }

  const sedi = (entita?.societa ?? []).flatMap((s) => s.sedi);

  return (
    <View style={styles.card}>
      <Intestazione nome={entita?.nome} />

      {/* ⚠️ IL TOTALE NON C'È, E SI DICE PERCHÉ. Un posto vuoto dove dovrebbe
          esserci un numero fa pensare a un guasto; una frase che spiega fa
          capire cosa manca e a chi chiederlo. */}
      <View style={styles.totaleBox}>
        <Text style={styles.totaleLbl}>Fatturato dell&apos;entità</Text>
        <Text style={styles.totaleVal}>non disponibile</Text>
      </View>
      <Text style={styles.nota}>
        Il fatturato lo possiede FINANCE, che oggi lo dà per una scheda alla volta e non per l&apos;entità. Sommare
        qui quello che si riesce a leggere darebbe un numero credibile e sbagliato: nel caso CHANEL sarebbero 65.485 €
        invece di 138.595 €, perché una delle tre schede non è agganciata al registro.
      </Text>

      <Text style={styles.sezione}>
        {entita?.societa.length ?? 0} {entita?.societa.length === 1 ? 'società' : 'società'} · {sedi.length}{' '}
        {sedi.length === 1 ? 'sede' : 'sedi'} nel registro
      </Text>

      {(entita?.societa ?? []).map((s) => (
        <View key={s.id} style={styles.societa}>
          <Text style={styles.societaNome} numberOfLines={2}>
            {s.ragioneSociale}
          </Text>
          {s.pIva ? <Text style={styles.societaPiva}>P.IVA {s.pIva}</Text> : null}
          {s.sedi.map((x) => {
            const link = urlSchedaRegistro(x.id);
            return (
              <Pressable
                key={x.id}
                style={styles.sede}
                disabled={!link}
                onPress={() => link && Linking.openURL(link)}
                accessibilityLabel={`Apri ${x.nome} in Anagrafiche`}
              >
                <Ionicons name="storefront-outline" size={12} color={colors.grigio} />
                <Text style={styles.sedeNome} numberOfLines={1}>
                  {x.nome}
                  {x.citta ? <Text style={styles.sedeCitta}> · {x.citta}</Text> : null}
                </Text>
                {link ? <Ionicons name="open-outline" size={12} color={colors.navy} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Intestazione({ nome }: { nome?: string | null }) {
  return (
    <View style={styles.head}>
      <Ionicons name="business-outline" size={16} color={colors.goldStrong} />
      <Text style={styles.titolo}>Entità{nome ? ` · ${nome}` : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.lg,
    gap: 6,
    marginTop: spacing.lg,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titolo: { color: colors.testo, fontWeight: '800', fontSize: 14 },
  totaleBox: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  totaleLbl: { color: colors.grigio, fontSize: 12, fontWeight: '700' },
  totaleVal: { color: colors.grigio, fontSize: 14, fontWeight: '800' },
  nota: { color: colors.grigio, fontSize: 11.5, lineHeight: 16 },
  errore: { color: colors.errore, fontSize: 12, marginTop: 4 },
  sezione: {
    color: colors.grigio,
    fontSize: 10.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 8,
  },
  societa: { marginTop: 4, gap: 2 },
  societaNome: { color: colors.testo, fontWeight: '700', fontSize: 13 },
  societaPiva: { color: colors.grigio, fontSize: 11 },
  sede: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
  sedeNome: { color: colors.testo, fontSize: 12.5, flex: 1 },
  sedeCitta: { color: colors.grigio },
});
