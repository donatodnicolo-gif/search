// Documenti e link allegati a una trattativa (migr. 0121, 07/09/2026).
//
// Richiesta dell'utente (da un altro account, rifatta qui): «link di
// riferimento e documenti allegati per trattativa». Vive dentro il foglio
// della trattativa: l'elenco (apri · togli), «+ Link» con un mini-modulo in
// linea, «+ Documento» col picker di sistema. I file stanno nel bucket
// PRIVATO `allegati` e si aprono con un URL firmato di un'ora.
//
// ⚠️ Niente finestra dentro la finestra ([[trappola-finestra-dentro-la-finestra]]):
// il modulo del link si apre IN LINEA sotto i bottoni, non in un secondo foglio.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import type { DealAllegato } from '@/types';
import { colors, radius, spacing, touchMin } from '@/lib/theme';
import {
  caricaAllegatoFile,
  eliminaAllegato,
  fetchAllegatiTrattativa,
  inserisciAllegatoLink,
  urlAllegato,
} from '@/lib/db';
import { linkApribile, normalizzaLink } from '@/lib/trattative';
import { avvisa, conferma } from '@/lib/dialoghi';

export function AllegatiTrattativa({ dealKey }: { dealKey: string }) {
  const [righe, setRighe] = useState<DealAllegato[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [linkAperto, setLinkAperto] = useState(false);
  const [linkTitolo, setLinkTitolo] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [lavorando, setLavorando] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      setRighe(await fetchAllegatiTrattativa(dealKey));
    } catch (e: any) {
      // Si DICE: un elenco vuoto per un errore sembrerebbe «nessun allegato»
      // ([[trappola-il-fallimento-che-sembra-una-lista-vuota]]).
      setErrore(e?.message ?? 'Gli allegati non si sono caricati.');
    } finally {
      setLoading(false);
    }
  }, [dealKey]);

  useEffect(() => {
    carica();
  }, [carica]);

  async function apri(a: DealAllegato) {
    try {
      const url = await urlAllegato(a);
      if (!linkApribile(url)) throw new Error('Il link non è un indirizzo web.');
      await Linking.openURL(url);
    } catch (e: any) {
      avvisa('Non si apre', e?.message ?? 'Riprova.');
    }
  }

  function chiediTogli(a: DealAllegato) {
    conferma(
      'Togliere l’allegato?',
      `«${a.titolo}»${a.tipo === 'file' ? ' — il file viene cancellato.' : ''}`,
      async () => {
        try {
          await eliminaAllegato(a);
          setRighe((r) => r.filter((x) => x.id !== a.id));
        } catch (e: any) {
          avvisa('Non è stato tolto', e?.message ?? 'Riprova.');
        }
      },
      { testoConferma: 'Togli', distruttivo: true },
    );
  }

  async function salvaLink() {
    const url = normalizzaLink(linkUrl);
    if (!url || !linkApribile(url)) {
      setErrore('Scrivi un indirizzo web che inizia con http:// o https://.');
      return;
    }
    setLavorando(true);
    setErrore(null);
    try {
      const nuovo = await inserisciAllegatoLink(dealKey, linkTitolo, url);
      setRighe((r) => [...r, nuovo]);
      setLinkAperto(false);
      setLinkTitolo('');
      setLinkUrl('');
    } catch (e: any) {
      setErrore(e?.message ?? 'Il link non è stato salvato.');
    } finally {
      setLavorando(false);
    }
  }

  async function scegliDocumento() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const f = res.assets[0];
      setLavorando(true);
      setErrore(null);
      const nuovo = await caricaAllegatoFile(dealKey, {
        uri: f.uri,
        name: f.name,
        mimeType: f.mimeType ?? null,
        size: f.size ?? null,
        file: (f as any).file ?? null,
      });
      setRighe((r) => [...r, nuovo]);
    } catch (e: any) {
      setErrore(e?.message ?? 'Il documento non è stato caricato.');
    } finally {
      setLavorando(false);
    }
  }

  return (
    <View style={styles.blocco}>
      <Text style={styles.titolo}>Documenti e link allegati</Text>
      {loading ? (
        <Text style={styles.nota}>Carico gli allegati…</Text>
      ) : righe.length === 0 ? (
        <Text style={styles.nota}>Nessun allegato. La presentazione fatta per questo cliente, il preventivo mandato, una cartella condivisa.</Text>
      ) : (
        righe.map((a) => (
          <View key={a.id} style={styles.riga}>
            <Pressable style={styles.rigaApri} onPress={() => apri(a)} accessibilityLabel={`Apri ${a.titolo}`}>
              <Ionicons name={a.tipo === 'link' ? 'link-outline' : 'document-attach-outline'} size={17} color={colors.navy} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rigaTitolo} numberOfLines={2}>{a.titolo}</Text>
                <Text style={styles.rigaSotto} numberOfLines={1}>
                  {a.tipo === 'link' ? a.url : 'documento'} · {new Date(a.created_at).toLocaleDateString('it-IT')}
                </Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.grigio} />
            </Pressable>
            <Pressable
              style={styles.togli}
              onPress={() => chiediTogli(a)}
              accessibilityLabel={`Togli ${a.titolo}`}
              {...({ title: 'Togli' } as any)}
            >
              <Ionicons name="trash-outline" size={17} color={colors.errore} />
            </Pressable>
          </View>
        ))
      )}

      <View style={styles.azioni}>
        <Pressable style={styles.btn} disabled={lavorando} onPress={() => setLinkAperto((v) => !v)}>
          <Ionicons name="link-outline" size={15} color={colors.testo} />
          <Text style={styles.btnTxt}>+ Link</Text>
        </Pressable>
        <Pressable style={styles.btn} disabled={lavorando} onPress={scegliDocumento}>
          {lavorando ? <ActivityIndicator size="small" color={colors.testo} /> : <Ionicons name="document-attach-outline" size={15} color={colors.testo} />}
          <Text style={styles.btnTxt}>+ Documento</Text>
        </Pressable>
      </View>

      {linkAperto ? (
        <View style={styles.formLink}>
          <TextInput
            style={styles.input}
            value={linkTitolo}
            onChangeText={setLinkTitolo}
            placeholder="Titolo (es. Presentazione settembre)"
            placeholderTextColor={colors.grigio}
          />
          <TextInput
            style={styles.input}
            value={linkUrl}
            onChangeText={setLinkUrl}
            placeholder="https://…"
            placeholderTextColor={colors.grigio}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <View style={styles.azioni}>
            <Pressable style={styles.btn} onPress={() => setLinkAperto(false)}>
              <Text style={styles.btnTxt}>Annulla</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPieno]} disabled={lavorando} onPress={salvaLink}>
              <Text style={[styles.btnTxt, styles.btnPienoTxt]}>Salva il link</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {errore ? <Text style={styles.errore}>{errore}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  blocco: { gap: spacing.sm, marginTop: spacing.md },
  titolo: { fontSize: 11, fontWeight: '700', color: colors.testoSoft, letterSpacing: 0.6, textTransform: 'uppercase' },
  nota: { color: colors.testoSoft, fontSize: 12.5, fontStyle: 'italic', lineHeight: 17 },
  riga: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rigaApri: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.fill,
    borderRadius: radius.m,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    minHeight: touchMin,
  },
  rigaTitolo: { color: colors.testo, fontSize: 13.5, fontWeight: '600' },
  rigaSotto: { color: colors.grigio, fontSize: 11.5, marginTop: 1 },
  togli: { padding: 8, borderRadius: radius.s },
  azioni: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.fill,
    minHeight: 36,
  },
  btnTxt: { color: colors.testo, fontWeight: '600', fontSize: 13 },
  btnPieno: { backgroundColor: colors.ink },
  btnPienoTxt: { color: colors.bianco },
  formLink: { gap: spacing.xs },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.testo,
  },
  errore: { color: colors.errore, fontSize: 12.5 },
});
