"use client";

import { useActionState } from "react";
import { salvaImpostazioni } from "@/app/actions";

type Valori = {
  sogliaDoppiaFirma: string;
  tettoAssoluto: string;
  sogliaRischioDoppiaFirma: string;
  colpiAlMinuto: string;
  minutiFirma: string;
  soloBeneficiariVerificati: boolean;
  ordinanteNome: string;
  ordinanteIban: string;
  ordinanteBic: string;
  pagatoreEmail: string;
  minutiCodicePagamento: string;
  minutiSbloccoPagamento: string;
  qontoEsecuzioneAttiva: boolean;
  qontoCollegato: boolean;
  urlPortaleBanca: string;
  urlCaricamentoSepa: string;
};

export function ModuloImpostazioni({ valori }: { valori: Valori }) {
  const [stato, azione, inCorso] = useActionState(salvaImpostazioni, {} as { errore?: string; ok?: string });

  return (
    <>
      {stato?.errore && <div className="avviso-errore">{stato.errore}</div>}
      {stato?.ok && <div className="avviso-ok">{stato.ok}</div>}
      <form action={azione} className="modulo">
        <div className="campo-modulo">
          <label htmlFor="i-soglia">Soglia della doppia firma (€)</label>
          <input id="i-soglia" name="sogliaDoppiaFirma" defaultValue={valori.sogliaDoppiaFirma} inputMode="decimal" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-tetto">Tetto assoluto (€)</label>
          <input id="i-tetto" name="tettoAssoluto" defaultValue={valori.tettoAssoluto} inputMode="decimal" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-rischio">Punteggio di rischio che impone la doppia firma (0-100)</label>
          <input id="i-rischio" name="sogliaRischioDoppiaFirma" defaultValue={valori.sogliaRischioDoppiaFirma} inputMode="numeric" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-colpi">Richieste API al minuto per chiave</label>
          <input id="i-colpi" name="colpiAlMinuto" defaultValue={valori.colpiAlMinuto} inputMode="numeric" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-minuti">Tolleranza dell&apos;orologio sulle firme API (minuti)</label>
          <input id="i-minuti" name="minutiFirma" defaultValue={valori.minutiFirma} inputMode="numeric" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-verificati">Solo beneficiari verificati</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, textTransform: "none", letterSpacing: 0 }}>
            <input
              id="i-verificati"
              type="checkbox"
              name="soloBeneficiariVerificati"
              defaultChecked={valori.soloBeneficiariVerificati}
            />
            alza il rischio se le coordinate non sono in rubrica come verificate
          </label>
        </div>

        <div className="campo-modulo largo">
          <label htmlFor="i-ord-nome">Ordinante — ragione sociale (per le distinte SEPA)</label>
          <input id="i-ord-nome" name="ordinanteNome" defaultValue={valori.ordinanteNome} />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-ord-iban">Ordinante — IBAN aziendale</label>
          <input id="i-ord-iban" name="ordinanteIban" defaultValue={valori.ordinanteIban} spellCheck={false} />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-ord-bic">Ordinante — BIC</label>
          <input id="i-ord-bic" name="ordinanteBic" defaultValue={valori.ordinanteBic} spellCheck={false} />
        </div>

        <div className="campo-modulo largo">
          <label htmlFor="i-pagatore">Pagatore — l&apos;unica persona che può far uscire denaro</label>
          <input id="i-pagatore" name="pagatoreEmail" defaultValue={valori.pagatoreEmail} spellCheck={false} />
          <p className="firma-nota">
            Deve essere l&apos;email di un operatore attivo. Riceve lì il codice di pagamento e lo usa insieme al PIN:
            cambiare questo campo sposta il potere di pagare a un&apos;altra persona, e resta scritto nel registro.
          </p>
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-min-codice">Validità del codice di pagamento (minuti)</label>
          <input id="i-min-codice" name="minutiCodicePagamento" defaultValue={valori.minutiCodicePagamento} inputMode="numeric" />
        </div>
        <div className="campo-modulo">
          <label htmlFor="i-min-sblocco">Finestra di sblocco dopo il codice (minuti)</label>
          <input id="i-min-sblocco" name="minutiSbloccoPagamento" defaultValue={valori.minutiSbloccoPagamento} inputMode="numeric" />
        </div>

        <div className="campo-modulo largo">
          <label htmlFor="i-qonto">Pagare dalla banca (Qonto)</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, textTransform: "none", letterSpacing: 0 }}>
            <input
              id="i-qonto"
              type="checkbox"
              name="qontoEsecuzioneAttiva"
              defaultChecked={valori.qontoEsecuzioneAttiva}
              disabled={!valori.qontoCollegato}
            />
            {valori.qontoCollegato
              ? "fai partire i bonifici veri dal conto, invece di generare solo il file SEPA"
              : "Qonto non è collegato (mancano QONTO_LOGIN / QONTO_SECRET_KEY): l'interruttore resta spento"}
          </label>
          <p className="firma-nota">
            Acceso, il pagatore può far uscire denaro dal conto con un clic — sempre dopo codice e PIN, sempre solo
            verso beneficiari resi <strong>fidati</strong> dentro Qonto, e solo se la banca conferma che il nome
            corrisponde all&apos;IBAN. Accendere e spegnere resta scritto nel registro.
          </p>
        </div>

        <div className="campo-modulo largo">
          <label htmlFor="i-url-banca">Link — portale della banca</label>
          <input
            id="i-url-banca"
            name="urlPortaleBanca"
            defaultValue={valori.urlPortaleBanca}
            spellCheck={false}
            placeholder="https://app.qonto.com"
          />
        </div>
        <div className="campo-modulo largo">
          <label htmlFor="i-url-sepa">Link — pagina dove si carica il file SEPA</label>
          <input
            id="i-url-sepa"
            name="urlCaricamentoSepa"
            defaultValue={valori.urlCaricamentoSepa}
            spellCheck={false}
            placeholder="incolla qui l'indirizzo esatto (es. …/transfers/bulk)"
          />
          <p className="firma-nota">
            Questi due indirizzi diventano i bottoni «Vai a pagare» nella pagina Banca e in fondo a ogni distinta:
            scarichi il file e con un clic sei nella pagina giusta della banca. Il secondo cambia da banca a banca, per
            questo si incolla a mano una volta sola.
          </p>
        </div>

        <div className="azioni-modulo campo-modulo largo">

          <button className="btn" type="submit" disabled={inCorso}>
            {inCorso ? "Salvo…" : "Salva"}
          </button>
        </div>
      </form>
    </>
  );
}
