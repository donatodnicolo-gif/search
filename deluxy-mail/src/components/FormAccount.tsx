'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { creaAccount } from '@/lib/actions'

// Preset dei provider più comuni: evitano di dover cercare host e porte.
const PRESET: Record<string, { imapHost: string; smtpHost: string; nota?: string }> = {
  'SecureMail (deluxy.it)': {
    imapHost: 'pop.securemail.pro',
    smtpHost: 'authsmtp.securemail.pro',
    nota: 'Le caselle @deluxy.it. La password è quella scelta nell’Area Clienti per l’attivazione della casella.',
  },
  Gmail: {
    imapHost: 'imap.gmail.com',
    smtpHost: 'smtp.gmail.com',
    nota: 'Con Gmail serve una “password per le app” (account Google → Sicurezza), non la password normale.',
  },
  'Aruba': { imapHost: 'imaps.aruba.it', smtpHost: 'smtps.aruba.it' },
  'Outlook / Microsoft 365': {
    imapHost: 'outlook.office365.com',
    smtpHost: 'smtp.office365.com',
    nota: 'Su Microsoft 365 l’accesso IMAP con password va abilitato dall’amministratore.',
  },
  Register: {
    imapHost: 'imap.register.it',
    smtpHost: 'smtp.register.it',
    nota: 'register.it usa un certificato per *.securemail.pro: la spunta “Ignora verifica certificato” qui sotto è già attiva (connessione comunque cifrata).',
  },
  Altro: { imapHost: '', smtpHost: '' },
}

// I provider il cui certificato è intestato a un dominio diverso dall'host:
// per questi la verifica del NOME sul certificato va saltata di default.
const CERT_DA_IGNORARE = new Set(['Register'])

const PRESET_INIZIALE = 'SecureMail (deluxy.it)'

export function FormAccount() {
  const [provider, setProvider] = useState(PRESET_INIZIALE)
  const [imapHost, setImapHost] = useState(PRESET[PRESET_INIZIALE].imapHost)
  const [smtpHost, setSmtpHost] = useState(PRESET[PRESET_INIZIALE].smtpHost)
  const [ignoraCert, setIgnoraCert] = useState(CERT_DA_IGNORARE.has(PRESET_INIZIALE))
  const [stato, setStato] = useState<{ ok: boolean; messaggio: string } | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function cambiaProvider(nome: string) {
    setProvider(nome)
    setImapHost(PRESET[nome].imapHost)
    setSmtpHost(PRESET[nome].smtpHost)
    setIgnoraCert(CERT_DA_IGNORARE.has(nome))
  }

  function invia(form: FormData) {
    setStato(null)
    startTransition(async () => {
      const esito = await creaAccount(form)
      setStato(esito)
      if (esito.ok) router.refresh()
    })
  }

  return (
    <form action={invia}>
      <div className="form-grid">
        <div>
          <label className="field-label">Provider</label>
          <select value={provider} onChange={(e) => cambiaProvider(e.target.value)}>
            {Object.keys(PRESET).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">
            Nome della casella <span className="req">*</span>
          </label>
          <input type="text" name="nome" required placeholder="Deluxy Delivery" />
        </div>

        <div>
          <label className="field-label">
            Indirizzo email <span className="req">*</span>
          </label>
          <input type="email" name="email" required placeholder="posta@deluxy.it" />
        </div>
        <div>
          <label className="field-label">
            Password <span className="req">*</span>
          </label>
          <input type="password" name="imapPassword" required />
        </div>

        <div>
          <label className="field-label">
            Server IMAP <span className="req">*</span>
          </label>
          <input
            type="text"
            name="imapHost"
            required
            value={imapHost}
            onChange={(e) => setImapHost(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Porta IMAP</label>
          <input type="number" name="imapPort" defaultValue={993} />
        </div>

        <div>
          <label className="field-label">
            Server SMTP <span className="req">*</span>
          </label>
          <input
            type="text"
            name="smtpHost"
            required
            value={smtpHost}
            onChange={(e) => setSmtpHost(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Porta SMTP</label>
          <input type="number" name="smtpPort" defaultValue={465} />
        </div>

        <div className="full">
          <label className="field-label">Cartella da leggere</label>
          <input type="text" name="cartella" defaultValue="INBOX" />
        </div>

        <div className="full">
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="ignoraCertTls"
              checked={ignoraCert}
              onChange={(e) => setIgnoraCert(e.target.checked)}
            />
            Ignora la verifica del certificato TLS
          </label>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Attivala se il collegamento fallisce con “Hostname/IP does not match certificate”
            (il provider ha un certificato per un altro dominio, es. register.it → securemail.pro).
            La connessione resta cifrata.
          </div>
        </div>
      </div>

      {PRESET[provider].nota && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 14 }}>
          {PRESET[provider].nota}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>
        La password viene cifrata prima di essere salvata e non lascia mai il tuo server.
      </div>

      {stato && (
        <div
          style={{
            fontSize: 13,
            marginTop: 14,
            color: stato.ok ? 'var(--green)' : 'var(--red)',
          }}
        >
          {stato.messaggio}
        </div>
      )}

      <div className="form-footer">
        <button className="btn primary" type="submit" disabled={inCorso}>
          {inCorso ? 'Verifico il collegamento…' : 'Collega casella'}
        </button>
      </div>
    </form>
  )
}
