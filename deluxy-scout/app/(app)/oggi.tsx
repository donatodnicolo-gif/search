// "Oggi" — il cockpit del venditore (docs/VISIONE-COMMERCIALE.md).
// Non un recap: risponde nell'ordine alle 3 domande del mattino.
//   1. Dove vado e chi chiamo oggi?   → giro (territorio) + chiamate (telefono)
//   2. Quali trattative devo muovere? → follow-up di oggi e in ritardo, col valore
//   3. Cosa posso riprendere?         → le perse arrivate a maturazione
// Sopra, i numeri personali della settimana: servono a capire se si sta
// seminando abbastanza in ciascun canale, non a fare la pagella.
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Place, Task } from '@/types';
import { colors, coloreProprita, radius, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import {
  contaChiamateDal,
  fetchAllVisits,
  fetchLeads,
  fetchPlaces,
  fetchProfilo,
  fetchTask,
  fetchTutteTrattative,
  inviaPromemoriaEmail,
  type TrattativaConLuogo,
} from '@/lib/db';
import { daRicontattare, type Richiamo } from '@/lib/metrics';
import { GIORNI_RISPOSTA_LEAD } from '@/lib/cadenze';
import type { Lead } from '@/types';
import { avvisa } from '@/lib/dialoghi';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

function isoOggi(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoGiorniFa(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString();
}
function euro(n: number): string {
  return `€ ${n.toLocaleString('it-IT')}`;
}

export default function Oggi() {
  const router = useRouter();
  const { session } = useAuth();
  const [nome, setNome] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trattative, setTrattative] = useState<TrattativaConLuogo[]>([]);
  const [giro, setGiro] = useState<Place[]>([]);
  const [richiami, setRichiami] = useState<Richiamo[]>([]);
  const [leadNuovi, setLeadNuovi] = useState<Lead[]>([]);
  const [kpi, setKpi] = useState({ visite: 0, chiamate: 0, aperte: 0, pipeline: 0 });
  const [loading, setLoading] = useState(true);
  const [inviando, setInviando] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const uid = session?.user?.id;
      const settimanaFa = isoGiorniFa(7);
      const [t, tr, places, visits, chiamate7g, prof, tuttiLead] = await Promise.all([
        fetchTask(true),
        fetchTutteTrattative(),
        fetchPlaces(),
        fetchAllVisits(),
        contaChiamateDal(settimanaFa),
        uid ? fetchProfilo(uid) : Promise.resolve(null),
        fetchLeads().catch(() => []),
      ]);
      setLeadNuovi(tuttiLead.filter((l) => l.stato === 'nuovo'));
      setTasks(t.filter((x) => !x.completata));
      setTrattative(tr);
      setRichiami(daRicontattare(places, visits));
      setNome(prof?.nome?.split(' ')[0] ?? '');
      // Il giro di oggi = i target selezionati con la stella (⭐), ancora da visitare.
      setGiro(places.filter((p) => p.starred && p.stato === 'da_visitare' && !p.nascosto));
      // KPI personali della settimana.
      const aperteMie = tr.filter(
        (d) => d.fase !== 'closedwon' && d.fase !== 'closedlost' && (!d.owner || d.owner === uid),
      );
      setKpi({
        visite: visits.filter((v) => v.owner === uid && v.created_at >= settimanaFa).length,
        chiamate: chiamate7g,
        aperte: aperteMie.length,
        pipeline: aperteMie.reduce((s, d) => s + (d.valore_atteso ?? 0), 0),
      });
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      carica();
    }, [carica]),
  );

  const oggi = isoOggi();
  const uid = session?.user?.id;

  // 2. Trattative da muovere: scadute prima, poi quelle di oggi. Solo mie o non attribuite.
  const daMuovere = useMemo(
    () =>
      trattative
        .filter(
          (d) =>
            d.fase !== 'closedwon' &&
            d.fase !== 'closedlost' &&
            d.scadenza &&
            d.scadenza <= oggi &&
            (!d.owner || d.owner === uid),
        )
        .sort((a, b) => (a.scadenza! < b.scadenza! ? -1 : 1)),
    [trattative, oggi, uid],
  );

  // 3. Da riprendere: le perse arrivate a maturazione (riprendere_il ≤ oggi).
  const daRiprendere = useMemo(
    () =>
      trattative
        .filter((d) => d.fase === 'closedlost' && d.riprendere_il && d.riprendere_il <= oggi)
        .sort((a, b) => (a.riprendere_il! < b.riprendere_il! ? -1 : 1)),
    [trattative, oggi],
  );

  const richiamiOrdinati = useMemo(
    () => [...richiami].sort((a, b) => Number(b.inRitardo) - Number(a.inRitardo) || b.giorni - a.giorni),
    [richiami],
  );

  const taskOggi = useMemo(() => tasks.filter((t) => t.scadenza && t.scadenza <= oggi), [tasks, oggi]);

  const d = new Date();
  const dataLunga = `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
  const cose = giro.length + richiamiOrdinati.length + leadNuovi.length + daMuovere.length + daRiprendere.length + taskOggi.length;

  async function promemoria() {
    setInviando(true);
    try {
      const r = await inviaPromemoriaEmail();
      if (r.sent) avvisa('Inviato', 'Riepilogo inviato alla tua email.');
      else if (r.reason === 'niente_in_scadenza') avvisa('Tutto in ordine', 'Niente in scadenza: nessuna email necessaria.');
      else if (r.reason === 'smtp_non_configurato') avvisa('Email non attiva', 'L’invio email non è ancora configurato (SMTP).');
      else avvisa('Non inviato', r.reason ?? 'Riprova più tardi.');
    } catch {
      avvisa('Errore', 'Invio non riuscito, riprova.');
    } finally {
      setInviando(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={carica} />}
    >
      {/* Testata sobria: niente blocchi scenografici, si va dritti alle azioni */}
      <View style={styles.testata}>
        <Text style={styles.data}>{dataLunga}{nome ? ` · ${nome}` : ''}</Text>
        <Text style={styles.titolo}>
          {loading
            ? 'Preparo la giornata…'
            : cose
              ? `${cose} azioni per vendere oggi`
              : 'Coda vuota: vai a cercarti le occasioni sulla Mappa'}
        </Text>
      </View>

      {/* I numeri della settimana: sto seminando abbastanza in ogni canale? */}
      <View style={styles.kpiRow}>
        <Kpi label="Visite 7g" valore={String(kpi.visite)} icona="walk-outline" />
        <Kpi label="Chiamate 7g" valore={String(kpi.chiamate)} icona="call-outline" />
        <Kpi label="Trattative" valore={String(kpi.aperte)} icona="briefcase-outline" />
        <Kpi label="Pipeline" valore={euro(kpi.pipeline)} icona="trending-up-outline" stretta />
      </View>

      {/* 1a. TERRITORIO — il giro di oggi */}
      <Canale
        icona="walk-outline"
        titolo="Territorio — il giro di oggi"
        conteggio={giro.length}
        cta={giro.length ? 'Apri la Mappa e parti' : 'Scopri negozi sulla Mappa'}
        onCta={() => router.push('/(app)/mappa')}
        vuoto={loading ? 'Caricamento…' : 'Nessuna tappa selezionata: scegli i negozi con la ⭐ dalla Mappa.'}
      >
        {giro.slice(0, 5).map((p) => (
          <Pressable key={p.id} style={styles.riga} onPress={() => router.push(`/(app)/attivita/${p.id}`)}>
            <Ionicons name="storefront-outline" size={16} color={colors.navy} />
            <Text style={styles.rigaTitolo} numberOfLines={1}>{p.nome}</Text>
            <Text style={styles.rigaMeta} numberOfLines={1}>{p.zona ?? p.indirizzo ?? ''}</Text>
          </Pressable>
        ))}
      </Canale>

      {/* 1b. TELEFONO — chi chiamo oggi */}
      <Canale
        icona="call-outline"
        titolo="Telefono — chi chiamo oggi"
        conteggio={richiamiOrdinati.length}
        cta="Tutti i richiami in «Da fare»"
        onCta={() => router.push('/(app)/da-completare')}
        vuoto={loading ? 'Caricamento…' : 'Nessun richiamo maturato: i «da richiamare» delle visite compariranno qui.'}
      >
        {richiamiOrdinati.slice(0, 5).map((r) => (
          <Pressable key={r.place.id} style={styles.riga} onPress={() => router.push(`/(app)/attivita/${r.place.id}`)}>
            <Ionicons name="call-outline" size={16} color={r.inRitardo ? colors.errore : colors.navy} />
            <Text style={styles.rigaTitolo} numberOfLines={1}>{r.place.nome}</Text>
            <Text style={[styles.rigaMeta, r.inRitardo && styles.ritardo]}>
              {r.giorni}g fa{r.inRitardo ? ' · ritardo' : ''}
            </Text>
          </Pressable>
        ))}
      </Canale>

      {/* 1c. WEB — lead da qualificare (rispondere entro 2 giorni) */}
      {leadNuovi.length ? (
        <Canale
          icona="globe-outline"
          titolo="Web — richieste da qualificare"
          conteggio={leadNuovi.length}
          cta="Apri le Richieste Web"
          onCta={() => router.push('/(app)/lead')}
          vuoto=""
        >
          {leadNuovi.slice(0, 4).map((l) => {
            const eta = Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400_000);
            const ritardo = eta >= GIORNI_RISPOSTA_LEAD;
            return (
              <Pressable key={l.id} style={styles.riga} onPress={() => router.push('/(app)/lead')}>
                <Ionicons name="globe-outline" size={16} color={ritardo ? colors.errore : colors.navy} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rigaTitolo} numberOfLines={1}>{l.nome}</Text>
                  {l.messaggio ? <Text style={styles.rigaSotto} numberOfLines={1}>{l.messaggio}</Text> : null}
                </View>
                <Text style={[styles.rigaMeta, ritardo && styles.ritardo]}>
                  {eta === 0 ? 'oggi' : `${eta}g fa`}{ritardo ? ' · ritardo' : ''}
                </Text>
              </Pressable>
            );
          })}
        </Canale>
      ) : null}

      {/* 2. Trattative da muovere: prima i soldi fermi */}
      <Canale
        icona="briefcase-outline"
        titolo="Trattative da muovere"
        conteggio={daMuovere.length}
        cta="Apri le Trattative"
        onCta={() => router.push('/(app)/trattative')}
        vuoto={loading ? 'Caricamento…' : 'Nessun follow-up scaduto: le trattative con scadenza di oggi o in ritardo compariranno qui.'}
      >
        {daMuovere.slice(0, 5).map((t) => (
          <Pressable key={t.id} style={styles.riga} onPress={() => router.push('/(app)/trattative')}>
            <Ionicons name="briefcase-outline" size={16} color={t.scadenza! < oggi ? colors.errore : colors.navy} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rigaTitolo} numberOfLines={1}>{t.place_nome ?? t.oggetto ?? 'Trattativa'}</Text>
              {t.oggetto || t.next_action ? (
                <Text style={styles.rigaSotto} numberOfLines={1}>{t.oggetto ?? t.next_action}</Text>
              ) : null}
            </View>
            <Text style={[styles.rigaMeta, t.scadenza! < oggi && styles.ritardo]}>
              {t.valore_atteso ? euro(t.valore_atteso) : ''}
              {t.scadenza! < oggi ? ' · ritardo' : ''}
            </Text>
          </Pressable>
        ))}
      </Canale>

      {/* 3. Da riprendere: le perse arrivate a maturazione (pipeline differita) */}
      {daRiprendere.length ? (
        <Canale
          icona="refresh-outline"
          titolo="Da riprendere — perse che maturano"
          conteggio={daRiprendere.length}
          cta="Apri le Trattative"
          onCta={() => router.push('/(app)/trattative')}
          vuoto=""
        >
          {daRiprendere.slice(0, 5).map((t) => (
            <Pressable key={t.id} style={styles.riga} onPress={() => router.push('/(app)/trattative')}>
              <Ionicons name="refresh-outline" size={16} color={colors.goldStrong} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rigaTitolo} numberOfLines={1}>{t.place_nome ?? 'Trattativa'}</Text>
                <Text style={styles.rigaSotto} numberOfLines={1}>
                  {t.oggetto ? `Era per: ${t.oggetto}` : 'Persa'}
                  {t.motivo_perso ? ` · motivo: ${t.motivo_perso.replace('_', ' ')}` : ''}
                </Text>
              </View>
            </Pressable>
          ))}
        </Canale>
      ) : null}

      {/* Task del giorno, compatti */}
      {taskOggi.length ? (
        <Canale
          icona="checkbox-outline"
          titolo="Task di oggi"
          conteggio={taskOggi.length}
          cta="Apri la tasklist"
          onCta={() => router.push('/(app)/task')}
          vuoto=""
        >
          {taskOggi.slice(0, 4).map((t) => (
            <Pressable key={t.id} style={styles.riga} onPress={() => router.push('/(app)/task')}>
              <View style={[styles.dot, { backgroundColor: coloreProprita[t.priorita] }]} />
              <Text style={styles.rigaTitolo} numberOfLines={1}>{t.titolo}</Text>
              {t.scadenza && t.scadenza < oggi ? <Text style={[styles.rigaMeta, styles.ritardo]}>ritardo</Text> : null}
            </Pressable>
          ))}
        </Canale>
      ) : null}

      {/* Assistente email */}
      <Pressable style={[styles.promemoria, inviando && { opacity: 0.5 }]} disabled={inviando} onPress={promemoria}>
        <Ionicons name="mail-unread-outline" size={16} color={colors.goldStrong} />
        <Text style={styles.promemoriaTxt}>Inviami il riepilogo via email</Text>
      </Pressable>
    </ScrollView>
  );
}

function Kpi({ label, valore, icona, stretta }: { label: string; valore: string; icona: any; stretta?: boolean }) {
  return (
    <View style={[styles.kpi, stretta && { flex: 1.4 }]}>
      <Ionicons name={icona} size={15} color={colors.testoSoft} />
      <Text style={styles.kpiValore} numberOfLines={1}>{valore}</Text>
      <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Canale({
  icona,
  titolo,
  conteggio,
  cta,
  onCta,
  vuoto,
  children,
}: {
  icona: any;
  titolo: string;
  conteggio: number;
  cta: string;
  onCta: () => void;
  vuoto: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.canale}>
      <View style={styles.canaleHead}>
        <Ionicons name={icona} size={16} color={colors.navy} />
        <Text style={styles.canaleTitolo}>{titolo}</Text>
        {conteggio ? <Text style={styles.canaleConteggio}>{conteggio}</Text> : null}
      </View>
      {conteggio === 0 && vuoto ? <Text style={styles.vuoto}>{vuoto}</Text> : children}
      <Pressable onPress={onCta}>
        <Text style={styles.link}>{cta} ›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  testata: { gap: 2, paddingTop: 2 },
  data: { color: colors.testoSoft, fontSize: 13, textTransform: 'capitalize' },
  titolo: { color: colors.navy, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  kpiRow: { flexDirection: 'row', gap: spacing.sm },
  kpi: {
    flex: 1,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: 2,
  },
  kpiValore: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  kpiLabel: { color: colors.testoSoft, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  canale: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    gap: 8,
  },
  canaleHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  canaleTitolo: { flex: 1, color: colors.navy, fontWeight: '800', fontSize: 14, letterSpacing: -0.2 },
  canaleConteggio: {
    color: colors.navy,
    fontWeight: '800',
    fontSize: 12,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  riga: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  rigaTitolo: { flex: 1, color: colors.testo, fontWeight: '700', fontSize: 14 },
  rigaSotto: { color: colors.testoSoft, fontSize: 12 },
  rigaMeta: { color: colors.testoSoft, fontSize: 12, maxWidth: 150, textAlign: 'right' },
  ritardo: { color: colors.errore, fontWeight: '800' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  vuoto: { color: colors.grigio, fontStyle: 'italic', fontSize: 13 },
  link: { color: colors.goldStrong, fontWeight: '700', fontSize: 13, paddingTop: 2 },
  promemoria: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm },
  promemoriaTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 13 },
});
