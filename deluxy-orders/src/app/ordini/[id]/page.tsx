import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { euro, dataBreve, consegnaBreve, urgenzaConsegna } from "@/lib/ordini";
import { statiOrdinati } from "@/lib/stati";
import { CATEGORIE_PAGAMENTO, APP_DESTINAZIONI, nomeApp } from "@/lib/classificazione";
import { cambiaStato, toggleEtichetta, aggiornaClassificazione } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function DettaglioOrdine({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ordine, stati, etichette] = await Promise.all([
    prisma.ordine.findUnique({
      where: { id },
      include: {
        stato: true,
        etichette: true,
        righe: true,
        negozio: { select: { brand: true } },
        eventi: { orderBy: { creatoIl: "desc" }, take: 40 },
      },
    }),
    statiOrdinati(),
    prisma.etichetta.findMany({ orderBy: { nome: "asc" } }),
  ]);
  if (!ordine) notFound();

  const etichetteAttive = new Set(ordine.etichette.map((e) => e.id));

  return (
    <main className="main">
      <Link href="/" className="ritorno">← Tutti gli ordini</Link>

      <div className="page-head">
        <div>
          <h1 className="page-title">{ordine.numero}</h1>
          <p className="page-sub">
            {ordine.brand} · {dataBreve(ordine.data)} · {euro(ordine.totale, ordine.valuta)}
          </p>
          {consegnaBreve(ordine.dataConsegna, ordine.fasciaConsegna) && (
            <p className={`consegna consegna-${urgenzaConsegna(ordine.dataConsegna) ?? "futura"}`} style={{ marginTop: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
              </svg>
              Consegna: {consegnaBreve(ordine.dataConsegna, ordine.fasciaConsegna)}
            </p>
          )}
        </div>
      </div>

      {/* Stato / pipeline */}
      <div className="scheda">
        <div className="scheda-titolo">Stato</div>
        <div className="selettore-stato">
          {stati.map((s) => {
            const attuale = s.id === ordine.statoId;
            return (
              <form action={cambiaStato} key={s.id}>
                <input type="hidden" name="ordineId" value={ordine.id} />
                <input type="hidden" name="statoId" value={s.id} />
                <button className={`stato-pill${attuale ? " attuale" : ""}`} disabled={attuale} style={{ color: s.colore }}>
                  <span className="dot" /><span className="stato-label">{s.nome}</span>
                </button>
              </form>
            );
          })}
        </div>
      </div>

      {/* Etichette */}
      <div className="scheda">
        <div className="scheda-titolo">Etichette</div>
        {etichette.length === 0 ? (
          <p className="testo-guida">Nessuna etichetta. Creane in <Link href="/impostazioni" className="ritorno">Impostazioni</Link>.</p>
        ) : (
          <div className="selettore-stato">
            {etichette.map((e) => {
              const attiva = etichetteAttive.has(e.id);
              return (
                <form action={toggleEtichetta} key={e.id}>
                  <input type="hidden" name="ordineId" value={ordine.id} />
                  <input type="hidden" name="etichettaId" value={e.id} />
                  <button className={`stato-pill${attiva ? " attuale" : ""}`} style={{ color: e.colore }}>
                    <span className="dot" /><span className="stato-label">{attiva ? "✓ " : ""}{e.nome}</span>
                  </button>
                </form>
              );
            })}
          </div>
        )}
      </div>

      {/* Classificazione / instradamento */}
      <div className="scheda">
        <div className="scheda-titolo">Classificazione e instradamento</div>
        <form action={aggiornaClassificazione} className="modulo">
          <input type="hidden" name="ordineId" value={ordine.id} />
          <div className="campo-modulo">
            <label>Categoria pagamento</label>
            <select name="categoriaPagamento" defaultValue={ordine.categoriaPagamento}>
              {CATEGORIE_PAGAMENTO.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="campo-modulo">
            <label>Destinazione (app)</label>
            <select name="assegnatoApp" defaultValue={ordine.assegnatoApp ?? ""}>
              <option value="">— nessuna —</option>
              {APP_DESTINAZIONI.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>
          <div className="campo-modulo">
            <label>Tipo consegna</label>
            <input name="tipoConsegna" defaultValue={ordine.tipoConsegna ?? ""} placeholder="consegna, ritiro, spedizione…" />
          </div>
          <div className="campo-modulo">
            <label>Tipo prodotto</label>
            <input name="tipoProdotto" defaultValue={ordine.tipoProdotto ?? ""} placeholder="fiori, pasticceria, gift…" />
          </div>
          <div className="campo-modulo">
            <label>Canale</label>
            <input name="canale" defaultValue={ordine.canale ?? ""} placeholder="web, telefono, rivenditore…" />
          </div>
          <div className="campo-modulo">
            <label>Fornitore assegnato</label>
            <input name="fornitore" defaultValue={ordine.fornitore ?? ""} placeholder="fiorario/pasticceria" />
          </div>
          <div className="campo-modulo">
            <label>Responsabile</label>
            <input name="responsabile" defaultValue={ordine.responsabile ?? ""} placeholder="persona o email in carico" />
          </div>
          <div className="campo-modulo largo">
            <label>Note interne</label>
            <textarea name="noteInterne" rows={3} defaultValue={ordine.noteInterne ?? ""} />
          </div>
          <div className="azioni-modulo largo">
            <button className="btn" type="submit">Salva classificazione</button>
          </div>
        </form>
      </div>

      {/* Dati Shopify */}
      <div className="scheda">
        <div className="scheda-titolo">Dati Shopify</div>
        <dl className="griglia-campi">
          <div className="campo"><dt>Pagamento</dt><dd>{ordine.financialStatus ?? "—"}</dd></div>
          <div className="campo"><dt>Evasione</dt><dd>{ordine.fulfillmentStatus ?? "—"}</dd></div>
          <div className="campo"><dt>Gateway</dt><dd>{ordine.gateway ?? "—"}</dd></div>
          <div className="campo"><dt>Cliente</dt><dd>{ordine.clienteNome ?? "—"}</dd></div>
          <div className="campo"><dt>Email</dt><dd>{ordine.clienteEmail ?? "—"}</dd></div>
          <div className="campo"><dt>Telefono</dt><dd>{ordine.clienteTelefono ?? "—"}</dd></div>
          <div className="campo campo-largo"><dt>Spedizione</dt><dd>
            {[ordine.spedizioneNome, ordine.indirizzo, [ordine.cap, ordine.citta, ordine.provincia].filter(Boolean).join(" "), ordine.paese]
              .filter(Boolean).join(" · ") || "—"}
          </dd></div>
          {ordine.tagShopify && <div className="campo campo-largo"><dt>Tag Shopify</dt><dd>{ordine.tagShopify}</dd></div>}
          {ordine.noteShopify && <div className="campo campo-largo"><dt>Note Shopify</dt><dd>{ordine.noteShopify}</dd></div>}
        </dl>
        {ordine.righe.length > 0 && (
          <ul className="righe" style={{ marginTop: 16 }}>
            {ordine.righe.map((r) => (
              <li key={r.id}>
                <span className="riga-qta">{r.quantita}×</span>
                <span className="riga-titolo">
                  {r.titolo}{r.variante ? ` — ${r.variante}` : ""}{r.sku ? ` · ${r.sku}` : ""}
                </span>
                <span className="riga-prezzo">{euro(r.prezzo, ordine.valuta)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Storia */}
      <div className="scheda">
        <div className="scheda-titolo">Storia</div>
        {ordine.eventi.length === 0 ? (
          <p className="testo-guida">Nessun evento.</p>
        ) : (
          <ul className="storia">
            {ordine.eventi.map((ev) => (
              <li key={ev.id}>
                <span className="storia-data">{new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(ev.creatoIl)}</span>
                <span>{ev.descrizione}</span>
                <span className="storia-autore">{ev.autore}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
