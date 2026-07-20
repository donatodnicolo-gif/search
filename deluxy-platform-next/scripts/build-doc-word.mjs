/**
 * Genera il documento Word SEMPRE AGGIORNATO a partire dal manuale Markdown.
 * Fonte:  docs/COME-FUNZIONA-APP-DELUXY.md   (versione viva, mantenuta da Claude)
 * Output: docs/COME-FUNZIONA-APP-DELUXY.docx (rigenerato a ogni update del .md)
 *
 * Uso:  npm run doc:word     (da deluxy-platform-next/)
 * Regola di lavoro: rigenerare a ogni commit che cambia il .md.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { marked } from 'marked';
import HTMLtoDOCX from 'html-to-docx';

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = join(here, '..', 'docs');
const mdPath = join(docsDir, 'COME-FUNZIONA-APP-DELUXY.md');
const outPath = join(docsDir, 'COME-FUNZIONA-APP-DELUXY.docx');

const md = readFileSync(mdPath, 'utf8');

// Data di rigenerazione (automatica) in intestazione
const generatedAt =
  process.env.DOC_DATE ||
  new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

const bodyHtml = marked.parse(md, { mangle: false, headerIds: false });

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 11pt; color: #1d1d1f; line-height: 1.4; }
  h1 { font-size: 22pt; color: #111318; }
  h2 { font-size: 16pt; color: #111318; border-bottom: 1px solid #d0d0d0; padding-bottom: 4px; }
  h3 { font-size: 13pt; color: #333; }
  h4 { font-size: 11.5pt; color: #444; }
  code { font-family: Consolas, monospace; background: #f2f2f2; padding: 1px 3px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #c8c8c8; padding: 5px 8px; text-align: left; font-size: 10pt; }
  th { background: #f5f5f7; }
  blockquote { border-left: 3px solid #b8963e; margin: 8px 0; padding: 4px 12px; color: #555; background: #faf7ef; }
  a { color: #0071e3; }
</style></head><body>
${generatedAt ? `<p style="color:#86868b;font-size:9pt">Word generato automaticamente dal manuale Markdown — ${generatedAt}</p>` : ''}
${bodyHtml}
</body></html>`;

const buffer = await HTMLtoDOCX(html, null, {
  title: 'Come funziona l’app Deluxy',
  font: 'Segoe UI',
  fontSize: 22, // half-points => 11pt
  table: { row: { cantSplit: true } },
  footer: false,
});

writeFileSync(outPath, buffer);
console.log('OK ->', outPath);
