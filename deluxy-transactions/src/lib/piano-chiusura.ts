// Il piano di una riparazione in blocco: testo incollato → righe.
//
// Sta in un file suo, e non dentro `actions.ts`, per due motivi. Il primo è
// tecnico: in un modulo `"use server"` ogni export dev'essere una funzione
// async, e questa non lo è. Il secondo conta di più: la stessa lettura serve
// all'ANTEPRIMA (che deve mostrare esattamente ciò che verrà eseguito) e
// all'ESECUZIONE. Se fossero due letture diverse, l'anteprima potrebbe dire una
// cosa e la chiusura farne un'altra — ed è il tipo di divergenza che, su
// un'app che muove denaro, si scopre dopo.

export type RigaPiano = {
  riferimento: string;
  dataPagamento: string;
  motivo: string;
  errore?: string;
};

/**
 * Una riga per richiesta, in questa forma:
 *
 *     TRX-2026-000018  2026-08-28  già pagata nel Customer Service il 28/08
 *     TRX-2026-000019               già pagata nel Customer Service
 *
 * riferimento, data del pagamento (facoltativa) e motivo. Le righe vuote e
 * quelle che cominciano con `#` si saltano, così un piano si può commentare.
 *
 * La data è facoltativa di proposito: quando non si sa QUANDO è uscito il
 * denaro è meglio non scriverlo che inventarlo — chi legge fra sei mesi deve
 * poter distinguere «pagata il 28 agosto» da «pagata, data non registrata».
 */
export function leggiPiano(testo: string): RigaPiano[] {
  const righe: RigaPiano[] = [];
  for (const grezza of testo.split(/\r?\n/)) {
    const riga = grezza.trim();
    if (!riga || riga.startsWith("#")) continue;
    const m = /^(\S+)\s+(?:(\d{4}-\d{2}-\d{2})\s+)?(.*)$/.exec(riga);
    if (!m) {
      righe.push({
        riferimento: riga.slice(0, 40),
        dataPagamento: "",
        motivo: "",
        errore: "riga incomprensibile: serve «riferimento [data] motivo»",
      });
      continue;
    }
    const [, riferimento, data = "", motivo] = m;
    const pulito = motivo.trim();
    righe.push({
      riferimento,
      dataPagamento: data,
      motivo: pulito,
      errore:
        !/^TRX-\d{4}-\d{6}$/.test(riferimento)
          ? "il riferimento non ha la forma TRX-2026-000000"
          : pulito.length < 3
            ? "manca il motivo, ed è obbligatorio"
            : undefined,
    });
  }
  return righe;
}
