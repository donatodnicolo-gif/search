// La casella di ricerca della Home: una sola, e cerca in tutta l'app.
//
// Sta in cima a «Oggi» perché è la prima domanda della giornata — «quel negozio
// come si chiamava?» — e prima bisognava indovinare in quale sezione andarlo a
// cercare (vedi lib/ricerca.ts).
//
// Tre accorgimenti che non si vedono ma si sentono:
//  1. **Attesa prima di partire**: si cerca dopo che si è smesso di digitare,
//     non a ogni lettera — se no sono nove query per carattere.
//  2. **Le risposte in ritardo si buttano**: una richiesta partita prima può
//     tornare dopo, e riscriverebbe i risultati con quelli di un testo che non
//     c'è più nella casella. Il contatore `giro` tiene solo l'ultima.
//  3. **Niente ricerca sotto i 2 caratteri**: con una lettera tornerebbe mezza
//     app, che è come non cercare.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { cercaOvunque, ICONA_TIPO_RIS, LABEL_TIPO_RIS, type Risultato, type TipoRisultato } from '@/lib/ricerca';

const ATTESA_MS = 250;

export function RicercaGlobale() {
  const router = useRouter();
  const [testo, setTesto] = useState('');
  const [risultati, setRisultati] = useState<Risultato[]>([]);
  const [cercando, setCercando] = useState(false);
  const [cercato, setCercato] = useState(false);
  const giro = useRef(0);

  useEffect(() => {
    const q = testo.trim();
    if (q.length < 2) {
      setRisultati([]);
      setCercando(false);
      setCercato(false);
      return;
    }
    setCercando(true);
    const mio = ++giro.current;
    const t = setTimeout(async () => {
      const r = await cercaOvunque(q).catch(() => [] as Risultato[]);
      // Risposta di un giro superato: si butta, se no riscrive i risultati con
      // quelli di un testo che nella casella non c'è più.
      if (mio !== giro.current) return;
      setRisultati(r);
      setCercato(true);
      setCercando(false);
    }, ATTESA_MS);
    return () => clearTimeout(t);
  }, [testo]);

  function apri(r: Risultato) {
    setTesto('');
    setRisultati([]);
    setCercato(false);
    router.push(r.rotta as never);
  }

  // Righe raggruppate per tipo, nell'ordine deciso da lib/ricerca.ts.
  const gruppi: { tipo: TipoRisultato; righe: Risultato[] }[] = [];
  for (const r of risultati) {
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.tipo === r.tipo) ultimo.righe.push(r);
    else gruppi.push({ tipo: r.tipo, righe: [r] });
  }

  return (
    <View style={styles.box}>
      <View style={styles.campo}>
        <Ionicons name="search" size={17} color={colors.grigio} />
        <TextInput
          style={styles.input}
          value={testo}
          onChangeText={setTesto}
          placeholder="Cerca ovunque: negozi, persone, trattative, ordini…"
          placeholderTextColor={colors.grigio}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Cerca in tutta l'app"
        />
        {cercando ? <ActivityIndicator size="small" color={colors.grigio} /> : null}
        {testo ? (
          <Pressable onPress={() => setTesto('')} hitSlop={8} accessibilityLabel="Cancella la ricerca">
            <Ionicons name="close-circle" size={18} color={colors.grigio} />
          </Pressable>
        ) : null}
      </View>

      {cercato && !risultati.length ? (
        <Text style={styles.vuoto}>
          Nessun risultato per «{testo.trim()}». Si cerca fra negozi, persone in rubrica, trattative, richieste web,
          ordini, task, pagamenti, script e sequenze.
        </Text>
      ) : null}

      {gruppi.length ? (
        <View style={styles.esiti}>
          {gruppi.map((g) => (
            <View key={g.tipo}>
              <Text style={styles.gruppo}>{LABEL_TIPO_RIS[g.tipo]}</Text>
              {g.righe.map((r) => (
                <Pressable key={`${r.tipo}-${r.id}`} style={styles.riga} onPress={() => apri(r)}>
                  <Ionicons name={ICONA_TIPO_RIS[r.tipo] as never} size={16} color={colors.testoSoft} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rigaTitolo} numberOfLines={2}>{r.titolo}</Text>
                    {r.sottotitolo ? (
                      <Text style={styles.rigaMeta} numberOfLines={1}>{r.sottotitolo}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={colors.grigio} />
                </Pressable>
              ))}
            </View>
          ))}
          {/* Il tetto è per fonte: dirlo evita di credere che non ci sia altro. */}
          <Text style={styles.nota}>Si mostrano i primi risultati per sezione. Affina il testo per restringere.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  input: { flex: 1, fontSize: 15, color: colors.testo, minWidth: 0 },
  vuoto: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  esiti: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
  },
  gruppo: {
    color: colors.testoSoft,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: colors.grigioChiaro,
  },
  rigaTitolo: { color: colors.testo, fontWeight: '700', fontSize: 14 },
  rigaMeta: { color: colors.testoSoft, fontSize: 12, marginTop: 1 },
  nota: { color: colors.grigio, fontSize: 11.5, marginTop: 8, paddingHorizontal: 4 },
});
