"use client";

import { useEffect } from "react";

// Registra il service worker che rende il Hub installabile come app.
// È l'unico compito: il SW non mette nulla in cache (vedi public/sw.js).
export function PWARegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registrazione fallita (es. modalità privata): l'app resta usabile dal
        // browser, solo non si «installa». Non è un errore da mostrare.
      });
    }
  }, []);
  return null;
}
