// Edge Function `mail` (Deno): proxy verso AI Mail (deluxy-mail).
// Custodisce la chiave API di AI Mail server-side (secret MAIL_API_TOKEN, fallback
// vault hub) e chiede le ultime mail ricevute da un contatto per la scheda Scout.
//   { azione: 'messaggi', email: '<contatto>', limite?: 10 } → GET /api/v1/messaggi
// L'header x-utente (casella su cui operare) = email dell'utente Scout loggato.
//
//   { azione: 'richieste', limite?: 50 } → importa in `leads` la posta della
// CASELLA COMMERCIALE (secret MAIL_CASELLA_RICHIESTE, default
// commerciale@deluxy.it): ogni mail arrivata lì è una richiesta da lavorare.
// Dedup sul Message-ID (`leads.mail_id`, migr. 0042).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';
import { chiaveIngressoValida } from '../_shared/chiaveIn.ts';
import { autoQualificaLead } from '../_shared/autoqualifica.ts';

const BASE = Deno.env.get('MAIL_URL') ?? 'https://deluxy-mail.vercel.app';

// Chi puo collegare una casella: e una credenziale aziendale, non una
// preferenza personale. Stesso elenco di lib/admin.ts lato app — qui va
// ripetuto perche le Edge Function non condividono il codice del client.
const AMMINISTRATORI = ['nicolo.donato@deluxy.it'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // Chiave di AI Mail: prima il secret dell'edge function, poi il vault hub.
    const key = Deno.env.get('MAIL_API_TOKEN') ?? (await chiaveHub('MAIL_API_TOKEN'));
    if (!key) return json({ ok: false, errore: 'MAIL_API_TOKEN non configurata' }, 500);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Chi chiama: di norma un utente Scout loggato (la sua email = casella su
    // cui leggere). L'import delle richieste non dipende da chi lo lancia, così
    // vale anche una chiave server-to-server (cron, automazioni).
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const email = userData?.user?.email;
    const chiaveApi = (req.headers.get('x-api-key') ?? '').trim();
    // Chiave di servizio: vale sia quella generata dall'app (`chiavi_app._ingresso`,
    // che è quella usata dal cron notturno) sia il secret storico. Spegnere
    // quello che già funziona non è una migrazione, è un guasto programmato.
    const daServizio = chiaveApi ? (await chiaveIngressoValida(chiaveApi, admin)).ok : false;

    const body = await req.json().catch(() => ({}));
    // L'azione "richieste" accetta anche la chiave; tutto il resto vuole l'utente.
    if (!email && !(daServizio && body.azione === 'richieste')) {
      return json({ ok: false, errore: 'Non autenticato' }, 401);
    }

    // ── Caselle di AI Mail: elenco e collegamento ────────────────────────────
    // Servono alla schermata Impostazioni di Scout: l'admin sceglie una casella
    // che ESISTE (invece di digitare un indirizzo a caso e prendersi un 404) e,
    // se non c'è, la collega da qui.
    //
    // ⚠️ Scout NON conserva le credenziali: le riceve dal modulo, le inoltra ad
    // AI Mail — che è l'app padrona delle caselle e le cifra — e le dimentica.
    // Due app che custodiscono la stessa password sono due posti da cui può
    // uscire e due da aggiornare quando cambia.
    if (body.azione === 'caselle') {
      const res = await fetch(`${BASE}/api/v1/caselle`, { headers: { 'x-api-key': key } });
      const txt = await res.text();
      if (!res.ok) {
        return json(
          {
            ok: false,
            errore:
              res.status === 404
                ? 'Questa versione di AI Mail non ha ancora l’elenco delle caselle: va pubblicata.'
                : `AI Mail ${res.status}: ${txt.slice(0, 200)}`,
          },
          502,
        );
      }
      return new Response(txt, { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    if (body.azione === 'collega_casella') {
      // Solo l'admin collega una casella: è una credenziale aziendale, non
      // un'impostazione personale. Stessa regola della schermata App collegate.
      if (!AMMINISTRATORI.includes((email ?? '').toLowerCase())) {
        return json({ ok: false, errore: 'Solo un amministratore può collegare una casella.' }, 403);
      }
      const res = await fetch(`${BASE}/api/v1/caselle`, {
        method: 'POST',
        headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body.casella ?? {}),
      });
      const txt = await res.text();
      return new Response(txt, {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // ── Il testo intero di UNA mail ──────────────────────────────────────────
    // All'import si salva solo oggetto + anteprima (due righe): per leggere
    // davvero una richiesta serve il corpo, e chiederlo solo quando si apre
    // evita di trascinarsi dietro migliaia di caratteri per ogni riga di elenco.
    if (body.azione === 'corpo') {
      const idMail = String(body.id ?? '').trim();
      if (!idMail) return json({ ok: false, errore: 'Manca l’id del messaggio.' }, 400);

      // ⚠️ PRIMA LA PROPRIA CASSETTA, POI — SOLO SE IMPORTATA — QUELLA COMUNE
      // (27/08/2026).
      //
      // Qui si leggeva sempre e solo dalla cassetta di lettura configurata, che
      // — come dice il commento più sotto — è la cassetta PERSONALE di una
      // persona, perché commerciale@ è un alias. E l'id arrivava dal client
      // senza essere confrontato con niente: un qualunque utente Scout
      // autenticato poteva farsi dare il testo di QUALSIASI messaggio di quella
      // cassetta, anche mai importato e anche della posta inviata, bastava
      // conoscerne l'identificativo.
      //
      // Due strade, e nessuna delle due si fida del client:
      //  1. la propria cassetta — sempre lecita, è la posta di chi chiama, e
      //     serve alla ricerca «cerca fra le mie mail» (che prima leggeva da
      //     una cassetta diversa da quella in cui aveva cercato);
      //  2. la cassetta comune — solo se quel messaggio Scout l'ha già
      //     importato, e la prova sta in `mail_importate` (migr. 0086), che
      //     scrive solo il server. Fino al 27/08/2026 si guardava invece in
      //     `leads` / `richieste_cliente` / `preventivi`, cioè in tabelle che
      //     l'utente scrive: vedi il commento sotto. È il caso per cui il ramo
      //     esiste: rileggere una richiesta presa in carico.
      const leggiDa = async (casella: string) =>
        await fetch(`${BASE}/api/v1/messaggi?corpo=${encodeURIComponent(idMail)}`, {
          headers: { 'x-api-key': key, 'x-utente': casella },
        });

      // ⚠️ LA PROVA NON STA PIÙ DOVE LA SCRIVE CHI DEVE ESSERE PROVATO
      // (27/08/2026, revisione ostile). Fin qui si cercava `mail_ref` in
      // `leads`, `richieste_cliente` e `preventivi` — tutte e tre scrivibili
      // dall'utente (`leads_insert` è `with check (true)`, `preventivi` è
      // `for all using(true) with check(true)`). Bastava inserire una riga
      // `leads` con `mail_ref` uguale al Message-ID letto negli header
      // `References` di un thread, e questo controllo diceva di sì: da lì
      // usciva il corpo integrale di un messaggio della cassetta personale di
      // un altro, mai ricevuto da chi lo chiedeva.
      //
      // Ora la prova sta in `mail_importate` (migr. 0086): RLS accesa e
      // nessuna policy, quindi la scrive solo il server — questa funzione, al
      // momento dell'import. Restringere `leads` non sarebbe bastato: sarebbe
      // rimasta `preventivi`, e domani un'altra tabella.
      const { data: prova } = await admin
        .from('mail_importate')
        .select('mail_ref')
        .eq('mail_ref', idMail)
        .limit(1);
      const importato = (prova ?? []).length > 0;
      // 1. La propria cassetta. `email` viene dal token, mai dal client.
      let r = email ? await leggiDa(email) : null;

      // 2. Quella comune, solo per un messaggio già importato.
      if ((!r || r.status === 404) && importato) {
        const { data: rigaL } = await admin
          .from('impostazioni')
          .select('valore')
          .eq('chiave', 'mail.casella_lettura')
          .maybeSingle();
        const { data: rigaC } = await admin
          .from('impostazioni')
          .select('valore')
          .eq('chiave', 'mail.casella_richieste')
          .maybeSingle();
        const dove = (rigaL?.valore ?? '').trim() || (rigaC?.valore ?? '').trim() || email || '';
        if (dove && dove !== email) r = await leggiDa(dove);
      }

      if (!r) {
        return json({ ok: false, errore: 'Nessuna casella da cui leggere.' }, 400);
      }
      const txt = await r.text();
      if (!r.ok) {
        return json(
          {
            ok: false,
            errore:
              r.status === 404
                ? importato
                  ? 'Il testo non è disponibile: la mail non è (più) in quella casella, oppure AI Mail non è aggiornata.'
                  : 'Il testo non è nella tua casella. Di una mail che Scout non ha ancora importato si legge solo la posta propria.'
                : `AI Mail ${r.status}`,
          },
          502,
        );
      }
      return new Response(txt, { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    // ── Richieste Web: la posta della casella commerciale diventa lead ────────
    if (body.azione === 'richieste') {
      // La casella la decide l'app (Profilo → Impostazioni, tabella
      // `impostazioni`); il secret resta come ripiego per i primi avvii.
      const { data: imp } = await admin
        .from('impostazioni')
        .select('valore')
        .eq('chiave', 'mail.casella_richieste')
        .maybeSingle();
      const casella =
        (imp?.valore ?? '').trim() || Deno.env.get('MAIL_CASELLA_RICHIESTE') || 'commerciale@deluxy.it';
      const limite = Math.min(Math.max(Number(body.limite ?? 50) || 50, 1), 100);
      // ⚠️ SOLO LA POSTA INDIRIZZATA ALLA CASELLA COMMERCIALE.
      //
      // Misurato il 21/08/2026: `commerciale@deluxy.it` è un **alias** che
      // consegna nelle caselle personali (218 mail, nelle cassette di due
      // persone), non una casella con una sua posta in arrivo. Leggendo
      // `?casella=1` e basta si importerebbe **tutta** la posta di quella
      // persona — centinaia di mail al mese — chiamandola «richiesta».
      // Con `destinatario=` si prende solo ciò che era indirizzato lì.
      //
      // `lettura` = da quale cassetta leggere (un utente che esiste in AI Mail);
      // `casella` = a quale indirizzo dev'essere indirizzata la mail. Se sono lo
      // stesso indirizzo — cioè la casella esiste davvero — il filtro non toglie
      // niente e il comportamento resta quello di prima.
      const { data: rigaLettura } = await admin
        .from('impostazioni')
        .select('valore')
        .eq('chiave', 'mail.casella_lettura')
        .maybeSingle();
      const lettura = (rigaLettura?.valore ?? '').trim() || casella;
      const p = new URLSearchParams({
        casella: '1',
        limite: String(limite),
        destinatario: casella,
      });
      if (body.da) p.set('da', String(body.da));

      const res = await fetch(`${BASE}/api/v1/messaggi?${p.toString()}`, {
        headers: { 'x-api-key': key, 'x-utente': lettura },
      });
      const dati = await res.json().catch(() => null);
      if (!res.ok || !dati?.ok) {
        // 404 = in AI Mail non c'è un utente attivo con quella email: è la causa
        // più probabile, e dal messaggio grezzo non si capirebbe cosa fare.
        const errore =
          res.status === 404
            ? `In AI Mail non c'è una casella attiva «${casella}». Creala fra gli utenti di AI Mail, oppure indica un'altra casella in Profilo → Impostazioni.`
            : (dati?.errore ?? `AI Mail ha risposto ${res.status} per la casella ${casella}.`);
        return json({ ok: false, errore, casella }, res.status === 404 ? 404 : 502);
      }

      const messaggi: any[] = Array.isArray(dati.messaggi) ? dati.messaggi : [];
      // Le nostre stesse mail non sono richieste.
      const ricevute = messaggi.filter((m) => m.direzione !== 'uscita' && m.email !== casella);

      // ── CHI NON È UNA RICHIESTA ──────────────────────────────────────────
      //
      // 🔴 Misurato il 23/08/2026: in coda c'erano **25 richieste, 24 delle
      // quali non erano richieste**. L'indirizzo commerciale è finito nelle
      // liste di notifica di Shopify: su 218 mail arrivate a quella casella,
      // 167 erano di Shopify.
      //
      // ⭐ E i mittenti veri smentiscono la regola che verrebbe da scrivere:
      // sono `mailer@shopify.com` (20) e `email@email.shopify.com` (4).
      // **Nessuno dei due è un `no-reply`** — una lista di local part
      // «classici» (noreply, donotreply, mailer-daemon…) ne avrebbe presi
      // ZERO. Qui il segnale che funziona è il **dominio**. La lista dei local
      // part resta lo stesso, ma come rete per il futuro, non come regola
      // principale.
      //
      // Una richiesta la scrive una persona: se l'ha scritta un robot, o un
      // collega, non è una richiesta.
      const dominioDi = (e: unknown) => String(e ?? '').toLowerCase().split('@')[1] ?? '';
      const utenteDi = (e: unknown) => String(e ?? '').toLowerCase().split('@')[0] ?? '';

      /** Domini che mandano solo posta automatica. Suffisso, non uguaglianza:
       *  `email.shopify.com` è un sottodominio di `shopify.com`. */
      const DOMINI_ROBOT = ['shopify.com', 'shopifyemail.com', 'mailchimp.com', 'sendgrid.net'];
      /** Rete di sicurezza per i robot che verranno, non per quelli di oggi. */
      const UTENTI_ROBOT = [
        'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'nonrispondere', 'non-rispondere',
        'mailer-daemon', 'postmaster', 'bounce', 'bounces', 'newsletter', 'notifications',
        'notification', 'notifiche', 'alert', 'alerts', 'automated', 'mailer',
      ];
      // Il nostro stesso dominio: un collega che scrive a commerciale@ non sta
      // mandando una richiesta dal web. (Prima si scartava solo la casella
      // esatta; era la stessa idea, applicata a metà.)
      const nostroDominio = dominioDi(casella);

      const automatica = (m: any) => {
        const d = dominioDi(m.email);
        if (DOMINI_ROBOT.some((x) => d === x || d.endsWith('.' + x))) return true;
        return UTENTI_ROBOT.includes(utenteDi(m.email));
      };
      const interna = (m: any) => !!nostroDominio && dominioDi(m.email) === nostroDominio;

      const scartateAuto = ricevute.filter(automatica);
      const scartateInterne = ricevute.filter((m) => !automatica(m) && interna(m));
      const inArrivo = ricevute.filter((m) => !automatica(m) && !interna(m));

      const ids = inArrivo.map((m) => m.messageId).filter(Boolean);

      let importati = 0;
      let agganciati = 0; // trattativa su un contatto già in rubrica
      let creati = 0; // negozio+contatto creati dai dati della richiesta
      let nonQualificati = 0; // restati «nuovi» in coda (auto-qualifica fallita)
      let richiesteCliente = 0; // da un cliente: richiesta da prezzare, non trattativa
      let anagraficheCreate = 0; // nate adesso nel registro Anagrafiche
      let anagraficheGiaPresenti = 0; // c'erano già di là
      let anagraficheNonScritte = 0; // il registro non le ha prese (motivo nei log)
      if (ids.length) {
        const { data: gia } = await admin.from('leads').select('mail_id').in('mail_id', ids);
        const noti = new Set((gia ?? []).map((r: any) => r.mail_id));
        const nuovi = inArrivo
          .filter((m) => m.messageId && !noti.has(m.messageId))
          .map((m) => ({
            nome: m.da || m.email || 'Richiesta senza mittente',
            contatto: m.email ?? null,
            fonte: 'mail',
            // L'oggetto dice cosa chiede; l'anteprima aggiunge il contesto.
            messaggio: [m.oggetto, m.anteprima].filter(Boolean).join(' — ').slice(0, 2000) || null,
            mail_id: m.messageId,
            // L'id INTERNO di AI Mail: è quello che apre /messaggio/<id>.
            // `mail_id` (il Message-ID della posta) serve solo contro i doppioni.
            mail_ref: m.id ?? null,
          }));
        if (nuovi.length) {
          const { data: inseriti, error } = await admin.from('leads').insert(nuovi).select('id, nome, contatto, messaggio, mail_ref');
          if (error) return json({ ok: false, errore: error.message }, 500);
          importati = nuovi.length;
          // ⚠️ LA PROVA DELL'IMPORT SI SCRIVE QUI, e solo qui (migr. 0086).
          // È l'unica cosa che poi autorizza la lettura del corpo di quel
          // messaggio dalla cassetta comune: sta in una tabella che l'utente
          // non può scrivere, mentre `leads.mail_ref` — che serviva prima — la
          // scrive chiunque. Best-effort: se questa riga non entra, il
          // messaggio resta importato e semplicemente non si potrà rileggere,
          // che è il verso giusto in cui sbagliare.
          await admin
            .from('mail_importate')
            .upsert(
              nuovi
                .filter((n: any) => n.mail_ref)
                .map((n: any) => ({ mail_ref: n.mail_ref, casella })),
              { onConflict: 'mail_ref' },
            )
            .then(undefined, () => undefined);
          // AUTO-QUALIFICA (25/08/2026): la trattativa nasce qui, non aspetta
          // una persona — agganciata al contatto se è in rubrica, altrimenti
          // creando negozio e contatto dai dati della richiesta. Best-effort:
          // chi fallisce resta «nuovo» in coda, come prima.
          for (const l of inseriti ?? []) {
            const r = await autoQualificaLead(admin, l as any);
            if (r.esito === 'agganciato') agganciati++;
            else if (r.esito === 'creato') creati++;
            // Regola del binario: chi è già cliente non apre una trattativa —
            // la sua richiesta va prezzata e finalizzata (Richieste Clienti).
            else if (r.esito === 'richiesta_cliente') richiesteCliente++;
            else nonQualificati++;
            // Il registro Anagrafiche: quante anagrafiche sono NATE adesso,
            // quante c'erano già, e quante non sono state scritte. Un conto
            // che non si tiene è un esito che vive solo dentro una funzione.
            const reg = 'registro' in r ? r.registro : undefined;
            if (reg) {
              if (!reg.ok) anagraficheNonScritte++;
              else if (reg.esito === 'creato') anagraficheCreate++;
              else anagraficheGiaPresenti++;
            }
          }
        }
      }

      // ⚠️ `lette` sono le mail RICEVUTE, non quelle sopravvissute al filtro:
      // se no il taglio sparisce dal conto e sembra che la casella non riceva
      // niente. Gli scarti si dichiarano, con il motivo — le mail restano
      // comunque nella casella, qui non si cancella niente.
      return json({
        ok: true,
        casella,
        lette: ricevute.length,
        importate: importati,
        // L'auto-qualifica si DICHIARA: trattative nate, su chi, e quante
        // richieste sono rimaste in coda per una persona.
        trattativeAgganciate: agganciati,
        trattativeConNegozioNuovo: creati,
        // Le richieste di chi è già cliente: non sono pipeline, sono lavoro da
        // prezzare. Si contano a parte perché sommarle alle trattative
        // rifarebbe l'errore che la regola del binario esiste per evitare.
        richiesteCliente,
        rimasteInCoda: nonQualificati,
        // Il registro Anagrafiche: si dichiara come tutto il resto.
        anagraficheCreate,
        anagraficheGiaPresenti,
        anagraficheNonScritte,
        scartate: scartateAuto.length + scartateInterne.length,
        automatiche: scartateAuto.length,
        interne: scartateInterne.length,
        // Da chi: serve a capire in fretta se il filtro sta tagliando qualcuno
        // che non doveva. Pochi, e solo gli indirizzi.
        mittentiScartati: [...new Set([...scartateAuto, ...scartateInterne].map((m) => m.email).filter(Boolean))].slice(0, 8),
      });
    }

    // ── LA PROPRIA CASELLA: cerca fra le mie mail ────────────────────────────
    // Richiesta dell'utente (26/08/2026): «dai la possibilità all'utente di
    // ricercare tra le proprie mail quelle della propria casella».
    //
    // ⚠️ La casella è SEMPRE quella di chi chiama — `x-utente` è l'email presa
    // dal suo token, non un parametro. Farla scegliere dal chiamante vorrebbe
    // dire lasciar leggere la posta di un collega.
    if (body.azione === 'casella') {
      if (!email) return json({ ok: false, errore: 'Non autenticato' }, 401);
      const q = String(body.q ?? '').trim();
      const limite = Math.min(Math.max(Number(body.limite ?? 25) || 25, 1), 100);
      const p = new URLSearchParams({ casella: '1', limite: String(limite) });
      if (q) p.set('q', q);
      if (body.giorni) p.set('da', new Date(Date.now() - Number(body.giorni) * 86_400_000).toISOString());
      const r = await fetch(`${BASE}/api/v1/messaggi?${p.toString()}`, {
        headers: { 'x-api-key': key, 'x-utente': email },
      });
      const txt = await r.text();
      if (!r.ok) {
        return json(
          {
            ok: false,
            errore:
              r.status === 404
                ? `La casella ${email} non è collegata ad AI Mail: si collega da lì.`
                : `AI Mail ${r.status}: ${txt.slice(0, 200)}`,
          },
          502,
        );
      }
      return new Response(txt, { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    if (body.azione !== 'messaggi') return json({ ok: false, errore: `Azione sconosciuta: ${body.azione}` }, 400);
    // Da qui in poi serve l'utente: la casella da leggere è la sua.
    if (!email) return json({ ok: false, errore: 'Non autenticato' }, 401);

    const contatto = String(body.email ?? '').trim();
    if (!contatto) return json({ ok: false, errore: 'Manca email del contatto' }, 400);
    const limite = Math.min(Math.max(Number(body.limite ?? 30) || 30, 1), 100);

    const p = new URLSearchParams({ email: contatto, limite: String(limite) });
    if (body.da) p.set('da', String(body.da));
    if (body.a) p.set('a', String(body.a));
    if (body.server) p.set('server', '1');
    const res = await fetch(`${BASE}/api/v1/messaggi?${p.toString()}`, {
      headers: { 'x-api-key': key, 'x-utente': email },
    });
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    return json({ ok: false, errore: String((e as any)?.message ?? e) }, 500);
  }
});
