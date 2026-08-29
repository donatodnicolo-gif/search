#!/usr/bin/env node
/**
 * shopify-delivery-i18n.mjs
 *
 * Aggiunge il blocco "data + fascia oraria di consegna" alle versioni TRADOTTE
 * (EN/DE/FR/ES/…) dell'email "Conferma dell'ordine" di un negozio Shopify.
 *
 * Perché serve: le traduzioni gestite da "Translate & Adapt" sono copie complete
 * e separate del corpo email. Modificare la sorgente (italiano) NON le aggiorna.
 * Questo script inserisce il blocco in ogni lingua pubblicata, con l'etichetta
 * già tradotta, usando l'API ufficiale translationsRegister.
 *
 * È IDEMPOTENTE (non duplica se già presente) e REVERSIBILE (--revert).
 *
 * USO:
 *   set SHOP=fb72b1-2                       (handle del negozio, o dominio myshopify)
 *   set SHOPIFY_ADMIN_TOKEN=shpat_xxx       (token app custom con read/write_translations)
 *   node shopify-delivery-i18n.mjs --dry-run     # mostra cosa farebbe, senza scrivere
 *   node shopify-delivery-i18n.mjs               # applica
 *   node shopify-delivery-i18n.mjs --revert      # rimuove il blocco (rollback)
 *
 * Il token NON va committato. Va passato via variabile d'ambiente.
 */

const SHOP = process.env.SHOP;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API = '2025-01';
const DRY = process.argv.includes('--dry-run');
const REVERT = process.argv.includes('--revert');

if (!SHOP || !TOKEN) {
  console.error('Manca SHOP o SHOPIFY_ADMIN_TOKEN nelle variabili d\'ambiente.');
  process.exit(1);
}

const endpoint = `https://${SHOP.includes('.') ? SHOP : SHOP + '.myshopify.com'}/admin/api/${API}/graphql.json`;

// Punto di inserimento: subito dopo il rendering del corpo email.
const ANCHOR = '<p>{{ email_body }}</p>';
const START = '<!-- deluxy-delivery-block -->';
const END = '<!-- /deluxy-delivery-block -->';

// Etichette per lingua (label, "fascia oraria"). Fallback = inglese.
const LABELS = {
  en: ['Expected delivery', 'time slot'],
  de: ['Voraussichtliche Lieferung', 'Zeitfenster'],
  fr: ['Livraison prévue', 'créneau horaire'],
  es: ['Entrega prevista', 'franja horaria'],
  it: ['Consegna prevista', 'fascia oraria'],
};

function block(locale) {
  const [label, slot] = LABELS[locale] || LABELS.en;
  // NB: niente filtro `| date:` — su date malformate (es. "2026-undefined-26",
  // già visto su cakedesign) genera "Liquid error: argument out of range" in mail.
  // Formato ricavato a mano dallo split YYYY-MM-DD, con fallback al valore grezzo.
  return `${START}
{% if attributes["Data_Consegna"] != blank %}
{% assign dc_p = attributes["Data_Consegna"] | split: "-" %}{% assign dc_m = dc_p[1] | plus: 0 %}
<p style="margin-top: 8px;"><strong>${label}:</strong> {% if dc_p.size == 3 and dc_m > 0 %}{{ dc_p[2] }}/{{ dc_p[1] }}/{{ dc_p[0] }}{% else %}{{ attributes["Data_Consegna"] }}{% endif %}{% if attributes["Fascia_Oraria_Consegna"] != blank %} &mdash; ${slot} {{ attributes["Fascia_Oraria_Consegna"] }}{% endif %}</p>
{% endif %}
${END}`;
}

async function gql(query, variables) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

// Trova la risorsa email "Conferma dell'ordine" e i digest della sorgente.
async function findOrderConfirmation() {
  let after = null;
  for (let i = 0; i < 5; i++) {
    const d = await gql(`
      query($after: String) {
        translatableResources(first: 50, resourceType: EMAIL_TEMPLATE, after: $after) {
          edges { cursor node { resourceId translatableContent { key value digest locale } } }
          pageInfo { hasNextPage }
        }
      }`, { after });
    for (const e of d.translatableResources.edges) {
      const title = e.node.translatableContent.find(c => c.key === 'title');
      if (title && /confermato|confirmed|bestätigt|confirmée|confirmado/i.test(title.value)
        && !/spedizione|shipment|aggiornato|updated/i.test(title.value)) {
        return e.node;
      }
    }
    if (!d.translatableResources.pageInfo.hasNextPage) break;
    after = d.translatableResources.edges.at(-1).cursor;
  }
  throw new Error('Template "Conferma dell\'ordine" non trovato.');
}

async function shopLocales() {
  const d = await gql(`{ shopLocales { locale primary published } }`);
  return d.shopLocales;
}

async function main() {
  const resource = await findOrderConfirmation();
  const bodyDigest = resource.translatableContent.find(c => c.key === 'body_html').digest;
  const primary = resource.translatableContent.find(c => c.key === 'body_html').locale;
  console.log(`Negozio ${SHOP} — risorsa ${resource.resourceId} (sorgente: ${primary})`);

  const locales = (await shopLocales()).filter(l => l.published && !l.primary);
  if (!locales.length) { console.log('Nessuna lingua tradotta pubblicata. Niente da fare.'); return; }

  for (const { locale } of locales) {
    const d = await gql(`
      query($id: ID!, $loc: String!) {
        translatableResource(resourceId: $id) { translations(locale: $loc) { key value } }
      }`, { id: resource.resourceId, loc: locale });
    const t = d.translatableResource.translations.find(x => x.key === 'body_html');
    if (!t || !t.value) { console.log(`[${locale}] nessuna traduzione del corpo — salto.`); continue; }

    let body = t.value;
    const has = body.includes(START);

    if (REVERT) {
      if (!has) { console.log(`[${locale}] blocco assente — niente da rimuovere.`); continue; }
      body = body.replace(new RegExp(`\\n?${START}[\\s\\S]*?${END}\\n?`), '');
    } else {
      if (has) { console.log(`[${locale}] blocco già presente — salto (idempotente).`); continue; }
      if (!body.includes(ANCHOR)) { console.log(`[${locale}] ancora "${ANCHOR}" non trovata — salto.`); continue; }
      body = body.replace(ANCHOR, ANCHOR + '\n' + block(locale));
    }

    if (DRY) { console.log(`[${locale}] ${REVERT ? 'rimuoverei' : 'inserirei'} il blocco (dry-run).`); continue; }

    const r = await gql(`
      mutation($id: ID!, $tr: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $tr) {
          userErrors { field message }
        }
      }`, { id: resource.resourceId, tr: [{ locale, key: 'body_html', value: body, translatableContentDigest: bodyDigest }] });
    const errs = r.translationsRegister.userErrors;
    console.log(`[${locale}] ${errs.length ? 'ERRORE: ' + JSON.stringify(errs) : (REVERT ? 'blocco rimosso ✓' : 'blocco inserito ✓')}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
