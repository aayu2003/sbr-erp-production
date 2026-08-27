import { useEffect, useMemo, useState } from "react";
import { FeatureGroup, MapContainer, TileLayer, Marker, Polygon, Tooltip } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import { Map as MapIcon, MapPin, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import getBaseUrl from "@/lib/config";

// Vite bundles Leaflet's default marker icon paths incorrectly unless overridden explicitly.
L.Marker.prototype.options.icon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });

type LatLng = [number, number];
type Marking = { id: string; label: string; type: "point" | "boundary"; points: LatLng[] };

type ProjectRecord = { project_id: string; project_name?: string };

const DEFAULT_CENTER: LatLng = [21.2787, 81.8661]; // Chhattisgarh — matches this project's operating region

export default function ImportantMapMarkings() {
  const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectId, setProjectId] = useState("");
  const [markings, setMarkings] = useState<Marking[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`${baseUrl}/admin_project/get_all_projects`)
      .then((res) => res.json())
      .then((data) => { if (data?.success) setProjects(Array.isArray(data.projects) ? data.projects : []); })
      .catch(() => toast.error("Failed to load projects"));
  }, [baseUrl]);

  useEffect(() => {
    if (!projectId) { setMarkings([]); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`${baseUrl}/admin_project/get_map_markings/${encodeURIComponent(projectId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data?.success) { setMarkings([]); return; }
        const rows: Marking[] = (Array.isArray(data.markings) ? data.markings : []).map((item: Record<string, unknown>, index: number) => ({
          id: String(item.id ?? `existing-${index}`),
          label: String(item.label ?? `Marking ${index + 1}`),
          type: item.type === "boundary" ? "boundary" : "point",
          points: Array.isArray(item.points) ? (item.points as LatLng[]) : [],
        }));
        setMarkings(rows);
        setDirty(false);
      })
      .catch(() => toast.error("Failed to load markings for this project"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, baseUrl]);

  const mapCenter = useMemo<LatLng>(() => markings[0]?.points[0] ?? DEFAULT_CENTER, [markings]);

  const handleCreated = (event: { layerType: string; layer: L.Layer }) => {
    const id = `mark-${Date.now()}`;
    if (event.layerType === "marker") {
      const latlng = (event.layer as L.Marker).getLatLng();
      setMarkings((current) => [...current, { id, label: `Point ${current.length + 1}`, type: "point", points: [[latlng.lat, latlng.lng]] }]);
    } else if (event.layerType === "polygon") {
      const latlngs = (event.layer as L.Polygon).getLatLngs()[0] as L.LatLng[];
      setMarkings((current) => [...current, { id, label: `Boundary ${current.filter((m) => m.type === "boundary").length + 1}`, type: "boundary", points: latlngs.map((point) => [point.lat, point.lng]) }]);
    }
    setDirty(true);
  };

  const renameMarking = (id: string, label: string) => {
    setMarkings((current) => current.map((marking) => (marking.id === id ? { ...marking, label } : marking)));
    setDirty(true);
  };
  const removeMarking = (id: string) => {
    setMarkings((current) => current.filter((marking) => marking.id !== id));
    setDirty(true);
  };

  const saveMarkings = async () => {
    if (!projectId) { toast.error("Select a project first"); return; }
    setSaving(true);
    try {
      const response = await fetch(`${baseUrl}/admin_project/save_map_markings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, markings }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || "Failed to save markings");
      toast.success("Map markings saved");
      setDirty(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save markings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-[#f6f8fa] p-5 lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#0d473f] text-white shadow-sm"><MapIcon className="h-6 w-6" /></div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#18765f]">Project · Site Geography</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">Important Map Markings</h1>
              <p className="mt-1 text-sm text-slate-500">Mark a project's site boundary and key locations — office, warehouse, collection points.</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select className="h-11 min-w-[240px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 outline-none focus:border-[#278b76]" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">Select a project</option>
              {projects.map((project) => <option key={project.project_id} value={project.project_id}>{project.project_name || project.project_id}</option>)}
            </select>
            <button type="button" onClick={saveMarkings} disabled={!projectId || saving || !dirty} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0d5c4d] px-4 text-sm font-bold text-white hover:bg-[#0a4a3f] disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save Markings"}</button>
          </div>
        </header>

        {!projectId ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">
            <MapPin className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700">Select a project to mark its site</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[3fr_1fr]">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="h-[640px] w-full">
                {loading ? (
                  <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">Loading markings…</div>
                ) : (
                  <MapContainer center={mapCenter} zoom={13} className="h-full w-full">
                    <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {markings.map((marking) => marking.type === "point" ? (
                      <Marker key={marking.id} position={marking.points[0]}><Tooltip permanent direction="top">{marking.label}</Tooltip></Marker>
                    ) : (
                      <Polygon key={marking.id} positions={marking.points} pathOptions={{ color: "#0d5c4d", fillOpacity: 0.15 }}><Tooltip sticky>{marking.label}</Tooltip></Polygon>
                    ))}
                    <FeatureGroupWithControls onCreated={handleCreated} />
                  </MapContainer>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#18765f]">Markings ({markings.length})</h2>
              <p className="mt-1 text-[11px] text-slate-400">Use the map's marker/polygon tools to add a point or boundary, then name it here.</p>
              <div className="mt-4 space-y-2">
                {markings.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">No markings yet</p>}
                {markings.map((marking) => (
                  <div key={marking.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5">
                    <span className={`rounded-full px-2 py-1 text-[9px] font-extrabold uppercase ${marking.type === "point" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{marking.type}</span>
                    <input className="h-8 flex-1 min-w-0 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#278b76]" value={marking.label} onChange={(event) => renameMarking(marking.id, event.target.value)} />
                    <button type="button" onClick={() => removeMarking(marking.id)} title="Remove" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

// react-leaflet-draw's EditControl attaches its drawn layers to the nearest FeatureGroup —
// this one is only ever used as that attachment target (drawn shapes get converted into our
// own Marking state via onCreated and re-rendered separately above), so it stays empty.
function FeatureGroupWithControls({ onCreated }: { onCreated: (event: { layerType: string; layer: L.Layer }) => void }) {
  return (
    <FeatureGroup>
      <EditControl
        position="topright"
        draw={{ marker: true, polygon: true, polyline: false, circle: false, circlemarker: false, rectangle: false }}
        edit={{ edit: false, remove: false }}
        onCreated={(event) => onCreated({ layerType: event.layerType, layer: event.layer })}
      />
    </FeatureGroup>
  );
}
