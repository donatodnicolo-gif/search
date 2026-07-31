"use client";

import { useLayoutEffect, useRef, useState } from "react";

// **Un campo di euro che si scrive come si legge.**
//
// Un `<input type="number">` mostra `55000` mentre la riga accanto mostra
// `50.576 €`: chi confronta una proposta col consuntivo deve contare gli zeri a
// occhio, ed è esattamente il modo in cui si scrive un dieci volte più grande
// senza accorgersene. Qui i punti delle migliaia e il simbolo € compaiono
// **mentre si digita**.
//
// Le tre cose che rendono la formattazione dal vivo fastidiosa, e come sono
// risolte:
//
//  1. **il cursore salta**: riscrivendo il testo a ogni tasto, il cursore
//     tornerebbe in fondo anche correggendo una cifra in mezzo. Si conta quanti
//     caratteri *significativi* (cifre e virgola) stanno prima del cursore e lo
//     si rimette dopo gli stessi, qualunque punto sia comparso o sparito;
//  2. **il punto è ambiguo**: chi scrive `55.000` intende le migliaia, e quel
//     punto lo mettiamo già noi — quindi il punto digitato si **ignora**. La
//     virgola invece è il separatore dei decimali e si accetta una volta sola;
//  3. **zero non è vuoto**: un campo vuoto è un mese non ancora proposto, uno
//     `0 €` è una proposta di non vendere niente. Il campo resta vuoto finché
//     non si scrive.

const SIGNIFICATIVO = /[\d,]/;

// Tiene solo cifre e una virgola con al massimo due decimali. Tutto il resto —
// punti, spazi, il simbolo € che ci siamo messi da soli — sparisce.
export function pulisci(grezzo: string): string {
  let out = "";
  let virgola = false;
  let decimali = 0;
  for (const c of grezzo) {
    if (c >= "0" && c <= "9") {
      if (virgola) {
        if (decimali >= 2) continue;
        decimali++;
      }
      out += c;
    } else if (c === "," && !virgola) {
      virgola = true;
      out += out.length ? "," : "0,";
    }
  }
  return out;
}

// Da «55000» a «55.000 €». La parte decimale si mostra **così com'è digitata**:
// riformattarla vorrebbe dire che scrivendo «55,» la virgola sparisce e non si
// riesce a digitare un decimale.
export function formatta(grezzo: string): string {
  if (!grezzo) return "";
  const [intero, decimale] = grezzo.split(",");
  const senzaZeriIniziali = intero.replace(/^0+(?=\d)/, "");
  const conPunti = senzaZeriIniziali ? Number(senzaZeriIniziali).toLocaleString("it-IT") : "0";
  return `${decimale === undefined ? conPunti : `${conPunti},${decimale}`} €`;
}

export function valoreDi(grezzo: string): number {
  const n = Number(grezzo.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function CampoEuro({
  valore,
  onChange,
  ...resto
}: {
  valore: number;
  onChange: (v: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const ref = useRef<HTMLInputElement>(null);
  // Il testo grezzo si tiene qui e non nel numero del padre: `55,` e `55` sono
  // lo stesso numero ma non lo stesso stato di digitazione, e senza questo la
  // virgola non si riesce a scrivere.
  const [grezzo, setGrezzo] = useState(() => (valore ? String(valore).replace(".", ",") : ""));
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const n = caret.current;
    if (!el || n === null) return;
    caret.current = null;
    let visti = 0;
    let pos = 0;
    while (pos < el.value.length && visti < n) {
      if (SIGNIFICATIVO.test(el.value[pos])) visti++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  });

  return (
    <input
      {...resto}
      ref={ref}
      type="text"
      inputMode="decimal"
      value={formatta(grezzo)}
      onChange={(e) => {
        const prima = e.target.value.slice(0, e.target.selectionStart ?? 0);
        caret.current = (prima.match(/[\d,]/g) ?? []).length;
        const nuovo = pulisci(e.target.value);
        setGrezzo(nuovo);
        onChange(valoreDi(nuovo));
      }}
    />
  );
}
