import { signal } from '@angular/core';

/**
 * Stato tabella lato client per le liste piccole (partner, valet, categorie,
 * servizi, operatori): ricerca globale su tutti i campi testuali + ordinamento
 * per colonna, asc/desc.
 *
 * Le liste grandi (prodotti, consegne, clienti) usano invece il contratto
 * server-side in `api/src/common/list-query.ts`, perche' con migliaia di record
 * non si puo' scaricare tutto nel browser.
 */
export class ClientTable<T> {
  /** Testo della ricerca globale. */
  readonly query = signal('');
  /** Campo di ordinamento corrente. */
  readonly sort = signal<string>('');
  readonly dir = signal<'asc' | 'desc'>('asc');

  /**
   * @param searchFields percorsi dei campi testuali cercati da `query`
   *   (supporta "relazione.campo" e gli array, es. "provinces.province.code")
   * @param defaultSort campo di ordinamento iniziale
   */
  constructor(
    private readonly searchFields: string[],
    defaultSort = '',
  ) {
    this.sort.set(defaultSort);
  }

  /** Click sull'intestazione: stesso campo inverte il verso, altrimenti asc. */
  sortBy(field: string): void {
    if (this.sort() === field) {
      this.dir.set(this.dir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sort.set(field);
      this.dir.set('asc');
    }
  }

  /** Freccia da mostrare nell'intestazione (vuota se non e' il campo ordinato). */
  indicator(field: string): string {
    if (this.sort() !== field) return '';
    return this.dir() === 'asc' ? ' ↑' : ' ↓';
  }

  /** Lista filtrata e ordinata, da usare dentro un `computed`. */
  view(items: T[]): T[] {
    return this.sortItems(this.filterItems(items));
  }

  private filterItems(items: T[]): T[] {
    const q = this.query().trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      this.searchFields.some((field) =>
        valuesAtPath(item, field).some((v) => v.toLowerCase().includes(q)),
      ),
    );
  }

  private sortItems(items: T[]): T[] {
    const field = this.sort();
    if (!field) return items;
    const sign = this.dir() === 'asc' ? 1 : -1;
    // copia: non mutare l'array del signal di origine
    return [...items].sort((a, b) => sign * compare(valueAtPath(a, field), valueAtPath(b, field)));
  }
}

/** Confronto null-safe: i vuoti vanno in fondo; numeri come numeri, testo con localeCompare. */
function compare(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? -1 : 1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** Valore singolo a un percorso "a.b.c" (per l'ordinamento). */
function valueAtPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/**
 * Tutti i valori testuali a un percorso (per la ricerca): attraversa anche gli
 * array, cosi' "provinces.province.code" cerca in tutte le province.
 */
function valuesAtPath(obj: unknown, path: string): string[] {
  const keys = path.split('.');
  let current: unknown[] = [obj];
  for (const key of keys) {
    const next: unknown[] = [];
    for (const node of current) {
      if (node === null || node === undefined) continue;
      const value = (node as Record<string, unknown>)[key];
      if (Array.isArray(value)) next.push(...value);
      else if (value !== null && value !== undefined) next.push(value);
    }
    current = next;
  }
  return current
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .map((v) => String(v));
}
