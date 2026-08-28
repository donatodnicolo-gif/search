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
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, touchMin } from '@/lib/theme';
import { cercaContatti, type ContattoTrovato } from '@/lib/db';

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
}: {
  scelto: ContattoScelto | null;
  onScegli: (c: ContattoScelto | null) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [q, setQ] = useState('');
  const [trovati, setTrovati] = useState<ContattoTrovato[]>([]);
  const [cercando, setCercando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // La ricerca vecchia che torna dopo la nuova non deve sovrascriverla.
  const ultima = useRef(0);

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
    return scelto ? (
      <View style={styles.sceltoRiga}>
        <Ionicons name="person-outline" size={14} color={colors.goldStrong} />
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
        <Pressable hitSlop={8} onPress={() => onScegli(null)} accessibilityLabel="Togli il contatto">
          <Ionicons name="close" size={16} color={colors.grigio} />
        </Pressable>
      </View>
    ) : (
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
          {c.id === scelto?.id ? <Ionicons name="checkmark" size={16} color={colors.goldStrong} /> : null}
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
  errore: { color: colors.errore, fontSize: 12.5, marginTop: 8 },
});
