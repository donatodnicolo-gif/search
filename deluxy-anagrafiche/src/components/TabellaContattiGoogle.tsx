"use client";

import { useState } from "react";
import { GOOGLE_OAUTH_CLIENT_ID } from "@/lib/google";
import { linkContattoHubspot } from "@/lib/hubspot-link";

export type RigaContatto = {
  id: string;
  nome: string | null;
  ruolo: string | null;
  telefono: string | null;
  email: string | null;
  fonte: string | null;
  hubspotId: string | null;
  partnerId: string;
  partnerNome: string;
  categoria: string | null;
  citta: string | null;
  stato: string;
  statoLabel: string;
  provincia: string | null;
  indirizzo: string | null;
  ragioneSociale: string | null;
  affiliatoReseller: boolean;
};

const ETICHETTA_FONTE: Record<string, string> = { hubspot: "HubSpot", ui: "Registro", platform: "app.deluxy.it" };

// --- Google Identity Services + People API (rubrica dell'operatore) ---
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (c: unknown) => { requestAccessToken: () => void } } } };
  }
}
let gisReady: Promise<void> | null = null;
let gisToken: { token: string; exp: number } | null = null;

function loadGis(): Promise<void> {
  if (gisReady) return gisReady;
  gisReady = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error("Impossibile caricare Google Identity."));
    document.head.appendChild(s);
  });
  return gisReady;
}

async function getToken(): Promise<string> {
  if (gisToken && gisToken.exp > Date.now()) return gisToken.token;
  await loadGis();
  return new Promise((res, rej) => {
    const tc = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_OAUTH_CLIENT_ID.trim(),
      scope: "https://www.googleapis.com/auth/contacts",
      callback: (t: { access_token?: string; expires_in?: number }) => {
        if (t?.access_token) {
          gisToken = { token: t.access_token, exp: Date.now() + ((t.expires_in ?? 3600) - 60) * 1000 };
          res(t.access_token);
        } else rej(new Error("Autorizzazione rubrica negata."));
      },
      error_callback: (err: { message?: string }) => rej(new Error(err?.message || "Autorizzazione annullata.")),
    });
    tc.requestAccessToken();
  });
}

// Nome in rubrica: [STATO] [NOME] (+ provincia se affiliato/reseller)
function contactName(r: RigaContatto): string {
  const stato = (r.statoLabel || "").toUpperCase();
  const nome = (r.nome || r.partnerNome || "").trim();
  const prov = r.affiliatoReseller && r.provincia ? " " + r.provincia.toUpperCase() : "";
  return [stato, nome].filter(Boolean).join(" ") + prov;
}

// Cerca il numero in rubrica (People API searchContacts, con warm-up)
async function findByPhone(token: string, phone: string): Promise<{ names?: { displayName?: string }[] } | null> {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (digits.length < 6) return null;
  const coda = digits.slice(-9);
  const auth = { headers: { Authorization: "Bearer " + token } };
  await fetch("https://people.googleapis.com/v1/people:searchContacts?query=&readMask=names", auth).catch(() => {});
  for (const q of [...new Set([phone.trim(), digits, coda])].filter(Boolean)) {
    const r = await fetch(
      "https://people.googleapis.com/v1/people:searchContacts?pageSize=10&readMask=names,phoneNumbers&query=" + encodeURIComponent(q),
      auth,
    );
    if (!r.ok) continue;
    const results = ((await r.json()).results || []) as { person?: { names?: unknown[]; phoneNumbers?: { value?: string }[] } }[];
    for (const res of results) {
      const p = res.person || {};
      const trovato = (p.phoneNumbers || []).some((x) => {
        const d = String(x.value || "").replace(/[^\d]/g, "");
        return d && (d.endsWith(coda) || coda.endsWith(d.slice(-9)));
      });
      if (trovato) return p as { names?: { displayName?: string }[] };
    }
  }
  return null;
}

async function createContact(token: string, r: RigaContatto): Promise<void> {
  const body = {
    names: [{ givenName: contactName(r) }],
    organizations: [{ name: r.ragioneSociale || r.partnerNome }],
    phoneNumbers: r.telefono ? [{ value: r.telefono, type: "work" }] : [],
    emailAddresses: r.email ? [{ value: r.email, type: "work" }] : [],
    addresses: r.indirizzo ? [{ formattedValue: r.indirizzo, type: "work" }] : [],
    biographies: [{ value: "Deluxy Anagrafiche" + (r.categoria ? " · " + r.categoria : "") }],
  };
  const res = await fetch("https://people.googleapis.com/v1/people:createContact", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error?.message || "HTTP " + res.status);
  }
}

// Ripiego senza OAuth: file .vcf che la rubrica apre direttamente
function downloadVcf(r: RigaContatto) {
  const e = (s: string) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const l = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + e(contactName(r)), "ORG:" + e(r.ragioneSociale || r.partnerNome)];
  if (r.telefono) l.push("TEL;TYPE=WORK:" + e(r.telefono));
  if (r.email) l.push("EMAIL;TYPE=WORK:" + e(r.email));
  if (r.indirizzo) l.push("ADR;TYPE=WORK:;;" + e(r.indirizzo) + ";;;;");
  l.push("END:VCARD");
  const blob = new Blob([l.join("\r\n")], { type: "text/vcard;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (r.nome || r.partnerNome || "contatto").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() + ".vcf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

type Esito = { fase: "lavoro" | "presente" | "aggiunto" | "errore"; testo: string };

export function TabellaContattiGoogle({ contatti }: { contatti: RigaContatto[] }) {
  const [esiti, setEsiti] = useState<Record<string, Esito>>({});
  const set = (id: string, e: Esito) => setEsiti((s) => ({ ...s, [id]: e }));

  // Verifica presenza per numero e, se assente, crea il contatto Google
  async function salva(r: RigaContatto) {
    set(r.id, { fase: "lavoro", testo: "Verifico…" });
    try {
      const token = await getToken();
      if (r.telefono) {
        const esistente = await findByPhone(token, r.telefono);
        if (esistente) {
          const nome = esistente.names?.[0]?.displayName;
          set(r.id, { fase: "presente", testo: "Già in rubrica" + (nome ? `: ${nome}` : "") });
          return;
        }
      }
      await createContact(token, r);
      set(r.id, { fase: "aggiunto", testo: "Aggiunto ✓" });
    } catch (e) {
      set(r.id, { fase: "errore", testo: e instanceof Error ? e.message : "Errore" });
    }
  }

  return (
    <>
      <p className="testo-guida" style={{ marginBottom: 12 }}>
        «Salva in Google» verifica il numero nella rubrica dell&apos;account con cui acconsenti nel browser
        (primo click: consenso Google) e crea il contatto solo se manca, come{" "}
        <code>[STATO] NOME</code> (con provincia per affiliati e reseller). In mancanza di OAuth, «.vcf» scarica il file.
      </p>
      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Ruolo</th>
              <th>Telefono</th>
              <th>Email</th>
              <th>Anagrafica</th>
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
                    {c.hubspotId ? (
                      <a href={linkContattoHubspot(c.hubspotId)} target="_blank" rel="noreferrer" title="Apri in HubSpot">
                        <div className="cella-nome">{c.nome ?? "—"} ↗</div>
                      </a>
                    ) : (
                      <div className="cella-nome">{c.nome ?? "—"}</div>
                    )}
                  </td>
                  <td className="cella-muta">{c.ruolo ?? "—"}</td>
                  <td className="cella-muta">{c.telefono ?? "—"}</td>
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
