import { Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ⭐ 11/09/2026 (segnalazione utente: «nei margini manca il vero totale pagato dal
 * cliente») — LA LETTURA DEGLI ORDINI DA DELUXY ORDERS, in un posto solo.
 *
 * Orders è la casa dell'ordine (Standard §7): il totale pagato dal cliente, la salute,
 * lo stato di lavorazione. Qui non si copia niente: si legge dal vivo con una cache di
 * 2′ in memoria, la stessa che `SalesService` usava per la colonna «Orders» in Vendite —
 * spostata qui perché ora la leggono anche le Consegne (margini della vendita).
 *
 * `Sale.amount` è la RIGA di prodotto (10 €); il cliente per l'ordine #12913 ha pagato
 * 25 € (prodotto + consegna). Il margine si fa su quello che è entrato davvero.
 */
export type OrdineLetto = {
  /** id in Orders (cuid) e numero Shopify (es. «12913», senza #). */
  id: string | null; numero: string | null;
  /** Il totale pagato dal cliente, IVA inclusa, come sta in Orders. */
  totale: number | null;
  /** ⭐ 04/09: la salute — conforme | a_rischio | non_pagato | cancellato | nullo. */
  salute: string | null;
  stato: string | null; terminale: boolean | null;
  smistamento: string | null; evasione: string | null;
  fulfillmentStatus: string | null; consegnataIl: string | null; annullato: unknown;
};

@Injectable()
export class OrdersClientService {
  private cache: { quando: number; da: string; mappa: Map<string, OrdineLetto> } | null = null;
  private singoli = new Map<string, { quando: number; ordine: OrdineLetto | null }>();

  constructor(private readonly prisma: PrismaService) {}

  /** «gid://shopify/Order/123» → «123»; altro → null. */
  static numeroShopify(v?: string | null): string | null {
    const t = (v ?? '').trim();
    if (!t) return null;
    const coda = t.split('/').pop() ?? '';
    return /^\d+$/.test(coda) ? coda : null;
  }

  /** Le chiavi con cui un ordine si cerca nella mappa: id di Orders, gid Shopify, numero. */
  static chiavi(externalOrderId?: string | null, externalOrderNumber?: string | null): string[] {
    const grezzo = (externalOrderId ?? '').trim();
    const gid = OrdersClientService.numeroShopify(externalOrderId);
    const numero = String(externalOrderNumber ?? '').replace(/\D/g, '');
    return [grezzo, gid ?? '', numero ? `n:${numero}` : ''].filter(Boolean);
  }

  private async config() {
    const cfg = await this.prisma.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } });
    const map = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
    return {
      url: (map['ordersUrl'] || process.env.ORDERS_URL || '').replace(/\/+$/, ''),
      chiave: map['ordersApiKey'] || process.env.ORDERS_API_KEY || '',
    };
  }

  private static leggi(o: any): OrdineLetto {
    return {
      id: typeof o?.id === 'string' ? o.id : null,
      numero: String(o?.numero ?? '').replace(/\D/g, '') || null,
      totale: typeof o?.totale === 'number' && Number.isFinite(o.totale) ? o.totale : null,
      salute: typeof o?.salute === 'string' ? o.salute : (o?.salute?.chiave ?? null),
      stato: o?.classificazione?.stato?.chiave ?? null,
      terminale: o?.classificazione?.stato?.terminale ?? null,
      smistamento: o?.smistamento ?? null,
      evasione: o?.evasione ?? null,
      fulfillmentStatus: o?.fulfillmentStatus ?? null,
      consegnataIl: o?.consegnata?.il ?? null,
      annullato: o?.annullato ?? o?.cancelledAt ?? null,
    };
  }

  /**
   * Tutti gli ordini da una data (al massimo 120 giorni indietro, 25 pagine da 200),
   * in una mappa per id, per numero Shopify del gid e per numero d'ordine («n:12913»).
   * Cache di 2′: la lista Vendite si aggiorna da sola ogni 30″ e Orders non va
   * interrogato a ogni giro. Best-effort: senza Orders torna vuota.
   */
  async mappa(daData: Date): Promise<Map<string, OrdineLetto>> {
    const limite = new Date(); limite.setDate(limite.getDate() - 120);
    const da = (daData < limite ? limite : daData).toISOString().slice(0, 10);
    const adesso = Date.now();
    if (this.cache && this.cache.da <= da && adesso - this.cache.quando < 120_000) return this.cache.mappa;
    const { url, chiave } = await this.config();
    const mappa = new Map<string, OrdineLetto>();
    if (!url || !chiave) return mappa;
    try {
      for (let pagina = 1; pagina <= 25; pagina++) {
        const q = new URLSearchParams({ page: String(pagina), limit: '200', da, annullati: 'inclusi' });
        const res = await fetch(`${url}/api/v1/ordini?${q}`, { headers: { 'x-api-key': chiave } });
        if (!res.ok) break;
        const body = (await res.json()) as { ordini?: any[]; pagine?: number };
        for (const o of body.ordini ?? []) {
          const dati = OrdersClientService.leggi(o);
          const gid = OrdersClientService.numeroShopify(o?.orderId);
          if (!dati.id && !gid && !dati.numero) continue;
          if (dati.id) mappa.set(dati.id, dati);
          if (gid) mappa.set(gid, dati);
          if (dati.numero) mappa.set(`n:${dati.numero}`, dati);
        }
        if (!(body.ordini ?? []).length || pagina >= (body.pagine ?? 1)) break;
      }
      this.cache = { quando: adesso, da, mappa };
    } catch (e) {
      console.error('orders-client:', (e as Error).message);
    }
    return mappa;
  }

  /**
   * UN ordine, per una vendita: prima dalla mappa (finestra dalla data della vendita), poi
   * — se manca ed è un id di Orders — con la rotta del singolo (cache di 2′ per id).
   */
  async perVendita(v: { externalOrderId?: string | null; externalOrderNumber?: string | null; createdAt?: Date | null }): Promise<OrdineLetto | null> {
    const chiavi = OrdersClientService.chiavi(v.externalOrderId, v.externalOrderNumber);
    if (!chiavi.length) return null;
    const mappa = await this.mappa(v.createdAt ?? new Date());
    for (const k of chiavi) { const o = mappa.get(k); if (o) return o; }
    const id = (v.externalOrderId ?? '').trim();
    if (!/^c[a-z0-9]{20,}$/.test(id)) return null;
    const gia = this.singoli.get(id);
    if (gia && Date.now() - gia.quando < 120_000) return gia.ordine;
    const { url, chiave } = await this.config();
    if (!url || !chiave) return null;
    try {
      const res = await fetch(`${url}/api/v1/ordini/${encodeURIComponent(id)}?annullati=inclusi&prove=incluse`, { headers: { 'x-api-key': chiave } });
      const ordine = res.ok ? OrdersClientService.leggi(await res.json()) : null;
      this.singoli.set(id, { quando: Date.now(), ordine });
      return ordine;
    } catch {
      return null;
    }
  }
}

@Module({ providers: [OrdersClientService], exports: [OrdersClientService] })
export class OrdersClientModule {}
