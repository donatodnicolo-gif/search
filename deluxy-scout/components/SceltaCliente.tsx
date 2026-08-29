// CAMBIA IL CLIENTE DI UN ORDINE — cioè il NEGOZIO a cui l'ordine è legato.
//
// Richiesta dell'utente (28/08/2026): «dai possibilità di cercare un altro
// cliente». Fino a qui il negozio collegato era immutabile dalla scheda
// dell'ordine («si cambia dalla sua scheda, non da qui»): giusto per il NOME —
// che appartiene al negozio — ma sbagliato per il LEGAME, perché un ordine
// attaccato al cliente sbagliato non si corregge da nessuna parte.
//
// ⚠️ **SI CERCA IN DUE POSTI, e serve.** Prima fra i negozi di Scout, poi nel
// registro **Anagrafiche** — che è la casa delle aziende (Standard §7) e ne
// contiene molte che in Scout non sono mai entrate. Cercare solo in Scout
// rispondeva «Nessun negozio con questo nome» a un cliente che esiste
// eccome: segnalato dall'utente il 28/08/2026 su «Vivo Concerti», che nel
// registro c'è (Milano, attivo) e fra i negozi di Scout no.
//
// ⚠️ **Scegliere dal registro FA NASCERE il negozio in Scout** (`importaDalRegistro`,
// idempotente sull'id del registro) e poi lo collega: l'ordine punta a una riga
// di `places`, e senza quella riga il legame non esisterebbe. Non è una copia
// dei dati altrui — è un riferimento con l'id del registro dentro, come per
// tutti gli altri 1.053 negozi già agganciati.
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
import { allineaNomeDalRegistro, cercaNegozi, importaDalRegistro, type NegozioTrovato } from '@/lib/db';
import { cercaNelRegistro, type PartnerRegistro } from '@/lib/anagrafiche';
import { geocodeIndirizzo } from '@/lib/geocode';

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
  /** Le aziende del registro che in Scout non ci sono ancora. */
  const [dalRegistro, setDalRegistro] = useState<PartnerRegistro[]>([]);
  /** placeId → nome NUOVO nel registro, quando i due divergono (28/08/2026,
   *  segnalazione dell'utente: HAVI rinominata HAVI LOGISTICS nel registro,
   *  e qui si continuava a vedere la copia vecchia). */
  const [rinominati, setRinominati] = useState<Map<string, string>>(new Map());
  const [cercando, setCercando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  /** Chi si sta importando adesso: l'attesa va mostrata, l'import fa due
   *  chiamate di rete e un secondo di silenzio sembra un tocco non registrato. */
  const [importando, setImportando] = useState<string | null>(null);
  // La ricerca in corso: quella vecchia che torna dopo la nuova non deve
  // sovrascriverla — è il modo in cui una lista mostra i risultati di due
  // lettere fa.
  const ultima = useRef(0);

  useEffect(() => {
    if (!aperto) return;
    const testo = q.trim();
    if (testo.length < 2) {
      setTrovati([]);
      setDalRegistro([]);
      setCercando(false);
      return;
    }
    setCercando(true);
    // Un fiato di attesa: senza, si chiama il database a ogni lettera.
    const mio = ++ultima.current;
    const t = setTimeout(() => {
      // ⚠️ Le due ricerche partono INSIEME e nessuna delle due può far cadere
      // l'altra: se il registro non risponde si devono vedere lo stesso i
      // negozi di Scout, e viceversa. Per questo l'errore del registro si
      // mostra come nota, non come fallimento della ricerca.
      Promise.allSettled([cercaNegozi(testo, 8), cercaNelRegistro(testo, 8)])
        .then(([negozi, registro]) => {
          if (mio !== ultima.current) return;
          const inScout = negozi.status === 'fulfilled' ? negozi.value : [];
          setTrovati(inScout);
          // ⚠️ Il nome del REGISTRO vince: places.nome è una copia fatta
          // all'import, e un'azienda rinominata di là qui restava col nome
          // vecchio. Dove l'id coincide e i nomi no, si mostra quello nuovo —
          // e sceglierla lo scrive anche sul negozio.
          const regPerId = new Map(
            (registro.status === 'fulfilled' ? registro.value : []).map((r) => [r.id, r]),
          );
          const nuovi = new Map<string, string>();
          for (const n of inScout) {
            const r = n.anagrafiche_id ? regPerId.get(n.anagrafiche_id) : undefined;
            if (r && r.nome && r.nome !== n.nome) nuovi.set(n.id, r.nome);
          }
          setRinominati(nuovi);
          const giaPresi = new Set(inScout.map((n) => n.anagrafiche_id).filter(Boolean) as string[]);
          setDalRegistro(
            registro.status === 'fulfilled'
              ? registro.value.filter((r) => !giaPresi.has(r.id))
              : [],
          );
          // ⚠️ L'errore si DICE. Una lista vuota dopo una ricerca fallita
          // sembra «non esiste», ed è la bugia più comoda.
          setErrore(
            negozi.status === 'rejected'
              ? String((negozi.reason as Error)?.message ?? negozi.reason)
              : registro.status === 'rejected'
                ? `il registro Anagrafiche non risponde (${String((registro.reason as Error)?.message ?? registro.reason).slice(0, 120)}): qui sotto ci sono solo i negozi già in Scout`
                : null,
          );
        })
        .finally(() => {
          if (mio === ultima.current) setCercando(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [q, aperto]);

  /**
   * Prende un'azienda dal registro e la fa esistere in Scout, poi la collega.
   *
   * ⚠️ La posizione è BEST EFFORT: se il geocoder non risponde si scrive 0/0 e
   * il negozio nasce comunque. Meglio un negozio senza puntina che un ordine
   * che non si riesce ad attribuire — la stessa scelta già fatta in Fornitori.
   */
  async function importa(r: PartnerRegistro) {
    if (importando) return;
    setImportando(r.id);
    try {
      let lat = 0;
      let lng = 0;
      try {
        const g = await geocodeIndirizzo(r.indirizzo || r.citta || r.nome);
        lat = g.lat;
        lng = g.lng;
      } catch {
        // vedi sopra: la posizione non vale l'ordine
      }
      const place = await importaDalRegistro({
        anagraficheId: r.id,
        nome: r.nome,
        indirizzo: r.indirizzo,
        citta: r.citta,
        categoria: r.categoria,
        lat,
        lng,
        linee: r.interessi ?? [],
      });
      onScegli({ nome: place.nome, placeId: place.id, anagraficheId: r.id });
      setAperto(false);
      setQ('');
      setTrovati([]);
      setDalRegistro([]);
    } catch (e) {
      setErrore(String((e as Error)?.message ?? e));
    } finally {
      setImportando(null);
    }
  }

  function scegli(n: NegozioTrovato) {
    const nomeRegistro = rinominati.get(n.id);
    // Se il registro ha un nome più fresco, vince — sull'ordine E sul negozio.
    // L'allineamento del negozio è best effort: l'ordine ha già il nome giusto.
    if (nomeRegistro) void allineaNomeDalRegistro(n.id, nomeRegistro);
    onScegli({ nome: nomeRegistro ?? n.nome, placeId: n.id, anagraficheId: n.anagrafiche_id });
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
      {!cercando && q.trim().length >= 2 && !trovati.length && !dalRegistro.length ? (
        <Text style={styles.vuoto}>Non c'è né fra i negozi di Scout né nel registro Anagrafiche.</Text>
      ) : null}
      {trovati.length ? <Text style={styles.gruppo}>Negozi di Scout</Text> : null}
      {trovati.map((n) => (
        <Pressable key={n.id} style={styles.riga} onPress={() => scegli(n)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rigaNome} numberOfLines={1}>{rinominati.get(n.id) ?? n.nome}</Text>
            {rinominati.get(n.id) ? (
              // ⚠️ Si DICE cos'è successo: un nome diverso da quello che si è
              // appena cercato, senza spiegazione, sembra il negozio sbagliato.
              <Text style={styles.rigaMeta} numberOfLines={1}>
                in Scout era «{n.nome}» — rinominato nel registro; scegliendolo si aggiorna
              </Text>
            ) : null}
            {n.indirizzo || n.zona ? (
              <Text style={styles.rigaMeta} numberOfLines={1}>
                {[n.indirizzo, n.zona].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          {n.id === attuale.placeId ? (
            <Ionicons name="checkmark" size={16} color={colors.successo} />
          ) : null}
        </Pressable>
      ))}
      {dalRegistro.length ? (
        <>
          {/* ⚠️ Detto CHIARO che sono di un'altra app e che sceglierli li fa
              entrare in Scout: chi tocca deve sapere che sta creando qualcosa,
              non solo selezionando. */}
          <Text style={styles.gruppo}>Nel registro Anagrafiche — sceglierli li aggiunge a Scout</Text>
          {dalRegistro.map((r) => (
            <Pressable
              key={r.id}
              style={[styles.riga, importando === r.id && { opacity: 0.5 }]}
              disabled={!!importando}
              onPress={() => importa(r)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rigaNome} numberOfLines={1}>{r.nome}</Text>
                <Text style={styles.rigaMeta} numberOfLines={1}>
                  {[r.citta, r.categoria, r.stato].filter(Boolean).join(' · ') || 'nel registro'}
                </Text>
              </View>
              {importando === r.id ? (
                <ActivityIndicator />
              ) : (
                <Ionicons name="add-circle-outline" size={16} color={colors.navy} />
              )}
            </Pressable>
          ))}
        </>
      ) : null}
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
  gruppo: {
    color: colors.grigio,
    fontWeight: '700',
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 10,
  },
  rigaNome: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
  rigaMeta: { color: colors.grigio, fontSize: 11.5, marginTop: 1 },
  scollega: { color: colors.grigio, fontSize: 12.5, flex: 1 },
  vuoto: { color: colors.grigio, fontSize: 12.5, marginTop: 8 },
  errore: { color: colors.errore, fontSize: 12.5, marginTop: 8 },
});
