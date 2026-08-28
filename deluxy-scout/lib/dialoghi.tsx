// Dialoghi dell'app, con UNA estetica sola.
//
// Sul web `window.alert`/`window.confirm` sono i popup grigi del browser:
// bloccano tutto, sembrano errori di sistema e non c'entrano niente col Design
// System. Qui diventano finestre DS montate da <DialoghiHost/> nel layout
// radice; le firme di avvisa()/conferma() NON cambiano, così le ~26 schermate
// che le usano migliorano senza essere toccate. Su iOS/Android restano gli
// Alert di sistema: sul telefono SONO lo standard, e rifarli sarebbe peggio.
//
// Se l'host non è montato (test, pagine fuori dal layout) si ripiega sui
// dialoghi del browser: brutti ma funzionanti — un avviso perso è peggio.
import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing } from '@/lib/theme';

type Richiesta = {
  id: number;
  tipo: 'avviso' | 'conferma';
  titolo: string;
  messaggio?: string;
  testoConferma: string;
  distruttivo: boolean;
  risolvi: (ok: boolean) => void;
};

let contatore = 0;
let coda: Richiesta[] = [];
let notifica: (() => void) | null = null;

function accoda(r: Omit<Richiesta, 'id'>) {
  coda = [...coda, { ...r, id: ++contatore }];
  notifica?.();
}

function chiudiPrima(ok: boolean) {
  const prima = coda[0];
  coda = coda.slice(1);
  notifica?.();
  // Il callback parte DOPO aver tolto il dialogo: se dentro apre un altro
  // dialogo (conferma → avviso d'esito), la coda è già pulita.
  prima?.risolvi(ok);
}

/**
 * Conferma un'azione. `onConferma` parte solo se l'utente conferma.
 */
export function conferma(
  titolo: string,
  messaggio: string,
  onConferma: () => void,
  opts?: { testoConferma?: string; distruttivo?: boolean; onAnnulla?: () => void },
): void {
  const testoConferma = opts?.testoConferma ?? 'OK';
  if (Platform.OS === 'web') {
    if (notifica) {
      accoda({
        tipo: 'conferma',
        titolo,
        messaggio,
        testoConferma,
        distruttivo: !!opts?.distruttivo,
        risolvi: (ok) => (ok ? onConferma() : opts?.onAnnulla?.()),
      });
    } else {
      const ok = typeof window !== 'undefined' && window.confirm(`${titolo}\n\n${messaggio}`);
      if (ok) onConferma();
      else opts?.onAnnulla?.();
    }
    return;
  }
  Alert.alert(titolo, messaggio, [
    { text: 'Annulla', style: 'cancel', onPress: opts?.onAnnulla },
    { text: testoConferma, style: opts?.distruttivo ? 'destructive' : 'default', onPress: onConferma },
  ]);
}

/**
 * Mostra una notifica (un solo pulsante OK). `onChiudi` alla chiusura.
 */
export function avvisa(titolo: string, messaggio?: string, onChiudi?: () => void): void {
  if (Platform.OS === 'web') {
    if (notifica) {
      accoda({
        tipo: 'avviso',
        titolo,
        messaggio,
        testoConferma: 'OK',
        distruttivo: false,
        risolvi: () => onChiudi?.(),
      });
    } else {
      if (typeof window !== 'undefined') window.alert(messaggio ? `${titolo}\n\n${messaggio}` : titolo);
      onChiudi?.();
    }
    return;
  }
  Alert.alert(titolo, messaggio, onChiudi ? [{ text: 'OK', onPress: onChiudi }] : undefined);
}

/** Da montare UNA volta nel layout radice. Disegna il dialogo in testa alla coda. */
export function DialoghiHost() {
  const [, setVersione] = useState(0);
  useEffect(() => {
    notifica = () => setVersione((v) => v + 1);
    // Se qualcosa era stato accodato prima del mount, si disegna ora.
    setVersione((v) => v + 1);
    return () => {
      notifica = null;
    };
  }, []);

  if (Platform.OS !== 'web' || coda.length === 0) return null;
  const r = coda[0];
  const eConferma = r.tipo === 'conferma';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => chiudiPrima(!eConferma)}>
      {/* Toccare fuori: su una conferma vale «Annulla», su un avviso chiude. */}
      <Pressable style={styles.overlay} onPress={() => chiudiPrima(!eConferma)}>
        <Pressable style={styles.finestra} onPress={() => {}}>
          <Text style={styles.titolo}>{r.titolo}</Text>
          {r.messaggio ? (
            <Text style={styles.messaggio} selectable>
              {r.messaggio}
            </Text>
          ) : null}
          <View style={styles.bottoni}>
            {eConferma ? (
              <Pressable style={styles.btnSecondario} onPress={() => chiudiPrima(false)}>
                <Text style={styles.btnSecondarioTxt}>Annulla</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.btnPrimario, eConferma && r.distruttivo && styles.btnPericolo]}
              onPress={() => chiudiPrima(true)}
            >
              <Text style={styles.btnPrimarioTxt}>{r.testoConferma}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  finestra: {
    backgroundColor: colors.bianco,
    borderRadius: radius.l,
    padding: spacing.xxl,
    gap: 10,
    width: '100%',
    maxWidth: 420,
    ...shadow.float,
  },
  titolo: { color: colors.navy, fontWeight: '700', fontSize: 17, letterSpacing: -0.2 },
  messaggio: { color: colors.testoSoft, fontSize: 14, lineHeight: 21 },
  bottoni: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  btnPrimario: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  btnPericolo: { backgroundColor: colors.errore },
  btnPrimarioTxt: { color: colors.bianco, fontWeight: '700', fontSize: 13.5 },
  btnSecondario: {
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  btnSecondarioTxt: { color: colors.testo, fontWeight: '700', fontSize: 13.5 },
});
