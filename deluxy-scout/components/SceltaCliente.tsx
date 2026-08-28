// CAMBIA IL CLIENTE DI UN ORDINE — cioè il NEGOZIO a cui l'ordine è legato.
//
// Richiesta dell'utente (28/08/2026): «dai possibilità di cercare un altro
// cliente». Fino a qui il negozio collegato era immutabile dalla scheda
// dell'ordine («si cambia dalla sua scheda, non da qui»): giusto per il NOME —
// che appartiene al negozio — ma sbagliato per il LEGAME, perché un ordine
// attaccato al cliente sbagliato non si corregge da nessuna parte.
//
// ⚠️ **Si cerca sul database, non in memoria.** I negozi sono 1.813:
// scaricarli tutti per filtrarli a schermo vorrebbe dire tre pagine di dati a
// ogni apertura di un ordine, per mostrarne sei (Libro PERFORMANCE).
//
// ⚠️ **Scegliere un negozio riscrive anche il nome sull'ordine.** Lasciare il
// nome vecchio su un legame nuovo farebbe una riga che dice «Lemon and Pepper»
// e punta a un'altra azienda — ed è esattamente il tipo di riga che poi si
// legge per buona.
//
// ⚠️ **Si può anche NON avere un negozio**: gli ordini nati da una richiesta a
// voce esistono, e obbligare a un legame che non c'è farebbe scegliere il
// negozio più somigliante — cioè inventarlo.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, touchMin } from '@/lib/theme';
import { cercaNegozi, type NegozioTrovato } from '@/lib/db';

export interface ClienteScelto {
  /** Il nome come finisce sull'ordine. */
  nome: string;
  /** Il negozio di Scout a cui l'ordine è legato: null = solo un nome. */
  placeId: string | null;
  /** L'id nel registro Anagrafiche, se il negozio ce l'ha: serve al link. */
  anagraficheId: string | null;
}

export function SceltaCliente({
  attuale,
  onScegli,
}: {
  attuale: ClienteScelto;
  onScegli: (c: ClienteScelto) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [q, setQ] = useState('');
  const [trovati, setTrovati] = useState<NegozioTrovato[]>([]);
  const [cercando, setCercando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // La ricerca in corso: quella vecchia che torna dopo la nuova non deve
  // sovrascriverla — è il modo in cui una lista mostra i risultati di due
  // lettere fa.
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
    // Un fiato di attesa: senza, si chiama il database a ogni lettera.
    const mio = ++ultima.current;
    const t = setTimeout(() => {
      cercaNegozi(testo, 8)
        .then((r) => {
          if (mio !== ultima.current) return;
          setTrovati(r);
          setErrore(null);
        })
        .catch((e) => {
          if (mio !== ultima.current) return;
          setTrovati([]);
          // ⚠️ L'errore si DICE. Una lista vuota dopo una ricerca fallita
          // sembra «non esiste», ed è la bugia più comoda.
          setErrore(String((e as Error)?.message ?? e));
        })
        .finally(() => {
          if (mio === ultima.current) setCercando(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [q, aperto]);

  function scegli(n: NegozioTrovato) {
    onScegli({ nome: n.nome, placeId: n.id, anagraficheId: n.anagrafiche_id });
    setAperto(false);
    setQ('');
    setTrovati([]);
  }

  if (!aperto) {
    return (
      <Pressable style={styles.apri} onPress={() => setAperto(true)}>
        <Ionicons name="search-outline" size={14} color={colors.navy} />
        <Text style={styles.apriTxt}>
          {attuale.placeId ? 'Cerca un altro cliente' : 'Collega un negozio'}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.pannello}>
      <View style={styles.testa}>
        <Text style={styles.testaTxt}>Cerca il negozio per nome</Text>
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
        <Text style={styles.vuoto}>Nessun negozio con questo nome.</Text>
      ) : null}
      {trovati.map((n) => (
        <Pressable key={n.id} style={styles.riga} onPress={() => scegli(n)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rigaNome} numberOfLines={1}>{n.nome}</Text>
            {n.indirizzo || n.zona ? (
              <Text style={styles.rigaMeta} numberOfLines={1}>
                {[n.indirizzo, n.zona].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          {n.id === attuale.placeId ? (
            <Ionicons name="checkmark" size={16} color={colors.goldStrong} />
          ) : null}
        </Pressable>
      ))}
      {attuale.placeId ? (
        <Pressable
          style={styles.riga}
          onPress={() => {
            // Il nome resta: è quello che si legge sull'ordine, e cancellarlo
            // insieme al legame lascerebbe una riga senza cliente.
            onScegli({ nome: attuale.nome, placeId: null, anagraficheId: null });
            setAperto(false);
            setQ('');
          }}
        >
          <Text style={styles.scollega}>Nessun negozio — tieni solo il nome scritto sull'ordine</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  apri: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
    minHeight: touchMin - 8,
  },
  apriTxt: { color: colors.navy, fontWeight: '700', fontSize: 12.5 },
  pannello: {
    marginTop: 8,
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
  scollega: { color: colors.grigio, fontSize: 12.5, flex: 1 },
  vuoto: { color: colors.grigio, fontSize: 12.5, marginTop: 8 },
  errore: { color: colors.errore, fontSize: 12.5, marginTop: 8 },
});
