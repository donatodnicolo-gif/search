// «configurato» / «mancante»: la pastiglia accanto a un campo segreto.
//
// Sta in un file suo perché la usano sia la pagina Impostazioni sia
// `CampoSegreto`: un segreto non si può rileggere, quindi questa pastiglia è
// l'unico modo di sapere se c'è.
export function BadgeConfigurato({ pieno }: { pieno: boolean }) {
  return pieno ? (
    <span className="badge verde">configurato</span>
  ) : (
    <span className="badge rosso">mancante</span>
  )
}
