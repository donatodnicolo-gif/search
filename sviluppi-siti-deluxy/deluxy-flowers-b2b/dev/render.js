/*
  Anteprima locale del tema: renderizza i template JSON + sezioni Liquid in HTML statico
  dentro dev/out/, imitando le variabili di Shopify che il tema usa davvero.
  Serve solo a guardare il sito in locale prima di caricarlo: non è Shopify.
*/
const fs = require('fs');
const path = require('path');
const { Liquid } = require('liquidjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);

// pagine del sito e template da usare
const PAGES = [
  { url: '/', file: 'index.html', template: 'index', title: 'Deluxy Flowers for Business — Floral Creative Studio B2B' },
  { url: '/pages/servizi', file: 'pages/servizi/index.html', template: 'page.servizi', title: 'Servizi' },
  { url: '/pages/settori', file: 'pages/settori/index.html', template: 'page.settori', title: 'Settori' },
  { url: '/pages/progetti', file: 'pages/progetti/index.html', template: 'page.progetti', title: 'Progetti' },
  { url: '/pages/come-funziona', file: 'pages/come-funziona/index.html', template: 'page.come-funziona', title: 'Come Funziona' },
  { url: '/pages/richiedi-un-progetto', file: 'pages/richiedi-un-progetto/index.html', template: 'page.richiedi-un-progetto', title: 'Richiedi un Progetto' },
  { url: '/404', file: '404.html', template: '404', title: 'Pagina non trovata' },
];

const engine = new Liquid({
  root: [path.join(ROOT, 'snippets')],
  extname: '.liquid',
  strictVariables: false,
  strictFilters: false,
  jsTruthy: false,
  relativeReference: false,
});

// ---- filtri Shopify usati dal tema ----
engine.registerFilter('asset_url', (v) => '/assets/' + v);
engine.registerFilter('stylesheet_tag', (v) => `<link rel="stylesheet" href="${v}">`);
engine.registerFilter('handle', (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
engine.registerFilter('image_url', (v) => v);
engine.registerFilter('image_tag', (v, opts) => `<img src="${v}" alt="">`);
engine.registerFilter('money', (v) => (Number(v) / 100).toFixed(2) + ' €');
engine.registerFilter('default_errors', (v) => '');
engine.registerFilter('format_address', (v) => '');
engine.registerFilter('format_code', (v) => v);

// ---- tag Shopify non presenti in liquidjs ----
engine.registerTag('schema', {
  parse(token, remainTokens) {
    this.tokens = [];
    const stream = this.liquid.parser.parseStream(remainTokens);
    stream.on('tag:endschema', () => stream.stop()).on('template', () => {}).on('end', () => { throw new Error('endschema mancante'); });
    stream.start();
  },
  render() { return ''; },
});
engine.registerTag('form', {
  parse(token, remainTokens) {
    this.args = token.args;
    this.tpls = [];
    const stream = this.liquid.parser.parseStream(remainTokens);
    stream.on('tag:endform', () => stream.stop()).on('template', (t) => this.tpls.push(t)).on('end', () => { throw new Error('endform mancante'); });
    stream.start();
  },
  * render(ctx, emitter) {
    const type = (this.args.match(/'([^']+)'/) || [])[1] || '';
    const id = (this.args.match(/id:\s*'([^']+)'/) || [])[1] || '';
    emitter.write(`<form method="post" action="/contact#${id}" id="${id}" accept-charset="UTF-8" class="shopify-form-${type}"><input type="hidden" name="form_type" value="${type}"><input type="hidden" name="utf8" value="✓">`);
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    emitter.write('</form>');
  },
});
engine.registerTag('sections', {
  parse(token) { this.group = (token.args.match(/'([^']+)'/) || [])[1]; },
  * render(ctx, emitter) {
    const html = yield renderGroup(this.group, ctx.getAll());
    emitter.write(html);
  },
});
engine.registerTag('layout', { parse() {}, render() { return ''; } });

// ---- sezioni ----
const schemaCache = {};
function loadSection(type) {
  const file = path.join(ROOT, 'sections', type + '.liquid');
  const src = read(file);
  const m = src.match(/{% schema %}([\s\S]*?){% endschema %}/);
  const schema = m ? JSON.parse(m[1]) : { settings: [] };
  schemaCache[type] = schema;
  return { src: src.replace(/{% schema %}[\s\S]*?{% endschema %}/, ''), schema };
}
function withDefaults(schemaSettings, settings) {
  const out = {};
  for (const s of schemaSettings || []) if (s.default !== undefined) out[s.id] = s.default;
  return Object.assign(out, settings || {});
}
async function renderSection(id, def, globals) {
  const { src, schema } = loadSection(def.type);
  const blockSchemas = Object.fromEntries((schema.blocks || []).map((b) => [b.type, b.settings || []]));
  const order = def.block_order || Object.keys(def.blocks || {});
  const blocks = order.map((bid) => {
    const b = def.blocks[bid];
    return { id: bid, type: b.type, settings: withDefaults(blockSchemas[b.type], b.settings), shopify_attributes: '' };
  });
  const section = { id, settings: withDefaults(schema.settings, def.settings), blocks };
  const html = await engine.parseAndRender(src, Object.assign({}, globals, { section }));
  return `<div id="shopify-section-${id}" class="shopify-section">${html}</div>`;
}
async function renderGroup(group, globals) {
  const def = JSON.parse(read(path.join(ROOT, 'sections', group + '.json')));
  let html = '';
  for (const id of def.order) html += await renderSection(id, def.sections[id], globals);
  return html;
}
async function renderTemplate(name, globals) {
  const def = JSON.parse(read(path.join(ROOT, 'templates', name + '.json')));
  let html = '';
  for (const id of def.order) html += await renderSection(id, def.sections[id], globals);
  return html;
}

// ---- pagine ----
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
  const layout = read(path.join(ROOT, 'layout', 'theme.liquid'));
  for (const p of PAGES) {
    const globals = {
      shop: { name: 'Deluxy Flowers', url: '' },
      request: { path: p.url, locale: { iso_code: 'it' } },
      routes: { root_url: '/', search_url: '/search', account_logout_url: '/account/logout' },
      linklists: {},
      page_title: p.title,
      page_description: '',
      canonical_url: 'https://example.local' + p.url,
      template: { name: p.template.split('.')[0] },
      page: { title: p.title, content: '' },
      form: { 'posted_successfully?': false, errors: false },
      now: new Date(),
    };
    const body = await renderTemplate(p.template, globals);
    const html = await engine.parseAndRender(layout, Object.assign({}, globals, { content_for_layout: body, content_for_header: '' }));
    const file = path.join(OUT, p.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
    console.log('ok', p.url, '→', path.relative(__dirname, file));
  }
})().catch((e) => { console.error(e); process.exit(1); });
