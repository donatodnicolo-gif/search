// Profilo → Impostazioni: le regolazioni di prodotto che prima vivevano nei
// secret di Supabase e si cambiavano solo da riga di comando.
// Le scrive un amministratore (RLS, migr. 0043).
// In fondo, riservate all'admin, le chiavi delle altre app Deluxy (migr. 0044):
// stanno in una tabella che solo lui può leggere, e non tornano mai al client.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { colors, radius, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import {
  APP_DELUXY,
  fetchServiziPiattaforma,
  CHIAVE_CASELLA_RICHIESTE,
  CHIAVI_AZIENDA,
  chiaveIngressoConfigurata,
  fetchStatoChiaviApp,
  generaChiaveIngresso,
  leggiDatiAzienda,
  leggiImpostazione,
  rimuoviChiaveApp,
  salvaChiaveApp,
  salvaImpostazione,
  type DatiAzienda,
  registraProvaChiaveApp,
  type StatoChiaveApp,
} from '@/lib/db';
import { collegaCasellaMail, fetchCaselleMail, importaRichiesteDaMail, type CasellaMail } from '@/lib/mail';
import { invalidaHubspotAttivo } from '@/lib/hubspot';
import { avvisa } from '@/lib/dialoghi';

const CHIAVE_CASELLA_LETTURA = 'mail.casella_lettura';

const CASELLA_VUOTA = { email: '', imapHost: '', imapPassword: '', ignoraCertTls: true };

export default function Impostazioni() {
  const { session } = useAuth();
  const admin = isAdmin(session?.user?.email);
  const [casella, setCasella] = useState('');
  // Da quale cassetta leggere: serve solo quando l'indirizzo sopra e' un alias.
  const [lettura, setLettura] = useState('');
  const [originale, setOriginale] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [provando, setProvando] = useState(false);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);
  // Le caselle vere di AI Mail + il modulo per collegarne una nuova.
  const [caselle, setCaselle] = useState<CasellaMail[]>([]);
  const [formCasella, setFormCasella] = useState(false);
  const [nuova, setNuova] = useState(CASELLA_VUOTA);
  const [collegando, setCollegando] = useState(false);
  /**
   * ⭐ I DATI PER LA FATTURAZIONE (27/08/2026, richiesta dell'utente:
   * «mettili cambiabili da impostazioni solo da admin»).
   *
   * Sono l'identità fiscale dell'azienda: da qui parte ogni template dei
   * documenti, così una partita IVA si scrive una volta sola e se cambia si
   * cambia in un posto. ⚠️ Li scrive solo l'amministratore, e non è un filtro
   * di questa schermata: lo impone la RLS della tabella `impostazioni`.
   */
  const [azienda, setAzienda] = useState<DatiAzienda>({
    ragioneSociale: '',
    piva: '',
    indirizzo: '',
    capCitta: '',
    sdi: '',
    pec: '',
    iban: '',
    intestatarioConto: '',
    banca: '',
    bic: '',
    ammReferente: '',
    ammEmail: '',
    ammTelefono: '',
  });
  const [salvandoAzienda, setSalvandoAzienda] = useState(false);
  const [esitoAzienda, setEsitoAzienda] = useState<string | null>(null);

  const caricaCaselle = useCallback(() => {
    // Best-effort: se AI Mail non è ancora aggiornata l'elenco non arriva, ma
    // il campo scritto a mano continua a funzionare come prima.
    fetchCaselleMail()
      .then(setCaselle)
      .catch(() => setCaselle([]));
  }, []);

  useEffect(() => {
    caricaCaselle();
  }, [caricaCaselle]);

  useEffect(() => {
    leggiDatiAzienda().then(setAzienda).catch(() => {});
  }, []);

  /**
   * Salva i dati di fatturazione.
   *
   * ⚠️ Sei chiavi, sei scritture: se una fallisce si dice QUALE campo non è
   * passato, invece di un «non riuscito» che lascia lo schermo pieno di dati e
   * il database a metà. E si rilegge da capo, così quello che resta a schermo è
   * quello che c'è davvero scritto.
   */
  async function salvaAzienda() {
    if (salvandoAzienda) return;
    setSalvandoAzienda(true);
    setEsitoAzienda(null);
    const campi: [keyof DatiAzienda, string, string][] = [
      ['ragioneSociale', CHIAVI_AZIENDA.ragioneSociale, 'ragione sociale'],
      ['piva', CHIAVI_AZIENDA.piva, 'partita IVA'],
      ['indirizzo', CHIAVI_AZIENDA.indirizzo, 'indirizzo'],
      ['capCitta', CHIAVI_AZIENDA.capCitta, 'CAP e città'],
      ['sdi', CHIAVI_AZIENDA.sdi, 'codice SDI'],
      ['pec', CHIAVI_AZIENDA.pec, 'PEC'],
      ['iban', CHIAVI_AZIENDA.iban, 'IBAN'],
      ['intestatarioConto', CHIAVI_AZIENDA.intestatarioConto, 'intestatario del conto'],
      ['banca', CHIAVI_AZIENDA.banca, 'banca'],
      ['bic', CHIAVI_AZIENDA.bic, 'BIC'],
      ['ammReferente', CHIAVI_AZIENDA.ammReferente, 'referente amministrativo'],
      ['ammEmail', CHIAVI_AZIENDA.ammEmail, 'email amministrazione'],
      ['ammTelefono', CHIAVI_AZIENDA.ammTelefono, 'telefono amministrazione'],
    ];
    try {
      for (const [chiaveStato, chiave, etichetta] of campi) {
        try {
          await salvaImpostazione(chiave, azienda[chiaveStato]);
        } catch (e: any) {
          throw new Error(`${etichetta}: ${e?.message ?? 'non salvata'}`);
        }
      }
      setAzienda(await leggiDatiAzienda());
      setEsitoAzienda('Dati di fatturazione salvati.');
    } catch (e: any) {
      setEsitoAzienda(e?.message ?? 'Non salvati.');
    } finally {
      setSalvandoAzienda(false);
    }
  }

  /** Collega la casella in AI Mail e la imposta subito come casella delle richieste. */
  async function collega() {
    if (collegando) return;
    setCollegando(true);
    setEsito(null);
    try {
      const r = await collegaCasellaMail(nuova);
      setCasella(r.casella);
      await salvaImpostazione(CHIAVE_CASELLA_RICHIESTE, r.casella);
      setNuova(CASELLA_VUOTA);
      setFormCasella(false);
      caricaCaselle();
      setEsito({
        ok: true,
        testo:
          'Casella «' +
          r.casella +
          '» collegata in AI Mail e impostata qui. Prova il collegamento per vedere quante richieste arrivano.',
      });
    } catch (e) {
      setEsito({ ok: false, testo: (e as Error)?.message ?? 'Collegamento non riuscito.' });
    } finally {
      setCollegando(false);
    }
  }

  const carica = useCallback(async () => {
    const v = (await leggiImpostazione(CHIAVE_CASELLA_RICHIESTE)) ?? '';
    setCasella(v);
    setOriginale(v);
    setLettura((await leggiImpostazione(CHIAVE_CASELLA_LETTURA)) ?? '');
  }, []);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const cambiata = casella.trim() !== originale.trim();

  async function salva() {
    if (!cambiata || salvando) return;
    setSalvando(true);
    setEsito(null);
    try {
      await salvaImpostazione(CHIAVE_CASELLA_RICHIESTE, casella);
      await salvaImpostazione(CHIAVE_CASELLA_LETTURA, lettura.trim());
      setOriginale(casella.trim());
      avvisa('Salvato', 'Da adesso le Richieste Web arrivano da questa casella.');
    } catch (e: any) {
      avvisa(
        'Non salvato',
        e?.message?.includes('row-level security')
          ? 'Serve un account amministratore per cambiare le impostazioni.'
          : (e?.message ?? 'Riprova più tardi.'),
      );
    } finally {
      setSalvando(false);
    }
  }

  /** Prova vera: legge la casella e importa. Dice cosa è successo, non "ok". */
  async function prova() {
    if (provando) return;
    setProvando(true);
    setEsito(null);
    try {
      const { lette, importate } = await importaRichiesteDaMail();
      setEsito({
        ok: true,
        testo: importate
          ? `Collegata: ${lette} mail lette, ${importate} nuove richieste importate.`
          : `Collegata: ${lette} mail lette, nessuna nuova da importare.`,
      });
    } catch (e: any) {
      setEsito({ ok: false, testo: e?.message ?? 'Prova non riuscita.' });
    } finally {
      setProvando(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ⭐ DATI PER LA FATTURAZIONE — stanno per primi: sono l'identità
          dell'azienda, e da qui parte l'intestazione di ogni documento che
          esce verso un cliente. */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>DATI PER LA FATTURAZIONE</Text>
        <Text style={styles.aiuto}>
          L&apos;identità fiscale dell&apos;azienda. Da qui parte ogni template delle pro-forme: si scrivono
          una volta, e se cambiano si cambiano qui — non su ogni insegna.
        </Text>

        <Text style={styles.campoLabel}>Ragione sociale</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={azienda.ragioneSociale}
          onChangeText={(v) => setAzienda({ ...azienda, ragioneSociale: v })}
          editable={admin}
          placeholder="Deluxy Srl"
          placeholderTextColor={colors.grigio}
        />

        <Text style={styles.campoLabel}>Partita IVA</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={azienda.piva}
          onChangeText={(v) => setAzienda({ ...azienda, piva: v })}
          editable={admin}
          placeholder="11453140961"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
        />

        <Text style={styles.campoLabel}>Indirizzo</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={azienda.indirizzo}
          onChangeText={(v) => setAzienda({ ...azienda, indirizzo: v })}
          editable={admin}
          placeholder="Via Varesina 60"
          placeholderTextColor={colors.grigio}
        />

        <Text style={styles.campoLabel}>CAP e città</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={azienda.capCitta}
          onChangeText={(v) => setAzienda({ ...azienda, capCitta: v })}
          editable={admin}
          placeholder="20156 Milano"
          placeholderTextColor={colors.grigio}
        />

        <Text style={styles.campoLabel}>Codice SDI</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={azienda.sdi}
          onChangeText={(v) => setAzienda({ ...azienda, sdi: v })}
          editable={admin}
          placeholder="M5UXCR1"
          placeholderTextColor={colors.grigio}
          autoCapitalize="characters"
        />

        <Text style={styles.campoLabel}>PEC</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={azienda.pec}
          onChangeText={(v) => setAzienda({ ...azienda, pec: v })}
          editable={admin}
          placeholder="deluxy@pec.net"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        {/* ————— Informazioni bancarie ————— */}
        <Text style={[styles.cardLabel, styles.sottoSezione]}>INFORMAZIONI BANCARIE</Text>
        <Text style={styles.aiuto}>
          Dove il cliente manda i soldi. Finiscono in fondo alla pro-forma: un documento che chiede un
          pagamento senza dire dove mandarlo fa perdere un giro di mail.
        </Text>

        <Text style={styles.campoLabel}>IBAN</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={azienda.iban}
          onChangeText={(v) => setAzienda({ ...azienda, iban: v })}
          editable={admin}
          placeholder="IT00 X000 0000 0000 0000 0000 000"
          placeholderTextColor={colors.grigio}
          autoCapitalize="characters"
        />

        <Text style={styles.campoLabel}>Intestato a</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={azienda.intestatarioConto}
          onChangeText={(v) => setAzienda({ ...azienda, intestatarioConto: v })}
          editable={admin}
          placeholder="se diverso dalla ragione sociale"
          placeholderTextColor={colors.grigio}
        />

        <Text style={styles.campoLabel}>Banca</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={azienda.banca}
          onChangeText={(v) => setAzienda({ ...azienda, banca: v })}
          editable={admin}
          placeholder="l'IBAN da solo non dice a chi si bonifica"
          placeholderTextColor={colors.grigio}
        />

        <Text style={styles.campoLabel}>BIC / SWIFT</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={azienda.bic}
          onChangeText={(v) => setAzienda({ ...azienda, bic: v })}
          editable={admin}
          placeholder="serve ai bonifici dall'estero"
          placeholderTextColor={colors.grigio}
          autoCapitalize="characters"
        />

        {/* ————— Contatti amministrativi ————— */}
        <Text style={[styles.cardLabel, styles.sottoSezione]}>CONTATTI AMMINISTRATIVI</Text>
        <Text style={styles.aiuto}>
          Chi risponde di fatture e pagamenti. Diventano i contatti stampati sul documento, così il cliente
          sa a chi scrivere senza cercare.
        </Text>

        <Text style={styles.campoLabel}>Referente</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={azienda.ammReferente}
          onChangeText={(v) => setAzienda({ ...azienda, ammReferente: v })}
          editable={admin}
          placeholder="Amministrazione"
          placeholderTextColor={colors.grigio}
        />

        <Text style={styles.campoLabel}>Email</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={azienda.ammEmail}
          onChangeText={(v) => setAzienda({ ...azienda, ammEmail: v })}
          editable={admin}
          placeholder="amministrazione@deluxy.it"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.campoLabel}>Telefono</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={azienda.ammTelefono}
          onChangeText={(v) => setAzienda({ ...azienda, ammTelefono: v })}
          editable={admin}
          placeholder="+39 02 000000"
          placeholderTextColor={colors.grigio}
          keyboardType="phone-pad"
        />

        {admin ? (
          <>
            <Pressable
              style={[styles.btn, salvandoAzienda && styles.btnOff]}
              disabled={salvandoAzienda}
              onPress={salvaAzienda}
            >
              <Text style={styles.btnTxt}>{salvandoAzienda ? 'Salvo…' : 'Salva'}</Text>
            </Pressable>
            <Text style={styles.nota}>
              ⚠️ Cambiarli qui NON cambia i documenti già emessi: l&apos;intestazione con cui sono usciti
              resta su di loro. Vale per i prossimi, e per i template che si creano da adesso.
            </Text>
          </>
        ) : (
          <Text style={styles.nota}>Solo un amministratore può cambiarli.</Text>
        )}
        {esitoAzienda ? <Text style={styles.nota}>{esitoAzienda}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>RICHIESTE WEB</Text>
        <Text style={styles.aiuto}>
          La casella di posta da cui arrivano le richieste dei clienti. Ogni mail non ancora
          importata diventa una richiesta da qualificare; le mail già viste non si ripetono.
        </Text>
        <Text style={styles.campoLabel}>Casella</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={casella}
          onChangeText={setCasella}
          editable={admin}
          placeholder="commerciale@deluxy.it"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        {!admin ? (
          <Text style={styles.nota}>Solo un amministratore può cambiarla.</Text>
        ) : (
          <Text style={styles.nota}>
            Dev&apos;essere una casella già configurata in AI Mail (utente attivo con quell&apos;indirizzo
            e IMAP collegato): è AI Mail che legge la posta, Scout la riceve da lì.
          </Text>
        )}

        <Text style={styles.campoLabel}>Da quale cassetta leggere</Text>
        <TextInput
          style={[styles.input, !admin && styles.inputOff]}
          value={lettura}
          onChangeText={setLettura}
          editable={admin}
          placeholder="(la stessa casella)"
          placeholderTextColor={colors.grigio}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text style={styles.nota}>
          Serve quando l’indirizzo qui sopra è un <Text style={styles.forte}>alias</Text>: la posta
          indirizzata a «{casella || 'quell’indirizzo'}» viene consegnata dentro un’altra cassetta, e
          si legge da lì. Lasciandolo vuoto si legge dalla casella stessa. In ogni caso si importa
          <Text style={styles.forte}> solo</Text> ciò che era indirizzato all’indirizzo qui sopra.
        </Text>

        {/* Le caselle che AI Mail ha DAVVERO: si sceglie invece di indovinare.
            L'errore «non c'è una casella attiva …» nasceva quasi sempre da un
            indirizzo scritto a mano che in AI Mail non esisteva. */}
        {caselle.length ? (
          <View style={styles.chips}>
            {caselle.map((c) => (
              <Pressable
                key={`${c.utente}-${c.email}`}
                style={[styles.chip, casella === (c.utente ?? c.email) && styles.chipOn]}
                onPress={() => admin && setCasella(c.utente ?? c.email)}
              >
                <Text style={[styles.chipTxt, casella === (c.utente ?? c.email) && styles.chipTxtOn]}>
                  {c.utente ?? c.email}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {admin ? (
          <>
            <Pressable style={styles.linkRiga} onPress={() => setFormCasella((v) => !v)}>
              <Ionicons name={formCasella ? 'chevron-up' : 'add-circle-outline'} size={16} color={colors.navy} />
              <Text style={styles.linkTxt}>
                {formCasella ? 'Chiudi' : 'La casella non c’è? Collegala da qui'}
              </Text>
            </Pressable>

            {formCasella ? (
              <View style={styles.formCasella}>
                <Text style={styles.nota}>
                  Le credenziali vengono salvate <Text style={styles.forte}>in AI Mail</Text>, cifrate: è
                  lei che legge la posta. Scout le inoltra e non le conserva. Prima di salvare si prova la
                  connessione, così una password sbagliata si scopre adesso.
                </Text>
                <Text style={styles.campoLabel}>Indirizzo</Text>
                <TextInput
                  style={styles.input}
                  value={nuova.email}
                  onChangeText={(v) => setNuova((n) => ({ ...n, email: v }))}
                  placeholder="commerciale@deluxy.it"
                  placeholderTextColor={colors.grigio}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <Text style={styles.campoLabel}>Server IMAP</Text>
                <TextInput
                  style={styles.input}
                  value={nuova.imapHost}
                  onChangeText={(v) => setNuova((n) => ({ ...n, imapHost: v }))}
                  placeholder="pop.securemail.pro (Register.it)"
                  placeholderTextColor={colors.grigio}
                  autoCapitalize="none"
                />
                <Text style={styles.campoLabel}>Password della casella</Text>
                <TextInput
                  style={styles.input}
                  value={nuova.imapPassword}
                  onChangeText={(v) => setNuova((n) => ({ ...n, imapPassword: v }))}
                  placeholder="••••••••"
                  placeholderTextColor={colors.grigio}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <Pressable
                  style={styles.spunta}
                  onPress={() => setNuova((n) => ({ ...n, ignoraCertTls: !n.ignoraCertTls }))}
                >
                  <Ionicons
                    name={nuova.ignoraCertTls ? 'checkbox-outline' : 'square-outline'}
                    size={18}
                    color={colors.navy}
                  />
                  <Text style={styles.spuntaTxt}>
                    Ignora il nome sul certificato TLS — serve con Register.it, che presenta un
                    certificato *.securemail.pro
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.btn, collegando && styles.btnOff]}
                  disabled={collegando}
                  onPress={collega}
                >
                  <Text style={styles.btnTxt}>{collegando ? 'Collego…' : 'Collega la casella'}</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}

        <View style={styles.azioni}>
          {admin ? (
            <Pressable style={[styles.btn, (!cambiata || salvando) && styles.btnOff]} disabled={!cambiata || salvando} onPress={salva}>
              <Text style={styles.btnTxt}>{salvando ? 'Salvo…' : 'Salva'}</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.btnGhost, provando && styles.btnOff]} disabled={provando} onPress={prova}>
            <Ionicons name="sync-outline" size={15} color={colors.navy} />
            <Text style={styles.btnGhostTxt}>{provando ? 'Provo…' : 'Prova il collegamento'}</Text>
          </Pressable>
        </View>

        {esito ? (
          <View style={[styles.esito, esito.ok ? styles.esitoOk : styles.esitoKo]}>
            <Ionicons
              name={esito.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={16}
              color={esito.ok ? colors.successo : colors.errore}
            />
            <Text style={[styles.esitoTxt, { color: esito.ok ? colors.successo : colors.errore }]}>{esito.testo}</Text>
          </View>
        ) : null}
      </View>

      {/* Le chiavi delle altre app: le vede e le cambia solo l'amministratore
          (RLS sulla tabella chiavi_app, migr. 0044). */}
      {admin ? <SezioneAppCollegate /> : null}

      {/* HubSpot: presto dismesso — l'interruttore per spegnerlo prima. */}
      {admin ? <SezioneHubspot /> : null}

      {/* Il verso opposto: la chiave con cui le ALTRE app chiamano Scout. */}
      {admin ? <SezioneChiaveIngresso /> : null}

      <Text style={styles.piede}>
        Le chiavi delle altre app le inserisce e le vede solo un amministratore, e restano sul
        server: l&apos;app non le riceve mai. Le password delle caselle continuano a stare nei
        secret e si cambiano da riga di comando.
      </Text>
    </ScrollView>
  );
}

/**
 * La chiave con cui le ALTRE app chiamano Scout — il verso opposto della
 * sezione qui sopra.
 *
 * Perché serve una schermata: quella chiave vive come secret di Supabase, e un
 * secret **non si rilegge**. Quando bisogna darla a un'altra app (il registro
 * Anagrafiche, AI Mail) o la si ha scritta da qualche parte, o si è costretti a
 * rigenerarla dalla riga di comando — spegnendo in silenzio le integrazioni che
 * la usavano già. Qui si genera, si copia subito, e si sa sempre se c'è.
 */
/**
 * ⭐ L'INTERRUTTORE DI HUBSPOT (28/08/2026, richiesta dell'utente: «metti in
 * impostazioni la possibilità di disattivare la connessione con hubspot che
 * presto sarà dismesso»).
 *
 * ⚠️ Spegnere DICE cosa spegne, prima di farlo: il sync delle visite, le
 * trattative lette dal CRM (che spariscono dall'elenco), la conciliazione
 * contatti. Un interruttore senza conseguenze scritte si preme per scoprirle.
 *
 * ⚠️ Il valore si rilegge dal server dopo il salvataggio: quello che si vede
 * è quello che c'è scritto, non quello che si è appena premuto.
 */
function SezioneHubspot() {
  const [attivo, setAttivo] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const leggi = useCallback(() => {
    leggiImpostazione('hubspot.attivo')
      .then((v) => setAttivo((v ?? 'si').trim() !== 'no'))
      .catch(() => setAttivo(null));
  }, []);
  useEffect(() => {
    leggi();
  }, [leggi]);

  async function cambia(nuovo: boolean) {
    if (salvando || attivo === null || nuovo === attivo) return;
    setSalvando(true);
    setErrore(null);
    try {
      await salvaImpostazione('hubspot.attivo', nuovo ? 'si' : 'no');
      invalidaHubspotAttivo();
      leggi();
    } catch (e) {
      setErrore(String((e as Error)?.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>HUBSPOT</Text>
      {attivo === null ? (
        <ActivityIndicator size="small" style={{ alignSelf: 'flex-start' }} />
      ) : (
        <>
          <View style={styles.hsRiga}>
            <View style={{ flex: 1 }}>
              <Text style={styles.forte}>{attivo ? 'Connessione attiva' : 'Connessione disattivata'}</Text>
              <Text style={styles.aiuto}>
                {attivo
                  ? 'Le visite si sincronizzano sul CRM e le trattative di HubSpot compaiono nell’elenco.'
                  : 'Niente sync delle visite, niente trattative dal CRM, niente conciliazione contatti. Le visite restano salvate in Scout.'}
              </Text>
            </View>
            <Pressable
              style={[styles.btn, salvando && styles.btnOff, !attivo && styles.hsBtnRiattiva]}
              disabled={salvando}
              onPress={() => cambia(!attivo)}
              accessibilityLabel={attivo ? 'Disattiva la connessione HubSpot' : 'Riattiva la connessione HubSpot'}
            >
              <Text style={styles.btnTxt}>{salvando ? 'Salvo…' : attivo ? 'Disattiva' : 'Riattiva'}</Text>
            </Pressable>
          </View>
          {attivo ? (
            <Text style={styles.nota}>
              HubSpot sarà dismesso: da qui si spegne la connessione senza toccare il codice. Vale anche sul
              server — con l’interruttore spento le funzioni di sync rifiutano qualunque chiamata.
            </Text>
          ) : (
            <Text style={styles.nota}>
              I dati già copiati (aziende, contatti, deal) restano nel database: nessuna cancellazione. Riattivando,
              tutto riparte com’era.
            </Text>
          )}
          {errore ? <Text style={[styles.nota, { color: colors.errore }]}>Non salvato: {errore}</Text> : null}
        </>
      )}
    </View>
  );
}

function SezioneChiaveIngresso() {
  const [configurata, setConfigurata] = useState<boolean | null>(null);
  const [chiave, setChiave] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    chiaveIngressoConfigurata()
      .then(setConfigurata)
      .catch(() => setConfigurata(false));
  }, []);

  async function genera() {
    setBusy(true);
    setErrore(null);
    try {
      const nuova = await generaChiaveIngresso();
      setChiave(nuova);
      setConfigurata(true);
    } catch (e) {
      setErrore((e as Error)?.message ?? 'Non è stato possibile generare la chiave.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>CHI PUÒ SCRIVERE IN SCOUT</Text>
      <Text style={styles.aiuto}>
        La chiave con cui le altre app parlano a Scout: il registro Anagrafiche quando crea un partner, AI Mail quando
        apre una trattativa. Generala qui e incollala di là.
      </Text>

      <View style={styles.appTesta}>
        <Text style={styles.appNome}>Chiave d&apos;ingresso</Text>
        <View style={[styles.appStato, configurata ? styles.appStatoOk : styles.appStatoNo]}>
          <Text style={[styles.appStatoTxt, configurata ? styles.appStatoTxtOk : styles.appStatoTxtNo]}>
            {configurata === null ? '…' : configurata ? 'impostata' : 'da generare'}
          </Text>
        </View>
      </View>

      {/* Il valore si vede ADESSO o mai più: dopo, la schermata sa solo che c'è. */}
      {chiave ? (
        <View style={styles.chiaveBox}>
          <Text style={styles.chiaveTxt} selectable>
            {chiave}
          </Text>
          <Text style={styles.chiaveNota}>
            Copiala adesso: non si potrà più rileggere. Va incollata in Anagrafiche (variabile
            COMMERCIALE_API_KEY su Vercel) e in AI Mail (Impostazioni App → Commerciale).
          </Text>
        </View>
      ) : null}

      {errore ? <Text style={styles.erroreChiave}>{errore}</Text> : null}

      <Pressable style={[styles.btn, busy && styles.btnOff]} onPress={genera} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.bianco} />
        ) : (
          <Text style={styles.btnTxt}>{configurata ? 'Rigenera la chiave' : 'Genera la chiave'}</Text>
        )}
      </Pressable>

      {configurata ? (
        <Text style={styles.aiuto}>
          ⚠️ Rigenerandola, la vecchia smette di funzionare all&apos;istante: le app che la usano vanno aggiornate
          subito, o le loro chiamate cominciano a essere rifiutate senza dire niente.
        </Text>
      ) : null}
    </View>
  );
}

/** Elenco delle app Deluxy richiamabili, con la loro chiave. Solo admin. */
/**
 * ⭐ **CHE COSA DICE LA PILLOLA** (03/09/2026).
 *
 * Quattro risposte, perché quattro sono le situazioni vere — e la differenza
 * fra la seconda e la terza è quella che è costata settimane di silenzio:
 *
 *   · «da collegare»  nessuna chiave salvata;
 *   · «da provare»    la chiave c'è ma nessuno ha mai chiamato l'altra app:
 *                     **non è un collegamento**, è un valore incollato;
 *   · «non risponde»  provata, e l'altra app ha detto di no (401, 404, rete);
 *   · «collegata»     provata, e ha risposto. Solo questa è verde.
 */
/** Le app con una rotta di sola lettura da chiamare per la prova. ⚠️ Aggiungere
 *  qui quando un'altra app ne espone una: è l'unico posto da toccare. */
const PROVABILI = new Set(['piattaforma']);

function pillolaDi(s: StatoChiaveApp | undefined): { label: string; tono: 'ok' | 'neutro' | 'ko' } {
  if (!s?.configurata) return { label: 'da collegare', tono: 'neutro' };
  // ⚠️ «da provare» è GRIGIO, non rosso: non sappiamo che sia rotto, sappiamo
  // che non l'abbiamo verificato. Colorarlo di allarme farebbe sembrare guaste
  // sette app che funzionano, e in due giorni nessuno guarderebbe più il colore.
  if (s.provata_il == null) return { label: 'da provare', tono: 'neutro' };
  return s.prova_ok ? { label: 'collegata', tono: 'ok' } : { label: 'non risponde', tono: 'ko' };
}

function SezioneAppCollegate() {
  /**
   * ⚠️ «COLLEGATA» NON SI DEDUCE DALLA CHIAVE (27/08/2026). La pillola verde
   * qui accanto dice solo che un valore è stato incollato: non che sia la
   * chiave giusta, né che l'altra app risponda. È già successo — una chiave
   * incollata, la spunta verde, e l'app dall'altra parte che rispondeva 401
   * senza che nessuno lo sapesse.
   *
   * Questa prova CHIAMA davvero e riporta l'esito com'è. Per ora esiste per la
   * piattaforma consegne, che è l'unica con una rotta di sola lettura pensata
   * apposta; le altre si aggiungeranno quando ce l'avranno.
   */
  const [provaApp, setProvaApp] = useState<string | null>(null);
  const [esitoProva, setEsitoProva] = useState<{ app: string; ok: boolean; testo: string } | null>(null);

  async function provaCollegamento(idApp: string) {
    if (provaApp) return;
    setProvaApp(idApp);
    setEsitoProva(null);
    try {
      const esito = await fetchServiziPiattaforma();
      const ok = esito.ok;
      const testo = esito.ok
        ? `Risponde: ${esito.servizi.length} servizi nel catalogo.`
        : esito.motivo === 'non_configurato'
          ? 'Nessuna chiave salvata.'
          : esito.dettaglio;
      setEsitoProva({ app: idApp, ok, testo });
      // ⭐ L'esito diventa un FATTO SCRITTO (migr. 0116): finché viveva solo
      // qui, chiudere la schermata lo cancellava — e la pillola tornava a dire
      // «collegata» a una chiave che l'altra app rifiuta.
      try {
        await registraProvaChiaveApp(idApp, ok, testo);
        await carica();
      } catch {
        // la prova l'hai comunque vista qui sotto: non si perde l'informazione
      }
    } catch (e: any) {
      setEsitoProva({ app: idApp, ok: false, testo: String(e?.message ?? e) });
    } finally {
      setProvaApp(null);
    }
  }

  const [stato, setStato] = useState<StatoChiaveApp[]>([]);
  const [aperta, setAperta] = useState<string | null>(null);
  const [chiave, setChiave] = useState('');
  const [urlBase, setUrlBase] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    try {
      setStato(await fetchStatoChiaviApp());
      setErrore(null);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      // Il caso più probabile la prima volta: la tabella non c'è ancora.
      setErrore(
        /chiavi_app|schema cache|does not exist/i.test(msg)
          ? 'Manca la tabella delle chiavi: applica la migrazione 0044_chiavi_app.sql (scripts/mgmt-query.mjs).'
          : msg || 'Impossibile leggere le app collegate.',
      );
    }
  }, []);

  useEffect(() => {
    carica();
  }, [carica]);

  function apri(appId: string) {
    const s = stato.find((x) => x.app === appId);
    setAperta(aperta === appId ? null : appId);
    setChiave('');
    setUrlBase(s?.url_base ?? '');
  }

  /**
   * ⭐ **SALVARE È PROVARE** (03/09/2026, richiesta dell'utente: «ho bisogno che
   * la chiave funzioni in base a salvamento su app»).
   *
   * Chi incolla una chiave vuole sapere SUBITO se funziona — non fra due
   * settimane, quando qualcuno prova a mandare una richiesta di evasione. Prima
   * il salvataggio era muto e la pillola si accendeva verde comunque: è così
   * che nella casella della piattaforma è rimasto un IBAN per settimane.
   *
   * Quindi: si salva, si chiama davvero l'altra app, e la risposta si mostra e
   * si scrive (migr. 0116). ⚠️ La chiave resta salvata anche se la prova va
   * male: magari è giusta e l'altra app è giù in questo momento — cancellarla
   * al primo errore vorrebbe dire far ribattere una chiave buona. Ma la
   * schermata NON dice «fatto»: dice che cosa ha risposto.
   *
   * ⚠️ La prova esiste solo per le app che hanno una rotta di sola lettura
   * pensata apposta (oggi: la piattaforma consegne). Per le altre si salva e la
   * pillola resta «da provare» — che è la verità, non un'omissione.
   */
  async function salva(appId: string) {
    if (!chiave.trim() || salvando) return;
    setSalvando(true);
    setErrore(null);
    setEsitoProva(null);
    try {
      await salvaChiaveApp(appId, chiave, urlBase);
      setChiave('');
      if (PROVABILI.has(appId)) {
        // Non si chiude il pannello: l'esito si legge qui sotto.
        await provaCollegamento(appId);
      } else {
        setAperta(null);
      }
      await carica();
    } catch (e: any) {
      setErrore(e?.message ?? 'Chiave non salvata.');
    } finally {
      setSalvando(false);
    }
  }

  async function rimuovi(appId: string) {
    setSalvando(true);
    try {
      await rimuoviChiaveApp(appId);
      await carica();
    } catch (e: any) {
      setErrore(e?.message ?? 'Non rimossa.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>APP COLLEGATE</Text>
      <Text style={styles.aiuto}>
        Le altre app dell&apos;ecosistema che Scout può richiamare. Per ognuna serve la sua chiave
        API: incollala qui, resta sul server e non viene mai rimandata all&apos;app.
      </Text>

      {APP_DELUXY.map((app) => {
        const s = stato.find((x) => x.app === app.id);
        const collegata = Boolean(s?.configurata);
        // ⚠️⚠️ **QUATTRO STATI, NON DUE** (03/09/2026, segnalazione dell'utente:
        // «ma io lo vedo in impostazioni»). La pillola diceva «collegata» a
        // qualunque valore incollato: nella riga della piattaforma c'era un
        // IBAN, la schermata diceva di sì, e la piattaforma rispondeva 401 a
        // ogni richiesta. Adesso «collegata» la dice solo una PROVA riuscita.
        const p = pillolaDi(s);
        return (
          <View key={app.id} style={styles.appRiga}>
            <Pressable style={styles.appTesta} onPress={() => apri(app.id)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.appNome}>{app.nome}</Text>
                <Text style={styles.appAiuto}>{app.aCosaServe}</Text>
                {/* Che cosa ha risposto l'altra app l'ultima volta, e quando:
                    un esito che vive solo nella schermata di chi ha premuto il
                    bottone non lo sa nessun altro. */}
                {s?.provata_il ? (
                  <Text style={[styles.appAiuto, s.prova_ok ? styles.provaOk : styles.provaKo]}>
                    Provata il {new Date(s.provata_il).toLocaleDateString('it-IT')}
                    {s.prova_dettaglio ? ` · ${s.prova_dettaglio}` : ''}
                  </Text>
                ) : collegata ? (
                  <Text style={styles.appAiuto}>
                    Mai provata: la chiave c&apos;è, ma non sappiamo se l&apos;altra app la accetta.
                  </Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.appStato,
                  p.tono === 'ok' ? styles.appStatoOk : p.tono === 'ko' ? styles.appStatoKo : styles.appStatoNo,
                ]}
              >
                <Text
                  style={[
                    styles.appStatoTxt,
                    p.tono === 'ok' ? styles.appStatoTxtOk : p.tono === 'ko' ? styles.appStatoTxtKo : styles.appStatoTxtNo,
                  ]}
                >
                  {p.label}
                </Text>
              </View>
              <Ionicons name={aperta === app.id ? 'chevron-up' : 'chevron-down'} size={16} color={colors.grigio} />
            </Pressable>

            {aperta === app.id ? (
              <View style={styles.appForm}>
                <Text style={styles.campoLabel}>Chiave API</Text>
                <TextInput
                  style={styles.input}
                  value={chiave}
                  onChangeText={setChiave}
                  placeholder={collegata ? 'Già impostata — incollane una nuova per sostituirla' : 'dlxk_…'}
                  placeholderTextColor={colors.grigio}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
                {/* ⚠️ DOVE SI PRENDE, detto qui: senza, l'unica strada nota era la
                    riga di comando — e chi lavora in app non ce l'ha. */}
                {app.id === 'piattaforma' ? (
                  <Text style={styles.aiuto}>
                    La chiave si crea nella piattaforma consegne: Configurazione → Chiavi delle app → Nuova, col
                    permesso di SCRITTURA. Si vede una volta sola, quindi incollala qui subito.
                  </Text>
                ) : null}
                <Text style={styles.campoLabel}>Indirizzo (solo se diverso dal solito)</Text>
                <TextInput
                  style={styles.input}
                  value={urlBase}
                  onChangeText={setUrlBase}
                  placeholder={app.urlDefault}
                  placeholderTextColor={colors.grigio}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.azioni}>
                  <Pressable
                    style={[styles.btn, (!chiave.trim() || salvando) && styles.btnOff]}
                    disabled={!chiave.trim() || salvando}
                    onPress={() => salva(app.id)}
                  >
                    <Text style={styles.btnTxt}>
                      {salvando ? 'Salvo e provo…' : PROVABILI.has(app.id) ? 'Salva e prova' : 'Salva la chiave'}
                    </Text>
                  </Pressable>
                  {PROVABILI.has(app.id) ? (
                    <Pressable
                      style={[styles.btnGhost, provaApp === app.id && styles.btnOff]}
                      disabled={!!provaApp}
                      onPress={() => provaCollegamento(app.id)}
                    >
                      <Ionicons name="pulse-outline" size={15} color={colors.navy} />
                      <Text style={styles.btnGhostTxt}>
                        {provaApp === app.id ? 'Provo…' : 'Prova il collegamento'}
                      </Text>
                    </Pressable>
                  ) : null}
                  {collegata ? (
                    <Pressable style={styles.btnGhost} disabled={salvando} onPress={() => rimuovi(app.id)}>
                      <Ionicons name="trash-outline" size={15} color={colors.navy} />
                      <Text style={styles.btnGhostTxt}>Scollega</Text>
                    </Pressable>
                  ) : null}
                </View>

                {/* ⚠️ L'esito si scrive PER ESTESO, anche quando è brutto: «401
                    chiave non valida» dice cosa fare, «non riuscito» manda a
                    indovinare — e a reincollare la stessa chiave sbagliata. */}
                {esitoProva && esitoProva.app === app.id ? (
                  <View style={[styles.esito, esitoProva.ok ? styles.esitoOk : styles.esitoKo]}>
                    <Ionicons
                      name={esitoProva.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                      size={16}
                      color={esitoProva.ok ? colors.successo : colors.errore}
                    />
                    <Text style={[styles.esitoTxt, { color: esitoProva.ok ? colors.successo : colors.errore }]}>
                      {esitoProva.testo}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      {errore ? (
        <View style={[styles.esito, styles.esitoKo]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.errore} />
          <Text style={[styles.esitoTxt, { color: colors.errore }]}>{errore}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    backgroundColor: colors.bianco,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { color: colors.testo, fontSize: 12.5 },
  chipTxtOn: { color: colors.bianco, fontWeight: '700' },
  linkRiga: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  linkTxt: { color: colors.navy, fontSize: 13, fontWeight: '600' },
  formCasella: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: spacing.sm,
    marginTop: 2,
  },
  spunta: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
  spuntaTxt: { flex: 1, color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  forte: { fontWeight: '700', color: colors.testo },
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.lg,
    gap: 8,
  },
  // Una sotto-sezione dentro la stessa card: stessa forma dell'etichetta, con
  // l'aria sopra che la stacca dal campo precedente.
  sottoSezione: { marginTop: spacing.lg },
  cardLabel: { color: colors.testoSoft, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  aiuto: { color: colors.testoSoft, fontSize: 13 },
  campoLabel: { color: colors.testoSoft, fontSize: 12.5, fontWeight: '500', marginTop: 4 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.testo,
    fontSize: 14,
  },
  inputOff: { backgroundColor: colors.sfondo, color: colors.testoSoft },
  nota: { color: colors.grigio, fontSize: 12 },
  azioni: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  // L'interruttore di HubSpot: testo a sinistra, bottone a destra. «Riattiva»
  // è grigio scuro, non oro: riaccendere un canale in dismissione non è
  // un'azione da celebrare.
  hsRiga: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hsBtnRiattiva: { backgroundColor: colors.grigio },
  btn: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9 },
  btnOff: { opacity: 0.5 },
  btnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13 },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  btnGhostTxt: { color: colors.navy, fontWeight: '700', fontSize: 13 },
  esito: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: radius.m, padding: 10, marginTop: 4 },
  esitoOk: { backgroundColor: colors.successoSoft },
  esitoKo: { backgroundColor: colors.erroreSoft },
  esitoTxt: { flex: 1, fontSize: 13, fontWeight: '600' },
  piede: { color: colors.grigio, fontSize: 12, paddingHorizontal: 4 },

  // App collegate (chiavi delle altre app Deluxy)
  appRiga: { borderTopWidth: 1, borderTopColor: colors.grigioChiaro, paddingTop: 10, marginTop: 2 },
  appTesta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appNome: { color: colors.testo, fontWeight: '700', fontSize: 14.5 },
  appAiuto: { color: colors.testoSoft, fontSize: 12, marginTop: 1 },
  appStato: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  appStatoOk: { backgroundColor: colors.successoSoft },
  appStatoNo: { backgroundColor: colors.sfondo },
  appStatoKo: { backgroundColor: '#FFF4F4' },
  appStatoTxt: { fontSize: 11, fontWeight: '700' },
  appStatoTxtOk: { color: colors.successo },
  provaOk: { color: colors.successo },
  provaKo: { color: colors.errore },
  appStatoTxtNo: { color: colors.grigio },
  appStatoTxtKo: { color: colors.errore },
  appForm: { gap: 6, marginTop: 8 },
  // Il segreto mostrato una volta: monospazio e selezionabile, perché il gesto
  // che segue è copiarlo.
  chiaveBox: {
    backgroundColor: colors.sfondo,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.ink,
    padding: spacing.sm,
    gap: 6,
    marginTop: 8,
  },
  chiaveTxt: { color: colors.testo, fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  chiaveNota: { color: colors.testoSoft, fontSize: 12, lineHeight: 17 },
  erroreChiave: { color: colors.errore, fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
});
