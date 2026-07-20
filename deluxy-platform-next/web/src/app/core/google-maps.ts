/**
 * Caricamento una sola volta dello script Google Maps JS, condiviso da chi ne ha
 * bisogno (mappa consegne, autocomplete indirizzi). Include SEMPRE la libreria
 * `places`, così un solo script serve tutti gli usi. La chiave è quella "browser"
 * (per natura pubblica) presa da GET /settings/public.
 */
declare const google: any;

let mapsScriptPromise: Promise<void> | null = null;

export function loadGoogleMaps(key: string): Promise<void> {
  if (typeof google !== 'undefined' && google?.maps?.places) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;
  mapsScriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src =
      'https://maps.googleapis.com/maps/api/js?libraries=places&language=it&region=IT&key=' +
      encodeURIComponent(key);
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      mapsScriptPromise = null;
      reject(new Error('maps-load-failed'));
    };
    document.head.appendChild(s);
  });
  return mapsScriptPromise;
}
