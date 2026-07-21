// "Oggi" — la home del commerciale: l'assistente che ricorda cosa fare.
// Aggrega: agenda di oggi (task + follow-up in scadenza), ritardi, richiami,
// task aperti; azioni rapide verso le sezioni operative.
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Task } from '@/types';
import { colors, coloreProprita, radius, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import {
  fetchAllVisits,
  fetchPlaces,
  fetchProfilo,
  fetchTask,
  fetchTutteTrattative,
  inviaPromemoriaEmail,
  type TrattativaConLuogo,
} from '@/lib/db';
import { daRicontattare, type Richiamo } from '@/lib/metrics';
import { avvisa } from '@/lib/dialoghi';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

function isoOggi(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Oggi() {
  const router = useRouter();
  const { session } = useAuth();
  const [nome, setNome] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [followup, setFollowup] = useState<TrattativaConLuogo[]>([]);
  const [richiami, setRichiami] = useState<Richiamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviando, setInviando] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const uid = session?.user?.id;
      const [t, tr, places, visits, prof] = await Promise.all([
        fetchTask(true),
        fetchTutteTrattative(),
        fetchPlaces(),
        fetchAllVisits(),
        uid ? fetchProfilo(uid) : Promise.resolve(null),
      ]);
      setTasks(t.filter((x) => !x.completata));
      // Follow-up: le mie trattative con scadenza (o non attribuite).
      setFollowup(tr.filter((d) => d.scadenza && (!d.owner || d.owner === uid)));
      setRichiami(daRicontattare(places, visits));
      setNome(prof?.nome?.split(' ')[0] ?? '');
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
  const { agendaOggi, inRitardo } = useMemo(() => {
    const agendaOggi = [
      ...tasks.filter((t) => t.scadenza === oggi).map((t) => ({ id: `t_${t.id}`, titolo: t.titolo, negozio: t.place_nome ?? null, placeId: t.place_id, tipo: 'task' as const })),
      ...followup.filter((d) => d.scadenza === oggi).map((d) => ({ id: `d_${d.id}`, titolo: (d.linee?.length ? d.linee.join(', ') : d.linea) ?? 'Follow-up', negozio: d.place_nome, placeId: d.place_id || null, tipo: 'trattativa' as const })),
    ];
    const inRitardo = [
      ...tasks.filter((t) => t.scadenza && t.scadenza < oggi).map((t) => ({ id: `t_${t.id}`, titolo: t.titolo, negozio: t.place_nome ?? null, placeId: t.place_id, tipo: 'task' as const })),
      ...followup.filter((d) => d.scadenza && d.scadenza < oggi).map((d) => ({ id: `d_${d.id}`, titolo: (d.linee?.length ? d.linee.join(', ') : d.linea) ?? 'Follow-up', negozio: d.place_nome, placeId: d.place_id || null, tipo: 'trattativa' as const })),
    ];
    return { agendaOggi, inRitardo };
  }, [tasks, followup, oggi]);

  const richiamiRitardo = richiami.filter((r) => r.inRitardo);
  const d = new Date();
  const dataLunga = `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;

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
      {/* Saluto */}
      <View style={styles.hero}>
        <Text style={styles.saluto}>{nome ? `Ciao ${nome}` : 'Ciao'} 👋</Text>
        <Text style={styles.data}>{dataLunga}</Text>
        <Text style={styles.riassunto}>
          {agendaOggi.length ? `${agendaOggi.length} in agenda oggi` : 'Agenda libera oggi'}
          {inRitardo.length ? ` · ${inRitardo.length} in ritardo` : ''}
          {richiamiRitardo.length ? ` · ${richiamiRitardo.length} richiami urgenti` : ''}
        </Text>
      </View>

      {/* Azioni rapide */}
      <View style={styles.azioni}>
        <Azione icona="checkbox-outline" label="Task" onPress={() => router.push('/(app)/task')} />
        <Azione icona="map-outline" label="Mappa" onPress={() => router.push('/(app)/mappa')} />
        <Azione icona="briefcase-outline" label="Trattative" onPress={() => router.push('/(app)/trattative')} />
        <Azione icona="cash-outline" label="Pagamenti" onPress={() => router.push('/(app)/pagamenti')} />
      </View>

      {/* In ritardo */}
      {inRitardo.length ? (
        <Sezione titolo={`In ritardo (${inRitardo.length})`} colore={colors.errore}>
          {inRitardo.slice(0, 5).map((e) => (
            <RigaEvento key={e.id} {...e} onPress={() => e.placeId && router.push(`/(app)/attivita/${e.placeId}`)} />
          ))}
        </Sezione>
      ) : null}

      {/* Agenda di oggi */}
      <Sezione titolo="Agenda di oggi" colore={colors.testoSoft}>
        {agendaOggi.length === 0 ? (
          <Text style={styles.vuoto}>{loading ? 'Caricamento…' : 'Niente in scadenza oggi. Le scadenze di task e trattative compariranno qui.'}</Text>
        ) : (
          agendaOggi.map((e) => (
            <RigaEvento key={e.id} {...e} onPress={() => e.placeId && router.push(`/(app)/attivita/${e.placeId}`)} />
          ))
        )}
      </Sezione>

      {/* Richiami */}
      {richiami.length ? (
        <Sezione titolo={`Da ricontattare (${richiami.length})`} colore={colors.testoSoft}>
          {richiami.slice(0, 4).map((r) => (
            <Pressable key={r.place.id} style={styles.evento} onPress={() => router.push(`/(app)/attivita/${r.place.id}`)}>
              <Ionicons name="call-outline" size={16} color={r.inRitardo ? colors.errore : colors.testoSoft} />
              <Text style={styles.eventoTitolo} numberOfLines={1}>{r.place.nome}</Text>
              <Text style={[styles.eventoMeta, r.inRitardo && { color: colors.errore, fontWeight: '800' }]}>
                {r.giorni}g fa{r.inRitardo ? ' · ritardo' : ''}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={() => router.push('/(app)/da-completare')}>
            <Text style={styles.link}>Vedi tutti in "Da fare" ›</Text>
          </Pressable>
        </Sezione>
      ) : null}

      {/* Prossimi task */}
      <Sezione titolo={`I miei task (${tasks.length})`} colore={colors.testoSoft}>
        {tasks.length === 0 ? (
          <Text style={styles.vuoto}>Nessun task aperto.</Text>
        ) : (
          tasks.slice(0, 5).map((t) => (
            <Pressable key={t.id} style={styles.evento} onPress={() => router.push('/(app)/task')}>
              <View style={[styles.dot, { backgroundColor: coloreProprita[t.priorita] }]} />
              <Text style={styles.eventoTitolo} numberOfLines={1}>{t.titolo}</Text>
              {t.scadenza ? <Text style={styles.eventoMeta}>{t.scadenza.slice(5).split('-').reverse().join('/')}</Text> : null}
            </Pressable>
          ))
        )}
        <Pressable onPress={() => router.push('/(app)/task')}>
          <Text style={styles.link}>Apri la tasklist ›</Text>
        </Pressable>
      </Sezione>

      {/* Assistente email */}
      <Pressable style={[styles.promemoria, inviando && { opacity: 0.5 }]} disabled={inviando} onPress={promemoria}>
        <Ionicons name="mail-unread-outline" size={16} color={colors.goldStrong} />
        <Text style={styles.promemoriaTxt}>Inviami il riepilogo via email</Text>
      </Pressable>
    </ScrollView>
  );
}

function Azione({ icona, label, onPress }: { icona: any; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.azione} onPress={onPress}>
      <Ionicons name={icona} size={22} color={colors.navy} />
      <Text style={styles.azioneTxt}>{label}</Text>
    </Pressable>
  );
}

function Sezione({ titolo, colore, children }: { titolo: string; colore: string; children: React.ReactNode }) {
  return (
    <View style={styles.sezione}>
      <Text style={[styles.sezioneTitolo, { color: colore }]}>{titolo}</Text>
      {children}
    </View>
  );
}

function RigaEvento({ titolo, negozio, tipo, onPress }: { titolo: string; negozio: string | null; tipo: 'task' | 'trattativa'; onPress: () => void }) {
  return (
    <Pressable style={styles.evento} onPress={onPress}>
      <Ionicons name={tipo === 'task' ? 'checkbox-outline' : 'briefcase-outline'} size={16} color={colors.navy} />
      <Text style={styles.eventoTitolo} numberOfLines={1}>{titolo}</Text>
      {negozio ? <Text style={styles.eventoMeta} numberOfLines={1}>{negozio}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sfondo },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  hero: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: spacing.lg, gap: 4 },
  saluto: { color: colors.bianco, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  data: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textTransform: 'capitalize' },
  riassunto: { color: colors.oro, fontSize: 13, fontWeight: '700', marginTop: 4 },
  azioni: { flexDirection: 'row', gap: spacing.sm },
  azione: {
    flex: 1,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: 4,
  },
  azioneTxt: { color: colors.navy, fontWeight: '700', fontSize: 12 },
  sezione: { gap: 6 },
  sezioneTitolo: { fontWeight: '800', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  vuoto: { color: colors.grigio, fontStyle: 'italic', fontSize: 13 },
  evento: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  eventoTitolo: { flex: 1, color: colors.testo, fontWeight: '700', fontSize: 14 },
  eventoMeta: { color: colors.testoSoft, fontSize: 12, maxWidth: 140 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  link: { color: colors.goldStrong, fontWeight: '700', fontSize: 13, paddingVertical: 4 },
  promemoria: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  promemoriaTxt: { color: colors.goldStrong, fontWeight: '700', fontSize: 13 },
});
