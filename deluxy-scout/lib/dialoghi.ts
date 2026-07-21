// Dialoghi cross-platform. Su react-native-web `Alert.alert` NON mostra i
// pulsanti (la conferma non appare e l'azione non parte): questi helper usano
// window.confirm/window.alert sul web e l'Alert nativo su iOS/Android.
import { Alert, Platform } from 'react-native';

/**
 * Conferma un'azione. `onConferma` parte solo se l'utente conferma.
 * Sul web usa window.confirm; su nativo un Alert a due pulsanti.
 */
export function conferma(
  titolo: string,
  messaggio: string,
  onConferma: () => void,
  opts?: { testoConferma?: string; distruttivo?: boolean; onAnnulla?: () => void },
): void {
  const testoConferma = opts?.testoConferma ?? 'OK';
  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' && window.confirm(`${titolo}\n\n${messaggio}`);
    if (ok) onConferma();
    else opts?.onAnnulla?.();
    return;
  }
  Alert.alert(titolo, messaggio, [
    { text: 'Annulla', style: 'cancel', onPress: opts?.onAnnulla },
    { text: testoConferma, style: opts?.distruttivo ? 'destructive' : 'default', onPress: onConferma },
  ]);
}

/**
 * Mostra una notifica (un solo pulsante OK). Sul web usa window.alert.
 * `onChiudi` viene chiamato alla chiusura (o subito, sul web).
 */
export function avvisa(titolo: string, messaggio?: string, onChiudi?: () => void): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(messaggio ? `${titolo}\n\n${messaggio}` : titolo);
    onChiudi?.();
    return;
  }
  Alert.alert(titolo, messaggio, onChiudi ? [{ text: 'OK', onPress: onChiudi }] : undefined);
}
