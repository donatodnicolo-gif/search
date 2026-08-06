"use client";

/**
 * La casella «tutti» in cima alla barra delle azioni in blocco.
 *
 * È l'**unica cosa di questa pagina che non si può fare col solo HTML**: senza
 * JavaScript servirebbe ricaricare la pagina con un parametro, e ogni ricarica
 * riporta la vista altrove — il problema che si è appena tolto di mezzo dal ×.
 * Quindi un componente client minimo, come già fa la barra dei filtri.
 *
 * **Si parte da `closest("form")`, non da `document.querySelector("form")`.**
 * Il primo form della pagina è il selettore d'ambito nella barra in alto: da lì
 * si spunterebbero le caselle sbagliate, o nessuna. È una trappola già pagata
 * nella generazione delle descrizioni con l'AI.
 *
 * Spuntandone poi una a mano la casella «tutti» resta com'è: tenerla allineata
 * vorrebbe dire ascoltare ogni casella, e per un comando che si usa una volta
 * sola non vale la complicazione. Quello che conta è cosa risulta spuntato al
 * momento dell'invio, e quello è sempre giusto.
 */
export function SelezionaTutti({ quanti }: { quanti: number }) {
  return (
    <label
      style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}
      title={`Spunta tutti i ${quanti} prodotti in elenco`}
    >
      <input
        type="checkbox"
        style={{ width: 16, height: 16, cursor: "pointer" }}
        onChange={(e) => {
          const spuntato = e.currentTarget.checked;
          const form = e.currentTarget.closest("form");
          form?.querySelectorAll<HTMLInputElement>('input[name="scelti"]').forEach((x) => {
            x.checked = spuntato;
          });
          // Le due barre (sopra e sotto) hanno ognuna la sua casella «tutti»:
          // si allineano fra loro, altrimenti una direbbe il contrario dell'altra.
          form?.querySelectorAll<HTMLInputElement>('input[data-tutti="1"]').forEach((x) => {
            x.checked = spuntato;
          });
        }}
        data-tutti="1"
      />
      Tutti ({quanti})
    </label>
  );
}
