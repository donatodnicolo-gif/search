// I TEMPLATE DEI DOCUMENTI — Scout ne è il PROPRIETARIO (27/08/2026).
//
// Decisione dell'utente: «Scout sarà l'owner dei template, a Finance vengono
// comunicate solo le pro-forme».
//
// Un template è l'intestazione con cui esce un documento: logo, ragione
// sociale, P. IVA, coordinate di pagamento, testo di legge. Uno per insegna,
// perché un cliente di Cake Design non deve ricevere un foglio intestato
// Deluxy.
//
// ⚠️ FINANCE NON NE TIENE COPIA. Quando si emette una pro-forma, l'intestazione
// viaggia INSIEME al documento e di là viene salvata sul documento come
// fotografia. Due ragioni, e la seconda conta quanto la prima:
//   1. ogni dato ha una casa sola (Standard Deluxy §7): questa è qui;
//   2. un documento già mandato al cliente NON deve cambiare aspetto il giorno
//      che qualcuno ritocca il logo o l'IBAN. Con un riferimento sarebbe
//      successo; con la fotografia no.
//
// Cosa deve avere una pro-forma, secondo la prassi italiana (verificato su più
// fonti fiscali il 27/08/2026): dicitura «fattura pro-forma» ben visibile,
// numerazione indipendente da quella fiscale, dati di chi emette (denominazione,
// indirizzo, P. IVA o codice fiscale, eventuale REA), dati del cliente,
// descrizione con IVA separata, modalità di pagamento, e in calce la formula di
// legge. Di questi, il template porta la parte che non cambia da un documento
// all'altro.
import { supabase } from '@/lib/supabase';
import { BRAND_DEFAULT } from '@/types';

export interface TemplateDocumento {
  id: string;
  nome: string;
  brand: string | null;
  attivo: boolean;
  predefinito: boolean;
  ragione_sociale: string;
  indirizzo: string | null;
  piva: string | null;
  codice_fiscale: string | null;
  rea: string | null;
  contatti: string | null;
  logo_data_url: string | null;
  iban: string | null;
  intestatario_conto: string | null;
  modalita_pagamento: string | null;
  sdi: string | null;
  pec: string | null;
  note_default: string | null;
  disclaimer: string | null;
  created_at: string;
}

/** L'intestazione come viaggia verso FINANCE: chiavi in camelCase, del loro. */
export interface IntestazioneDocumento {
  ragioneSociale: string;
  indirizzo: string;
  piva: string;
  codiceFiscale: string;
  rea: string;
  contatti: string;
  logoDataUrl: string;
  iban: string;
  intestatarioConto: string;
  modalitaPagamento: string;
  sdi: string;
  pec: string;
  disclaimer: string;
  brand: string;
}

export async function fetchTemplate(): Promise<TemplateDocumento[]> {
  const { data, error } = await supabase
    .from('template_documento')
    .select('*')
    .order('predefinito', { ascending: false })
    .order('nome');
  if (error) throw error;
  return (data ?? []) as TemplateDocumento[];
}

export async function salvaTemplate(
  id: string | null,
  campi: Partial<TemplateDocumento>,
): Promise<TemplateDocumento> {
  const q = id
    ? supabase.from('template_documento').update(campi).eq('id', id).select('*').single()
    : supabase.from('template_documento').insert(campi).select('*').single();
  const { data, error } = await q;
  if (error) throw error;
  return data as TemplateDocumento;
}

export async function eliminaTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('template_documento').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Rende predefinito un template e spegne gli altri.
 *
 * ⚠️ Prima si spegne, poi si accende: l'indice parziale ammette UN solo
 * predefinito, e l'ordine inverso violerebbe il vincolo a metà strada.
 */
export async function rendiPredefinito(id: string): Promise<void> {
  const { error: e1 } = await supabase
    .from('template_documento')
    .update({ predefinito: false })
    .eq('predefinito', true)
    .neq('id', id);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('template_documento').update({ predefinito: true }).eq('id', id);
  if (e2) throw e2;
}

/**
 * L'intestazione da mandare col documento, scelta per BRAND.
 *
 * ⚠️ Torna `null` — e non un'intestazione a caso — quando quel brand non ha un
 * template e non c'è nemmeno un predefinito: di là, senza intestazione, il
 * documento esce con quella generale, che è ciò che ha sempre fatto. Meglio la
 * generale che quella di un'altra insegna: un documento sbagliato è già partito
 * al cliente quando ce ne si accorge.
 */
export async function intestazionePerBrand(brand: string | null | undefined): Promise<IntestazioneDocumento | null> {
  const b = (brand ?? '').trim() || BRAND_DEFAULT;
  const { data, error } = await supabase.from('template_documento').select('*').eq('attivo', true);
  if (error) throw error;
  const tutti = (data ?? []) as TemplateDocumento[];
  const t =
    tutti.find((x) => x.brand === b) ??
    tutti.find((x) => x.nome === b) ??
    tutti.find((x) => x.predefinito) ??
    null;
  if (!t) return null;
  return {
    ragioneSociale: t.ragione_sociale,
    indirizzo: t.indirizzo ?? '',
    piva: t.piva ?? '',
    codiceFiscale: t.codice_fiscale ?? '',
    rea: t.rea ?? '',
    contatti: t.contatti ?? '',
    logoDataUrl: t.logo_data_url ?? '',
    iban: t.iban ?? '',
    intestatarioConto: t.intestatario_conto ?? '',
    modalitaPagamento: t.modalita_pagamento ?? '',
    sdi: t.sdi ?? '',
    pec: t.pec ?? '',
    disclaimer: t.disclaimer ?? '',
    brand: t.brand ?? t.nome,
  };
}
