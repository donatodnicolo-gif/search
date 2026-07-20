"use client";

import { useState } from "react";
import { linkContattoHubspot } from "@/lib/hubspot-link";
import {
  contactName,
  downloadVcf,
  getToken,
  salvaSeAssente,
  type RigaContatto,
} from "./google-rubrica";

export type { RigaContatto };

const ETICHETTA_FONTE: Record<string, string> = { hubspot: "HubSpot", ui: "Registro", platform: "app.deluxy.it" };

type Esito = { fase: "lavoro" | "presente" | "aggiunto" | "errore"; testo: string };

export function TabellaContattiGoogle({ contatti }: { contatti: RigaContatto[] }) {
  const [esiti, setEsiti] = useState<Record<string, Esito>>({});
  const set = (id: string, e: Esito) => setEsiti((s) => ({ ...s, [id]: e }));

  // Verifica presenza per numero e, se assente, crea il contatto Google
  async function salva(r: RigaContatto) {
    set(r.id, { fase: "lavoro", testo: "Verifico…" });
    try {
      const token = await getToken();
      set(r.id, await salvaSeAssente(token, r));
    } catch (e) {
      set(r.id, { fase: "errore", testo: e instanceof Error ? e.message : "Errore" });
    }
  }

  return (
    <>
      <p className="testo-guida" style={{ marginBottom: 12 }}>
        «Salva in Google» verifica il numero nella rubrica dell&apos;account con cui acconsenti nel browser
        (primo click: consenso Google) e crea il contatto solo se manca, come{" "}
        <code>[STATO] [AZIENDA] [CITTÀ] [Nome contatto]</code> — o col «Nome su rubrica» impostato nella
        scheda del contatto. In mancanza di OAuth, «.vcf» scarica il file.
      </p>
      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Ruolo</th>
              <th>Telefono</th>
              <th>Email</th>
              <th>Azienda</th>
              <th>Fonte</th>
              <th>Google</th>
            </tr>
          </thead>
          <tbody>
            {contatti.map((c) => {
              const e = esiti[c.id];
              return (
                <tr key={c.id}>
                  <td>
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline" }}>
                      <a href={`/contatti/${c.id}`} title="Apri e modifica il contatto">
                        <div className="cella-nome">{c.nome ?? "—"}</div>
                      </a>
                      {c.hubspotId && (
                        <a href={linkContattoHubspot(c.hubspotId)} target="_blank" rel="noreferrer" title="Apri in HubSpot">
                          ↗
                        </a>
                      )}
                    </span>
                  </td>
                  <td className="cella-muta">{c.ruolo ?? "—"}</td>
                  <td className="cella-muta">
                    {c.telefono ? (
                      <a href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`} title="Chiama">{c.telefono}</a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="cella-muta">{c.email ?? "—"}</td>
                  <td>
                    <a href={`/partner/${c.partnerId}`}>
                      <div className="cella-nome">{c.partnerNome}</div>
                      <div className="cella-sub">{[c.categoria, c.citta].filter(Boolean).join(" · ")}</div>
                    </a>
                  </td>
                  <td className="cella-muta">{ETICHETTA_FONTE[c.fonte ?? "excel"] ?? "Excel"}</td>
                  <td>
                    {e && (e.fase === "presente" || e.fase === "aggiunto") ? (
                      <span className={`match-esito ${e.fase === "aggiunto" ? "ok" : "warn"}`}>{e.testo}</span>
                    ) : (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <button
                          type="button"
                          className="btn small"
                          disabled={e?.fase === "lavoro"}
                          onClick={() => salva(c)}
                          title={`Salva come "${contactName(c)}"`}
                        >
                          {e?.fase === "lavoro" ? "…" : "Salva in Google"}
                        </button>
                        <button type="button" className="btn small btn-secondario" onClick={() => downloadVcf(c)} title="Scarica .vcf">
                          .vcf
                        </button>
                        {e?.fase === "errore" && <span className="cella-fonte" title={e.testo}>errore</span>}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
