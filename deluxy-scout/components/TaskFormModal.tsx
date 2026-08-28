// Form crea/modifica task con assegnatario (chi lo deve fare).
// Usato dalla tasklist ("I miei task") e dalla scheda attività (task su un negozio).
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Foglio } from '@/components/Foglio';
import type { Priorita, Profilo, Task } from '@/types';
import { colors, coloreProprita, radius, spacing } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { aggiornaTask, fetchProfiles, inserisciTask, notificaAssegnazioneTask } from '@/lib/db';
import { nomeVenditore } from '@/lib/metrics';
import { isoTraGiorni } from '@/lib/giorni';
import { CampoData } from '@/components/CampoData';
import { SceltaContatto, type ContattoScelto } from '@/components/SceltaContatto';

// Etichette allineate al PriorityBadge ("P1 · Alta"…).
const PRIORITA: { v: Priorita; label: string }[] = [
  { v: 'P1', label: 'P1 · Alta' },
  { v: 'P2', label: 'P2 · Media' },
  { v: 'P3', label: 'P3 · Bassa' },
];
const SCAD: { label: string; giorni: number | null }[] = [
  { label: 'Nessuna', giorni: null },
  { label: 'Oggi', giorni: 0 },
  { label: 'Domani', giorni: 1 },
  { label: '+7 giorni', giorni: 7 },
];

// ⚠️ La data dei chip si calcola in ora LOCALE (lib/giorni.ts). Con
// toISOString, fra la mezzanotte e le due, «Oggi» scriveva IERI — cioè un task
// che nasceva già in ritardo — e «Domani» scriveva oggi. La schermata mostra
// l'etichetta del chip, non la data: nessuno poteva accorgersene.

export function TaskFormModal({
  task,
  placeId,
  placeNome,
  titoloIniziale,
  onClose,
  onSalvato,
}: {
  task?: Task;
  placeId?: string;
  placeNome?: string;
  /** Titolo giá scritto per chi apre il modale con un intento preciso (es. «Chiamare X»). */
  titoloIniziale?: string;
  onClose: () => void;
  onSalvato: () => void;
}) {
  const inModifica = !!task;
  const [titolo, setTitolo] = useState(task?.titolo ?? titoloIniziale ?? '');
  const [priorita, setPriorita] = useState<Priorita>(task?.priorita ?? 'P2');
  const [scadenza, setScadenza] = useState<string | null>(task?.scadenza ?? null);
  const [owner, setOwner] = useState<string | null>(task?.owner ?? null);
  /** Il contatto collegato (migr. 0100): chi bisogna chiamare o scrivere. */
  const [contatto, setContatto] = useState<ContattoScelto | null>(
    task?.contatto ? { ...task.contatto } : null,
  );
  /** Il calendario aperto a mano: i chip coprono i casi frequenti, non tutti. */
  const [dataLibera, setDataLibera] = useState(
    !!task?.scadenza && ![0, 1, 7].some((g) => isoTraGiorni(g) === task?.scadenza),
  );
  const [mioId, setMioId] = useState<string | null>(null);
  const [venditori, setVenditori] = useState<Profilo[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setMioId(uid);
      if (!task) setOwner((o) => o ?? uid); // in creazione: default = io
    });
    fetchProfiles().then(setVenditori).catch(() => setVenditori([]));
  }, [task]);

  const mappaProfili = new Map(venditori.map((p) => [p.id, p]));

  async function salva() {
    const t = titolo.trim();
    if (!t || salvando) return;
    setSalvando(true);
    try {
      const assegnatario = owner ?? mioId;
      let taskId = task?.id ?? null;
      if (inModifica && task) {
        await aggiornaTask(task.id, {
          titolo: t,
          priorita,
          scadenza,
          owner: assegnatario,
          contatto_id: contatto?.id ?? null,
        });
        taskId = task.id;
      } else {
        const nuovo = await inserisciTask({
          titolo: t,
          priorita,
          scadenza,
          owner: assegnatario,
          place_id: placeId ?? null,
          contatto_id: contatto?.id ?? null,
        });
        taskId = nuovo.id;
      }
      // Se assegnato a un ALTRO, notifica via email (best-effort; inerte se SMTP non configurato).
      if (taskId && assegnatario && assegnatario !== mioId) {
        notificaAssegnazioneTask(taskId).catch(() => {});
      }
      onSalvato();
      onClose();
    } catch {
      setSalvando(false);
    }
  }

  return (
    // bloccaSfondo: un task scritto a metà non si chiude con un clic fuori.
    <Foglio titolo={inModifica ? 'Modifica task' : 'Nuovo task'} onClose={onClose} bloccaSfondo>
          {placeNome ? (
            <Text numberOfLines={3} style={styles.negozio}>
              <Ionicons name="storefront-outline" size={13} color={colors.oro} /> {placeNome}
            </Text>
          ) : null}

          {/* View e non ScrollView: il corpo del Foglio scorre già da solo (e ha
              già keyboardShouldPersistTaps); due ScrollView annidate sullo
              stesso asse sono vietate (Libro v1.7 §9). */}
          <View style={{ gap: spacing.sm }}>
            <TextInput
              style={styles.input}
              value={titolo}
              onChangeText={setTitolo}
              placeholder="Cosa c'è da fare?"
              placeholderTextColor={colors.grigio}
              autoFocus={!inModifica}
            />

            <Text style={styles.label}>Priorità</Text>
            <View style={styles.chips}>
              {PRIORITA.map((p) => (
                <Pressable
                  key={p.v}
                  style={[styles.chip, priorita === p.v && { backgroundColor: coloreProprita[p.v], borderColor: coloreProprita[p.v] }]}
                  onPress={() => setPriorita(p.v)}
                >
                  <Text style={[styles.chipTxt, priorita === p.v && styles.chipTxtOn]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Scadenza</Text>
            <View style={styles.chips}>
              {SCAD.map((o) => {
                const iso = o.giorni == null ? null : isoTraGiorni(o.giorni);
                const on = !dataLibera && scadenza === iso;
                return (
                  <Pressable
                    key={o.label}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => {
                      setDataLibera(false);
                      setScadenza(iso);
                    }}
                  >
                    <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{o.label}</Text>
                  </Pressable>
                );
              })}
              {/* ⭐ IL CALENDARIO (28/08/2026, richiesta dell'utente: «nella
                  scadenza metti anche la possibilità di aprire un calendario»).

                  ⚠️ I chip restano e vengono PRIMA: oggi, domani e fra una
                  settimana sono la quasi totalità dei promemoria, e obbligare
                  a scegliere su un calendario per dire «domani» sarebbe tre
                  gesti al posto di uno. Il calendario serve alla data che i
                  chip non sanno dire — la fiera del 14 ottobre. */}
              <Pressable
                style={[styles.chip, dataLibera && styles.chipOn]}
                onPress={() => setDataLibera(true)}
              >
                <Ionicons
                  name="calendar-outline"
                  size={13}
                  color={dataLibera ? colors.bianco : colors.grigio}
                />
                <Text style={[styles.chipTxt, dataLibera && styles.chipTxtOn]}>Scegli data</Text>
              </Pressable>
            </View>
            {dataLibera ? (
              // Sul web è il calendario del browser (CampoData.web.tsx), sul
              // telefono un campo con la data scritta: lo stesso componente.
              <CampoData valore={scadenza} onCambia={setScadenza} placeholder="es. 2026-10-14" />
            ) : null}

            {/* ⭐ IL CONTATTO (28/08/2026, richiesta dell'utente: «consenti di
                collegare un contatto a una task»). Sta dopo la scadenza e prima
                dell'assegnatario: sono due persone diverse — CHI devo sentire e
                CHI se ne occupa — e vicine si scambierebbero. */}
            <Text style={styles.label}>Contatto</Text>
            <SceltaContatto scelto={contatto} onScegli={setContatto} />

            <Text style={styles.label}>Assegna a</Text>
            <View style={styles.chips}>
              <Pressable
                style={[styles.chip, owner === mioId && styles.chipOn]}
                onPress={() => setOwner(mioId)}
              >
                <Text style={[styles.chipTxt, owner === mioId && styles.chipTxtOn]}>Io</Text>
              </Pressable>
              {venditori
                .filter((p) => p.id !== mioId)
                .map((p) => (
                  <Pressable
                    key={p.id}
                    style={[styles.chip, owner === p.id && styles.chipOn]}
                    onPress={() => setOwner(p.id)}
                  >
                    <Text style={[styles.chipTxt, owner === p.id && styles.chipTxtOn]} numberOfLines={1}>
                      {nomeVenditore(p.id, mappaProfili)}
                    </Text>
                  </Pressable>
                ))}
            </View>

            <Pressable
              style={[styles.btn, (!titolo.trim() || salvando) && styles.btnOff]}
              disabled={!titolo.trim() || salvando}
              onPress={salva}
            >
              {salvando ? (
                <ActivityIndicator color={colors.bianco} />
              ) : (
                <Text style={styles.btnTxt}>{inModifica ? 'Salva modifiche' : 'Crea task'}</Text>
              )}
            </Pressable>
          </View>
    </Foglio>
  );
}

const styles = StyleSheet.create({
  negozio: { color: colors.goldStrong, fontWeight: '700', fontSize: 13 },
  input: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.m,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.testo,
  },
  label: { fontSize: 11, fontWeight: '800', color: colors.grigio, textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.bianco,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: 200,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTxt: { color: colors.testoSoft, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.bianco },
  btn: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnOff: { opacity: 0.4 },
  btnTxt: { color: colors.bianco, fontWeight: '800', fontSize: 15 },
});
