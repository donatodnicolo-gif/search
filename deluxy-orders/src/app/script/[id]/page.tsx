import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CANALI } from "@/lib/segmenti";
import {
  VARIABILI_AUTOMATICHE,
  variabiliCitate,
  variabiliScript,
  variabiliSconosciute,
} from "@/lib/automazioni";
import { aggiornaScript, eliminaScript } from "@/app/actions";

export const dynamic = "force-dynamic";

// La scheda di uno script: il testo, le variabili che dichiara e — soprattutto
// — quelle che ha usato nel testo senza dichiararle. Quelle sono l'errore che
// costa: restano scritte nel messaggio e partono così come sono.
export default async function SchedaScript({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await prisma.script.findUnique({
    where: { id },
    include: { automazioni: { select: { id: true, nome: true } } },
  });
  if (!s) notFound();

  const dichiarate = variabiliScript(s.variabili);
  const citate = variabiliCitate(s.testo);
  const sconosciute = variabiliSconosciute(s.testo, dichiarate);
  const automatiche = VARIABILI_AUTOMATICHE.filter((v) => citate.includes(v.chiave));
  // Dichiarate ma mai usate: non è un errore, è uno spreco — e di solito un refuso.
  const inutilizzate = dichiarate.filter((d) => !citate.includes(d.chiave));

  return (
    <main className="main">
      <Link href="/script" className="ritorno">← Tutti gli script</Link>

      <div className="page-head">
        <div>
          <h1 className="page-title">{s.nome}</h1>
          <p className="page-sub">{s.descrizione || "Testo da mandare ai clienti."}</p>
        </div>
      </div>

      {sp.esito && <div className="avviso-ok">{sp.esito}</div>}

      {sconosciute.length > 0 && (
        <div className="avviso-errore">
          Nel testo ci sono variabili che nessuno riempirà:{" "}
          <strong>{sconosciute.map((v) => `{{${v}}}`).join(", ")}</strong>. Verranno mandate così
          come sono. Dichiarale qui sotto, oppure correggile nel testo.
        </div>
      )}

      <div className="scheda">
        <div className="scheda-titolo">Il testo</div>
        <form action={aggiornaScript} className="modulo">
          <input type="hidden" name="id" value={s.id} />
          <div className="campo-modulo">
            <label htmlFor="nome">Nome</label>
            <input id="nome" name="nome" defaultValue={s.nome} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="canale">Canale</label>
            <select id="canale" name="canale" defaultValue={s.canale}>
              {CANALI.map((c) => (
                <option key={c.chiave} value={c.chiave}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo largo">
            <label htmlFor="descrizione">A cosa serve</label>
            <input id="descrizione" name="descrizione" defaultValue={s.descrizione} />
          </div>
          {s.canale === "email" && (
            <div className="campo-modulo largo">
              <label htmlFor="oggetto">Oggetto dell&apos;email</label>
              <input id="oggetto" name="oggetto" defaultValue={s.oggetto} />
            </div>
          )}
          <div className="campo-modulo largo">
            <label htmlFor="testo">Testo</label>
            <textarea id="testo" name="testo" rows={7} defaultValue={s.testo} />
          </div>

          {/* --- Variabili dichiarate: si aggiungono una alla volta --- */}
          <div className="campo-modulo largo">
            <label>Variabili dello script</label>
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome nel testo</th>
                    <th>Come si chiama</th>
                    <th>Valore predefinito</th>
                    <th>Obbligatoria</th>
                    <th>Usata</th>
                  </tr>
                </thead>
                <tbody>
                  {[...dichiarate, { chiave: "", etichetta: "", valore: "", obbligatoria: false }].map((v, i) => (
                    <tr key={`${v.chiave}-${i}`}>
                      <td>
                        <input
                          name={`var_chiave_${i}`}
                          defaultValue={v.chiave}
                          placeholder="sconto"
                          style={{ width: "100%" }}
                        />
                      </td>
                      <td>
                        <input
                          name={`var_etichetta_${i}`}
                          defaultValue={v.etichetta}
                          placeholder="Sconto riservato"
                          style={{ width: "100%" }}
                        />
                      </td>
                      <td>
                        <input
                          name={`var_valore_${i}`}
                          defaultValue={v.valore}
                          placeholder="10%"
                          style={{ width: "100%" }}
                        />
                      </td>
                      <td>
                        <input type="checkbox" name={`var_obbligatoria_${i}`} defaultChecked={v.obbligatoria} />
                      </td>
                      <td className="cella-muta">
                        {v.chiave ? (citate.includes(v.chiave) ? "sì" : "mai usata") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="testo-guida" style={{ marginTop: 6 }}>
              Una riga vuota in fondo serve ad aggiungerne una nuova. Svuotare il nome cancella la
              variabile. <strong>Obbligatoria</strong> significa che senza valore le automazioni che
              usano questo script si fermano invece di mandare il messaggio a metà.
            </p>
          </div>

          <div className="campo-modulo largo">
            <label style={{ textTransform: "none", letterSpacing: 0, fontSize: 13.5, fontWeight: 400, color: "var(--text)" }}>
              <input type="checkbox" name="attivo" defaultChecked={s.attivo} style={{ marginRight: 8 }} />
              Script <strong>attivo</strong> (uno script sospeso resta scritto ma non si propone
              più quando si crea un&apos;automazione)
            </label>
          </div>
          <div className="azioni-modulo campo-modulo largo">
            <button className="btn" type="submit">Salva script</button>
          </div>
        </form>
      </div>

      {/* --- Cosa può scrivere chi compone il testo --- */}
      <div className="scheda">
        <div className="scheda-titolo">Variabili che puoi usare</div>
        <p className="testo-guida">
          <strong>Del cliente</strong> — le riempie l&apos;app, ci sono sempre:
        </p>
        <ul className="motivi-rischio">
          {VARIABILI_AUTOMATICHE.map((v) => (
            <li key={v.chiave}>
              <code className="inline">{`{{${v.chiave}}}`}</code> — {v.spiega}
              {citate.includes(v.chiave) ? " · usata qui" : ""}
            </li>
          ))}
        </ul>
        {dichiarate.length > 0 && (
          <>
            <p className="testo-guida" style={{ marginTop: 10 }}>
              <strong>Tue</strong> — le sceglie ogni automazione che usa questo script:
            </p>
            <ul className="motivi-rischio">
              {dichiarate.map((v) => (
                <li key={v.chiave}>
                  <code className="inline">{`{{${v.chiave}}}`}</code>
                  {v.etichetta ? ` — ${v.etichetta}` : ""}
                  {v.valore ? ` · predefinito: «${v.valore}»` : " · nessun valore predefinito"}
                  {v.obbligatoria ? " · obbligatoria" : ""}
                </li>
              ))}
            </ul>
          </>
        )}
        {inutilizzate.length > 0 && (
          <p className="testo-guida" style={{ marginTop: 10 }}>
            Dichiarate ma mai usate nel testo:{" "}
            <strong>{inutilizzate.map((v) => v.chiave).join(", ")}</strong>. Non fanno danno, ma di
            solito sono un refuso.
          </p>
        )}
        {automatiche.length === 0 && citate.length === 0 && (
          <p className="testo-guida" style={{ marginTop: 10 }}>
            Questo testo non usa nessuna variabile: arriverà identico a tutti.
          </p>
        )}
      </div>

      {/* --- Chi lo usa --- */}
      <div className="scheda">
        <div className="scheda-titolo">Automazioni che usano questo script</div>
        {s.automazioni.length === 0 ? (
          <p className="testo-guida">
            Nessuna, per ora. Si collega dalla scheda di un&apos;<Link href="/automazioni" className="ritorno">automazione</Link>.
          </p>
        ) : (
          <span className="etichette">
            {s.automazioni.map((a) => (
              <Link key={a.id} href={`/automazioni/${a.id}`} className="tag" style={{ color: "var(--blue)" }}>
                <span className="dot" />
                <span className="tag-label">{a.nome}</span>
              </Link>
            ))}
          </span>
        )}
      </div>

      <form action={eliminaScript}>
        <input type="hidden" name="id" value={s.id} />
        <button className="btn btn-secondario small" type="submit">Elimina script</button>
      </form>
    </main>
  );
}
