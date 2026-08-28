// Edge Function `richiesta-evasione` (Deno): manda alla PIATTAFORMA CONSEGNE la
// richiesta di evadere un ordine Scout già chiuso.
//
// Richiesta dell'utente (28/08/2026): «metti richiesta evasione di un ordine
// dopo la chiusura che manda all'app delivery le informazioni per
// l'inserimento» e poi, preciso: «la richiesta di evasione di un ordine dovrà
// pervenire a https://deluxy-delivery.vercel.app/richieste».
//
// ⭐ **DOVE ARRIVA.** `POST /app/richieste` della piattaforma: finisce nella
// sezione **Richieste**, dove admin, operation e Customer Service la leggono e
// decidono. È una DOMANDA, non una consegna — la consegna nasce solo quando
// qualcuno di là la accetta, ed è giusto così: il giro dei valet costa denaro
// vero e non deve partire da un testo che nessuno ha letto.
//
// ⭐ **IL RIFERIMENTO È `SCOUT00N`**, e la rotta di là è **idempotente** su
// quello: rimandare la stessa evasione non crea una seconda riga in lista, e
// due persone non lavorano la stessa cosa.
//
// ⚠️ **SE LA PIATTAFORMA NON SI RAGGIUNGE SI RIPIEGA SULLA MAIL**, e si dice
// perché. Serve una chiave app CON SCRITTURA: oggi in cassaforte c'è l'IBAN
// dell'azienda al posto della chiave, quindi il ripiego è la strada che si
// percorre davvero finché non la si sostituisce. Fallire e basta vorrebbe dire
// che la richiesta non parte — e chi l'ha scritta pensa di averla mandata.
//
// ⚠️ **SOLO DOPO LA CHIUSURA.** Prima l'ordine è una bozza e non ha nemmeno il
// numero: la richiesta arriverebbe senza il riferimento a cui legarla.
//
// ⚠️ **SICUREZZA.** Chiama solo un utente Scout loggato. Il destinatario della
// mail di ripiego NON arriva dal client ma dalle impostazioni, altrimenti
// questa funzione sarebbe un modo per spedire mail a chiunque con le caselle di
// Deluxy. La chiave della piattaforma resta sul server: nel bundle web sarebbe
// leggibile da chiunque apra gli strumenti di sviluppo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { credenzialiPerUtente, decifra, inviaMail, type Credenziali } from '../_shared/smtp.ts';
import { chiaveHub } from '../_shared/chiavi.ts';

/** Dove risponde il canale app-to-app della piattaforma. */
const BASE_DEFAULT = 'https://deluxy-delivery.vercel.app/api/v1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

async function impostazione(admin: any, chiave: string): Promise<string> {
  const { data } = await admin.from('impostazioni').select('valore').eq('chiave', chiave).maybeSingle();
  return String(data?.valore ?? '').trim();
}

/** La casella dell'azienda, come per gli annunci: è la voce di Deluxy, non di una persona. */
async function credenzialiAzienda(admin: any, ownerId: string | null): Promise<Credenziali | null> {
  const casella = await impostazione(admin, 'mail.casella_annunci');
  if (casella) {
    const { data } = await admin.from('smtp_account').select('*').eq('utente', casella).maybeSingle();
    if (data?.host && data?.utente && data?.password_cifrata) {
      const nome = String(data.mittente ?? '').trim();
      return {
        host: data.host,
        port: Number(data.porta ?? 465),
        user: data.utente,
        pass: await decifra(data.password_cifrata),
        from: `"${(nome && !nome.includes('@') ? nome : 'Deluxy Scout').replace(/"/g, '')}" <${data.utente}>`,
      };
    }
  }
  return await credenzialiPerUtente(admin, ownerId);
}

const testo = (v: unknown) => String(v ?? '').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const b = await req.json().catch(() => ({}));
    const ordineId = testo(b?.ordine_id);
    if (!ordineId) return json({ error: 'ordine_id mancante' }, 400);

    const { data: o } = await admin.from('ordini').select('*').eq('id', ordineId).single();
    if (!o) return json({ error: 'Ordine non trovato' }, 404);
    if (!o.chiuso_il) {
      return json({ error: "L'ordine non è ancora chiuso: l'evasione si chiede dopo la chiusura." }, 400);
    }
    if (!o.riferimento) {
      return json({ error: "L'ordine non ha un numero: senza, chi inserisce non sa a cosa legare la consegna." }, 400);
    }

    // ⚠️ I tre campi senza i quali una consegna non si inserisce: quando, a chi,
    // dove. Se mancano è meglio fermarsi qui che mandare una richiesta che
    // costringe chi la riceve a rincorrere chi l'ha scritta.
    const quando = testo(b?.data_servizio);
    const destinatario = testo(b?.destinatario);
    const indirizzo = testo(b?.indirizzo);
    const mancano = [
      !quando ? 'la data del servizio' : null,
      !destinatario ? 'il destinatario' : null,
      !indirizzo ? "l'indirizzo di consegna" : null,
    ].filter(Boolean);
    if (mancano.length) {
      return json({ error: `Manca ${mancano.join(', ')}: senza, la consegna non si può inserire.` }, 400);
    }

    const dati = {
      data_servizio: quando,
      ora_da: testo(b?.ora_da) || null,
      ora_a: testo(b?.ora_a) || null,
      destinatario,
      indirizzo,
      citofono: testo(b?.citofono) || null,
      telefono: testo(b?.telefono) || null,
      ritiro: testo(b?.ritiro) || null,
      cosa: testo(b?.cosa) || o.descrizione || null,
      note: testo(b?.note) || null,
    };

    const rif = o.riferimento as string;
    const fascia = dati.ora_da || dati.ora_a ? `${dati.ora_da ?? '—'} → ${dati.ora_a ?? '—'}` : 'non indicata';

    // ⭐ IL TESTO È UNO SOLO, e va sia alla piattaforma sia nella mail di
    // ripiego: due versioni diverse dello stesso ordine sono due versioni che
    // prima o poi divergono, e chi legge non sa quale vale.
    const corpo = [
      `Ordine Scout ${rif} — ${o.cliente}`,
      ``,
      `DA SCRIVERE NEL CAMPO DDT DELLA CONSEGNA: ${rif}`,
      ``,
      dati.cosa ? `Cosa: ${dati.cosa}` : null,
      o.linea ? `Linea: ${o.linea}` : null,
      ``,
      `Data: ${quando}`,
      `Fascia oraria: ${fascia}`,
      dati.ritiro ? `Ritiro presso: ${dati.ritiro}` : 'Ritiro: non indicato',
      `Destinatario: ${destinatario}`,
      `Indirizzo: ${indirizzo}`,
      dati.citofono ? `Citofono: ${dati.citofono}` : null,
      dati.telefono ? `Telefono: ${dati.telefono}` : null,
      dati.note ? `Note: ${dati.note}` : null,
      ``,
      // ⚠️ Si dice anche quello che NON c'è: chi inserisce deve sapere che il
      // tipo di servizio del catalogo e il partner li sceglie lui, invece di
      // cercarli in un testo che non li contiene.
      'Il tipo di servizio del catalogo e il partner li sceglie chi inserisce: da Scout non arrivano.',
    ]
      .filter((r) => r !== null)
      .join('\n');

    // A chi rispondere per un chiarimento: chi segue l'ordine.
    let contatto: string | null = null;
    if (o.owner) {
      const { data: prof } = await admin.from('profiles').select('email').eq('id', o.owner).maybeSingle();
      contatto = prof?.email ?? null;
    }

    // ── 1) La strada buona: la sezione Richieste della piattaforma ───────────
    let canale: 'piattaforma' | 'mail' = 'mail';
    let motivoRipiego: string | null = null;
    let giaEsistente = false;

    const key = await chiaveHub('PIATTAFORMA_API_KEY');
    if (!key) {
      motivoRipiego = 'la chiave della piattaforma non è configurata';
    } else {
      // L'indirizzo si può cambiare da Impostazioni senza rifare il deploy.
      let base = BASE_DEFAULT;
      try {
        const { data } = await admin.from('chiavi_app').select('url_base').eq('app', 'piattaforma').maybeSingle();
        const u = (data?.url_base ?? '').trim();
        if (u) base = u.replace(/\/$/, '');
      } catch {
        // riga assente o tabella irraggiungibile: vale il default
      }
      try {
        const res = await fetch(`${base}/app/richieste`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'X-App': 'deluxy-scout' },
          body: JSON.stringify({ testo: corpo, riferimento: rif, ...(contatto ? { contatto } : {}) }),
        });
        const txt = await res.text();
        if (res.ok) {
          canale = 'piattaforma';
          try {
            giaEsistente = !!JSON.parse(txt)?.giaEsistente;
          } catch {
            // la richiesta è passata lo stesso: il corpo della risposta è un di più
          }
        } else {
          // ⚠️ Il messaggio della piattaforma si riporta INTERO (troncato):
          // «chiave senza permesso di scrittura» dice cosa fare, «non riuscito»
          // manda a indovinare.
          motivoRipiego = `la piattaforma ha risposto ${res.status}: ${txt.slice(0, 200)}`;
        }
      } catch (e) {
        motivoRipiego = `la piattaforma non risponde (${String((e as any)?.message ?? e).slice(0, 160)})`;
      }
    }

    // ── 2) Il ripiego: la mail, che DICE perché è arrivata per mail ──────────
    const esiti: { to: string; ok: boolean; errore?: string }[] = [];
    let aChi: string[] = [];
    let ripiegoSuTuttaLaSquadra = false;

    if (canale === 'mail') {
      const cred = await credenzialiAzienda(admin, o.owner ?? null);
      if (!cred) {
        return json(
          { sent: false, error: `La piattaforma non l'ha presa (${motivoRipiego}) e lo SMTP non è configurato: la richiesta non è partita.` },
          502,
        );
      }
      const casellaConsegne = await impostazione(admin, 'mail.casella_consegne');
      if (casellaConsegne) {
        aChi = [casellaConsegne];
      } else {
        const { data: profili } = await admin.from('profiles').select('email');
        aChi = (profili ?? []).map((p: any) => p.email).filter((e: string) => !!e && e.includes('@'));
        ripiegoSuTuttaLaSquadra = true;
        if (!aChi.length) {
          return json({ sent: false, error: `La piattaforma non l'ha presa (${motivoRipiego}) e non c'è nessun destinatario mail.` }, 502);
        }
      }

      const testoMail = [
        `⚠️ Questa richiesta non è entrata nella sezione Richieste della piattaforma:`,
        `   ${motivoRipiego}.`,
        `   Va inserita a mano — e la strada automatica si riapre sistemando la chiave.`,
        ripiegoSuTuttaLaSquadra
          ? `⚠️ Ed è arrivata a tutta la squadra: non c'è un indirizzo delle consegne impostato («mail.casella_consegne»).`
          : null,
        ``,
        corpo,
        ``,
        `L'ordine: https://deluxy-scout.vercel.app/ordini`,
      ]
        .filter((r) => r !== null)
        .join('\n');

      const oggetto = `[EVASIONE ${rif}] ${o.cliente} · ${quando}`;
      for (const to of aChi) {
        const e = await inviaMail(cred, { to, subject: oggetto, content: testoMail });
        esiti.push({ to, ok: e.ok, ...(e.ok ? {} : { errore: e.errore }) });
      }
      if (!esiti.some((e) => e.ok)) return json({ sent: false, esiti, motivoRipiego }, 502);
    }

    // Si segna DOPO: una richiesta segnata come mandata e mai partita è peggio
    // di una mandata due volte (e la rotta di là è idempotente sul riferimento).
    await admin
      .from('ordini')
      .update({
        evasione_richiesta_il: new Date().toISOString(),
        evasione_dati: { ...dati, canale, ...(motivoRipiego ? { motivo_ripiego: motivoRipiego } : {}) },
      })
      .eq('id', ordineId);

    return json({
      sent: true,
      canale,
      giaEsistente,
      ...(canale === 'mail' ? { a: aChi, ripiego: ripiegoSuTuttaLaSquadra, motivoRipiego } : {}),
    });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
