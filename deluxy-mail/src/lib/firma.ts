// Costruisce la firma HTML di Deluxy dai dati di base. I dati si conservano
// (Utente.firmaDati, JSON) per poter riaprire il form; la firma generata sta in
// Utente.firma ed è quella che finisce nelle mail.

export type FirmaDati = {
  nome: string
  ruolo: string
  reparto: string
  email: string
  telefono: string
  sito: string
}

export const FIRMA_VUOTA: FirmaDati = {
  nome: '',
  ruolo: '',
  reparto: 'Deluxy White Gloves',
  email: '',
  telefono: '',
  sito: 'www.deluxy.it',
}

export function leggiFirmaDati(json: string | null | undefined): FirmaDati {
  if (!json) return { ...FIRMA_VUOTA }
  try {
    const d = JSON.parse(json) as Partial<FirmaDati>
    return {
      nome: d.nome ?? '',
      ruolo: d.ruolo ?? '',
      reparto: d.reparto ?? FIRMA_VUOTA.reparto,
      email: d.email ?? '',
      telefono: d.telefono ?? '',
      sito: d.sito ?? FIRMA_VUOTA.sito,
    }
  } catch {
    return { ...FIRMA_VUOTA }
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Genera la firma HTML col template Deluxy. Vuota se non c'è almeno nome o email. */
export function costruisciFirma(d: FirmaDati): string {
  const nome = d.nome.trim()
  const email = d.email.trim()
  if (!nome && !email) return ''

  const ruolo = d.ruolo.trim()
  const reparto = d.reparto.trim()
  const telefono = d.telefono.trim()
  const sitoRaw = d.sito.trim()
  const sitoTesto = sitoRaw.replace(/^https?:\/\//i, '')
  const sitoHref = /^https?:\/\//i.test(sitoRaw) ? sitoRaw : `https://${sitoTesto}`
  const telHref = telefono.replace(/[^\d+]/g, '')

  const contatti = [
    email && `<a style="color: #000; text-decoration: none;" href="mailto:${esc(email)}">${esc(email)}</a>`,
    telefono && `<a style="color: #000; text-decoration: none;" href="tel:${esc(telHref)}">${esc(telefono)}</a>`,
    sitoTesto && `<a style="color: #000; text-decoration: none;" href="${esc(sitoHref)}">${esc(sitoTesto)}</a>`,
  ]
    .filter(Boolean)
    .join('<br>')

  const identita = [
    nome && `<strong style="font-size: 16px;">${esc(nome)}</strong>`,
    ruolo && `<em>${esc(ruolo)} </em>`,
    reparto && `<span style="font-weight: bold;">${esc(reparto)}</span>`,
  ]
    .filter(Boolean)
    .join('<br>')

  return `<table style="width: 600px; max-width: 100%; font-family: 'Bodoni', serif; color: #000; font-size: 14px; line-height: 1.6;" role="presentation" border="0" width="600" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="padding: 10px 20px 10px 10px; border-right: 1px solid #ddd;" align="center" valign="middle" width="220"><img style="display: block; margin: auto;" src="https://deluxy.it/cdn/shop/files/LOGO_DELUXY_white_gloves.svg?crop=center&amp;height=101&amp;v=1760024022&amp;width=500" alt="Deluxy white gloves" width="160"></td>
<td style="padding: 10px 0 10px 20px;" valign="top">
<p style="margin: 0; font-family: 'Bodoni', serif;">${identita}</p>
<p style="margin: 10px 0; font-family: 'Bodoni', serif;">${contatti}</p>
<div style="border-top: 1px solid #ccc; width: 200px; margin: 14px 0;"> </div>
<p style="margin-top: 8px; font-size: 11px; color: #777; font-family: 'Bodoni', serif;">Questo messaggio è destinato esclusivamente al destinatario indicato e può contenere informazioni riservate.</p>
</td>
</tr>
</tbody>
</table>`
}
