// La spunta dei privilegi del portale, al posto della vecchia tendina «Ruolo»
// (Amministratore / Partner / Commerciale). La FUNZIONE di una persona arriva
// da Personale e non si sceglie qui; qui si decide solo cosa può fare nel
// portale. Usato dal modulo «Nuovo utente» e dal pannello «Modifica»: lo
// stesso markup, così le due strade non divergono.
//
// Regola dell'utente (06/09/2026): «ad Hub potranno accedere per ora solo
// utenti interni all'azienda». Quindi una spunta sola: Amministratore. Il
// ruolo «partner» (esterni) resta nel codice per quando servirà, ma dal
// portale non si assegna.
export function SpuntePrivilegi({ ruolo }: { ruolo: string }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500 }}>
        Privilegi nel portale
      </span>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
        <input
          type="checkbox"
          name="amministratore"
          defaultChecked={ruolo === "admin"}
          style={{ width: "auto" }}
        />
        Amministratore — gestisce gli utenti e vede tutte le app
      </label>
      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
        Per ora entrano solo persone interne all&rsquo;azienda. La funzione (Maison, Commerciale,
        Operation…) arriva da Personale e si corregge là.
      </span>
    </div>
  );
}
