import { useEffect, useRef, useState } from "react";
import {
  FileText, FileImage, Folder, FolderOpen, Plus, Trash2, UploadCloud, X, CheckCircle2, Inbox, RefreshCw, Search, SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { cn, uid } from "@/lib/utils";
import getBaseUrl from "@/lib/config";
import { BillInwardModal, moduleByKey } from "./FinanceAccounts";

// Catalogue of document types a vendor bill packet might arrive with — "Other" is a free-text
// escape hatch for anything not covered here.
const DOCUMENT_TYPES = [
  "Tax Invoice",
  "Delivery Challan",
  "E-Way Bill",
  "Packing List",
  "LR / GR / Transport Receipt",
  "Proof of Delivery (POD)",
  "Work Completion Certificate",
  "Service Completion Report",
  "Measurement Sheet / Measurement Book (MB)",
  "Timesheet / Attendance Sheet",
  "Milestone Completion Certificate",
  "Inspection Report",
  "Quality Certificate",
  "Test Certificate",
  "Certificate of Analysis (COA)",
  "Certificate of Origin",
  "Warranty / Guarantee Certificate",
  "Installation Certificate",
  "Commissioning Certificate",
  "Material Receipt / Material Delivery Report",
  "Material Reconciliation Statement",
  "Supporting Expense Bills / Receipts",
  "Dispatch Note",
  "Packing / Shipment Details",
  "Insurance Certificate — where applicable",
  "Other Contractually Required Documents",
];
const OTHER_DOCUMENT_TYPE = "Other";
const PRIMARY_DOCUMENT_TYPE = "Tax Invoice";
// add_invoice only stores plain URLs for "other" documents — the type label chosen for each
// one isn't persisted, so a folder loaded back from the backend can't recover it.
const REMOTE_OTHER_DOCUMENT_TYPE = "Supporting Document";

// A document either came from a fresh local upload (has `file`, `url` is a blob: URL) or was
// loaded back from the backend (`file` is undefined until "Process Invoice" resolves it,
// `url` is the real S3 URL).
interface InvoiceDocument {
  id: string;
  type: string;
  file?: File;
  url: string;
  fileName: string;
  mimeType: string;
}

interface InvoiceFolder {
  id: string;
  label: string;
  createdAt: string;
  documents: InvoiceDocument[];
  processed: boolean;
  vendorId: string;
  vendorName: string;
  orderNumber: string;
}

interface DirectoryVendor {
  id: string;
  name: string;
}

interface DirectoryOrder {
  orderNumber: string;
  orderType: string;
}

const inferMimeFromUrl = (url: string): string => {
  const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (["png", "webp", "gif"].includes(ext)) return `image/${ext}`;
  return "application/octet-stream";
};
const filenameFromUrl = (url: string) => {
  const last = url.split("?")[0].split("/").pop() || url;
  try { return decodeURIComponent(last); } catch { return last; }
};

function DocumentPreview({ document }: { document: InvoiceDocument }) {
  if (document.mimeType === "application/pdf") {
    return <iframe title={document.fileName} src={document.url} className="h-full min-h-[420px] w-full rounded-xl bg-white" />;
  }
  if (document.mimeType.startsWith("image/")) {
    return <img src={document.url} alt={document.fileName} className="max-h-full max-w-full rounded-xl object-contain shadow-sm" />;
  }
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <FileText className="h-10 w-10 text-slate-400" />
      <p className="mt-3 max-w-xs break-all text-sm font-bold text-slate-700">{document.fileName}</p>
      <p className="mt-1 text-xs text-slate-400">Preview isn't available for this file type.</p>
    </div>
  );
}

// Small square preview used on the folder card grid — an actual thumbnail of the file
// rather than just its type name, so the card reads like a Drive folder at a glance.
function DocumentThumbnail({ document }: { document: InvoiceDocument }) {
  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50" title={`${document.type} — ${document.fileName}`}>
      {document.mimeType.startsWith("image/") ? (
        <img src={document.url} alt={document.type} className="h-full w-full object-cover" />
      ) : document.mimeType === "application/pdf" ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-red-500"><FileText className="h-6 w-6" /><span className="text-[8px] font-extrabold uppercase">PDF</span></div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400"><FileText className="h-5 w-5" /></div>
      )}
    </div>
  );
}

function AddInvoiceModal({
  vendors, vendorsLoading, vendorsError, onClose, onCreate,
}: {
  vendors: DirectoryVendor[]; vendorsLoading: boolean; vendorsError: string;
  onClose: () => void; onCreate: (folder: InvoiceFolder) => void;
}) {
  const [documents, setDocuments] = useState<InvoiceDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedType, setSelectedType] = useState(DOCUMENT_TYPES[0]);
  const [customType, setCustomType] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [selectedOrderNumber, setSelectedOrderNumber] = useState("");
  const [orders, setOrders] = useState<DirectoryOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentsRef = useRef<InvoiceDocument[]>([]);
  const committedRef = useRef(false);

  useEffect(() => { documentsRef.current = documents; }, [documents]);

  // Same order source Bill Inward itself uses (/purchase_flow/get_order_info_by_vendor_id) —
  // an order number picked here just pre-fills the PO/WO reference once this folder is
  // processed into a real Bill Inward, same as the vendor already does.
  useEffect(() => {
    let cancelled = false;
    setOrders([]);
    setSelectedOrderNumber("");
    if (!selectedVendorId) return () => { cancelled = true; };
    const loadOrders = async () => {
      setOrdersLoading(true);
      try {
        const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
        const response = await fetch(`${baseUrl}/purchase_flow/get_order_info_by_vendor_id/${selectedVendorId}`, { headers: { Accept: "application/json" } });
        const payload = response.ok ? await response.json().catch(() => null) : null;
        const list = Array.isArray(payload?.order_info) ? payload.order_info : [];
        const mapped: DirectoryOrder[] = list
          .map((order: Record<string, unknown>) => ({ orderNumber: String(order.order_number ?? "").trim(), orderType: String(order.order_type ?? "").trim() }))
          .filter((order: DirectoryOrder) => order.orderNumber);
        if (!cancelled) setOrders(mapped);
      } catch {
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    };
    void loadOrders();
    return () => { cancelled = true; };
  }, [selectedVendorId]);
  useEffect(() => () => {
    if (!committedRef.current) documentsRef.current.forEach((document) => { if (document.file) URL.revokeObjectURL(document.url); });
  }, []);

  const selectedDocument = documents.find((document) => document.id === selectedDocId) ?? documents[documents.length - 1];

  const handleFilePicked = (selected?: File) => {
    if (!selected) return;
    if (selectedType === OTHER_DOCUMENT_TYPE && !customType.trim()) {
      toast.error("Type the document name before uploading.");
      return;
    }
    const document: InvoiceDocument = {
      id: uid(),
      type: selectedType === OTHER_DOCUMENT_TYPE ? customType.trim() : selectedType,
      file: selected,
      url: URL.createObjectURL(selected),
      fileName: selected.name,
      mimeType: selected.type,
    };
    setDocuments((current) => [...current, document]);
    setSelectedDocId(document.id);
    setSelectedType(DOCUMENT_TYPES[0]);
    setCustomType("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeDocument = (id: string) => {
    setDocuments((current) => {
      const target = current.find((document) => document.id === id);
      if (target?.file) URL.revokeObjectURL(target.url);
      return current.filter((document) => document.id !== id);
    });
    setSelectedDocId((current) => (current === id ? "" : current));
  };

  const selectedVendor = vendors.find((vendor) => vendor.id === selectedVendorId);
  const hasPrimaryDocument = documents.some((document) => document.type === PRIMARY_DOCUMENT_TYPE);

  const handleFinalize = async () => {
    if (!selectedVendorId) { toast.error("Select a vendor before uploading."); return; }
    if (documents.length === 0) { toast.error("Add at least one document before uploading."); return; }
    const primary = documents.find((document) => document.type === PRIMARY_DOCUMENT_TYPE);
    if (!primary?.file) { toast.error("Add a Tax Invoice document — a folder can't be processed without one."); return; }

    setSubmitting(true);
    try {
      const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
      // Just an S3 path namespace at this point — there's no order or invoice_id yet, that
      // only exists once add_invoice below returns one.
      const uploadOrderNumber = `INVDIR-${Date.now()}`;
      const uploadDocument = async (file: File) => {
        const body = new FormData();
        body.append("document", file);
        const response = await fetch(`${baseUrl}/purchase_flow/upload_purchase_flow_document?order_number=${encodeURIComponent(uploadOrderNumber)}`, { method: "POST", body });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success || !payload?.file_url) throw new Error(payload?.detail || `Failed to upload ${file.name}`);
        return String(payload.file_url);
      };

      const invoiceDocUrl = await uploadDocument(primary.file);
      const otherDocuments: string[] = [];
      for (const document of documents) {
        if (document.id === primary.id || !document.file) continue;
        otherDocuments.push(await uploadDocument(document.file));
      }

      const response = await fetch(`${baseUrl}/admin_accounts/add_invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_doc_url: invoiceDocUrl, other_documents: otherDocuments, vendor_id: selectedVendorId, order_number: selectedOrderNumber || undefined }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success || !data?.invoice_id) throw new Error(data?.detail || "Failed to save invoice folder");

      committedRef.current = true;
      onCreate({
        id: String(data.invoice_id),
        label: String(data.invoice_id),
        createdAt: new Date().toISOString(),
        documents,
        processed: false,
        vendorId: selectedVendorId,
        vendorName: selectedVendor?.name || "",
        orderNumber: selectedOrderNumber,
      });
      toast.success(`${data.invoice_id} folder created`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload invoice folder");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex max-h-[94vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between bg-[#0d473f] px-6 py-5 text-white">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">Invoice Directory</p>
            <h2 className="mt-1 text-xl font-bold">New invoice folder</h2>
            <p className="mt-1 text-xs font-medium text-white/60">The folder number is allocated once you upload it below.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto bg-[#eef3f6] lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)] lg:overflow-hidden">
          <section className="flex min-h-[420px] flex-col border-b border-slate-200 p-4 lg:min-h-0 lg:border-b-0 lg:border-r lg:p-5">
            <div className="flex min-h-[380px] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-slate-200/70 p-3 ring-1 ring-slate-300/70">
              {selectedDocument ? <DocumentPreview document={selectedDocument} /> : (
                <div className="flex max-w-sm flex-col items-center px-6 text-center text-slate-400">
                  <UploadCloud className="h-9 w-9" />
                  <p className="mt-3 text-sm font-bold text-slate-600">No documents added yet</p>
                  <p className="mt-1 text-xs leading-5">Pick a document type on the right, then upload a file to see it here.</p>
                </div>
              )}
            </div>
            {documents.length > 0 && (
              <div className="mt-3 flex shrink-0 gap-2 overflow-x-auto pb-1">
                {documents.map((document) => (
                  <button
                    key={document.id}
                    type="button"
                    onClick={() => setSelectedDocId(document.id)}
                    className={cn(
                      "flex min-w-[180px] items-center gap-2 rounded-xl border px-3 py-2 text-left",
                      selectedDocument?.id === document.id ? "border-[#278b76] bg-[#e7f3ef] text-[#0d5c4d]" : "border-slate-200 bg-white text-slate-600 hover:border-[#b8d6ce]",
                    )}
                  >
                    {document.mimeType.startsWith("image/") ? <FileImage className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{document.type}</span><span className="mt-0.5 block truncate text-[10px] font-semibold opacity-60">{document.fileName}</span></span>
                    <span onClick={(event) => { event.stopPropagation(); removeDocument(document.id); }} role="button" tabIndex={-1} title="Remove document" className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="overflow-y-auto bg-white p-5 sm:p-6">
            <div className="mb-4"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#18765f]">Folder details</p><p className="mt-1 text-sm text-slate-500">Which vendor is this from, and what arrived.</p></div>
            <label className="mb-5 block space-y-2 text-xs font-bold text-slate-600">
              Vendor *
              <select
                required
                disabled={vendorsLoading || Boolean(vendorsError)}
                value={selectedVendorId}
                onChange={(event) => setSelectedVendorId(event.target.value)}
                className="h-11 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">{vendorsLoading ? "Loading vendors…" : vendorsError ? "Vendor Directory unavailable" : "Select vendor"}</option>
                {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.id}</option>)}
              </select>
              {vendorsError && <span className="block text-[11px] font-semibold text-red-600">{vendorsError}</span>}
            </label>
            <label className="mb-5 block space-y-2 text-xs font-bold text-slate-600">
              Order Reference <span className="font-medium text-slate-400">(Optional)</span>
              <select
                disabled={!selectedVendorId || ordersLoading}
                value={selectedOrderNumber}
                onChange={(event) => setSelectedOrderNumber(event.target.value)}
                className="h-11 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">{!selectedVendorId ? "Select vendor first" : ordersLoading ? "Loading orders…" : "No order reference"}</option>
                {orders.map((order) => <option key={order.orderNumber} value={order.orderNumber}>{order.orderType || "Order"} · {order.orderNumber}</option>)}
              </select>
            </label>
            <div className="space-y-3">
              <label className="block space-y-2 text-xs font-bold text-slate-600">
                Document Type
                <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10">
                  {DOCUMENT_TYPES.map((item) => <option key={item}>{item}</option>)}
                  <option value={OTHER_DOCUMENT_TYPE}>Other (type the document name)</option>
                </select>
              </label>
              {selectedType === OTHER_DOCUMENT_TYPE && (
                <label className="block space-y-2 text-xs font-bold text-slate-600">
                  Document Name
                  <input value={customType} onChange={(event) => setCustomType(event.target.value)} placeholder="Name the document that arrived" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10" />
                </label>
              )}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#9cc7bb] bg-[#f3f9f7] px-4 py-6 text-sm font-bold text-[#0d5c4d] hover:border-[#278b76] hover:bg-[#edf7f4]">
                <input ref={fileInputRef} type="file" className="sr-only" onChange={(event) => handleFilePicked(event.target.files?.[0])} />
                <UploadCloud className="h-4 w-4" /> Upload Document
              </label>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-slate-400">Added to this folder ({documents.length})</p>
              {!hasPrimaryDocument && (
                <p className="mt-1.5 text-[11px] font-semibold text-amber-700">A Tax Invoice document is mandatory — this folder can't be processed without one.</p>
              )}
              {documents.length === 0 ? (
                <p className="mt-3 text-xs text-slate-400">Nothing added yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {documents.map((document) => (
                    <div key={document.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                      <div className="min-w-0"><p className="truncate text-xs font-bold text-slate-700">{document.type}</p><p className="truncate text-[11px] text-slate-400">{document.fileName}</p></div>
                      <button type="button" onClick={() => removeDocument(document.id)} className="ml-3 shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-slate-400">{documents.length} document{documents.length === 1 ? "" : "s"} added to this folder.</p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={submitting} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={handleFinalize} disabled={submitting} className="h-11 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white hover:bg-[#0a4b3f] disabled:opacity-60">{submitting ? "Uploading…" : "Upload Invoice"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Maps GET /admin_accounts/get_all_invoices' shape into an InvoiceFolder — documents come
// back as plain URLs (no File yet, resolved on demand when the folder is processed).
const mapInvoiceToFolder = (invoice: Record<string, unknown>): InvoiceFolder => {
  const invoiceDocUrl = String(invoice.invoice_doc ?? "").trim();
  const otherUrls = Array.isArray(invoice.other_documents) ? invoice.other_documents.map((url) => String(url)) : [];
  const documents: InvoiceDocument[] = [];
  if (invoiceDocUrl) {
    documents.push({ id: uid(), type: PRIMARY_DOCUMENT_TYPE, url: invoiceDocUrl, fileName: filenameFromUrl(invoiceDocUrl), mimeType: inferMimeFromUrl(invoiceDocUrl) });
  }
  otherUrls.filter(Boolean).forEach((url) => {
    documents.push({ id: uid(), type: REMOTE_OTHER_DOCUMENT_TYPE, url, fileName: filenameFromUrl(url), mimeType: inferMimeFromUrl(url) });
  });
  const status = String(invoice.inward_status ?? "").trim().toLowerCase();
  return {
    id: String(invoice.invoice_id ?? ""),
    label: String(invoice.invoice_id ?? ""),
    createdAt: String(invoice.recived_date ?? new Date().toISOString()),
    documents,
    processed: status !== "" && status !== "pending",
    vendorId: String(invoice.vendor_id ?? ""),
    vendorName: "",
    orderNumber: String(invoice.order_number ?? ""),
  };
};

// Backend rows are the source of truth for the folder's own data, but there's no endpoint to
// flip inward_status yet — so a locally-set "processed" flag (from a Bill Inward submitted
// this session) is preserved across refetches, and any documents already resolved to a real
// File (so "Process Invoice" doesn't need to re-fetch them) aren't thrown away either.
const mergeFolders = (previous: InvoiceFolder[], fetched: InvoiceFolder[]): InvoiceFolder[] => {
  const previousById = new Map(previous.map((folder) => [folder.id, folder]));
  const merged = fetched.map((folder) => {
    const existing = previousById.get(folder.id);
    if (!existing) return folder;
    return { ...folder, documents: existing.documents.length ? existing.documents : folder.documents, processed: existing.processed || folder.processed };
  });
  const fetchedIds = new Set(fetched.map((folder) => folder.id));
  const localOnly = previous.filter((folder) => !fetchedIds.has(folder.id));
  return [...merged, ...localOnly];
};

export default function InvoiceDirectory() {
  const [folders, setFolders] = useState<InvoiceFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState("");
  const [vendors, setVendors] = useState<DirectoryVendor[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [vendorsError, setVendorsError] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [processingFolder, setProcessingFolder] = useState<InvoiceFolder | null>(null);
  const [filterVendorId, setFilterVendorId] = useState("");
  const [filterOrderNumber, setFilterOrderNumber] = useState("");

  const loadFolders = () => {
    setFoldersLoading(true);
    setFoldersError("");
    const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
    fetch(`${baseUrl}/admin_accounts/get_all_invoices`, { headers: { Accept: "application/json" } })
      .then(async (res) => {
        const data = await res.json().catch(() => null) as { invoices?: Array<Record<string, unknown>>; detail?: string } | null;
        if (!res.ok || !Array.isArray(data?.invoices)) {
          throw new Error(!res.ok ? `Invoice Directory API not reachable (${res.status}${data?.detail ? ` — ${data.detail}` : ""}).` : "Invoice Directory API returned an unexpected response.");
        }
        const fetched = data.invoices.map(mapInvoiceToFolder).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setFolders((current) => mergeFolders(current, fetched));
      })
      .catch((error) => setFoldersError(error instanceof Error ? error.message : "Could not load invoice folders from the backend."))
      .finally(() => setFoldersLoading(false));
  };

  useEffect(() => { loadFolders(); }, []);

  useEffect(() => {
    let cancelled = false;
    const loadVendors = async () => {
      setVendorsLoading(true);
      setVendorsError("");
      try {
        const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
        const url = `${baseUrl}/purchase_flow/get_vendors`;
        const request = (method: "GET" | "POST") => fetch(url, { method, headers: { Accept: "application/json" } });
        let response = await request("GET");
        if (response.status === 405) response = await request("POST");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json().catch(() => null);
        const list = Array.isArray(payload?.vendors) ? payload.vendors : [];
        const mapped = list
          .map((vendor: Record<string, unknown>) => ({ id: String(vendor.vendor_id ?? "").trim(), name: String(vendor.vendor_name ?? "").trim() }))
          .filter((vendor: DirectoryVendor) => vendor.id && vendor.name)
          .sort((a: DirectoryVendor, b: DirectoryVendor) => a.name.localeCompare(b.name));
        if (!cancelled) setVendors(mapped);
      } catch {
        if (!cancelled) setVendorsError("Vendor Directory could not be loaded. Please retry.");
      } finally {
        if (!cancelled) setVendorsLoading(false);
      }
    };
    void loadVendors();
    return () => { cancelled = true; };
  }, []);

  const vendorNameFor = (folder: InvoiceFolder) => folder.vendorName || vendors.find((vendor) => vendor.id === folder.vendorId)?.name || folder.vendorId || "Vendor not recorded";

  const visibleFolders = folders.filter((folder) => {
    if (filterVendorId && folder.vendorId !== filterVendorId) return false;
    const orderQuery = filterOrderNumber.trim().toLowerCase();
    if (orderQuery && !folder.orderNumber.toLowerCase().includes(orderQuery)) return false;
    return true;
  });
  const isFiltered = Boolean(filterVendorId || filterOrderNumber.trim());

  const addFolder = (folder: InvoiceFolder) => {
    setFolders((current) => [folder, ...current]);
    setIsAddOpen(false);
  };

  const removeFolder = (folder: InvoiceFolder) => {
    if (!window.confirm(`Remove ${folder.label} from this view? It stays saved in the database — this only clears it from your screen until the next refresh.`)) return;
    folder.documents.forEach((document) => { if (document.file) URL.revokeObjectURL(document.url); });
    setFolders((current) => current.filter((item) => item.id !== folder.id));
  };

  // Folders loaded from the backend don't carry a local File — BillInwardModal can use the
  // already-hosted URL directly (initialInvoiceDocUrl), so there's no need to re-fetch or
  // re-upload the document at all.
  const handleProcess = (folder: InvoiceFolder) => {
    const primary = folder.documents.find((document) => document.type === PRIMARY_DOCUMENT_TYPE) ?? folder.documents[0];
    if (!primary) { toast.error("This folder has no documents to process."); return; }
    setProcessingFolder(folder);
  };

  const billsPayablesModule = moduleByKey["bills-payables"];
  const inwardTab = billsPayablesModule.tabs.find((tab) => tab.label === "Inward")!;
  const primaryDocument = processingFolder?.documents.find((document) => document.type === PRIMARY_DOCUMENT_TYPE) ?? processingFolder?.documents[0];
  // Every other document in the folder — already-hosted ones (loaded from the backend) pass
  // through as-is; ones only added locally this session still have a File to re-upload.
  const otherDocuments = processingFolder?.documents.filter((document) => document.id !== primaryDocument?.id) ?? [];
  const initialAdditionalDocuments = otherDocuments.filter((document) => !document.file).map((document) => ({ name: document.fileName, url: document.url }));
  const initialSupportingFiles = otherDocuments.map((document) => document.file).filter((file): file is File => Boolean(file));

  return (
    <div className="min-h-full bg-[#f6f8fa] px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1540px] space-y-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0d473f] text-white shadow-[0_12px_30px_rgba(13,71,63,0.18)]"><FolderOpen className="h-6 w-6" /></div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#18765f]">Finance & Accounts</p>
              <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-slate-950">Invoice Directory</h1>
              <p className="mt-1.5 max-w-3xl text-sm font-medium leading-6 text-slate-500">Collect a vendor's invoice and every supporting document in one folder, then process it into a Bill Inward entry.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={loadFolders} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"><RefreshCw className={cn("h-4 w-4", foldersLoading && "animate-spin")} /> Refresh</button>
            <button onClick={() => setIsAddOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(13,92,77,0.18)] hover:bg-[#0a4b3f]"><Plus className="h-4 w-4" /> Add Invoice</button>
          </div>
        </div>

        {foldersError && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800">{foldersError}</div>}

        {folders.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.035)] sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-400">
              <SlidersHorizontal className="h-4 w-4" /> Filter
            </div>
            <label className="relative block flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={filterOrderNumber}
                onChange={(event) => setFilterOrderNumber(event.target.value)}
                placeholder="Filter by order number"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#278b76] focus:bg-white focus:ring-4 focus:ring-[#278b76]/10"
              />
            </label>
            <select
              value={filterVendorId}
              onChange={(event) => setFilterVendorId(event.target.value)}
              disabled={vendorsLoading}
              className="h-10 min-w-[220px] cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#278b76] focus:bg-white focus:ring-4 focus:ring-[#278b76]/10 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <option value="">{vendorsLoading ? "Loading vendors…" : "All vendors"}</option>
              {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.id}</option>)}
            </select>
            {isFiltered && (
              <button
                onClick={() => { setFilterVendorId(""); setFilterOrderNumber(""); }}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-500 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {visibleFolders.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-slate-200/80 bg-white px-6 py-12 text-center shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <span className="rounded-2xl bg-[#edf5f2] p-4 text-[#6c9b90]"><Inbox className="h-8 w-8" /></span>
            <h3 className="mt-4 text-lg font-bold text-slate-800">
              {foldersLoading ? "Loading invoice folders…" : isFiltered ? "No invoice folders match this filter" : "No invoice folders yet"}
            </h3>
            <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
              {isFiltered ? "Try a different order number or vendor." : "Add an invoice and its supporting documents to create the first folder."}
            </p>
            {isFiltered ? (
              <button onClick={() => { setFilterVendorId(""); setFilterOrderNumber(""); }} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-[#b8d6ce] px-4 text-sm font-bold text-[#0d5c4d] hover:bg-[#edf5f2]">Clear filters</button>
            ) : (
              <button onClick={() => setIsAddOpen(true)} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-[#b8d6ce] px-4 text-sm font-bold text-[#0d5c4d] hover:bg-[#edf5f2]"><Plus className="h-4 w-4" /> Add Invoice</button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleFolders.map((folder) => (
              <div key={folder.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:border-[#8bbcaf] hover:shadow-[0_14px_34px_rgba(13,71,63,0.09)]">
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-xl bg-amber-50 p-3 text-amber-600"><Folder className="h-5 w-5" /></span>
                  {folder.processed ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold uppercase text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Processed</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase text-slate-500">{folder.documents.length} file{folder.documents.length === 1 ? "" : "s"}</span>
                  )}
                </div>
                <h3 className="mt-4 truncate text-base font-bold text-slate-900" title={folder.label}>{folder.label}</h3>
                <p className="truncate text-xs font-semibold text-slate-500" title={vendorNameFor(folder)}>{vendorNameFor(folder)}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-400">{new Date(folder.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                <div className="mt-3 flex items-center gap-2">
                  {folder.documents.slice(0, 2).map((document) => <DocumentThumbnail key={document.id} document={document} />)}
                  {folder.documents.length > 2 && (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-sm font-bold text-slate-500">+{folder.documents.length - 2}</div>
                  )}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button onClick={() => handleProcess(folder)} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0d5c4d] px-3 text-sm font-bold text-white hover:bg-[#0a4b3f]">{folder.processed ? "Reprocess Invoice" : "Process Invoice"}</button>
                  <button onClick={() => removeFolder(folder)} className="rounded-xl p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remove from view"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isAddOpen && <AddInvoiceModal vendors={vendors} vendorsLoading={vendorsLoading} vendorsError={vendorsError} onClose={() => setIsAddOpen(false)} onCreate={addFolder} />}
      {processingFolder && (
        <BillInwardModal
          module={billsPayablesModule}
          tab={inwardTab}
          onClose={() => setProcessingFolder(null)}
          onSave={() => {}}
          onSaved={() => setFolders((current) => current.map((folder) => (folder.id === processingFolder.id ? { ...folder, processed: true } : folder)))}
          initialFile={primaryDocument?.file}
          initialInvoiceDocUrl={!primaryDocument?.file ? primaryDocument?.url : undefined}
          initialFileName={primaryDocument?.fileName}
          initialVendorId={processingFolder.vendorId || undefined}
          initialVendorName={processingFolder.vendorName || undefined}
          initialOrderNumber={processingFolder.orderNumber || undefined}
          initialInvoiceDirectoryId={processingFolder.id}
          initialSupportingFiles={initialSupportingFiles}
          initialAdditionalDocuments={initialAdditionalDocuments}
        />
      )}
    </div>
  );
}
