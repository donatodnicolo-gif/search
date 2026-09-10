// LA SCHEDA DI UN PARTNER DEL REGISTRO, DENTRO SCOUT (10/09/2026, richiesta
// dell'utente: «al click apri un pop-up dove fai vedere i dati di anagrafica
// senza andare in anagrafiche»).
//
// Prima il click su una riga del registro (Segnalazioni CS, Fornitori, la
// tabella dei Selezionati) apriva la scheda in Anagrafiche, in un'altra
// scheda del browser: per sapere chi è un negozio segnalato si usciva
// dall'app. Qui si legge tutto quello che il registro ci ha già mandato —
// nessuna lettura in più — e da qui si chiama, si scrive, si prende in
// carico. Il link al registro resta in fondo, per chi vuole modificare di là.
//
// ⚠️ Solo lettura: i dati sono del registro Anagrafiche (regola «ogni dato
// ha una casa sola»), e Scout non li corregge da qui.
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Foglio } from '@/components/Foglio';
import { Btn, SectionLabel, StatusBadge } from '@/components/ui';
import { colors, radius, spacing } from '@/lib/theme';
import { daDoveRegistro, urlSchedaRegistro, type PartnerRegistro } from '@/lib/anagrafiche';
import { dataBreve } from '@/components/Tabella';
import { riassuntoVendite, type VenditeFornitore } from '@/lib/vendite-fornitori';
import { COLORE_VISITA } from '@/lib/statoVisita';

const LABEL_FORNITORE: Record<string, string> = {
  abituale: 'Fornitore abituale',
  da_provare: 'Fornitore da provare',
  da_evitare: 'Fornitore da evitare',
};
const COLORE_FORNITORE: Record<string, string> = {
  abituale: colors.successo,
  da_provare: colors.attenzione,
  da_evitare: colors.errore,
};

export function SchedaRegistroModal({
  partner,
  vendite,
  giorniLunga,
  preso,
  inCorso,
  onClose,
  onPrendiInCarico,
}: {
  partner: PartnerRegistro;
  /** Gli ordini del Customer Service a 30/180 gg, se collegato. */
  vendite: VenditeFornitore | null;
  giorniLunga: number;
  /** Già fra i Selezionati di Scout (allora il bottone lo dice e resta spento). */
  preso: boolean;
  inCorso: boolean;
  onClose: () => void;
  onPrendiInCarico: (p: PartnerRegistro) => void;
}) {
  const p = partner;
  const dove = [p.indirizzo, [p.citta, p.provincia].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const tel = (p.telefono ?? '').trim();
  const email = (p.email ?? '').trim();
  const referenti = (p.contatti ?? []).filter((c) => c.nome || c.telefono || c.email);
  const url = urlSchedaRegistro(p.id);

  return (
    <Foglio titolo={p.nome} sottotitolo={[daDoveRegistro(p), p.categoria].filter(Boolean).join(' · ')} onClose={onClose}>
      {/* I badge: cosa è per il registro, e per noi. */}
      <View style={styles.badges}>
        {p.stato ? <StatusBadge small label={`Nel registro: ${p.stato}`} colore={colors.blue} /> : null}
        {p.statoFornitore ? (
          <StatusBadge
            small
            label={LABEL_FORNITORE[p.statoFornitore] ?? p.statoFornitore}
            colore={COLORE_FORNITORE[p.statoFornitore] ?? colors.grigio}
          />
        ) : null}
        {preso ? (
          <StatusBadge small label="Già fra i tuoi Selezionati" colore={COLORE_VISITA.fatta} />
        ) : (
          <StatusBadge small label="Da prendere in carico" colore={colors.attenzione} />
        )}
      </View>

      <SectionLabel testo="Dove" />
      <Riga icona="location-outline" testo={dove || 'Indirizzo non nel registro'} muto={!dove} />

      <SectionLabel testo="Recapiti" />
      <Riga
        icona="call-outline"
        testo={tel || 'Nessun telefono nel registro'}
        muto={!tel}
        onPress={tel ? () => Linking.openURL(`tel:${tel}`) : undefined}
      />
      <Riga
        icona="mail-outline"
        testo={email || 'Nessuna mail nel registro'}
        muto={!email}
        onPress={email ? () => Linking.openURL(`mailto:${email}`) : undefined}
      />

      <SectionLabel testo="Nel registro" />
      <Riga icona="cube-outline" testo={`${daDoveRegistro(p)}${p.creatoIl ? ` · dal ${dataBreve(p.creatoIl)}` : ''}`} />
      {p.account ? <Riga icona="briefcase-outline" testo={`Account: ${p.account}`} /> : null}
      {p.ultimaVisita ? <Riga icona="walk-outline" testo={`Ultima visita: ${dataBreve(p.ultimaVisita)}`} /> : null}
      {p.interessi?.length ? (
        <View style={styles.tags}>
          {p.interessi.map((t) => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagTxt}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Gli ordini del CS: sono la ragione per cui questa riga è calda. */}
      <SectionLabel testo="Ordini dal Customer Service" />
      {vendite && vendite.ordiniLunga ? (
        <>
          <Riga icona="bag-check-outline" testo={`Ultimi 30 giorni: ${riassuntoVendite(vendite.ordini30, vendite.venduto30)}`} />
          <Riga icona="bag-check-outline" testo={`Ultimi ${giorniLunga} giorni: ${riassuntoVendite(vendite.ordiniLunga, vendite.vendutoLunga)}`} />
          {vendite.ultimoIl ? (
            <Riga icona="time-outline" testo={`Ultimo ordine: ${dataBreve(vendite.ultimoIl)}${vendite.ultimoNumero ? ` (${vendite.ultimoNumero})` : ''}`} />
          ) : null}
        </>
      ) : (
        <Riga icona="bag-outline" testo={`Nessun ordine affidato negli ultimi ${giorniLunga} giorni`} muto />
      )}

      {referenti.length ? (
        <>
          <SectionLabel testo={`Referenti (${referenti.length})`} />
          {referenti.map((c, i) => (
            <View key={i} style={styles.referente}>
              <Text style={styles.referenteNome}>
                {c.nome || '—'}
                {c.ruolo ? <Text style={styles.referenteRuolo}> · {c.ruolo}</Text> : null}
              </Text>
              <View style={styles.referenteRecapiti}>
                {c.telefono ? (
                  <Pressable onPress={() => Linking.openURL(`tel:${c.telefono}`)} hitSlop={6}>
                    <Text style={styles.link}>{c.telefono}</Text>
                  </Pressable>
                ) : null}
                {c.email ? (
                  <Pressable onPress={() => Linking.openURL(`mailto:${c.email}`)} hitSlop={6}>
                    <Text style={styles.link}>{c.email}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </>
      ) : null}

      {p.note ? (
        <>
          <SectionLabel testo="Note" />
          <Text style={styles.note} selectable>
            {p.note}
          </Text>
        </>
      ) : null}

      <View style={styles.azioni}>
        <Btn
          label={preso ? 'Già fra i tuoi Selezionati' : inCorso ? 'Prendo in carico…' : 'Prendi in carico'}
          icona={preso ? 'checkmark-done-outline' : 'download-outline'}
          onPress={() => onPrendiInCarico(p)}
          disabled={preso || inCorso}
        />
        <View style={styles.azioniRiga}>
          <Btn label="Chiama" tipo="secondario" small icona="call-outline" disabled={!tel} onPress={() => Linking.openURL(`tel:${tel}`)} />
          <Btn
            label="WhatsApp"
            tipo="secondario"
            small
            icona="logo-whatsapp"
            disabled={!tel}
            onPress={() => Linking.openURL(`https://wa.me/${tel.replace(/[^0-9]/g, '')}`)}
          />
          <Btn label="Email" tipo="secondario" small icona="mail-outline" disabled={!email} onPress={() => Linking.openURL(`mailto:${email}`)} />
        </View>
        {url ? (
          <Pressable onPress={() => Linking.openURL(url)} hitSlop={6} accessibilityRole="link">
            <Text style={styles.linkRegistro}>Apri nel registro Anagrafiche ↗ (per modificare)</Text>
          </Pressable>
        ) : null}
      </View>
    </Foglio>
  );
}

function Riga({
  icona,
  testo,
  muto,
  onPress,
}: {
  icona: React.ComponentProps<typeof Ionicons>['name'];
  testo: string;
  muto?: boolean;
  onPress?: () => void;
}) {
  const contenuto = (
    <View style={styles.riga}>
      <Ionicons name={icona} size={15} color={muto ? colors.grigio : colors.testoSoft} />
      <Text style={[styles.rigaTxt, muto && styles.rigaMuta, onPress && styles.link]} selectable={!onPress}>
        {testo}
      </Text>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} hitSlop={4}>
      {contenuto}
    </Pressable>
  ) : (
    contenuto
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  riga: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  rigaTxt: { flex: 1, color: colors.testo, fontSize: 14, lineHeight: 20 },
  rigaMuta: { color: colors.grigio },
  link: { color: colors.testo, textDecorationLine: 'underline' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag: { backgroundColor: colors.fill, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  tagTxt: { color: colors.testoSoft, fontWeight: '600', fontSize: 12 },
  referente: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.grigioChiaro, gap: 2 },
  referenteNome: { color: colors.testo, fontWeight: '600', fontSize: 14 },
  referenteRuolo: { color: colors.testoSoft, fontWeight: '400' },
  referenteRecapiti: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  note: { color: colors.testo, fontSize: 14, lineHeight: 20 },
  azioni: { marginTop: spacing.lg, gap: spacing.sm },
  azioniRiga: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkRegistro: { color: colors.testoSoft, fontSize: 12.5, textDecorationLine: 'underline', marginTop: 4 },
});
