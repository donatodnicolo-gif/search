import { prisma } from "@/lib/db";
import { dataIt, euro } from "@/lib/formato";
import { TIPI_BENEFIT_BASE, normalizzaNome } from "@/lib/organico";
import {
  assegnaBenefit,
  creaTipiBenefitBase,
  creaTipoBenefit,
  eliminaTipoBenefit,
  rimuoviBenefit,
} from "@/lib/azioni";
import { FormConferma } from "@/components/FormConferma";
import { RigaLink } from "@/components/RigaLink";
import { NotaEsito } from "@/components/NotaEsito";

// La tabella dei benefit: una riga per persona attiva, una colonna per tipo
// (buoni pasto, cellulare, PC, auto…). Il VOCABOLARIO dei tipi lo governa
// l'amministratore qui sotto: i quattro di base nascono con un click, gli
// altri si aggiungono a piacere. Il valore mensile si dichiara se lo si
// conosce — mai dedotto — e il totale dice per quanti benefit è dichiarato.

export const dynamic = "force-dynamic";

export default async function PaginaBenefit({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; nota?: string }>;
}) {
  const sp = await searchParams;

  const [tipi, persone] = await Promise.all([
    prisma.tipoBenefit.findMany({
      where: { attivo: true },
      include: { _count: { select: { assegnazioni: true } } },
      orderBy: [{ ordine: "asc" }, { nome: "asc" }],
    }),
    prisma.persona.findMany({
      where: { stato: "attivo" },
      include: { funzione: true, benefit: { include: { tipo: true }, orderBy: { creatoIl: "asc" } } },
      orderBy: { nome: "asc" },
    }),
  ]);

  const conBenefit = persone.filter((p) => p.benefit.length > 0);
  const totaleAssegnati = persone.reduce((s, p) => s + p.benefit.length, 0);
  const conValore = persone.flatMap((p) => p.benefit).filter((b) => b.valoreMensile != null);
  const totaleValore = conValore.reduce((s, b) => s + Number(b.valoreMensile), 0);
  const nomiBase = new Set(tipi.map((t) => normalizzaNome(t.nome)));
  const basiMancanti = TIPI_BENEFIT_BASE.filter((t) => !nomiBase.has(normalizzaNome(t.nome)));

  return (
    <>
      <div className="page-testa">
        <div>
          <h1 className="page-title">Benefit</h1>
          <p className="page-sub">
            Cosa ha in mano ogni persona attiva: buoni pasto, cellulare, PC, auto e gli altri tipi
            che l&apos;amministratore aggiunge qui sotto.
          </p>
        </div>
      </div>

      {sp.err && <div className="avviso-errore">{sp.err}</div>}
      {sp.nota && <NotaEsito testo={sp.nota} />}

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-nome">Benefit assegnati</div>
          <div className="kpi-valore">{totaleAssegnati}</div>
          <div className="kpi-nota">
            {conBenefit.length === 0
              ? "nessuna persona ne ha"
              : `a ${conBenefit.length} person${conBenefit.length === 1 ? "a" : "e"} su ${persone.length} attive`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-nome">Valore mensile dichiarato</div>
          <div className="kpi-valore">{conValore.length > 0 ? euro(totaleValore) : "—"}</div>
          <div className="kpi-nota">
            {conValore.length === 0
              ? "nessun valore dichiarato"
              : conValore.length < totaleAssegnati
                ? `su ${conValore.length} benefit: ${totaleAssegnati - conValore.length} senza valore`
                : conValore.length === 1
                  ? "l'unico benefit assegnato"
                  : `tutti i ${conValore.length} benefit assegnati`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-nome">Tipi a catalogo</div>
          <div className="kpi-valore">{tipi.length}</div>
          <div className="kpi-nota">{tipi.length === 0 ? "parti dai quattro di base" : "si gestiscono qui sotto"}</div>
        </div>
      </div>

      {/* ---------- La tabella persone × benefit ---------- */}
      {tipi.length === 0 ? (
        <div className="card vuoto">
          <div className="vuoto-icona">🎁</div>
          <div className="vuoto-titolo">Nessun tipo di benefit a catalogo</div>
          <div className="vuoto-testo">
            Parti dai quattro di base (buoni pasto, cellulare, PC, auto aziendale) o crea i tuoi qui
            sotto: poi li assegni alle persone.
          </div>
        </div>
      ) : persone.length === 0 ? (
        <div className="card vuoto">
          <div className="vuoto-icona">🎁</div>
          <div className="vuoto-titolo">Nessuna persona attiva</div>
          <div className="vuoto-testo">Aggiungi le persone, poi assegna loro i benefit.</div>
        </div>
      ) : (
        <div className="tabella-card">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                {tipi.map((t) => (
                  <th key={t.id}>{t.nome}</th>
                ))}
                <th className="num">Valore mensile</th>
              </tr>
            </thead>
            <tbody>
              {persone.map((p) => {
                const valoriDichiarati = p.benefit.filter((b) => b.valoreMensile != null);
                const valorePersona = valoriDichiarati.reduce((s, b) => s + Number(b.valoreMensile), 0);
                return (
                  // La riga è la persona: tutta la riga apre la sua scheda (Libro §8).
                  <RigaLink key={p.id} href={`/persone/${p.id}`}>
                    <td data-label="Nome">
                      <a className="link-nome" href={`/persone/${p.id}`}>
                        {p.nome}
                      </a>
                      <div className="sotto-nome">{p.funzione?.nome || p.ruolo || " "}</div>
                    </td>
                    {tipi.map((t) => {
                      const assegnati = p.benefit.filter((b) => b.tipoId === t.id);
                      return (
                        <td key={t.id}>
                          {assegnati.length === 0 ? (
                            <span className="cella-vuota">—</span>
                          ) : (
                            assegnati.map((b) => (
                              <div key={b.id} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                                <span style={{ color: "var(--green)", fontWeight: 600 }}>✓</span>
                                <span>
                                  {b.dettaglio || t.nome}
                                  {b.valoreMensile != null && (
                                    <span style={{ color: "var(--text-secondary)" }}>
                                      {" "}
                                      · {euro(Number(b.valoreMensile))}/mese
                                    </span>
                                  )}
                                  {b.dal && (
                                    <span className="sotto-nome" style={{ display: "inline", marginLeft: 4 }}>
                                      dal {dataIt(b.dal)}
                                    </span>
                                  )}
                                </span>
                                <FormConferma
                                  azione={rimuoviBenefit}
                                  conferma={`Togliere «${t.nome}» a ${p.nome}?`}
                                  campi={{ id: b.id, personaId: p.id, torna: "/benefit" }}
                                  etichetta="×"
                                  classe="chip-x"
                                />
                              </div>
                            ))
                          )}
                        </td>
                      );
                    })}
                    <td data-label="Valore mensile" className="num">
                      {valoriDichiarati.length > 0 ? (
                        <>
                          {euro(valorePersona)}
                          {valoriDichiarati.length < p.benefit.length && (
                            <div className="sotto-nome">
                              {p.benefit.length - valoriDichiarati.length} senza valore
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="cella-vuota">{p.benefit.length > 0 ? "non dichiarato" : "—"}</span>
                      )}
                    </td>
                  </RigaLink>
                );
              })}
              {conValore.length > 0 && (
                <tr className="riga-totale">
                  <td data-piena="" colSpan={tipi.length + 1}>
                    Totale valori dichiarati ({conValore.length} benefit su {totaleAssegnati})
                  </td>
                  <td className="num">{euro(totaleValore)}/mese</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- Assegna un benefit ---------- */}
      {tipi.length > 0 && persone.length > 0 && (
        <div className="card">
          <div className="card-testa">
            <div>
              <h2 className="card-titolo">Assegna un benefit</h2>
              <p className="card-sub">
                Si assegna anche dalla scheda della persona. Il valore mensile si scrive se lo si
                conosce: non si deduce mai.
              </p>
            </div>
          </div>
          <form action={assegnaBenefit} className="form-inline">
            <input type="hidden" name="torna" value="/benefit" />
            <div className="campo">
              <label>Persona <span className="ob">*</span></label>
              <select name="personaId" required defaultValue="">
                <option value="" disabled>
                  Scegli…
                </option>
                {persone.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>Benefit <span className="ob">*</span></label>
              <select name="tipoId" required defaultValue="">
                <option value="" disabled>
                  Scegli…
                </option>
                {tipi.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo" style={{ flex: 2 }}>
              <label>Dettaglio</label>
              <input type="text" name="dettaglio" placeholder="Es. 8 €/giorno, iPhone 14, targa…" />
            </div>
            <div className="campo" style={{ maxWidth: 170 }}>
              <label>Valore mensile € (se noto)</label>
              <input type="text" inputMode="decimal" name="valoreMensile" placeholder="Es. 160" />
            </div>
            <div className="campo" style={{ maxWidth: 180 }}>
              <label>Dal</label>
              <input type="date" name="dal" />
            </div>
            <button className="btn" type="submit">
              Assegna
            </button>
          </form>
        </div>
      )}

      {/* ---------- Il catalogo dei tipi ---------- */}
      <div className="card">
        <div className="card-testa">
          <div>
            <h2 className="card-titolo">Tipi di benefit</h2>
            <p className="card-sub">
              Il vocabolario con cui l&apos;azienda ragiona: l&apos;amministratore aggiunge qui i
              tipi nuovi. Un tipo assegnato a qualcuno non si può eliminare.
            </p>
          </div>
        </div>

        {tipi.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {tipi.map((t) => (
              <div key={t.id} className="riga-chiave">
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 550, fontSize: 14 }}>{t.nome}</div>
                  <div className="sotto-nome">
                    {[
                      t.descrizione,
                      t._count.assegnazioni > 0
                        ? `assegnato a ${t._count.assegnazioni} person${t._count.assegnazioni === 1 ? "a" : "e"}`
                        : "non ancora assegnato",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <FormConferma
                  azione={eliminaTipoBenefit}
                  conferma={`Eliminare il tipo di benefit «${t.nome}» dal catalogo?`}
                  campi={{ id: t.id }}
                  etichetta="Elimina"
                  classe="btn pericolo mini"
                />
              </div>
            ))}
          </div>
        )}

        <form action={creaTipoBenefit} className="form-inline">
          <div className="campo">
            <label>Nuovo tipo di benefit <span className="ob">*</span></label>
            <input type="text" name="nome" required placeholder="Es. Welfare aziendale, palestra, formazione…" />
          </div>
          <div className="campo" style={{ flex: 2 }}>
            <label>Descrizione</label>
            <input type="text" name="descrizione" placeholder="Cosa comprende (facoltativo)" />
          </div>
          <button className="btn" type="submit">
            Aggiungi al catalogo
          </button>
        </form>

        {basiMancanti.length > 0 && (
          <form action={creaTipiBenefitBase} style={{ marginTop: 12 }}>
            <button className="btn ghost" type="submit">
              Crea i tipi di base mancanti ({basiMancanti.map((t) => t.nome).join(", ")})
            </button>
          </form>
        )}
      </div>
    </>
  );
}
