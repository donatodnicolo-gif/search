// Edge Function `richiesta-cliente` (Deno): la porta d'ingresso delle RICHIESTE
// DEI CLIENTI che arrivano da un'altra app — oggi la piattaforma consegne
// («applicativo di delivery»), domani chiunque altro.
//
// Decisione dell'utente (26/08/2026 sera): le richieste dei clienti ricorrenti
// «potranno arrivare da mail, da applicativo di delivery o anche manualmente».
// La mail entra da `mail` + `_shared/autoqualifica.ts` (regola del binario: se
// chi scrive è già cliente non nasce una trattativa, nasce una richiesta); a
// mano si scrive dall'app; questa funzione è la terza porta.
//
// ⚠️ Non è la porta dei LEAD: quella è `lead`. Qui entra il lavoro di chi è
// GIÀ cliente — che infatti non apre pipeline: si prezza e si finalizza col
// documento di FINANCE.
//
// Auth: header `x-api-key: <chiave d'ingresso>` (la stessa di `lead` e
// `trattativa`). Deploy con --no-verify-jwt.
//
// POST /functions/v1/richiesta-cliente
//   { cliente, descrizione, importo?, canale?, tipologia?, serveEntro?, nota?,
//     origine?, riferimentoEsterno?, placeId?, anagraficheId? }
//   → 201 { ok, id, place: { id, nome } | null, registro }
//   → 200 { ok, id, gia_presente: true }   (stesso `riferimentoEsterno`)
import { chiaveIngressoValida, clientAdmin } from '../_shared/chiaveIn.ts';
import { assicuraNegozioNelRegistro } from '../_shared/registro.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-api-key, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

const CANALI = new Set(['mail', 'telefono', 'whatsapp', 'di_persona', 'web', 'altro']);
const TIPOLOGIE = new Set(['maison', 'b2b']);

function normNome(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const admin = clientAdmin();
    const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const auth = await chiaveIngressoValida(key, admin);
    if (!auth.ok) return json({ error: auth.motivo }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const testo = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

    const cliente = testo(body.cliente);
    const descrizione = testo(body.descrizione);
    if (!cliente) return json({ error: 'Manca `cliente`: il nome dell’azienda che chiede.' }, 400);
    if (!descrizione) return json({ error: 'Manca `descrizione`: cosa chiede.' }, 400);

    // ⚠️ L'importo è FACOLTATIVO per progettazione, ma se arriva dev'essere un
    // numero > 0: zero non vuol dire «non lo so», e una richiesta a zero euro
    // farebbe emettere un documento a zero.
    let importo: number | null = null;
    if (body.importo !== undefined && body.importo !== null && body.importo !== '') {
      const n = Number(body.importo);
      if (!Number.isFinite(n) || n <= 0) return json({ error: '`importo` dev’essere un numero maggiore di zero (oppure assente).' }, 400);
      importo = n;
    }

    const canale = typeof body.canale === 'string' && CANALI.has(body.canale) ? body.canale : 'altro';
    const tipologia = typeof body.tipologia === 'string' && TIPOLOGIE.has(body.tipologia) ? body.tipologia : 'b2b';
    const origine = testo(body.origine) ?? 'api';
    const riferimentoEsterno = testo(body.riferimentoEsterno);
    const serveEntro = testo(body.serveEntro); // 'YYYY-MM-DD'
    const nota = testo(body.nota);

    // ── Idempotenza ──────────────────────────────────────────────────────────
    // Un retry della piattaforma (o un cron che rilegge la stessa cosa) non
    // deve far prezzare due volte lo stesso lavoro. C'è anche l'indice unico
    // sul database: questo controllo serve a rispondere bene, non a proteggere.
    if (riferimentoEsterno) {
      const { data: gia } = await admin
        .from('richieste_cliente')
        .select('id')
        .eq('origine', origine)
        .eq('riferimento_esterno', riferimentoEsterno)
        .maybeSingle();
      if (gia) return json({ ok: true, id: (gia as { id: string }).id, gia_presente: true });
    }

    // ── Il negozio in Scout, quando si riesce a riconoscerlo ─────────────────
    // ⚠️ Resta FACOLTATIVO: il nome ce l'abbiamo comunque, e rifiutare la
    // richiesta perché non troviamo la scheda vorrebbe dire perdere il lavoro
    // (o inventare un negozio). Si aggancia solo quando è SICURO — id esplicito,
    // id del registro, oppure un solo omonimo esatto. Un «forse» che scrive
    // sulla scheda sbagliata è peggio di una richiesta senza scheda.
    let posto: { id: string; nome: string } | null = null;
    const placeId = testo(body.placeId);
    const anagraficheId = testo(body.anagraficheId);
    if (placeId) {
      const { data } = await admin.from('places').select('id, nome').eq('id', placeId).maybeSingle();
      posto = (data as typeof posto) ?? null;
    }
    if (!posto && anagraficheId) {
      const { data } = await admin.from('places').select('id, nome').eq('anagrafiche_id', anagraficheId).maybeSingle();
      posto = (data as typeof posto) ?? null;
    }
    if (!posto) {
      const { data } = await admin.from('places').select('id, nome').ilike('nome', cliente).limit(5);
      const esatti = (data ?? []).filter((p: { nome: string }) => normNome(p.nome) === normNome(cliente));
      if (esatti.length === 1) posto = esatti[0] as typeof posto;
    }

    const { data: creata, error } = await admin
      .from('richieste_cliente')
      .insert({
        owner: null, // non attribuita: se la prende chi la lavora
        place_id: posto?.id ?? null,
        cliente: posto?.nome ?? cliente,
        descrizione: descrizione.slice(0, 2000),
        importo,
        canale,
        tipologia,
        origine,
        riferimento_esterno: riferimentoEsterno,
        serve_entro: serveEntro,
        nota,
      })
      .select('id')
      .single();
    if (error) {
      // 23505 = l'indice unico (origine, riferimento_esterno): è arrivata due
      // volte la stessa richiesta. Non è un errore del chiamante.
      if ((error as { code?: string }).code === '23505' && riferimentoEsterno) {
        const { data: gia } = await admin
          .from('richieste_cliente')
          .select('id')
          .eq('origine', origine)
          .eq('riferimento_esterno', riferimentoEsterno)
          .maybeSingle();
        if (gia) return json({ ok: true, id: (gia as { id: string }).id, gia_presente: true });
      }
      return json({ error: error.message }, 500);
    }

    // Il cliente dev'essere anche nel registro Anagrafiche: si può fare solo se
    // la scheda in Scout l'abbiamo riconosciuta.
    const registro = posto ? await assicuraNegozioNelRegistro(admin, posto.id) : { ok: false, reason: 'negozio_non_riconosciuto' };

    return json(
      {
        ok: true,
        id: (creata as { id: string }).id,
        place: posto,
        registro,
        messaggio: posto
          ? `Richiesta registrata per «${posto.nome}».`
          : `Richiesta registrata per «${cliente}» (nessuna scheda agganciata: il nome non corrisponde a un solo negozio).`,
      },
      201,
    );
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
