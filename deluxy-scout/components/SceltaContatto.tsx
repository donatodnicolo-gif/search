// COLLEGA UN CONTATTO A UN TASK — chi bisogna chiamare o scrivere.
//
// Richiesta dell'utente (28/08/2026): «consenti di collegare un contatto a una
// task».
//
// ⚠️ **Perché un riferimento e non il nome nel titolo.** «Sentire Marco» è un
// titolo: non dice quale Marco, non porta il suo numero, e fra un mese nessuno
// sa chi richiamare. Collegato il contatto, dal task si arriva al telefono e
// alla mail senza passare dalla rubrica.
//
// ⚠️ **Si cerca sul database**, e ogni riga porta il NEGOZIO della persona: due
// contatti possono chiamarsi uguale, e il nome da solo non li distingue.
//
// ⚠️ **Gli archiviati restano fuori** (`cercaContatti`): assegnarsi un
// promemoria per una persona che non lavora più lì è lavoro buttato.
//
// ⭐ **Quello che il contesto già sa non si chiede** (28/08/2026, segnalazione
// dell'utente con screenshot: «ma il contatto è già quello giusto»). Aprendo un
// task DAL negozio, la rubrica di quel negozio è già nota: farla cercare a mano
// è la [trappola-campo-ereditato-mostrato-vuoto] — un campo mostrato vuoto per
// un valore che l'app conosce. Qui valgono i tre regimi di quella regola:
//   · **un solo contatto** → si PRECOMPILA col valore vero, con la nota che
//     nomina la fonte («Il contatto del negozio»). L'errore è recuperabile: si
//     vede, e si toglie con la ×;
//   · **più contatti** → NON si sceglie per conto dell'utente (sarebbe un
//     valore inventato), ma si mostrano pronti da toccare: la ricerca resta,
//     non è più l'unica strada;
//   · **nessuno** → la ricerca di sempre, in tutta la rubrica.
//
// ⚠️ La proposta si fa **una volta sola** (`proposto`): se l'utente toglie il
// contatto con la ×, quello è un'affermazione — rimetterlo sarebbe discutere
// con chi sta usando l'app.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, touchMin } from '@/lib/theme';
import { cercaContatti, fetchContatti, type ContattoTrovato } from '@/lib/db';

export interface ContattoScelto {
  id: string;
  nome: string;
  ruolo?: string | null;
  telefono?: string | null;
  email?: string | null;
}

export function SceltaContatto({
  scelto,
  onScegli,
  placeId,
}: {
  scelto: ContattoScelto | null;
  onScegli: (c: ContattoScelto | null) => void;
  /** Il negozio da cui nasce il task: la sua rubrica è già nota, e si usa. */
  placeId?: string;
}) {
  const [aperto, setAperto] = useState(false);
  const [q, setQ] = useState('');
  const [trovati, setTrovati] = useState<ContattoTrovato[]>([]);
  const [cercando, setCercando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  /** I contatti DI QUESTO negozio: le scelte pronte, quando sono più d'una. */
  const [delNegozio, setDelNegozio] = useState<ContattoScelto[]>([]);
  /** true = il contatto mostrato l'abbiamo proposto noi, e va detto da dove viene. */
  const [proposta, setProposta] = useState(false);
  // La ricerca vecchia che torna dopo la nuova non deve sovrascriverla.
  const ultima = useRef(0);
  // La proposta si fa una volta sola: togliere il contatto è una scelta.
  const proposto = useRef(false);

  useEffect(() => {
    if (!placeId || proposto.current) return;
    proposto.current = true;
    fetchContatti(placeId)
      .then((cs) => {
        const vivi = cs
          .filter((c) => !c.archiviato)
          .map((c) => ({ id: c.id, nome: c.nome, ruolo: c.ruolo, telefono: c.telefono, email: c.email }));
        setDelNegozio(vivi);
        // Uno solo: è certo, si precompila. Più d'uno: sceglie l'utente fra
        // quelli pronti — indovinare quale sarebbe scrivere un dato inventato.
        if (!scelto && vivi.length === 1) {
          onScegli(vivi[0]);
          setProposta(true);
        }
      })
      // Best-effort: se la rubrica del negozio non arriva resta la ricerca,
      // che è la strada di prima. Un errore qui non deve bloccare il task.
      .catch(() => setDelNegozio([]));
    // Volutamente al montaggio: `scelto` qui è il valore iniziale (in modifica
    // arriva dal task, e non si tocca).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  useEffect(() => {
    if (!aperto) return;
    const testo = q.trim();
    if (testo.length < 2) {
      setTrovati([]);
      setCercando(false);
      return;
    }
    setCercando(true);
    const mio = ++ultima.current;
    // Un fiato di attesa: senza, si chiama il database a ogni lettera.
    const t = setTimeout(() => {
      cercaContatti(testo, 8)
        .then((r) => {
          if (mio !== ultima.current) return;
          setTrovati(r);
          setErrore(null);
        })
        .catch((e) => {
          if (mio !== ultima.current) return;
          setTrovati([]);
          // ⚠️ L'errore si DICE: una lista vuota dopo una ricerca fallita
          // sembra «non esiste», ed è la bugia più comoda.
          setErrore(String((e as Error)?.message ?? e));
        })
        .finally(() => {
          if (mio === ultima.current) setCercando(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [q, aperto]);

  if (!aperto) {
    if (scelto) {
      return (
        <View style={{ gap: 4 }}>
          <View style={styles.sceltoRiga}>
            <Ionicons name="person-outline" size={14} color={colors.testoSoft} />
            <View style={{ flex: 1 }}>
              <Text style={styles.sceltoNome} numberOfLines={1}>
                {scelto.nome}
                {scelto.ruolo ? <Text style={styles.sceltoRuolo}> · {scelto.ruolo}</Text> : null}
              </Text>
              {scelto.telefono || scelto.email ? (
                <Text style={styles.sceltoMeta} numberOfLines={1}>
                  {[scelto.telefono, scelto.email].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            <Pressable hitSlop={8} onPress={() => setAperto(true)} accessibilityLabel="Cambia il contatto">
              <Ionicons name="search-outline" size={16} color={colors.navy} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => {
                onScegli(null);
                setProposta(false);
              }}
              accessibilityLabel="Togli il contatto"
            >
              <Ionicons name="close" size={16} color={colors.grigio} />
            </Pressable>
          </View>
          {/* La fonte si NOMINA: un campo che si riempie da solo, senza dire da
              dove viene, si scopre solo quando è già sbagliato. */}
          {proposta ? (
            <Text style={styles.fonte}>Il contatto del negozio — cambialo o toglilo se non è lui.</Text>
          ) : null}
        </View>
      );
    }
    // Più contatti sul negozio: pronti da toccare, senza sceglierne uno noi.
    if (delNegozio.length > 1) {
      return (
        <View style={{ gap: 4 }}>
          <Text style={styles.fonte}>Del negozio:</Text>
          <View style={styles.pronti}>
            {delNegozio.map((c) => (
              <Pressable
                key={c.id}
                style={styles.pronto}
                onPress={() => {
                  onScegli(c);
                  setProposta(false);
                }}
              >
                <Ionicons name="person-outline" size={13} color={colors.navy} />
                <Text style={styles.prontoTxt} numberOfLines={1}>
                  {c.nome}
                  {c.ruolo ? <Text style={styles.sceltoRuolo}> · {c.ruolo}</Text> : null}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.apri} onPress={() => setAperto(true)}>
            <Ionicons name="search-outline" size={14} color={colors.navy} />
            <Text style={styles.apriTxt}>Cerca un altro contatto</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <Pressable style={styles.apri} onPress={() => setAperto(true)}>
        <Ionicons name="person-add-outline" size={14} color={colors.navy} />
        <Text style={styles.apriTxt}>Collega un contatto</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.pannello}>
      <View style={styles.testa}>
        <Text style={styles.testaTxt}>Cerca in rubrica</Text>
        <Pressable hitSlop={8} onPress={() => { setAperto(false); setQ(''); }}>
          <Ionicons name="close" size={16} color={colors.grigio} />
        </Pressable>
      </View>
      <TextInput
        style={styles.campo}
        value={q}
        onChangeText={setQ}
        autoFocus
        placeholder="almeno due lettere"
        placeholderTextColor={colors.grigio}
      />
      {cercando ? <ActivityIndicator style={{ marginTop: spacing.sm }} /> : null}
      {errore ? <Text style={styles.errore}>La ricerca non è riuscita: {errore}</Text> : null}
      {!cercando && !errore && q.trim().length >= 2 && !trovati.length ? (
        <Text style={styles.vuoto}>Nessun contatto con questo nome.</Text>
      ) : null}
      {trovati.map((c) => (
        <Pressable
          key={c.id}
          style={styles.riga}
          onPress={() => {
            onScegli({ id: c.id, nome: c.nome, ruolo: c.ruolo, telefono: c.telefono, email: c.email });
            setAperto(false);
            setQ('');
            setTrovati([]);
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rigaNome} numberOfLines={1}>
              {c.nome}
              {c.ruolo ? <Text style={styles.sceltoRuolo}> · {c.ruolo}</Text> : null}
            </Text>
            <Text style={styles.rigaMeta} numberOfLines={1}>
              {[c.place_nome, c.telefono, c.email].filter(Boolean).join(' · ') || 'nessun recapito'}
            </Text>
          </View>
          {c.id === scelto?.id ? <Ionicons name="checkmark" size={16} color={colors.successo} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  apri: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
  },
  apriTxt: { color: colors.navy, fontWeight: '700', fontSize: 12.5 },
  sceltoRiga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
  },
  sceltoNome: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  sceltoRuolo: { color: colors.grigio, fontWeight: '600', fontSize: 12 },
  sceltoMeta: { color: colors.grigio, fontSize: 11.5, marginTop: 1 },
  pannello: {
    padding: spacing.sm,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.sfondo,
    gap: 2,
  },
  testa: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  testaTxt: { color: colors.navy, fontWeight: '700', fontSize: 12.5 },
  campo: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    backgroundColor: colors.bianco,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.testo,
    fontSize: 14,
    marginTop: 6,
  },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.grigioChiaro,
    minHeight: touchMin,
  },
  rigaNome: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  rigaMeta: { color: colors.grigio, fontSize: 11.5, marginTop: 1 },
  vuoto: { color: colors.grigio, fontSize: 12.5, marginTop: 8 },
  fonte: { color: colors.grigio, fontSize: 11.5, fontWeight: '600' },
  pronti: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pronto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
  },
  prontoTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5, flexShrink: 1 },
  errore: { color: colors.errore, fontSize: 12.5, marginTop: 8 },
});
