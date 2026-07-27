import { useMemo, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";
import getBaseUrl from "@/lib/config";
import { useEffect } from "react";

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

// Ensure leaflet marker icons render correctly in Vite builds.
const defaultLeafletIcon = L.icon({
  iconUrl,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(L.Marker.prototype as any).options.icon = defaultLeafletIcon;

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
  const [mappings, setMappings] = useState<LandMapping[]>(() => buildMockMappings());

  const [plantLat, setPlantLat] = useState("21.32675");
  const [plantLng, setPlantLng] = useState("81.26050");
  const [radiusKm, setRadiusKm] = useState("5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const defaultEnd = formatLocalDate(today);
  const defaultStart = formatLocalDate(addDays(today, -7));
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const [mode, setMode] = useState<"bySupervisor" | "all">("all");

  const supervisors = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const m of mappings) {
      if (!byId.has(m.supervisorId)) byId.set(m.supervisorId, { id: m.supervisorId, name: m.supervisorName });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [mappings]);

  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>(supervisors[0]?.id ?? "");

  const rangeFiltered = useMemo(() => {
    const s = startDate || "0000-01-01";
    const e = endDate || "9999-12-31";
    return mappings
      .filter((m) => m.mappedOn >= s && m.mappedOn <= e)
      .sort((a, b) => (a.mappedOn === b.mappedOn ? a.id.localeCompare(b.id) : b.mappedOn.localeCompare(a.mappedOn)));
  }, [mappings, startDate, endDate]);

  const listItems = useMemo(() => {
    if (mode === "all") return rangeFiltered;
    if (!selectedSupervisorId) return [];
    return rangeFiltered.filter((m) => m.supervisorId === selectedSupervisorId);
  }, [mode, rangeFiltered, selectedSupervisorId]);

  const plantLatNum = parseFinite(plantLat);
  const plantLngNum = parseFinite(plantLng);
  const radiusKmNum = parseFinite(radiusKm);

  const mapCenter = useMemo<[number, number]>(() => {
    if (plantLatNum != null && plantLngNum != null) return [plantLatNum, plantLngNum];
    if (listItems[0]) return [listItems[0].lat, listItems[0].lng];
    return [21.32675, 81.2605];
  }, [plantLatNum, plantLngNum, listItems]);

  const radiusMeters = useMemo(() => {
    if (radiusKmNum == null || radiusKmNum <= 0) return null;
    return radiusKmNum * 1000;
  }, [radiusKmNum]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const base = getBaseUrl();
        const resp = await fetch(`${base.replace(/\/$/, "")}/lead_making/get_land_mappings`);
        if (!resp.ok) throw new Error(`Server ${resp.status}`);
        const data = await resp.json();
        if (!data || !data.data) throw new Error("Invalid response");

        const parsed: LandMapping[] = (data.data || [])
          .map((item: any) => {
            const coordsRaw: string[] = Array.isArray(item.land_mapping) ? item.land_mapping : [];
            const coords = coordsRaw
              .map((s) => {
                const parts = String(s || "").split(",");
                const lat = Number(parts[0]);
                const lng = Number(parts[1]);
                if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng] as [number, number];
                return null;
              })
              .filter(Boolean) as Array<[number, number]>;

            // centroid fallback for marker
            const centroid =
              coords.length > 0
                ? [coords.reduce((a, c) => a + c[0], 0) / coords.length, coords.reduce((a, c) => a + c[1], 0) / coords.length]
                : [21.32675, 81.2605];

            const created_at = item.created_at || null;
            const mappedOn = created_at ? String(created_at).slice(0, 10) : formatLocalDate(new Date());
            const mappedAtLabel = created_at ? new Date(created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

            return {
              id: String(item.lead_id || item.leadId || item.id || ""),
              supervisorId: String(item.supervisor_id || item.supervisorId || "unknown"),
              supervisorName: String(item.supervisor_name || item.supervisorName || "Unknown"),
              farmerName: String(item.basic_details?.owner_name || item.basic_details?.owner_name || "—"),
              village: String(item.basic_details?.address || ""),
              areaAcres: 0,
              mappedOn,
              mappedAtLabel,
              coords: coords.length ? coords : undefined,
              lat: centroid[0],
              lng: centroid[1],
              createdAt: created_at,
              stars: Number.isFinite(Number(item.stars)) ? Number(item.stars) : 0,
              basicDetails: item.basic_details ?? null,
              leaseDetails: item.lease_details ?? null,
              irrigationDetails: item.irrigation_details ?? null,
              additionalDetails: item.additional_details ?? null,
            } as LandMapping;
          })
          .filter(Boolean);

        if (mounted && parsed.length > 0) setMappings(parsed);
      } catch (err: any) {
        setError(String(err?.message || err));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="h-[calc(100vh)] w-full">
      <div className="flex h-full w-full">
        {/* Map */}
        <div className="relative flex-1 min-w-0">
          <MapContainer
            center={mapCenter}
            zoom={12}
            className="h-full w-full"
            scrollWheelZoom
          >
            <TileLayer
              attribution='Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />

            {plantLatNum != null && plantLngNum != null && (
              <>
                <Marker position={[plantLatNum, plantLngNum]}>
                  <Popup>
                    <div className="space-y-1">
                      <div className="font-semibold">CBG Plant</div>
                      <div className="text-xs text-muted-foreground">
                        {plantLatNum.toFixed(5)}, {plantLngNum.toFixed(5)}
                      </div>
                    </div>
                  </Popup>
                </Marker>
                {radiusMeters != null && (
                  <Circle
                    center={[plantLatNum, plantLngNum]}
                    radius={radiusMeters}
                    pathOptions={{ color: "#64748b", fillOpacity: 0.08 }}
                  />
                )}
              </>
            )}

            {listItems.map((m) => (
              <div key={m.id}>
                {(() => {
                  const starsStr = renderStars(m.stars);
                  return (
                    <>
                {m.coords && m.coords.length > 0 && (
                  <Polygon
                    positions={m.coords}
                    pathOptions={{ color: "var(--land-boundary-color, #fde047)", fillColor: "var(--land-boundary-fill, #fef9c3)", weight: 3, fillOpacity: 0.28 }}
                  >
                      <Popup>
                        <div className="space-y-1">
                          <div className="font-semibold">{m.farmerName || m.id}</div>
                          <div className="text-xs text-muted-foreground">Supervisor: {m.supervisorName}</div>
                          <div className="text-xs">{m.mappedOn} • {m.mappedAtLabel}</div>
                          <div className="text-xs text-muted-foreground">{starsStr}</div>
                        </div>
                      </Popup>
                  </Polygon>
                )}

                <Marker
                      position={[m.lat, m.lng]}
                      icon={L.divIcon({
                        html: `<div style="display:inline-flex;align-items:center;justify-content:center;padding:4px 7px;border-radius:999px;background:#fff;border:1px solid rgba(0,0,0,0.08);box-shadow:0 1px 4px rgba(2,6,23,0.08);color:#f59e0b;font-weight:700;font-size:12px;line-height:1">${starsStr}</div>`,
                        className: "",
                        iconSize: [36, 36],
                        iconAnchor: [18, 18],
                      })}
                    >
                  <Popup>
                    <div className="space-y-1">
                      <div className="font-semibold">{m.farmerName}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.village} • {m.areaAcres.toFixed(1)} acres
                        </div>
                        <div className="text-xs text-muted-foreground">{starsStr}</div>
                      <div className="text-xs">
                        {m.mappedOn} • {m.mappedAtLabel}
                      </div>
                      <div className="text-xs">Supervisor: {m.supervisorName}</div>
                    </div>
                  </Popup>
                    </Marker>
                    </>
                  );
                })()}
              </div>
            ))}
          </MapContainer>

          {/* Adjustment panel (top-left) */}
          <div className="absolute left-4 top-4 z-[1000] w-[380px] rounded-xl border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-sm">
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-foreground">Land Acquisition</div>
                  <div className="text-xs text-muted-foreground">CBG plant settings & date range</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>Map</span>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="plant-lat">Plant Latitude</Label>
                  <Input
                    id="plant-lat"
                    inputMode="decimal"
                    value={plantLat}
                    onChange={(e) => setPlantLat(e.target.value)}
                    placeholder="e.g. 21.1458"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plant-lng">Plant Longitude</Label>
                  <Input
                    id="plant-lng"
                    inputMode="decimal"
                    value={plantLng}
                    onChange={(e) => setPlantLng(e.target.value)}
                    placeholder="e.g. 79.0882"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="radius-km">Radius (km)</Label>
                  <Input
                    id="radius-km"
                    inputMode="numeric"
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(e.target.value)}
                    placeholder="e.g. 5"
                  />
                </div>
                <div />
                <div className="space-y-1.5">
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-3 text-xs text-muted-foreground">
                Showing mappings within the selected date range.
              </div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <aside className="w-[420px] shrink-0 border-l bg-background">
          <div className="h-full flex flex-col">
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Land Mappings</div>
                  <div className="text-xs text-muted-foreground">
                    {mode === "all" ? "All supervisors" : "Per supervisor"} • {listItems.length} result(s)
                  </div>
                </div>
                <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                  <TabsList className="h-9">
                    <TabsTrigger value="bySupervisor" className="text-xs">Per Supervisor</TabsTrigger>
                    <TabsTrigger value="all" className="text-xs">All (Range)</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {mode === "bySupervisor" && (
                <div className="mt-4 space-y-1.5">
                  <Label>Supervisor</Label>
                  <Select value={selectedSupervisorId} onValueChange={setSelectedSupervisorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select supervisor" />
                    </SelectTrigger>
                    <SelectContent>
                      {supervisors.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <Separator />

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {listItems.length === 0 ? (
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                    No land mappings found for the current selection.
                  </div>
                ) : (
                  listItems.map((m) => (
                    <Card key={m.id} className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{m.farmerName}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {m.village} • {m.areaAcres.toFixed(1)} acres
                          </div>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {m.supervisorName}
                        </Badge>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="text-muted-foreground">Date</div>
                        <div className="text-foreground text-right">{m.mappedOn}</div>
                        <div className="text-muted-foreground">Time</div>
                        <div className="text-foreground text-right">{m.mappedAtLabel}</div>
                        <div className="text-muted-foreground">Coordinates</div>
                        <div className="text-foreground text-right font-mono">
                          {m.lat.toFixed(4)}, {m.lng.toFixed(4)}
                        </div>
                      </div>

                        <div className="mt-3 space-y-2 text-sm">
                          <Collapsible defaultOpen={false}>
                            <div className="flex items-center justify-between">
                              <CollapsibleTrigger asChild>
                                <button className="flex items-center gap-2 w-full text-sm font-medium">
                                  <span>Basic Details</span>
                                  <ChevronDown className="ml-auto w-4 h-4 text-muted-foreground" />
                                </button>
                              </CollapsibleTrigger>
                            </div>
                            <CollapsibleContent>
                              <div className="mt-2 text-xs text-muted-foreground grid grid-cols-2 gap-1">
                                <div>Name</div>
                                <div className="text-right">{m.basicDetails?.owner_name || "—"}</div>
                                <div>Contact</div>
                                <div className="text-right">{m.basicDetails?.owner_contact || "—"}</div>
                                <div>Email</div>
                                <div className="text-right">{m.basicDetails?.owner_email || "—"}</div>
                                <div>Address</div>
                                <div className="text-right">{m.basicDetails?.address || "—"}</div>
                                <div>District</div>
                                <div className="text-right">{m.basicDetails?.district || "—"}</div>
                                <div>Pin</div>
                                <div className="text-right">{m.basicDetails?.pin_code || "—"}</div>
                                <div>Tehsil</div>
                                <div className="text-right">{m.basicDetails?.tehsil || "—"}</div>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>

                          <Collapsible>
                            <div className="flex items-center justify-between mt-2">
                              <CollapsibleTrigger asChild>
                                <button className="flex items-center gap-2 w-full text-sm font-medium">
                                  <span>Lease Details</span>
                                  <ChevronDown className="ml-auto w-4 h-4 text-muted-foreground" />
                                </button>
                              </CollapsibleTrigger>
                            </div>
                            <CollapsibleContent>
                              <div className="mt-2 text-xs text-muted-foreground">
                                {m.leaseDetails && Object.keys(m.leaseDetails).length > 0 ? (
                                    <DetailsGrid details={m.leaseDetails} />
                                ) : (
                                  <div className="text-xs">No lease details</div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>

                          <Collapsible>
                            <div className="flex items-center justify-between mt-2">
                              <CollapsibleTrigger asChild>
                                <button className="flex items-center gap-2 w-full text-sm font-medium">
                                  <span>Irrigation Details</span>
                                  <ChevronDown className="ml-auto w-4 h-4 text-muted-foreground" />
                                </button>
                              </CollapsibleTrigger>
                            </div>
                            <CollapsibleContent>
                              <div className="mt-2 text-xs text-muted-foreground">
                                {m.irrigationDetails && Object.keys(m.irrigationDetails).length > 0 ? (
                                  <DetailsGrid details={m.irrigationDetails} />
                                ) : (
                                  <div className="text-xs">No irrigation details</div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>

                          <Collapsible>
                            <div className="flex items-center justify-between mt-2">
                              <CollapsibleTrigger asChild>
                                <button className="flex items-center gap-2 w-full text-sm font-medium">
                                  <span>Additional Details</span>
                                  <ChevronDown className="ml-auto w-4 h-4 text-muted-foreground" />
                                </button>
                              </CollapsibleTrigger>
                            </div>
                            <CollapsibleContent>
                              <div className="mt-2 text-xs text-muted-foreground">
                                {m.additionalDetails && Object.keys(m.additionalDetails).length > 0 ? (
                                  <DetailsGrid details={m.additionalDetails} />
                                ) : (
                                  <div className="text-xs">No additional details</div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                    </Card>
                  ))
                )}

                <div className={cn("text-xs text-muted-foreground", listItems.length === 0 ? "hidden" : "")}
                >
                  Tip: set Start Date = End Date to view a single day (today/yesterday).
                </div>
              </div>
            </ScrollArea>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default LandAcquisition;
