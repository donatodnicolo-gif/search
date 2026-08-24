"use client";

// Form inline che chiede conferma prima di lanciare una server action
// distruttiva (eliminare una riga di storico, togliere un'assegnazione…).

export function FormConferma({
  azione,
  conferma,
  campi,
  etichetta,
  classe = "btn ghost mini",
}: {
  azione: (fd: FormData) => Promise<void>;
  conferma: string;
  campi: Record<string, string>;
  etichetta: string;
  classe?: string;
}) {
  return (
    <form
      action={azione}
      style={{ display: "inline" }}
      onSubmit={(e) => {
        if (!window.confirm(conferma)) e.preventDefault();
      }}
    >
      {Object.entries(campi).map(([nome, valore]) => (
        <input key={nome} type="hidden" name={nome} value={valore} />
      ))}
      <button type="submit" className={classe}>
        {etichetta}
      </button>
    </form>
  );
}
