import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  CheckCircle,
  FilePlus,
  PlusCircle,
  Trash2,
  Search,
  ClipboardList,
  Clock3,
  ShoppingCart,
  FileText,
  Send,
  PackageCheck,
  RotateCcw,
  Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { readSignatureDiary, type SignatureDiary } from '@/lib/signatureDiary';
import { getBaseUrl } from '@/lib/config';
import { PRPreview as ThemedPRPreview, type PRPreviewIndent } from '@/components/purchase/PRPreview';

// Vendor Quote type
type Quote = {
  id: string;
  vendorName: string;
  quotedRate: number;
  leadTimeDays?: number;
  notes?: string;
  document?: { name: string; url?: string };
};

// Simple types used by this page
type PRLineItem = {
  id: string;
  srNo: number;
  itemCode?: string;
  partName: string;
  specification?: string;
  uom: string;
  totalQtyRequired: number;
  lessQtyAvailableInStock?: number;
  procurementLeadTimeWeeks?: number;
  materialRequiredByDate?: string;
  indigenousOrImported?: string;
  ratePerItem?: number;
  preferredVendorName?: string;
  validityOfWarrantyAndGuarantee?: string;
  fullLifeHr?: string;
  actualLifeHr?: string;
  reasonForReplacement?: string;
  repairingPossibility?: string;
  quotes?: Quote[];
  netPrQtyOverride?: number;
};

type SprLineItem = {
  id: string;
  srNo: number;
  serviceDescription: string;
  uom: string;
  quantity: number;
  startDate: string;
  duration: string;
  completionDate: string;
  validity: string;
  servicesFrom: string;
  scopeAttached: string;
  boqAttached: string;
  approxValue: number;
  gstPercent: number;
  gstAmount: number;
  proposedVendors: string;
  previousWO: string;
  remarks: string;
};

type Indent = {
  id: string;
  indentType?: 'PR' | 'SPR';
  project: string;
  prNo: string;
  date: string;
  department?: string;
  indentedBy: string;
  forwardedBy: string;
  directorsApproval: string;
  indentedSignature?: string;
  forwardedSignature?: string;
  directorSignature?: string;
  remarksNotes?: string;
  budgetHead?: string;
  items: PRLineItem[];
  // SPR-specific
  areaOfService?: string;
  func?: string;
  natureOfService?: string;
  sprItems?: SprLineItem[];
  status: 'draft' | 'signed' | 'raised' | 'po';
  purchaseOrder?: {
    id: string;
    date: string;
    totalValue: number;
    items: { lineItemId: string; quoteId: string; vendorName: string; quotedRate: number }[];
  };
};

const genId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = () => new Date().toISOString().split('T')[0];
const formatDisplayDate = (value?: string) => {
  const raw = str(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : raw || '—';
};

const getApiBaseUrl = () => String(getBaseUrl() ?? '').replace(/\/$/, '');

type QuotationStatus = 'saved' | 'draft' | 'no_comparative_statement' | 'forwarded' | 'unknown';

const forwardComparativeStatement = async (prNumber: string): Promise<boolean> => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('API base URL is not set');

  const url = `${baseUrl}/purchase_flow/forward_comparative_statement`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pr_number: prNumber }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `HTTP ${res.status}`);
  }

  const data: any = await res.json().catch(() => null);
  const raw = (data as any)?.success;
  if (raw === true) return true;
  if (raw === 'True' || raw === 'true' || raw === 1) return true;
  return false;
};

const fetchIndentQuotationStatus = async (prNumber: string): Promise<QuotationStatus> => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('API base URL is not set');

  const url = `${baseUrl}/purchase_flow/indent_quotation_status`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pr_number: prNumber }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `HTTP ${res.status}`);
  }

  const data: any = await res.json().catch(() => null);
  const statusRaw = String(data?.status ?? '').trim();
  if (statusRaw === 'saved' || statusRaw === 'draft' || statusRaw === 'no_comparative_statement' || statusRaw === 'forwarded') return statusRaw;
  return 'unknown';
};

const str = (value: unknown): string => String(value ?? '').trim();
const maybeStr = (value: unknown): string | undefined => {
  const s = str(value);
  return s ? s : undefined;
};

const num = (value: unknown): number | undefined => {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(n) ? n : undefined;
};

const dateOnly = (value: unknown): string => {
  const s = str(value);
  // handles ISO timestamps like 2026-02-26T12:08:00.985597
  if (s.includes('T')) return s.split('T')[0];
  return s || today();
};

const fetchIndentsForPr = async (): Promise<Indent[]> => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('API base URL is not set');

  const url = `${baseUrl}/purchase_flow/get_indent_for_purchase_requisition`;

  const doFetch = (method: 'GET' | 'POST') =>
    fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
      },
    });

  let res = await doFetch('GET');
  if (res.status === 405) res = await doFetch('POST');

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `HTTP ${res.status}`);
  }

  const data: any = await res.json().catch(() => null);
  const list: any[] = Array.isArray(data?.indents_for_pr) ? data.indents_for_pr : [];

  return list.map((x) => {
    const indentData = x?.indent_data ?? {};
    const itemRows: any[] = Array.isArray(indentData?.item_row) ? indentData.item_row : [];

    const prNo = str(x?.pr_number) || genId();
    const indentedByName = str(x?.indented_by?.name_id);
    const forwardedByName = str(x?.forwarded_by?.name_id);
    const approvedByName = str(x?.approved_by?.name_id);

    const isSpr = Boolean(indentData?.area_of_service || indentData?.name_of_service);

    // PR items — empty for SPR (but SPR items are also mapped below for quotation workflows)
    const items: PRLineItem[] = itemRows.map((r, idx) => {
      const srNo = num(r?.sr_no) ?? idx + 1;
      if (isSpr) {
        // Map SPR fields to PRLineItem so quotation workflows still get line items
        const qty = num(r?.quantity) ?? 0;
        return {
          id: `${prNo}-spr-${srNo}`,
          srNo,
          partName: str(r?.service_description) || 'Service',
          uom: str(r?.uom) || '',
          totalQtyRequired: qty,
          lessQtyAvailableInStock: 0,
          netPrQtyOverride: qty,
        };
      }
      const totalQtyRequired = num(r?.total_qty_required) ?? 0;
      const lessQtyAvailableInStock = num(r?.less_qty_available_in_stock);
      const netPrQtyOverride = num(r?.net_pr_qty);
      const ratePerItem = num(r?.rate_per_item);
      return {
        id: `${prNo}-${srNo || genId()}`,
        srNo: srNo || 0,
        itemCode: maybeStr(r?.item_code),
        partName: str(r?.part_name) || 'Item',
        specification: maybeStr(r?.specification),
        uom: str(r?.uom) || 'No',
        totalQtyRequired,
        lessQtyAvailableInStock,
        procurementLeadTimeWeeks: num(r?.procurement_lead_time_weeks),
        materialRequiredByDate: maybeStr(r?.material_required_by_date),
        indigenousOrImported: maybeStr(r?.indigenous_or_imported),
        ratePerItem,
        preferredVendorName: maybeStr(r?.preferred_vendor_name),
        validityOfWarrantyAndGuarantee: maybeStr(r?.validity_of_warranty_and_guarantee),
        fullLifeHr: maybeStr(r?.full_life_hr),
        actualLifeHr: maybeStr(r?.actual_life_hr),
        reasonForReplacement: maybeStr(r?.reason_for_replacement),
        repairingPossibility: maybeStr(r?.repairing_possibility),
        netPrQtyOverride,
      };
    });

    // Full SPR items for the SPR preview document
    const sprItems: SprLineItem[] = isSpr ? itemRows.map((r, idx) => ({
      id: `${prNo}-spr-${r?.sr_no ?? idx + 1}`,
      srNo: r?.sr_no ?? idx + 1,
      serviceDescription: str(r?.service_description) || '',
      uom: str(r?.uom) || '',
      quantity: num(r?.quantity) ?? 0,
      startDate: str(r?.start_date_of_contract) || '',
      duration: str(r?.duration_of_contract) || '',
      completionDate: str(r?.completion_date_of_contract) || '',
      validity: str(r?.validity_of_contract) || '',
      servicesFrom: str(r?.services_required_from) || '',
      scopeAttached: str(r?.detailed_scope_attached) || '',
      boqAttached: str(r?.detailed_boq_attached) || '',
      approxValue: num(r?.approx_value_of_services) ?? 0,
      gstPercent: num(r?.gst_percentage) ?? 0,
      gstAmount: num(r?.gst_amount) ?? 0,
      proposedVendors: str(r?.proposed_vendors) || '',
      previousWO: str(r?.previous_wo_details) || '',
      remarks: str(r?.remarks) || '',
    })) : [];

    return {
      id: prNo,
      indentType: isSpr ? 'SPR' : 'PR',
      project: str(indentData?.project) || '—',
      prNo,
      date: dateOnly(x?.created_at),
      department: maybeStr(x?.department),
      indentedBy: indentedByName || approvedByName || '—',
      forwardedBy: forwardedByName || '—',
      directorsApproval: approvedByName || '—',
      indentedSignature: maybeStr(x?.indented_by?.signature),
      forwardedSignature: maybeStr(x?.forwarded_by?.signature),
      directorSignature: maybeStr(x?.approved_by?.signature),
      remarksNotes: maybeStr(x?.notes),
      budgetHead: '',
      items,
      areaOfService: str(indentData?.area_of_service) || undefined,
      func: str(indentData?.function) || undefined,
      natureOfService: str(indentData?.name_of_service) || undefined,
      sprItems: sprItems.length ? sprItems : undefined,
      status: 'draft',
    };
  });
};

const sample: Indent[] = [
  {
    id: 'pr-1',
    indentType: 'PR',
    project: 'Chhattisgarh 2250 Acres',
    prNo: 'SBR/PR/26/001',
    date: today(),
    department: 'Cultivation',
    indentedBy: 'SUKHDEEP SINGH',
    forwardedBy: 'RAJINDER SINGH PADDA',
    directorsApproval: 'RAJENDRA SHRINGARPUTALE',
    remarksNotes: '',
    budgetHead: 'Machinery',
    items: [
      { id: 'pr-li-1', srNo: 1, partName: 'Chisel Plough', uom: 'No', totalQtyRequired: 4, ratePerItem: 45000 },
    ],
    status: 'draft',
  },
];

const formatInr = (value: number) => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `₹ ${Math.round(value).toLocaleString()}`;
  }
};

const netPrQty = (it: PRLineItem) => {
  if (Number.isFinite(it.netPrQtyOverride as any)) return Math.max(0, Number(it.netPrQtyOverride));
  return Math.max(0, (it.totalQtyRequired || 0) - (it.lessQtyAvailableInStock || 0));
};
const approxValue = (it: PRLineItem) => netPrQty(it) * (it.ratePerItem || 0);
const totalValue = (items: PRLineItem[]) => items.reduce((s, it) => s + approxValue(it), 0);

const PRPreview = ({
  indent,
  attachments,
  onAddQuote,
  onRemoveQuote,
  readOnly,
  approved,
}: {
  indent: Omit<Indent, 'id' | 'status'>;
  attachments?: SignatureDiary;
  onAddQuote?: (lineItemId: string, quote: Quote) => void;
  onRemoveQuote?: (lineItemId: string, quoteId: string) => void;
  readOnly?: boolean;
  approved?: boolean;
}) => {
  const sigFor = (name: string) => attachments?.[name] ?? null;
  return (
    <div className="min-w-[980px]">
      <div className="border border-gray-300 bg-white relative">
        {approved ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="border-4 border-green-700/30 text-green-700/30 rounded-lg px-10 py-4 font-extrabold text-5xl tracking-[0.25em]">
              APPROVED
            </div>
          </div>
        ) : null}
        <div className="text-center font-semibold text-sm py-2 border-b border-gray-300">
          SAI BIORESOURCES PRIVATE LIMITED
        </div>

        <div className="grid grid-cols-12 border-b border-gray-300 text-xs">
          <div className="col-span-4 p-2 border-r border-gray-300">
            <span className="font-semibold">Project:</span> {indent.project || '—'}
          </div>
          <div className="col-span-4 p-2 border-r border-gray-300 text-center font-semibold">
            PURCHASE REQUISITION (PR.)
          </div>
          <div className="col-span-2 p-2 border-r border-gray-300">
            <span className="font-semibold">PR No.</span> {indent.prNo || '—'}
          </div>
          <div className="col-span-2 p-2">
            <span className="font-semibold">Date:</span> {indent.date || '—'}
          </div>
        </div>

        <div className="grid grid-cols-12 border-b border-gray-300 text-xs">
          <div className="col-span-4 p-2 border-r border-gray-300">
            <span className="font-semibold">Department:</span> {indent.department || '—'}
          </div>
          <div className="col-span-8 p-2">&nbsp;</div>
        </div>

        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-1 py-1 w-[28px]">Sr. Nos.</th>
              <th className="border border-gray-300 px-1 py-1 w-[70px]">Item Code</th>
              <th className="border border-gray-300 px-1 py-1">Part Name</th>
              <th className="border border-gray-300 px-1 py-1">Specification</th>
              <th className="border border-gray-300 px-1 py-1 w-[50px]">UoM</th>
              <th className="border border-gray-300 px-1 py-1 w-[70px]">Total Qty. Required</th>
              <th className="border border-gray-300 px-1 py-1 w-[80px]">Less Qty. Available in Stocks</th>
              <th className="border border-gray-300 px-1 py-1 w-[60px]">Net PR Qty</th>
              <th className="border border-gray-300 px-1 py-1 w-[70px]">Procurement Lead time (weeks)</th>
              <th className="border border-gray-300 px-1 py-1 w-[85px]">Material Required by Date</th>
              <th className="border border-gray-300 px-1 py-1 w-[70px]">Indigenous / Imported</th>
              <th className="border border-gray-300 px-1 py-1 w-[60px]">Rate/Item</th>
              <th className="border border-gray-300 px-1 py-1 w-[85px]">Approx. Value Rs.</th>
              <th className="border border-gray-300 px-1 py-1">Preferred Vendor Name</th>
              <th className="border border-gray-300 px-1 py-1 w-[85px]">Validity of Warranty and Guarantee</th>
              <th className="border border-gray-300 px-1 py-1 w-[60px]">Full life (Hr)</th>
              <th className="border border-gray-300 px-1 py-1 w-[60px]">Actual Life (Hr)</th>
              <th className="border border-gray-300 px-1 py-1 w-[90px]">Reason for replacement</th>
              <th className="border border-gray-300 px-1 py-1 w-[85px]">Repairing possibility Yes/No/NA</th>
            </tr>
          </thead>
          <tbody>
            {indent.items.map((it) => (
              <tr key={it.id}>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.srNo}</td>
                <td className="border border-gray-300 px-1 py-1">{it.itemCode || ''}</td>
                <td className="border border-gray-300 px-1 py-1">{it.partName || ''}</td>
                <td className="border border-gray-300 px-1 py-1">{it.specification || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.uom || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.totalQtyRequired || 0}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.lessQtyAvailableInStock || 0}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{netPrQty(it)}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.procurementLeadTimeWeeks || 0}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.materialRequiredByDate || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.indigenousOrImported || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-right">{it.ratePerItem ? it.ratePerItem.toLocaleString() : ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-right">{approxValue(it) ? formatInr(approxValue(it)) : ''}</td>
                <td className="border border-gray-300 px-1 py-1">{it.preferredVendorName || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.validityOfWarrantyAndGuarantee || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.fullLifeHr || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.actualLifeHr || ''}</td>
                <td className="border border-gray-300 px-1 py-1">{it.reasonForReplacement || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.repairingPossibility || 'NA'}</td>
              </tr>
            ))}

            <tr>
              <td colSpan={12} className="border border-gray-300 px-1 py-1 text-right font-semibold">TOTAL</td>
              <td colSpan={7} className="border border-gray-300 px-1 py-1 text-right font-semibold">
                {formatInr(totalValue(indent.items))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Quotations */}
        <div className="border-t border-gray-300">
          <div className="px-2 py-1 text-xs font-semibold bg-gray-50 border-b border-gray-300">Quotations</div>
          <div className="p-2 space-y-3">
            {indent.items.map((it) => (
              <div key={it.id} className="border border-gray-200 rounded">
                <div className="flex items-center justify-between px-2 py-1 bg-white">
                  <div className="text-xs font-semibold text-gray-800">
                    Item {it.srNo}: <span className="font-normal">{it.partName}</span>
                  </div>
                  {onAddQuote && !readOnly ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => {
                        const vendorName = window.prompt('Vendor Name');
                        if (!vendorName?.trim()) return;
                        const rateStr = window.prompt('Quoted Rate');
                        const quotedRate = Number(rateStr);
                        if (!Number.isFinite(quotedRate) || quotedRate <= 0) return;
                        const ltdStr = window.prompt('Lead time (days) [optional]') || '';
                        const leadTimeDays = ltdStr.trim() ? Number(ltdStr) : undefined;
                        const notes = window.prompt('Notes [optional]') || undefined;
                        onAddQuote(it.id, {
                          id: genId(),
                          vendorName: vendorName.trim(),
                          quotedRate,
                          leadTimeDays: Number.isFinite(leadTimeDays as any) ? leadTimeDays : undefined,
                          notes,
                        });
                      }}
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Add Quote
                    </Button>
                  ) : null}
                </div>

                <div className="px-2 pb-2">
                  {(it.quotes?.length || 0) === 0 ? (
                    <div className="text-[11px] text-gray-400 py-2">No quotes added.</div>
                  ) : (
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-200 px-2 py-1 text-left">Vendor</th>
                          <th className="border border-gray-200 px-2 py-1 text-right w-[120px]">Quoted Rate</th>
                          <th className="border border-gray-200 px-2 py-1 text-center w-[120px]">Lead time (days)</th>
                          <th className="border border-gray-200 px-2 py-1 text-left">Notes</th>
                          <th className="border border-gray-200 px-2 py-1 w-[40px]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {it.quotes?.map((q) => (
                          <tr key={q.id}>
                            <td className="border border-gray-200 px-2 py-1">{q.vendorName}</td>
                            <td className="border border-gray-200 px-2 py-1 text-right">{formatInr(q.quotedRate)}</td>
                            <td className="border border-gray-200 px-2 py-1 text-center">{q.leadTimeDays ?? '—'}</td>
                            <td className="border border-gray-200 px-2 py-1">{q.notes || '—'}</td>
                            <td className="border border-gray-200 px-2 py-1">
                              {onRemoveQuote && !readOnly ? (
                                <button
                                  type="button"
                                  className="text-gray-400 hover:text-red-600"
                                  onClick={() => onRemoveQuote(it.id, q.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-12 text-xs border-t border-gray-300">
          <div className="col-span-8 border-r border-gray-300">
            <div className="grid grid-cols-4 border-b border-gray-300">
              <div className="p-2 font-semibold">SAI BIORESOURCES PRIVATE LIMITED</div>
              <div className="p-2 font-semibold text-center">Name/ID</div>
              <div className="p-2 font-semibold text-center">Signature</div>
              <div className="p-2 font-semibold text-center">Date</div>
            </div>

            <div className="grid grid-cols-4 border-b border-gray-300">
              <div className="p-2 font-semibold">Indented By</div>
              <div className="p-2 text-center">{indent.indentedBy || '—'}</div>
              <div className="p-2 flex flex-col items-center justify-center gap-0.5">
                <div className="w-full h-10 border border-gray-200 rounded bg-white flex items-center justify-center px-1">
                  {sigFor(indent.indentedBy)?.signature ? (
                    <img src={sigFor(indent.indentedBy)!.signature} alt="Signature" className="h-8 object-contain" />
                  ) : indent.indentedSignature ? (
                    <span className="text-[10px] text-gray-700 text-center leading-tight">{indent.indentedSignature}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
                {sigFor(indent.indentedBy)?.stamp ? (
                  <img src={sigFor(indent.indentedBy)!.stamp} alt="Stamp" className="h-8 object-contain" />
                ) : null}
              </div>
              <div className="p-2 text-center">{indent.date || '—'}</div>
            </div>

            <div className="grid grid-cols-4 border-b border-gray-300">
              <div className="p-2 font-semibold">Forwarded By</div>
              <div className="p-2 text-center">{indent.forwardedBy || '—'}</div>
              <div className="p-2 flex flex-col items-center justify-center gap-0.5">
                <div className="w-full h-10 border border-gray-200 rounded bg-white flex items-center justify-center px-1">
                  {sigFor(indent.forwardedBy)?.signature ? (
                    <img src={sigFor(indent.forwardedBy)!.signature} alt="Signature" className="h-8 object-contain" />
                  ) : indent.forwardedSignature ? (
                    <span className="text-[10px] text-gray-700 text-center leading-tight">{indent.forwardedSignature}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
                {sigFor(indent.forwardedBy)?.stamp ? (
                  <img src={sigFor(indent.forwardedBy)!.stamp} alt="Stamp" className="h-8 object-contain" />
                ) : null}
              </div>
              <div className="p-2 text-center">{indent.date || '—'}</div>
            </div>

            <div className="grid grid-cols-4 border-b border-gray-300">
              <div className="p-2 font-semibold">Director's Approval</div>
              <div className="p-2 text-center">{indent.directorsApproval || '—'}</div>
              <div className="p-2 flex flex-col items-center justify-center gap-0.5">
                <div className="w-full h-10 border border-gray-200 rounded bg-white flex items-center justify-center px-1">
                  {sigFor(indent.directorsApproval)?.signature ? (
                    <img src={sigFor(indent.directorsApproval)!.signature} alt="Signature" className="h-8 object-contain" />
                  ) : indent.directorSignature ? (
                    <span className="text-[10px] text-gray-700 text-center leading-tight">{indent.directorSignature}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
                {sigFor(indent.directorsApproval)?.stamp ? (
                  <img src={sigFor(indent.directorsApproval)!.stamp} alt="Stamp" className="h-8 object-contain" />
                ) : null}
              </div>
              <div className="p-2 text-center">{indent.date || '—'}</div>
            </div>
          </div>

          <div className="col-span-4">
            <div className="border-b border-gray-300 p-2">
              <div className="font-semibold">Remarks / Notes</div>
              <div className="text-gray-700 mt-1 whitespace-pre-wrap">{indent.remarksNotes || '—'}</div>
            </div>
            <div className="p-2">
              <div className="font-semibold">Budget Head</div>
              <div className="text-gray-700 mt-1">{indent.budgetHead || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SprPreview = ({
  indent,
  attachments,
  onAddQuote,
  onRemoveQuote,
  readOnly,
  approved,
}: {
  indent: Omit<Indent, 'id' | 'status'>;
  attachments?: SignatureDiary;
  onAddQuote?: (lineItemId: string, quote: Quote) => void;
  onRemoveQuote?: (lineItemId: string, quoteId: string) => void;
  readOnly?: boolean;
  approved?: boolean;
}) => {
  const sigFor = (name: string) => attachments?.[name] ?? null;
  const rows = indent.sprItems ?? [];
  const subtotal = rows.reduce((s, r) => s + r.approxValue, 0);
  const gstTotal = rows.reduce((s, r) => s + r.gstAmount, 0);
  const total = subtotal + gstTotal;

  return (
    <div className="min-w-[980px]">
      <div className="border border-gray-300 bg-white relative">
        {approved ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="border-4 border-green-700/30 text-green-700/30 rounded-lg px-10 py-4 font-extrabold text-5xl tracking-[0.25em]">
              APPROVED
            </div>
          </div>
        ) : null}

        <div className="text-center font-semibold text-sm py-2 border-b border-gray-300">
          SAI BIORESOURCES PRIVATE LIMITED
        </div>

        <div className="grid grid-cols-12 border-b border-gray-300 text-xs">
          <div className="col-span-4 p-2 border-r border-gray-300">
            <span className="font-semibold">Area of Service:</span> {indent.areaOfService || '—'}
          </div>
          <div className="col-span-4 p-2 border-r border-gray-300 text-center font-semibold">
            SERVICE PURCHASE REQUISITION (SPR)
          </div>
          <div className="col-span-2 p-2 border-r border-gray-300">
            <span className="font-semibold">SPR No.</span> {indent.prNo || '—'}
          </div>
          <div className="col-span-2 p-2">
            <span className="font-semibold">Date:</span> {indent.date || '—'}
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-gray-300 text-xs">
          <div className="p-2 border-r border-gray-300">
            <span className="font-semibold">Function:</span> {indent.func || '—'}
          </div>
          <div className="p-2">
            <span className="font-semibold">Nature of Service:</span> {indent.natureOfService || '—'}
          </div>
        </div>

        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-1 py-1 w-[28px]">Sr.</th>
              <th className="border border-gray-300 px-1 py-1">Service Description</th>
              <th className="border border-gray-300 px-1 py-1 w-[40px]">UOM</th>
              <th className="border border-gray-300 px-1 py-1 w-[40px]">Qty</th>
              <th className="border border-gray-300 px-1 py-1 w-[75px]">Start Date</th>
              <th className="border border-gray-300 px-1 py-1 w-[70px]">Duration</th>
              <th className="border border-gray-300 px-1 py-1 w-[75px]">Completion</th>
              <th className="border border-gray-300 px-1 py-1 w-[75px]">Validity</th>
              <th className="border border-gray-300 px-1 py-1 w-[55px]">OEM/Prop</th>
              <th className="border border-gray-300 px-1 py-1 w-[45px]">Scope</th>
              <th className="border border-gray-300 px-1 py-1 w-[45px]">BOQ</th>
              <th className="border border-gray-300 px-1 py-1 w-[85px]">Approx Value (₹)</th>
              <th className="border border-gray-300 px-1 py-1 w-[45px]">GST %</th>
              <th className="border border-gray-300 px-1 py-1 w-[85px]">GST Amt (₹)</th>
              <th className="border border-gray-300 px-1 py-1">Proposed Vendors</th>
              <th className="border border-gray-300 px-1 py-1 w-[70px]">Prev WO</th>
              <th className="border border-gray-300 px-1 py-1 w-[70px]">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="border border-gray-300 px-1 py-1 text-center">{row.srNo}</td>
                <td className="border border-gray-300 px-1 py-1">{row.serviceDescription}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{row.uom}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{row.quantity}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{row.startDate}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{row.duration}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{row.completionDate}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{row.validity}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{row.servicesFrom}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{row.scopeAttached}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{row.boqAttached}</td>
                <td className="border border-gray-300 px-1 py-1 text-right">{formatInr(row.approxValue)}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{row.gstPercent}%</td>
                <td className="border border-gray-300 px-1 py-1 text-right">{formatInr(row.gstAmount)}</td>
                <td className="border border-gray-300 px-1 py-1">{row.proposedVendors}</td>
                <td className="border border-gray-300 px-1 py-1">{row.previousWO}</td>
                <td className="border border-gray-300 px-1 py-1">{row.remarks}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={17} className="border border-gray-300 px-1 py-2 text-center text-gray-400">No service items</td>
              </tr>
            )}
            <tr>
              <td colSpan={11} className="border border-gray-300 px-1 py-1 text-right font-semibold">Sub-Total</td>
              <td colSpan={6} className="border border-gray-300 px-1 py-1 text-right font-semibold">{formatInr(subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={11} className="border border-gray-300 px-1 py-1 text-right font-semibold">GST</td>
              <td colSpan={6} className="border border-gray-300 px-1 py-1 text-right font-semibold">{formatInr(gstTotal)}</td>
            </tr>
            <tr>
              <td colSpan={11} className="border border-gray-300 px-1 py-1 text-right font-semibold">TOTAL</td>
              <td colSpan={6} className="border border-gray-300 px-1 py-1 text-right font-semibold">{formatInr(total)}</td>
            </tr>
          </tbody>
        </table>

        {/* Quotations — reuses the same items mapped for quotation workflows */}
        <div className="border-t border-gray-300">
          <div className="px-2 py-1 text-xs font-semibold bg-gray-50 border-b border-gray-300">Quotations</div>
          <div className="p-2 space-y-3">
            {indent.items.map((it) => (
              <div key={it.id} className="border border-gray-200 rounded">
                <div className="flex items-center justify-between px-2 py-1 bg-white">
                  <div className="text-xs font-semibold text-gray-800">
                    Service {it.srNo}: <span className="font-normal">{it.partName}</span>
                  </div>
                  {onAddQuote && !readOnly ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => {
                        const vendorName = window.prompt('Vendor Name');
                        if (!vendorName?.trim()) return;
                        const rateStr = window.prompt('Quoted Rate');
                        const quotedRate = Number(rateStr);
                        if (!Number.isFinite(quotedRate) || quotedRate <= 0) return;
                        onAddQuote(it.id, { id: genId(), vendorName: vendorName.trim(), quotedRate });
                      }}
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Add Quote
                    </Button>
                  ) : null}
                </div>
                <div className="px-2 pb-2">
                  {(it.quotes?.length || 0) === 0 ? (
                    <div className="text-[11px] text-gray-400 py-2">No quotes added.</div>
                  ) : (
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-200 px-2 py-1 text-left">Vendor</th>
                          <th className="border border-gray-200 px-2 py-1 text-right w-[120px]">Quoted Rate</th>
                          <th className="border border-gray-200 px-2 py-1 text-left">Notes</th>
                          <th className="border border-gray-200 px-2 py-1 w-[40px]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {it.quotes?.map((q) => (
                          <tr key={q.id}>
                            <td className="border border-gray-200 px-2 py-1">{q.vendorName}</td>
                            <td className="border border-gray-200 px-2 py-1 text-right">{formatInr(q.quotedRate)}</td>
                            <td className="border border-gray-200 px-2 py-1">{q.notes || '—'}</td>
                            <td className="border border-gray-200 px-2 py-1">
                              {onRemoveQuote && !readOnly ? (
                                <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => onRemoveQuote(it.id, q.id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-12 text-xs border-t border-gray-300">
          <div className="col-span-8 border-r border-gray-300">
            <div className="grid grid-cols-4 border-b border-gray-300">
              <div className="p-2 font-semibold">SAI BIORESOURCES PRIVATE LIMITED</div>
              <div className="p-2 font-semibold text-center">Name/ID</div>
              <div className="p-2 font-semibold text-center">Signature</div>
              <div className="p-2 font-semibold text-center">Date</div>
            </div>
            <div className="grid grid-cols-4 border-b border-gray-300">
              <div className="p-2 font-semibold">Indented By</div>
              <div className="p-2 text-center">{indent.indentedBy || '—'}</div>
              <div className="p-2 flex flex-col items-center justify-center gap-0.5">
                <div className="w-full h-10 border border-gray-200 rounded bg-white flex items-center justify-center px-1">
                  {sigFor(indent.indentedBy)?.signature ? (
                    <img src={sigFor(indent.indentedBy)!.signature} alt="Signature" className="h-8 object-contain" />
                  ) : indent.indentedSignature ? (
                    <span className="text-[10px] text-gray-700 text-center leading-tight">{indent.indentedSignature}</span>
                  ) : <span className="text-gray-400">—</span>}
                </div>
              </div>
              <div className="p-2 text-center">{indent.date || '—'}</div>
            </div>
            <div className="grid grid-cols-4 border-b border-gray-300">
              <div className="p-2 font-semibold">Forwarded By</div>
              <div className="p-2 text-center">{indent.forwardedBy || '—'}</div>
              <div className="p-2 flex flex-col items-center justify-center gap-0.5">
                <div className="w-full h-10 border border-gray-200 rounded bg-white flex items-center justify-center px-1">
                  {sigFor(indent.forwardedBy)?.signature ? (
                    <img src={sigFor(indent.forwardedBy)!.signature} alt="Signature" className="h-8 object-contain" />
                  ) : indent.forwardedSignature ? (
                    <span className="text-[10px] text-gray-700 text-center leading-tight">{indent.forwardedSignature}</span>
                  ) : <span className="text-gray-400">—</span>}
                </div>
              </div>
              <div className="p-2 text-center">{indent.date || '—'}</div>
            </div>
            <div className="grid grid-cols-4">
              <div className="p-2 font-semibold">Director's Approval</div>
              <div className="p-2 text-center">{indent.directorsApproval || '—'}</div>
              <div className="p-2 flex flex-col items-center justify-center gap-0.5">
                <div className="w-full h-10 border border-gray-200 rounded bg-white flex items-center justify-center px-1">
                  {sigFor(indent.directorsApproval)?.signature ? (
                    <img src={sigFor(indent.directorsApproval)!.signature} alt="Signature" className="h-8 object-contain" />
                  ) : indent.directorSignature ? (
                    <span className="text-[10px] text-gray-700 text-center leading-tight">{indent.directorSignature}</span>
                  ) : <span className="text-gray-400">—</span>}
                </div>
              </div>
              <div className="p-2 text-center">{indent.date || '—'}</div>
            </div>
          </div>
          <div className="col-span-4">
            <div className="border-b border-gray-300 p-2">
              <div className="font-semibold">Remarks / Notes</div>
              <div className="text-gray-700 mt-1 whitespace-pre-wrap">{indent.remarksNotes || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

type ComparativeVendor = {
  id: string;
  name: string;
  directoryVendorId?: string;
  phone?: string;
  location?: string;
  address?: string;
  attachmentName?: string;
  quotationNo?: string;
};

type ComparativeItem = {
  id: string;
  srNo?: number;
  partName?: string;
  specification?: string;
  uom?: string;
  qty: number;
  gstPercent?: number;
  taxType?: string;
};

type ComparativeQuote = {
  vendorId: string;
  unitRateByItemId: Record<string, number>;
  discountPercentByItemId?: Record<string, number>;
};

type ComparativeCharge = {
  id: string;
  label: string;
  nature: 'Charge' | 'Discount';
  calculation: 'Fixed' | '% of Basic';
  taxPercent?: number;
  values?: Record<string, number>;
};

type ComparativeParameter = {
  id: string;
  label: string;
  values?: Record<string, string>;
};

type Comparative = {
  indentId: string;
  title?: string;
  subTitle?: string;
  comparisonNo?: string;
  revision?: number;
  revisionOf?: string;
  revisionDate?: string;
  indentDate?: string;
  department?: string;
  projectCluster?: string;
  deliveryLocation?: string;
  requirementType?: string;
  comparisonBasis?: string;
  requiredByDate?: string;
  preparedBy?: string;
  purposeRemarks?: string;
  vendors?: ComparativeVendor[];
  items?: ComparativeItem[];
  quotes?: ComparativeQuote[];
  gstPercent?: number;
  freightCharges?: Record<string, number>;
  otherCharges?: Record<string, number>;
  itemDiscountAmount?: Record<string, number>;
  additionalChargesAmount?: Record<string, number>;
  commercialDiscountAmount?: Record<string, number>;
  roundOffAmount?: Record<string, number>;
  charges?: ComparativeCharge[];
  comparisonParameters?: ComparativeParameter[];
  vendorStatus?: Record<string, string>;
  technicalRecommendationVendorId?: string;
  // some older pages used a slightly different key
  technicalRecommendedVendorId?: string;
  lastSavedAt?: string;
  isDraft?: boolean;
};

const fetchComparativeForPreview = async (prNumber: string): Promise<Comparative | null> => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl || !prNumber) return null;
  try {
    const res = await fetch(`${baseUrl}/purchase_flow/get_comparative_statement_draft`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ pr_number: prNumber }),
    });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    const row: any = Array.isArray(data?.items) ? data.items[0] : null;
    if (!row) return null;

    // Rows saved after the "meta" field was introduced carry the entire
    // Comparative model; prefer it. Older rows only have item_row/quoters,
    // so reconstruct a minimal preview from those instead.
    const meta = row?.meta && typeof row.meta === 'object' ? row.meta : null;
    if (meta && Array.isArray(meta.items) && meta.items.length) {
      return meta as Comparative;
    }

    const itemRows: any[] = Array.isArray(row?.item_row) ? row.item_row : [];
    const items: ComparativeItem[] = itemRows.map((it, idx) => ({
      id: `it-${idx + 1}`,
      srNo: idx + 1,
      partName: str(it?.item_name),
      uom: str(it?.UoM),
      qty: numOr0(it?.quantity),
      gstPercent: numOr0(it?.gst_percentage),
    }));
    const quoters: any[] = Array.isArray(row?.quoters) ? row.quoters : [];
    const vendors: ComparativeVendor[] = quoters.map((q) => str(q?.vendor_id)).filter(Boolean).map((vid) => ({ id: vid, name: vid }));
    const quotes: ComparativeQuote[] = quoters
      .map((q) => {
        const vendorId = str(q?.vendor_id);
        const unitRateByItemId: Record<string, number> = {};
        const costing = q?.item_costing && typeof q.item_costing === 'object' ? q.item_costing : {};
        items.forEach((it) => {
          const costRow = (costing as any)?.[it.partName || ''];
          unitRateByItemId[it.id] = numOr0(costRow?.per_unit_costing);
        });
        return { vendorId, unitRateByItemId };
      })
      .filter((q) => q.vendorId);

    return {
      indentId: prNumber,
      vendors,
      items,
      quotes,
      lastSavedAt: str(row?.created_at),
    };
  } catch {
    return null;
  }
};

const numOr0 = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

const ComparativeStatementPreview = ({ c, showForwardedStamp }: { c: Comparative; showForwardedStamp?: boolean }) => {
  const vendors = Array.isArray(c?.vendors) ? c.vendors : [];
  const items = Array.isArray(c?.items) ? c.items : [];
  const quotes = Array.isArray(c?.quotes) ? c.quotes : [];

  const techRecId = String((c as any)?.technicalRecommendationVendorId ?? (c as any)?.technicalRecommendedVendorId ?? '').trim();
  const techRecName = techRecId ? (vendors.find((v) => String(v.id) === techRecId)?.name || techRecId) : '';

  const quoteByVendorId: Record<string, ComparativeQuote | undefined> = {};
  for (const q of quotes) quoteByVendorId[String((q as any)?.vendorId ?? '')] = q;

  const money = (value: unknown) => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(numOr0(value));
  const showDate = (value?: string) => {
    if (!value) return 'Not Recorded';
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
    return value;
  };
  const gstPctForItem = (it: ComparativeItem) => numOr0(it.gstPercent) || numOr0(c.gstPercent);

  const baseForVendor = (vendorId: string) => {
    const q = quoteByVendorId[vendorId];
    return items.reduce((sum, it) => {
      const unit = numOr0(q?.unitRateByItemId?.[it.id]);
      return sum + unit * numOr0(it.qty);
    }, 0);
  };

  const lineDiscountForVendor = (vendorId: string) => {
    const q = quoteByVendorId[vendorId];
    return items.reduce((sum, it) => {
      const amount = numOr0(q?.unitRateByItemId?.[it.id]) * numOr0(it.qty);
      return sum + amount * (numOr0(q?.discountPercentByItemId?.[it.id]) / 100);
    }, 0);
  };

  const itemDiscountForVendor = (vendorId: string) =>
    lineDiscountForVendor(vendorId) + numOr0(c.itemDiscountAmount?.[vendorId]);

  const netBasicForVendor = (vendorId: string) =>
    Math.max(0, baseForVendor(vendorId) - itemDiscountForVendor(vendorId));

  const gstForVendor = (vendorId: string) => {
    const q = quoteByVendorId[vendorId];
    return items.reduce((sum, it) => {
      const unit = numOr0(q?.unitRateByItemId?.[it.id]);
      const gross = unit * numOr0(it.qty);
      const discount = gross * (numOr0(q?.discountPercentByItemId?.[it.id]) / 100);
      const amt = Math.max(0, gross - discount);
      const gp = gstPctForItem(it);
      const taxType = String(it.taxType || '').toLowerCase();
      return sum + (/(exempt|nil rated|rcm|inclusive)/.test(taxType) ? 0 : amt * (gp / 100));
    }, 0);
  };

  const adjustmentForVendor = (vendorId: string) => {
    let charges = numOr0(c.additionalChargesAmount?.[vendorId]);
    let discounts = numOr0(c.commercialDiscountAmount?.[vendorId]);
    let tax = 0;
    for (const entry of c.charges || []) {
      const entered = numOr0(entry.values?.[vendorId]);
      const amount = entry.calculation === '% of Basic' ? netBasicForVendor(vendorId) * entered / 100 : entered;
      if (entry.nature === 'Discount') discounts += amount;
      else {
        charges += amount;
        tax += amount * numOr0(entry.taxPercent) / 100;
      }
    }
    return { charges, discounts, tax };
  };

  const grandTotalForVendor = (vendorId: string) => {
    const adjustment = adjustmentForVendor(vendorId);
    return netBasicForVendor(vendorId) + adjustment.charges - adjustment.discounts + gstForVendor(vendorId) + adjustment.tax + numOr0(c.roundOffAmount?.[vendorId]);
  };

  const summaryRows = [
    { label: 'Basic Amount (Excl. Tax)', value: baseForVendor },
    { label: 'Item Discount', value: itemDiscountForVendor },
    { label: 'Net Basic Amount', value: netBasicForVendor },
    { label: 'GST (as per item GST%)', value: gstForVendor },
    { label: 'Additional Charges', value: (id: string) => adjustmentForVendor(id).charges },
    { label: 'Commercial Discount', value: (id: string) => adjustmentForVendor(id).discounts },
    { label: 'Round Off', value: (id: string) => numOr0(c.roundOffAmount?.[id]) },
  ];
  const parameters = (c.comparisonParameters || []).filter((parameter) =>
    vendors.some((vendor) => String(parameter.values?.[vendor.id] || '').trim()),
  );
  const vendorWidth = vendors.length ? `${60 / vendors.length}%` : '60%';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#cbded9] bg-white shadow-sm">
      {showForwardedStamp ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="rotate-[-8deg] rounded-lg border-4 border-[#0b463f]/20 px-10 py-4 text-5xl font-extrabold tracking-[0.25em] text-[#0b463f]/20">
            FORWARDED
          </div>
        </div>
      ) : null}

      <div className="bg-[#0b463f] px-5 py-4 text-white">
        <div className="text-center text-base font-bold uppercase tracking-[0.16em]">Commercial Comparative Statement</div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-white/80">
          <span>Comparison No.: <b className="text-white">{c.comparisonNo || 'Not Recorded'}</b></span>
          <span>{c.isDraft ? 'Draft' : 'Saved'}{c.revision ? ` · Revision R${c.revision}` : ''}</span>
          {c.lastSavedAt ? <span>Updated: {new Date(c.lastSavedAt).toLocaleString('en-IN')}</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-[#d7e4e0] bg-[#f4f8f7] text-xs md:grid-cols-4">
        {[
          ['Indent Date', showDate(c.indentDate)],
          ['Department', c.department || 'Not Recorded'],
          ['Project / Cluster', c.projectCluster || 'Not Recorded'],
          ['Requirement', c.requirementType || 'Goods'],
          ['Delivery Location', c.deliveryLocation || 'Not Recorded'],
          ['Required By', showDate(c.requiredByDate)],
          ['Prepared By', c.preparedBy || 'Not Recorded'],
          ['Purpose / Remarks', c.purposeRemarks || 'Not Recorded'],
        ].map(([label, value]) => (
          <div key={label} className="min-h-14 border-b border-r border-[#d7e4e0] px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 font-semibold text-slate-800">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid border-b border-[#d7e4e0] bg-white" style={{ gridTemplateColumns: `repeat(${Math.max(vendors.length, 1)}, minmax(0, 1fr))` }}>
        {vendors.length ? vendors.map((vendor, index) => (
          <div key={vendor.id} className="border-r border-[#d7e4e0] px-4 py-3 text-xs last:border-r-0">
            <div className="font-bold uppercase text-[#0b463f]">Vendor {index + 1}</div>
            <div className="mt-1 text-sm font-bold text-slate-900">{vendor.name || 'Not Recorded'}</div>
            <div className="mt-1 text-slate-500">{vendor.address || vendor.location || 'Address not recorded'}</div>
            <div className="text-slate-500">Phone: {vendor.phone || 'Not Recorded'}</div>
            <div className="text-slate-500">Quotation: {vendor.attachmentName || vendor.quotationNo || 'Not Uploaded'}</div>
          </div>
        )) : <div className="px-4 py-3 text-sm text-slate-500">No vendor has been recorded in this statement.</div>}
      </div>

      <div className="bg-[#edf4f2] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#0b463f]">Item &amp; Vendor Comparison</div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: '6%' }} /><col style={{ width: '24%' }} /><col style={{ width: '5%' }} /><col style={{ width: '5%' }} />
            {vendors.map((vendor) => <col key={vendor.id} style={{ width: vendorWidth }} />)}
          </colgroup>
          <thead><tr className="bg-[#0b463f] text-white">
            <th className="border border-[#2c625b] px-2 py-2 text-center">S. No.</th>
            <th className="border border-[#2c625b] px-2 py-2 text-left">Item / Part Name</th>
            <th className="border border-[#2c625b] px-2 py-2 text-center">Qty.</th>
            <th className="border border-[#2c625b] px-2 py-2 text-center">UOM</th>
            {vendors.map((vendor) => <th key={vendor.id} className="border border-[#2c625b] px-2 py-2 text-center">{vendor.name || 'Vendor'}</th>)}
          </tr></thead>
          <tbody>
            {items.length ? items.map((item, index) => (
              <tr key={item.id} className="bg-white">
                <td className="border border-[#d7e4e0] p-2 text-center">{item.srNo || index + 1}</td>
                <td className="border border-[#d7e4e0] p-2"><div className="font-semibold text-slate-900">{item.partName || 'Not Recorded'}</div>{item.specification ? <div className="mt-0.5 text-[10px] text-slate-500">{item.specification}</div> : null}</td>
                <td className="border border-[#d7e4e0] p-2 text-center tabular-nums">{numOr0(item.qty)}</td>
                <td className="border border-[#d7e4e0] p-2 text-center">{item.uom || '—'}</td>
                {vendors.map((vendor) => {
                  const rate = numOr0(quoteByVendorId[vendor.id]?.unitRateByItemId?.[item.id]);
                  return <td key={vendor.id} className="border border-[#d7e4e0] p-2 text-center tabular-nums"><div className="font-semibold">{money(rate)}</div><div className="text-[10px] text-slate-500">Amount: {money(rate * numOr0(item.qty))}</div></td>;
                })}
              </tr>
            )) : <tr><td colSpan={4 + vendors.length} className="border border-[#d7e4e0] p-5 text-center text-slate-500">No item details recorded.</td></tr>}
          </tbody>
        </table>
      </div>

      {vendors.length ? <>
        <div className="bg-[#edf4f2] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#0b463f]">Commercial Summary</div>
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup><col style={{ width: '40%' }} />{vendors.map((vendor) => <col key={vendor.id} style={{ width: vendorWidth }} />)}</colgroup>
          <thead><tr className="bg-[#0b463f] text-white"><th className="border border-[#2c625b] px-3 py-2 text-left">Particular</th>{vendors.map((vendor) => <th key={vendor.id} className="border border-[#2c625b] px-3 py-2 text-center">{vendor.name}</th>)}</tr></thead>
          <tbody>
            {summaryRows.map((row) => <tr key={row.label}><td className="border border-[#d7e4e0] px-3 py-2 font-semibold">{row.label}</td>{vendors.map((vendor) => <td key={vendor.id} className="border border-[#d7e4e0] px-3 py-2 text-center tabular-nums">{money(row.value(vendor.id))}</td>)}</tr>)}
            <tr className="bg-[#e6f1ee] font-bold text-[#086a45]"><td className="border border-[#bcd4ce] px-3 py-2">Landed Cost / Grand Total</td>{vendors.map((vendor) => <td key={vendor.id} className="border border-[#bcd4ce] px-3 py-2 text-center tabular-nums">{money(grandTotalForVendor(vendor.id))}</td>)}</tr>
          </tbody>
        </table>
      </> : null}

      {parameters.length ? <>
        <div className="bg-[#edf4f2] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#0b463f]">Commercial Terms</div>
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup><col style={{ width: '40%' }} />{vendors.map((vendor) => <col key={vendor.id} style={{ width: vendorWidth }} />)}</colgroup>
          <thead><tr className="bg-[#0b463f] text-white"><th className="border border-[#2c625b] px-3 py-2 text-left">Comparison Parameter</th>{vendors.map((vendor) => <th key={vendor.id} className="border border-[#2c625b] px-3 py-2 text-center">{vendor.name}</th>)}</tr></thead>
          <tbody>{parameters.map((parameter) => <tr key={parameter.id}><td className="border border-[#d7e4e0] px-3 py-2 font-semibold">{parameter.label}</td>{vendors.map((vendor) => <td key={vendor.id} className="border border-[#d7e4e0] px-3 py-2 text-center">{parameter.values?.[vendor.id] || 'Not Recorded'}</td>)}</tr>)}</tbody>
        </table>
      </> : null}

      {(techRecId || vendors.length) ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#d7e4e0] bg-[#f7faf9] px-4 py-3 text-xs">
          <div><span className="font-bold text-slate-600">Technical recommendation:</span> <span className="font-semibold text-slate-900">{techRecName || 'Not Recorded'}</span></div>
          <div className="flex flex-wrap gap-2">{vendors.map((vendor) => c.vendorStatus?.[vendor.id] ? <span key={vendor.id} className="rounded-full bg-[#e5f2ee] px-3 py-1 font-semibold text-[#0b463f]">{vendor.name}: {c.vendorStatus[vendor.id]}</span> : null)}</div>
        </div>
      ) : null}
    </div>
  );
};

const normalize = (v: unknown) => str(v).toLowerCase();

const indentMatchesSearch = (it: Indent, query: string) => {
  const q = normalize(query);
  if (!q) return true;

  const fields: Array<unknown> = [
    it.prNo,
    it.project,
    it.department,
    it.indentedBy,
    it.forwardedBy,
    it.directorsApproval,
    it.remarksNotes,
    it.budgetHead,
    it.date,
  ];

  if (fields.some((f) => normalize(f).includes(q))) return true;

  if (
    (it.items || []).some((li) =>
      [li.itemCode, li.partName, li.specification, li.uom, li.preferredVendorName]
        .filter(Boolean)
        .some((f) => normalize(f).includes(q)),
    )
  ) {
    return true;
  }

  return false;
};

const groupIndentsByDate = (list: Indent[]) => {
  const byDate: Record<string, Indent[]> = {};
  for (const it of list) {
    const d = str(it.date) || '—';
    (byDate[d] ||= []).push(it);
  }

  // newest date first (YYYY-MM-DD lexicographic sort)
  const dates = Object.keys(byDate).sort((a, b) => {
    if (a === b) return 0;
    if (a === '—') return 1;
    if (b === '—') return -1;
    return a < b ? 1 : -1;
  });

  for (const d of dates) {
    byDate[d].sort((a, b) => {
      const ap = str(a.prNo || a.id);
      const bp = str(b.prNo || b.id);
      return ap.localeCompare(bp);
    });
  }

  return dates.map((date) => ({ date, indents: byDate[date] }));
};

const PurchaseRequisition = ({ indentTypeFilter = 'PR' }: { indentTypeFilter?: 'PR' | 'SPR' }) => {
  const isWorkComparative = indentTypeFilter === 'SPR';
  const navigate = useNavigate();
  const [indents, setIndents] = useState<Indent[]>([]);
  const [open, setOpen] = useState(false);
  const [diary, setDiary] = useState<SignatureDiary>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newPrNo, setNewPrNo] = useState('');
  const [newDate, setNewDate] = useState(today());
  const [newIndentedBy, setNewIndentedBy] = useState('');
  const [newForwardedBy, setNewForwardedBy] = useState('');
  const [newDirectorsApproval, setNewDirectorsApproval] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [previewIndent, setPreviewIndent] = useState<Indent | null>(null);
  const [activeTab, setActiveTab] = useState<'new' | 'process' | 'po'>('new');
  const [openAddQuote, setOpenAddQuote] = useState<string | null>(null);
  const [addQuoteForms, setAddQuoteForms] = useState<Record<string, { vendor: string; file?: File | null; prices: Record<string, string> }>>({});

  const [previewComparative, setPreviewComparative] = useState<Comparative | null>(null);
  const [printComparativeIndent, setPrintComparativeIndent] = useState<Indent | null>(null);

  const printComparativeStatement = (indent: Indent, orientation: 'portrait' | 'landscape') => {
    const indentNumber = str(indent.prNo || indent.id);
    if (!indentNumber) {
      toast.error('PR number is unavailable for this comparative statement.');
      return;
    }
    const base = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    const popup = window.open(`${base}/purchase-requisition/PR/${encodeURIComponent(indentNumber)}/quotation?print=${orientation}`, '_blank');
    if (!popup) {
      toast.error('Pop-up blocked. Please allow pop-ups to print the comparative statement.');
    }
  };

  const [quotationStatusByPr, setQuotationStatusByPr] = useState<Record<
    string,
    { status: QuotationStatus; loading: boolean }
  >>({});

  const [forwardedByPr, setForwardedByPr] = useState<Record<string, boolean>>({});
  const [forwardingByPr, setForwardingByPr] = useState<Record<string, boolean>>({});

  const vendors = ['Vendor A', 'Vendor B', 'Vendor C'];

  const openAddQuoteForm = (indent: Indent) => {
    setOpenAddQuote((s) => (s === indent.id ? null : indent.id));
    setAddQuoteForms((prev) => {
      if (prev[indent.id]) return prev;
      const prices: Record<string, string> = {};
      indent.items.forEach((li) => { prices[li.id] = String(li.ratePerItem || 0); });
      return { ...prev, [indent.id]: { vendor: vendors[0], file: null, prices } };
    });
  };

  const handleFileChange = (indentId: string, f?: File) => {
    setAddQuoteForms((p) => ({ ...p, [indentId]: { ...(p[indentId] || { vendor: vendors[0], prices: {} }), file: f || null } }));
  };

  const handlePriceChange = (indentId: string, lineItemId: string, value: string) => {
    setAddQuoteForms((p) => ({ ...p, [indentId]: { ...(p[indentId] || { vendor: vendors[0], prices: {} }), prices: { ...(p[indentId]?.prices || {}), [lineItemId]: value } } }));
  };

  const handleVendorChange = (indentId: string, vendor: string) => {
    setAddQuoteForms((p) => ({ ...p, [indentId]: { ...(p[indentId] || { vendor: vendors[0], prices: {} }), vendor } }));
  };

  const submitAddQuote = async (indentId: string) => {
    const form = addQuoteForms[indentId];
    if (!form || !form.vendor) return toast.error('Vendor required');
    const indent = indents.find((i) => i.id === indentId);
    if (!indent) return toast.error('Indent not found');

    let dataUrl: string | undefined;
    if (form.file) {
      dataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = rej;
        fr.readAsDataURL(form.file as File);
      });
    }

    // add a quote per line item with provided price
    indent.items.forEach((li) => {
      const priceStr = form.prices[li.id] || '0';
      const q: Quote = {
        id: genId(),
        vendorName: form.vendor,
        quotedRate: Number(priceStr) || 0,
        document: form.file ? { name: form.file.name, url: dataUrl } : undefined,
      };
      addQuote(indentId, li.id, q);
    });

    setOpenAddQuote(null);
    toast.success('Quotation(s) added');
  };

  useEffect(() => {
    setDiary(readSignatureDiary());
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const apiIndents = await fetchIndentsForPr();
        setIndents(apiIndents);
      } catch (e: any) {
        const message = e?.message ? String(e.message) : 'Failed to fetch indents';
        toast.error(`Failed to load indents${message ? `: ${message}` : ''}`);
        setIndents(sample);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (!indents.length) return;
    let cancelled = false;

    const uniquePrs = Array.from(new Set(indents.map((x) => str(x.prNo || x.id)).filter(Boolean)));
    if (!uniquePrs.length) return;

    const loadStatuses = async () => {
      // mark PRs as loading (refresh every time indents load)
      setQuotationStatusByPr((prev) => {
        const next = { ...prev };
        for (const pr of uniquePrs) {
          next[pr] = { status: next[pr]?.status ?? 'unknown', loading: true };
        }
        return next;
      });

      await Promise.all(
        uniquePrs.map(async (pr) => {
          try {
            const st = await fetchIndentQuotationStatus(pr);
            if (cancelled) return;
            if (st === 'forwarded') {
              setForwardedByPr((p) => ({ ...p, [pr]: true }));
            }
            setQuotationStatusByPr((prev) => ({
              ...prev,
              [pr]: { status: st, loading: false },
            }));
          } catch {
            if (cancelled) return;
            setQuotationStatusByPr((prev) => ({
              ...prev,
              [pr]: { status: 'unknown', loading: false },
            }));
          }
        }),
      );
    };

    void loadStatuses();
    return () => {
      cancelled = true;
    };
  }, [indents]);

  useEffect(() => {
    if (!previewIndent) {
      setPreviewComparative(null);
      return;
    }
    let cancelled = false;
    const prNumber = str(previewIndent.prNo) || str(previewIndent.id);
    void fetchComparativeForPreview(prNumber).then((c) => {
      if (!cancelled) setPreviewComparative(c);
    });
    return () => {
      cancelled = true;
    };
  }, [previewIndent]);

  const labelForQuotationStatus = (s: QuotationStatus) => {
    if (s === 'forwarded') return 'Forwarded';
    if (s === 'saved') return 'Saved';
    if (s === 'draft') return 'Draft';
    if (s === 'no_comparative_statement') return 'Not started';
    return 'Unknown';
  };

  const classForQuotationStatus = (s: QuotationStatus) => {
    if (s === 'forwarded') return 'text-green-800';
    if (s === 'saved') return 'text-green-700';
    if (s === 'draft') return 'text-red-600';
    if (s === 'no_comparative_statement') return 'text-gray-900';
    return 'text-gray-500';
  };

  const isForwarded = (pr: string) => Boolean(forwardedByPr[pr]);

  const forwardNow = async (pr: string) => {
    const prNumber = str(pr);
    if (!prNumber) return;
    if (forwardingByPr[prNumber]) return;
    if (forwardedByPr[prNumber]) return;

    setForwardingByPr((p) => ({ ...p, [prNumber]: true }));
    try {
      const ok = await forwardComparativeStatement(prNumber);
      if (!ok) {
        toast.error('Forward failed');
        return;
      }
      setForwardedByPr((p) => ({ ...p, [prNumber]: true }));
      setQuotationStatusByPr((p) => ({
        ...p,
        [prNumber]: { status: 'forwarded', loading: false },
      }));
      toast.success('Forwarded');
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '').trim();
      toast.error(`Forward failed${msg ? `: ${msg}` : ''}`);
    } finally {
      setForwardingByPr((p) => ({ ...p, [prNumber]: false }));
    }
  };

  const signaturesPresent = (it: Indent) => {
    if (it.indentedSignature || it.forwardedSignature || it.directorSignature) {
      return {
        indented: Boolean(it.indentedSignature),
        forwarded: Boolean(it.forwardedSignature),
        director: Boolean(it.directorSignature),
      };
    }
    const d = readSignatureDiary();
    return {
      indented: Boolean(it.indentedBy && d[it.indentedBy]?.signature),
      forwarded: Boolean(it.forwardedBy && d[it.forwardedBy]?.signature),
      director: Boolean(it.directorsApproval && d[it.directorsApproval]?.signature),
    };
  };

  const canRaise = (it: Indent) => {
    const s = signaturesPresent(it);
    return s.indented && s.forwarded && s.director;
  };

  const hasAnyQuotes = (it: Indent) => it.items.some((li) => (li.quotes?.length || 0) > 0);

  const createPO = (id: string) => {
    setIndents((prev) => prev.map((x) => {
      if (x.id !== id) return x;
      // ensure every line item has at least one quote
      const missing = x.items.some((li) => !(li.quotes && li.quotes.length > 0));
      if (missing) {
        toast.error('All items must have at least one quote to create PO');
        return x;
      }

      const selected = x.items.map((li) => {
        const best = (li.quotes || []).reduce((b: Quote | null, q) => {
          if (!b) return q;
          return q.quotedRate < b.quotedRate ? q : b;
        }, null as Quote | null)!;
        return { lineItemId: li.id, quoteId: best.id, vendorName: best.vendorName, quotedRate: best.quotedRate };
      });

      const total = x.items.reduce((s, li) => {
        const sel = selected.find((si) => si.lineItemId === li.id)!;
        return s + (sel.quotedRate * netPrQty(li));
      }, 0);

      return {
        ...x,
        status: 'po',
        purchaseOrder: { id: genId(), date: today(), totalValue: total, items: selected },
      };
    }));
    toast.success(`${isWorkComparative ? 'Work' : 'Purchase'} Order created`);
  };

  const raisePR = (id: string) => {
    setIndents((prev) => prev.map((x) => x.id === id ? { ...x, status: 'raised' } : x));
    toast.success('Purchase Requisition raised');
  };

  const saveNew = () => {
    if (!newProject.trim()) return toast.error('Project required');
    if (!newPrNo.trim()) return toast.error('PR No required');
    if (!newIndentedBy.trim()) return toast.error('Indented By required');
    if (!newForwardedBy.trim()) return toast.error('Forwarded By required');
    if (!newDirectorsApproval.trim()) return toast.error("Director's name required");
    const id = genId();
    const item: PRLineItem = { id: genId(), srNo: 1, partName: newItemName || 'Item', uom: 'No', totalQtyRequired: newItemQty };
    const next: Indent = {
      id,
      project: newProject.trim(),
      prNo: newPrNo.trim(),
      date: newDate,
      department: undefined,
      indentedBy: newIndentedBy.trim(),
      forwardedBy: newForwardedBy.trim(),
      directorsApproval: newDirectorsApproval.trim(),
      remarksNotes: '',
      budgetHead: '',
      items: [item],
      status: 'draft',
    };
    setIndents((p) => [next, ...p]);
    setOpen(false);
    toast.success('Indent created');
  };

  const addQuote = (indentId: string, lineItemId: string, quote: Quote) => {
    setIndents((prev) => prev.map((x) => {
      if (x.id !== indentId) return x;
      return {
        ...x,
        items: x.items.map((li) => li.id === lineItemId ? { ...li, quotes: [quote, ...(li.quotes || [])] } : li),
      };
    }));
    toast.success('Quote added');
  };

  const removeQuote = (indentId: string, lineItemId: string, quoteId: string) => {
    setIndents((prev) => prev.map((x) => {
      if (x.id !== indentId) return x;
      return {
        ...x,
        items: x.items.map((li) => li.id === lineItemId ? { ...li, quotes: (li.quotes || []).filter((q) => q.id !== quoteId) } : li),
      };
    }));
  };

  const openQuotationPage = (indent: Indent) => {
    const prKey = str(indent.prNo || indent.id);
    if (isForwarded(prKey)) {
      toast.error('Already forwarded. Quotations are locked.');
      return;
    }
    // No pre-seeding here — the quotation page itself seeds a fresh comparative
    // (from the indent API) the first time it opens with nothing saved yet.
    const typeSegment = indent.indentType === 'SPR' ? 'SPR' : 'PR';
    navigate(`/purchase-requisition/${typeSegment}/${encodeURIComponent(indent.id)}/quotation`);
  };

  const openRevisionPage = (indent: Indent) => {
    const typeSegment = indent.indentType === 'SPR' ? 'SPR' : 'PR';
    navigate(`/purchase-requisition/${typeSegment}/${encodeURIComponent(indent.id)}/quotation?revise=1`);
  };

  const scopedIndents = useMemo(
    () => indents.filter((indent) => (indent.indentType || 'PR') === indentTypeFilter),
    [indentTypeFilter, indents],
  );

  const indentsAfterSearch = useMemo(() => {
    const q = str(searchQuery);
    if (!q) return scopedIndents;
    return scopedIndents.filter((it) => indentMatchesSearch(it, q));
  }, [scopedIndents, searchQuery]);

  const newIndents = useMemo(() => indentsAfterSearch.filter((it) => it.status !== 'po'), [indentsAfterSearch]);
  const processIndents = useMemo(
    () => indentsAfterSearch.filter((it) => {
      if (it.status === 'po') return false;
      const status = quotationStatusByPr[str(it.prNo || it.id)]?.status;
      return status === 'draft' || status === 'saved' || status === 'forwarded' || hasAnyQuotes(it);
    }),
    [indentsAfterSearch, quotationStatusByPr],
  );
  const poIndents = useMemo(() => indentsAfterSearch.filter((it) => it.status === 'po'), [indentsAfterSearch]);

  const newGroups = useMemo(() => groupIndentsByDate(newIndents), [newIndents]);
  const processGroups = useMemo(() => groupIndentsByDate(processIndents), [processIndents]);
  const poGroups = useMemo(() => groupIndentsByDate(poIndents), [poIndents]);
  const comparativeSummary = useMemo(() => {
    const statuses = indentsAfterSearch.map((indent) => quotationStatusByPr[str(indent.prNo || indent.id)]?.status || 'unknown');
    return {
      total: indentsAfterSearch.length,
      notStarted: statuses.filter((status) => status === 'no_comparative_statement' || status === 'unknown').length,
      inProgress: statuses.filter((status) => status === 'draft' || status === 'saved').length,
      forwarded: statuses.filter((status) => status === 'forwarded').length,
    };
  }, [indentsAfterSearch, quotationStatusByPr]);

  return (
    <div className="min-h-screen space-y-7 bg-[#fbfcfd] p-4 text-slate-900 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-bold text-emerald-700">{isWorkComparative ? 'Work Order Operations' : 'Purchase Order Operations'}</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{isWorkComparative ? 'Work Comparative Statement' : 'Purchase Comparative Statement'}</h1>
          <p className="mt-3 text-base font-medium text-slate-600">Create and manage commercial comparative statements against every {isWorkComparative ? 'service requisition' : 'purchase requisition'} raised in the system.</p>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: isWorkComparative ? 'Service Requisitions' : 'Purchase Requisitions', value: comparativeSummary.total, hint: `All ${isWorkComparative ? 'SRs' : 'PRs'} available for comparison`, Icon: ClipboardList, tone: 'bg-[#0D3A35]/10 text-[#0D3A35]' },
          { label: 'Not Started', value: comparativeSummary.notStarted, hint: 'Comparative statement pending', Icon: FileText, tone: 'bg-blue-50 text-blue-700' },
          { label: 'Draft / Saved', value: comparativeSummary.inProgress, hint: 'Statements being prepared', Icon: Clock3, tone: 'bg-amber-50 text-amber-700' },
          { label: 'Forwarded', value: comparativeSummary.forwarded, hint: 'Sent for HO processing', Icon: ShoppingCart, tone: 'bg-emerald-50 text-emerald-700' },
        ].map(({ label, value, hint, Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-3 text-3xl font-black text-slate-950">{value}</p><p className="mt-2 text-xs font-semibold text-slate-400">{hint}</p></div>
              <span className={`flex h-11 w-11 items-center justify-center rounded-full ${tone}`}><Icon className="h-5 w-5" /></span>
            </div>
          </div>
        ))}
      </section>

      <div>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-xl">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={`Search ${isWorkComparative ? 'SR' : 'PR'} number, department, requester or ${isWorkComparative ? 'service' : 'item'}`} className="h-12 rounded-xl border-slate-200 bg-slate-50 pl-11 font-semibold focus-visible:ring-emerald-100" />
            </div>
            <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            onClick={() => setActiveTab('new')}
            className={`rounded-lg px-4 py-2.5 text-sm font-black transition ${activeTab === 'new' ? 'bg-[#0D3A35] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            All {isWorkComparative ? 'SRs' : 'PRs'} ({newIndents.length})
          </button>
          <button
            onClick={() => setActiveTab('process')}
            className={`rounded-lg px-4 py-2.5 text-sm font-black transition ${activeTab === 'process' ? 'bg-[#0D3A35] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Statements ({processIndents.length})
          </button>
          <button
            onClick={() => setActiveTab('po')}
            className={`rounded-lg px-4 py-2.5 text-sm font-black transition ${activeTab === 'po' ? 'bg-[#0D3A35] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Completed ({poIndents.length})
          </button>
            </div>
          </div>

        <div className="overflow-hidden rounded-b-2xl bg-white">
          <div className="divide-y divide-slate-100">
            {activeTab === 'new' && newGroups.map((g) => (
              <Fragment key={`new-${g.date}`}>
                <div className="border-y border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Entry Date · {formatDisplayDate(g.date)}</div>
                {g.indents.map((it) => {
                  const s = signaturesPresent(it);
                  const pr = str(it.prNo || it.id);
                  const qs = quotationStatusByPr[pr];
                  const qStatus = qs?.status ?? 'unknown';
                  const qLoading = qs?.loading ?? false;
                  const forwarding = Boolean(forwardingByPr[pr]);
                  const forwarded = isForwarded(pr);
                  const forwardEnabled = !qLoading && qStatus === 'saved' && !forwarding && !forwarded;
                  return (
                    <div key={it.id}>
                      <div className={`relative flex flex-col gap-4 px-5 py-5 transition hover:bg-slate-50/70 xl:flex-row xl:items-center xl:justify-between ${forwarded ? 'bg-emerald-50/70' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-black text-[#0D3A35]">{it.prNo}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">{it.indentType || 'PR'}</span></div>
                          <div className="mt-2 truncate text-base font-black text-slate-900">{it.project}</div>
                          <div className="mt-2 text-xs font-semibold text-slate-500">{it.items.length} item{it.items.length === 1 ? '' : 's'} · Indented by {it.indentedBy} · Forwarded by {it.forwardedBy}</div>
                          <div className="mt-1 text-xs font-semibold text-slate-500">
                            Comparative Statement:{' '}
                            {qLoading ? (
                              <span className="font-semibold text-gray-500">Checking…</span>
                            ) : (
                              <span className={`font-semibold ${classForQuotationStatus(qStatus)}`}>{labelForQuotationStatus(qStatus)}</span>
                            )}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {[
                              ['Indented', s.indented],
                              ['Forwarded', s.forwarded],
                              ['Director', s.director],
                            ].map(([label, complete]) => (
                              <span key={String(label)} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${complete ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                <CheckCircle className="h-3 w-3" /> {label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="relative z-[1] flex flex-wrap items-center gap-2 xl:ml-4 xl:justify-end">
                          <Button variant="outline" onClick={() => setPreviewIndent(it)} className="h-10 gap-2 rounded-xl border-slate-200 font-bold text-[#0D3A35]">
                            <FilePlus className="w-4 h-4" /> Preview
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setPrintComparativeIndent(it)}
                            className="h-10 gap-2 rounded-xl border-slate-200 font-bold text-[#0D3A35]"
                            disabled={qLoading || qStatus === 'unknown' || qStatus === 'no_comparative_statement'}
                            title="Print comparative statement"
                          >
                            <Printer className="h-4 w-4" /> Print
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => openRevisionPage(it)}
                            className="h-10 gap-2 rounded-xl border-[#0D3A35]/25 font-bold text-[#0D3A35] hover:bg-[#edf5f2]"
                            disabled={qLoading || !['saved', 'forwarded', 'draft'].includes(qStatus)}
                            title="Create a new revision of the comparative statement"
                          >
                            <RotateCcw className="h-4 w-4" /> Revise
                          </Button>
                          <Button
                            variant="outline"
                            className="h-10 gap-2 rounded-xl border-slate-200 font-bold"
                            disabled={!forwardEnabled}
                            title={
                              forwarded
                                ? 'Already forwarded'
                                : qLoading
                                  ? 'Checking quotation status'
                                  : qStatus === 'saved'
                                    ? 'Forward comparative statement'
                                    : 'Forward is enabled after final save'
                            }
                            onClick={() => void forwardNow(pr)}
                          >
                            <Send className="h-4 w-4" />
                            {forwarding ? 'Forwarding…' : forwarded ? 'Forwarded' : 'Forward'}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => openQuotationPage(it)}
                            className="h-10 gap-2 rounded-xl bg-[#0D3A35] font-bold text-white hover:bg-[#092b27] disabled:bg-slate-100 disabled:text-slate-400"
                            disabled={forwarded}
                            title={forwarded ? 'Cannot add quotation after forwarding' : 'Add / edit comparative statement'}
                          >
                            <PlusCircle className="w-4 h-4" /> {qStatus === 'no_comparative_statement' || qStatus === 'unknown' ? 'Create Statement' : 'Edit Statement'}
                          </Button>
                        </div>
                      </div>

                      {openAddQuote === it.id ? (
                        <div className="px-4 pb-3 bg-gray-50">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                            <div>
                              <label className="text-xs text-gray-600">Vendor</label>
                              <select value={addQuoteForms[it.id]?.vendor || vendors[0]} onChange={(e) => handleVendorChange(it.id, e.target.value)} className="w-full border rounded px-2 py-1">
                                {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Quotation PDF</label>
                              <input type="file" accept="application/pdf" onChange={(e) => handleFileChange(it.id, e.target.files?.[0])} />
                            </div>
                            <div className="flex items-end">
                              <div className="ml-auto">
                                <Button onClick={() => submitAddQuote(it.id)} className="bg-blue-600 text-white mr-2">Save</Button>
                                <Button variant="outline" onClick={() => setOpenAddQuote(null)}>Cancel</Button>
                              </div>
                            </div>
                          </div>

                          <div className="text-sm font-medium mb-1">Quoted prices (per line)</div>
                          <div className="space-y-2">
                            {it.items.map((li) => (
                              <div key={li.id} className="flex items-center gap-2">
                                <div className="min-w-0 text-xs truncate">{li.partName}</div>
                                <div className="w-32">
                                  <input type="number" value={addQuoteForms[it.id]?.prices[li.id] ?? String(li.ratePerItem || 0)} onChange={(e) => handlePriceChange(it.id, li.id, e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </Fragment>
            ))}
            {activeTab === 'new' && newGroups.length === 0 && (
              <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center"><ClipboardList className="h-10 w-10 text-slate-300" /><p className="mt-4 font-black text-slate-700">No {isWorkComparative ? 'service' : 'purchase'} requisitions found</p><p className="mt-1 text-sm font-semibold text-slate-400">Raised and approved {isWorkComparative ? 'service' : 'purchase'} requisitions will appear here for comparative statement preparation.</p></div>
            )}

            {activeTab === 'process' && processGroups.map((g) => (
              <Fragment key={`process-${g.date}`}>
                <div className="border-y border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Entry Date · {formatDisplayDate(g.date)}</div>
                {g.indents.map((it) => {
                  const pr = str(it.prNo || it.id);
                  const qs = quotationStatusByPr[pr];
                  const qStatus = qs?.status ?? 'unknown';
                  const qLoading = qs?.loading ?? false;
                  const forwarding = Boolean(forwardingByPr[pr]);
                  const forwarded = isForwarded(pr);
                  const forwardEnabled = !qLoading && qStatus === 'saved' && !forwarding && !forwarded;
                  return (
                    <div key={it.id}>
                      <div className={`relative flex flex-col gap-4 px-5 py-5 transition hover:bg-slate-50/70 xl:flex-row xl:items-center xl:justify-between ${forwarded ? 'bg-emerald-50/70' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-black text-[#0D3A35]">{it.prNo}</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase text-amber-700">In Process</span></div>
                          <div className="mt-2 truncate text-base font-black text-slate-900">{it.project}</div>
                          <div className="mt-2 text-xs font-semibold text-slate-500">{it.items.length} item{it.items.length === 1 ? '' : 's'} · {it.items.reduce((c, li) => c + ((li.quotes?.length) || 0), 0)} quotation entries</div>
                          <div className="mt-1 text-xs font-semibold text-slate-500">
                            Comparative Statement:{' '}
                            {qLoading ? (
                              <span className="font-semibold text-gray-500">Checking…</span>
                            ) : (
                              <span className={`font-semibold ${classForQuotationStatus(qStatus)}`}>{labelForQuotationStatus(qStatus)}</span>
                            )}
                          </div>
                        </div>
                        <div className="relative z-[1] flex flex-wrap items-center gap-2 xl:ml-4 xl:justify-end">
                          <Button variant="outline" onClick={() => setPreviewIndent(it)} className="h-10 gap-2 rounded-xl border-slate-200 font-bold text-[#0D3A35]">
                            <FilePlus className="w-4 h-4" /> Preview
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setPrintComparativeIndent(it)}
                            className="h-10 gap-2 rounded-xl border-slate-200 font-bold text-[#0D3A35]"
                            disabled={qLoading || qStatus === 'unknown' || qStatus === 'no_comparative_statement'}
                            title="Print comparative statement"
                          >
                            <Printer className="h-4 w-4" /> Print
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => openRevisionPage(it)}
                            className="h-10 gap-2 rounded-xl border-[#0D3A35]/25 font-bold text-[#0D3A35] hover:bg-[#edf5f2]"
                            disabled={qLoading || !['saved', 'forwarded', 'draft'].includes(qStatus)}
                            title="Create a new revision of the comparative statement"
                          >
                            <RotateCcw className="h-4 w-4" /> Revise
                          </Button>
                          <Button
                            variant="outline"
                            className="h-10 gap-2 rounded-xl border-slate-200 font-bold"
                            disabled={!forwardEnabled}
                            title={
                              forwarded
                                ? 'Already forwarded'
                                : qLoading
                                  ? 'Checking quotation status'
                                  : qStatus === 'saved'
                                    ? 'Forward comparative statement'
                                    : 'Forward is enabled after final save'
                            }
                            onClick={() => void forwardNow(pr)}
                          >
                            <Send className="h-4 w-4" />
                            {forwarding ? 'Forwarding…' : forwarded ? 'Forwarded' : 'Forward'}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => openQuotationPage(it)}
                            className="h-10 gap-2 rounded-xl bg-[#0D3A35] font-bold text-white hover:bg-[#092b27] disabled:bg-slate-100 disabled:text-slate-400"
                            disabled={forwarded}
                            title={forwarded ? 'Cannot add quotation after forwarding' : 'Add / edit comparative statement'}
                          >
                            <PlusCircle className="w-4 h-4" /> Edit Statement
                          </Button>
                          <Button
                            onClick={() => createPO(it.id)}
                            className={`h-10 gap-2 rounded-xl font-black ${it.items.some(li => !(li.quotes && li.quotes.length > 0)) ? 'bg-slate-100 text-slate-400' : 'bg-[#0D3A35] text-white hover:bg-[#092b27]'}`}
                            disabled={it.items.some(li => !(li.quotes && li.quotes.length > 0))}
                          >
                            <Plus className="w-4 h-4" /> Create {isWorkComparative ? 'WO' : 'PO'}
                          </Button>
                        </div>
                      </div>

                      {openAddQuote === it.id ? (
                        <div className="px-4 pb-3 bg-gray-50">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                            <div>
                              <label className="text-xs text-gray-600">Vendor</label>
                              <select value={addQuoteForms[it.id]?.vendor || vendors[0]} onChange={(e) => handleVendorChange(it.id, e.target.value)} className="w-full border rounded px-2 py-1">
                                {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Quotation PDF</label>
                              <input type="file" accept="application/pdf" onChange={(e) => handleFileChange(it.id, e.target.files?.[0])} />
                            </div>
                            <div className="flex items-end">
                              <div className="ml-auto">
                                <Button onClick={() => submitAddQuote(it.id)} className="bg-blue-600 text-white mr-2">Save</Button>
                                <Button variant="outline" onClick={() => setOpenAddQuote(null)}>Cancel</Button>
                              </div>
                            </div>
                          </div>

                          <div className="text-sm font-medium mb-1">Quoted prices (per line)</div>
                          <div className="space-y-2">
                            {it.items.map((li) => (
                              <div key={li.id} className="flex items-center gap-2">
                                <div className="min-w-0 text-xs truncate">{li.partName}</div>
                                <div className="w-32">
                                  <input type="number" value={addQuoteForms[it.id]?.prices[li.id] ?? String(li.ratePerItem || 0)} onChange={(e) => handlePriceChange(it.id, li.id, e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </Fragment>
            ))}
            {activeTab === 'process' && processGroups.length === 0 && (
              <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center"><Clock3 className="h-10 w-10 text-slate-300" /><p className="mt-4 font-black text-slate-700">No requisitions in process</p><p className="mt-1 text-sm font-semibold text-slate-400">Requisitions with quotation activity will appear here.</p></div>
            )}

            {activeTab === 'po' && poGroups.map((g) => (
              <Fragment key={`po-${g.date}`}>
                <div className="border-y border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-slate-500">{isWorkComparative ? 'WO' : 'PO'} Date · {formatDisplayDate(g.date)}</div>
                {g.indents.map((it) => {
                  const pr = str(it.prNo || it.id);
                  const qs = quotationStatusByPr[pr];
                  const qStatus = qs?.status ?? 'unknown';
                  const qLoading = qs?.loading ?? false;
                  const forwarding = Boolean(forwardingByPr[pr]);
                  const forwarded = isForwarded(pr);
                  const forwardEnabled = !qLoading && qStatus === 'saved' && !forwarding && !forwarded;
                  return (
                    <div key={it.id} className={`relative flex flex-col gap-4 px-5 py-5 transition hover:bg-slate-50/70 xl:flex-row xl:items-center xl:justify-between ${forwarded ? 'bg-emerald-50/70' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-black text-[#0D3A35]">{it.prNo}</span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">{isWorkComparative ? 'WO' : 'PO'} Created</span></div>
                        <div className="mt-2 truncate text-base font-black text-slate-900">{it.project}</div>
                        <div className="mt-2 text-xs font-semibold text-slate-500">{isWorkComparative ? 'WO' : 'PO'} Date: {formatDisplayDate(it.purchaseOrder?.date)} · Total: <span className="font-black text-slate-700">{it.purchaseOrder ? formatInr(it.purchaseOrder.totalValue) : '—'}</span></div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          Comparative Statement:{' '}
                          {qLoading ? (
                            <span className="font-semibold text-gray-500">Checking…</span>
                          ) : (
                            <span className={`font-semibold ${classForQuotationStatus(qStatus)}`}>{labelForQuotationStatus(qStatus)}</span>
                          )}
                        </div>
                      </div>
                      <div className="relative z-[1] flex flex-wrap items-center gap-2 xl:ml-4 xl:justify-end">
                        <Button
                          variant="outline"
                          onClick={() => openRevisionPage(it)}
                          className="h-10 gap-2 rounded-xl border-[#0D3A35]/25 font-bold text-[#0D3A35] hover:bg-[#edf5f2]"
                          disabled={qLoading || !['saved', 'forwarded', 'draft'].includes(qStatus)}
                          title="Create a new revision of the comparative statement"
                        >
                          <RotateCcw className="h-4 w-4" /> Revise
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 gap-2 rounded-xl border-slate-200 font-bold"
                          disabled={!forwardEnabled}
                          title={
                            forwarded
                              ? 'Already forwarded'
                              : qLoading
                                ? 'Checking quotation status'
                                : qStatus === 'saved'
                                  ? 'Forward comparative statement'
                                  : 'Forward is enabled after final save'
                          }
                          onClick={() => void forwardNow(pr)}
                        >
                          <Send className="h-4 w-4" />
                          {forwarding ? 'Forwarding…' : forwarded ? 'Forwarded' : 'Forward'}
                        </Button>
                        <Button variant="outline" onClick={() => setPreviewIndent(it)} className="h-10 gap-2 rounded-xl border-slate-200 font-bold text-[#0D3A35]">
                          <FilePlus className="w-4 h-4" /> View {isWorkComparative ? 'WO' : 'PO'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setPrintComparativeIndent(it)}
                          className="h-10 gap-2 rounded-xl border-slate-200 font-bold text-[#0D3A35]"
                          disabled={qLoading || qStatus === 'unknown' || qStatus === 'no_comparative_statement'}
                          title="Print comparative statement"
                        >
                          <Printer className="h-4 w-4" /> Print
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))}
            {activeTab === 'po' && poGroups.length === 0 && (
              <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center"><PackageCheck className="h-10 w-10 text-slate-300" /><p className="mt-4 font-black text-slate-700">No {isWorkComparative ? 'work' : 'purchase'} orders created</p><p className="mt-1 text-sm font-semibold text-slate-400">Converted requisitions will be listed in this tab.</p></div>
            )}
          </div>
        </div>
      </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden rounded-2xl border-0 bg-[#f6f8fa] p-0 shadow-2xl">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-left">
            <DialogTitle className="flex items-center gap-3 text-xl font-black text-white"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><FilePlus className="h-5 w-5" /></span>Create Purchase Requisition</DialogTitle>
            <p className="pl-[52px] text-sm font-semibold text-white/65">Record requisition identity, approval routing and the initial item.</p>
          </DialogHeader>

          <div className="max-h-[calc(92vh-165px)] space-y-5 overflow-y-auto p-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-black uppercase tracking-wider text-[#0D3A35]">Requisition Details</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-slate-500">Project *</label>
                  <Input value={newProject} onChange={(e) => setNewProject(e.target.value)} className="mt-1.5 h-11 rounded-xl border-slate-200" placeholder="Select or enter project" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500">PR Number *</label>
                  <Input value={newPrNo} onChange={(e) => setNewPrNo(e.target.value)} className="mt-1.5 h-11 rounded-xl border-slate-200" placeholder="Purchase requisition number" />
                </div>
              <div>
                  <label className="text-xs font-bold text-slate-500">Requisition Date *</label>
                  <Input value={newDate} onChange={(e) => setNewDate(e.target.value)} type="date" className="mt-1.5 h-11 rounded-xl border-slate-200" />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-black uppercase tracking-wider text-[#0D3A35]">Approval Routing</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div><label className="text-xs font-bold text-slate-500">Indented By *</label><Input value={newIndentedBy} onChange={(e) => setNewIndentedBy(e.target.value)} className="mt-1.5 h-11 rounded-xl border-slate-200" /></div>
                <div><label className="text-xs font-bold text-slate-500">Forwarded By *</label><Input value={newForwardedBy} onChange={(e) => setNewForwardedBy(e.target.value)} className="mt-1.5 h-11 rounded-xl border-slate-200" /></div>
                <div><label className="text-xs font-bold text-slate-500">Director's Approval *</label><Input value={newDirectorsApproval} onChange={(e) => setNewDirectorsApproval(e.target.value)} className="mt-1.5 h-11 rounded-xl border-slate-200" /></div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-black uppercase tracking-wider text-[#0D3A35]">Initial Item</h3>
              <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_1fr_1fr]">
                <div><label className="text-xs font-bold text-slate-500">Item Name *</label><Input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="mt-1.5 h-11 rounded-xl border-slate-200" placeholder="Item description" /></div>
                <div><label className="text-xs font-bold text-slate-500">Quantity *</label><Input type="number" min="0" value={String(newItemQty)} onChange={(e) => setNewItemQty(Number(e.target.value))} className="mt-1.5 h-11 rounded-xl border-slate-200" /></div>
                <div><label className="text-xs font-bold text-slate-500">UoM</label><Input value="Nos" readOnly className="mt-1.5 h-11 rounded-xl border-slate-200 bg-slate-50 font-bold text-slate-500" /></div>
              </div>
            </section>
          </div>

          <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
            <Button variant="outline" onClick={() => setOpen(false)} className="h-10 rounded-xl border-slate-200 px-5 font-bold">Cancel</Button>
            <Button className="h-10 rounded-xl bg-[#0D3A35] px-6 font-black text-white hover:bg-[#092b27]" onClick={saveNew}><Plus className="mr-2 h-4 w-4" />Create Requisition</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(printComparativeIndent)} onOpenChange={(open) => { if (!open) setPrintComparativeIndent(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose Print Orientation</DialogTitle>
            <DialogDescription>Select the A4 page orientation for the Commercial Comparative Statement.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              type="button"
              onClick={() => {
                if (!printComparativeIndent) return;
                const indent = printComparativeIndent;
                setPrintComparativeIndent(null);
                printComparativeStatement(indent, 'portrait');
              }}
              className="rounded-xl border border-[#d5e1dd] bg-white p-4 text-left transition hover:border-[#0b463f] hover:bg-[#edf5f2]"
            >
              <span className="mx-auto block h-20 w-14 rounded border-2 border-[#0b463f] bg-white" />
              <span className="mt-3 block text-center text-sm font-semibold text-[#0b463f]">A4 Portrait</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!printComparativeIndent) return;
                const indent = printComparativeIndent;
                setPrintComparativeIndent(null);
                printComparativeStatement(indent, 'landscape');
              }}
              className="rounded-xl border-2 border-[#0b463f] bg-[#edf5f2] p-4 text-left transition hover:bg-[#e3efeb]"
            >
              <span className="mx-auto mt-3 block h-14 w-20 rounded border-2 border-[#0b463f] bg-white" />
              <span className="mt-3 block text-center text-sm font-semibold text-[#0b463f]">A4 Landscape</span>
              <span className="mt-1 block text-center text-[11px] text-[#58716a]">Recommended</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewIndent)} onOpenChange={(v) => { if (!v) setPreviewIndent(null); }}>
        <DialogContent className="flex max-h-[92vh] max-w-[min(96vw,1280px)] flex-col overflow-hidden rounded-2xl border-0 bg-[#f6f8fa] p-0 shadow-2xl">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-left">
            <DialogTitle className="flex items-center gap-3 text-xl font-black text-white"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><FileText className="h-5 w-5" /></span>{previewIndent?.indentType === 'SPR' ? 'Service Requisition Preview' : 'Indent Preview'}</DialogTitle>
            <p className="pl-[52px] text-sm font-medium text-white/70">Review the complete purchase requisition and approval details.</p>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-5">
            {previewIndent ? (
              <div className="space-y-4">
                {previewIndent.indentType === 'SPR' ? (
                  <SprPreview
                    indent={previewIndent}
                    attachments={diary}
                    onAddQuote={(lineItemId, quote) => addQuote(previewIndent.id, lineItemId, quote)}
                    onRemoveQuote={(lineItemId, quoteId) => removeQuote(previewIndent.id, lineItemId, quoteId)}
                    readOnly={isForwarded(str(previewIndent.prNo || previewIndent.id))}
                    approved={signaturesPresent(previewIndent).director}
                  />
                ) : (
                  <ThemedPRPreview
                    indent={{
                      project: previewIndent.project,
                      prNo: previewIndent.prNo,
                      date: previewIndent.date,
                      department: previewIndent.department || 'INVENTORY',
                      indentedBy: previewIndent.indentedBy,
                      indentedBySignature: previewIndent.indentedSignature,
                      forwardedBy: previewIndent.forwardedBy,
                      forwardedBySignature: previewIndent.forwardedSignature,
                      directorsApproval: previewIndent.directorsApproval,
                      directorsApprovalSignature: previewIndent.directorSignature,
                      remarksNotes: previewIndent.remarksNotes || '',
                      budgetHead: previewIndent.budgetHead || '',
                      items: previewIndent.items.map((item) => ({
                        id: item.id,
                        srNo: item.srNo,
                        itemCode: item.itemCode || '',
                        partName: item.partName,
                        specification: item.specification || '',
                        uom: item.uom,
                        totalQtyRequired: numOr0(item.totalQtyRequired),
                        lessQtyAvailableInStock: numOr0(item.lessQtyAvailableInStock),
                        procurementLeadTimeWeeks: numOr0(item.procurementLeadTimeWeeks),
                        materialRequiredByDate: item.materialRequiredByDate || '',
                        indigenousOrImported: item.indigenousOrImported === 'Imported' ? 'Imported' : 'Indigenous',
                        ratePerItem: numOr0(item.ratePerItem),
                        preferredVendorName: item.preferredVendorName || '',
                        validityOfWarrantyAndGuarantee: item.validityOfWarrantyAndGuarantee || '',
                        fullLifeHr: item.fullLifeHr || '',
                        actualLifeHr: item.actualLifeHr || '',
                        reasonForReplacement: item.reasonForReplacement || '',
                        repairingPossibility: item.repairingPossibility === 'Yes' || item.repairingPossibility === 'No' ? item.repairingPossibility : 'NA',
                      })),
                    } satisfies PRPreviewIndent}
                    attachments={diary}
                    showDirectorSignature={signaturesPresent(previewIndent).director}
                  />
                )}

                {previewComparative ? (
                  <ComparativeStatementPreview
                    c={previewComparative}
                    showForwardedStamp={
                      isForwarded(str(previewIndent.prNo || previewIndent.id)) &&
                      ((previewComparative?.quotes?.length || 0) > 0)
                    }
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-6 text-center text-sm font-semibold text-slate-400">No comparative statement has been saved for this requisition.</div>
                )}
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
            {previewIndent && previewIndent.indentType !== 'SPR' ? (
              <Button disabled variant="outline" className="h-10 rounded-xl border-slate-200 px-5 font-bold text-emerald-700 disabled:opacity-60">
                {signaturesPresent(previewIndent).director ? 'Approved' : isForwarded(str(previewIndent.prNo || previewIndent.id)) ? 'Forwarded' : 'Pending'}
              </Button>
            ) : null}
            <Button onClick={() => setPreviewIndent(null)} className="h-10 rounded-xl bg-[#0D3A35] px-6 font-black text-white hover:bg-[#092b27]">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseRequisition;
