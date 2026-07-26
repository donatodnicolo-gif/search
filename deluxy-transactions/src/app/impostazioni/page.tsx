import { redirect } from "next/navigation";
import { operatoreCorrente } from "@/lib/sessione";
import { leggiRegole } from "@/lib/impostazioni";
import { euroSemplice } from "@/lib/denaro";
import { cifraturaPronta } from "@/lib/crypto";
import { postaConfigurata } from "@/lib/mail";
import { qontoConfigurato, statoCollegamento } from "@/lib/qonto";
import { ModuloBanca } from "@/components/ModuloBanca";
import { ModuloImpostazioni } from "@/components/ModuloImpostazioni";

export const dynamic = "force-dynamic";

export default async function Impostazioni() {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");
  if (operatore.ruolo !== "admin") redirect("/");

  const r = await leggiRegole();

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Impostazioni</h1>
          <p className="page-sub">Le soglie che decidono quando serve una seconda firma, e i dati dell&apos;ordinante.</p>
        </div>
      </div>

      {!cifraturaPronta() && (
        <div className="avviso-errore">
          TRANSACTIONS_ENC_KEY non è configurata. Senza, l&apos;app non può leggere i segreti di firma delle app né i
          secondi fattori degli operatori.
        </div>
      )}

      {!postaConfigurata() && (
        <div className="avviso-errore">
          Posta non configurata (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM). Senza, il codice di
          pagamento non può essere spedito e <strong>nessun pagamento può uscire</strong>: è voluto, si fallisce chiusi.
        </div>
      )}

      <div className="scheda">
        <ModuloImpostazioni
          valori={{
            sogliaDoppiaFirma: euroSemplice(r.sogliaDoppiaFirma),
            tettoAssoluto: euroSemplice(r.tettoAssoluto),
            sogliaRischioDoppiaFirma: String(r.sogliaRischioDoppiaFirma),
            colpiAlMinuto: String(r.colpiAlMinuto),
            minutiFirma: String(r.minutiFirma),
            soloBeneficiariVerificati: r.soloBeneficiariVerificati,
            ordinanteNome: r.ordinanteNome,
            ordinanteIban: r.ordinanteIban,
            ordinanteBic: r.ordinanteBic,
            pagatoreEmail: r.pagatoreEmail,
            minutiCodicePagamento: String(r.minutiCodicePagamento),
            minutiSbloccoPagamento: String(r.minutiSbloccoPagamento),
            qontoEsecuzioneAttiva: r.qontoEsecuzioneAttiva,
            qontoCollegato: await qontoConfigurato(),
            urlPortaleBanca: r.urlPortaleBanca,
            urlCaricamentoSepa: r.urlCaricamentoSepa,
          }}
        />
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Collegamento alla banca</div>
        <ModuloBanca {...(await statoCollegamento())} />
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Cosa fa questa app e cosa non fa</div>
        <ul className="elenco-secco">
          <li>
            <span className="pallino" />
            Riceve le richieste di pagamento delle altre app Deluxy, firmate e tracciate.
          </li>
          <li>
            <span className="pallino" />
            Le fa autorizzare da persone, con secondo fattore e — sopra soglia — due firme distinte.
          </li>
          <li>
            <span className="pallino" />
            Produce la distinta SEPA da caricare in banca e ne conserva l&apos;impronta.
          </li>
          <li>
            <span className="pallino" />
            <strong>Non</strong> muove denaro e <strong>non</strong> contiene credenziali bancarie: l&apos;ultimo passo lo
            fa una persona nel portale della banca.
          </li>
        </ul>
      </div>
    </main>
  );
}
