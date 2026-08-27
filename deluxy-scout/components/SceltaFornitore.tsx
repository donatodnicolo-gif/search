// SCELTA DEL FORNITORE dal registro Anagrafiche.
//
// ⚠️ Il nome non è un'identità: «Rossi Fiori» scritto in due modi sono due
// fornitori diversi per chiunque provi a contare quanto spendiamo da lui. Qui
// si sceglie dal registro — che è la casa delle aziende — e si tiene il suo id.
//
// ⚠️ Si parte dai FORNITORI (chi ha già lavorato per noi). Se lì non c'è, si
// cerca in TUTTO il registro: un fornitore nuovo esiste prima di essere marcato
// tale, e obbligare a marcarlo prima vorrebbe dire non poterlo scrivere oggi.
// In ultima istanza si accetta un nome libero — ma è detto a schermo che così
// non si tiene il legame col registro.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { cercaNelRegistro, fetchFornitori, type PartnerRegistro } from '@/lib/anagrafiche';

export interface FornitoreScelto {
  nome: string;
  anagraficheId: string | null;
  email: string | null;
}

export function SceltaFornitore({
  valore,
  onScegli,
  autoFocus,
}: {
  valore: FornitoreScelto | null;
  onScegli: (f: FornitoreScelto | null) => void;
  autoFocus?: boolean;
}) {
  const [elenco, setElenco] = useState<PartnerRegistro[]>([]);
  const [carico, setCarico] = useState(true);
  const [q, setQ] = useState('');
  const [altri, setAltri] = useState<PartnerRegistro[]>([]);
  const [cercando, setCercando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchFornitori()
      .then((r) => vivo && setElenco(r.partner))
      .catch(() => vivo && setElenco([]))
      .finally(() => vivo && setCarico(false));
    return () => {
      vivo = false;
    };
  }, []);

  const trovati = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return elenco.slice(0, 6);
    return elenco
      .filter((p) => [p.nome, p.citta, p.categoria].filter(Boolean).some((v) => String(v).toLowerCase().includes(s)))
      .slice(0, 6);
  }, [elenco, q]);

  // Fra i fornitori non c'è: si guarda in tutto il registro, con un fiato di
  // attesa per non chiamare a ogni lettera.
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2 || trovati.length) {
      setAltri([]);
      return;
    }
    let vivo = true;
    setCercando(true);
    const t = setTimeout(() => {
      cercaNelRegistro(s, 6)
        .then((r) => vivo && setAltri(r))
        .catch(() => vivo && setAltri([]))
        .finally(() => vivo && setCercando(false));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
      setCercando(false);
    };
  }, [q, trovati.length]);

  if (valore) {
    return (
      <Pressable style={styles.scelto} onPress={() => onScegli(null)}>
        <Ionicons name="business-outline" size={16} color={colors.goldStrong} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sceltoNome} numberOfLines={1}>{valore.nome}</Text>
          <Text style={styles.aiuto} numberOfLines={1}>
            {valore.anagraficheId ? 'Dal registro Anagrafiche' : 'Nome scritto a mano: nessun legame col registro'}
          </Text>
        </View>
        <Ionicons name="swap-horizontal" size={18} color={colors.oro} />
      </Pressable>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <TextInput
        style={styles.input}
        value={q}
        onChangeText={setQ}
        autoFocus={autoFocus}
        placeholder={carico ? 'Carico i fornitori dal registro…' : 'Cerca il fornitore in Anagrafiche…'}
        placeholderTextColor={colors.grigio}
        autoCapitalize="none"
      />
      {carico ? <ActivityIndicator color={colors.navy} /> : null}

      {trovati.map((p) => (
        <Riga key={p.id} p={p} onScegli={onScegli} />
      ))}

      {!trovati.length && altri.length ? (
        <>
          <Text style={styles.aiuto}>Non è fra i fornitori, ma è nel registro:</Text>
          {altri.map((p) => (
            <Riga key={p.id} p={p} onScegli={onScegli} />
          ))}
        </>
      ) : null}

      {cercando ? <Text style={styles.aiuto}>Cerco in tutto il registro…</Text> : null}

      {/* L'ultima spiaggia, e si dice che cosa costa: un nome libero non si
          collega al registro, quindi domani non si somma con se stesso. */}
      {q.trim().length >= 2 && !trovati.length && !altri.length && !cercando ? (
        <Pressable
          style={styles.libero}
          onPress={() => onScegli({ nome: q.trim(), anagraficheId: null, email: null })}
        >
          <Ionicons name="create-outline" size={15} color={colors.testoSoft} />
          <Text style={styles.liberoTxt} numberOfLines={2}>
            Usa «{q.trim()}» come nome scritto a mano — non resterà collegato al registro
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Riga({ p, onScegli }: { p: PartnerRegistro; onScegli: (f: FornitoreScelto) => void }) {
  return (
    <Pressable
      style={styles.riga}
      onPress={() => onScegli({ nome: p.nome, anagraficheId: p.id, email: p.email ?? null })}
    >
      <Ionicons name="business-outline" size={15} color={colors.navy} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rigaNome} numberOfLines={1}>{p.nome}</Text>
        <Text style={styles.aiuto} numberOfLines={1}>
          {[p.citta, p.categoria].filter(Boolean).join(' · ') || 'Dal registro Anagrafiche'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14.5,
    color: colors.testo,
  },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
  },
  rigaNome: { color: colors.testo, fontSize: 14, fontWeight: '700' },
  scelto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.goldSoft,
    backgroundColor: colors.bianco,
  },
  sceltoNome: { color: colors.testo, fontSize: 14.5, fontWeight: '800' },
  aiuto: { color: colors.grigio, fontSize: 12, lineHeight: 16 },
  libero: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  liberoTxt: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 17, flex: 1 },
});
