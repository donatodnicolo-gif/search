// Le vendite di un fornitore lette dal Customer Service, nei due vestiti:
// la CELLA di tabella (conteggio sopra, importo sotto) e la RIGA della scheda
// sul telefono. Un componente solo per due schermate — Fornitori e
// Segnalazioni CS — che devono dire la stessa cosa nello stesso modo.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { euroTondo, riassuntoVendite, type IndiceVendite, type VenditeFornitore } from '@/lib/vendite-fornitori';
import type { EsitoVenditeFornitori } from '@/lib/customer-service';

/** La cella: «3 ordini» in evidenza e «€ 420» sotto; «—» se niente. */
export function CellaVendite({ ordini, venduto }: { ordini: number; venduto: number }) {
  if (!ordini) return <Text style={styles.muto}>—</Text>;
  return (
    <View style={styles.cella}>
      <Text style={styles.conteggio}>
        {ordini} {ordini === 1 ? 'ordine' : 'ordini'}
      </Text>
      {venduto ? <Text style={styles.importo}>{euroTondo(venduto)}</Text> : null}
    </View>
  );
}

/** La riga della scheda: «Ordini dal CS · 30 gg: 2 ordini · € 300 · 180 gg: 7 ordini · € 1.200». */
export function RigaVendite({ v, giorniLunga }: { v: VenditeFornitore | null; giorniLunga: number }) {
  if (!v || !v.ordiniLunga) return null;
  return (
    <Text style={styles.riga} numberOfLines={2}>
      <Ionicons name="bag-check-outline" size={11} color={colors.grigio} /> Ordini dal CS · 30 gg:{' '}
      <Text style={styles.rigaForte}>{riassuntoVendite(v.ordini30, v.venduto30)}</Text> · {giorniLunga} gg:{' '}
      <Text style={styles.rigaForte}>{riassuntoVendite(v.ordiniLunga, v.vendutoLunga)}</Text>
    </Text>
  );
}

/**
 * La riga di stato sotto la testata: dice da dove vengono i numeri e quando
 * sono stati letti — o perché non ci sono. ⚠️ «Non collegato» non è un
 * errore rosso: è una chiave da incollare, e lo si dice con l'indirizzo.
 */
export function StatoVendite({ esito }: { esito: EsitoVenditeFornitori | null }) {
  if (!esito) return null;
  if (esito.ok) {
    const quando = esito.indice.asOf ? new Date(esito.indice.asOf) : null;
    const ora = quando && !isNaN(quando.getTime())
      ? quando.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      : null;
    return (
      <Text style={styles.stato}>
        <Ionicons name="bag-check-outline" size={12} color={colors.testoSoft} /> Ordini affidati ai fornitori letti dal
        Customer Service{ora ? ` alle ${ora}` : ''}: {esito.ordini} negli ultimi {esito.indice.giorniLunga} giorni.
        {esito.valuteDiverse.length > 1 ? ' ⚠️ Valute diverse: i venduti non sono sommabili.' : ''}
      </Text>
    );
  }
  if (esito.motivo === 'non_configurato') {
    return (
      <Text style={styles.stato}>
        <Ionicons name="link-outline" size={12} color={colors.testoSoft} /> Le colonne «30 gg» e «180 gg» restano vuote:
        il Customer Service non è collegato. Un amministratore incolla la chiave in Profilo → Impostazioni → App
        collegate → Customer Service.
      </Text>
    );
  }
  return (
    <Text style={[styles.stato, styles.statoKo]}>
      <Ionicons name="warning-outline" size={12} color={colors.errore} /> Ordini dal Customer Service non letti:{' '}
      {esito.dettaglio}
    </Text>
  );
}

/** Chi il CS usa come fornitore ma NON sta nel registro: si dice, con i nomi. */
export function FornitoriFuoriRegistro({ fuori, giorniLunga }: { fuori: VenditeFornitore[]; giorniLunga: number }) {
  if (!fuori.length) return null;
  const mostrati = fuori.slice(0, 6);
  return (
    <View style={styles.fuori}>
      <Text style={styles.fuoriTitolo}>
        <Ionicons name="alert-circle-outline" size={13} color={colors.attenzione} /> {fuori.length}{' '}
        {fuori.length === 1 ? 'fornitore usato' : 'fornitori usati'} dal Customer Service negli ultimi {giorniLunga}{' '}
        giorni {fuori.length === 1 ? 'non risulta' : 'non risultano'} fra i fornitori del registro Anagrafiche — o lì{' '}
        {fuori.length === 1 ? 'ha' : 'hanno'} un altro nome
      </Text>
      <Text style={styles.fuoriTesto}>
        {mostrati.map((f) => `${f.nome} (${riassuntoVendite(f.ordiniLunga, f.vendutoLunga)})`).join(' · ')}
        {fuori.length > mostrati.length ? ` · +${fuori.length - mostrati.length}` : ''}
      </Text>
      <Text style={styles.fuoriNota}>
        Entrano qui quando il Customer Service li aggancia al registro (scegliendoli dalla tendina o pagandoli) o quando
        in Anagrafiche ricevono uno stato di fornitura. L'aggancio per nome funziona solo se il nome è scritto uguale.
      </Text>
    </View>
  );
}

export type { IndiceVendite };

const styles = StyleSheet.create({
  cella: { alignItems: 'flex-end' },
  conteggio: { color: colors.testo, fontWeight: '600', fontSize: 13, fontVariant: ['tabular-nums'] },
  importo: { color: colors.testoSoft, fontSize: 12, fontVariant: ['tabular-nums'] },
  muto: { color: colors.grigio, fontSize: 12.5, textAlign: 'right' },
  riga: { fontSize: 12, color: colors.grigio, fontWeight: '600', lineHeight: 17 },
  rigaForte: { color: colors.testo },
  stato: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  statoKo: { color: colors.errore },
  fuori: {
    backgroundColor: colors.bianco,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
    padding: spacing.md,
    gap: 4,
  },
  fuoriTitolo: { color: colors.testo, fontWeight: '600', fontSize: 13 },
  fuoriTesto: { color: colors.testoSoft, fontSize: 12.5, lineHeight: 18 },
  fuoriNota: { color: colors.grigio, fontSize: 12, lineHeight: 17 },
});
