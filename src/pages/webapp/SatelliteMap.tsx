import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface SatelliteMapProps {
  lat:          number;
  lng:          number;
  coordinates?: number[] | number[][];
  className?:   string;
}

export default function SatelliteMap({ lat, lng, coordinates, className }: SatelliteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const isPolygon =
      Array.isArray(coordinates) &&
      coordinates.length > 1 &&
      Array.isArray(coordinates[0]);

    const map = L.map(containerRef.current, {
      center:            [lat, lng],
      zoom:              16,
      zoomControl:       false,
      scrollWheelZoom:   false,
      dragging:          false,
      doubleClickZoom:   false,
      touchZoom:         false,
      keyboard:          false,
      attributionControl: false,
    });

    // Esri World Imagery — free satellite tiles, no API key
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 },
    ).addTo(map);

    if (isPolygon && coordinates) {
      const points = (coordinates as number[][]).map(p => [p[0], p[1]] as [number, number]);
      const poly = L.polygon(points, {
        color:       'var(--land-boundary-color, #fde047)',
        weight:      3,
        fillColor:   'var(--land-boundary-fill, #fef9c3)',
        fillOpacity: 0.28,
      }).addTo(map);
      map.fitBounds(poly.getBounds(), { padding: [14, 14] });
    } else {
      const dot = L.divIcon({
        html: `<div style="width:14px;height:14px;background:#10b981;border:2.5px solid #fff;border-radius:50%;box-shadow:0 1px 6px rgba(0,0,0,0.55)"></div>`,
        iconSize:   [14, 14],
        iconAnchor: [7, 7],
        className:  '',
      });
      L.marker([lat, lng], { icon: dot }).addTo(map);
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, coordinates]);

  return <div ref={containerRef} className={className} />;
}
