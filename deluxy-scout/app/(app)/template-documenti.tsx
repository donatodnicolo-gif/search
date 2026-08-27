// TEMPLATE DEI DOCUMENTI — l'intestazione con cui escono le pro-forme.
//
// Decisione dell'utente (27/08/2026): «Scout sarà l'owner dei template, a
// Finance vengono comunicate solo le pro-forme». Quindi si configurano QUI, e
// quando si emette un documento l'intestazione parte insieme a lui.
//
// Cosa deve avere una pro-forma, secondo la prassi italiana: dicitura «fattura
// pro-forma» ben visibile, numerazione indipendente da quella fiscale, dati di
// chi emette (denominazione, indirizzo, P. IVA o codice fiscale, eventuale
// REA), dati del cliente, descrizione con IVA separata, come si paga, e in
// calce la formula di legge. Numerazione, righe e cliente li mette FINANCE: qui
// sta la parte che non cambia da un documento all'altro.
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect } from 'expo-router';
import { colors, radius, spacing, contenutoCentrato } from '@/lib/theme';
import { EmptyState, PageIntro } from '@/components/ui';
import { Foglio } from '@/components/Foglio';
import { avvisa, conferma } from '@/lib/dialoghi';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { BRAND, BRAND_DEFAULT } from '@/types';
import { leggiDatiAzienda, type DatiAzienda } from '@/lib/db';
import {
  eliminaTemplate,
  fetchTemplate,
  rendiPredefinito,
  salvaTemplate,
  type TemplateDocumento,
} from '@/lib/template-documento';

/**
 * La formula che rende la pro-forma quello che è: un documento che NON è una
 * fattura. ⚠️ Senza, il cliente può registrarla in contabilità e detrarne l'IVA.
 */
const DISCLAIMER_STANDARD =
  "Il presente documento non costituisce fattura ai sensi dell'art. 21 del D.P.R. 633/72 e successive " +
  'modifiche e non genera esigibilità di imposta per il prestatore. La fattura definitiva verrà emessa ' +
  "all'atto del pagamento del corrispettivo (art. 6, comma 3, D.P.R. 633/72).";

/** Il logo pesa: il documento viaggia via email, e un allegato enorme non parte. */
const LOGO_MAX_BYTE = 512 * 1024;

type Bozza = {
  nome: string;
  brand: string;
  ragione_sociale: string;
  indirizzo: string;
  piva: string;
  codice_fiscale: string;
  rea: string;
  contatti: string;
  logo_data_url: string;
  iban: string;
  intestatario_conto: string;
  modalita_pagamento: string;
  sdi: string;
  pec: string;
  banca: string;
  bic: string;
  note_default: string;
  disclaimer: string;
};

const VUOTA: Bozza = {
  nome: '',
  brand: BRAND_DEFAULT,
  ragione_sociale: '',
  indirizzo: '',
  piva: '',
  codice_fiscale: '',
  rea: '',
  contatti: '',
  logo_data_url: '',
  iban: '',
  intestatario_conto: '',
  modalita_pagamento: 'Bonifico bancario',
  sdi: '',
  pec: '',
  banca: '',
  bic: '',
  note_default: '',
  disclaimer: '',
};

export default function TemplateDocumenti() {
  /**
   * ⚠️ IL CONFINE STA QUI, non nel menu (27/08/2026, revisione di sicurezza).
   * Questa schermata scrive le COORDINATE DI PAGAMENTO che finiscono sulle
   * pro-forma: nasconderla dal menu la toglie di vista, non di portata — la
   * rotta si scrive a mano nella barra degli indirizzi. La difesa vera è la
   * RLS (migr. 0085, scrittura riservata all'admin); questo Redirect serve a
   * non mostrare a un venditore una schermata che poi rifiuterebbe i salvataggi
   * con un errore del database.
   */
  const { session } = useAuth();
  const admin = isAdmin(session?.user?.email);
  const [righe, setRighe] = useState<TemplateDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [apertoId, setApertoId] = useState<string | null>(null);
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [salvo, setSalvo] = useState(false);
  /** I dati di fatturazione: Impostazioni → Dati per la fatturazione. */
  const [azienda, setAzienda] = useState<DatiAzienda | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      setRighe(await fetchTemplate());
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      setErrore(
        /template_documento|PGRST205|does not exist|schema cache/i.test(msg)
          ? 'I template hanno bisogno della migrazione 0079, non ancora applicata al database.'
          : msg || 'Elenco non caricato.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
      leggiDatiAzienda().then(setAzienda).catch(() => {});
    }, [carica]),
  );

  /**
   * ⭐ I DATI SOCIETARI SONO GIÀ DENTRO (27/08/2026, richiesta dell'utente:
   * «i dati societari sono di default»).
   *
   * Le tre insegne sono la STESSA società: ragione sociale, P. IVA, codice
   * fiscale, REA, indirizzo, IBAN e testo di legge non cambiano — cambiano il
   * logo, il nome e i contatti. Farli riscrivere tre volte è un invito a
   * sbagliare una partita IVA, e una P. IVA sbagliata su un documento che va al
   * cliente è un problema serio.
   *
   * ⚠️ Si copiano dal template PREDEFINITO (o dal primo che c'è), non da una
   * costante: quei dati non li inventa il codice. La prima volta si scrivono
   * una volta sola.
   */
  function datiSocietariDiDefault(): Partial<Bozza> {
    // Prima fonte: i DATI PER LA FATTURAZIONE (Impostazioni), che sono
    // l'identità fiscale dell'azienda e li scrive solo l'amministratore.
    const da: Partial<Bozza> = azienda
      ? {
          ragione_sociale: azienda.ragioneSociale,
          piva: azienda.piva,
          indirizzo: [azienda.indirizzo, azienda.capCitta].filter(Boolean).join(' — '),
          sdi: azienda.sdi,
          pec: azienda.pec,
          // Informazioni bancarie e contatti amministrativi: anche questi
          // vengono dalle Impostazioni (richiesta dell'utente), non si
          // riscrivono per ogni insegna.
          iban: azienda.iban,
          intestatario_conto: azienda.intestatarioConto,
          banca: azienda.banca,
          bic: azienda.bic,
          // I contatti del documento si compongono da chi risponde di fatture e
          // pagamenti: è a lui che il cliente deve scrivere.
          contatti: [azienda.ammReferente, azienda.ammTelefono, azienda.ammEmail]
            .filter((v) => v && v.trim())
            .join(' · '),
        }
      : {};
    // Seconda fonte: il template predefinito, per ciò che le impostazioni non
    // sanno — IBAN, modalità di pagamento, testo di legge, codice fiscale, REA.
    const base = righe.find((r) => r.predefinito) ?? righe[0];
    if (!base) return da;
    return {
      codice_fiscale: base.codice_fiscale ?? '',
      rea: base.rea ?? '',
      iban: base.iban ?? '',
      intestatario_conto: base.intestatario_conto ?? '',
      modalita_pagamento: base.modalita_pagamento ?? '',
      disclaimer: base.disclaimer ?? '',
      // Se le impostazioni sono vuote si ripiega su quello che c'è già.
      ragione_sociale: base.ragione_sociale,
      indirizzo: base.indirizzo ?? '',
      piva: base.piva ?? '',
      sdi: base.sdi ?? '',
      pec: base.pec ?? '',
      ...da,
      // ⚠️ NON si copiano LOGO, NOME e BRAND: sono le tre cose che distinguono
      // un'insegna dall'altra, e copiarle farebbe uscire il documento di Cake
      // Design col logo di Deluxy.
    };
  }

  function apri(t: TemplateDocumento | null) {
    setApertoId(t?.id ?? 'nuovo');
    setBozza(
      t
        ? {
            nome: t.nome,
            brand: t.brand ?? '',
            ragione_sociale: t.ragione_sociale,
            indirizzo: t.indirizzo ?? '',
            piva: t.piva ?? '',
            codice_fiscale: t.codice_fiscale ?? '',
            rea: t.rea ?? '',
            contatti: t.contatti ?? '',
            logo_data_url: t.logo_data_url ?? '',
            iban: t.iban ?? '',
            intestatario_conto: t.intestatario_conto ?? '',
            modalita_pagamento: t.modalita_pagamento ?? '',
            sdi: t.sdi ?? '',
            pec: t.pec ?? '',
            banca: t.banca ?? '',
            bic: t.bic ?? '',
            note_default: t.note_default ?? '',
            disclaimer: t.disclaimer ?? '',
          }
        : { ...VUOTA, ...datiSocietariDiDefault() },
    );
  }

  /**
   * Il logo si sceglie dal disco e diventa un data URI qui nel browser.
   * ⚠️ Non si carica da nessuna parte: il documento si stampa e viaggia via
   * email, e un logo ospitato fuori sparisce dal PDF il giorno che quell'host
   * cambia. Il prezzo è il peso, e infatti c'è un limite.
   */
  function scegliLogo() {
    if (typeof document === 'undefined') {
      avvisa('Solo da computer', 'Il logo si carica dalla versione web di Scout.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file || !bozza) return;
      if (file.size > LOGO_MAX_BYTE) {
        avvisa(
          'Logo troppo pesante',
          `Pesa ${(file.size / 1024).toFixed(0)} KB: il massimo è ${LOGO_MAX_BYTE / 1024} KB, altrimenti le email col documento non partono. Rimpiccioliscilo e riprova.`,
        );
        return;
      }
      const fr = new FileReader();
      fr.onload = () => setBozza((b) => (b ? { ...b, logo_data_url: String(fr.result ?? '') } : b));
      fr.readAsDataURL(file);
    };
    input.click();
  }

  async function salva() {
    if (!bozza || salvo) return;
    if (!bozza.nome.trim()) {
      avvisa('Manca il nome', 'È quello con cui si sceglie il template.');
      return;
    }
    if (!bozza.ragione_sociale.trim()) {
      avvisa(
        'Manca la ragione sociale',
        'È il primo dato che va in testa alla pro-forma: senza, il documento non dice chi lo emette.',
      );
      return;
    }
    setSalvo(true);
    try {
      const campi = {
        ...bozza,
        nome: bozza.nome.trim(),
        brand: bozza.brand.trim() || null,
        ragione_sociale: bozza.ragione_sociale.trim(),
      };
      const creato = await salvaTemplate(apertoId === 'nuovo' ? null : apertoId, campi);
      // Il primo diventa predefinito da solo: averne uno e non usarlo sarebbe
      // una configurazione che non serve a niente.
      if (righe.length === 0) await rendiPredefinito(creato.id);
      setApertoId(null);
      setBozza(null);
      await carica();
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      avvisa(
        'Non è stato salvato',
        /duplicate|unique/i.test(msg)
          ? 'Esiste già un template con questo nome o per questo brand: un’insegna ha una sola intestazione.'
          : msg || 'Riprova.',
      );
    } finally {
      setSalvo(false);
    }
  }

  function chiediElimina(t: TemplateDocumento) {
    conferma(
      'Eliminare il template?',
      `«${t.nome}».\n\nI documenti già emessi NON cambiano: l'intestazione con cui sono usciti è salvata su di loro.`,
      async () => {
        try {
          await eliminaTemplate(t.id);
          await carica();
        } catch (e: any) {
          avvisa('Non è stato eliminato', e?.message ?? 'Riprova.');
        }
      },
      { testoConferma: 'Elimina', distruttivo: true },
    );
  }

  // Dopo gli hook, mai prima: un `return` anticipato sopra cambierebbe il
  // numero di hook fra un render e l'altro.
  if (!admin) return <Redirect href="/(app)/profilo" />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.list, contenutoCentrato]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
    >
      <PageIntro testo="L'intestazione con cui escono le pro-forme: logo, dati societari e coordinate di pagamento, una per insegna. Quando si emette un documento, l'intestazione parte insieme a lui e resta su quel documento — ritoccarla dopo non cambia ciò che il cliente ha già ricevuto." />

      {errore ? (
        <Text style={styles.errore}>
          <Ionicons name="warning-outline" size={13} color={colors.errore} /> {errore}
        </Text>
      ) : null}

      <Pressable style={styles.btnPri} onPress={() => apri(null)}>
        <Ionicons name="add" size={17} color={colors.bianco} />
        <Text style={styles.btnPriTxt}>Nuovo template</Text>
      </Pressable>

      {!righe.length && !errore ? (
        <EmptyState
          loading={loading}
          icona="document-text-outline"
          titolo="Nessun template"
          aiuto="Senza, le pro-forme escono con l'intestazione generale di FINANCE, senza logo. Facendone uno per insegna, ogni documento porta il logo e i dati societari giusti."
        />
      ) : null}

      {righe.map((t) => (
        <Pressable key={t.id} style={styles.card} onPress={() => apri(t)}>
          <View style={styles.cardTop}>
            {t.logo_data_url ? (
              <Image source={{ uri: t.logo_data_url }} style={styles.logo} resizeMode="contain" />
            ) : (
              <View style={styles.logoVuoto}>
                <Text style={styles.logoVuotoTxt}>no logo</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.nome} numberOfLines={1}>{t.nome}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {t.brand ?? 'nessun brand'} · {t.ragione_sociale}
              </Text>
              {t.piva ? <Text style={styles.meta}>P. IVA {t.piva}</Text> : null}
            </View>
            {t.predefinito ? (
              <View style={styles.badgePre}>
                <Text style={styles.badgePreTxt}>Predefinito</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.azioni}>
            {!t.predefinito ? (
              <Pressable
                style={styles.btnMini}
                onPress={async (e: any) => {
                  e?.stopPropagation?.();
                  await rendiPredefinito(t.id);
                  await carica();
                }}
              >
                <Text style={styles.btnMiniTxt}>Rendi predefinito</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.btnMini} onPress={(e: any) => { e?.stopPropagation?.(); apri(t); }}>
              <Text style={styles.btnMiniTxt}>Modifica</Text>
            </Pressable>
            <Pressable style={styles.btnMini} onPress={(e: any) => { e?.stopPropagation?.(); chiediElimina(t); }}>
              <Text style={[styles.btnMiniTxt, { color: colors.errore }]}>Elimina</Text>
            </Pressable>
          </View>
        </Pressable>
      ))}

      {apertoId && bozza ? (
        <Foglio
          titolo={apertoId === 'nuovo' ? 'Nuovo template' : 'Modifica il template'}
          sottotitolo="Logo e dati societari con cui esce il documento"
          bloccaSfondo
          onClose={() => {
            setApertoId(null);
            setBozza(null);
          }}
        >
          <Text style={styles.label}>Nome del template *</Text>
          <TextInput
            style={styles.input}
            value={bozza.nome}
            onChangeText={(v) => setBozza({ ...bozza, nome: v })}
            placeholder="es. Deluxy Flowers"
            placeholderTextColor={colors.grigio}
          />

          <Text style={styles.label}>Brand</Text>
          <View style={styles.chips}>
            {BRAND.map((b) => (
              <Pressable
                key={b}
                style={[styles.chip, bozza.brand === b && styles.chipOn]}
                onPress={() => setBozza({ ...bozza, brand: bozza.brand === b ? '' : b })}
              >
                <Text style={[styles.chipTxt, bozza.brand === b && styles.chipTxtOn]}>{b}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.aiuto}>
            È l&apos;insegna a cui corrisponde: quando un ordine è di quel brand, la pro-forma esce con questa
            intestazione.
          </Text>

          {/* Vale anche per il PRIMO template: i dati non vengono dal template
              precedente ma dalle Impostazioni, quindi ci sono da subito. */}
          {apertoId === 'nuovo' && (azienda?.piva || righe.length) ? (
            <Text style={styles.aiuto}>
              I dati societari arrivano da Impostazioni → Dati per la fatturazione: le insegne sono la
              stessa società. Qui cambia logo, nome e contatti.
            </Text>
          ) : null}
          <Text style={styles.label}>Ragione sociale *</Text>
          <TextInput
            style={styles.input}
            value={bozza.ragione_sociale}
            onChangeText={(v) => setBozza({ ...bozza, ragione_sociale: v })}
            placeholder="es. Deluxy S.r.l."
            placeholderTextColor={colors.grigio}
          />
          <Text style={styles.label}>Indirizzo</Text>
          <TextInput
            style={styles.input}
            value={bozza.indirizzo}
            onChangeText={(v) => setBozza({ ...bozza, indirizzo: v })}
            placeholder="Via, numero — CAP Città (PR)"
            placeholderTextColor={colors.grigio}
          />
          <Text style={styles.label}>Partita IVA</Text>
          <TextInput
            style={styles.input}
            value={bozza.piva}
            onChangeText={(v) => setBozza({ ...bozza, piva: v })}
            placeholder="IT01234567890"
            placeholderTextColor={colors.grigio}
          />
          <Text style={styles.label}>Codice fiscale</Text>
          <TextInput
            style={styles.input}
            value={bozza.codice_fiscale}
            onChangeText={(v) => setBozza({ ...bozza, codice_fiscale: v })}
            placeholderTextColor={colors.grigio}
          />
          <Text style={styles.label}>REA</Text>
          <TextInput
            style={styles.input}
            value={bozza.rea}
            onChangeText={(v) => setBozza({ ...bozza, rea: v })}
            placeholder="MI-1234567"
            placeholderTextColor={colors.grigio}
          />
          <Text style={styles.label}>Codice SDI</Text>
          <TextInput
            style={styles.input}
            value={bozza.sdi}
            onChangeText={(v) => setBozza({ ...bozza, sdi: v })}
            placeholder="M5UXCR1"
            placeholderTextColor={colors.grigio}
            autoCapitalize="characters"
          />
          <Text style={styles.label}>PEC</Text>
          <TextInput
            style={styles.input}
            value={bozza.pec}
            onChangeText={(v) => setBozza({ ...bozza, pec: v })}
            placeholder="deluxy@pec.net"
            placeholderTextColor={colors.grigio}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Text style={styles.label}>Contatti</Text>
          <TextInput
            style={styles.input}
            value={bozza.contatti}
            onChangeText={(v) => setBozza({ ...bozza, contatti: v })}
            placeholder="+39 02 000000 · amministrazione@deluxy.it · deluxy.it"
            placeholderTextColor={colors.grigio}
          />

          <Text style={styles.label}>Logo</Text>
          <View style={styles.logoRiga}>
            {bozza.logo_data_url ? (
              <Image source={{ uri: bozza.logo_data_url }} style={styles.logo} resizeMode="contain" />
            ) : (
              <View style={styles.logoVuoto}>
                <Text style={styles.logoVuotoTxt}>nessun logo</Text>
              </View>
            )}
            <View style={{ gap: 6 }}>
              <Pressable style={styles.btnMini} onPress={scegliLogo}>
                <Text style={styles.btnMiniTxt}>Scegli un&apos;immagine</Text>
              </Pressable>
              {bozza.logo_data_url ? (
                <Pressable style={styles.btnMini} onPress={() => setBozza({ ...bozza, logo_data_url: '' })}>
                  <Text style={styles.btnMiniTxt}>Togli il logo</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <Text style={styles.aiuto}>
            Resta dentro al documento (non su un server esterno), così non sparisce dal PDF. Massimo{' '}
            {LOGO_MAX_BYTE / 1024} KB.
          </Text>

          <Text style={styles.label}>IBAN</Text>
          <TextInput
            style={styles.input}
            value={bozza.iban}
            onChangeText={(v) => setBozza({ ...bozza, iban: v })}
            placeholder="IT00 X000 0000 0000 0000 0000 000"
            placeholderTextColor={colors.grigio}
          />
          <Text style={styles.label}>Intestato a</Text>
          <TextInput
            style={styles.input}
            value={bozza.intestatario_conto}
            onChangeText={(v) => setBozza({ ...bozza, intestatario_conto: v })}
            placeholder="se diverso dalla ragione sociale"
            placeholderTextColor={colors.grigio}
          />
          <Text style={styles.label}>Banca</Text>
          <TextInput
            style={styles.input}
            value={bozza.banca}
            onChangeText={(v) => setBozza({ ...bozza, banca: v })}
            placeholderTextColor={colors.grigio}
          />
          <Text style={styles.label}>BIC / SWIFT</Text>
          <TextInput
            style={styles.input}
            value={bozza.bic}
            onChangeText={(v) => setBozza({ ...bozza, bic: v })}
            placeholderTextColor={colors.grigio}
            autoCapitalize="characters"
          />
          <Text style={styles.label}>Modalità di pagamento</Text>
          <TextInput
            style={styles.input}
            value={bozza.modalita_pagamento}
            onChangeText={(v) => setBozza({ ...bozza, modalita_pagamento: v })}
            placeholder="es. Bonifico bancario a 30 giorni data documento"
            placeholderTextColor={colors.grigio}
          />
          <Text style={styles.aiuto}>
            Un documento che chiede soldi senza dire dove mandarli fa perdere un giro di mail.
          </Text>

          <Text style={styles.label}>Condizioni predefinite</Text>
          <TextInput
            style={[styles.input, styles.inputAlto]}
            value={bozza.note_default}
            onChangeText={(v) => setBozza({ ...bozza, note_default: v })}
            multiline
            placeholder="Finiscono nelle note del documento."
            placeholderTextColor={colors.grigio}
          />

          <Text style={styles.label}>Testo di legge</Text>
          <TextInput
            style={[styles.input, styles.inputAlto]}
            value={bozza.disclaimer}
            onChangeText={(v) => setBozza({ ...bozza, disclaimer: v })}
            multiline
            placeholder={DISCLAIMER_STANDARD}
            placeholderTextColor={colors.grigio}
          />
          <Text style={styles.aiuto}>
            Lasciandolo vuoto si usa la formula standard. È la frase che rende la pro-forma un documento non
            fiscale: senza, il cliente potrebbe registrarla e detrarne l&apos;IVA.
          </Text>

          <Pressable style={[styles.btnPri, salvo && { opacity: 0.5 }]} disabled={salvo} onPress={salva}>
            {salvo ? (
              <ActivityIndicator color={colors.bianco} size="small" />
            ) : (
              <Text style={styles.btnPriTxt}>Salva</Text>
            )}
          </Pressable>
        </Foglio>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 40 },
  errore: { color: colors.errore, fontSize: 12.5, lineHeight: 18 },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    gap: 10,
  },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  logo: { width: 84, height: 48, borderRadius: 8, backgroundColor: colors.bianco },
  logoVuoto: {
    width: 84,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.grigioChiaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoVuotoTxt: { color: colors.grigio, fontSize: 10.5 },
  logoRiga: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 4 },
  nome: { color: colors.navy, fontWeight: '800', fontSize: 15.5 },
  meta: { color: colors.testoSoft, fontSize: 12.5, marginTop: 2 },
  badgePre: { backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  badgePreTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 10.5 },
  azioni: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btnMini: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnMiniTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  btnPri: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: 12,
    marginTop: 4,
  },
  btnPriTxt: { color: colors.bianco, fontWeight: '700', fontSize: 14 },
  label: { color: colors.navy, fontWeight: '700', fontSize: 13, marginTop: spacing.sm },
  aiuto: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.md,
    backgroundColor: colors.bianco,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.testo,
    fontSize: 14,
    marginTop: 4,
  },
  inputAlto: { minHeight: 72, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontSize: 12.5, fontWeight: '600' },
  chipTxtOn: { color: colors.bianco },
});
