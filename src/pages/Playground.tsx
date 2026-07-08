import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as XLSX from "xlsx";
import { X, Sparkles, ChevronDown, Check } from "lucide-react";
import getBaseUrl from "@/lib/config";
import { formatInr } from "@/services/projectData";

type PlaygroundProps = {
  budgetId?: string;
  onClose: () => void;
};

type AllocationEntry = {
  row_number: number;
  line_item: string;
  category: string;
  type: string;
  budgeted: number;
  allocated: number;
};

type PurchaseFlowRecord = {
  flow_id?: string;
  comparison_id?: string;
  order_number?: string;
  order_type?: string;
  budget_allocation?: Record<string, AllocationEntry[]>;
};

type OrderNodeData = {
  orderNumber: string;
  orderType: string;
  totalAllocated: number;
  lineItemCount: number;
};

type LineItemNodeData = {
  lineItem: string;
  category: string;
  type: string;
  budgeted: number;
  totalAllocated: number;
};

type DisbursementNodeData = {
  weeks: Record<string, number>;
};

const ORDER_COLUMN_X = 40;
const ITEM_COLUMN_X = 500;
const DISBURSEMENT_COLUMN_X = 980;
const ROW_HEIGHT = 140;
const DISBURSEMENT_SHEET_NAME = "ERP Disbursement";

// budget_allocation's row_number is local to each purchase flow's own allocation list (every
// flow restarts at 1) — it does NOT identify a specific budget row across different orders.
// The (name, category, type) triple is what's actually consistent for the same line item
// across flows, so that's the real identity to dedupe/key nodes on.
const getLineItemKey = (entry: AllocationEntry) => `${entry.line_item}::${entry.category}::${entry.type}`;
const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const OrderNode = ({ data }: any) => {
  const d = data as OrderNodeData;
  return (
    <div className="w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-slate-900 !bg-emerald-500" />
      <div className="border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-300">{d.orderType || "Order"}</p>
        <h3 className="mt-0.5 truncate text-sm font-bold" title={d.orderNumber}>{d.orderNumber}</h3>
      </div>
      <div className="space-y-1 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total Allocated</p>
        <p className="text-lg font-extrabold text-emerald-700">{formatInr(d.totalAllocated)}</p>
        <p className="text-[11px] font-medium text-slate-400">{d.lineItemCount} line item{d.lineItemCount === 1 ? "" : "s"}</p>
      </div>
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LineItemNode = ({ data }: any) => {
  const d = data as LineItemNodeData;
  return (
    <div className="w-64 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-lg">
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-violet-900 !bg-violet-400" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-amber-900 !bg-amber-400" />
      <div className="border-b border-violet-100 bg-violet-50 px-4 py-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-violet-500">{d.category} · {d.type}</p>
        <h3 className="mt-0.5 truncate text-sm font-bold text-slate-900" title={d.lineItem}>{d.lineItem}</h3>
      </div>
      <div className="space-y-1 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Allocated / Budgeted</p>
        <p className="text-sm font-extrabold text-violet-700">
          {formatInr(d.totalAllocated)} <span className="text-slate-300">/</span> {formatInr(d.budgeted)}
        </p>
      </div>
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DisbursementNode = ({ data }: any) => {
  const d = data as DisbursementNodeData;
  const weekEntries = Object.entries(d.weeks).filter(([, amt]) => amt > 0);
  const total = weekEntries.reduce((sum, [, amt]) => sum + amt, 0);
  return (
    <div className="w-64 overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-lg">
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-amber-900 !bg-amber-400" />
      <div className="border-b border-amber-100 bg-amber-50 px-4 py-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-600">Disbursement Sequence</p>
        {weekEntries.length > 0 && <p className="mt-0.5 text-sm font-bold text-slate-900">{formatInr(total)}</p>}
      </div>
      <div className="max-h-36 space-y-1 overflow-y-auto px-4 py-3">
        {weekEntries.length === 0 ? (
          <p className="text-[11px] font-medium text-slate-400">No disbursement data yet</p>
        ) : (
          weekEntries.map(([week, amt]) => (
            <div key={week} className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-500">{week}</span>
              <span className="font-bold text-amber-700 tabular-nums">{formatInr(amt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: any = { orderNode: OrderNode, lineItemNode: LineItemNode, disbursementNode: DisbursementNode };

type FilterOption = { value: string; label: string; sublabel?: string };

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-colors",
          selected.length > 0
            ? "border-violet-300 bg-violet-50 text-violet-700"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        ].join(" ")}
      >
        {label}
        <span className="text-slate-400">{selected.length > 0 ? `(${selected.length})` : "(All)"}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
          {options.length === 0 ? (
            <p className="px-2 py-2 text-xs font-medium text-slate-400">No options</p>
          ) : (
            <>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="mb-1 w-full rounded-md px-2 py-1 text-left text-[11px] font-bold text-violet-600 hover:bg-violet-50"
                >
                  Clear selection
                </button>
              )}
              {options.map((opt) => {
                const isSelected = selected.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-50"
                  >
                    <span
                      className={[
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        isSelected ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white",
                      ].join(" ")}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </span>
                    <input type="checkbox" checked={isSelected} onChange={() => toggle(opt.value)} className="hidden" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-700">{opt.label}</span>
                      {opt.sublabel && <span className="block truncate text-[10px] text-slate-400">{opt.sublabel}</span>}
                    </span>
                  </label>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AllocationMesh({ budgetId }: { budgetId: string }) {
  const [flows, setFlows] = useState<PurchaseFlowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedLineItems, setSelectedLineItems] = useState<string[]>([]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // normalized line_item name -> line_item_id (the budget sheet's own id), needed because the
  // ERP Disbursement sheet is keyed by line_item_id, not by anything budget_allocation exposes.
  const [lineItemIdByName, setLineItemIdByName] = useState<Map<string, string>>(new Map());
  const [disbursementByLineItemId, setDisbursementByLineItemId] = useState<Map<string, Record<string, number>>>(
    new Map()
  );

  useEffect(() => {
    const ac = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/purchase_flow/get_purchase_flows`, { signal: ac.signal });
        if (!res.ok) throw new Error(`Failed to fetch purchase flows (${res.status})`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json: any = await res.json();
        const list: PurchaseFlowRecord[] = Array.isArray(json?.purchase_flows) ? json.purchase_flows : [];
        setFlows(list);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Failed to load allocation data");
        }
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => ac.abort();
  }, [budgetId]);

  // Pull the budget's own xlsx to build the row_number -> line_item_id map (from the "budget"
  // sheet) and the line_item_id -> weekly amounts map (from the "ERP Disbursement" sheet, if any).
  useEffect(() => {
    const ac = new AbortController();
    const load = async () => {
      try {
        const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_budget/${budgetId}`, { signal: ac.signal });
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wb = (XLSX as any).read(new Uint8Array(buf), { type: "array" });

        // budget_allocation's row_number is local to each purchase flow's own allocation list
        // (every flow restarts at 1), so it can't be used to find the matching "budget" sheet
        // row. line_item name is the only field both sides share — match on that instead.
        const nameMap = new Map<string, string>();
        const budgetWs = wb.Sheets["budget"];
        if (budgetWs) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rows: any[] = XLSX.utils.sheet_to_json(budgetWs);
          rows.forEach((row) => {
            const name = String(row.line_item ?? "").trim().toLowerCase();
            const lineItemId = String(row.line_item_id ?? "");
            if (name && lineItemId && !nameMap.has(name)) nameMap.set(name, lineItemId);
          });
        }
        setLineItemIdByName(nameMap);

        const disbMap = new Map<string, Record<string, number>>();
        const disbWs = wb.Sheets[DISBURSEMENT_SHEET_NAME];
        if (disbWs) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rows: any[] = XLSX.utils.sheet_to_json(disbWs);
          rows.forEach((row) => {
            const lineItemId = String(row.line_item_id ?? "");
            if (!lineItemId) return;
            const weeks: Record<string, number> = {};
            Object.entries(row).forEach(([key, value]) => {
              if (key === "line_item_id" || key === "line_item") return;
              const num = Number(value);
              if (num) weeks[key] = num;
            });
            disbMap.set(lineItemId, weeks);
          });
        }
        setDisbursementByLineItemId(disbMap);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== "AbortError") {
          // Non-fatal — disbursement nodes just show "No disbursement data yet".
        }
      }
    };
    load();
    return () => ac.abort();
  }, [budgetId]);

  // All orders that have any allocation against this budget — the base universe, unaffected by filters.
  const allRelevantFlows = useMemo(
    () =>
      flows.filter(
        (flow) => Array.isArray(flow.budget_allocation?.[budgetId]) && flow.budget_allocation![budgetId].length > 0
      ),
    [flows, budgetId]
  );

  const orderOptions = useMemo<FilterOption[]>(
    () =>
      allRelevantFlows.map((flow, idx) => ({
        value: flow.order_number || `unknown-${idx}`,
        label: flow.order_number || "Unknown order",
        sublabel: flow.order_type,
      })),
    [allRelevantFlows]
  );

  // Orders currently in scope after the order filter — line item options cascade from this set.
  const orderScopedFlows = useMemo(
    () =>
      selectedOrders.length === 0
        ? allRelevantFlows
        : allRelevantFlows.filter((flow) => selectedOrders.includes(flow.order_number || "")),
    [allRelevantFlows, selectedOrders]
  );

  const lineItemOptions = useMemo<FilterOption[]>(() => {
    const byKey = new Map<string, FilterOption>();
    orderScopedFlows.forEach((flow) => {
      flow.budget_allocation![budgetId].forEach((entry) => {
        const key = getLineItemKey(entry);
        if (!byKey.has(key)) {
          byKey.set(key, {
            value: key,
            label: entry.line_item,
            sublabel: `${entry.category} · ${entry.type}`,
          });
        }
      });
    });
    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [orderScopedFlows, budgetId]);

  // Drop line-item selections that fell out of scope when the order filter changed.
  useEffect(() => {
    setSelectedLineItems((prev) => {
      const validValues = new Set(lineItemOptions.map((o) => o.value));
      const next = prev.filter((v) => validValues.has(v));
      return next.length === prev.length ? prev : next;
    });
  }, [lineItemOptions]);

  const { nodes: computedNodes, edges: computedEdges } = useMemo(() => {
    const orderNodes: Node[] = [];
    const lineItemNodesByKey = new Map<string, Node>();
    const disbursementNodesByKey = new Map<string, Node>();
    const meshEdges: Edge[] = [];

    orderScopedFlows.forEach((flow, orderIdx) => {
      const entries = flow.budget_allocation![budgetId].filter(
        (entry) => selectedLineItems.length === 0 || selectedLineItems.includes(getLineItemKey(entry))
      );
      if (entries.length === 0) return;

      const orderId = `order-${flow.flow_id || flow.comparison_id || orderIdx}`;
      const totalAllocated = entries.reduce((sum, e) => sum + (Number(e.allocated) || 0), 0);

      orderNodes.push({
        id: orderId,
        type: "orderNode",
        position: { x: ORDER_COLUMN_X, y: orderNodes.length * ROW_HEIGHT },
        data: {
          orderNumber: flow.order_number || "Unknown order",
          orderType: flow.order_type || "",
          totalAllocated,
          lineItemCount: entries.length,
        },
      });

      entries.forEach((entry) => {
        const itemKey = getLineItemKey(entry);
        const itemId = `item-${slugify(itemKey)}`;
        if (!lineItemNodesByKey.has(itemKey)) {
          lineItemNodesByKey.set(itemKey, {
            id: itemId,
            type: "lineItemNode",
            position: { x: ITEM_COLUMN_X, y: 0 },
            data: {
              lineItem: entry.line_item,
              category: entry.category,
              type: entry.type,
              budgeted: Number(entry.budgeted) || 0,
              totalAllocated: 0,
            },
          });
        }
        const itemNode = lineItemNodesByKey.get(itemKey)!;
        const itemData = itemNode.data as unknown as LineItemNodeData;
        itemData.totalAllocated += Number(entry.allocated) || 0;

        meshEdges.push({
          id: `edge-${orderId}-${itemId}`,
          source: orderId,
          target: itemId,
          label: formatInr(Number(entry.allocated) || 0),
          style: { stroke: "#8b5cf6", strokeWidth: 1.5 },
          labelStyle: { fill: "#6d28d9", fontWeight: 700, fontSize: 11 },
          labelBgStyle: { fill: "#f5f3ff" },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 4,
        });

        // One disbursement node per line item, fed off the "budget"/"ERP Disbursement" sheets
        // (matched by name — see the lineItemIdByName fetch above) rather than the purchase-flow
        // data used for the rest of the mesh.
        const disbId = `disb-${slugify(itemKey)}`;
        if (!disbursementNodesByKey.has(itemKey)) {
          const lineItemId = lineItemIdByName.get(entry.line_item.trim().toLowerCase());
          const weeks = (lineItemId && disbursementByLineItemId.get(lineItemId)) || {};
          disbursementNodesByKey.set(itemKey, {
            id: disbId,
            type: "disbursementNode",
            position: { x: DISBURSEMENT_COLUMN_X, y: 0 },
            data: { weeks },
          });
          meshEdges.push({
            id: `edge-${itemId}-${disbId}`,
            source: itemId,
            target: disbId,
            style: { stroke: "#f59e0b", strokeWidth: 1.5 },
          });
        }
      });
    });

    const lineItemNodes = Array.from(lineItemNodesByKey.values())
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((node, idx) => ({ ...node, position: { x: ITEM_COLUMN_X, y: idx * ROW_HEIGHT } }));

    const disbursementNodes = Array.from(disbursementNodesByKey.values())
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((node, idx) => ({ ...node, position: { x: DISBURSEMENT_COLUMN_X, y: idx * ROW_HEIGHT } }));

    return { nodes: [...orderNodes, ...lineItemNodes, ...disbursementNodes], edges: meshEdges };
  }, [orderScopedFlows, budgetId, selectedLineItems, lineItemIdByName, disbursementByLineItemId]);

  // Push freshly computed layout into the draggable node/edge state whenever the underlying
  // data or filters change — but NOT on every render, so manual drags persist in between.
  useEffect(() => {
    setNodes(computedNodes);
    setEdges(computedEdges);
  }, [computedNodes, computedEdges, setNodes, setEdges]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm font-semibold text-slate-400">Loading allocation mesh…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm font-semibold text-red-500">{error}</p>
      </div>
    );
  }

  if (allRelevantFlows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm font-semibold text-slate-400">No purchase orders have drawn from this budget yet.</p>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(node) =>
            node.type === "orderNode" ? "#0f172a" : node.type === "disbursementNode" ? "#f59e0b" : "#8b5cf6"
          }
          pannable
          zoomable
        />
        <Panel position="top-left">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-md backdrop-blur">
            <MultiSelectFilter label="Orders" options={orderOptions} selected={selectedOrders} onChange={setSelectedOrders} />
            <MultiSelectFilter
              label="Line Items"
              options={lineItemOptions}
              selected={selectedLineItems}
              onChange={setSelectedLineItems}
            />
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export default function Playground({ budgetId, onClose }: PlaygroundProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/45 p-4">
      <div className="flex h-[calc(100vh-2rem)] w-full max-w-[1400px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100">
              <Sparkles className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">AI Playground</h2>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">Order → Line Item → Disbursement Sequence mesh</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {budgetId ? (
            <ReactFlowProvider>
              <AllocationMesh budgetId={budgetId} />
            </ReactFlowProvider>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm font-semibold text-slate-400">No budget selected.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
