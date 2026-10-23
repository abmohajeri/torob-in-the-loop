/**
 * Leaflet implementation — loaded lazily through LazyMap (keeps ~150 KB of leaflet out of the initial bundle).
 * All markers are divIcons (HTML/CSS), so no default marker image paths are needed.
 */
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLng } from '@titl/shared';
import { useMeta } from '../../lib/queries.js';
import { cn } from '../../lib/cn.js';
import { DEFAULT_ATTRIBUTION, DEFAULT_TILE_URL, TEHRAN_CENTER, type LazyMapProps, type MapMarker } from './types.js';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function markerIcon(m: MapMarker): L.DivIcon {
  const kind = m.kind ?? 'shop';
  const sel = m.selected ? ' is-selected' : '';
  const dim = m.dimmed ? ' is-dimmed' : '';
  if (kind === 'price' && m.text) {
    return L.divIcon({
      className: 'bz-marker',
      html: `<span class="bz-pin-price${sel}${dim}">${esc(m.text)}</span>`,
      iconSize: undefined,
      iconAnchor: [0, 0],
    });
  }
  if (kind === 'stop') {
    return L.divIcon({
      className: 'bz-marker',
      html: `<span class="bz-pin-stop${sel}">${esc(m.text ?? '')}</span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }
  return L.divIcon({
    className: 'bz-marker',
    html: `<span class="bz-pin bz-pin-${kind}${sel}${dim}"><i></i></span>`,
    iconSize: [28, 36],
    iconAnchor: [14, 34],
  });
}

const userIcon = L.divIcon({ className: 'bz-marker', html: '<span class="bz-pin-user"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
const pickIcon = L.divIcon({
  className: 'bz-marker',
  html: '<span class="bz-pin bz-pin-pick"><i></i></span>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
});

function FitBounds({ points, fit }: { points: LatLng[]; fit: boolean }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
  useEffect(() => {
    if (!fit || points.length === 0) return;
    if (points.length === 1) {
      const p = points[0]!;
      map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15), { animate: false });
      return;
    }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [36, 36], maxZoom: 16, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fit, map]);
  return null;
}

function PickHandler({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export default function LeafletMap({
  markers = [],
  user,
  center,
  zoom,
  fit = true,
  onMarkerClick,
  onPick,
  picked,
  route,
  className,
  label = 'نقشه',
  interactive = true,
}: LazyMapProps) {
  const { data: meta } = useMeta();
  const tileUrl = meta?.map.tileUrl || DEFAULT_TILE_URL;
  const attribution = meta?.map.attribution || DEFAULT_ATTRIBUTION;
  const start = center ?? user ?? (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : (meta?.map.center ?? TEHRAN_CENTER));
  const points = useMemo(() => {
    const pts: LatLng[] = markers.map((m) => ({ lat: m.lat, lng: m.lng }));
    if (user) pts.push(user);
    return pts;
  }, [markers, user]);

  return (
    <div className={cn('relative isolate overflow-hidden rounded-2xl bg-sunken', className ?? 'h-64')} role="region" aria-label={label}>
      <MapContainer
        center={[start.lat, start.lng]}
        zoom={zoom ?? meta?.map.zoom ?? 13}
        className="bz-map size-full"
        zoomControl={interactive}
        dragging={interactive}
        scrollWheelZoom={false}
        attributionControl
      >
        <TileLayer url={tileUrl} attribution={attribution} />
        <FitBounds points={points} fit={fit && !onPick} />
        {route && route.length > 1 ? (
          <Polyline positions={route.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: '#047857', weight: 4, opacity: 0.8, dashArray: '2 8', lineCap: 'round' }} />
        ) : null}
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={markerIcon(m)}
            title={m.label}
            alt={m.label}
            zIndexOffset={m.selected ? 1000 : 0}
            eventHandlers={onMarkerClick ? { click: () => onMarkerClick(m) } : undefined}
          />
        ))}
        {user ? <Marker position={[user.lat, user.lng]} icon={userIcon} title="موقعیت شما" alt="موقعیت شما" interactive={false} /> : null}
        {onPick ? <PickHandler onPick={onPick} /> : null}
        {picked ? <Marker position={[picked.lat, picked.lng]} icon={pickIcon} title="نقطه انتخابی" alt="نقطه انتخابی" interactive={false} /> : null}
      </MapContainer>
    </div>
  );
}
