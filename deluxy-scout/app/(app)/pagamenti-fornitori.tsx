// Pagamenti FORNITORI: il verso opposto di «Pagamenti» (che è l'incasso dal
// cliente). Qui si chiede di PAGARE il fioraio/catering/allestitore di un
// evento o ordine Scout. Scout non paga: la richiesta parte verso DELUXY
// TRANSACTIONS (l'unica app da cui esce denaro), una persona autorizza di là,
// e l'esito — pagata, con che mezzo, quando — torna qui da solo.
//
// La lettura AI (incolla il messaggio del fornitore, o fotografalo) PROPONE i
// campi: chi salva è sempre la persona, dopo averli riletti.
//
// ⚠️ UI coi COMPONENTI DI CASA (allineata il 28/08 su richiesta utente, alla
// schermata sorella «Pagamenti»): Btn, Card, Chip, FAB a pillola CON etichetta
// (navy + shadow.float), etichette maiuscole sui campi come styles.label di
// pagamenti.tsx. Niente stili-fotocopia: se un pezzo manca, si aggiunge in
// components/ui, non qui.
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { Foglio } from '@/components/Foglio';
import { Btn, Card, Chip, EmptyState, PageIntro, RigaChips, StatusBadge } from '@/components/ui';
import { colors, radius, shadow, spacing, contenutoCentrato } from '@/lib/theme';
import { leggiImporto, scriviImporto } from '@/lib/importi';
import { avvisa } from '@/lib/dialoghi';
import {
  estraiPagamentoFornitore,
  fetchPagamentiFornitori,
  inserisciPagamentoFornitore,
  inviaPagamentoFornitore,
  METODI_FORNITORE,
  statoPagamentoFornitore,
  type RichiestaPagamentoFornitore,
} from '@/lib/pagamenti-fornitori';

const COLORE_STATO: Record<string, string> = {
  '': colors.grigio,
  in_attesa: colors.attenzione,
  sospesa: colors.attenzione,
  approvata: colors.blue,
  in_lotto: colors.blue,
  pagata: colors.successo,
  rifiutata: colors.errore,
  annullata: colors.grigio,
};

const LABEL_STATO: Record<string, string> = {
  '': 'da inviare',
  in_attesa: 'in attesa di firma',
  sospesa: 'sospesa',
  approvata: 'approvata',
  in_lotto: 'in distinta',
  pagata: 'pagata',
  rifiutata: 'rifiutata',
  annullata: 'annullata',
};

type Vista = 'aperte' | 'pagate' | 'tutte';

export default function PagamentiFornitori() {
  const [righe, setRighe] = useState<RichiestaPagamentoFornitore[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [vista, setVista] = useState<Vista>('aperte');
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [formAperto, setFormAperto] = useState(false);

  // ── modulo nuova richiesta ──
  const [beneficiario, setBeneficiario] = useState('');
  const [metodo, setMetodo] = useState('iban');
  const [iban, setIban] = useState('');
  const [rifPagamento, setRifPagamento] = useState('');
  const [importo, setImporto] = useState('');
  const [causale, setCausale] = useState('');
  const [note, setNote] = useState('');
  const [salvo, setSalvo] = useState(false);
  // ── lettura AI ──
  const [testoAi, setTestoAi] = useState('');
  const [fotoAi, setFotoAi] = useState<{ dati: string; tipo: string } | null>(null);
  const [leggo, setLeggo] = useState(false);
  const [esitoLettura, setEsitoLettura] = useState('');

  const carica = useCallback(async () => {
    try {
      setRighe(await fetchPagamentiFornitori());
    } catch (e: any) {
      avvisa('Pagamenti fornitori', `Non riesco a leggere l'elenco: ${e?.message ?? e}`);
    } finally {
      setCaricamento(false);
      setRefresh(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const filtrate = useMemo(() => {
    if (vista === 'tutte') return righe;
    if (vista === 'pagate') return righe.filter((r) => r.trx_stato === 'pagata');
    return righe.filter((r) => r.trx_stato !== 'pagata' && r.trx_stato !== 'annullata' && r.trx_stato !== 'rifiutata');
  }, [righe, vista]);

  async function scegliFoto() {
    const esito = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: true });
    const a = esito.assets?.[0];
    if (!a?.base64) return;
    setFotoAi({ dati: a.base64, tipo: a.mimeType ?? 'image/jpeg' });
  }

  async function leggiConAi() {
    setLeggo(true);
    setEsitoLettura('');
    try {
      const r = await estraiPagamentoFornitore({
        testo: testoAi.trim() || undefined,
        immagine: fotoAi ?? undefined,
      });
      if (r.dati.intestatario) setBeneficiario(r.dati.intestatario);
      if (r.dati.importo > 0) setImporto(scriviImporto(r.dati.importo));
      if (r.dati.iban) {
        setMetodo('iban');
        setIban(r.dati.iban);
      }
      if (r.dati.causale) setCausale(r.dati.causale);
      setEsitoLettura(
        r.dati.iban
          ? r.ibanValido
            ? `Letto con ${r.fornitore}: IBAN verificato (checksum ok). Rileggi prima di salvare.`
            : `⚠️ Letto con ${r.fornitore}, ma l'IBAN NON passa il checksum: ricontrollalo sull'originale.`
          : `Letto con ${r.fornitore}: nessun IBAN nel contenuto. Rileggi prima di salvare.`,
      );
    } catch (e: any) {
      setEsitoLettura(`Lettura non riuscita: ${e?.message ?? e}`);
    } finally {
      setLeggo(false);
    }
  }

  function pulisciModulo() {
    setBeneficiario('');
    setMetodo('iban');
    setIban('');
    setRifPagamento('');
    setImporto('');
    setCausale('');
    setNote('');
    setTestoAi('');
    setFotoAi(null);
    setEsitoLettura('');
  }

  async function salva() {
    const euro = leggiImporto(importo);
    if (!beneficiario.trim()) return avvisa('Manca il beneficiario', 'Scrivi chi va pagato.');
    if (!euro || euro <= 0) return avvisa('Importo', 'Scrivi un importo maggiore di zero.');
    if (!causale.trim()) return avvisa('Causale', 'Scrivi la causale: senza, il pagamento non si ricostruisce.');
    if (metodo === 'iban' && !iban.trim()) return avvisa('IBAN', 'Per il bonifico serve l’IBAN.');
    if (metodo !== 'iban' && metodo !== 'carta' && !rifPagamento.trim()) {
      return avvisa('Riferimento', `Per «${METODI_FORNITORE[metodo]}» serve dove/come pagare.`);
    }
    setSalvo(true);
    try {
      const riga = await inserisciPagamentoFornitore({
        beneficiario,
        metodo,
        iban,
        riferimento_pagamento: rifPagamento,
        importo: euro,
        causale,
        note,
      });
      setFormAperto(false);
      pulisciModulo();
      await carica();
      // L'invio è un secondo gesto esplicito, ma lo si propone subito.
      await invia(riga.id);
    } catch (e: any) {
      avvisa('Non salvata', String(e?.message ?? e));
    } finally {
      setSalvo(false);
    }
  }

  async function invia(id: string) {
    setInCorso(id);
    try {
      await inviaPagamentoFornitore(id);
    } catch (e: any) {
      avvisa('Richiesta non inviata', String(e?.message ?? e));
    } finally {
      setInCorso(null);
      carica();
    }
  }

  async function aggiornaStato(id: string) {
    setInCorso(id);
    try {
      await statoPagamentoFornitore(id);
    } catch (e: any) {
      avvisa('Stato non aggiornato', String(e?.message ?? e));
    } finally {
      setInCorso(null);
      carica();
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.sfondo }}>
      <ScrollView
        contentContainerStyle={[contenutoCentrato, { padding: spacing.lg, paddingBottom: 120 }]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); carica(); }} />}
      >
        <PageIntro testo="I fornitori degli eventi da pagare. Scout non paga: chiede a Deluxy Transactions, dove una persona autorizza — e l'esito torna qui da solo, con la prova conservata di là." />

        <RigaChips style={{ marginBottom: spacing.md }}>
          <Chip label="Aperte" on={vista === 'aperte'} onPress={() => setVista('aperte')} title="Da inviare o in lavorazione" />
          <Chip label="Pagate" on={vista === 'pagate'} onPress={() => setVista('pagate')} title="Il denaro è uscito" />
          <Chip label="Tutte" on={vista === 'tutte'} onPress={() => setVista('tutte')} title="Anche rifiutate e annullate" />
        </RigaChips>

        {caricamento ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : filtrate.length === 0 ? (
          <EmptyState
            icona="cash-outline"
            titolo="Nessun pagamento fornitore"
            aiuto="Quando un evento ha un fornitore da pagare, la richiesta si scrive qui e parte verso Transactions."
            azione="Nuova richiesta"
            onAzione={() => setFormAperto(true)}
          />
        ) : (
          filtrate.map((r) => (
            <Card key={r.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={styles.nome} numberOfLines={1}>{r.beneficiario}</Text>
                <Text style={styles.importo}>{r.importo.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</Text>
              </View>
              <Text style={styles.sub} numberOfLines={2}>{r.causale}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <StatusBadge
                  label={LABEL_STATO[r.trx_stato] ?? r.trx_stato}
                  colore={COLORE_STATO[r.trx_stato] ?? colors.grigio}
                  small
                />
                <Text style={styles.mutato}>{METODI_FORNITORE[r.metodo] ?? r.metodo}</Text>
                {r.trx_riferimento ? <Text style={styles.mutato}>{r.trx_riferimento}</Text> : null}
                {r.trx_stato === 'pagata' && r.trx_pagato_con ? (
                  <Text style={styles.mutato}>
                    {r.trx_pagato_con === 'fuori_app' ? 'pagata fuori dall’app' : `via ${r.trx_pagato_con}`}
                  </Text>
                ) : null}
              </View>
              {r.esito_invio ? <Text style={styles.errore}>{r.esito_invio}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                {!r.inviata_il || r.esito_invio ? (
                  inCorso === r.id ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Btn small label={r.inviata_il ? 'Riprova invio' : 'Invia a Transactions'} onPress={() => invia(r.id)} />
                  )
                ) : r.trx_stato !== 'pagata' ? (
                  inCorso === r.id ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Btn small tipo="secondario" label="Aggiorna stato" onPress={() => aggiornaStato(r.id)} />
                  )
                ) : null}
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* FAB a pillola CON etichetta, come la schermata sorella «Pagamenti»:
          un cerchio muto con il + non dice cosa crea. */}
      <Pressable
        style={styles.fab}
        onPress={() => setFormAperto(true)}
        accessibilityRole="button"
        accessibilityLabel="Nuova richiesta di pagamento fornitore"
      >
        <Ionicons name="add" size={22} color={colors.bianco} />
        <Text style={styles.fabTxt}>Paga fornitore</Text>
      </Pressable>

      {formAperto && (
        <Foglio titolo="Paga un fornitore" sottotitolo="La richiesta parte verso Transactions: di là una persona autorizza e paga." onClose={() => setFormAperto(false)}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Leggi con l’AI (facoltativo)</Text>
            <TextInput
              style={[styles.input, { minHeight: 64 }]}
              multiline
              placeholder="Incolla il messaggio del fornitore con IBAN e importo…"
              placeholderTextColor={colors.grigio}
              value={testoAi}
              onChangeText={setTestoAi}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, alignItems: 'center' }}>
              <Btn small tipo="secondario" icona="image-outline" label={fotoAi ? 'Foto scelta ✓' : 'Foto della richiesta'} onPress={scegliFoto} />
              {leggo ? (
                <ActivityIndicator size="small" />
              ) : (
                <Btn small icona="sparkles-outline" label="Leggi e riempi" disabled={!testoAi.trim() && !fotoAi} onPress={leggiConAi} />
              )}
            </View>
            {esitoLettura ? <Text style={[styles.mutato, { marginTop: 6 }]}>{esitoLettura}</Text> : null}

            <Text style={styles.label}>Beneficiario</Text>
            <TextInput style={styles.input} value={beneficiario} onChangeText={setBeneficiario} placeholder="Chi va pagato" placeholderTextColor={colors.grigio} />

            <Text style={styles.label}>Come si paga</Text>
            <RigaChips>
              {Object.entries(METODI_FORNITORE).map(([v, l]) => (
                <Chip key={v} label={l} on={metodo === v} onPress={() => setMetodo(v)} />
              ))}
            </RigaChips>
            {metodo === 'iban' ? (
              <>
                <Text style={styles.label}>IBAN</Text>
                <TextInput style={styles.input} value={iban} onChangeText={setIban} autoCapitalize="characters" autoCorrect={false} placeholder="IT…" placeholderTextColor={colors.grigio} />
              </>
            ) : (
              <>
                <Text style={styles.label}>{metodo === 'carta' ? 'Nota sulla carta (MAI il numero)' : 'Riferimento di pagamento'}</Text>
                <TextInput style={styles.input} value={rifPagamento} onChangeText={setRifPagamento} autoCapitalize="none" autoCorrect={false} placeholder={metodo === 'link' ? 'https://…' : metodo === 'paypal' ? 'nome@esempio.com' : 'es. contanti alla consegna'} placeholderTextColor={colors.grigio} />
              </>
            )}

            <Text style={styles.label}>Importo (€)</Text>
            <TextInput style={styles.input} value={importo} onChangeText={setImporto} inputMode="decimal" placeholder="250,00" placeholderTextColor={colors.grigio} />

            <Text style={styles.label}>Causale</Text>
            <TextInput style={styles.input} value={causale} onChangeText={setCausale} maxLength={140} placeholder="Es. Allestimento evento SCOUT012 — acconto" placeholderTextColor={colors.grigio} />

            <Text style={styles.label}>Note (facoltative)</Text>
            <TextInput style={[styles.input, { minHeight: 56 }]} multiline value={note} onChangeText={setNote} placeholderTextColor={colors.grigio} />

            <View style={{ marginTop: spacing.lg, alignSelf: 'flex-start' }}>
              {salvo ? <ActivityIndicator size="small" /> : <Btn label="Salva e invia" onPress={salva} />}
            </View>
            <View style={{ height: 30 }} />
          </ScrollView>
        </Foglio>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  nome: { fontSize: 16, fontWeight: '600', color: colors.testo, flex: 1 },
  importo: { fontSize: 16, fontWeight: '700', color: colors.testo, fontVariant: ['tabular-nums'] },
  sub: { color: colors.testoSoft, marginTop: 2 },
  mutato: { color: colors.grigio, fontSize: 12.5 },
  errore: { color: colors.errore, fontSize: 12.5, marginTop: 6 },
  // Etichetta e campo IDENTICI alla schermata «Pagamenti» (styles.label/input):
  // stessa maiuscola, stesso raggio, stessi token.
  label: { fontSize: 11, fontWeight: '700', color: colors.grigio, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.testo,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.navy,
    borderRadius: radius.pill,
    paddingLeft: 14,
    paddingRight: 18,
    paddingVertical: 12,
    ...shadow.float,
  },
  fabTxt: { color: colors.bianco, fontWeight: '700', fontSize: 14 },
});
