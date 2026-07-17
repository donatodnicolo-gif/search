import { HttpClient, HttpParams } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { loadGoogleMaps } from '../core/google-maps';
import { DELIVERY_STATUS_LABELS } from '../core/models';

declare const google: any;

interface MapPoint {
  id: string;
  code: number;
  status: string;
  date: string;
  latitude: number;
  longitude: number;
  recipientFirstName: string;
  recipientLastName: string;
  recipientAddress: string;
  deliveryTimeFrom?: string | null;
  deliveryTimeTo?: string | null;
  partner?: { insegna: string } | null;
  valet?: { firstName: string; lastName: string } | null;
}

/** Colore del pin per stato (allineato alla legenda della lista consegne). */
const STATUS_COLOR: Record<string, string> = {
  created: '#d70015',
  assigned: '#e6b800',
  in_preparation: '#ff9500',
  accepted: '#007aff',
  in_delivery: '#af52de',
  cancellation_requested: '#5ac8fa',
  delivered: '#248a3d',
  delivered_time_approved: '#248a3d',
  not_delivered: '#8a8a8e',
  not_accepted: '#8a8a8e',
  cancelled: '#8a8a8e',
  delivered_time_not_approved: '#8a8a8e',
};

// Caricamento opzionale del clusterer (degrada a marker singoli se non disponibile).
let clustererScriptPromise: Promise<boolean> | null = null;
function loadClusterer(): Promise<boolean> {
  if ((window as any).markerClusterer?.MarkerClusterer) return Promise.resolve(true);
  if (clustererScriptPromise) return clustererScriptPromise;
  clustererScriptPromise = new Promise<boolean>((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js';
    s.async = true;
    s.onload = () => resolve(!!(window as any).markerClusterer?.MarkerClusterer);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return clustererScriptPromise;
}

/**
 * Mappa Google delle consegne con i puntatori dei luoghi di consegna.
 * Carica lo script pigramente, prende i punti da GET /deliveries/map (con gli
 * stessi filtri della lista) e colora i pin per stato. Solo Admin/Operation.
 */
@Component({
  selector: 'app-delivery-map',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  template: `
    <div class="map-shell card">
      <div #mapEl class="map"></div>
      @if (state() !== 'ready') {
        <div class="overlay">
          @switch (state()) {
            @case ('loading') { <span class="muted">{{ 'deliveries.map.loading' | translate }}</span> }
            @case ('no-key') {
              <span class="muted">{{ 'deliveries.map.noKey' | translate }}</span>
              <a class="btn btn-secondary" routerLink="/settings">{{ 'deliveries.map.goToSettings' | translate }}</a>
            }
            @case ('no-points') { <span class="muted">{{ 'deliveries.map.noPoints' | translate }}</span> }
            @case ('error') { <span class="muted">{{ 'deliveries.map.error' | translate }}</span> }
          }
        </div>
      }
      @if (capped()) { <div class="cap-note">{{ 'deliveries.map.capped' | translate }}</div> }
    </div>
  `,
  styles: [
    `
      .map-shell { position: relative; padding: 0; overflow: hidden; height: 460px; margin-bottom: 18px; }
      .map { width: 100%; height: 100%; }
      .overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: var(--surface); text-align: center; padding: 24px; }
      .muted { color: var(--text-secondary); font-size: 14px; max-width: 420px; }
      .btn { text-decoration: none; }
      .cap-note { position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.65); color: #fff; font-size: 11.5px; padding: 4px 9px; border-radius: 8px; }
    `,
  ],
})
export class DeliveryMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly http = inject(HttpClient);
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;

  /** Filtri passati dalla lista consegne. */
  @Input() status = '';
  @Input() date = '';

  readonly state = signal<'loading' | 'ready' | 'no-key' | 'no-points' | 'error'>('loading');
  readonly capped = signal(false);

  private map: any = null;
  private markers: any[] = [];
  private cluster: any = null;
  private info: any = null;
  private ready = false;

  ngAfterViewInit(): void {
    this.init();
  }

  ngOnChanges(): void {
    // Al cambio filtri, se la mappa è pronta ricarica solo i punti.
    if (this.ready) this.loadPoints();
  }

  ngOnDestroy(): void {
    this.clearMarkers();
  }

  private async init(): Promise<void> {
    this.state.set('loading');
    try {
      const cfg = await this.http
        .get<{ googleMapsBrowserKey: string | null }>(`${environment.apiUrl}/settings/public`)
        .toPromise();
      const key = cfg?.googleMapsBrowserKey;
      if (!key) { this.state.set('no-key'); return; }
      await loadGoogleMaps(key);
      this.map = new google.maps.Map(this.mapEl.nativeElement, {
        center: { lat: 45.4642, lng: 9.19 }, // Milano
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
      this.info = new google.maps.InfoWindow();
      this.ready = true;
      await this.loadPoints();
    } catch {
      this.state.set('error');
    }
  }

  private loadPoints(): void {
    let params = new HttpParams();
    if (this.status) params = params.set('status', this.status);
    if (this.date) params = params.set('date', this.date);
    this.http
      .get<{ points: MapPoint[]; capped: boolean }>(`${environment.apiUrl}/deliveries/map`, { params })
      .subscribe({
        next: (res) => this.render(res.points ?? [], res.capped),
        error: () => this.state.set('error'),
      });
  }

  private render(points: MapPoint[], capped: boolean): void {
    this.clearMarkers();
    this.capped.set(capped);
    if (!points.length) { this.state.set('no-points'); return; }
    this.state.set('ready');

    const bounds = new google.maps.LatLngBounds();
    for (const p of points) {
      const position = { lat: p.latitude, lng: p.longitude };
      const marker = new google.maps.Marker({
        position,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: STATUS_COLOR[p.status] ?? '#8a8a8e',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
        title: `#${p.code} ${p.recipientLastName} ${p.recipientFirstName}`,
      });
      marker.addListener('click', () => {
        this.info.setContent(this.popupHtml(p));
        this.info.open(this.map, marker);
      });
      this.markers.push(marker);
      bounds.extend(position);
    }

    loadClusterer().then((ok) => {
      if (ok && (window as any).markerClusterer?.MarkerClusterer) {
        this.cluster = new (window as any).markerClusterer.MarkerClusterer({ map: this.map, markers: this.markers });
      } else {
        this.markers.forEach((m) => m.setMap(this.map));
      }
    });

    this.map.fitBounds(bounds);
    if (points.length === 1) this.map.setZoom(14);
  }

  private popupHtml(p: MapPoint): string {
    const esc = (s: string) => (s ?? '').replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const statusLabel = DELIVERY_STATUS_LABELS[p.status] ?? p.status;
    const slot = p.deliveryTimeFrom ? `${p.deliveryTimeFrom}${p.deliveryTimeTo ? '–' + p.deliveryTimeTo : ''}` : '—';
    const valet = p.valet ? `${esc(p.valet.lastName)} ${esc(p.valet.firstName)}` : '—';
    return `
      <div style="font-family:inherit;min-width:200px;max-width:260px">
        <div style="font-weight:600;margin-bottom:4px">#${p.code} · ${esc(statusLabel)}</div>
        <div style="font-size:13px">${esc(p.recipientLastName)} ${esc(p.recipientFirstName)}</div>
        <div style="font-size:12.5px;color:#666">${esc(p.recipientAddress)}</div>
        <div style="font-size:12.5px;color:#666;margin-top:4px">Consegna: ${esc(slot)} · Valet: ${valet}</div>
        <div style="font-size:12.5px;color:#666">Partner: ${esc(p.partner?.insegna ?? '—')}</div>
        <a href="/deliveries/${p.id}" style="display:inline-block;margin-top:8px;font-size:13px;font-weight:600;color:#000">Apri scheda →</a>
      </div>`;
  }

  private clearMarkers(): void {
    if (this.cluster) { this.cluster.clearMarkers?.(); this.cluster = null; }
    this.markers.forEach((m) => m.setMap(null));
    this.markers = [];
  }
}
