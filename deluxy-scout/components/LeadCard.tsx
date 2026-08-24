// La scheda di UNA richiesta web, nella coda di qualificazione (/lead).
// Per le notifiche del modulo di contatto Shopify il titolo è LA PERSONA che ha
// scritto (estratta dal testo, vedi lib/lead-parse), non il mittente robot:
// «Business Deluxy (Shopify)» ripetuto su ogni scheda non dice niente, «Jodi
// Wootan · jodifly2@gmail.com» dice tutto. Email e telefono si toccano e
// aprono mail/telefono. Nessuna azione è stata tolta rispetto a prima.
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing } from '@/lib/theme';
import { StatusBadge } from '@/components/ui';
import { analizzaMessaggioLead } from '@/lib/lead-parse';
import type { FonteLead, Lead } from '@/types';
import { GIORNI_RISPOSTA_LEAD } from '@/lib/cadenze';

const FONTI: Record<FonteLead, string> = {
  sito: 'Sito',
  mail: 'Mail',
  social: 'Social',
  passaparola: 'Passaparola',
  altro: 'Altro',
};

function etaGiorni(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
}

export function LeadCard({
  lead,
  onApri,
  onQualifica,
  onScarta,
  onVediTrattativa,
  onApriAiMail,
  onElimina,
}: {
  lead: Lead;
  /** Apre il messaggio intero; assente = niente da leggere, scheda non premibile. */
  onApri?: () => void;
  onQualifica: () => void;
  onScarta: () => void;
  onVediTrattativa: () => void;
  onApriAiMail?: () => void;
  onElimina: () => void;
}) {
  const eta = etaGiorni(lead.created_at);
  const ritardo = lead.stato === 'nuovo' && eta >= GIORNI_RISPOSTA_LEAD;
  const info = analizzaMessaggioLead(lead.nome, lead.messaggio);
  const titolo = info.persona || lead.nome;
  const email = info.email || (lead.contatto?.includes('@') ? lead.contatto : null);
  const telefono = info.telefono;

  // Le azioni dentro la scheda non devono far scattare anche il pop-up:
  // sul web l'evento risale, quindi lo si ferma qui.
  const solo = (fn: () => void) => (e?: any) => {
    e?.stopPropagation?.();
    fn();
  };

  return (
    <Pressable
      style={({ hovered }: any) => [styles.card, onApri && hovered && styles.cardHover]}
      onPress={onApri}
      disabled={!onApri}
      accessibilityRole={onApri ? 'button' : undefined}
      accessibilityLabel={onApri ? `Apri il messaggio di ${titolo}` : undefined}
    >
      <View style={styles.cardHead}>
        <Text numberOfLines={2} style={styles.nome}>{titolo}</Text>
        <Text style={[styles.eta, ritardo && styles.ritardo]}>
          {eta === 0 ? 'oggi' : `${eta}g fa`}{ritardo ? ' · in ritardo' : ''}
        </Text>
      </View>

      {/* Recapiti veri della persona: si toccano. */}
      {(email || telefono || (lead.contatto && !email)) ? (
        <View style={styles.contatti}>
          {email ? (
            <Pressable hitSlop={4} onPress={solo(() => Linking.openURL(`mailto:${email}`))} style={styles.contatto}>
              <Ionicons name="mail-outline" size={13} color={colors.testoSoft} />
              <Text style={styles.contattoTxt} numberOfLines={1}>{email}</Text>
            </Pressable>
          ) : null}
          {telefono ? (
            <Pressable hitSlop={4} onPress={solo(() => Linking.openURL(`tel:${telefono.replace(/\s+/g, '')}`))} style={styles.contatto}>
              <Ionicons name="call-outline" size={13} color={colors.testoSoft} />
              <Text style={styles.contattoTxt} numberOfLines={1}>{telefono}</Text>
            </Pressable>
          ) : null}
          {!email && lead.contatto ? (
            <Text style={styles.contattoTxt} numberOfLines={1}>{lead.contatto}</Text>
          ) : null}
        </View>
      ) : null}

      {info.testo ? <Text style={styles.messaggio} numberOfLines={3}>{info.testo}</Text> : null}

      <View style={styles.metaRow}>
        <StatusBadge small label={FONTI[lead.fonte] ?? lead.fonte} colore={colors.blue} />
        {info.daModuloSito ? (
          <Text style={styles.meta} numberOfLines={1}>modulo del sito · {lead.nome}</Text>
        ) : null}
      </View>

      {lead.stato === 'nuovo' ? (
        <View style={styles.azioni}>
          <Pressable style={styles.btn} onPress={solo(onQualifica)}>
            <Ionicons name="briefcase-outline" size={15} color={colors.bianco} />
            <Text style={styles.btnTxt}>Qualifica → trattativa</Text>
          </Pressable>
          <Pressable style={styles.btnGhost} onPress={solo(onScarta)}>
            <Text style={styles.btnGhostTxt}>Scarta</Text>
          </Pressable>
        </View>
      ) : lead.stato === 'qualificato' ? (
        <Pressable onPress={solo(onVediTrattativa)}>
          <Text style={styles.link}>Vedi la trattativa generata ›</Text>
        </Pressable>
      ) : null}

      {/* Azioni sulla MAIL, valide in qualunque stato: leggerla per intero e
          toglierla di mezzo servono anche su una richiesta già lavorata. */}
      <View style={styles.azioniMail}>
        {onApri ? (
          <Pressable hitSlop={6} onPress={solo(onApri)}>
            <Text style={styles.azioneTxt}>Apri il messaggio</Text>
          </Pressable>
        ) : null}
        {onApriAiMail ? (
          <>
            {onApri ? <Text style={styles.sep}>·</Text> : null}
            <Pressable hitSlop={6} onPress={solo(onApriAiMail)}>
              <Text style={styles.azioneTxt}>Vedila in AI Mail</Text>
            </Pressable>
          </>
        ) : null}
        {onApri || onApriAiMail ? <Text style={styles.sep}>·</Text> : null}
        <Pressable hitSlop={6} onPress={solo(onElimina)}>
          <Text style={[styles.azioneTxt, styles.azionePericolo]}>Elimina</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // DS §Card: surface + hairline + radius-l + shadow-card.
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    gap: 8,
    ...shadow.card,
  },
  // Sul web è l'unico segnale che la scheda si apre; sul telefono lo dice il
  // link «Apri il messaggio», che infatti resta.
  cardHover: { backgroundColor: colors.fill },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nome: { flex: 1, color: colors.navy, fontWeight: '700', fontSize: 15.5, letterSpacing: -0.2 },
  eta: { color: colors.testoSoft, fontSize: 12, marginTop: 2 },
  ritardo: { color: colors.errore, fontWeight: '800' },
  contatti: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  contatto: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  contattoTxt: { color: colors.testoSoft, fontSize: 12.5 },
  messaggio: { color: colors.testo, fontSize: 13.5, lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  meta: { color: colors.grigio, fontSize: 12 },
  azioni: { flexDirection: 'row', gap: 8, marginTop: 2 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnTxt: { color: colors.bianco, fontWeight: '700', fontSize: 12.5 },
  btnGhost: { borderWidth: 1, borderColor: colors.grigioChiaro, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  btnGhostTxt: { color: colors.testo, fontWeight: '700', fontSize: 12.5 },
  link: { color: colors.goldStrong, fontWeight: '700', fontSize: 13 },
  azioniMail: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  azioneTxt: { color: colors.navy, fontSize: 12.5, fontWeight: '600' },
  azionePericolo: { color: colors.errore },
  sep: { color: colors.grigio, fontSize: 12 },
});
