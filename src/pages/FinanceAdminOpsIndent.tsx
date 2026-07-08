import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Paperclip, Search, Send, Settings, UserCircle, BookUser, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { getBaseUrl } from '@/lib/config';
import { buildMrfSignatureEntry, getMrfSignatureEntry, readMrfSignatureCache, saveMrfSignatureEntry, extractStatusFromEntry } from '@/lib/mrfSignatureCache';
import {
  readAdminOpsIndentConfig,
  writeAdminOpsIndentConfig,
} from '@/lib/adminOpsIndentConfig';
import {
  readSignatureDiary,
  writeSignatureDiary,
  readUserProfile,
  writeUserProfile,
  readDirectorsAttachedMap,
  writeDirectorsAttachedMap,
  type SignatureDiary,
} from '@/lib/signatureDiary';
import { PRPreview } from '@/components/purchase/PRPreview';

type NfaApiItemRow = {
  item_name?: string;
  UoM?: string;
  gst_percentage?: number;
  quantity?: number;
};

type NfaApiQuoter = {
  vendor_id?: string;
  item_costing?: Record<
    string,
    {
      quanity?: number;
      quantity?: number;
      per_unit_costing?: number;
      final_costing?: number;
    }
  >;
  freight_charges?: number;
  other_charges?: number;
  subtotal?: number;
  total_amount?: number;
  payment_terms?: string | null;
  delivery_time?: string | null;
  warrenty_garantee?: string | null;
};

type NfaApiRow = {
  pr_number?: string;
  comparison_id?: string;
  comparision_id?: string;
  created_at?: string;
  approved_vendor_id?: string;
  approved_vendor?: {
    vendor_id?: string;
  };
  technical_recommendation?: string;
  status?: string;
  TC_status?: string;
  NFA_status?: string;
  nfa_status?: string;
  quoters?: NfaApiQuoter[];
  item_row?: NfaApiItemRow[];
};

type PRLineItem = {
  id: string;
  srNo: number;
  itemCode: string;
  partName: string;
  specification: string;
  uom: string;
  totalQtyRequired: number;
  lessQtyAvailableInStock: number;
  procurementLeadTimeWeeks: number;
  materialRequiredByDate: string;
  indigenousOrImported: 'Indigenous' | 'Imported';
  ratePerItem: number;
  preferredVendorName: string;
  validityOfWarrantyAndGuarantee: string;
  fullLifeHr: string;
  actualLifeHr: string;
  reasonForReplacement: string;
  repairingPossibility: 'Yes' | 'No' | 'NA';
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
  indentType: 'PR' | 'SPR';
  project: string;
  prNo: string;
  date: string;
  department: string;
  indentedBy: string;
  indentedBySignature?: string;
  indentedByTimestamp?: string;
  forwardedBySignature?: string;
  forwardedByTimestamp?: string;
  forwardedBy: string;
  directorsApproval: string;
  directorsApprovalSignature?: string;
  directorsApprovalTimestamp?: string;
  remarksNotes: string;
  budgetHead: string;
  items: PRLineItem[];
  // SPR-specific
  areaOfService?: string;
  func?: string;
  natureOfService?: string;
  sprItems?: SprLineItem[];
  status: 'pending' | 'forwarded';
};

const netPrQty = (it: PRLineItem) =>
  Math.max(0, (it.totalQtyRequired || 0) - (it.lessQtyAvailableInStock || 0));

const approxValue = (it: PRLineItem) => netPrQty(it) * (it.ratePerItem || 0);
const totalValue = (items: PRLineItem[]) =>
  items.reduce((sum, it) => sum + approxValue(it), 0);

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

const formatBudgetHead = (budgetHead: any): string => {
  if (!budgetHead) return '';
  const lineItems = Array.isArray(budgetHead.line_item) ? budgetHead.line_item : [];
  if (lineItems.length === 0) return '';
  return lineItems
    .map((li: any) =>
      `${li.category || ''} | ${li.line_item || ''} | ${li.budget_type || ''} | ${formatInr(Number(li.allocated_amount) || 0)}`
    )
    .join('\n');
};


// ─── NFA Finalized Quotation (Compact) ─────────────────────────────────────

const numOr0 = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

const formatDateYmd = (iso?: string) => {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const parseMrfSignatureStamp = (value?: string) => {
  const raw = String(value ?? '').trim();
  if (!raw) return { signerName: '', signerRole: '', signedAt: '', status: '' };

  const match = raw.match(/^\[(.*?)\|(.*?)\|(.*?)\|(.*?)\|(.*?)\]$/);
  if (!match) {
    const status = raw.toLowerCase() === 'rejected' ? 'reject' : raw.toLowerCase();
    return { signerName: '', signerRole: '', signedAt: '', status };
  }

  const [, signerName, signerRole, timeText, dateText, statusText] = match;
  const status = statusText.trim().toLowerCase() === 'rejected' ? 'reject' : statusText.trim().toLowerCase();
  return {
    signerName: signerName.trim(),
    signerRole: signerRole.trim(),
    signedAt: `${dateText.trim()} ${timeText.trim()}`,
    status,
  };
};

const formatCurrency = (value: unknown) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toLocaleString() : '0';
};

const FinalizedVendorQuotationCompact = ({
  nfa,
  approved,
}: {
  nfa: NfaApiRow;
  approved?: boolean;
}) => {
  const prNo = String(nfa.pr_number ?? '').trim();
  const createdAt = formatDateYmd(nfa.created_at);
  const approvedVendorId = String(
    nfa.approved_vendor_id ??
      (nfa as any)?.approved_vendor?.vendor_id ??
      (nfa as any)?.approved_vendor?.vendorId ??
      '',
  ).trim();

  const quoters = Array.isArray(nfa.quoters) ? nfa.quoters : [];
  const items = Array.isArray(nfa.item_row) ? nfa.item_row : [];

  if (!approvedVendorId) {
    return <div className="text-xs text-gray-500">No approved vendor found for this NFA.</div>;
  }

  const approvedQuote = quoters.find((q) => String(q.vendor_id ?? '').trim() === approvedVendorId);
  if (!approvedQuote) {
    return (
      <div className="text-xs text-gray-500">
        Approved vendor quotation not found in this NFA.
      </div>
    );
  }

  const itemCosting = approvedQuote.item_costing ?? {};
  const base = Object.values(itemCosting).reduce((sum, v) => sum + numOr0(v?.final_costing), 0);
  const freight = numOr0(approvedQuote.freight_charges);
  const other = numOr0(approvedQuote.other_charges);
  const subtotal = numOr0(approvedQuote.subtotal) || base + freight + other;
  const total = numOr0(approvedQuote.total_amount) || subtotal;
  const gst = Math.max(0, total - subtotal);

  return (
    <div className="relative overflow-hidden rounded-md border border-gray-200 bg-gray-50 p-2">
      {approved ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="-rotate-12 rounded-md border-4 border-green-600/40 px-8 py-3 text-3xl font-black tracking-[0.2em] text-green-700/30">
            APPROVED
          </div>
        </div>
      ) : null}

      <div className="mb-2 flex items-center justify-between">
        <div className="inline-flex items-center rounded border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
          HO Approved
        </div>
        <div className="text-[10px] text-gray-500">
          {prNo ? <>PR: <span className="text-gray-700">{prNo}</span></> : null}
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-800 truncate">Approved vendor: {approvedVendorId}</div>
          <div className="text-[10px] text-gray-500">
            {createdAt ? <>Created: <span className="text-gray-700">{createdAt}</span></> : 'Created: —'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-gray-900">{formatInr(total)}</div>
          <div className="text-[10px] text-gray-500">Grand total</div>
        </div>
      </div>

      <div className="mt-2 max-h-28 overflow-auto rounded border border-gray-200 bg-white">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-2 py-1 border-b border-gray-100">Item</th>
              <th className="text-right px-2 py-1 border-b border-gray-100">Qty</th>
              <th className="text-right px-2 py-1 border-b border-gray-100">Unit</th>
              <th className="text-right px-2 py-1 border-b border-gray-100">Amt</th>
            </tr>
          </thead>
          <tbody>
            {(items.length ? items : Object.keys(itemCosting).map((k) => ({ item_name: k } as NfaApiItemRow))).map((it, idx) => {
              const name = String(it.item_name ?? '').trim() || `Item ${idx + 1}`;
              const cost = itemCosting[name];
              const qty = numOr0((it as any)?.quantity ?? cost?.quanity ?? cost?.quantity);
              const uom = String((it as any)?.UoM ?? '').trim();
              const unit = numOr0(cost?.per_unit_costing);
              const amt = numOr0(cost?.final_costing) || (unit ? unit * qty : 0);

              return (
                <tr key={`${name}-${idx}`}>
                  <td className="px-2 py-1 border-b border-gray-50 text-gray-700 truncate max-w-[220px]">{name}</td>
                  <td className="px-2 py-1 border-b border-gray-50 text-right text-gray-700">{qty || 0}{uom ? ` ${uom}` : ''}</td>
                  <td className="px-2 py-1 border-b border-gray-50 text-right text-gray-700">{unit ? formatInr(unit) : '—'}</td>
                  <td className="px-2 py-1 border-b border-gray-50 text-right text-gray-700">{formatInr(amt || 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px] text-gray-600">
        <div>Base: <span className="font-semibold text-gray-800">{formatInr(base)}</span></div>
        <div>GST: <span className="font-semibold text-gray-800">{formatInr(gst)}</span></div>
        <div>Freight: <span className="font-semibold text-gray-800">{formatInr(freight)}</span></div>
        <div>Other: <span className="font-semibold text-gray-800">{formatInr(other)}</span></div>
      </div>
    </div>
  );
};

const initialIndents: Indent[] = [
    {
      id: 'aoi-1',
      project: 'Chhattisgarh 2250 Acres',
      prNo: 'SBR/NF/25-26/03',
      date: '2026-02-09',
      department: 'Cultivation',
      indentedBy: 'SUKHDEEP SINGH',
      forwardedBy: 'RAJINDER SINGH PADDA',
      directorsApproval: 'RAJENDRA SHRINGARPUTALE',
      remarksNotes: '',
      budgetHead: 'Machinery - Cultivation',
      status: 'pending',
      items: [
        {
          id: 'aoi-li-1',
          srNo: 1,
          itemCode: '',
          partName: 'Chisel Plough',
          specification: '5 - Tynes/W - 4 ft',
          uom: 'No',
          totalQtyRequired: 4,
          lessQtyAvailableInStock: 0,
          procurementLeadTimeWeeks: 2,
          materialRequiredByDate: '2026-02-09',
          indigenousOrImported: 'Indigenous',
          ratePerItem: 45000,
          preferredVendorName: 'Vishwakarma',
          validityOfWarrantyAndGuarantee: 'NA',
          fullLifeHr: 'NA',
          actualLifeHr: 'NA',
          reasonForReplacement: 'Project Item',
          repairingPossibility: 'NA',
        },
      ],
    },
];

const SprPreview = ({
  indent,
  attachments,
  showDirectorSignature,
}: {
  indent: Omit<Indent, 'id' | 'status'>;
  attachments?: SignatureDiary;
  showDirectorSignature?: boolean;
}) => {
  const sigFor = (name: string) => attachments?.[name] ?? null;
  const rows = indent.sprItems ?? [];
  const subtotal = rows.reduce((s, r) => s + r.approxValue, 0);
  const gstTotal = rows.reduce((s, r) => s + r.gstAmount, 0);
  const total = subtotal + gstTotal;

  return (
    <div className="min-w-[980px]">
      <div className="border border-gray-300 bg-white">
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
              <th className="border border-gray-300 px-1 py-1 w-[75px]">Completion Date</th>
              <th className="border border-gray-300 px-1 py-1 w-[75px]">Validity</th>
              <th className="border border-gray-300 px-1 py-1 w-[55px]">OEM / Prop</th>
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
                  ) : indent.indentedBySignature ? (
                    <div className="text-[11px] text-gray-700 text-center">{indent.indentedBySignature}</div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
                {sigFor(indent.indentedBy)?.stamp ? (
                  <img src={sigFor(indent.indentedBy)!.stamp} alt="Stamp" className="h-8 object-contain" />
                ) : null}
              </div>
              <div className="p-2 text-center">{indent.indentedByTimestamp || indent.date || '—'}</div>
            </div>

            <div className="grid grid-cols-4 border-b border-gray-300">
              <div className="p-2 font-semibold">Forwarded By</div>
              <div className="p-2 text-center">{indent.forwardedBy || '—'}</div>
              <div className="p-2 flex flex-col items-center justify-center gap-0.5">
                <div className="w-full h-10 border border-gray-200 rounded bg-white flex items-center justify-center px-1">
                  {sigFor(indent.forwardedBy)?.signature ? (
                    <img src={sigFor(indent.forwardedBy)!.signature} alt="Signature" className="h-8 object-contain" />
                  ) : indent.forwardedBySignature ? (
                    <div className="text-[11px] text-gray-700 text-center">{indent.forwardedBySignature}</div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
                {sigFor(indent.forwardedBy)?.stamp ? (
                  <img src={sigFor(indent.forwardedBy)!.stamp} alt="Stamp" className="h-8 object-contain" />
                ) : null}
              </div>
              <div className="p-2 text-center">{indent.forwardedByTimestamp || indent.date || '—'}</div>
            </div>

            <div className="grid grid-cols-4">
              <div className="p-2 font-semibold">Director's Approval</div>
              <div className="p-2 text-center">{indent.directorsApproval || '—'}</div>
              <div className="p-2 flex flex-col items-center justify-center gap-0.5">
                <div className="w-full h-10 border border-gray-200 rounded bg-white flex items-center justify-center px-1">
                  {showDirectorSignature && sigFor(indent.directorsApproval)?.signature ? (
                    <img src={sigFor(indent.directorsApproval)!.signature} alt="Signature" className="h-8 object-contain" />
                  ) : indent.directorsApprovalSignature ? (
                    <div className="text-[11px] text-gray-700 text-center">{indent.directorsApprovalSignature}</div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
                {showDirectorSignature && sigFor(indent.directorsApproval)?.stamp ? (
                  <img src={sigFor(indent.directorsApproval)!.stamp} alt="Stamp" className="h-8 object-contain" />
                ) : null}
              </div>
              <div className="p-2 text-center">{indent.directorsApprovalTimestamp || indent.date || '—'}</div>
            </div>
          </div>

          <div className="col-span-4">
            <div className="grid grid-cols-1 border-b border-gray-300">
              <div className="p-2 font-semibold">Remarks / Notes</div>
              <div className="p-2 min-h-[56px] text-gray-700">{indent.remarksNotes || ''}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminOpsIndent = () => {
  const [indents, setIndents] = useState<Indent[]>(initialIndents);
  const [search, setSearch] = useState('');
  const [openRowId, setOpenRowId] = useState<string>('');
  const [configOpen, setConfigOpen] = useState(false);
  const [attachments, setAttachments] = useState<SignatureDiary>({});
  // per-indent flag to show director signature when explicitly attached
  const [directorsAttachedMap, setDirectorsAttachedMap] = useState<Record<string, boolean>>({});

  const [nfas, setNfas] = useState<NfaApiRow[]>([]);
  const [nfaApprovalsMap, setNfaApprovalsMap] = useState<Record<string, boolean>>({});

  const [activeSection, setActiveSection] = useState<'indents' | 'nfa' | 'mrf'>('nfa');

  // MRF state
  const [mrfRecords, setMrfRecords] = useState<any[]>([]);
  const [isLoadingMrfs, setIsLoadingMrfs] = useState(false);
  const [savingMrfFor, setSavingMrfFor] = useState<string | null>(null);

  // Load attachments config on mount
  useEffect(() => {
    setAttachments(readSignatureDiary());
    setDirectorsAttachedMap(readDirectorsAttachedMap());
  }, []);

  // Load NFA list from backend
  useEffect(() => {
    const loadNfas = async () => {
      try {
        const BASE_URL = getBaseUrl().replace(/\/$/, '');
        if (!BASE_URL) throw new Error('Missing API base URL');
        const res = await fetch(`${BASE_URL}/purchase_flow/get_NFA`);
        const text = await res.text().catch(() => '');
        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : [];
        } catch {
          throw new Error('Invalid JSON received from get_NFA');
        }
        const list = Array.isArray(json) ? json : (Array.isArray(json?.nfa) ? json.nfa : []);
        setNfas(list as NfaApiRow[]);
      } catch (err: any) {
        console.error('Load NFA error:', err);
        toast.error(`Failed to load NFA: ${String(err?.message ?? err ?? '').trim() || 'unknown error'}`);
      }
    };
    loadNfas();
  }, []);

  // Load MRFs from HRMS
  useEffect(() => {
    const loadMrfs = async () => {
      try {
        const BASE_URL = getBaseUrl().replace(/\/$/, '');
        setIsLoadingMrfs(true);
        const res = await fetch(`${BASE_URL}/HRMS/get_MRF_for_director`);
        const text = await res.text().catch(() => '');
        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
        const json = text ? JSON.parse(text) : {};
        const list = Array.isArray(json?.MRFs_for_director) ? json.MRFs_for_director : [];
        setMrfRecords(list.map((r: any, idx: number) => ({ ...r, _idx: idx })));
      } catch (err: any) {
        console.warn('Failed to load MRFs', err);
      } finally {
        setIsLoadingMrfs(false);
      }
    };
    void loadMrfs();
  }, []);

  const updateMrfApproval = async (mrfNo: string, action: 'approved' | 'rejected') => {
    try {
      const BASE_URL = getBaseUrl().replace(/\/$/, '');
      // determine approver name from local profile
      const p = readUserProfile();
      const approverName = (p.name || '').trim();
      if (!approverName) { toast.error('Approver name missing in profile'); return; }
      setSavingMrfFor(mrfNo);
      const res = await fetch(`${BASE_URL}/HRMS/admin_ops_approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ MRF_no: mrfNo, approver_role: 'Admin Ops', approver_name: approverName, approval_status: action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || 'Approval failed');

      const signedAt = new Date().toISOString();
      const entry = buildMrfSignatureEntry({ signerName: approverName, signerRole: 'Admin Ops', approvalStatus: action, signedAt });
      saveMrfSignatureEntry(readMrfSignatureCache(), mrfNo, 'admin_ops', entry);

      setMrfRecords((prev) => prev.map((r) => (String(r.MRF_no || '') === String(mrfNo) ? ({
        ...r,
        admin_ops_approval_status: entry.stamp,
        admin_ops_approver_name: approverName,
        admin_ops_approval_time: signedAt,
      }) : r)));
      toast.success(`MRF ${action}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update MRF approval');
    } finally {
      setSavingMrfFor(null);
    }
  };

  const handleConfigClose = () => {
    setConfigOpen(false);
    setAttachments(readSignatureDiary());
    setDirectorsAttachedMap(readDirectorsAttachedMap());
  };

  const attachDirectorSignature = (id: string, indent: Indent) => {
    const diary = readSignatureDiary();
    const person = indent.directorsApproval?.trim();
    if (!person) { toast.error('No director name set for this indent'); return; }
    const entry = diary[person];
    if (!entry || !entry.signature) { toast.error(`No signature found for ${person} in diary`); return; }
    setDirectorsAttachedMap((p) => {
      const next = { ...p, [id]: true };
      writeDirectorsAttachedMap(next);
      return next;
    });
    toast.success(`Signature attached for ${person}`);
  };

  useEffect(() => writeDirectorsAttachedMap(directorsAttachedMap), [directorsAttachedMap]);

  // Load indents from admin ops API
  useEffect(() => {
    const load = async () => {
      try {
        const BASE_URL = getBaseUrl().replace(/\/$/, '');
        const financeUrl = `${BASE_URL}/purchase_flow/get_finance_ops_indents`;
        const adminUrl = `${BASE_URL}/purchase_flow/get_admin_ops_indents`;

        const tryFetch = async (url: string) => {
          const r = await fetch(url);
          const body = await r.text().catch(() => '');
          return { ok: r.ok, status: r.status, statusText: r.statusText, body };
        };

        const first = await tryFetch(financeUrl);
        let text = first.body;
        let json: any = {};

        if (!first.ok) {
          // if finance endpoint missing (404), try admin endpoint as fallback
          if (first.status === 404) {
            console.warn(`Finance endpoint 404, retrying admin endpoint: ${adminUrl}`);
            const alt = await tryFetch(adminUrl);
            if (!alt.ok) {
              throw new Error(`Fetch failed ${first.status} ${first.statusText}: ${first.body}`);
            }
            text = alt.body;
          } else {
            throw new Error(`Fetch failed ${first.status} ${first.statusText}: ${first.body}`);
          }
        }

        try {
          json = text ? JSON.parse(text) : {};
        } catch (parseErr) {
          console.error('Failed to parse indents JSON', parseErr, text);
          throw new Error('Invalid JSON received from indents API');
        }

        const arr = json.finance_ops_indents ?? json.admin_ops_indents ?? json.finance_admin_ops_indents ?? [];
        const list: Indent[] = (arr || []).map((r: any, idx: number) => {
          const isSpr = Boolean(r.indent_data?.area_of_service || r.indent_data?.name_of_service);

          const items: PRLineItem[] = isSpr ? [] : (r.indent_data?.item_row || []).map((it: any, i: number) => ({
            id: `${r.pr_number ?? 'api'}-li-${i}`,
            srNo: it.sr_no ?? i + 1,
            itemCode: it.item_code ?? '',
            partName: it.part_name ?? '',
            specification: it.specification ?? '',
            uom: it.uom ?? '',
            totalQtyRequired: it.total_qty_required ?? 0,
            lessQtyAvailableInStock: it.less_qty_available_in_stock ?? 0,
            procurementLeadTimeWeeks: it.procurement_lead_time_weeks ?? 0,
            materialRequiredByDate: it.material_required_by_date ?? '',
            indigenousOrImported: it.indigenous_or_imported ?? 'Indigenous',
            ratePerItem: it.rate_per_item ?? 0,
            preferredVendorName: it.preferred_vendor_name ?? '',
            validityOfWarrantyAndGuarantee: it.validity_of_warranty_and_guarantee ?? '',
            fullLifeHr: it.full_life_hr ?? '',
            actualLifeHr: it.actual_life_hr ?? '',
            reasonForReplacement: it.reason_for_replacement ?? '',
            repairingPossibility: it.repairing_possibility ?? 'NA',
          }));

          const sprItems: SprLineItem[] = isSpr ? (r.indent_data?.item_row || []).map((it: any, i: number) => ({
            id: `${r.pr_number ?? 'api'}-spr-${i}`,
            srNo: it.sr_no ?? i + 1,
            serviceDescription: it.service_description ?? '',
            uom: it.uom ?? '',
            quantity: it.quantity ?? 0,
            startDate: it.start_date_of_contract ?? '',
            duration: it.duration_of_contract ?? '',
            completionDate: it.completion_date_of_contract ?? '',
            validity: it.validity_of_contract ?? '',
            servicesFrom: it.services_required_from ?? '',
            scopeAttached: it.detailed_scope_attached ?? '',
            boqAttached: it.detailed_boq_attached ?? '',
            approxValue: it.approx_value_of_services ?? 0,
            gstPercent: it.gst_percentage ?? 0,
            gstAmount: it.gst_amount ?? 0,
            proposedVendors: it.proposed_vendors ?? '',
            previousWO: it.previous_wo_details ?? '',
            remarks: it.remarks ?? '',
          })) : [];

          const indentedByName = r.indented_by?.name_id ?? '';
          const signatureText = r.indented_by?.signature ?? '';
          const timestamp = r.indented_by?.timestamp ?? r.created_at ?? '';
          const forwardedByName = r.forwarded_by?.name_id ?? '';
          const forwardedSignatureText = r.forwarded_by?.signature ?? '';
          const forwardedTimestamp = r.forwarded_by?.timestamp ?? '';
          const approvedByName = r.approved_by?.name_id ?? '';
          const approvedBySignature = r.approved_by?.signature ?? '';
          const approvedByTimestamp = r.approved_by?.timestamp ?? '';

          return {
            id: r.pr_number ?? `api-${idx}`,
            indentType: isSpr ? 'SPR' : 'PR',
            project: r.indent_data?.project ?? '',
            prNo: r.pr_number ?? '',
            date: timestamp ? new Date(timestamp).toISOString().slice(0, 10) : (r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : ''),
            department: r.department ?? '',
            indentedBy: indentedByName,
            indentedBySignature: signatureText,
            indentedByTimestamp: timestamp ? new Date(timestamp).toISOString().slice(0, 10) : '',
            forwardedBy: forwardedByName,
            forwardedBySignature: forwardedSignatureText,
            forwardedByTimestamp: forwardedTimestamp ? new Date(forwardedTimestamp).toISOString().slice(0,10) : '',
            directorsApproval: approvedByName,
            directorsApprovalSignature: approvedBySignature,
            directorsApprovalTimestamp: approvedByTimestamp ? new Date(approvedByTimestamp).toISOString().slice(0,10) : '',
            remarksNotes: r.notes ?? '',
            budgetHead: formatBudgetHead(r.budget_head),
            items,
            areaOfService: r.indent_data?.area_of_service ?? '',
            func: r.indent_data?.function ?? '',
            natureOfService: r.indent_data?.name_of_service ?? '',
            sprItems,
            // Consider indent 'pending' when director's approval signature is missing
            status: approvedBySignature ? 'forwarded' : 'pending',
          } as Indent;
        });
        setIndents(list);
      } catch (err: any) {
        console.error('Load indents error:', err);
        const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
        toast.error(`Failed to load indents: ${msg}`);
      }
    };
    load();
  }, []);

  // per-indent state: whether attachment is done (enables Forward)
  const [attachedMap, setAttachedMap] = useState<Record<string, boolean>>({});
  // per-indent approval state coming from attach-sign API
  const [indentApprovalsMap, setIndentApprovalsMap] = useState<Record<string, boolean>>({});
  const [attachingApprovalMap, setAttachingApprovalMap] = useState<Record<string, boolean>>({});
  const [previewIndent, setPreviewIndent] = useState<Indent | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return indents.filter((it) =>
      (it.project ?? '').toLowerCase().includes(q) ||
      (it.prNo ?? '').toLowerCase().includes(q) ||
      (it.indentedBy ?? '').toLowerCase().includes(q) ||
      (it.items ?? []).some(
        (li) =>
          (li.partName ?? '').toLowerCase().includes(q) ||
          (li.itemCode ?? '').toLowerCase().includes(q),
      ),
    );
  }, [indents, search]);

  const filteredNfas = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return nfas;
    return nfas.filter((nfa) => {
      const pr = String(nfa.pr_number ?? '').toLowerCase();
      const approved = String(
        nfa.approved_vendor_id ?? (nfa as any)?.approved_vendor?.vendor_id ?? '',
      ).toLowerCase();
      const vendors = (Array.isArray(nfa.quoters) ? nfa.quoters : []).map((x) => String(x.vendor_id ?? '').toLowerCase()).join(' ');
      const items = (Array.isArray(nfa.item_row) ? nfa.item_row : []).map((x) => String(x.item_name ?? '').toLowerCase()).join(' ');
      return pr.includes(q) || approved.includes(q) || vendors.includes(q) || items.includes(q);
    });
  }, [nfas, search]);

  const markAttached = (id: string) => {
    setAttachedMap((prev) => ({ ...prev, [id]: true }));
    toast.success('Attachment added');
  };

  const forward = (id: string) => {
    if (!attachedMap[id]) return;
    setIndents((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'forwarded' } : x)));
    toast.success('Indent forwarded');
  };

  // API helper: POST to attach sign endpoint
  const indentByAttachSignApi = async (payload: { pr_number: string; name_id: string; signature: string }) => {
    const BASE_URL = getBaseUrl().replace(/\/$/, '');
    const res = await fetch(`${BASE_URL}/purchase_flow/forward_indent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('attach-sign failed');
    // Some backends may return empty body; parse safely and return null if empty or unparsable
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  // API helper: POST to director approval endpoint
  const directorApprovalApi = async (payload: { pr_number: string; name_id: string; signature: string }) => {
    const BASE_URL = getBaseUrl().replace(/\/$/, '');
    const res = await fetch(`${BASE_URL}/purchase_flow/director_approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('director approval failed');
    const text = await res.text();
    if (!text) return { success: true } as any; // treat empty ok response as success
    try {
      return JSON.parse(text);
    } catch {
      return { success: true } as any;
    }
  };

  // API helper: POST to approve NFA endpoint
  const approveNfaApi = async (payload: { comparison_id: string }) => {
    const BASE_URL = getBaseUrl().replace(/\/$/, '');
    const res = await fetch(`${BASE_URL}/purchase_flow/approve_NFA`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(text || 'approve_NFA failed');
    if (!text) return { success: true } as any;
    try {
      return JSON.parse(text);
    } catch {
      // Some backends accidentally return Python-style booleans (True/False/None).
      const normalized = text
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null');
      try {
        return JSON.parse(normalized);
      } catch {
        throw new Error('Invalid JSON received from approve_NFA');
      }
    }
  };

  const attachIndentApproval = async ({ id, prNo }: { id: string; prNo: string }) => {
    if (!prNo) { toast.error('Missing PR number'); return; }
    const p = readUserProfile();
    let staffName = (p.name || '').trim();
    let staffDesignation = (p.role || '').trim();

    // If local profile is missing, try retrieving credentials from server
    if (!staffName) {
      try {
        const BASE_URL = getBaseUrl().replace(/\/$/, '');
        // read cached auth token (stored by AuthContext under key 'fc_auth_v1')
        let token = '';
        try {
          const raw = window.localStorage.getItem('fc_auth_v1');
          if (raw) {
            const parsed = JSON.parse(raw);
            token = String(parsed?.token ?? '');
          }
        } catch {
          // ignore parse errors
        }

        const res = await fetch(`${BASE_URL}/login/get_credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          const cred = await res.json();
          staffName = (cred?.staff_name || '').trim();
          staffDesignation = (cred?.staff_designation || '')?.trim();
          if (staffName) writeUserProfile({ name: staffName, role: staffDesignation });
        }
      } catch (e) {
        console.warn('Failed to fetch credentials', e);
      }
    }

    if (!staffName) {
      toast.error('Unable to determine staff name; please login or set profile');
      return;
    }

    const nameId = `${staffName}${staffDesignation ? ` / ${staffDesignation}` : ''}`;
    const now = new Date();
    const hhmm = now.toTimeString().slice(0,5);
    const ymd = now.toISOString().slice(0,10);
    const signature = `Approved | ${staffName} | ${hhmm} | ${ymd}`;

    setAttachingApprovalMap((s) => ({ ...s, [id]: true }));
    try {
      const json = await directorApprovalApi({ pr_number: prNo, name_id: nameId, signature });
      // If backend explicitly returned success:true, use our nameId and signature
      let backend: any = null;
      if (json && (json.success === true)) {
        backend = { name_id: nameId, signature, timestamp: new Date().toISOString() };
      } else if (json) {
        backend = (json.approved_by ?? json.forwarded_by ?? json.indented_by) ?? { name_id: nameId, signature, timestamp: new Date().toISOString() };
      } else {
        backend = { name_id: nameId, signature, timestamp: new Date().toISOString() };
      }

      const stampDate = backend.timestamp ? new Date(backend.timestamp).toISOString().slice(0,10) : ymd;
      setIndents((prev) => prev.map((x) => x.id === id ? ({ ...x,
        directorsApproval: backend.name_id ?? x.directorsApproval,
        directorsApprovalSignature: backend.signature ?? signature,
        directorsApprovalTimestamp: stampDate,
        status: 'forwarded',
      }) : x));
      // If preview is open for this indent, update it so popup shows new signature immediately
      setPreviewIndent((prev) => prev && prev.id === id ? ({ ...prev,
        directorsApproval: backend.name_id ?? prev.directorsApproval,
        directorsApprovalSignature: backend.signature ?? signature,
        directorsApprovalTimestamp: stampDate,
        status: 'forwarded',
      }) : prev);
      setIndentApprovalsMap((s) => ({ ...s, [id]: true }));
      toast.success('Signature attached');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Attach sign failed');
    } finally {
      setAttachingApprovalMap((s) => ({ ...s, [id]: false }));
    }
  };

  const attachNfaApproval = async ({ prNo, comparisonId }: { prNo: string; comparisonId: string }) => {
    if (!prNo) { toast.error('Missing PR number'); return; }
    if (!comparisonId) { toast.error('Missing comparison id'); return; }
    const id = prNo; // use PR as stable key for loading state

    setAttachingApprovalMap((s) => ({ ...s, [id]: true }));
    try {
      const json = await approveNfaApi({ comparison_id: comparisonId });
      if (!json || json.success !== true) {
        throw new Error('NFA approval failed');
      }

      setNfas((prev) =>
        prev.map((x) => {
          const xPr = String((x as any)?.pr_number ?? '').trim();
          const xCmp = String((x as any)?.comparison_id ?? (x as any)?.comparision_id ?? '').trim();
          if ((xPr && xPr === prNo) || (xCmp && xCmp === comparisonId)) {
            return { ...x, NFA_status: 'approved', nfa_status: 'approved' };
          }
          return x;
        }),
      );

      setNfaApprovalsMap((s) => ({ ...s, [prNo]: true }));
      toast.success('NFA approved and forwarded successfully');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'NFA approval failed');
    } finally {
      setAttachingApprovalMap((s) => ({ ...s, [id]: false }));
    }
  };

  // Render sections (Indents / MRF / NFA) via a local variable to avoid nested ternary JSX parsing issues
  let sectionContent: JSX.Element | null = null;
  if (activeSection === 'indents') {
    sectionContent = (
      <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
        <div className="grid grid-cols-[minmax(220px,3fr)_minmax(140px,2fr)_minmax(180px,3fr)_minmax(130px,2fr)_80px_140px] gap-2 px-4 py-3 text-xs font-semibold text-gray-500 border-b border-gray-100">
          <div>PR No / Project</div>
          <div>Department</div>
          <div>Indented By</div>
          <div>Date</div>
          <div className="text-center">Items</div>
          <div className="text-right">Status</div>
        </div>

        <div className="space-y-3">
          {filtered.map((it) => {
            const attached = Boolean(attachedMap[it.id]);
            const alreadySigned = Boolean(it.directorsApprovalSignature) || Boolean(indentApprovalsMap[it.id]);
            void attached;

            return (
              <div
                key={it.id}
                className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm flex items-center justify-between cursor-pointer hover:border-gray-200"
                onClick={() => setPreviewIndent(it)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setPreviewIndent(it);
                }}
              >
                <div>
                  <div className="flex items-baseline gap-3">
                    <h3 className="font-semibold text-gray-800">{it.prNo || 'PR (Draft)'}</h3>
                    <span className="text-xs text-gray-400">{it.project}</span>
                  </div>
                  <p className="text-sm text-gray-500">
                    Items: {(it.items ?? []).length} · Total: {formatInr(totalValue(it.items ?? []))} · Indented by {it.indentedBy || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold ${
                        it.status === 'pending'
                          ? 'text-yellow-600'
                          : it.status === 'forwarded'
                            ? 'text-blue-600'
                            : 'text-gray-600'
                      }`}
                    >
                      {it.status.toUpperCase()}
                    </p>
                    <p className="text-xs text-gray-400">{it.date}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void attachIndentApproval({ id: it.id, prNo: it.prNo });
                      }}
                      disabled={alreadySigned || Boolean(attachingApprovalMap[it.id])}
                    >
                      <Paperclip className="w-4 h-4" />
                      {alreadySigned ? 'Approved' : attachingApprovalMap[it.id] ? 'Attaching…' : 'Attach Sign'}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  } else if (activeSection === 'mrf') {
    sectionContent = (
      <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
        <div className="grid grid-cols-[minmax(220px,3fr)_minmax(200px,2fr)_minmax(120px,1fr)_120px] gap-2 px-4 py-3 text-xs font-semibold text-gray-500 border-b border-gray-100">
          <div>MRF No / Department</div>
          <div>Approval Flow</div>
          <div>Created</div>
          <div className="text-right">Actions</div>
        </div>

        <div className="space-y-3 p-3">
          {isLoadingMrfs ? (
            <div className="text-sm text-gray-500">Loading MRFs…</div>
          ) : mrfRecords.length === 0 ? (
            <div className="text-sm text-gray-500">No MRFs found.</div>
          ) : (
            mrfRecords.map((r) => {
              const mrfNo = String(r.MRF_no ?? '') || '';
              const dept = String(r.request_details?.department ?? '') || '—';
              const subDepartment = String(r.request_details?.sub_department ?? '') || '—';
              const contactType = String(r.request_details?.contact_type ?? '') || '—';
              const reasonOfVacancy = String(r.request_details?.reason_of_vacancy ?? '') || '—';
              const impact = String(r.request_details?.impact ?? '') || '—';
              const billingDetails = Array.isArray(r.billing_details) ? r.billing_details : [];
              const created = r.created_at ?? r.createdAt ?? '';
              const adminEntry = getMrfSignatureEntry(readMrfSignatureCache(), mrfNo, 'admin_ops');
              const directorEntry = getMrfSignatureEntry(readMrfSignatureCache(), mrfNo, 'director');
              const adminStamp = adminEntry?.stamp || String(r.admin_ops_approval_status ?? r.adminOpsApprovalStatus ?? '').trim();
              const adminStatus = extractStatusFromEntry(adminEntry ?? adminStamp) ?? 'pending';
              const adminStampParts = parseMrfSignatureStamp(adminStamp);
              const directorStatus = extractStatusFromEntry(directorEntry ?? (r.director_approval_status ?? r.directorApprovalStatus)) ?? 'pending';
              const isOpen = openRowId === mrfNo;
              const simpleAdmin = adminStatus === 'approved' ? 'Approved' : adminStatus === 'reject' ? 'Reject' : 'Pending';
              const canAct = adminStatus === 'pending' && savingMrfFor !== mrfNo;
              return (
                <div key={mrfNo || Math.random()} className="rounded-lg border border-gray-100 bg-white shadow-sm overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left hover:bg-gray-50"
                    onClick={() => setOpenRowId((prev) => (prev === mrfNo ? '' : mrfNo))}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 truncate">{mrfNo || 'MRF (Unknown)'}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {dept} · {subDepartment} · {contactType}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${adminStatus === 'approved' ? 'bg-green-50 text-green-700 border border-green-200' : adminStatus === 'reject' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                        Admin Ops: {simpleAdmin}
                      </span>
                      <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold text-gray-700 bg-gray-50">
                        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 px-3 py-3 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-md bg-gray-50 border border-gray-100 p-3">
                          <div className="text-xs font-semibold text-gray-500 mb-1">Request Details</div>
                          <div className="text-gray-700">Department: {dept}</div>
                          <div className="text-gray-700">Sub department: {subDepartment}</div>
                          <div className="text-gray-700">Contact type: {contactType}</div>
                          <div className="text-gray-700">Reason of vacancy: {reasonOfVacancy}</div>
                          <div className="text-gray-700">Impact: {impact}</div>
                        </div>

                        <div className="rounded-md bg-gray-50 border border-gray-100 p-3">
                          <div className="text-xs font-semibold text-gray-500 mb-1">Billing Details</div>
                          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                            <table className="w-full text-sm border-collapse">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="text-left px-2 py-1.5 border-b border-gray-200">Designation</th>
                                  <th className="text-right px-2 py-1.5 border-b border-gray-200">Qty</th>
                                  <th className="text-right px-2 py-1.5 border-b border-gray-200">CTC</th>
                                  <th className="text-right px-2 py-1.5 border-b border-gray-200">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {billingDetails.length > 0 ? billingDetails.map((bill: any, idx: number) => {
                                  const qty = Number(bill?.quantity || 0);
                                  const ctc = Number(bill?.CTC || 0);
                                  const total = qty * ctc;
                                  return (
                                    <tr key={`${mrfNo}-bill-${idx}`}>
                                      <td className="px-2 py-1.5 border-b border-gray-100">{bill?.Designation || '-'}</td>
                                      <td className="px-2 py-1.5 border-b border-gray-100 text-right">{qty}</td>
                                      <td className="px-2 py-1.5 border-b border-gray-100 text-right">{formatCurrency(ctc)}</td>
                                      <td className="px-2 py-1.5 border-b border-gray-100 text-right font-semibold">{formatCurrency(total)}</td>
                                    </tr>
                                  );
                                }) : (
                                  <tr>
                                    <td className="px-2 py-2 text-gray-500" colSpan={4}>No billing details found.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-2 text-right text-sm font-bold text-gray-900">Total Budget: {formatCurrency(r.total_budget ?? 0)}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-md bg-gray-50 border border-gray-100 p-3">
                          <div className="text-xs font-semibold text-gray-500 mb-1">Approval Stamps</div>
                          <div className="text-gray-700 break-all"><span className="font-semibold">Admin Ops:</span> {adminStamp || 'pending'}</div>
                          <div className="text-gray-700 break-all"><span className="font-semibold">Director:</span> {String(r.director_approval_status ?? r.directorApprovalStatus ?? 'pending')}</div>
                          <div className="text-xs text-gray-500 mt-2">Created: {created ? new Date(created).toLocaleString() : '—'}</div>
                          <div className="text-xs text-gray-500">Signed by: {adminStampParts.signerName || r.admin_ops_approver_name || '—'}</div>
                          <div className="text-xs text-gray-500">Signed at: {adminStampParts.signedAt || '—'}</div>
                        </div>

                        <div className="rounded-md bg-gray-50 border border-gray-100 p-3">
                          <div className="text-xs font-semibold text-gray-500 mb-1">Signature Preview</div>
                          <div className="text-sm text-gray-700 break-all">{adminStamp || 'pending'}</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canAct}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void updateMrfApproval(mrfNo, 'rejected');
                          }}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          className="bg-green-600 text-white"
                          disabled={!canAct}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void updateMrfApproval(mrfNo, 'approved');
                          }}
                        >
                          Approve
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  } else {
    sectionContent = (
      <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">NFA (Note For Approval)</h2>
            <p className="text-xs text-gray-500">For information only (corporate procedure). Your task: approve & forward the finalized quotation.</p>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(220px,3fr)_minmax(320px,5fr)_minmax(220px,3fr)] gap-2 px-4 py-3 text-xs font-semibold text-gray-500 border-b border-gray-100">
          <div>PR No / Project</div>
          <div>Finalized Quotation (HO Selected)</div>
          <div className="text-right">Approval</div>
        </div>

        <div className="divide-y divide-gray-100">
          {filteredNfas.map((nfa, idx) => {
            const prNo = String(nfa.pr_number ?? '').trim();
            const indent = prNo ? indents.find((x) => String(x.prNo ?? '').trim() === prNo || String(x.id ?? '').trim() === prNo) : undefined;
            const comparisonId = String((nfa as any)?.comparison_id ?? (nfa as any)?.comparision_id ?? '').trim();
            const hasNfaStatusField = (nfa as any)?.NFA_status != null || (nfa as any)?.nfa_status != null;
            const statusRaw = String((nfa as any)?.NFA_status ?? (nfa as any)?.nfa_status ?? '').trim();
            const statusLower = statusRaw.toLowerCase();

            const approvedByStatus = Boolean(hasNfaStatusField && statusRaw && statusLower !== 'pending');
            const approvedLocally = Boolean(prNo && nfaApprovalsMap[prNo]);
            const alreadySigned = approvedByStatus || approvedLocally;

            const canApprove = Boolean(prNo) && Boolean(comparisonId) && (!hasNfaStatusField || statusLower === 'pending');
            const loadingKey = prNo;

            return (
              <div
                key={`nfa-${prNo || idx}`}
                className="grid grid-cols-[minmax(220px,3fr)_minmax(320px,5fr)_minmax(220px,3fr)] gap-2 px-4 py-3 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{prNo || 'PR (Draft)'}</div>
                  <div className="text-xs text-gray-500 truncate">{indent?.project || '—'}</div>
                </div>

                <div className="text-xs text-gray-600">
                  {prNo ? <FinalizedVendorQuotationCompact nfa={nfa} approved={alreadySigned} /> : <span className="text-gray-500">Missing PR number.</span>}
                </div>

                <div className="flex items-start justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    className="bg-gray-900 hover:bg-gray-800 text-white"
                    disabled={alreadySigned || !canApprove || Boolean(attachingApprovalMap[loadingKey])}
                    onClick={() => {
                      if (!prNo) {
                        toast.error('Missing PR number');
                        return;
                      }
                      if (!comparisonId) {
                        toast.error('Missing comparison id');
                        return;
                      }
                      void attachNfaApproval({ prNo, comparisonId });
                    }}
                  >
                    {alreadySigned ? 'Approved' : attachingApprovalMap[loadingKey] ? 'Approving…' : 'Approve & Forward'}
                  </Button>
                </div>
              </div>
            );
          })}

          {filteredNfas.length === 0 && (
            <div className="px-4 py-6 text-sm text-gray-500 text-center">No NFA found.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance NFA Approval</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review the finalized quotation and approve & forward</p>
        </div>
        <Button variant="outline" onClick={() => setConfigOpen(true)} className="gap-2">
          <Settings className="w-4 h-4" />
          Configure
        </Button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search by PR no, project, item or requester…"
          className="pl-9 bg-white border-gray-200 shadow-sm h-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Sticky section switcher so Indents + NFA are always easy to access */}
      <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-gray-50/90 backdrop-blur border-b border-gray-100">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeSection === 'indents' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            onClick={() => setActiveSection('indents')}
          >
            Indents ({filtered.length})
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeSection === 'nfa' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            onClick={() => setActiveSection('nfa')}
          >
            NFA Notes
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeSection === 'mrf' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            onClick={() => setActiveSection('mrf')}
          >
            MRF ({mrfRecords.length})
          </button>
        </div>
      </div>

      {sectionContent}

      <Dialog open={Boolean(previewIndent)} onOpenChange={(v) => { if (!v) setPreviewIndent(null); }}>
        <DialogContent className="max-w-[1200px] w-[1200px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewIndent?.indentType === 'SPR' ? 'SPR Preview' : 'PR Preview'}</DialogTitle>
          </DialogHeader>
          {previewIndent && previewIndent.indentType === 'SPR' ? (
            <SprPreview
              indent={previewIndent}
              attachments={attachments}
              showDirectorSignature={Boolean(directorsAttachedMap[previewIndent.id])}
            />
          ) : previewIndent && (
            <PRPreview
              indent={{
                project: previewIndent.project,
                prNo: previewIndent.prNo,
                date: previewIndent.date,
                department: previewIndent.department,
                indentedBy: previewIndent.indentedBy,
                indentedBySignature: previewIndent.indentedBySignature,
                indentedByTimestamp: previewIndent.indentedByTimestamp,
                forwardedBy: previewIndent.forwardedBy,
                forwardedBySignature: previewIndent.forwardedBySignature,
                forwardedByTimestamp: previewIndent.forwardedByTimestamp,
                directorsApproval: previewIndent.directorsApproval,
                directorsApprovalSignature: previewIndent.directorsApprovalSignature,
                directorsApprovalTimestamp: previewIndent.directorsApprovalTimestamp,
                remarksNotes: previewIndent.remarksNotes,
                budgetHead: previewIndent.budgetHead,
                items: previewIndent.items,
              }}
              attachments={attachments}
              showDirectorSignature={Boolean(directorsAttachedMap[previewIndent.id])}
            />
          )}
                {previewIndent && (
            <DialogFooter>
              <div className="flex justify-end gap-2 w-full">
                <Button variant="outline" onClick={() => setPreviewIndent(null)}>Close</Button>
                <Button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!previewIndent) return; void attachIndentApproval({ id: previewIndent.id, prNo: previewIndent.prNo }); }}
                  disabled={Boolean((previewIndent && (previewIndent.directorsApprovalSignature || indentApprovalsMap[previewIndent.id])) || (previewIndent && attachingApprovalMap[previewIndent.id]))}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {previewIndent && (previewIndent.directorsApprovalSignature || indentApprovalsMap[previewIndent.id]) ? 'Approved' : (previewIndent && attachingApprovalMap[previewIndent.id]) ? 'Attaching…' : 'Attach Sign'}
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      <ConfigureModal open={configOpen} onClose={handleConfigClose} indents={indents} />
    </div>
  );
};

// ─── Shared: read image file ─────────────────────────────────────────────────

const readImageFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// ─── DiaryPersonRow — one card in the Signature Diary ────────────────────────

const DiaryPersonRow = ({
  name,
  data,
  removable,
  onChange,
  onRemove,
}: {
  name: string;
  data: { signature: string; stamp: string };
  removable?: boolean;
  onChange: (next: { signature: string; stamp: string }) => void;
  onRemove?: () => void;
}) => {
  const sigRef = useRef<HTMLInputElement>(null);
  const stampRef = useRef<HTMLInputElement>(null);

  return (
    <div className="border border-gray-100 rounded-lg p-3 space-y-3 bg-white">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-800 truncate">{name}</p>
        {removable && onRemove && (
          <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 transition-colors ml-2 shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Signature */}
        <div>
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Signature</label>
          <input ref={sigRef} type="file" accept="image/*" className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              onChange({ ...data, signature: await readImageFile(file) });
              e.target.value = '';
            }}
          />
          {data.signature ? (
            <div className="space-y-1">
              <img src={data.signature} alt="Sig" className="h-9 border border-gray-200 rounded bg-white object-contain px-1 w-full" />
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="sm" className="flex-1 h-6 text-[10px] px-1" onClick={() => sigRef.current?.click()}>Replace</Button>
                <Button type="button" variant="outline" size="sm" className="flex-1 h-6 text-[10px] px-1 text-red-500" onClick={() => onChange({ ...data, signature: '' })}>Remove</Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" className="w-full text-[11px] h-8" onClick={() => sigRef.current?.click()}>
              Upload
            </Button>
          )}
        </div>

        {/* Stamp */}
        <div>
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Stamp</label>
          <input ref={stampRef} type="file" accept="image/*" className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              onChange({ ...data, stamp: await readImageFile(file) });
              e.target.value = '';
            }}
          />
          {data.stamp ? (
            <div className="space-y-1">
              <img src={data.stamp} alt="Stamp" className="h-9 border border-gray-200 rounded bg-white object-contain px-1 w-full" />
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="sm" className="flex-1 h-6 text-[10px] px-1" onClick={() => stampRef.current?.click()}>Replace</Button>
                <Button type="button" variant="outline" size="sm" className="flex-1 h-6 text-[10px] px-1 text-red-500" onClick={() => onChange({ ...data, stamp: '' })}>Remove</Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" className="w-full text-[11px] h-8" onClick={() => stampRef.current?.click()}>
              Upload
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Configure Modal ────────────────────────────────────────────────────────

const ConfigureModal = ({
  open,
  onClose,
  indents,
}: {
  open: boolean;
  onClose: () => void;
  indents: Indent[];
}) => {
  // ── User profile ──
  const [profileName, setProfileName] = useState('');
  const [profileRole, setProfileRole] = useState('');

  // ── Signature Diary ──
  const [diary, setDiary] = useState<SignatureDiary>({});
  const [newPersonName, setNewPersonName] = useState('');

  // Names detected automatically from indents
  const detectedNames = useMemo(() => {
    const names = new Set<string>();
    for (const ind of indents) {
      if (ind.indentedBy?.trim()) names.add(ind.indentedBy.trim());
      if (ind.forwardedBy?.trim()) names.add(ind.forwardedBy.trim());
      if (ind.directorsApproval?.trim()) names.add(ind.directorsApproval.trim());
    }
    return Array.from(names);
  }, [indents]);

  // All names shown = detected + any extra manually added
  const allDiaryNames = useMemo(() => {
    const set = new Set(detectedNames);
    Object.keys(diary).forEach((k) => set.add(k));
    return Array.from(set);
  }, [detectedNames, diary]);

  useEffect(() => {
    if (!open) return;
    const p = readUserProfile();
    setProfileName(p.name);
    setProfileRole(p.role);
    setDiary(readSignatureDiary());
    setNewPersonName('');
  }, [open]);

  const updateEntry = (name: string, data: { signature: string; stamp: string }) => {
    setDiary((prev) => ({ ...prev, [name]: data }));
  };

  const removePerson = (name: string) => {
    if (detectedNames.includes(name)) return; // cannot remove auto-detected
    setDiary((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const addPerson = () => {
    const n = newPersonName.trim();
    if (!n) return;
    setDiary((prev) => ({ ...prev, [n]: prev[n] ?? { signature: '', stamp: '' } }));
    setNewPersonName('');
  };

  const save = () => {
    writeUserProfile({ name: profileName.trim(), role: profileRole.trim() });
    writeSignatureDiary(diary);
    toast.success('Configuration saved');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* ── Current User Profile ── */}
          <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <UserCircle className="w-4 h-4 text-gray-500" />
              <p className="text-sm font-semibold text-gray-800">Current User Profile</p>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              This profile is used to auto-detect who is granting approvals. Make sure your name matches exactly the name in the indents.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Full Name</label>
                <Input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="e.g. RAJENDRA SHRINGARPUTALE"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Role / Designation</label>
                <Input
                  value={profileRole}
                  onChange={(e) => setProfileRole(e.target.value)}
                  placeholder="e.g. Director"
                />
              </div>
            </div>
          </div>

          {/* ── Signature Diary ── */}
          <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <BookUser className="w-4 h-4 text-gray-500" />
              <p className="text-sm font-semibold text-gray-800">Signature Diary</p>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              Upload a signature and/or stamp for each person. Names from current indents are auto-detected.
              Signatures appear in the PR preview rows matching that person's name.
            </p>

            <div className="space-y-3">
              {allDiaryNames.map((name) => (
                <DiaryPersonRow
                  key={name}
                  name={name}
                  data={diary[name] ?? { signature: '', stamp: '' }}
                  removable={!detectedNames.includes(name)}
                  onChange={(d) => updateEntry(name, d)}
                  onRemove={() => removePerson(name)}
                />
              ))}

              {allDiaryNames.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">No names detected yet. Add one below.</p>
              )}

              {/* Add extra person */}
              <div className="flex gap-2 pt-1">
                <Input
                  placeholder="Add person by name…"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } }}
                  className="text-sm h-9"
                />
                <Button type="button" variant="outline" size="sm" className="h-9 gap-1 shrink-0" onClick={addPerson}>
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </Button>
              </div>
            </div>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminOpsIndent;
