/**
 * Seed dati demo per Deluxy Platform.
 * Esegui con: npm run seed -w api  (oppure `npx prisma db seed` da api/)
 *
 * Credenziali demo (password per tutti: Deluxy2026!):
 *   admin@deluxy.it        ADMIN (support: vede Finanza)
 *   operation@deluxy.it    OPERATION
 *   fioraio@deluxy.it      PARTNER (Fioraio Milano Centro)
 *   pasticceria@deluxy.it  PARTNER (Pasticceria Brera)
 *   valet1@deluxy.it       VALET (team leader)
 *   valet2@deluxy.it       VALET
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Setup prenotazione demo del servizio a prezzo fisso
const bookingSetup = {
  noticeDays: 1, // consegna prenotabile da domani
  slotHours: 2, // fasce di 2 ore
  minOrderTime: '08:00', // prima fascia dalle 08:00
  maxOrderTime: '20:00', // ultima fascia entro le 20:00
  allowFlexibleTime: true, // consente la fascia di consegna flessibile
};

async function main() {
  // Idempotenza: se i dati demo esistono gia', non duplicare
  if ((await prisma.delivery.count()) > 0) {
    // ...ma allinea comunque il setup prenotazione demo (campi aggiunti dopo il primo seed)
    await prisma.serviceType.updateMany({ where: { code: 'CONSEGNA_FISSA' }, data: bookingSetup });
    console.log('Seed gia eseguito (esistono consegne): aggiornato solo il setup prenotazione demo.');
    return;
  }

  const passwordHash = await bcrypt.hash('Deluxy2026!', 10);

  // ---- Province e citta ----
  const milano = await prisma.province.upsert({
    where: { code: 'MI' },
    update: {},
    create: {
      name: 'Milano',
      code: 'MI',
      cities: { create: [{ name: 'Milano' }, { name: 'Sesto San Giovanni' }] },
    },
  });
  const monza = await prisma.province.upsert({
    where: { code: 'MB' },
    update: {},
    create: {
      name: 'Monza e Brianza',
      code: 'MB',
      cities: { create: [{ name: 'Monza' }] },
    },
  });

  // ---- Tipi di servizio ----
  const prezzoFisso = await prisma.serviceType.upsert({
    where: { code: 'CONSEGNA_FISSA' },
    update: bookingSetup,
    create: {
      name: 'Consegna prezzo fisso',
      code: 'CONSEGNA_FISSA',
      pricingModel: 'PREZZO_FISSO',
      basePrice: 25,
      ...bookingSetup,
    },
  });
  const aOra = await prisma.serviceType.upsert({
    where: { code: 'SERVIZIO_ORARIO' },
    update: {},
    create: {
      name: 'Servizio a ora',
      code: 'SERVIZIO_ORARIO',
      pricingModel: 'A_ORA',
      basePrice: 35,
      minHours: 1,
    },
  });
  await prisma.serviceType.upsert({
    where: { code: 'VENDITA' },
    update: {},
    create: { name: 'Vendita', code: 'VENDITA', pricingModel: 'VENDITA' },
  });
  await prisma.serviceType.upsert({
    where: { code: 'CORPORATE' },
    update: {},
    create: { name: 'Corporate', code: 'CORPORATE', pricingModel: 'CORPORATE', basePrice: 40 },
  });
  await prisma.serviceType.upsert({
    where: { code: 'MAGAZZINO' },
    update: {},
    create: {
      name: 'Magazzino',
      code: 'MAGAZZINO',
      pricingModel: 'MAGAZZINO',
      basePrice: 15,
      perPiecePrice: 2,
      transportPrice: 10,
    },
  });

  // ---- Categorie ----
  const fiori = await prisma.category.upsert({
    where: { name: 'Fiori' },
    update: {},
    create: { name: 'Fiori' },
  });
  const torte = await prisma.category.upsert({
    where: { name: 'Torte' },
    update: {},
    create: { name: 'Torte' },
  });

  const weekOpeningHours = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    openTime: '09:00',
    closeTime: '19:30',
  }));

  // ---- Partner 1: fioraio ----
  const fioraio = await prisma.partner.upsert({
    where: { email: 'shop@fioraiomilano.it' },
    update: {},
    create: {
      insegna: 'Fioraio Milano Centro',
      businessName: 'Fioraio Milano Centro S.r.l.',
      email: 'shop@fioraiomilano.it',
      vatNumber: 'IT01234567890',
      address: 'Via Montenapoleone 10, Milano',
      phone: '+39 02 1234567',
      contactName: 'Giulia Verdi',
      invoicingEnabled: true,
      invoiceEmail: 'fatture@fioraiomilano.it',
      smsTemplatesEnabled: true,
      woocommerceApiKey: 'demo-woo-key-fioraio-001',
      provinces: { create: [{ provinceId: milano.id }] },
      categories: { create: [{ categoryId: fiori.id, priority: 0 }] },
      services: {
        create: [
          {
            serviceTypeId: prezzoFisso.id,
            price: 29,
            includedKm: 10,
            extraKmPrice: 1.5,
            extraOutOfCityPrice: 10,
          },
        ],
      },
      openingHours: {
        create: [...weekOpeningHours, { dayOfWeek: 0, closed: true }],
      },
    },
  });

  // ---- Partner 2: pasticceria ----
  const pasticceria = await prisma.partner.upsert({
    where: { email: 'info@pasticceriabrera.it' },
    update: {},
    create: {
      insegna: 'Pasticceria Brera',
      businessName: 'Dolci Brera S.n.c.',
      email: 'info@pasticceriabrera.it',
      vatNumber: 'IT09876543210',
      address: 'Via Brera 22, Milano',
      phone: '+39 02 7654321',
      contactName: 'Marco Bianchi',
      provinces: { create: [{ provinceId: milano.id }, { provinceId: monza.id }] },
      categories: { create: [{ categoryId: torte.id, priority: 0 }] },
      services: {
        create: [
          {
            serviceTypeId: prezzoFisso.id,
            price: 32,
            includedKm: 12,
            extraKmPrice: 1.8,
            extraOutOfCityPrice: 12,
          },
        ],
      },
      openingHours: { create: weekOpeningHours },
    },
  });

  // ---- Valet 1 (team leader, con P.IVA) ----
  const valet1 = await prisma.valet.upsert({
    where: { email: 'luca.rossi@deluxy.it' },
    update: {},
    create: {
      firstName: 'Luca',
      lastName: 'Rossi',
      email: 'luca.rossi@deluxy.it',
      phone: '+39 333 1112223',
      hasVat: true,
      vatNumber: 'IT11122233344',
      fiscalCode: 'RSSLCU95A01F205X',
      birthPlace: 'Milano',
      birthDate: new Date('1995-01-01'),
      iban: 'IT60X0542811101000000123456',
      isTeamLeader: true,
      vehicle: 'Furgone',
      withholdingPercent: 0,
      provinces: { create: [{ provinceId: milano.id }, { provinceId: monza.id }] },
      services: {
        create: [
          { serviceTypeId: prezzoFisso.id, salary: 12 },
          { serviceTypeId: aOra.id, salary: 15 },
        ],
      },
    },
  });

  // ---- Valet 2 (senza P.IVA: ricevuta con ritenuta) ----
  const valet2 = await prisma.valet.upsert({
    where: { email: 'sara.neri@deluxy.it' },
    update: {},
    create: {
      firstName: 'Sara',
      lastName: 'Neri',
      email: 'sara.neri@deluxy.it',
      phone: '+39 333 4445556',
      hasVat: false,
      fiscalCode: 'NRESRA98B41F205Y',
      vehicle: 'Scooter',
      withholdingPercent: 20,
      notifyByWhatsapp: true,
      provinces: { create: [{ provinceId: milano.id }] },
      services: { create: [{ serviceTypeId: prezzoFisso.id, salary: 10 }] },
    },
  });

  // ---- Utenti ----
  const upsertUser = (email: string, data: any) =>
    prisma.user.upsert({ where: { email }, update: {}, create: { email, passwordHash, ...data } });

  await upsertUser('admin@deluxy.it', {
    firstName: 'Ada',
    lastName: 'Admin',
    role: 'ADMIN',
    isSupport: true,
  });
  await upsertUser('operation@deluxy.it', {
    firstName: 'Olga',
    lastName: 'Operation',
    role: 'OPERATION',
  });
  await upsertUser('fioraio@deluxy.it', {
    firstName: 'Giulia',
    lastName: 'Verdi',
    role: 'PARTNER',
    partnerId: fioraio.id,
  });
  await upsertUser('pasticceria@deluxy.it', {
    firstName: 'Marco',
    lastName: 'Bianchi',
    role: 'PARTNER',
    partnerId: pasticceria.id,
  });
  await upsertUser('valet1@deluxy.it', {
    firstName: 'Luca',
    lastName: 'Rossi',
    role: 'VALET',
    valetId: valet1.id,
  });
  await upsertUser('valet2@deluxy.it', {
    firstName: 'Sara',
    lastName: 'Neri',
    role: 'VALET',
    valetId: valet2.id,
  });

  // ---- Prodotti ----
  const bouquet = await prisma.product.create({
    data: {
      name: 'Bouquet Rose Rosse Deluxe',
      description: '24 rose rosse con confezione di lusso',
      price: 95,
      type: 'NON_UNICO',
      partnerId: fioraio.id,
      categoryId: fiori.id,
      visibleToOtherPartners: true,
      fields: {
        create: [
          { name: 'Messaggio sul biglietto', required: true },
          { name: 'Note di confezionamento', required: false },
          { name: 'Costo interno fornitore', required: false, adminOnly: true },
        ],
      },
    },
  });
  const torta = await prisma.product.create({
    data: {
      name: 'Torta CakeDesign personalizzata',
      description: 'Torta artigianale a tema, 12 porzioni',
      price: 120,
      type: 'UNICO',
      partnerId: pasticceria.id,
      categoryId: torte.id,
      fields: {
        create: [{ name: 'Scritta sulla torta', required: true }],
      },
    },
  });
  // Superprodotto: combinazione bouquet + torta
  await prisma.product.create({
    data: {
      name: 'Box Compleanno Deluxe (fiori + torta)',
      description: 'Combinazione bouquet e torta personalizzata',
      price: 199,
      type: 'SUPERPRODOTTO',
      categoryId: torte.id,
      components: {
        create: [
          { componentProductId: bouquet.id, quantity: 1 },
          { componentProductId: torta.id, quantity: 1 },
        ],
      },
    },
  });

  // ---- Cliente ----
  const customer = await prisma.customer.create({
    data: {
      firstName: 'Francesca',
      lastName: 'Colombo',
      email: 'francesca.colombo@example.com',
      phone: '+39 340 9998887',
      address: 'Corso Como 5, Milano',
      partnerId: fioraio.id,
    },
  });

  // ---- Consegna demo (genera attivita ritiro+consegna e log) ----
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  await prisma.delivery.create({
    data: {
      code: 1,
      date: tomorrow,
      serviceTypeId: prezzoFisso.id,
      partnerId: fioraio.id,
      valetId: valet1.id,
      customerId: customer.id,
      status: 'assigned',
      // Fascia di consegna (setup servizio: fasce di 2h tra 08:00 e 20:00)
      deliveryTimeFrom: '14:00',
      deliveryTimeTo: '16:00',
      deliveryFlexible: false,
      pickupTimeFrom: '10:00',
      pickupTimeTo: '12:00',
      pickupFlexible: false,
      pickupAddress: 'Via Montenapoleone 10, Milano',
      recipientFirstName: 'Francesca',
      recipientLastName: 'Colombo',
      recipientAddress: 'Corso Como 5, Milano',
      recipientIntercom: 'Colombo - int. 7',
      recipientPhone: '+39 340 9998887',
      paymentOnDelivery: true,
      paymentAmount: 95,
      notes: 'Suonare al citofono, consegna in guanti bianchi',
      internalNotes: 'Cliente VIP: massima cura nella presentazione',
      ddtNumber: 'DDT-2026-0001',
      distanceKm: 3.2,
      price: 29,
      valetSalary: 12,
      smsOnCreated: true,
      smsOnDeparted: true,
      smsOnArrived: true,
      products: {
        create: [
          {
            productId: bouquet.id,
            quantity: 1,
            fieldValues: JSON.stringify({ 'Messaggio sul biglietto': 'Buon compleanno!' }),
          },
        ],
      },
      activities: {
        create: [
          {
            type: 'PICKUP',
            valetId: valet1.id,
            timeFrom: '10:00',
            timeTo: '12:00',
            address: 'Via Montenapoleone 10, Milano',
            scheduledAt: tomorrow,
            sortOrder: 0,
          },
          {
            type: 'DELIVERY',
            valetId: valet1.id,
            address: 'Corso Como 5, Milano',
            scheduledAt: tomorrow,
            sortOrder: 1,
          },
        ],
      },
      logs: {
        create: [
          { type: 'created', message: 'Consegna inserita (seed demo)' },
          { type: 'status_change', message: 'Assegnata al valet Luca Rossi' },
        ],
      },
    },
  });

  // ---- Modelli SMS per brand ----
  const smsTemplates = [
    { brand: 'DELUXY', trigger: 'CREATED', name: 'Deluxy - creata', text: 'La tua consegna Deluxy e stata programmata.' },
    { brand: 'DELUXY', trigger: 'DEPARTED', name: 'Deluxy - partita', text: 'Il tuo valet Deluxy e in arrivo con la tua consegna.' },
    { brand: 'DELUXY', trigger: 'ARRIVED', name: 'Deluxy - arrivata', text: 'La tua consegna Deluxy e arrivata a destinazione.' },
    { brand: 'DELUXY_FLOWERS', trigger: 'DEPARTED', name: 'DeluxyFlowers - partita', text: 'I tuoi fiori DeluxyFlowers sono in viaggio.' },
    { brand: 'CAKEDESIGN_ME', trigger: 'DEPARTED', name: 'CakeDesign.Me - partita', text: 'La tua torta CakeDesign.Me e in consegna.' },
  ];
  for (const t of smsTemplates) {
    await prisma.smsTemplate.create({ data: t });
  }

  console.log('Seed completato: utenti, partner, valet, prodotti, consegna demo creati.');
  console.log('Login demo: admin@deluxy.it / Deluxy2026!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
