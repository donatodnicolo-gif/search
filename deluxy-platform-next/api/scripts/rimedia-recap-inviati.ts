/**
 * RIMEDIO per i recap partiti col giro VECCHIO (prima del 03/09 17:48): la
 * mail è arrivata al valet ma stipendio e ricevuta non sono mai nati.
 * Qui si fa la parte mancante SENZA rimandare la mail: recap del periodo →
 * stipendio (SENT) → ricevuta «in attesa» con il recap su Drive attaccato.
 *
 * Usa i SERVIZI VERI dell'API (contesto NestJS): stessi conti, stessi
 * documenti — niente logica ricopiata. Idempotente: se per (valet, periodo)
 * uno stipendio esiste già, salta.
 *
 * Esecuzione: cd api && npx ts-node scripts/rimedia-recap-inviati.ts [--applica]
 */
import * as fs from 'node:fs';

async function main() {
  const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
    .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))!;
  const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
  u.searchParams.set('schema', 'platform');
  process.env.DATABASE_URL = u.toString();

  const APPLICA = process.argv.includes('--applica');
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { SalariesService } = await import('../src/salaries/salaries.module');
  const { SettingsService } = await import('../src/settings/settings.module');
  const { PrismaService } = await import('../src/prisma/prisma.service');
  const { SalaryStatus } = await import('../src/common/enums');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const salaries = app.get(SalariesService);
  const settings = app.get(SettingsService);
  const prisma = app.get(PrismaService);
  const admin = { role: 'ADMIN' } as any;

  // I periodi sono quelli delle MAIL GIÀ INVIATE (mail.Messaggio, 02–03/09):
  // il rimedio deve coprire esattamente ciò che il valet ha ricevuto.
  const CASI = [
    { cognome: 'Adonato', nome: 'Daniele', dal: '2026-09-02', al: '2026-09-02', nettoMail: 7.24 },
    { cognome: 'Bergamasco', nome: 'Leonardo', dal: '2026-08-11', al: '2026-08-30', nettoMail: null as number | null },
  ];

  for (const c of CASI) {
    const valet = await prisma.valet.findFirst({
      where: { lastName: c.cognome, firstName: c.nome, deleted: false },
      select: { id: true, lastName: true, firstName: true },
    });
    if (!valet) { console.log(`✗ ${c.cognome} ${c.nome}: valet non trovato`); continue; }

    const gia = await prisma.salary.findFirst({
      where: { valetId: valet.id, periodStart: new Date(c.dal), periodEnd: new Date(c.al) },
    });
    if (gia) { console.log(`· ${c.cognome}: stipendio ${c.dal}→${c.al} già presente (${gia.status}) — salto`); continue; }

    // Il recap PRIMA di generare: dopo, le consegne entrano nello stipendio
    // e il periodo risulterebbe vuoto.
    const r = await salaries.recap(admin, valet.id, c.dal, c.al);
    console.log(`\n${c.cognome} ${c.nome} · ${c.dal} → ${c.al} · consegne ${r.totali.consegne} · netto ${r.totali.netto} €`
      + (c.nettoMail != null ? ` (mail: ${c.nettoMail} €${Math.abs(r.totali.netto - c.nettoMail) < 0.005 ? ' ✓' : ' ⚠️ DIVERSO'})` : ''));

    if (!APPLICA) { console.log('  ANTEPRIMA: niente scritto.'); continue; }

    const stipendio = await salaries.generate(valet.id, c.dal, c.al);
    await salaries.updateStatus(stipendio.id, SalaryStatus.SENT);
    const extra: { valetId: string; amount: number; fileUrlFrom?: string } = { valetId: valet.id, amount: r.totali.netto };
    try {
      const chi = `${valet.lastName}-${valet.firstName}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      const su = await settings.caricaSuDrive(
        `recap-paghe-${chi}-${c.al}.html`, Buffer.from(salaries.recapHtml(r), 'utf8'), 'text/html',
      );
      if (su.ok && su.link) extra.fileUrlFrom = su.link;
    } catch { /* Drive è un di più */ }
    await prisma.receipt.updateMany({ where: { salaryId: stipendio.id }, data: extra });
    const ricevuta = await prisma.receipt.findFirst({ where: { salaryId: stipendio.id }, select: { number: true, fileUrlFrom: true } });
    console.log(`  ✓ stipendio ${stipendio.id} → SENT · ricevuta ${ricevuta?.number} in attesa` + (ricevuta?.fileUrlFrom ? ' · recap su Drive' : ' · SENZA recap (Drive)'));
  }

  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
