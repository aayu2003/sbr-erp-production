import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ExternalLink, IndianRupee, MapPin, SlidersHorizontal, Trash2 } from "lucide-react";
import getBaseUrl from "@/lib/config";

const safeStr = (v: unknown) => String(v ?? "").trim();
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DOC_BASE_WIDTH = 816;

export type SupportingDocument = { document: string; doc_link: string };

type FarmOption = { farm_id: string; label: string; ownerName?: string };

type PaymentNodeData = { amount: number };

// A logical gate decides HOW its share of the payment gets split across the land nodes
// hanging off it: proportional by land size ("per_acre"), by an explicit ratio ("percentage",
// the old default behaviour), or typed in freehand when no formula applies ("manual").
export type GateMode = "per_acre" | "percentage" | "manual";
type GateNodeData = { mode: GateMode; percent: number };
type LandNodeData = { landId: string; percent: number; acres: number; manualAmount: number };

// ── Shared mesh callbacks — node data only ever holds primitives so each node reaches the
// mesh's live callbacks/farm list via context instead of a closure captured at node-creation
// time (which would go stale as the node/edge arrays change). ──
type MeshContextValue = {
  nodes: Node[];
  edges: Edge[];
  farms: FarmOption[];
  farmsLoading: boolean;
  totalAmount: number;
  updateGateMode: (gateId: string, mode: GateMode) => void;
  updateGatePercent: (gateId: string, percent: number) => void;
  removeGate: (gateId: string) => void;
  updateLand: (id: string, landId: string) => void;
  updateLandPercent: (id: string, percent: number) => void;
  updateLandAcres: (id: string, acres: number) => void;
  updateLandManual: (id: string, amount: number) => void;
  removeLand: (id: string) => void;
};

const MeshContext = createContext<MeshContextValue | null>(null);
const useMeshContext = () => {
  const ctx = useContext(MeshContext);
  if (!ctx) throw new Error("Mesh context is missing");
  return ctx;
};

const GATE_MODE_LABELS: Record<GateMode, string> = {
  percentage: "Ratio / Percentage",
  per_acre: "Per Acre",
  manual: "Manual",
};

// Shared by the live LandNode display and the saved-summary table (getSummary) so the two
// never drift apart on how a land's ₹ share is derived from its gate's mode.
function computeLandAmount(mode: GateMode, land: LandNodeData, gateAmount: number, siblingAcresTotal: number): number {
  if (mode === "manual") return land.manualAmount;
  if (mode === "per_acre") return siblingAcresTotal > 0 ? gateAmount * (land.acres / siblingAcresTotal) : 0;
  return (gateAmount * land.percent) / 100;
}

const NODE_INPUT = "nodrag h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-slate-300";

const PaymentNode = ({ data }: NodeProps) => {
  const d = data as unknown as PaymentNodeData;
  return (
    <div className="w-52 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 rounded-t-lg border-b border-emerald-100 bg-emerald-50 px-3 py-1.5">
        <IndianRupee className="h-3 w-3 text-emerald-600" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Payment</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-base font-extrabold text-slate-900">{inr(d.amount)}</p>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-emerald-600 !bg-white" />
    </div>
  );
};

const GateNode = ({ id, data }: NodeProps) => {
  const d = data as unknown as GateNodeData;
  const { totalAmount, updateGateMode, updateGatePercent, removeGate } = useMeshContext();
  const amount = (totalAmount * d.percent) / 100;

  return (
    <div className="w-56 rounded-lg border border-slate-200 bg-white shadow-sm">
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-amber-500 !bg-white" />
      <div className="flex items-center justify-between rounded-t-lg border-b border-amber-100 bg-amber-50 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-3 w-3 text-amber-600" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Logical Gate</span>
        </div>
        <button type="button" onClick={() => removeGate(id)} className="text-amber-400 hover:text-red-500">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <select
          value={d.mode}
          onChange={(e) => updateGateMode(id, e.target.value as GateMode)}
          className={NODE_INPUT}
        >
          {(Object.keys(GATE_MODE_LABELS) as GateMode[]).map((mode) => (
            <option key={mode} value={mode}>{GATE_MODE_LABELS[mode]}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={100}
            value={Number(d.percent.toFixed(1))}
            onChange={(e) => updateGatePercent(id, Number(e.target.value))}
            className="nodrag h-7 w-14 rounded-md border border-slate-200 bg-white px-1.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-300"
          />
          <span className="text-[11px] font-semibold text-slate-400">%</span>
          <span className="ml-auto text-xs font-bold text-slate-800">{inr(amount)}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-amber-500 !bg-white" />
    </div>
  );
};

const LandNode = ({ id, data }: NodeProps) => {
  const d = data as unknown as LandNodeData;
  const { nodes, edges, farms, farmsLoading, totalAmount, updateLand, updateLandPercent, updateLandAcres, updateLandManual, removeLand } = useMeshContext();

  const gateEdge = edges.find((e) => e.target === id);
  const gateNode = gateEdge ? nodes.find((n) => n.id === gateEdge.source) : undefined;
  const gateData = gateNode?.data as unknown as GateNodeData | undefined;
  const mode: GateMode = gateData?.mode ?? "percentage";
  const gateAmount = gateData ? (totalAmount * gateData.percent) / 100 : totalAmount;

  const siblingLandIds = gateNode ? edges.filter((e) => e.source === gateNode.id).map((e) => e.target) : [];
  const siblingAcresTotal = siblingLandIds.reduce((sum, lid) => {
    const n = nodes.find((nn) => nn.id === lid);
    return sum + ((n?.data as unknown as LandNodeData | undefined)?.acres ?? 0);
  }, 0);

  const amount = computeLandAmount(mode, d, gateAmount, siblingAcresTotal);

  const selectedFarm = farms.find((f) => f.farm_id === d.landId);

  return (
    <div className="w-60 rounded-lg border border-slate-200 bg-white shadow-sm">
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-blue-600 !bg-white" />
      <div className="flex items-center justify-between rounded-t-lg border-b border-blue-100 bg-blue-50 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-blue-600" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Land</span>
        </div>
        <button type="button" onClick={() => removeLand(id)} className="text-blue-400 hover:text-red-500">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-1.5 px-3 py-2.5">
        <select
          value={d.landId}
          onChange={(e) => updateLand(id, e.target.value)}
          className={NODE_INPUT}
        >
          <option value="">{farmsLoading ? "Loading lands…" : "Select land…"}</option>
          {farms.map((f) => (
            <option key={f.farm_id} value={f.farm_id}>
              {f.ownerName ? `${f.ownerName} — ${f.label}` : f.label}
            </option>
          ))}
        </select>
        {selectedFarm?.ownerName && (
          <p className="truncate text-[10px] font-medium text-slate-400">
            Owner: <span className="font-semibold text-slate-600">{selectedFarm.ownerName}</span>
          </p>
        )}
        <div className="flex items-center gap-1.5 pt-0.5">
          {mode === "percentage" && (
            <>
              <input
                type="number"
                min={0}
                max={100}
                value={Number(d.percent.toFixed(1))}
                onChange={(e) => updateLandPercent(id, Number(e.target.value))}
                className="nodrag h-7 w-14 rounded-md border border-slate-200 bg-white px-1.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-300"
              />
              <span className="text-[11px] font-semibold text-slate-400">%</span>
            </>
          )}
          {mode === "per_acre" && (
            <>
              <input
                type="number"
                min={0}
                value={d.acres}
                onChange={(e) => updateLandAcres(id, Number(e.target.value))}
                className="nodrag h-7 w-14 rounded-md border border-slate-200 bg-white px-1.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-300"
              />
              <span className="text-[11px] font-semibold text-slate-400">acres</span>
            </>
          )}
          {mode === "manual" && (
            <input
              type="number"
              min={0}
              value={d.manualAmount}
              onChange={(e) => updateLandManual(id, Number(e.target.value))}
              className="nodrag h-7 w-20 rounded-md border border-slate-200 bg-white px-1.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-300"
              placeholder="₹ amount"
            />
          )}
          <span className="ml-auto text-xs font-bold text-slate-800">{inr(amount)}</span>
        </div>
      </div>
    </div>
  );
};

const nodeTypes = { payment: PaymentNode, gate: GateNode, land: LandNode };
const edgeStyle = { stroke: "#3b82f6", strokeWidth: 2.5 };
const PAYMENT_NODE_ID = "payment-root";

let gateSeq = 0;
const nextGateId = () => `gate-${Date.now()}-${gateSeq++}`;
let landSeq = 0;
const nextLandId = () => `land-${Date.now()}-${landSeq++}`;

export type MeshSummaryRow = { farmId: string; ownerName: string; label: string; acres: number; investment: number; mode: GateMode };
export type MeshSummary = { rows: MeshSummaryRow[]; totalAcres: number; totalInvestment: number };
export type PaymentImpactMeshHandle = { clearAll: () => void; getSummary: () => MeshSummary };

// A previously-saved allocation (from the backend's `linvestment_impact`) — flat farm_id →
// {acres, totalImpact} plus one shared `matrix` mode string, no gate structure or percentages.
// Rebuilt as a single gate on load; amounts are recomputed live from current `totalAmount`
// rather than frozen at their saved figures (per_acre/manual reproduce exactly, percentage is
// back-derived from each farm's saved share of the total and so is only an approximation).
export type SavedImpactFarm = { farmId: string; acres: number; totalImpact: number };
export type SavedImpactData = { matrix?: string; farms: SavedImpactFarm[] };

function parseGateMode(label: string): GateMode {
  const norm = label.trim().toLowerCase();
  if (norm.includes("acre")) return "per_acre";
  if (norm.includes("manual")) return "manual";
  return "percentage";
}

function buildInitialMesh(initialImpact?: SavedImpactData): { nodes: Node[]; edges: Edge[] } {
  const paymentNode: Node = { id: PAYMENT_NODE_ID, type: "payment", position: { x: 40, y: 200 }, data: { amount: 0 }, deletable: false };
  if (!initialImpact || initialImpact.farms.length === 0) {
    return { nodes: [paymentNode], edges: [] };
  }

  const mode = parseGateMode(initialImpact.matrix?.split(",")[0] ?? "");
  const gateId = nextGateId();
  const gateNode: Node = { id: gateId, type: "gate", position: { x: 340, y: 40 }, data: { mode, percent: 100 } };

  const totalImpactSum = initialImpact.farms.reduce((sum, f) => sum + f.totalImpact, 0);
  const edges: Edge[] = [
    { id: `edge-${PAYMENT_NODE_ID}-${gateId}`, source: PAYMENT_NODE_ID, target: gateId, type: "bezier", style: edgeStyle, markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" } },
  ];
  const landNodes: Node[] = initialImpact.farms.map((f, i) => {
    const landId = nextLandId();
    edges.push({ id: `edge-${gateId}-${landId}`, source: gateId, target: landId, type: "bezier", style: edgeStyle, markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" } });
    const data: LandNodeData = {
      landId: f.farmId,
      percent: mode === "percentage" && totalImpactSum > 0 ? (f.totalImpact / totalImpactSum) * 100 : 0,
      acres: f.acres,
      manualAmount: mode === "manual" ? f.totalImpact : 0,
    };
    return { id: landId, type: "land", position: { x: 640, y: 40 + i * 150 }, data };
  });

  return { nodes: [paymentNode, gateNode, ...landNodes], edges };
}

const MeshCanvas = forwardRef<PaymentImpactMeshHandle, { totalAmount: number; initialImpact?: SavedImpactData }>(function MeshCanvas({ totalAmount, initialImpact }, ref) {
  const [seed] = useState(() => buildInitialMesh(initialImpact));
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(seed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(seed.edges);
  const [farms, setFarms] = useState<FarmOption[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(false);
  const ownerFetchedRef = useRef<Set<string>>(new Set());
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    setNodes((prev) => prev.map((n) => (n.id === PAYMENT_NODE_ID ? { ...n, data: { amount: totalAmount } } : n)));
  }, [totalAmount, setNodes]);

  useEffect(() => {
    const ac = new AbortController();
    setFarmsLoading(true);
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/farmer_managment/get_farms`, { signal: ac.signal });
        const data: unknown = await res.json().catch(() => null);
        const d = data as { farms?: unknown[]; data?: unknown[] } | null;
        const list: unknown[] = Array.isArray(d?.farms)
          ? d.farms
          : Array.isArray(d?.data)
          ? d.data
          : Array.isArray(data) ? data : [];
        const options: FarmOption[] = list
          .map((raw) => {
            const f = raw as { farm_id?: string; block_id?: string; land_data?: { village?: string } };
            const farmId = safeStr(f.farm_id);
            if (!farmId) return null;
            const label = [farmId, safeStr(f.land_data?.village), safeStr(f.block_id)].filter(Boolean).join(" — ");
            return { farm_id: farmId, label };
          })
          .filter((f): f is FarmOption => f !== null);
        setFarms(options);
      } catch {
        // best-effort — dropdown just stays empty/loading
      } finally {
        setFarmsLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  // Land owner names come from a separate lookup (the farm list itself doesn't carry them).
  // Fetched in one batched call for every farm id at once — firing one request per farm here
  // flooded the backend's DynamoDB connection pool and most lookups failed silently.
  useEffect(() => {
    const toFetch = farms.filter((f) => !ownerFetchedRef.current.has(f.farm_id));
    if (toFetch.length === 0) return;
    toFetch.forEach((f) => ownerFetchedRef.current.add(f.farm_id));
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/farmer_managment/get_farmer_names_bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ farm_ids: toFetch.map((f) => f.farm_id) }),
          signal: ac.signal,
        });
        const data: { success?: boolean; data?: Record<string, string> } | null = await res.json().catch(() => null);
        if (!res.ok || !data?.success || !data.data) return;
        const names = data.data;
        setFarms((prev) => prev.map((p) => (names[p.farm_id] ? { ...p, ownerName: names[p.farm_id] } : p)));
      } catch {
        // best-effort — dropdown just shows farm id/village without an owner name
      }
    })();
    return () => ac.abort();
  }, [farms]);

  // Gates split the payment's total the same way lands used to — no parent scoping needed,
  // since every gate hangs directly off the single Payment node.
  const equalizeGatePercents = useCallback(() => {
    setNodes((prev) => {
      const gateCount = prev.filter((n) => n.type === "gate").length;
      const share = gateCount ? 100 / gateCount : 0;
      return prev.map((n) => (n.type === "gate" ? { ...n, data: { ...n.data, percent: share } } : n));
    });
  }, [setNodes]);

  // `add`/`remove` let callers fold in an edge change that hasn't landed in `edges` state yet
  // (setEdges + this call happen back-to-back, so reading `edges` here would still see the old
  // list) — the caller tells us directly which land id is entering/leaving the gate's group.
  const equalizeLandPercents = useCallback((gateId: string, opts?: { add?: string; remove?: string }) => {
    setNodes((prev) => {
      let siblingIds = edges.filter((e) => e.source === gateId).map((e) => e.target);
      if (opts?.add) siblingIds = [...siblingIds, opts.add];
      if (opts?.remove) siblingIds = siblingIds.filter((lid) => lid !== opts.remove);
      const share = siblingIds.length ? 100 / siblingIds.length : 0;
      return prev.map((n) => (n.type === "land" && siblingIds.includes(n.id) ? { ...n, data: { ...n.data, percent: share } } : n));
    });
  }, [setNodes, edges]);

  const updateLand = useCallback((id: string, landId: string) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, landId } } : n)));
  }, [setNodes]);

  const updateLandPercent = useCallback((id: string, percent: number) => {
    const gateEdge = edges.find((e) => e.target === id);
    const siblingIds = gateEdge ? edges.filter((e) => e.source === gateEdge.source).map((e) => e.target) : [id];
    setNodes((prev) => {
      const landNodes = prev.filter((n) => n.type === "land" && siblingIds.includes(n.id));
      const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
      const others = landNodes.filter((n) => n.id !== id);
      const remainder = 100 - clamped;
      const othersTotal = others.reduce((sum, n) => sum + ((n.data as unknown as LandNodeData).percent ?? 0), 0);
      return prev.map((n) => {
        if (n.type !== "land" || !siblingIds.includes(n.id)) return n;
        if (n.id === id) return { ...n, data: { ...n.data, percent: clamped } };
        const current = (n.data as unknown as LandNodeData).percent ?? 0;
        const share = othersTotal > 0 ? (current / othersTotal) * remainder : others.length ? remainder / others.length : 0;
        return { ...n, data: { ...n.data, percent: share } };
      });
    });
  }, [setNodes, edges]);

  const updateLandAcres = useCallback((id: string, acres: number) => {
    const clamped = Math.max(0, Number.isFinite(acres) ? acres : 0);
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, acres: clamped } } : n)));
  }, [setNodes]);

  const updateLandManual = useCallback((id: string, amount: number) => {
    const clamped = Math.max(0, Number.isFinite(amount) ? amount : 0);
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, manualAmount: clamped } } : n)));
  }, [setNodes]);

  const removeLand = useCallback((id: string) => {
    const gateEdge = edges.find((e) => e.target === id);
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
    if (gateEdge) equalizeLandPercents(gateEdge.source, { remove: id });
  }, [setNodes, setEdges, edges, equalizeLandPercents]);

  const updateGateMode = useCallback((id: string, mode: GateMode) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, mode } } : n)));
  }, [setNodes]);

  const updateGatePercent = useCallback((id: string, percent: number) => {
    setNodes((prev) => {
      const gateNodes = prev.filter((n) => n.type === "gate");
      const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
      const others = gateNodes.filter((n) => n.id !== id);
      const remainder = 100 - clamped;
      const othersTotal = others.reduce((sum, n) => sum + ((n.data as unknown as GateNodeData).percent ?? 0), 0);
      return prev.map((n) => {
        if (n.type !== "gate") return n;
        if (n.id === id) return { ...n, data: { ...n.data, percent: clamped } };
        const current = (n.data as unknown as GateNodeData).percent ?? 0;
        const share = othersTotal > 0 ? (current / othersTotal) * remainder : others.length ? remainder / others.length : 0;
        return { ...n, data: { ...n.data, percent: share } };
      });
    });
  }, [setNodes]);

  const removeGate = useCallback((id: string) => {
    const landIds = edges.filter((e) => e.source === id).map((e) => e.target);
    setNodes((prev) => prev.filter((n) => n.id !== id && !landIds.includes(n.id)));
    setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id && !landIds.includes(e.target)));
    equalizeGatePercents();
  }, [setNodes, setEdges, edges, equalizeGatePercents]);

  const clearAll = useCallback(() => {
    setNodes((prev) => prev.filter((n) => n.id === PAYMENT_NODE_ID));
    setEdges([]);
  }, [setNodes, setEdges]);

  const getSummary = useCallback((): MeshSummary => {
    const rows: MeshSummaryRow[] = nodes
      .filter((n) => n.type === "land")
      .map((n) => {
        const d = n.data as unknown as LandNodeData;
        const gateEdge = edges.find((e) => e.target === n.id);
        const gateNode = gateEdge ? nodes.find((nn) => nn.id === gateEdge.source) : undefined;
        const gateData = gateNode?.data as unknown as GateNodeData | undefined;
        const mode: GateMode = gateData?.mode ?? "percentage";
        const gateAmount = gateData ? (totalAmount * gateData.percent) / 100 : totalAmount;

        const siblingLandIds = gateNode ? edges.filter((e) => e.source === gateNode.id).map((e) => e.target) : [];
        const siblingAcresTotal = siblingLandIds.reduce((sum, lid) => {
          const sib = nodes.find((nn) => nn.id === lid);
          return sum + ((sib?.data as unknown as LandNodeData | undefined)?.acres ?? 0);
        }, 0);

        const farm = farms.find((f) => f.farm_id === d.landId);
        return {
          farmId: d.landId,
          ownerName: farm?.ownerName || "",
          label: farm?.label || "",
          acres: d.acres,
          investment: computeLandAmount(mode, d, gateAmount, siblingAcresTotal),
          mode,
        };
      });
    return {
      rows,
      totalAcres: rows.reduce((sum, r) => sum + r.acres, 0),
      totalInvestment: rows.reduce((sum, r) => sum + r.investment, 0),
    };
  }, [nodes, edges, farms, totalAmount]);

  useImperativeHandle(ref, () => ({ clearAll, getSummary }), [clearAll, getSummary]);

  // Enforce the Payment → Gate → Land chain on manual (existing-node-to-existing-node) drags too.
  const isValidConnection = useCallback((connection: Connection | Edge) => {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (!sourceNode || !targetNode) return false;
    if (sourceNode.type === "payment") return targetNode.type === "gate";
    if (sourceNode.type === "gate") return targetNode.type === "land";
    return false;
  }, [nodes]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((prev) =>
      addEdge({ ...connection, type: "bezier", style: edgeStyle, markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" } }, prev),
    );
  }, [setEdges]);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: { isValid: boolean | null; fromNode: { id: string } | null }) => {
      if (connectionState.isValid || !connectionState.fromNode) return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      if (!point) return;
      const fromId = connectionState.fromNode.id;
      const fromNode = nodes.find((n) => n.id === fromId);
      if (!fromNode) return;
      const position = screenToFlowPosition({ x: point.clientX, y: point.clientY });

      if (fromNode.type === "payment") {
        const id = nextGateId();
        const newNode: Node = { id, type: "gate", position, data: { mode: "percentage", percent: 0 } };
        setNodes((prev) => [...prev, newNode]);
        setEdges((prev) =>
          addEdge({ id: `edge-${fromId}-${id}`, source: fromId, target: id, type: "bezier", style: edgeStyle, markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" } }, prev),
        );
        equalizeGatePercents();
      } else if (fromNode.type === "gate") {
        const id = nextLandId();
        const newNode: Node = { id, type: "land", position, data: { landId: "", percent: 0, acres: 0, manualAmount: 0 } };
        setNodes((prev) => [...prev, newNode]);
        setEdges((prev) =>
          addEdge({ id: `edge-${fromId}-${id}`, source: fromId, target: id, type: "bezier", style: edgeStyle, markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" } }, prev),
        );
        equalizeLandPercents(fromId, { add: id });
      }
    },
    [nodes, screenToFlowPosition, setNodes, setEdges, equalizeGatePercents, equalizeLandPercents],
  );

  return (
    <MeshContext.Provider value={{ nodes, edges, farms, farmsLoading, totalAmount, updateGateMode, updateGatePercent, removeGate, updateLand, updateLandPercent, updateLandAcres, updateLandManual, removeLand }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{ type: "bezier", style: edgeStyle }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </MeshContext.Provider>
  );
});

export const DocPreviewPane = ({ doc }: { doc: SupportingDocument }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setScale(width / DOC_BASE_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc.doc_link]);

  const isImage = /\.(jpe?g|png|gif|webp|bmp)(\?|#|$)/i.test(doc.doc_link);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      {isImage ? (
        <div className="h-full w-full overflow-auto">
          <img src={doc.doc_link} alt={doc.document} className="block w-full h-auto" />
        </div>
      ) : (
        <div ref={wrapRef} className="h-full w-full overflow-auto">
          <iframe
            src={`${doc.doc_link}#view=FitH`}
            title={doc.document}
            style={{ width: DOC_BASE_WIDTH, height: DOC_BASE_WIDTH * 1.414, transform: `scale(${scale})`, transformOrigin: "top left", border: 0 }}
          />
        </div>
      )}
    </div>
  );
};

export type PaymentImpactMeshProps = {
  totalAmount: number;
  docs: SupportingDocument[];
  docsLoading: boolean;
  initialImpact?: SavedImpactData;
};

export const PaymentImpactMesh = forwardRef<PaymentImpactMeshHandle, PaymentImpactMeshProps>(function PaymentImpactMesh({ totalAmount, docs, docsLoading, initialImpact }, ref) {
  const [selectedDoc, setSelectedDoc] = useState<SupportingDocument | null>(null);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">Impact Calculation</h3>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Payment → Gate (split logic) → Land. Drag from a node's handle onto empty canvas to add the next one.
        </p>
      </div>

      <div className="mt-4 flex gap-4" style={{ height: 560 }}>
        <div className="flex w-[30%] shrink-0 flex-col gap-3">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Supporting Documents</p>

          {docsLoading && docs.length === 0 && <p className="text-xs font-semibold text-slate-400">Loading documents…</p>}
          {!docsLoading && docs.length === 0 && (
            <p className="text-xs font-semibold text-slate-400">No documents on file for this order.</p>
          )}

          {docs.length > 0 && (
            <select
              value={selectedDoc?.doc_link ?? ""}
              onChange={(e) => setSelectedDoc(docs.find((d) => d.doc_link === e.target.value) ?? null)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none focus:border-slate-300"
            >
              <option value="" disabled>Select document type…</option>
              {docs.map((d, i) => (
                <option key={`${d.document}-${i}`} value={d.doc_link}>{d.document}</option>
              ))}
            </select>
          )}

          {selectedDoc && (
            <>
              <div className="min-h-0 flex-1">
                <DocPreviewPane doc={selectedDoc} />
              </div>
              <a
                href={selectedDoc.doc_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 self-end text-xs font-semibold text-blue-600 hover:underline"
              >
                Open in new tab <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
        </div>

        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-slate-200">
          <ReactFlowProvider>
            <MeshCanvas ref={ref} totalAmount={totalAmount} initialImpact={initialImpact} />
          </ReactFlowProvider>
        </div>
      </div>
    </section>
  );
});

export default PaymentImpactMesh;
