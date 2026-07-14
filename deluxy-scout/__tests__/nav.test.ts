import { MAX_WAYPOINTS, urlNavigazione, urlNavigazioneGiro } from '@/lib/nav';
import type { Coord } from '@/lib/location';

const c = (lat: number, lng: number): Coord => ({ lat, lng });

describe('urlNavigazione (destinazione singola)', () => {
  it('costruisce l’URL con destinazione e modalità guida', () => {
    const u = urlNavigazione(c(45.46, 9.19));
    expect(u).toContain('destination=45.46,9.19');
    expect(u).toContain('travelmode=driving');
    expect(u).not.toContain('origin=');
  });

  it('include l’origine quando fornita', () => {
    const u = urlNavigazione(c(45.46, 9.19), c(45.5, 9.2));
    expect(u).toContain('origin=45.5,9.2');
    expect(u).toContain('destination=45.46,9.19');
  });
});

describe('urlNavigazioneGiro (percorso multi-tappa)', () => {
  it('ritorna null senza tappe', () => {
    expect(urlNavigazioneGiro(c(45.46, 9.19), [])).toBeNull();
  });

  it('una sola tappa → è la destinazione, nessun waypoint', () => {
    const r = urlNavigazioneGiro(c(45.5, 9.2), [c(45.46, 9.19)])!;
    expect(r.url).toContain('origin=45.5,9.2');
    expect(r.url).toContain('destination=45.46,9.19');
    expect(r.url).not.toContain('waypoints=');
    expect(r.tappeIncluse).toBe(1);
    expect(r.troncato).toBe(false);
  });

  it('più tappe → ultima è destinazione, le altre waypoint codificati con %7C', () => {
    const r = urlNavigazioneGiro(null, [c(1, 1), c(2, 2), c(3, 3)])!;
    expect(r.url).toContain('destination=3,3');
    expect(r.url).toContain('waypoints=1,1%7C2,2');
    expect(r.url).not.toContain('origin=');
    expect(r.troncato).toBe(false);
  });

  it('tronca oltre il limite di Google e lo segnala', () => {
    const tappe = Array.from({ length: MAX_WAYPOINTS + 5 }, (_, i) => c(i, i));
    const r = urlNavigazioneGiro(c(0, 0), tappe)!;
    // Massimo: MAX_WAYPOINTS waypoint + 1 destinazione.
    expect(r.tappeIncluse).toBe(MAX_WAYPOINTS + 1);
    expect(r.troncato).toBe(true);
  });
});
