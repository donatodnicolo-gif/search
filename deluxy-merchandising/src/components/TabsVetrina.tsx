/**
 * **La riga di navigazione della Vetrina**, uguale su tutte e quattro le pagine.
 *
 * Prima Regole, Tipologie e Rotazioni si raggiungevano da tre bottoni in testa a
 * /visual, e da lì si tornava con un «←»: per passare da Regole a Rotazioni si
 * faceva scalo. Sono quattro stanze dello stesso mestiere — le collezioni, come
 * si ordinano, ogni quanto si rinfrescano, le tipologie — e si cambiano come
 * schede, non come viaggi.
 */
export function TabsVetrina({ attiva }: { attiva: "visual" | "regole" | "rotazioni" | "tipologie" }) {
  const voci = [
    { id: "visual", href: "/visual", nome: "Collezioni" },
    { id: "regole", href: "/visual/regole", nome: "Regole d'ordine" },
    { id: "rotazioni", href: "/visual/rotazioni", nome: "Rotazioni" },
    { id: "tipologie", href: "/visual/tipologie", nome: "Tipologie" },
  ] as const;
  return (
    <nav className="tabs" aria-label="Vetrina">
      {voci.map((v) => (
        <a key={v.id} className={`tab${attiva === v.id ? " attivo" : ""}`} href={v.href} aria-current={attiva === v.id ? "page" : undefined}>
          {v.nome}
        </a>
      ))}
    </nav>
  );
}
