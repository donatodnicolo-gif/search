// Pagamenti FORNITORI: il verso opposto di «Pagamenti» (che è l'incasso dal
// cliente). Qui si chiede di PAGARE il fioraio/catering/allestitore di un
// evento o ordine Scout. Scout non paga: la richiesta parte verso DELUXY
// TRANSACTIONS (l'unica app da cui esce denaro), una persona autorizza di là,
// e l'esito — pagata, con che mezzo, quando — torna qui da solo.
//
// La lettura AI (incolla il messaggio del fornitore, o fotografalo) PROPONE i
// campi: chi salva è sempre la persona, dopo averli riletti.
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
import { Chip, EmptyState, PageIntro, RigaChips, StatusBadge } from '@/components/ui';
import { colors, radius, spacing, contenutoCentrato } from '@/lib/theme';
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
            <View key={r.id} style={styles.card}>
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
                  <Pressable style={styles.azione} disabled={inCorso === r.id} onPress={() => invia(r.id)}>
                    {inCorso === r.id ? <ActivityIndicator size="small" /> : (
                      <Text style={styles.azioneTxt}>{r.inviata_il ? 'Riprova invio' : 'Invia a Transactions'}</Text>
                    )}
                  </Pressable>
                ) : r.trx_stato !== 'pagata' ? (
                  <Pressable style={styles.azioneSec} disabled={inCorso === r.id} onPress={() => aggiornaStato(r.id)}>
                    {inCorso === r.id ? <ActivityIndicator size="small" /> : <Text style={styles.azioneSecTxt}>Aggiorna stato</Text>}
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setFormAperto(true)} accessibilityLabel="Nuova richiesta di pagamento fornitore">
        <Ionicons name="add" size={28} color={colors.bianco} />
      </Pressable>

      {formAperto && (
        <Foglio titolo="Paga un fornitore" sottotitolo="La richiesta parte verso Transactions: di là una persona autorizza e paga." onClose={() => setFormAperto(false)}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.etichetta}>Leggi con l’AI (facoltativo)</Text>
            <TextInput
              style={[styles.campo, { minHeight: 64 }]}
              multiline
              placeholder="Incolla il messaggio del fornitore con IBAN e importo…"
              placeholderTextColor={colors.grigio}
              value={testoAi}
              onChangeText={setTestoAi}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, alignItems: 'center' }}>
              <Pressable style={styles.azioneSec} onPress={scegliFoto}>
                <Text style={styles.azioneSecTxt}>{fotoAi ? 'Foto scelta ✓' : 'Foto della richiesta'}</Text>
              </Pressable>
              <Pressable style={styles.azione} disabled={leggo || (!testoAi.trim() && !fotoAi)} onPress={leggiConAi}>
                {leggo ? <ActivityIndicator size="small" color={colors.bianco} /> : <Text style={styles.azioneTxt}>Leggi e riempi</Text>}
              </Pressable>
            </View>
            {esitoLettura ? <Text style={[styles.mutato, { marginTop: 6 }]}>{esitoLettura}</Text> : null}

            <Text style={styles.etichetta}>Beneficiario</Text>
            <TextInput style={styles.campo} value={beneficiario} onChangeText={setBeneficiario} placeholder="Chi va pagato" placeholderTextColor={colors.grigio} />

            <Text style={styles.etichetta}>Come si paga</Text>
            <RigaChips>
              {Object.entries(METODI_FORNITORE).map(([v, l]) => (
                <Chip key={v} label={l} on={metodo === v} onPress={() => setMetodo(v)} />
              ))}
            </RigaChips>
            {metodo === 'iban' ? (
              <>
                <Text style={styles.etichetta}>IBAN</Text>
                <TextInput style={styles.campo} value={iban} onChangeText={setIban} autoCapitalize="characters" autoCorrect={false} placeholder="IT…" placeholderTextColor={colors.grigio} />
              </>
            ) : (
              <>
                <Text style={styles.etichetta}>{metodo === 'carta' ? 'Nota sulla carta (MAI il numero)' : 'Riferimento di pagamento'}</Text>
                <TextInput style={styles.campo} value={rifPagamento} onChangeText={setRifPagamento} autoCapitalize="none" autoCorrect={false} placeholder={metodo === 'link' ? 'https://…' : metodo === 'paypal' ? 'nome@esempio.com' : 'es. contanti alla consegna'} placeholderTextColor={colors.grigio} />
              </>
            )}

            <Text style={styles.etichetta}>Importo (€)</Text>
            <TextInput style={styles.campo} value={importo} onChangeText={setImporto} inputMode="decimal" placeholder="250,00" placeholderTextColor={colors.grigio} />

            <Text style={styles.etichetta}>Causale</Text>
            <TextInput style={styles.campo} value={causale} onChangeText={setCausale} maxLength={140} placeholder="Es. Allestimento evento SCOUT012 — acconto" placeholderTextColor={colors.grigio} />

            <Text style={styles.etichetta}>Note (facoltative)</Text>
            <TextInput style={[styles.campo, { minHeight: 56 }]} multiline value={note} onChangeText={setNote} placeholderTextColor={colors.grigio} />

            <Pressable style={[styles.azione, { marginTop: 16, alignSelf: 'flex-start' }]} disabled={salvo} onPress={salva}>
              {salvo ? <ActivityIndicator size="small" color={colors.bianco} /> : <Text style={styles.azioneTxt}>Salva e invia</Text>}
            </Pressable>
            <View style={{ height: 30 }} />
          </ScrollView>
        </Foglio>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.m,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  nome: { fontSize: 16, fontWeight: '600', color: colors.testo, flex: 1 },
  importo: { fontSize: 16, fontWeight: '700', color: colors.testo, fontVariant: ['tabular-nums'] },
  sub: { color: colors.testoSoft, marginTop: 2 },
  mutato: { color: colors.grigio, fontSize: 12.5 },
  errore: { color: colors.errore, fontSize: 12.5, marginTop: 6 },
  azione: {
    backgroundColor: colors.testo,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  azioneTxt: { color: colors.bianco, fontWeight: '600', fontSize: 13.5 },
  azioneSec: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  azioneSecTxt: { color: colors.testo, fontWeight: '600', fontSize: 13.5 },
  etichetta: { fontSize: 13, fontWeight: '600', color: colors.testoSoft, marginTop: 14, marginBottom: 6 },
  campo: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.s,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.testo,
  },
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 26,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.testo,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
