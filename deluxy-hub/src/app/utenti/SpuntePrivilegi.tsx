// Le due spunte dei privilegi del portale, al posto della vecchia tendina
// «Ruolo» (Amministratore / Partner / Commerciale). La FUNZIONE di una persona
// arriva da Personale e non si sceglie qui; qui si decide solo cosa può fare
// nel portale. Usato dal modulo «Nuovo utente» e dal pannello «Modifica»:
// lo stesso markup, così le due strade non divergono.
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
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
        <input type="checkbox" name="esterno" defaultChecked={ruolo === "partner"} style={{ width: "auto" }} />
        Esterno / partner — non sta in Personale, vede la propria scheda in Finance
      </label>
      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
        La funzione (Maison, Commerciale, Operation…) arriva da Personale e si corregge là.
      </span>
    </div>
  );
}
