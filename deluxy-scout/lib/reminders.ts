// Promemoria locali. Dopo un check-in "interessato" o "da_richiamare",
// crea un reminder per il recap email da inviare entro 12 ore (regola Fase 4).
import * as Notifications from 'expo-notifications';
import type { EsitoVisita } from '@/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function assicuraPermessiNotifiche(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === 'granted';
}

const ESITI_CON_RECAP: EsitoVisita[] = ['interessato', 'da_richiamare'];
const DODICI_ORE_SEC = 12 * 60 * 60;

/**
 * Programma il promemoria recap se l'esito lo richiede.
 * Ritorna l'id della notifica programmata (o null se non serviva / permesso negato).
 */
export async function programmaRecapEmail(params: {
  esito: EsitoVisita;
  nomeAttivita: string;
  placeId: string;
}): Promise<string | null> {
  if (!ESITI_CON_RECAP.includes(params.esito)) return null;
  const ok = await assicuraPermessiNotifiche();
  if (!ok) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Recap email da inviare',
      body: `Invia il recap per "${params.nomeAttivita}" entro 12 ore dal check-in.`,
      data: { placeId: params.placeId, tipo: 'recap_email' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: DODICI_ORE_SEC,
    },
  });
}
