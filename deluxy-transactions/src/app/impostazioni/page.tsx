import { redirect } from "next/navigation";
import { operatoreCorrente } from "@/lib/sessione";
import { leggiRegole } from "@/lib/impostazioni";
import { euroSemplice } from "@/lib/denaro";
import { cifraturaPronta } from "@/lib/crypto";
import { destinatarioAmmesso, statoPosta } from "@/lib/mail";
import { qontoConfigurato, statoCollegamento } from "@/lib/qonto";
import { prisma } from "@/lib/db";
import { ModuloBanca } from "@/components/ModuloBanca";
import { ModuloImpostazioni } from "@/components/ModuloImpostazioni";
import { ModuloPosta } from "@/components/ModuloPosta";

export const dynamic = "force-dynamic";

export default async function Impostazioni() {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");
  if (operatore.ruolo !== "admin") redirect("/");

  const r = await leggiRegole();
  const posta = await statoPosta();

  // Gli avvisi in cima dicono, in ordine, cosa manca perché un pagamento possa
  // arrivare in fondo. Meglio scoprirlo qui che davanti a una distinta che non
  // si genera e non spiega perché.
  const ordinanteIncompleto = !r.ordinanteNome.trim() || !r.ordinanteIban.trim();
  const pagatore = r.pagatoreEmail
    ? await prisma.operatore.findUnique({ where: { email: r.pagatoreEmail } }).catch(() => null)
    : null;
  const pagatoreMancante = !pagatore || !pagatore.attivo;
  const pagatoreSenzaPin = Boolean(pagatore?.attivo) && !pagatore?.pinHash;
  // Le due serrature devono guardare la stessa porta: se il pagatore non è fra
  // le caselle a cui l'app può scrivere, il codice non gli arriverà mai.
  const pagatoreNonRaggiungibile =
    posta.configurata && Boolean(r.pagatoreEmail) && !destinatarioAmmesso(r.pagatoreEmail, posta.destinatari);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Impostazioni</h1>
          <p className="page-sub">
            Chi può approvare, chi può pagare e con quali limiti. Ogni modifica resta scritta nel registro, con il
            valore di prima e quello di dopo.
          </p>
        </div>
      </div>

      {!cifraturaPronta() && (
        <div className="avviso-errore">
          Manca <code className="inline">TRANSACTIONS_ENC_KEY</code>: senza, l&apos;app non riesce a leggere i segreti
          che tiene cifrati — i secondi fattori delle persone e le firme delle altre app. Qui non funziona quasi niente.
        </div>
      )}

      {!posta.configurata && (
        <div className="avviso-errore">
          <strong>La posta non è configurata, quindi non può uscire nessun pagamento.</strong> Il codice che serve al
          pagatore viaggia per email: finché manca, la distinta non si genera. È voluto — davanti a un dubbio questa app
          si chiude, non si apre. Si configura qui sotto, in «Server di posta».
        </div>
      )}

      {ordinanteIncompleto && (
        <div className="avviso-errore">
          <strong>Mancano ragione sociale e IBAN dell&apos;ordinante</strong>, cioè il conto da cui esce il denaro:
          senza, la distinta per la banca non si può nemmeno costruire. Si compilano qui sotto, in «I tuoi dati, come li
          legge la banca».
        </div>
      )}

      {pagatoreMancante && (
        <div className="avviso-errore">
          <strong>Nessuno può pagare.</strong> Il pagatore indicato ({r.pagatoreEmail || "nessuno"}) non è un operatore
          attivo di questa app: o lo si crea in Operatori, o qui sotto si indica l&apos;email di una persona che c&apos;è
          già.
        </div>
      )}

      {pagatoreNonRaggiungibile && (
        <div className="avviso-errore">
          <strong>Il codice non arriverebbe al pagatore.</strong> {r.pagatoreEmail} non è fra le caselle a cui questa
          app può scrivere ({posta.destinatari.join(", ")}): l&apos;invio verrebbe rifiutato e il pagamento resterebbe
          fermo. O si aggiunge quell&apos;indirizzo in «Server di posta», o si cambia il pagatore.
        </div>
      )}

      {pagatoreSenzaPin && (
        <div className="avviso-attenzione">
          Il pagatore non ha ancora impostato il PIN, e senza PIN il pagamento non si sblocca. Deve farlo da solo dalla
          pagina <strong>PIN</strong>, con la sua password e il suo secondo fattore: nessun altro può metterlo al posto
          suo, nemmeno un amministratore.
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
        <div className="scheda-titolo">Server di posta</div>
        <p className="gruppo-sommario">
          Da qui parte l&apos;unica email che conta: il codice usa-e-getta con cui il pagatore sblocca l&apos;uscita del
          denaro. Password e indirizzi si salvano <strong>cifrati</strong>, con una chiave che vive sul server e non nel
          database: chi entrasse nel database può romperli — e allora non esce niente — ma non può dirottarli su una
          casella sua.
        </p>
        <ModuloPosta
          {...posta}
          // Non ancora configurata: si propone il pagatore, che è l'unica
          // casella che deve davvero ricevere qualcosa da qui.
          destinatari={posta.destinatari.length ? posta.destinatari : [r.pagatoreEmail].filter(Boolean)}
          chiedeCodice={operatore.totpAttivo}
        />
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Collegamento alla banca</div>
        <ModuloBanca {...(await statoCollegamento())} />
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Come funziona, in quattro righe</div>
        <ul className="elenco-secco">
          <li>
            <span className="pallino" />
            Le altre app Deluxy non pagano nessuno: mandano <strong>qui</strong> la richiesta, firmata e tracciata.
          </li>
          <li>
            <span className="pallino" />
            Le richieste le approvano <strong>persone</strong>, con il secondo fattore, e sopra le soglie qui sopra ne
            servono due diverse.
          </li>
          <li>
            <span className="pallino" />
            Approvata non vuol dire pagata: il denaro esce solo quando il <strong>pagatore</strong> digita il codice
            ricevuto per email e il suo PIN.
          </li>
          <li>
            <span className="pallino" />
            Da lì le strade sono due, mai una terza: il <strong>file da caricare in banca</strong>, oppure i{" "}
            <strong>bonifici veri</strong> dal conto, se l&apos;interruttore è acceso e la banca è collegata.
          </li>
        </ul>
      </div>
    </main>
  );
}
