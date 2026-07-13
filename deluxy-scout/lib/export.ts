// Export CSV di attività e visite + condivisione file (per reportistica offline).
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { fetchAllVisits, fetchPlaces } from '@/lib/db';

function cella(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(','), ...rows.map((r) => r.map(cella).join(','))];
  // BOM UTF-8: fa aprire correttamente gli accenti a Excel.
  return '﻿' + lines.join('\r\n');
}

async function condividi(nomeFile: string, contenuto: string): Promise<void> {
  const uri = (FileSystem.cacheDirectory ?? '') + nomeFile;
  await FileSystem.writeAsStringAsync(uri, contenuto, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: nomeFile });
  }
}

export async function esportaAttivitaCsv(): Promise<number> {
  const places = await fetchPlaces();
  const headers = ['nome', 'indirizzo', 'zona', 'categoria', 'priorita', 'stato', 'linea_ipotizzata', 'lat', 'lng'];
  const rows = places.map((p) => [
    p.nome, p.indirizzo, p.zona, p.categoria, p.priorita, p.stato, p.linea_ipotizzata, p.lat, p.lng,
  ]);
  await condividi('deluxy-attivita.csv', toCsv(headers, rows));
  return places.length;
}

export async function esportaVisiteCsv(): Promise<number> {
  const visite = await fetchAllVisits();
  const headers = ['data', 'esito', 'linea_proposta', 'next_step', 'briefing', 'note_post_meeting', 'esito_analisi', 'hubspot_synced'];
  const rows = visite.map((v) => [
    v.data, v.esito, v.linea_proposta, v.next_step, v.briefing, v.note_post_meeting, v.esito_analisi, v.hubspot_synced,
  ]);
  await condividi('deluxy-visite.csv', toCsv(headers, rows));
  return visite.length;
}
