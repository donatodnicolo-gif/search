import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const qui = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(qui, 'payload'), { recursive: true });
const nomi = ['snippets/all_tags_and_script.liquid', 'snippets/delivery_date_hour_c.liquid', 'sections/header.liquid', 'snippets/home-delivery.liquid', 'sections/home-delivery-section-new.liquid', 'snippets/product-delivery-date.liquid'];
const md5 = {};
for (const n of nomi) {
  const t = fs.readFileSync(path.join(qui, 'out', n.replace('/', '__')), 'utf8');
  md5[n] = crypto.createHash('md5').update(t).digest('hex');
  // stringa JSON con i non-ASCII in \uXXXX (backslash singolo): pronta per le variables della mutation
  const esc = JSON.stringify(t).replace(/[-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  fs.writeFileSync(path.join(qui, 'payload', n.replace('/', '__') + '.json'), esc);
  console.log(n.padEnd(45), 'md5', md5[n], 'json', String(esc.length).padStart(6), 'car.  nonASCII', (t.match(/[^\x00-\x7f]/g) || []).length);
}
fs.writeFileSync(path.join(qui, 'payload', 'md5.json'), JSON.stringify(md5, null, 1));
