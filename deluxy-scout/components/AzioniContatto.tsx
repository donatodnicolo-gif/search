// Le azioni per **instaurare un contatto** con un negozio: chiamare, WhatsApp,
// mandare una mail, andarlo a trovare, aprire la trattativa.
//
// Sta in un file solo perché Potenziali e Selezionati devono avere le stesse
// azioni con lo stesso ordine e lo stesso stile: quando erano scritte due volte
// sono subito divergute (i Selezionati avevano un bottone, i Potenziali cinque).
//
// Le azioni senza recapito restano **visibili ma spente**: si vede a colpo
// d'occhio che di quel negozio manca il telefono o la mail, invece di trovarsi
// una fila di bottoni diversa da riga a riga.
import type { ReactNode } from 'react';
import { Linking } from 'react-native';
import type { Place } from '@/types';
import type { RecapitoPlace } from '@/lib/db';
import { AzioniRiga, IconaAzione } from '@/components/AzioniRiga';

export function AzioniContatto({
  place,
  recapito,
  onVisita,
  onMail,
  onTrattativa,
  onSequenza,
  bozza,
  children,
}: {
  place: Place;
  recapito: RecapitoPlace | undefined;
  /** Apre la finestra della visita (la stessa della Mappa). */
  onVisita: () => void;
  /**
   * Se passato, la mail parte **dall'app** con gli script (ScegliScriptModal).
   * Se manca, si ripiega sul client di posta del telefono (`mailto:`).
   */
  onMail?: (place: Place) => void;
  onTrattativa: (place: Place) => void;
  /** Se passato, compare «metti in sequenza»: i solleciti a scadenza. */
  onSequenza?: (place: Place) => void;
  /** true = la visita è già segnata ma non compilata: l'azione è «completa». */
  bozza?: boolean;
  /** Azioni in più della singola schermata (es. «nascondi» nei Selezionati). */
  children?: ReactNode;
}) {
  const tel = recapito?.telefono ?? null;
  const mail = recapito?.email ?? null;
  // Con gli script la mail si può scrivere anche senza indirizzo in rubrica:
  // la schermata di invio fa scegliere i destinatari.
  const mailAttiva = Boolean(mail) || Boolean(onMail);

  return (
    <AzioniRiga>
      <IconaAzione
        nome="call-outline"
        attiva={Boolean(tel)}
        label={tel ? 'Chiama' : 'Nessun telefono in rubrica'}
        onPress={() => tel && Linking.openURL(`tel:${tel}`)}
      />
      <IconaAzione
        nome="logo-whatsapp"
        attiva={Boolean(tel)}
        label={tel ? 'WhatsApp' : 'Nessun telefono in rubrica'}
        onPress={() => tel && Linking.openURL(`https://wa.me/${tel.replace(/[^0-9]/g, '')}`)}
      />
      <IconaAzione
        nome="mail-outline"
        attiva={mailAttiva}
        label={onMail ? 'Invia una mail (script)' : mail ? 'Email' : 'Nessuna mail in rubrica'}
        onPress={() => {
          if (onMail) onMail(place);
          else if (mail) Linking.openURL(`mailto:${mail}`);
        }}
      />
      <IconaAzione
        nome={bozza ? 'create-outline' : 'walk-outline'}
        attiva
        label={bozza ? 'Completa la visita' : 'Registra una visita'}
        onPress={onVisita}
      />
      <IconaAzione
        nome="briefcase-outline"
        attiva
        label="Nuova trattativa"
        onPress={() => onTrattativa(place)}
      />
      {onSequenza ? (
        <IconaAzione
          nome="git-branch-outline"
          attiva
          label="Metti in sequenza (solleciti a scadenza)"
          onPress={() => onSequenza(place)}
        />
      ) : null}
      {children}
    </AzioniRiga>
  );
}
