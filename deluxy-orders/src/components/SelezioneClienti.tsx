"use client";

import { type ChangeEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

// LA CONFERMA IN BLOCCO DALLA LISTA.
//
// Nasce dalla coda «Probabili aziende da confermare»: 1.105 clienti fermi da
// 39 giorni perché la tipologia si confermava UN cliente alla volta, dalla sua
// scheda. Qui si spuntano le righe (o tutta la pagina), si sceglie cosa sono e
// si conferma in un colpo. La scelta finisce in `TagCliente` esattamente come
// dalla scheda: la mano vince, la deduzione automatica non tocca più quei
// clienti, e la lista si accorcia da sola (chi è confermato ne esce).
//
// È un form vero, con le caselle dentro la tabella: lo stato della selezione
// sta nel DOM (le caselle), non in React — così la tabella resta il server
// component che è, e questo componente si limita a CONTARE e a dare i comandi
// «tutta la pagina / nessuno». Il pulsante dice sempre quanti ne sta per
// confermare: è il numero che l'operatore deve leggere prima di premere.
export function SelezioneClienti({
  action,
  lista,
  tipologie,
  tipoPredefinito,
  ritorno,
  children,
}: {
  action: (fd: FormData) => Promise<void>;
  lista: string;
  // Il vocabolario delle tipologie arriva dal server: `segmenti.ts` importa
  // Prisma e in un client component non può entrare (trappola pagata il 07/09).
  tipologie: { chiave: string; nome: string }[];
  // La tipologia proposta nel menu (per la coda «probabili aziende» è
  // «azienda»); altrove si parte dalla scelta esplicita.
  tipoPredefinito?: string;
  // Dove tornare dopo la conferma: la stessa pagina, con gli stessi filtri.
  ritorno: string;
  children: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [scelti, setScelti] = useState(0);
  const [inPagina, setInPagina] = useState(0);

  const caselle = useCallback(
    () => Array.from(form.current?.querySelectorAll<HTMLInputElement>('input[name="chiave"]') ?? []),
    [],
  );
  const casellaTutti = useCallback(
    () => form.current?.querySelector<HTMLInputElement>('input[name="tutti"]') ?? null,
    [],
  );

  const conta = useCallback(() => {
    const righe = caselle();
    setInPagina(righe.length);
    setScelti(righe.filter((c) => c.checked).length);
    const tutti = casellaTutti();
    if (tutti) tutti.checked = righe.length > 0 && righe.every((c) => c.checked);
  }, [caselle, casellaTutti]);

  // Al primo render (e a ogni cambio di pagina) si conta da zero: il browser
  // può ricordare le spunte di prima quando si torna indietro.
  useEffect(() => {
    conta();
  }, [conta, children]);

  function seleziona(tutte: boolean) {
    for (const c of caselle()) c.checked = tutte;
    conta();
  }

  function onChange(e: ChangeEvent<HTMLFormElement>) {
    const t = e.target as unknown as HTMLInputElement;
    if (t.name === "tutti") seleziona(t.checked);
    else if (t.name === "chiave") conta();
  }

  return (
    <form ref={form} action={action} onChange={onChange}>
      <input type="hidden" name="lista" value={lista} />
      <input type="hidden" name="ritorno" value={ritorno} />
      {children}

      {/* La barra resta in vista mentre si scorre la tabella (sticky in
          basso): la selezione vive sopra, il comando è sempre a portata. */}
      {inPagina > 0 && (
        <div className="barra-selezione" role="region" aria-label="Conferma in blocco">
          <span className="barra-conto" aria-live="polite">
            <b>{scelti}</b> {scelti === 1 ? "selezionato" : "selezionati"} su {inPagina} in questa pagina
          </span>
          <button
            type="button"
            className="btn btn-secondario small"
            onClick={() => seleziona(scelti < inPagina)}
          >
            {scelti < inPagina ? "Seleziona tutta la pagina" : "Nessuno"}
          </button>
          <label className="barra-campo">
            Sono
            <select name="tipo" defaultValue={tipoPredefinito ?? ""} aria-label="Tipologia da assegnare">
              {!tipoPredefinito && <option value="">Scegli la tipologia…</option>}
              {tipologie.map((t) => (
                <option key={t.chiave} value={t.chiave}>{t.nome}</option>
              ))}
            </select>
          </label>
          <button className="btn spinta" type="submit" disabled={scelti === 0}>
            {scelti === 0
              ? "Conferma la tipologia"
              : `Conferma ${scelti} ${scelti === 1 ? "cliente" : "clienti"}`}
          </button>
        </div>
      )}
    </form>
  );
}
