import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Crosshair, Layers3, LocateFixed, MapPin, PencilRuler, Ruler, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import getBaseUrl from "@/lib/config";
import PremiumPlotterModal, { type PlottedFeature } from "@/components/farm/PremiumPlotterModal";

type LandMapping = {
  id: string;
  supervisorId: string;
  supervisorName: string;
  farmerName: string;
  village: string;
  areaAcres: number;
  mappedOn: string; // YYYY-MM-DD
  mappedAtLabel: string;
  coords?: Array<[number, number]>; // polygon coordinates
  createdAt?: string; // original ISO timestamp
  stars?: number;
  basicDetails?: Record<string, any> | null;
  leaseDetails?: Record<string, any> | null;
  irrigationDetails?: Record<string, any> | null;
  additionalDetails?: Record<string, any> | null;
  lat: number;
  lng: number;
};

type DirectoryLandParcel = {
  id: string;
  name: string;
  location: string;
  ownerName: string;
  blockId: string;
  areaAcres: number;
  coords: Array<[number, number]>;
  lat: number;
  lng: number;
  plots: Array<{
    plot_name: string;
    plot_area: number;
    plot_coordinates: [number, number][];
    crop_type?: string;
  }>;
  mappings: Array<{
    mapping_name: string;
    mapping_type: string;
    mapping_coordinates: string[];
    shape_details: "polygon" | "line" | "point";
    details?: Record<string, unknown>;
    point_details?: Record<string, unknown>;
  }>;
};

type ClusterOption = { id: string; name: string };
type ZoneOption = { id: string; name: string; clusterId: string };
type BlockOption = { id: string; name: string; zoneId: string };

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatLocalDate = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
};

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

const parseFinite = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const parseSearchCoordinate = (value: string, maxDegrees: number) => {
  const numericValue = Number(value.trim());
  if (!Number.isFinite(numericValue)) return null;
  if (Math.abs(numericValue) <= maxDegrees) return numericValue;

  // Survey/GPS compact DMS format: DDMMSS.S or DDDMMSS.S.
  const sign = numericValue < 0 ? -1 : 1;
  const compactValue = Math.abs(numericValue);
  const degrees = Math.floor(compactValue / 10000);
  const minutesAndSeconds = compactValue - degrees * 10000;
  const minutes = Math.floor(minutesAndSeconds / 100);
  const seconds = minutesAndSeconds - minutes * 100;
  if (degrees > maxDegrees || minutes >= 60 || seconds >= 60) return null;

  return sign * (degrees + minutes / 60 + seconds / 3600);
};

const parseFormattedDmsPair = (value: string): { lat: number; lng: number } | null => {
  const dmsPattern =
    /(\d+(?:\.\d+)?)\s*[°º]\s*(\d+(?:\.\d+)?)\s*['′’]\s*(\d+(?:\.\d+)?)\s*(?:["″”])?\s*([NSEW])/gi;
  const matches = Array.from(value.matchAll(dmsPattern));
  if (matches.length !== 2) return null;

  const parsed = matches.map(match => {
    const degrees = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const hemisphere = match[4].toUpperCase();
    const maxDegrees = hemisphere === "N" || hemisphere === "S" ? 90 : 180;
    if (
      !Number.isFinite(degrees)
      || !Number.isFinite(minutes)
      || !Number.isFinite(seconds)
      || degrees > maxDegrees
      || minutes >= 60
      || seconds >= 60
    ) return null;
    const sign = hemisphere === "S" || hemisphere === "W" ? -1 : 1;
    return {
      value: sign * (degrees + minutes / 60 + seconds / 3600),
      hemisphere,
    };
  });
  if (parsed.some(item => item == null)) return null;

  const latitude = parsed.find(item => item && (item.hemisphere === "N" || item.hemisphere === "S"));
  const longitude = parsed.find(item => item && (item.hemisphere === "E" || item.hemisphere === "W"));
  return latitude && longitude ? { lat: latitude.value, lng: longitude.value } : null;
};

const clampStarCount = (stars: unknown) => {
  const n = typeof stars === "number" ? stars : Number(stars);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.floor(n)));
};

const renderStars = (stars: unknown) => "★".repeat(clampStarCount(stars));

const humanizeKey = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatDetailValue = (value: unknown) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "string") return value.trim() ? value : "—";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "—";
  try {
    const json = JSON.stringify(value);
    return json && json !== "{}" ? json : "—";
  } catch {
    return "—";
  }
};

const DetailsGrid = ({ details }: { details: Record<string, any> }) => (
  <div className="mt-2 text-xs text-muted-foreground grid grid-cols-2 gap-1">
    {Object.entries(details).map(([k, v]) => (
      <div key={k} className="contents">
        <div>{humanizeKey(k)}</div>
        <div className="text-right text-foreground/90 break-words">{formatDetailValue(v)}</div>
      </div>
    ))}
  </div>
);

const featureCollection = (features: any[]) => ({
  type: "FeatureCollection" as const,
  features,
});

const parcelPolygonFeatures = (parcels: DirectoryLandParcel[]) =>
  parcels
    .filter(parcel => parcel.coords.length >= 3)
    .map(parcel => {
      const ring = parcel.coords.map(([lat, lng]) => [lng, lat]);
      if (
        ring.length > 0
        && (
          ring[0][0] !== ring[ring.length - 1][0]
          || ring[0][1] !== ring[ring.length - 1][1]
        )
      ) {
        ring.push([...ring[0]]);
      }
      return {
        type: "Feature",
        properties: {
          id: parcel.id,
          name: parcel.name,
          location: parcel.location,
          area: parcel.areaAcres,
        },
        geometry: { type: "Polygon", coordinates: [ring] },
      };
    });

const parcelPointFeatures = (parcels: DirectoryLandParcel[]) =>
  parcels.map(parcel => ({
    type: "Feature",
    properties: {
      id: parcel.id,
      name: parcel.name,
      location: parcel.location,
      area: parcel.areaAcres,
    },
    geometry: { type: "Point", coordinates: [parcel.lng, parcel.lat] },
  }));

const buildCirclePolygon = (lat: number, lng: number, radiusMeters: number) => {
  const coordinates: [number, number][] = [];
  const earthRadius = 6371000;
  const angularDistance = radiusMeters / earthRadius;
  const latitude = lat * Math.PI / 180;
  const longitude = lng * Math.PI / 180;

  for (let bearingDegrees = 0; bearingDegrees <= 360; bearingDegrees += 6) {
    const bearing = bearingDegrees * Math.PI / 180;
    const pointLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance)
      + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const pointLongitude = longitude + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(pointLatitude)
    );
    coordinates.push([pointLongitude * 180 / Math.PI, pointLatitude * 180 / Math.PI]);
  }

  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [coordinates] },
  };
};

const distanceBetweenCoordinates = (
  firstLat: number,
  firstLng: number,
  secondLat: number,
  secondLng: number,
) => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDifference = radians(secondLat - firstLat);
  const longitudeDifference = radians(secondLng - firstLng);
  const firstLatitude = radians(firstLat);
  const secondLatitude = radians(secondLat);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDifference / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const GlobeLandMap = ({
  center,
  plantLat,
  plantLng,
  radiusMeters,
  parcels,
  panelCollapsed,
  focusParcelId,
  searchLocation,
  mapFeatures,
}: {
  center: [number, number];
  plantLat: number | null;
  plantLng: number | null;
  radiusMeters: number | null;
  parcels: DirectoryLandParcel[];
  panelCollapsed: boolean;
  focusParcelId: string | null;
  searchLocation: { lat: number; lng: number; requestId: number } | null;
  mapFeatures: PlottedFeature[];
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const boundaryOverlayRef = useRef<SVGSVGElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const parcelsRef = useRef(parcels);
  const mapFeaturesRef = useRef(mapFeatures);
  const lastFitKeyRef = useRef("");
  const lastFocusedParcelRef = useRef<string | null>(null);
  const searchMarkerRef = useRef<maplibregl.Marker | null>(null);
  const measuringRef = useRef(false);
  const measurePointsRef = useRef<Array<[number, number]>>([]);
  const [surfaceView, setSurfaceView] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [measuring, setMeasuring] = useState(false);
  const [measureDistanceMeters, setMeasureDistanceMeters] = useState<number | null>(null);
  const [measurePointCount, setMeasurePointCount] = useState(0);
  parcelsRef.current = parcels;
  mapFeaturesRef.current = mapFeatures;

  const clearMeasurement = () => {
    measurePointsRef.current = [];
    setMeasureDistanceMeters(null);
    setMeasurePointCount(0);
    mapRef.current?.triggerRepaint();
  };

  const toggleMeasurement = () => {
    const nextMeasuring = !measuringRef.current;
    measuringRef.current = nextMeasuring;
    setMeasuring(nextMeasuring);
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = nextMeasuring ? "crosshair" : "";
    }
    clearMeasurement();
  };

  const zoomToNearestParcel = () => {
    const map = mapRef.current;
    if (!map || parcels.length === 0) {
      setLocationMessage("No land parcels available");
      return;
    }
    if (!navigator.geolocation) {
      setLocationMessage("Location is not supported");
      return;
    }

    setLocating(true);
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      position => {
        const currentLat = position.coords.latitude;
        const currentLng = position.coords.longitude;
        const nearestParcel = parcels.reduce((nearest, parcel) => {
          const parcelDistance = distanceBetweenCoordinates(currentLat, currentLng, parcel.lat, parcel.lng);
          return !nearest || parcelDistance < nearest.distance
            ? { parcel, distance: parcelDistance }
            : nearest;
        }, null as { parcel: DirectoryLandParcel; distance: number } | null);

        if (nearestParcel) {
          map.flyTo({
            center: [nearestParcel.parcel.lng, nearestParcel.parcel.lat],
            zoom: 16,
            pitch: 20,
            duration: 1800,
            essential: true,
          });
          setLocationMessage(`Nearest: ${nearestParcel.parcel.name || nearestParcel.parcel.id}`);
        }
        setLocating(false);
      },
      () => {
        setLocationMessage("Allow location access to find the nearest parcel");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [center[1], center[0]],
      zoom: 1.35,
      minZoom: 0.75,
      maxZoom: 20,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Tiles © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
          },
          "land-mappings": {
            type: "geojson",
            data: featureCollection(parcelPolygonFeatures(parcels)),
          },
          "mapping-points": {
            type: "geojson",
            data: featureCollection(parcelPointFeatures(parcels)),
          },
          "plant-location": {
            type: "geojson",
            data: featureCollection([]),
          },
          "plant-radius": {
            type: "geojson",
            data: featureCollection([]),
          },
        },
        layers: [
          { id: "space", type: "background", paint: { "background-color": "#020617" } },
          { id: "satellite", type: "raster", source: "satellite" },
          {
            id: "plant-radius-fill",
            type: "fill",
            source: "plant-radius",
            paint: { "fill-color": "#64748b", "fill-opacity": 0.14 },
          },
          {
            id: "plant-radius-line",
            type: "line",
            source: "plant-radius",
            paint: { "line-color": "#cbd5e1", "line-width": 2 },
          },
          {
            id: "land-fill",
            type: "fill",
            source: "land-mappings",
            paint: {
              "fill-color": "#fde68a",
              "fill-opacity": 0.42,
              "fill-antialias": true,
            },
          },
          {
            id: "land-line",
            type: "line",
            source: "land-mappings",
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": "#facc15",
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8, 2.5,
                14, 4,
                18, 6,
              ],
              "line-opacity": 1,
            },
          },
          {
            id: "mapping-points-layer",
            type: "circle",
            source: "mapping-points",
            minzoom: 0,
            maxzoom: 13,
            paint: {
              "circle-radius": 6,
              "circle-color": "#facc15",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          },
          {
            id: "plant-location-layer",
            type: "circle",
            source: "plant-location",
            paint: {
              "circle-radius": 7,
              "circle-color": "#2563eb",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          },
        ],
      },
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.addControl(new maplibregl.GlobeControl(), "bottom-right");

    let boundaryFrame: number | null = null;
    const drawBoundaryOverlay = () => {
      boundaryFrame = null;
      const overlay = boundaryOverlayRef.current;
      if (!overlay) return;

      overlay.replaceChildren();
      if (map.getZoom() < 4) return;

      const canvas = map.getCanvas();
      overlay.setAttribute("viewBox", `0 0 ${canvas.clientWidth} ${canvas.clientHeight}`);

      parcelsRef.current.forEach(parcel => {
        if (parcel.coords.length < 3) return;
        const projectedPoints = parcel.coords
          .map(([lat, lng]) => map.project([lng, lat]))
          .map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
          .join(" ");
        if (!projectedPoints) return;

        const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polygon.setAttribute("points", projectedPoints);
        polygon.setAttribute("fill", "#fde68a");
        polygon.setAttribute("fill-opacity", "0.42");
        polygon.setAttribute("stroke", "#facc15");
        polygon.setAttribute("stroke-width", "4");
        polygon.setAttribute("stroke-linejoin", "round");
        polygon.setAttribute("vector-effect", "non-scaling-stroke");
        overlay.appendChild(polygon);

        if (map.getZoom() >= 8) {
          const labelPoint = map.project([parcel.lng, parcel.lat]);
          const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
          label.setAttribute("x", labelPoint.x.toFixed(2));
          label.setAttribute("y", (labelPoint.y - (parcel.ownerName ? 7 : 0)).toFixed(2));
          label.setAttribute("text-anchor", "middle");
          label.setAttribute("dominant-baseline", "middle");
          label.setAttribute("fill", "#0D3A35");
          label.setAttribute("stroke", "#ffffff");
          label.setAttribute("stroke-width", "4");
          label.setAttribute("paint-order", "stroke");
          label.setAttribute("stroke-linejoin", "round");
          label.setAttribute("font-size", "12");
          label.setAttribute("font-weight", "800");
          const parcelLine = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
          parcelLine.setAttribute("x", labelPoint.x.toFixed(2));
          parcelLine.textContent = `${parcel.id} · ${parcel.areaAcres.toFixed(3)} ac`;
          label.appendChild(parcelLine);
          if (parcel.ownerName) {
            const ownerLine = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
            ownerLine.setAttribute("x", labelPoint.x.toFixed(2));
            ownerLine.setAttribute("dy", "15");
            ownerLine.setAttribute("font-size", "10");
            ownerLine.setAttribute("font-weight", "700");
            ownerLine.textContent = parcel.ownerName;
            label.appendChild(ownerLine);
          }
          overlay.appendChild(label);
        }
      });

      mapFeaturesRef.current.forEach(feature => {
        const projected = feature.coordinates.map(([lat, lng]) => map.project([lng, lat]));
        if (projected.length === 0) return;
        const color = feature.color || "#0D3A35";

        if (feature.geometry === "polygon" && projected.length >= 3) {
          const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
          polygon.setAttribute("points", projected.map(point => `${point.x},${point.y}`).join(" "));
          polygon.setAttribute("fill", color);
          polygon.setAttribute("fill-opacity", "0.3");
          polygon.setAttribute("stroke", color);
          polygon.setAttribute("stroke-width", "4");
          polygon.setAttribute("stroke-linejoin", "round");
          polygon.setAttribute("vector-effect", "non-scaling-stroke");
          overlay.appendChild(polygon);
          return;
        }

        if (feature.geometry === "polyline" && projected.length >= 2) {
          const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
          polyline.setAttribute("points", projected.map(point => `${point.x},${point.y}`).join(" "));
          polyline.setAttribute("fill", "none");
          polyline.setAttribute("stroke", color);
          polyline.setAttribute("stroke-width", "4");
          polyline.setAttribute("stroke-linecap", "round");
          polyline.setAttribute("stroke-linejoin", "round");
          polyline.setAttribute("vector-effect", "non-scaling-stroke");
          overlay.appendChild(polyline);
          return;
        }

        projected.forEach(point => {
          const pointIcon = feature.pointDetails?.icon;
          const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          marker.setAttribute("cx", point.x.toFixed(2));
          marker.setAttribute("cy", point.y.toFixed(2));
          marker.setAttribute("r", pointIcon ? "13" : "8");
          marker.setAttribute("fill", color);
          marker.setAttribute("stroke", "#ffffff");
          marker.setAttribute("stroke-width", "3");
          marker.setAttribute("vector-effect", "non-scaling-stroke");
          overlay.appendChild(marker);

          if (pointIcon) {
            const icon = document.createElementNS("http://www.w3.org/2000/svg", "text");
            icon.setAttribute("x", point.x.toFixed(2));
            icon.setAttribute("y", (point.y + 5).toFixed(2));
            icon.setAttribute("text-anchor", "middle");
            icon.setAttribute("font-size", "14");
            icon.textContent = pointIcon;
            overlay.appendChild(icon);
          }

          const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
          label.setAttribute("x", point.x.toFixed(2));
          label.setAttribute("y", (point.y - (pointIcon ? 20 : 14)).toFixed(2));
          label.setAttribute("text-anchor", "middle");
          label.setAttribute("fill", "#0D3A35");
          label.setAttribute("stroke", "#ffffff");
          label.setAttribute("stroke-width", "4");
          label.setAttribute("paint-order", "stroke");
          label.setAttribute("font-size", "11");
          label.setAttribute("font-weight", "800");
          label.textContent = feature.name;
          overlay.appendChild(label);
        });
      });

      // Keep land boundaries and their details above cluster/zone/block overlays.
      parcelsRef.current.forEach(parcel => {
        if (parcel.coords.length < 3) return;
        const projectedPoints = parcel.coords
          .map(([lat, lng]) => map.project([lng, lat]))
          .map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
          .join(" ");

        const outline = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        outline.setAttribute("points", projectedPoints);
        outline.setAttribute("fill", "none");
        outline.setAttribute("stroke", "#facc15");
        outline.setAttribute("stroke-width", "4");
        outline.setAttribute("stroke-linejoin", "round");
        outline.setAttribute("vector-effect", "non-scaling-stroke");
        overlay.appendChild(outline);

        if (map.getZoom() < 8) return;
        const labelPoint = map.project([parcel.lng, parcel.lat]);
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", labelPoint.x.toFixed(2));
        label.setAttribute("y", (labelPoint.y - (parcel.ownerName ? 7 : 0)).toFixed(2));
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("dominant-baseline", "middle");
        label.setAttribute("fill", "#0D3A35");
        label.setAttribute("stroke", "#ffffff");
        label.setAttribute("stroke-width", "4");
        label.setAttribute("paint-order", "stroke");
        label.setAttribute("stroke-linejoin", "round");
        label.setAttribute("font-size", "12");
        label.setAttribute("font-weight", "800");

        const parcelLine = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        parcelLine.setAttribute("x", labelPoint.x.toFixed(2));
        parcelLine.textContent = `${parcel.id} · ${parcel.areaAcres.toFixed(3)} ac`;
        label.appendChild(parcelLine);

        if (parcel.ownerName) {
          const ownerLine = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
          ownerLine.setAttribute("x", labelPoint.x.toFixed(2));
          ownerLine.setAttribute("dy", "15");
          ownerLine.setAttribute("font-size", "10");
          ownerLine.setAttribute("font-weight", "700");
          ownerLine.textContent = parcel.ownerName;
          label.appendChild(ownerLine);
        }
        overlay.appendChild(label);
      });

      const measuredPoints = measurePointsRef.current.map(([lat, lng]) => map.project([lng, lat]));
      if (measuredPoints.length >= 2) {
        const measureLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        measureLine.setAttribute("x1", measuredPoints[0].x.toFixed(2));
        measureLine.setAttribute("y1", measuredPoints[0].y.toFixed(2));
        measureLine.setAttribute("x2", measuredPoints[1].x.toFixed(2));
        measureLine.setAttribute("y2", measuredPoints[1].y.toFixed(2));
        measureLine.setAttribute("stroke", "#ef4444");
        measureLine.setAttribute("stroke-width", "4");
        measureLine.setAttribute("stroke-dasharray", "8 6");
        measureLine.setAttribute("vector-effect", "non-scaling-stroke");
        overlay.appendChild(measureLine);

        const midpointX = (measuredPoints[0].x + measuredPoints[1].x) / 2;
        const midpointY = (measuredPoints[0].y + measuredPoints[1].y) / 2;
        const distance = distanceBetweenCoordinates(
          measurePointsRef.current[0][0],
          measurePointsRef.current[0][1],
          measurePointsRef.current[1][0],
          measurePointsRef.current[1][1],
        );
        const distanceLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
        distanceLabel.setAttribute("x", midpointX.toFixed(2));
        distanceLabel.setAttribute("y", (midpointY - 10).toFixed(2));
        distanceLabel.setAttribute("text-anchor", "middle");
        distanceLabel.setAttribute("fill", "#dc2626");
        distanceLabel.setAttribute("stroke", "#ffffff");
        distanceLabel.setAttribute("stroke-width", "5");
        distanceLabel.setAttribute("paint-order", "stroke");
        distanceLabel.setAttribute("font-size", "12");
        distanceLabel.setAttribute("font-weight", "900");
        distanceLabel.textContent = distance >= 1000
          ? `${(distance / 1000).toFixed(3)} km`
          : `${distance.toFixed(1)} m`;
        overlay.appendChild(distanceLabel);
      }

      measuredPoints.forEach((point, index) => {
        const endpoint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        endpoint.setAttribute("cx", point.x.toFixed(2));
        endpoint.setAttribute("cy", point.y.toFixed(2));
        endpoint.setAttribute("r", "7");
        endpoint.setAttribute("fill", index === 0 ? "#0D3A35" : "#ef4444");
        endpoint.setAttribute("stroke", "#ffffff");
        endpoint.setAttribute("stroke-width", "3");
        endpoint.setAttribute("vector-effect", "non-scaling-stroke");
        overlay.appendChild(endpoint);
      });
    };
    const scheduleBoundaryOverlay = () => {
      if (boundaryFrame !== null) return;
      boundaryFrame = window.requestAnimationFrame(drawBoundaryOverlay);
    };
    const handleMeasureClick = (event: maplibregl.MapMouseEvent) => {
      if (!measuringRef.current) return;
      const clickedPoint: [number, number] = [event.lngLat.lat, event.lngLat.lng];
      const nextPoints = measurePointsRef.current.length >= 2
        ? [clickedPoint]
        : [...measurePointsRef.current, clickedPoint];
      measurePointsRef.current = nextPoints;
      setMeasurePointCount(nextPoints.length);
      setMeasureDistanceMeters(nextPoints.length === 2
        ? distanceBetweenCoordinates(
            nextPoints[0][0],
            nextPoints[0][1],
            nextPoints[1][0],
            nextPoints[1][1],
          )
        : null
      );
      scheduleBoundaryOverlay();
    };

    map.on("load", () => {
      map.setProjection({ type: "globe" });
      scheduleBoundaryOverlay();
    });
    map.on("render", scheduleBoundaryOverlay);
    map.on("resize", scheduleBoundaryOverlay);
    map.on("click", handleMeasureClick);

    const updateViewMode = () => setSurfaceView(map.getZoom() >= 4);
    map.on("zoom", updateViewMode);
    updateViewMode();
    mapRef.current = map;

    return () => {
      if (boundaryFrame !== null) window.cancelAnimationFrame(boundaryFrame);
      searchMarkerRef.current?.remove();
      map.off("click", handleMeasureClick);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let retryTimer: number | undefined;
    let attempts = 0;
    const updateSources = () => {
      const landSource = map.getSource("land-mappings") as maplibregl.GeoJSONSource | undefined;
      const pointSource = map.getSource("mapping-points") as maplibregl.GeoJSONSource | undefined;
      const plantSource = map.getSource("plant-location") as maplibregl.GeoJSONSource | undefined;
      const radiusSource = map.getSource("plant-radius") as maplibregl.GeoJSONSource | undefined;
      if (!landSource || !pointSource || !plantSource || !radiusSource) {
        if (attempts < 30) {
          attempts += 1;
          retryTimer = window.setTimeout(updateSources, 100);
        }
        return;
      }

      const landFeatures = parcelPolygonFeatures(parcels);
      const pointFeatures = parcelPointFeatures(parcels);
      const plantFeatures = plantLat != null && plantLng != null
        ? [{
            type: "Feature",
            properties: { name: "CBG Plant" },
            geometry: { type: "Point", coordinates: [plantLng, plantLat] },
          }]
        : [];
      const radiusFeatures = plantLat != null && plantLng != null && radiusMeters != null
        ? [buildCirclePolygon(plantLat, plantLng, radiusMeters)]
        : [];

      landSource.setData(featureCollection(landFeatures) as any);
      pointSource.setData(featureCollection(pointFeatures) as any);
      plantSource.setData(featureCollection(plantFeatures) as any);
      radiusSource.setData(featureCollection(radiusFeatures) as any);
      map.triggerRepaint();

      const fitKey = parcels.map(parcel => parcel.id).sort().join("|");
      if (parcels.length > 0 && fitKey !== lastFitKeyRef.current) {
        const bounds = new maplibregl.LngLatBounds();
        parcels.forEach(parcel => {
          if (parcel.coords.length > 0) {
            parcel.coords.forEach(([lat, lng]) => bounds.extend([lng, lat]));
          } else {
            bounds.extend([parcel.lng, parcel.lat]);
          }
        });
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, {
            padding: 90,
            maxZoom: 15.5,
            duration: 1500,
          });
          lastFitKeyRef.current = fitKey;
        }
      }
    };

    updateSources();
    return () => {
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [parcels, plantLat, plantLng, radiusMeters]);

  useEffect(() => {
    const map = mapRef.current;
    const parcel = parcels.find(item => item.id === focusParcelId);
    if (!focusParcelId) {
      lastFocusedParcelRef.current = null;
      return;
    }
    if (lastFocusedParcelRef.current === focusParcelId) return;
    if (!map || !parcel) return;
    lastFocusedParcelRef.current = focusParcelId;

    const bounds = new maplibregl.LngLatBounds();
    parcel.coords.forEach(([lat, lng]) => bounds.extend([lng, lat]));
    if (bounds.isEmpty()) {
      map.flyTo({ center: [parcel.lng, parcel.lat], zoom: 16, duration: 1000 });
      return;
    }
    map.fitBounds(bounds, {
      padding: 110,
      maxZoom: 17,
      duration: 1000,
    });
  }, [focusParcelId, parcels]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!searchLocation) {
      if (!searchMarkerRef.current) return;
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
      const bounds = new maplibregl.LngLatBounds();
      parcels.forEach(parcel => parcel.coords.forEach(([lat, lng]) => bounds.extend([lng, lat])));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 90, maxZoom: 15.5, duration: 1000 });
      }
      return;
    }

    searchMarkerRef.current?.remove();
    searchMarkerRef.current = new maplibregl.Marker({ color: "#dc2626" })
      .setLngLat([searchLocation.lng, searchLocation.lat])
      .addTo(map);
    map.flyTo({
      center: [searchLocation.lng, searchLocation.lat],
      zoom: 16,
      pitch: 0,
      duration: 1200,
      essential: true,
    });
  }, [searchLocation]);

  useEffect(() => {
    mapRef.current?.triggerRepaint();
  }, [mapFeatures]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const resizeTimers = [0, 160, 320].map(delay =>
      window.setTimeout(() => map.resize(), delay)
    );
    return () => resizeTimers.forEach(timer => window.clearTimeout(timer));
  }, [panelCollapsed]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      <div ref={containerRef} className="h-full w-full" />
      <svg
        ref={boundaryOverlayRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-hidden"
        preserveAspectRatio="none"
      />
      <div className="absolute left-4 top-4 z-10 flex max-w-64 flex-col items-start gap-2">
        {locationMessage && (
          <div className="max-w-64 rounded-lg bg-slate-950/80 px-3 py-2 text-[10px] font-semibold text-white shadow-lg backdrop-blur">
            {locationMessage}
          </div>
        )}
        {measuring && (
          <div className="rounded-lg border border-red-200 bg-white/95 px-3 py-2 text-[10px] font-semibold text-slate-700 shadow-lg backdrop-blur">
            <div>
              {measurePointCount === 0
                ? "Click the first point"
                : measurePointCount === 1
                  ? "Click the second point"
                  : measureDistanceMeters != null && measureDistanceMeters >= 1000
                    ? `Distance: ${(measureDistanceMeters / 1000).toFixed(3)} km`
                    : `Distance: ${(measureDistanceMeters ?? 0).toFixed(1)} m`
              }
            </div>
            {measurePointCount > 0 && (
              <button
                type="button"
                onClick={clearMeasurement}
                className="mt-1.5 text-[10px] font-bold text-red-600 hover:underline"
              >
                Clear measurement
              </button>
            )}
          </div>
        )}
        <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={zoomToNearestParcel}
            disabled={locating || parcels.length === 0}
            className="flex h-10 w-10 items-center justify-center text-[#0D3A35] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="Zoom to nearest land parcel"
            aria-label="Zoom to nearest land parcel"
          >
            <LocateFixed className={`h-5 w-5 ${locating ? "animate-pulse" : ""}`} />
          </button>
          <button
            type="button"
            onClick={toggleMeasurement}
            className={`flex h-10 w-10 items-center justify-center border-l border-slate-200 transition ${
              measuring ? "bg-red-50 text-red-600" : "text-[#0D3A35] hover:bg-emerald-50"
            }`}
            title={measuring ? "Stop measuring" : "Measure aerial distance"}
            aria-label={measuring ? "Stop measuring" : "Measure aerial distance"}
          >
            <Ruler className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-full border border-white/15 bg-slate-950/70 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg backdrop-blur">
        {surfaceView ? "Surface View" : "Earth View · Zoom in for surface"}
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/15 bg-slate-950/70 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg backdrop-blur">
        {parcels.length} land parcel{parcels.length === 1 ? "" : "s"}
      </div>
    </div>
  );
};

const buildMockMappings = (): LandMapping[] => {
  const today = new Date();
  const yday = addDays(today, -1);
  const twoDays = addDays(today, -2);

  const d0 = formatLocalDate(today);
  const d1 = formatLocalDate(yday);
  const d2 = formatLocalDate(twoDays);

  // Centered around Nagpur region as a safe default.
  return [
    {
      id: "LM-001",
      supervisorId: "SUP-01",
      supervisorName: "A. Sharma",
      farmerName: "Ramesh Patil",
      village: "Kondhali",
      areaAcres: 6.2,
      mappedOn: d0,
      mappedAtLabel: "10:15 AM",
      lat: 21.1422,
      lng: 79.0836,
    },
    {
      id: "LM-002",
      supervisorId: "SUP-02",
      supervisorName: "N. Verma",
      farmerName: "Suresh Wankhede",
      village: "Kalmeshwar",
      areaAcres: 4.8,
      mappedOn: d0,
      mappedAtLabel: "12:05 PM",
      lat: 21.1882,
      lng: 79.0025,
    },
    {
      id: "LM-003",
      supervisorId: "SUP-01",
      supervisorName: "A. Sharma",
      farmerName: "Mina Deshmukh",
      village: "Katol",
      areaAcres: 3.1,
      mappedOn: d1,
      mappedAtLabel: "04:30 PM",
      lat: 21.2734,
      lng: 78.5854,
    },
    {
      id: "LM-004",
      supervisorId: "SUP-03",
      supervisorName: "P. Singh",
      farmerName: "Ajay Gajbhiye",
      village: "Saoner",
      areaAcres: 7.6,
      mappedOn: d1,
      mappedAtLabel: "11:20 AM",
      lat: 21.3852,
      lng: 78.9357,
    },
    {
      id: "LM-005",
      supervisorId: "SUP-02",
      supervisorName: "N. Verma",
      farmerName: "Kiran Bhoyar",
      village: "Hingna",
      areaAcres: 5.4,
      mappedOn: d2,
      mappedAtLabel: "02:10 PM",
      lat: 21.0977,
      lng: 78.9822,
    },
  ];
};

const LandAcquisition = () => {
  const [directoryParcels, setDirectoryParcels] = useState<DirectoryLandParcel[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [mapPlotterOpen, setMapPlotterOpen] = useState(false);
  const [mapPlotterFocus, setMapPlotterFocus] = useState<[number, number] | null>(null);
  const [mapPlotterFeatures, setMapPlotterFeatures] = useState<PlottedFeature[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = JSON.parse(window.localStorage.getItem("farm-connect-map-plotter-features") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [clusters, setClusters] = useState<ClusterOption[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [blocks, setBlocks] = useState<BlockOption[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState("all");
  const [selectedZoneId, setSelectedZoneId] = useState("all");
  const [selectedBlockId, setSelectedBlockId] = useState("all");
  const [coordinateSearchValue, setCoordinateSearchValue] = useState("");
  const [coordinateSearchError, setCoordinateSearchError] = useState("");
  const [searchLocation, setSearchLocation] = useState<{
    lat: number;
    lng: number;
    requestId: number;
  } | null>(null);

  const [plantLat, setPlantLat] = useState("21.32675");
  const [plantLng, setPlantLng] = useState("81.26050");
  const [radiusKm, setRadiusKm] = useState("5");
  const [detailsPanelCollapsed, setDetailsPanelCollapsed] = useState(false);

  const plantLatNum = parseFinite(plantLat);
  const plantLngNum = parseFinite(plantLng);
  const radiusKmNum = parseFinite(radiusKm);

  const mapCenter = useMemo<[number, number]>(() => {
    if (plantLatNum != null && plantLngNum != null) return [plantLatNum, plantLngNum];
    if (directoryParcels[0]) return [directoryParcels[0].lat, directoryParcels[0].lng];
    return [21.32675, 81.2605];
  }, [plantLatNum, plantLngNum, directoryParcels]);

  const radiusMeters = useMemo(() => {
    if (radiusKmNum == null || radiusKmNum <= 0) return null;
    return radiusKmNum * 1000;
  }, [radiusKmNum]);

  const searchCoordinates = () => {
    const formattedDms = parseFormattedDmsPair(coordinateSearchValue);
    if (formattedDms) {
      setCoordinateSearchError("");
      setSearchLocation({
        lat: formattedDms.lat,
        lng: formattedDms.lng,
        requestId: Date.now(),
      });
      return;
    }

    const coordinateParts = coordinateSearchValue
      .trim()
      .split(/[,\s]+/)
      .filter(Boolean);
    if (coordinateParts.length !== 2) {
      setCoordinateSearchError("Enter latitude and longitude separated by a comma or space");
      return;
    }
    const lat = parseSearchCoordinate(coordinateParts[0], 90);
    const lng = parseSearchCoordinate(coordinateParts[1], 180);
    if (lat == null || lng == null) {
      setCoordinateSearchError("Use decimal degrees or compact DMS coordinates");
      return;
    }
    setCoordinateSearchError("");
    setSearchLocation({ lat, lng, requestId: Date.now() });
  };

  const clearCoordinateSearch = () => {
    setCoordinateSearchValue("");
    setCoordinateSearchError("");
    setSearchLocation(null);
  };

  const markSearchedLocation = () => {
    if (!searchLocation) return;
    setMapPlotterFocus([searchLocation.lat, searchLocation.lng]);
    setMapPlotterOpen(true);
  };

  const availableZones = useMemo(
    () => zones.filter(zone => selectedClusterId === "all" || zone.clusterId === selectedClusterId),
    [zones, selectedClusterId],
  );
  const availableBlocks = useMemo(
    () => {
      if (selectedZoneId !== "all") return blocks.filter(block => block.zoneId === selectedZoneId);
      if (selectedClusterId === "all") return blocks;
      const zoneIds = new Set(availableZones.map(zone => zone.id));
      return blocks.filter(block => zoneIds.has(block.zoneId));
    },
    [availableZones, blocks, selectedClusterId, selectedZoneId],
  );
  const scopeParcels = useMemo(() => {
    let allowedBlockIds: Set<string> | null = null;
    if (selectedBlockId !== "all") {
      allowedBlockIds = new Set([selectedBlockId]);
    } else if (selectedZoneId !== "all") {
      allowedBlockIds = new Set(blocks.filter(block => block.zoneId === selectedZoneId).map(block => block.id));
    } else if (selectedClusterId !== "all") {
      const clusterZoneIds = new Set(zones.filter(zone => zone.clusterId === selectedClusterId).map(zone => zone.id));
      allowedBlockIds = new Set(blocks.filter(block => clusterZoneIds.has(block.zoneId)).map(block => block.id));
    }

    return allowedBlockIds
      ? directoryParcels.filter(parcel => allowedBlockIds?.has(parcel.blockId))
      : directoryParcels;
  }, [
    blocks,
    directoryParcels,
    selectedBlockId,
    selectedClusterId,
    selectedZoneId,
    zones,
  ]);
  const visibleParcels = useMemo(
    () => selectedParcelId
      ? scopeParcels.filter(parcel => parcel.id === selectedParcelId)
      : scopeParcels,
    [scopeParcels, selectedParcelId],
  );

  useEffect(() => {
    let mounted = true;
    const base = getBaseUrl().replace(/\/$/, "");

    Promise.all([
      fetch(`${base}/farmer_managment/get_clusters`).then(response => response.json()),
      fetch(`${base}/farmer_managment/get_zones`).then(response => response.json()),
      fetch(`${base}/farmer_managment/get_blocks`).then(response => response.json()),
    ]).then(([clusterData, zoneData, blockData]) => {
      if (!mounted) return;
      setClusters((Array.isArray(clusterData?.clusters) ? clusterData.clusters : []).map((cluster: any) => ({
        id: String(cluster.cluster_id ?? ""),
        name: String(cluster.cluster_name ?? cluster.cluster_id ?? "Cluster"),
      })));
      setZones((Array.isArray(zoneData?.zones) ? zoneData.zones : []).map((zone: any) => ({
        id: String(zone.zone_id ?? ""),
        name: String(zone.zone_name ?? zone.zone_id ?? "Zone"),
        clusterId: String(zone.cluster_id ?? ""),
      })));
      setBlocks((Array.isArray(blockData?.blocks) ? blockData.blocks : []).map((block: any) => ({
        id: String(block.block_id ?? ""),
        name: String(block.block_name ?? block.block_id ?? "Block"),
        zoneId: String(block.zone_id ?? ""),
      })));
    }).catch(() => {
      if (!mounted) return;
      setClusters([]);
      setZones([]);
      setBlocks([]);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    setDirectoryLoading(true);
    setDirectoryError("");
    fetch(`${getBaseUrl().replace(/\/$/, "")}/farmer_managment/get_farms`)
      .then(response => response.ok ? response.json() : Promise.reject(response.status))
      .then((data: any) => {
        const farms = Array.isArray(data?.farms) ? data.farms : [];
        const parcels = farms.map((farm: any) => {
          const rawCoordinates = Array.isArray(farm?.land_data?.land_coordinates)
            ? farm.land_data.land_coordinates
            : [];
          const coords = rawCoordinates
            .map((point: unknown) => {
              if (Array.isArray(point) && point.length >= 2) {
                const lat = Number(point[0]);
                const lng = Number(point[1]);
                return Number.isFinite(lat) && Number.isFinite(lng)
                  ? [lat, lng] as [number, number]
                  : null;
              }
              if (typeof point === "string") {
                const [rawLat, rawLng] = point.split(",");
                const lat = Number(rawLat);
                const lng = Number(rawLng);
                return Number.isFinite(lat) && Number.isFinite(lng)
                  ? [lat, lng] as [number, number]
                  : null;
              }
              return null;
            })
            .filter(Boolean) as Array<[number, number]>;

          if (coords.length === 0) return null;
          const lat = coords.reduce((sum, point) => sum + point[0], 0) / coords.length;
          const lng = coords.reduce((sum, point) => sum + point[1], 0) / coords.length;
          const location = [
            farm?.land_data?.village,
            farm?.land_data?.district,
            farm?.land_data?.state,
          ].filter(Boolean).join(", ");

          return {
            id: String(farm?.farm_id ?? ""),
            name: String(farm?.farm_id ?? "Land Parcel"),
            location,
            ownerName: "",
            blockId: String(farm?.block_id ?? ""),
            areaAcres: Number(farm?.area ?? 0),
            coords,
            lat,
            lng,
            plots: Array.isArray(farm?.land_plots) ? farm.land_plots : [],
            mappings: Array.isArray(farm?.additional_mappings) ? farm.additional_mappings : [],
          } satisfies DirectoryLandParcel;
        }).filter(Boolean) as DirectoryLandParcel[];

        if (mounted) setDirectoryParcels(parcels);
        Promise.all(parcels.map(async parcel => {
          try {
            const response = await fetch(
              `${getBaseUrl().replace(/\/$/, "")}/farmer_managment/get_farmer_details_from_farm_id/${parcel.id}`,
            );
            if (!response.ok) return parcel;
            const ownerData = await response.json();
            return {
              ...parcel,
              ownerName: String(
                ownerData?.farmer?.farmer_name
                ?? ownerData?.farmer_details?.farmer_name
                ?? "",
              ),
            };
          } catch {
            return parcel;
          }
        })).then(parcelsWithOwners => {
          if (mounted) setDirectoryParcels(parcelsWithOwners);
        });
      })
      .catch(() => {
        if (mounted) {
          setDirectoryParcels([]);
          setDirectoryError("Unable to load Land Directory parcels");
        }
      })
      .finally(() => {
        if (mounted) setDirectoryLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="h-[calc(100vh)] w-full">
      <div className="flex h-full w-full">
        {/* Map */}
        <div className="relative flex-1 min-w-0">
          {directoryLoading ? (
            <div className="flex h-full items-center justify-center bg-slate-950 text-sm font-semibold text-white">
              Loading Land Directory parcels…
            </div>
          ) : directoryError ? (
            <div className="flex h-full items-center justify-center bg-slate-950 text-sm font-semibold text-red-300">
              {directoryError}
            </div>
          ) : (
            <GlobeLandMap
              center={mapCenter}
              plantLat={plantLatNum}
              plantLng={plantLngNum}
              radiusMeters={radiusMeters}
              parcels={visibleParcels}
              panelCollapsed={detailsPanelCollapsed}
              focusParcelId={selectedParcelId}
              searchLocation={searchLocation}
              mapFeatures={mapPlotterFeatures}
            />
          )}

          <button
            type="button"
            onClick={() => setDetailsPanelCollapsed(collapsed => !collapsed)}
            className="absolute right-3 top-4 z-[1100] flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0D3A35] shadow-lg transition hover:bg-emerald-50"
            title={detailsPanelCollapsed ? "Show Land Directory parcels" : "Hide Land Directory parcels"}
            aria-label={detailsPanelCollapsed ? "Show Land Directory parcels" : "Hide Land Directory parcels"}
          >
            {detailsPanelCollapsed ? (
              <ChevronLeft className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </button>

        </div>

        {/* Right panel */}
        <aside
          className={cn(
            "shrink-0 overflow-hidden bg-background transition-[width,border-color] duration-300",
            detailsPanelCollapsed ? "w-0 border-l-0" : "w-[420px] border-l",
          )}
        >
          <div className="flex h-full w-[420px] flex-col bg-slate-50/70">
            <div className="border-b border-slate-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <Layers3 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900">Land Directory Parcels</div>
                    <div className="text-xs text-slate-500">Select a parcel to locate it</div>
                  </div>
                </div>
                <Badge className="shrink-0 border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800 hover:bg-emerald-50">
                  {visibleParcels.length}
                </Badge>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Crosshair className="h-4 w-4 text-emerald-700" />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    Search by Coordinates
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_38px] gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={coordinateSearchValue}
                    onChange={event => setCoordinateSearchValue(event.target.value)}
                    onKeyDown={event => event.key === "Enter" && searchCoordinates()}
                    placeholder="21.32675, 81.26050"
                    aria-label="Search latitude and longitude"
                    className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                  />
                  <button
                    type="button"
                    onClick={searchCoordinates}
                    className="flex h-[34px] w-[38px] items-center justify-center rounded-lg bg-[#0D3A35] text-white transition hover:bg-[#124C45]"
                    title="Search coordinates"
                    aria-label="Search coordinates"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </div>
                {coordinateSearchError && (
                  <p className="mt-2 text-[10px] font-medium text-red-600">{coordinateSearchError}</p>
                )}
                {(coordinateSearchValue || searchLocation) && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={markSearchedLocation}
                      disabled={!searchLocation}
                      className="rounded-lg bg-[#0D3A35] px-3 py-2 text-[10px] font-bold text-white transition hover:bg-[#124C45] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Mark Here in Plotter
                    </button>
                    <button
                      type="button"
                      onClick={clearCoordinateSearch}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                      Clear Search
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Select
                  value={selectedClusterId}
                  onValueChange={value => {
                    setSelectedClusterId(value);
                    setSelectedZoneId("all");
                    setSelectedBlockId("all");
                    setSelectedParcelId(null);
                  }}
                >
                  <SelectTrigger className="h-9 bg-white text-xs">
                    <SelectValue placeholder="Cluster" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clusters</SelectItem>
                    {clusters.map(cluster => (
                      <SelectItem key={cluster.id} value={cluster.id}>{cluster.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedZoneId}
                  onValueChange={value => {
                    setSelectedZoneId(value);
                    setSelectedBlockId("all");
                    setSelectedParcelId(null);
                  }}
                >
                  <SelectTrigger className="h-9 bg-white text-xs">
                    <SelectValue placeholder="Zone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Zones</SelectItem>
                    {availableZones.map(zone => (
                      <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedBlockId}
                  onValueChange={value => {
                    setSelectedBlockId(value);
                    setSelectedParcelId(null);
                  }}
                >
                  <SelectTrigger className="h-9 bg-white text-xs">
                    <SelectValue placeholder="Block" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Blocks</SelectItem>
                    {availableBlocks.map(block => (
                      <SelectItem key={block.id} value={block.id}>{block.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedParcelId ?? "all"}
                  onValueChange={value => setSelectedParcelId(value === "all" ? null : value)}
                >
                  <SelectTrigger className="h-9 bg-white text-xs">
                    <SelectValue placeholder="Land Parcel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Land Parcels</SelectItem>
                    {scopeParcels.map(parcel => (
                      <SelectItem key={parcel.id} value={parcel.id}>{parcel.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMapPlotterFocus(null);
                  setMapPlotterOpen(true);
                }}
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#0D3A35] px-4 text-xs font-bold text-white transition hover:bg-[#124C45]"
              >
                <PencilRuler className="h-4 w-4" />
                Open Map Plotter
              </button>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-3 p-4">
                {visibleParcels.length === 0 ? (
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                    No registered Land Directory parcels were found.
                  </div>
                ) : (
                  visibleParcels.map((parcel) => (
                    <Card
                      key={parcel.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedParcelId(parcel.id)}
                      onKeyDown={event => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedParcelId(parcel.id);
                        }
                      }}
                      className={cn(
                        "group cursor-pointer overflow-hidden border-slate-200 bg-white p-0 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md",
                        selectedParcelId === parcel.id && "border-emerald-500 ring-1 ring-emerald-500/20",
                      )}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="break-all text-sm font-bold text-[#0D3A35]">{parcel.id}</div>
                            <div className="mt-0.5 truncate text-xs font-semibold text-slate-700">
                              {parcel.ownerName || "Owner name unavailable"}
                            </div>
                            <div className="mt-1 flex items-start gap-1.5 text-xs leading-4 text-slate-500">
                              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              <span>{parcel.location || "Location not available"}</span>
                            </div>
                          </div>
                          {selectedParcelId === parcel.id && (
                            <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">
                              Selected
                            </span>
                          )}
                        </div>

                        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                          <div className="border-r border-slate-200 px-3 py-2.5 text-center">
                            <Ruler className="mx-auto h-4 w-4 text-emerald-700" />
                            <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Area</div>
                            <div className="text-xs font-bold text-slate-800">{parcel.areaAcres.toFixed(3)} acres</div>
                          </div>
                          <div className="px-3 py-2.5 text-center">
                            <Layers3 className="mx-auto h-4 w-4 text-emerald-700" />
                            <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Boundary Points</div>
                            <div className="text-xs font-bold text-slate-800">{parcel.coords.length}</div>
                          </div>
                        </div>
                      </div>

                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </aside>
      </div>

      {mapPlotterOpen && createPortal(
        <PremiumPlotterModal
          mapMode
          farmId="GLOBAL-MAP"
          farmLabel="Global Map"
          landCoordinates={[]}
          focusCoordinate={mapPlotterFocus}
          mapParcels={directoryParcels.map(parcel => ({
            id: parcel.id,
            areaAcres: parcel.areaAcres,
            ownerName: parcel.ownerName,
            coordinates: parcel.coords,
          }))}
          onMapFeaturesChange={setMapPlotterFeatures}
          onClose={() => {
            setMapPlotterOpen(false);
            setMapPlotterFocus(null);
          }}
        />,
        document.body,
      )}
    </div>
  );
};

export default LandAcquisition;
