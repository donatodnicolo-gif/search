"use client";

import { useActionState } from "react";
import { salvaImpostazioni } from "@/app/actions";

// La pagina è divisa in blocchi con una frase di spiegazione ciascuno, e ogni
// campo dice cosa succede davvero se lo si cambia. Chi entra qui muove soldi
// veri: le etichette da sole ("soglia", "tetto", "colpi al minuto") sono chiare
// a chi ha scritto il codice, non a chi deve decidere.

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
      <form action={azione}>
        <section className="gruppo-modulo">
          <h2 className="gruppo-titolo">Quando non basta una persona sola</h2>
          <p className="gruppo-sommario">
            Ogni richiesta di pagamento va approvata da una persona. Sopra certe cifre, o quando qualcosa non torna, ne
            servono due — e chi ha creato la richiesta non può essere una delle due.
          </p>
          <div className="modulo">
            <div className="campo-modulo">
              <label htmlFor="i-soglia">Da questa cifra in su servono due firme (€)</label>
              <input id="i-soglia" name="sogliaDoppiaFirma" defaultValue={valori.sogliaDoppiaFirma} inputMode="decimal" />
              <p className="aiuto-campo">
                Sotto, approva una persona e la richiesta è pronta. Sopra, resta in attesa finché non firma anche una
                seconda persona diversa.
              </p>
            </div>
            <div className="campo-modulo">
              <label htmlFor="i-tetto">Oltre questa cifra non approva nessuno (€)</label>
              <input id="i-tetto" name="tettoAssoluto" defaultValue={valori.tettoAssoluto} inputMode="decimal" />
              <p className="aiuto-campo">
                È il freno d&apos;emergenza: una richiesta più alta si ferma qui e va gestita fuori dall&apos;app. Non
                esiste un modo per forzarla, nemmeno da amministratore.
              </p>
            </div>
            <div className="campo-modulo">
              <label htmlFor="i-rischio">Quanto dev&apos;essere sospetta una richiesta perché servano due firme (0-100)</label>
              <input id="i-rischio" name="sogliaRischioDoppiaFirma" defaultValue={valori.sogliaRischioDoppiaFirma} inputMode="numeric" />
              <p className="aiuto-campo">
                L&apos;app dà un voto di sospetto a ogni richiesta: un beneficiario mai pagato prima, un IBAN diverso da
                quello che quel fornitore usava, la stessa cifra allo stesso fornitore due volte in un giorno, una
                causale generica. Da questo voto in su servono due firme anche se la cifra è piccola. Numero più basso =
                app più diffidente.
              </p>
            </div>
            <div className="campo-modulo">
              <label htmlFor="i-verificati">Fidarsi solo delle coordinate già controllate</label>
              <label className="riga-interruttore">
                <input
                  id="i-verificati"
                  type="checkbox"
                  name="soloBeneficiariVerificati"
                  defaultChecked={valori.soloBeneficiariVerificati}
                />
                sì, considera sospetto chi non è in rubrica come verificato
              </label>
              <p className="aiuto-campo">
                Non blocca niente da solo: alza il voto di sospetto, e quindi fa scattare più spesso la seconda firma.
              </p>
            </div>
          </div>
        </section>

        <section className="gruppo-modulo">
          <h2 className="gruppo-titolo">Chi può far uscire il denaro davvero</h2>
          <p className="gruppo-sommario">
            Approvare non è pagare. L&apos;approvazione dice «questa spesa è giusta»; il pagamento è un secondo gesto, e
            lo può fare una persona sola in tutta l&apos;azienda: il pagatore.
          </p>
          <div className="modulo">
            <div className="campo-modulo largo">
              <label htmlFor="i-pagatore">Il pagatore — l&apos;unica persona che può far uscire denaro</label>
              <input id="i-pagatore" name="pagatoreEmail" defaultValue={valori.pagatoreEmail} spellCheck={false} />
              <p className="aiuto-campo">
                Scrivi l&apos;email di un operatore attivo: se quell&apos;email non è di nessuno, il salvataggio si
                rifiuta invece di lasciarti con un pagatore che non esiste. A quell&apos;indirizzo arriva un codice
                usa-e-getta, che la persona digita insieme al suo PIN. Nemmeno un amministratore può pagare al posto suo:
                può preparare la distinta, non farla uscire. Cambiare questo campo sposta il potere di pagare, e resta
                scritto nel registro.
              </p>
            </div>
            <div className="campo-modulo">
              <label htmlFor="i-min-codice">Per quanti minuti vale il codice ricevuto per email</label>
              <input id="i-min-codice" name="minutiCodicePagamento" defaultValue={valori.minutiCodicePagamento} inputMode="numeric" />
              <p className="aiuto-campo">
                Passati questi minuti il codice è carta straccia e se ne chiede un altro. Serve a rendere inutile un
                codice rimasto in una casella di posta aperta.
              </p>
            </div>
            <div className="campo-modulo">
              <label htmlFor="i-min-sblocco">Per quanti minuti resta aperta la porta dopo lo sblocco</label>
              <input id="i-min-sblocco" name="minutiSbloccoPagamento" defaultValue={valori.minutiSbloccoPagamento} inputMode="numeric" />
              <p className="aiuto-campo">
                Digitati codice e PIN, il pagatore ha questo tempo per scaricare il file o far partire i bonifici. Poi la
                porta si richiude da sola e il giro ricomincia dal codice.
              </p>
            </div>
          </div>
        </section>

        <section className="gruppo-modulo">
          <h2 className="gruppo-titolo">I tuoi dati, come li legge la banca</h2>
          <p className="gruppo-sommario">
            Sono il conto <strong>da cui</strong> esce il denaro, e finiscono dentro il file che si consegna alla banca.
            Finché ragione sociale e IBAN sono vuoti, <strong>nessuna distinta si genera</strong>.
          </p>
          <div className="modulo">
            <div className="campo-modulo largo">
              <label htmlFor="i-ord-nome">Ragione sociale che la banca vede come mittente</label>
              <input id="i-ord-nome" name="ordinanteNome" defaultValue={valori.ordinanteNome} />
            </div>
            <div className="campo-modulo">
              <label htmlFor="i-ord-iban">IBAN da cui parte il denaro</label>
              <input id="i-ord-iban" name="ordinanteIban" defaultValue={valori.ordinanteIban} spellCheck={false} />
              <p className="aiuto-campo">Controllato al salvataggio: un IBAN scritto male non entra.</p>
            </div>
            <div className="campo-modulo">
              <label htmlFor="i-ord-bic">BIC, solo se la banca lo chiede</label>
              <input id="i-ord-bic" name="ordinanteBic" defaultValue={valori.ordinanteBic} spellCheck={false} />
              <p className="aiuto-campo">Per i conti italiani di norma non serve: se non sai cosa metterci, lascialo vuoto.</p>
            </div>
          </div>
        </section>

        <section className="gruppo-modulo">
          <h2 className="gruppo-titolo">Pagare direttamente dal conto</h2>
          <p className="gruppo-sommario">
            Le strade per far uscire il denaro sono due, e non ce n&apos;è una terza: il <strong>file da caricare in
            banca</strong>, oppure i <strong>bonifici veri</strong> che partono da qui. Questo interruttore apre la
            seconda.
          </p>
          <div className="modulo">
            <div className="campo-modulo largo">
              <label htmlFor="i-qonto">Far partire i bonifici da questa app</label>
              <label className="riga-interruttore">
                <input
                  id="i-qonto"
                  type="checkbox"
                  name="qontoEsecuzioneAttiva"
                  defaultChecked={valori.qontoEsecuzioneAttiva}
                  disabled={!valori.qontoCollegato}
                />
                {valori.qontoCollegato
                  ? "sì, invece di scaricare il file e caricarlo a mano nel sito della banca"
                  : "la banca non è ancora collegata (le chiavi si incollano qui sotto): l'interruttore resta spento"}
              </label>
              <p className="aiuto-campo">
                Anche acceso, non cambia chi decide: servono sempre il codice e il PIN del pagatore. In più il bonifico
                parte solo verso chi è stato reso <strong>fidato</strong> dentro l&apos;app della banca — un gesto che si
                fa lì, non qui — e solo se la banca conferma che il nome corrisponde all&apos;IBAN. Nasce spento apposta:
                accenderlo è una decisione, e resta scritta nel registro.
              </p>
            </div>
          </div>
        </section>

        <section className="gruppo-modulo">
          <h2 className="gruppo-titolo">I due bottoni «Vai a pagare»</h2>
          <p className="gruppo-sommario">
            Servono a chi carica il file a mano: scarichi la distinta e con un clic sei già nella pagina giusta del sito
            della banca, invece di cercarla ogni volta.
          </p>
          <div className="modulo">
            <div className="campo-modulo largo">
              <label htmlFor="i-url-banca">Indirizzo del sito della banca</label>
              <input
                id="i-url-banca"
                name="urlPortaleBanca"
                defaultValue={valori.urlPortaleBanca}
                spellCheck={false}
                placeholder="https://app.qonto.com"
              />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="i-url-sepa">Indirizzo della pagina dove si carica il file</label>
              <input
                id="i-url-sepa"
                name="urlCaricamentoSepa"
                defaultValue={valori.urlCaricamentoSepa}
                spellCheck={false}
                placeholder="incolla qui l'indirizzo esatto (es. …/transfers/bulk)"
              />
              <p className="aiuto-campo">
                Questo cambia da banca a banca: entra nel sito della tua, arriva alla pagina dove si carica il file e
                copia l&apos;indirizzo dalla barra del browser. Si accettano solo indirizzi che cominciano con http o
                https.
              </p>
            </div>
          </div>
        </section>

        <section className="gruppo-modulo">
          <h2 className="gruppo-titolo">Regole per le altre app, non per le persone</h2>
          <p className="gruppo-sommario">
            Valgono solo per i programmi che chiedono pagamenti da soli — Finance, Customer Service, Acquisti. Se non sai
            cosa sono, lasciale come stanno: sono già prudenti.
          </p>
          <div className="modulo">
            <div className="campo-modulo">
              <label htmlFor="i-colpi">Quante richieste al minuto può mandare un&apos;app</label>
              <input id="i-colpi" name="colpiAlMinuto" defaultValue={valori.colpiAlMinuto} inputMode="numeric" />
              <p className="aiuto-campo">
                Oltre questo numero l&apos;app che chiede viene respinta per un minuto. È la diga contro il programma
                impazzito che chiede mille pagamenti di fila.
              </p>
            </div>
            <div className="campo-modulo">
              <label htmlFor="i-minuti">Di quanto può sbagliare l&apos;orologio dell&apos;app che chiede (minuti)</label>
              <input id="i-minuti" name="minutiFirma" defaultValue={valori.minutiFirma} inputMode="numeric" />
              <p className="aiuto-campo">
                Ogni richiesta arriva firmata con l&apos;ora in cui è partita. Se l&apos;orologio dell&apos;altra app va
                avanti o indietro più di così, la richiesta è rifiutata: è ciò che impedisce di rigiocare domani una
                richiesta di oggi.
              </p>
            </div>
          </div>
        </section>

        <div className="azioni-modulo gruppo-modulo">
          <button className="btn" type="submit" disabled={inCorso}>
            {inCorso ? "Salvo…" : "Salva"}
          </button>
        </div>
      </form>
    </>
  );
}
