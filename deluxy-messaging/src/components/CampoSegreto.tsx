import { BadgeConfigurato } from './BadgeConfigurato'

// Un campo per un segreto (token, chiave, App Secret) nelle Impostazioni.
//
// ⚠️ NASCE DA UN BUCO REALE: i segreti si salvavano solo se il campo arrivava
// pieno — comodo, perché non bisogna reincollare tutto a ogni modifica, ma
// significava che **un token sbagliato non si poteva più togliere**. Si potevo
// solo sovrascrivere con un altro, e per un token revocato o incollato per
// errore non c'era nessuna strada: restava lì a far fallire le chiamate.
//
// Da qui la casella «cancella»: spuntata, il valore viene svuotato al salvataggio
// (la gestisce `salvaImpostazioni` leggendo `svuota_<chiave>`). Si vede solo se
// c'è qualcosa da cancellare, per non offrire un gesto che non fa niente.
export function CampoSegreto({
  nome,
  etichetta,
  valore,
  aiuto,
  segnaposto,
}: {
  /** Il nome del campo, uguale alla chiave in Impostazione. */
  nome: string
  etichetta: string
  /** Il valore salvato: serve solo a sapere SE c'è, non si stampa mai. */
  valore?: string
  aiuto?: string
  segnaposto?: string
}) {
  const cePiu = Boolean(valore)
  return (
    <div className="campo campo-segreto">
      <label>
        <span>
          {etichetta} <BadgeConfigurato pieno={cePiu} />
        </span>
        <input
          name={nome}
          type="password"
          placeholder={cePiu ? 'salvato — incolla per sostituire' : (segnaposto ?? '')}
          autoComplete="off"
        />
      </label>
      {aiuto ? <span className="aiuto-campo">{aiuto}</span> : null}
      {cePiu ? (
        <label className="svuota">
          <input type="checkbox" name={`svuota_${nome}`} value="1" />
          <span>Cancella il valore salvato</span>
        </label>
      ) : null}
    </div>
  )
}
