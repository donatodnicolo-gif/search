import Link from "next/link";
import { canale, titoloCanale } from "@/lib/marketing";
import { bandiera, daLontano, normalizzaCitta, nomePaese } from "@/lib/luoghi";
import { urgenza as tipoUrgenza } from "@/lib/urgenza";
import type { Ordinale } from "@/lib/repeater";

// I due segni che raccontano un ordine prima ancora di aprirlo: **da dove
// arriva** (il canale di marketing, un simbolo solo) e **chi lo fa** (prima
// volta o cliente che torna).
//
// Se la provenienza non si sa, non esce niente: nessun simbolo, nessun «?». Un
// posto vuoto si legge come «non lo sappiamo», un simbolo inventato no.

export function SegnoCanale({
  ordine,
  conNome = false,
}: {
  ordine: {
    canaleMarketing: string;
    utmCampaign?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    visitaSorgente?: string | null;
  };
  conNome?: boolean;
}) {
  const c = canale(ordine.canaleMarketing);
  if (!c) return null;
  return (
    <span className={`segno-canale${c.pagato ? " pagato" : ""}`} title={titoloCanale(ordine)}>
      <span aria-hidden>{c.simbolo}</span>
      <span className={conNome ? "" : "solo-lettori"}>{c.nome}</span>
    </span>
  );
}

// «1º ordine» o «Repeater · 4º». Assente quando l'ordine non ha un cliente
// riconoscibile: lì non si sa se sia un ritorno, e non si tira a indovinare.
export function PillRepeater({ ordinale }: { ordinale: Ordinale | undefined }) {
  if (!ordinale) return null;
  return (
    <span
      className={`pill-repeater${ordinale.repeater ? " repeater" : ""}`}
      title={
        ordinale.repeater
          ? `Cliente che torna: prima di questo aveva già fatto ${ordinale.precedenti} ${
              ordinale.precedenti === 1 ? "ordine" : "ordini"
            } (annullati esclusi).`
          : "Prima volta: nessun ordine valido prima di questo."
      }
    >
      {ordinale.repeater ? `Repeater · ${ordinale.numero}º` : "1º ordine"}
    </span>
  );
}

// ---------- I luoghi dell'ordine: dove arriva e da dove parte ----------
//
// Sono tag cliccabili: un clic filtra l'elenco su quella città o quel paese.
// Il tag c'è solo se il dato c'è: niente «città sconosciuta» a riempire il buco.

type OrdineLuoghi = {
  citta: string | null;
  paese: string | null;
  mittenteCitta: string | null;
  mittentePaese: string | null;
};

function TagLuogo({
  chiave,
  valore,
  etichetta,
  simbolo,
  titolo,
}: {
  chiave: string;
  valore: string;
  etichetta: string;
  simbolo: string;
  titolo: string;
}) {
  return (
    <Link className="tag-luogo" href={`/?${chiave}=${encodeURIComponent(valore)}`} title={titolo}>
      <span aria-hidden>{simbolo}</span>
      {etichetta}
    </Link>
  );
}

export function TagLuoghi({ ordine, compatto = false }: { ordine: OrdineLuoghi; compatto?: boolean }) {
  const cittaConsegna = normalizzaCitta(ordine.citta);
  const cittaMittente = normalizzaCitta(ordine.mittenteCitta);
  const paeseConsegna = nomePaese(ordine.paese);
  const paeseMittente = nomePaese(ordine.mittentePaese);
  const lontano = daLontano(ordine);

  // Quando mittente e destinatario sono nello stesso paese, ripetere la
  // bandiera due volte è rumore: si mostra una volta sola.
  const mostraPaeseConsegna = paeseConsegna && (lontano || !paeseMittente);

  if (!cittaConsegna && !cittaMittente && !paeseConsegna) return null;

  return (
    <span className="tag-luoghi">
      {cittaConsegna && (
        <TagLuogo
          chiave="citta"
          valore={cittaConsegna}
          etichetta={cittaConsegna}
          simbolo="📍"
          titolo={`Consegna a ${cittaConsegna}${paeseConsegna ? `, ${paeseConsegna}` : ""} — clic per vedere tutti gli ordini consegnati qui`}
        />
      )}
      {mostraPaeseConsegna && ordine.paese && (
        <TagLuogo
          chiave="paese"
          valore={ordine.paese}
          etichetta={compatto ? bandiera(ordine.paese) : `${bandiera(ordine.paese)} ${paeseConsegna}`}
          simbolo=""
          titolo={`Consegna in ${paeseConsegna}`}
        />
      )}
      {cittaMittente && !compatto && (
        <TagLuogo
          chiave="cittaMittente"
          valore={cittaMittente}
          etichetta={cittaMittente}
          simbolo="✈"
          titolo={`Chi ordina scrive da ${cittaMittente}${paeseMittente ? `, ${paeseMittente}` : ""} — clic per vedere tutti gli ordini da qui`}
        />
      )}
      {ordine.mittentePaese && lontano && (
        <TagLuogo
          chiave="paeseMittente"
          valore={ordine.mittentePaese}
          etichetta={compatto ? bandiera(ordine.mittentePaese) : `${bandiera(ordine.mittentePaese)} ${paeseMittente}`}
          simbolo="✈"
          titolo={`Ordinato dall'estero: ${paeseMittente} → ${paeseConsegna ?? "Italia"}`}
        />
      )}
    </span>
  );
}

// ---------- Quanto tempo c'è fino alla consegna ----------
export function PillUrgenza({ chiave }: { chiave: string }) {
  const u = tipoUrgenza(chiave);
  if (!u) return null;
  return (
    <span className="pill-urgenza" style={{ color: u.colore }} title={u.spiega}>
      <span className="dot" />
      {u.nome}
    </span>
  );
}
