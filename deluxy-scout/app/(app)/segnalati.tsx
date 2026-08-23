// Rotta /segnalati — scorciatoia diretta alle Segnalazioni CS.
//
// ⚠️ Il contenuto è in components/SegnalazioniCS.tsx: la stessa lista vive
// dentro «Affiliazioni · Copertura» come quarta scheda, ed è lì che si arriva
// dal menu. Questa rotta resta per i link già in giro.
import { SegnalazioniCS } from '@/components/SegnalazioniCS';

export default function Segnalati() {
  return <SegnalazioniCS />;
}
