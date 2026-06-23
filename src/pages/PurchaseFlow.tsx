import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Boxes, Check, ChevronDown, ChevronLeft, ChevronRight, FileText, Lock, Plus, Receipt, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import getBaseUrl from '@/lib/config';
import { toast } from 'sonner';

type LeftPanelInfo = {
  pr_number?: string;
  indent_type?: string;
  department?: string | null;
  vendor_details?: {
    approved_vendor_id?: string;
    vendor_name?: string;
    vendor_contact?: string;
    vendor_address?: string;
    gst_number?: string;
  } | null;
  Order_number?: string;
};

type ApiPurchaseFlowStageEntry = {
  document?: unknown;
  status?: unknown;
  doc_link?: unknown;
};

type ApiPurchaseFlow = {
  comparison_id?: unknown;
  flow_id?: unknown;
  order_number?: unknown;
  pr_number?: unknown;
  purchase_flow_stage?: unknown;
  timestamp?: unknown;
};

type ApiGetPurchaseFlowsResponse = {
  purchase_flows?: unknown;
};

type PurchaseFlowStep = {
  key: string;
  index: number;
  document: string;
  status: string;
  docLink: string;
  isLocal?: boolean; // true for user-inserted invoice steps (not from API)
};

const safeTrim = (v: unknown) => String(v ?? '').trim();

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

const parseStepIndex = (key: string): number | null => {
  const m = String(key).match(/step_(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

const parseSteps = (stageUnknown: unknown): PurchaseFlowStep[] => {
  const stage = asRecord(stageUnknown);
  const out: PurchaseFlowStep[] = [];
  for (const [key, entryUnknown] of Object.entries(stage)) {
    const index = parseStepIndex(key);
    if (!index) continue;
    const entry = asRecord(entryUnknown) as ApiPurchaseFlowStageEntry;
    out.push({
      key,
      index,
      document: safeTrim(entry.document) || key,
      status: safeTrim(entry.status) || 'empty',
      docLink: safeTrim(entry.doc_link),
    });
  }
  return out.sort((a, b) => a.index - b.index);
};

const isUploaded = (s: PurchaseFlowStep) => {
  const st = safeTrim(s.status).toLowerCase();
  if (s.docLink) return true;
  if (!st) return false;
  return st !== 'empty';
};

const isInvoiceDocType = (doc: string) => {
  const d = doc.trim().toLowerCase();
  return d === 'invoice' || d === 'proforma invoice';
};

const formatDateTime = (raw?: string) => {
  const v = safeTrim(raw);
  if (!v) return '';
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return v;
  try {
    return new Intl.DateTimeFormat('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
};

async function fetchPurchaseFlows(signal?: AbortSignal): Promise<ApiPurchaseFlow[]> {
  const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('API base URL is not set');

  const url = `${baseUrl}/purchase_flow/get_purchase_flows`;
  const doFetch = (method: 'GET' | 'POST') =>
    fetch(url, {
      method,
      headers: { Accept: 'application/json' },
      signal,
    });

  let res = await doFetch('GET');
  if (res.status === 405) res = await doFetch('POST');

  const text = await res.text().catch(() => '');
  let data: ApiGetPurchaseFlowsResponse | null = null;
  try {
    data = text ? (JSON.parse(text) as ApiGetPurchaseFlowsResponse) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      safeTrim((data as any)?.message) ||
      safeTrim((data as any)?.error) ||
      text ||
      `Failed to load purchase flows (HTTP ${res.status})`;
    throw new Error(message);
  }

  const list = (data as any)?.purchase_flows;
  return Array.isArray(list) ? (list as ApiPurchaseFlow[]) : [];
}

function UploadStepDocPopup({
  title,
  onClose,
  onUpload,
}: {
  title: string;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return toast.error('Select a file');
    setUploading(true);
    try {
      await onUpload(file);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? 'Upload failed');
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold text-sm">Upload Document</div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <div className="text-xs text-muted-foreground">Step</div>
            <div className="text-sm font-semibold">{title}</div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">File</label>
            <label className="flex items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed border-border bg-background px-4 py-6 cursor-pointer hover:bg-muted transition-colors">
              <Upload className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{file ? file.name : 'Click to select file'}</span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button onClick={handleUpload} className="gap-2" disabled={uploading}>
            <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddToInventoryPopup({
  poNumber,
  onClose,
}: {
  poNumber: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Array<{ id: string; name: string; sku: string; unit: string }>>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchItems = async () => {
      setLoadingItems(true);
      try {
        const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
        const res = await fetch(`${baseUrl}/inventory/get_all_item`);
        const data: any = await res.json().catch(() => null);
        if (res.ok && data?.success && Array.isArray(data?.items)) {
          setItems(
            data.items.map((it: any) => ({
              id: String(it?.Invent_id || it?.new_item_code || ''),
              name: String(it?.item_name || ''),
              sku: String(it?.new_item_code || ''),
              unit: String(it?.unit || ''),
            }))
          );
        }
      } catch {
        // stay empty
      } finally {
        setLoadingItems(false);
      }
    };
    fetchItems();
  }, []);

  const selectedItem = items.find((it) => it.id === selectedItemId);
  const totalValue = Number(quantity) > 0 && Number(pricePerUnit) > 0
    ? Number(quantity) * Number(pricePerUnit)
    : null;

  const handleSubmit = async () => {
    if (!selectedItemId) return toast.error('Please select an item');
    if (!quantity || Number(quantity) <= 0) return toast.error('Enter a valid quantity');
    if (!pricePerUnit || Number(pricePerUnit) <= 0) return toast.error('Enter a valid price per unit');
    setSubmitting(true);
    try {
      const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/purchase_flow/add_item_stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedItemId,
          stock_added: Number(quantity),
          po_number: poNumber,
          per_unit_cost: Number(pricePerUnit),
        }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to add to inventory');
      toast.success(data?.message || 'Stock updated successfully');
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add to inventory');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-green-600" />
            <span className="font-semibold text-sm">Add to Inventory</span>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* PO badge */}
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <div className="text-xs text-muted-foreground">PO Number</div>
            <div className="text-sm font-semibold">{poNumber || '—'}</div>
          </div>

          {/* Item selector */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Select Item</label>
            <div className="relative">
              <select
                className="w-full appearance-none border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-green-500 pr-8 disabled:opacity-50"
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                disabled={loadingItems}
              >
                <option value="">{loadingItems ? 'Loading items…' : 'Select inventory item'}</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}{it.sku ? ` (${it.sku})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Quantity + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Incoming Qty{selectedItem?.unit ? ` (${selectedItem.unit})` : ''}
              </label>
              <input
                type="number"
                min={1}
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Price per Unit (₹)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Total value preview */}
          {totalValue !== null && (
            <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-700 font-medium">
              Total value: ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            <Boxes className="w-4 h-4" />
            {submitting ? 'Adding…' : 'Add to Inventory'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PurchaseFlow() {
  const navigate = useNavigate();
  const [flows, setFlows] = useState<ApiPurchaseFlow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{
    flow: ApiPurchaseFlow;
    step: PurchaseFlowStep;
  } | null>(null);
  const [addToInventoryFor, setAddToInventoryFor] = useState<{ poNumber: string } | null>(null);
  const [forwardingSteps, setForwardingSteps] = useState<Set<string>>(new Set());

  // Per-flow merged step lists (API steps + locally inserted invoice steps)
  const [flowStepOverrides, setFlowStepOverrides] = useState<Record<string, PurchaseFlowStep[]>>({});
  // Which flow's "+ Add Invoice" dropdown is open
  const [addMenuOpenFor, setAddMenuOpenFor] = useState<string | null>(null);

  const getFlowSteps = (flowId: string, flow: ApiPurchaseFlow): PurchaseFlowStep[] =>
    flowStepOverrides[flowId] ?? parseSteps((flow as any)?.purchase_flow_stage);

  const toggleLocalStepDone = (flowId: string, flow: ApiPurchaseFlow, stepKey: string) => {
    const current = getFlowSteps(flowId, flow);
    setFlowStepOverrides((prev) => ({
      ...prev,
      [flowId]: current.map((s) =>
        s.key === stepKey ? { ...s, status: s.status === 'completed' ? 'empty' : 'completed' } : s
      ),
    }));
  };

  const addInvoiceStep = (flowId: string, flow: ApiPurchaseFlow, docType: 'Proforma Invoice' | 'Invoice' | 'PRR (for payment)' | 'PRR (for accounting)') => {
    const current = getFlowSteps(flowId, flow);
    const newStep: PurchaseFlowStep = {
      key: `local-${Date.now()}`,
      index: current.length + 1,
      document: docType,
      status: 'empty',
      docLink: '',
      isLocal: true,
    };
    setFlowStepOverrides((prev) => ({ ...prev, [flowId]: [...current, newStep] }));
    setAddMenuOpenFor(null);
  };

  const moveStep = (flowId: string, flow: ApiPurchaseFlow, stepKey: string, dir: 'left' | 'right') => {
    const current = getFlowSteps(flowId, flow);
    const idx = current.findIndex((s) => s.key === stepKey);
    if (idx === -1) return;
    const target = dir === 'left' ? idx - 1 : idx + 1;
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    [next[idx], next[target]] = [next[target], next[idx]];
    setFlowStepOverrides((prev) => ({ ...prev, [flowId]: next }));
    // Mark this flow as having an unsaved reorder — blocks uploads until saved
    setPendingReorderSet((prev) => new Set([...prev, flowId]));
  };

  const removeLocalStep = (flowId: string, flow: ApiPurchaseFlow, stepKey: string) => {
    const current = getFlowSteps(flowId, flow);
    setFlowStepOverrides((prev) => ({ ...prev, [flowId]: current.filter((s) => s.key !== stepKey) }));
  };

  // Per-flow save loading state
  const [savingFlows, setSavingFlows] = useState<Record<string, boolean>>({});

  // Tracks flows whose steps have been reordered but not yet saved.
  // Upload is blocked for these flows until the user saves.
  const [pendingReorderSet, setPendingReorderSet] = useState<Set<string>>(new Set());

  // Left panel enriched data — fetched per-row after the list renders
  const [leftPanelInfoMap, setLeftPanelInfoMap] = useState<Record<string, LeftPanelInfo>>({});
  const [leftPanelLoadingSet, setLeftPanelLoadingSet] = useState<Set<string>>(new Set());

  // Converts the current ordered steps array → { step_1: {...}, step_2: {...}, ... }
  const buildStepJson = (steps: PurchaseFlowStep[]) => {
    const result: Record<string, { document: string; status: string; doc_link: string }> = {};
    steps.forEach((s, idx) => {
      result[`step_${idx + 1}`] = {
        document: s.document,
        status: s.status || 'empty',
        doc_link: s.docLink || '',
      };
    });
    return result;
  };

  const saveCurrentFlow = async (flowId: string, flow: ApiPurchaseFlow, stepsOverride?: PurchaseFlowStep[]) => {
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) return toast.error('Missing API base URL');
    setSavingFlows((prev) => ({ ...prev, [flowId]: true }));
    try {
      const steps = stepsOverride ?? getFlowSteps(flowId, flow);
      const stepJson = buildStepJson(steps);
      const res = await fetch(`${baseUrl}/purchase_flow/update_purchase_flow_stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ flow_id: flowId, step_json: stepJson }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to save flow');
      // Clear the pending-reorder flag so uploads are unblocked
      setPendingReorderSet((prev) => { const s = new Set(prev); s.delete(flowId); return s; });
      toast.success('Purchase flow saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save purchase flow');
    } finally {
      setSavingFlows((prev) => { const c = { ...prev }; delete c[flowId]; return c; });
    }
  };

  const openHoInboxView = (prNumberRaw: string, tab: 'po' | 'indent' | 'comparative') => {
    const prNumber = safeTrim(prNumberRaw);
    if (!prNumber) {
      toast.error('Missing PR number');
      return;
    }
    const qs = new URLSearchParams({ open: prNumber, tab }).toString();
    navigate(`/ho?${qs}`);
  };

  useEffect(() => {
    const ac = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await fetchPurchaseFlows(ac.signal);
        setFlows(list);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e ?? 'Failed to load purchase flows');
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => ac.abort();
  }, []);

  const rows = useMemo(() => {
    const copy = [...flows];
    copy.sort((a, b) => safeTrim((b as any)?.timestamp).localeCompare(safeTrim((a as any)?.timestamp)));
    return copy;
  }, [flows]);

  // After all rows are in view, fetch left-panel info row by row (in parallel)
  useEffect(() => {
    if (rows.length === 0) return;
    const ac = new AbortController();
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) return;

    rows.forEach(async (flow) => {
      const prNumber = safeTrim((flow as any)?.pr_number);
      if (!prNumber) return;
      const flowId = safeTrim((flow as any)?.flow_id) || safeTrim((flow as any)?.comparison_id) || prNumber;

      setLeftPanelLoadingSet((prev) => new Set([...prev, flowId]));
      try {
        const res = await fetch(`${baseUrl}/purchase_flow/get_left_panel_info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ pr_number: prNumber }),
          signal: ac.signal,
        });
        if (!res.ok) return;
        const data: LeftPanelInfo = await res.json().catch(() => null);
        if (data) setLeftPanelInfoMap((prev) => ({ ...prev, [flowId]: data }));
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
      } finally {
        setLeftPanelLoadingSet((prev) => { const s = new Set(prev); s.delete(flowId); return s; });
      }
    });

    return () => ac.abort();
  }, [rows]);

  const handleUploadStep = async (flow: ApiPurchaseFlow, step: PurchaseFlowStep, file: File) => {
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('Missing API base URL');

    const orderNumber = safeTrim((flow as any)?.order_number);
    if (!orderNumber) throw new Error('Missing order number on this flow');

    const flowId = safeTrim((flow as any)?.flow_id) || safeTrim((flow as any)?.comparison_id);
    if (!flowId) throw new Error('Missing flow ID');

    // ── API 1: upload file, receive file_url ─────────────────────────────────
    const formData = new FormData();
    formData.append('document', file);

    const uploadRes = await fetch(
      `${baseUrl}/purchase_flow/upload_purchase_flow_document?order_number=${encodeURIComponent(orderNumber)}`,
      { method: 'POST', body: formData }
    );
    const uploadData: any = await uploadRes.json().catch(() => null);
    if (!uploadRes.ok || !uploadData?.success)
      throw new Error(uploadData?.message || 'File upload failed');

    const fileUrl: string = safeTrim(uploadData.file_url);
    if (!fileUrl) throw new Error('Upload succeeded but no file URL was returned');

    // ── API 2: link file_url to the correct step ─────────────────────────────
    // Local steps (added via "+ Add Invoice") don't have a server-side step key.
    // Only call API 2 for steps that came from the server (key matches step_N).
    if (!step.isLocal) {
      const linkRes = await fetch(`${baseUrl}/purchase_flow/update_doc_link_for_step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          flow_id: flowId,
          document_url: fileUrl,
          step: step.key,          // e.g. "step_1", "step_2", …
        }),
      });
      const linkData: any = await linkRes.json().catch(() => null);
      if (!linkRes.ok || !linkData?.success)
        throw new Error(linkData?.message || 'Failed to link document to step');
    }

    // ── Update local state so the step shows as uploaded immediately ─────────
    const updatedSteps = getFlowSteps(flowId, flow).map((s) =>
      s.key === step.key
        ? { ...s, docLink: fileUrl, status: isInvoiceDocType(step.document) ? 'uploaded+accounts_pending' : 'uploaded' }
        : s
    );
    setFlowStepOverrides((prev) => ({ ...prev, [flowId]: updatedSteps }));
    toast.success('Document uploaded successfully');
  };

  const handleForwardToAccounts = async (flowId: string, flow: ApiPurchaseFlow, step: PurchaseFlowStep) => {
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) return toast.error('Missing API base URL');

    const forwardKey = `${flowId}:${step.key}`;
    setForwardingSteps((prev) => new Set([...prev, forwardKey]));

    try {
      const orderNumber = safeTrim((flow as any)?.order_number);
      const vendorInfo = leftPanelInfoMap[flowId]?.vendor_details;

      const res = await fetch(`${baseUrl}/admin_accounts/create_invoice_payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          doc_url: step.docLink,
          order_number: orderNumber,
          vendor_name: vendorInfo?.vendor_name || '',
          vendor_id: vendorInfo?.approved_vendor_id || '',
          flow_id: flowId,
          step: step.key,
          invoice_type: step.document,
        }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to forward to accounts');

      const current = getFlowSteps(flowId, flow);
      const updated = current.map((s) =>
        s.key === step.key ? { ...s, status: 'uploaded+accounts_sent' } : s
      );
      setFlowStepOverrides((prev) => ({ ...prev, [flowId]: updated }));
      toast.success(data?.message || 'Forwarded to accounts successfully');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to forward to accounts');
    } finally {
      setForwardingSteps((prev) => { const s = new Set(prev); s.delete(forwardKey); return s; });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      {uploadTarget ? (
        <UploadStepDocPopup
          title={uploadTarget.step.document}
          onClose={() => setUploadTarget(null)}
          onUpload={(file) => handleUploadStep(uploadTarget.flow, uploadTarget.step, file)}
        />
      ) : null}

      {addToInventoryFor ? (
        <AddToInventoryPopup
          poNumber={addToInventoryFor.poNumber}
          onClose={() => setAddToInventoryFor(null)}
        />
      ) : null}

      <div className="mb-6">
        <div className="text-2xl font-bold">Purchase Flow</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Each purchase flow is a row. Steps come from the API as step_1, step_2, … — upload the required document in the empty step.
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground text-center">
            Loading purchase flows…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground text-center">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground text-center">
            No purchase flows found.
          </div>
        ) : (
          rows.map((flow, idx) => {
            const flowId = safeTrim((flow as any)?.flow_id) || safeTrim((flow as any)?.comparison_id) || `row-${idx}`;
            const prNumber = safeTrim((flow as any)?.pr_number);
            const orderNumber = safeTrim((flow as any)?.order_number);
            const comparisonId = safeTrim((flow as any)?.comparison_id);
            const ts = safeTrim((flow as any)?.timestamp);
            const steps = getFlowSteps(flowId, flow);
            const isMenuOpen = addMenuOpenFor === flowId;

            return (
              <div key={flowId} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-stretch gap-0 flex-wrap">
                  {(() => {
                    const info = leftPanelInfoMap[flowId];
                    const isLoading = leftPanelLoadingSet.has(flowId);
                    const displayPr = info?.pr_number || prNumber || '—';
                    const displayOrder = info?.Order_number || orderNumber || '—';
                    const indentType = info?.indent_type;
                    const vendor = info?.vendor_details;

                    return (
                  <div className="w-[280px] shrink-0 border-r border-border px-4 py-4 bg-muted/30 flex flex-col gap-3">

                    {/* PR number + indent type badge */}
                    <div>
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-sm leading-snug break-all">{displayPr}</span>
                        {indentType && (
                          <span className={`shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                            indentType === 'SPR'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {indentType}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 break-all">{displayOrder}</div>
                      {info?.department && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          <span className="font-medium">Dept:</span> {info.department}
                        </div>
                      )}
                    </div>

                    {/* Vendor details */}
                    {vendor ? (
                      <div className="rounded-lg border border-border bg-background px-3 py-2.5 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Vendor</div>
                        {vendor.vendor_name && (
                          <div className="text-xs font-semibold text-foreground">{vendor.vendor_name}</div>
                        )}
                        {vendor.approved_vendor_id && (
                          <div className="text-[11px] text-muted-foreground">{vendor.approved_vendor_id}</div>
                        )}
                        {vendor.vendor_contact && (
                          <div className="text-[11px] text-muted-foreground">{vendor.vendor_contact}</div>
                        )}
                        {vendor.vendor_address && (
                          <div className="text-[11px] text-muted-foreground">{vendor.vendor_address}</div>
                        )}
                        {vendor.gst_number && (
                          <div className="text-[11px] text-muted-foreground">GST: {vendor.gst_number}</div>
                        )}
                      </div>
                    ) : isLoading ? (
                      <div className="space-y-2 rounded-lg border border-border bg-background px-3 py-2.5">
                        <div className="h-2.5 w-2/3 rounded bg-muted animate-pulse" />
                        <div className="h-2.5 w-1/2 rounded bg-muted animate-pulse" />
                        <div className="h-2.5 w-3/4 rounded bg-muted animate-pulse" />
                      </div>
                    ) : null}

                    {/* Timestamp */}
                    {ts && (
                      <div className="text-[11px] text-muted-foreground">Updated: {formatDateTime(ts)}</div>
                    )}

                    <div className="flex items-stretch gap-2">
                      <button
                        disabled={!!savingFlows[flowId]}
                        onClick={() => saveCurrentFlow(flowId, flow)}
                        className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-2 py-2.5 text-[11px] font-medium transition-colors"
                      >
                        <Check className="w-4 h-4" />
                        {savingFlows[flowId] ? 'Saving…' : 'Save Current'}
                      </button>
                      <button
                        disabled={!prNumber}
                        onClick={() => openHoInboxView(prNumber, 'po')}
                        className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-700 px-2 py-2.5 text-[11px] font-medium transition-colors"
                      >
                        <Receipt className="w-4 h-4" />
                        View Order
                      </button>
                      <button
                        disabled={!prNumber}
                        onClick={() => openHoInboxView(prNumber, 'indent')}
                        className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-700 px-2 py-2.5 text-[11px] font-medium transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        View Indent
                      </button>
                    </div>

                    {indentType === 'PR' && (
                      <button
                        disabled={!prNumber}
                        onClick={() => setAddToInventoryFor({ poNumber: orderNumber })}
                        className="mt-2 w-full flex flex-col items-center justify-center gap-1 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 disabled:opacity-40 text-green-700 px-2 py-2.5 text-[11px] font-medium transition-colors"
                      >
                        <Boxes className="w-4 h-4" />
                        Add to Inventory
                      </button>
                    )}
                  </div>
                    );
                  })()}

                  <div className="flex-1 px-4 py-4 overflow-x-auto">
                    {steps.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No steps found for this flow.</div>
                    ) : null}

                    {/* Warning banner when step order has been changed but not saved */}
                    {pendingReorderSet.has(flowId) && (
                      <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 font-medium">
                        <Lock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                        Step order changed — save first before uploading any documents.
                      </div>
                    )}

                    <div className="min-w-max flex items-center gap-3">
                      {(() => {
                        const hasReorderPending = pendingReorderSet.has(flowId);
                        // Index of the first step that is eligible to be uploaded next
                        // (not yet uploaded AND all previous steps are uploaded)
                        const firstUploadableIdx = steps.findIndex(
                          (st, i) => !isUploaded(st) && steps.slice(0, i).every(prev => isUploaded(prev))
                        );
                        return steps.map((s, stepIdx) => {
                        const uploaded = isUploaded(s);
                        const canOpen = Boolean(s.docLink);
                        const isFirst = stepIdx === 0;
                        const isLast = stepIdx === steps.length - 1;

                        // A step is blocked for upload when:
                        // 1. The order was changed and not saved yet, OR
                        // 2. A previous step hasn't been uploaded yet
                        const blocked = !uploaded && (
                          hasReorderPending ||
                          (firstUploadableIdx !== -1 && stepIdx > firstUploadableIdx)
                        );

                        const blockReason = hasReorderPending
                          ? 'Save the current order before uploading'
                          : (() => {
                              const blocking = steps.slice(0, stepIdx).find(prev => !isUploaded(prev));
                              return blocking ? `Upload "${blocking.document}" first` : '';
                            })();

                        const invoiceAccountsStatus = (() => {
                          const st = s.status.toLowerCase();
                          if (st === 'uploaded+accounts_approved') return 'approved' as const;
                          if (st === 'uploaded+accounts_sent') return 'sent' as const;
                          if (st === 'uploaded+accounts_pending') return 'pending' as const;
                          return null;
                        })();

                        return (
                          <div key={s.key} className="flex items-center gap-3">
                            {/* Step node */}
                            <div className="flex flex-col items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (s.isLocal && s.status !== 'completed') return;
                                  if (canOpen) { window.open(s.docLink, '_blank'); return; }
                                  if (blocked) { toast.error(blockReason); return; }
                                  setUploadTarget({ flow, step: s });
                                }}
                                className={`group flex flex-col items-center gap-1 ${blocked ? 'cursor-not-allowed' : ''}`}
                                title={
                                  blocked
                                    ? blockReason
                                    : s.isLocal && s.status !== 'completed'
                                      ? s.document
                                      : canOpen ? 'Open document' : 'Upload document'
                                }
                              >
                                <div className={
                                  'w-20 h-20 rounded-full border-2 flex flex-col items-center justify-center transition-colors ' +
                                  (uploaded
                                    ? invoiceAccountsStatus === 'pending'
                                      ? 'border-yellow-400 bg-yellow-50'
                                      : invoiceAccountsStatus === 'sent'
                                        ? 'border-blue-400 bg-blue-50'
                                        : 'border-green-500 bg-green-50'
                                    : blocked
                                      ? 'border-gray-200 bg-gray-50 opacity-50'
                                      : s.isLocal && s.status !== 'completed'
                                        ? 'border-blue-400 bg-blue-50'
                                        : !s.isLocal && !s.docLink && s.status === 'completed'
                                          ? 'border-green-500 bg-green-50'
                                          : 'border-dashed border-border bg-background hover:bg-muted')
                                }>
                                  {uploaded ? (
                                    invoiceAccountsStatus === 'pending' ? (
                                      <FileText className="w-5 h-5 text-yellow-600" />
                                    ) : invoiceAccountsStatus === 'sent' ? (
                                      <FileText className="w-5 h-5 text-blue-600" />
                                    ) : (
                                      <FileText className="w-5 h-5 text-green-700" />
                                    )
                                  ) : blocked ? (
                                    <Lock className="w-5 h-5 text-gray-400" />
                                  ) : s.isLocal && s.status !== 'completed' ? (
                                    <Receipt className="w-5 h-5 text-blue-600" />
                                  ) : !s.isLocal && !s.docLink && s.status === 'completed' ? (
                                    <Check className="w-5 h-5 text-green-600" />
                                  ) : (
                                    <Plus className="w-7 h-7 text-muted-foreground group-hover:text-foreground" />
                                  )}
                                  <div className="text-[10px] mt-1 font-semibold text-muted-foreground">
                                    {uploaded
                                      ? invoiceAccountsStatus === 'pending'
                                        ? 'Pending'
                                        : invoiceAccountsStatus === 'sent'
                                          ? 'Sent'
                                          : invoiceAccountsStatus === 'approved'
                                            ? 'Approved'
                                            : 'Uploaded'
                                      : blocked
                                        ? 'Locked'
                                        : s.isLocal && s.status !== 'completed'
                                          ? 'New'
                                          : !s.isLocal && !s.docLink && s.status === 'completed'
                                            ? 'Done'
                                            : 'Upload'}
                                  </div>
                                </div>
                                <div className={
                                  'text-[10px] font-medium text-center max-w-[88px] leading-tight ' +
                                  (blocked
                                    ? 'text-gray-400'
                                    : s.isLocal && s.status !== 'completed'
                                      ? 'text-blue-700 font-semibold'
                                      : !s.isLocal && !s.docLink && s.status === 'completed'
                                        ? 'text-green-700 font-semibold'
                                        : '')
                                }>
                                  {s.document}
                                </div>
                              </button>

                              {/* Move + remove controls — shown on any step without a doc_link */}
                              {!s.docLink && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => moveStep(flowId, flow, s.key, 'left')}
                                    disabled={isFirst}
                                    title="Move left"
                                    className="h-5 w-5 rounded flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                  >
                                    <ChevronLeft className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleLocalStepDone(flowId, flow, s.key)}
                                    title={s.status === 'completed' ? 'Mark as pending' : 'Mark as done'}
                                    className={
                                      'h-5 w-5 rounded flex items-center justify-center border transition-colors ' +
                                      (s.status === 'completed'
                                        ? 'border-green-400 bg-green-100 text-green-700 hover:bg-green-50'
                                        : 'border-gray-200 bg-white text-gray-400 hover:bg-green-50 hover:border-green-300 hover:text-green-600')
                                    }
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeLocalStep(flowId, flow, s.key)}
                                    title="Remove"
                                    className="h-5 w-5 rounded flex items-center justify-center border border-red-200 bg-white text-red-400 hover:bg-red-50 transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveStep(flowId, flow, s.key, 'right')}
                                    disabled={isLast}
                                    title="Move right"
                                    className="h-5 w-5 rounded flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                  >
                                    <ChevronRight className="w-3 h-3" />
                                  </button>
                                </div>
                              )}

                              {/* Accounts status actions — only for invoice / proforma invoice steps */}
                              {uploaded && isInvoiceDocType(s.document) && (
                                invoiceAccountsStatus === 'pending' ? (
                                  <button
                                    type="button"
                                    disabled={forwardingSteps.has(`${flowId}:${s.key}`)}
                                    onClick={() => handleForwardToAccounts(flowId, flow, s)}
                                    className="mt-1 px-2 py-1 text-[10px] font-semibold rounded-md bg-yellow-400 hover:bg-yellow-500 disabled:opacity-60 disabled:cursor-not-allowed text-yellow-900 transition-colors whitespace-nowrap"
                                  >
                                    {forwardingSteps.has(`${flowId}:${s.key}`) ? 'Forwarding…' : 'Forward to Accounts'}
                                  </button>
                                ) : invoiceAccountsStatus === 'sent' ? (
                                  <span className="mt-1 px-2 py-1 text-[10px] font-semibold rounded-md bg-blue-100 text-blue-700 whitespace-nowrap">
                                    Sent to Accounts
                                  </span>
                                ) : invoiceAccountsStatus === 'approved' ? (
                                  <span className="mt-1 px-2 py-1 text-[10px] font-semibold rounded-md bg-green-100 text-green-700 whitespace-nowrap">
                                    Accounts Approved
                                  </span>
                                ) : null
                              )}
                            </div>

                            {/* Arrow connector */}
                            {stepIdx < steps.length - 1 ? (
                              <div className="text-muted-foreground">
                                <ArrowRight className="w-4 h-4" />
                              </div>
                            ) : null}
                          </div>
                        );
                      });
                    })()}

                      {/* Arrow before add button when steps exist */}
                      {steps.length > 0 && (
                        <div className="text-muted-foreground">
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      )}

                      {/* + Add Invoice button with dropdown */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setAddMenuOpenFor(isMenuOpen ? null : flowId)}
                          className="flex flex-col items-center gap-1 group"
                          title="Add invoice step"
                        >
                          <div className="w-20 h-20 rounded-full border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 flex flex-col items-center justify-center transition-colors">
                            <Plus className="w-6 h-6 text-blue-500 group-hover:text-blue-700" />
                            <div className="text-[10px] mt-1 font-semibold text-blue-500 group-hover:text-blue-700">Add</div>
                          </div>
                          <div className="text-[10px] font-medium text-blue-600 text-center max-w-[88px] leading-tight">
                            Invoice Step
                          </div>
                        </button>

                        {/* Dropdown */}
                        {isMenuOpen && (
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30 w-44 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                            <div className="px-3 py-2 border-b border-border bg-muted/30">
                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Choose type</p>
                            </div>
                            {(['Proforma Invoice', 'Invoice', 'PRR (for payment)', 'PRR (for accounting)'] as const).map((type) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => addInvoiceStep(flowId, flow, type)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                              >
                                <Receipt className="w-4 h-4 text-blue-500 shrink-0" />
                                {type}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setAddMenuOpenFor(null)}
                              className="w-full flex items-center justify-center px-3 py-2 text-xs text-muted-foreground hover:bg-muted border-t border-border transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
