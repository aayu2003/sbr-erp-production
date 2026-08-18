import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Eye,
  FileText,
  IndianRupee,
  Loader2,
  Paperclip,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import { readUserProfile } from '@/lib/signatureDiary';
import { printWorkRequisitionPdf, type WorkRequisitionPdfData } from '@/lib/workRequisitionPdf';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';
import logo3f from '@/Assets/3f-logo.png';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type ServiceRow = {
  id: string;
  serviceDescription: string;
  uom: string;
  quantity: string;
  ratePerUnit: string;
  startDate: string;
  duration: string;
  completionDate: string;
  validity: string;
  servicesFrom: string;
  approxValue: string;
  gstPercent: string;
  proposedVendors: string;
  previousWO: string;
  remarks: string;
};

type ApiServiceRow = {
  srNo: number;
  serviceDescription: string;
  uom: string;
  quantity: number;
  startDate: string;
  duration: string;
  completionDate: string;
  validity: string;
  servicesFrom: string;
  approxValue: number;
  gstPercent: number;
  gstAmount: number;
  proposedVendors: string;
  previousWO: string;
  remarks: string;
};

type WorkOrderForm = {
  plant: string;
  sprDate: string;
  sprNo: string;
  areaOfService: string;
  func: string;
  natureOfService: string;
  notes: string;
  rows: ServiceRow[];
};

type WorkOrderRecord = {
  id: string;
  sprNo: string;
  sprDate: string;
  plant: string;
  areaOfService: string;
  func?: string;
  natureOfService: string;
  status: 'Draft' | 'Submitted' | 'Approved';
  createdAt: string;
  notes?: string;
  budgetHead?: string;
  indentedBy?: string;
  indentedBySignature?: string;
  indentedByTimestamp?: string;
  forwardedBy?: string;
  forwardedBySignature?: string;
  forwardedByTimestamp?: string;
  approvedBy?: string;
  approvedBySignature?: string;
  approvedByTimestamp?: string;
  serviceRows?: ApiServiceRow[];
};

// ─────────────────────────────────────────────────────────────
// BUDGET HEAD TYPES
// ─────────────────────────────────────────────────────────────
type ApiBudget = {
  budget_id: string;
  budget_name: string;
  crop_season: string;
  financial_year_start: string;
  financial_year_end: string;
  status: string;
};

type ApiBudgetLineItem = {
  line_item_id: string;
  budget_type: string;
  category: string;
  line_item: string;
  UoM: string;
  quantity_per_acre: number;
  total_acres: number;
  total_quantity: number;
  rate_per_unit: number;
  total_value: number;
  utilized_amount: number;
  savings: number;
  amount_in_pipeline?: number;
  remaining_amount?: number;
};

type BudgetLineItemSelection = {
  id: string;
  lineNo: number;
  name: string;
  category: string;
  budgetType: string;
  uom: string;
  qtyPerAcre: number;
  totalAcres: number;
  totalQty: number;
  ratePerUnit: number;
  totalValue: number;
  amount: number;
};

type BudgetHeadSelection = {
  budgetId: string;
  budgetName: string;
  lineItems: BudgetLineItemSelection[];
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const genId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const SERVICE_CATEGORIES = [
  'Agriculture & Cultivation', 'Crop Protection', 'Harvesting', 'Farm Input Application', 'Land Preparation',
  'Land Development', 'Irrigation & Water Management', 'Borewell & Water Source', 'Farm Infrastructure',
  'Civil Works', 'Electrical Works', 'Mechanical Works', 'Fencing & Boundary', 'Roads & Access',
  'Drainage & Water Management', 'Equipment & Machinery', 'Vehicle & Transportation', 'Material Handling',
  'Warehouse & Storage', 'Labour & Manpower', 'Survey & Inspection', 'Maintenance & Repair',
  'Fabrication & Installation', 'Security Services', 'Housekeeping & Cleaning', 'Pest Control',
  'IT & Technology', 'Office & Administration', 'Printing & Stationery', 'Professional / Consultancy Services',
  'Testing & Certification', 'Logistics & Freight', 'Loading / Unloading', 'Waste Management',
  'Safety & Compliance', 'Other Services',
] as const;

const SERVICE_ACTIVITIES: Record<string, string[]> = {
  'Agriculture & Cultivation': ['Ploughing', 'Rotavation', 'Sowing', 'Transplanting', 'Inter-Weeding', 'Fertilizer Application', 'Manure Spreading', 'Spraying', 'Harvesting', 'Crop Residue Removal'],
  'Crop Protection': ['Pesticide Application', 'Herbicide Application', 'Fungicide Application', 'Biological Control', 'Crop Scouting', 'Bird / Animal Control'],
  'Harvesting': ['Manual Harvesting', 'Mechanical Harvesting', 'Threshing', 'Baling', 'Crop Collection', 'Post-Harvest Handling'],
  'Farm Input Application': ['Fertilizer Application', 'Manure Spreading', 'Micronutrient Application', 'Pesticide Application', 'Seed Treatment'],
  'Land Preparation': ['Ploughing', 'Rotavation', 'Harrowing', 'Levelling', 'Bed Formation', 'Land Clearing'],
  'Land Development': ['Land Clearing', 'Levelling', 'Bund Formation', 'Bund Repair', 'Excavation', 'Filling', 'Grading'],
  'Irrigation & Water Management': ['Pipeline Laying', 'Irrigation Operation', 'Sprinkler Installation', 'Drip Installation', 'Pump Installation', 'Pipeline Shifting', 'Pipeline Repair'],
  'Borewell & Water Source': ['Borewell Survey', 'Borewell Drilling', 'Casing', 'Flushing', 'Pump Lowering', 'Yield Testing', 'Borewell Repair'],
  'Farm Infrastructure': ['Shed Construction', 'Farm Building Repair', 'Utility Installation', 'Storage Structure', 'Internal Infrastructure Maintenance'],
  'Civil Works': ['Excavation', 'PCC', 'RCC', 'Masonry', 'Plastering', 'Flooring', 'Shed Construction', 'Foundation Work'],
  'Electrical Works': ['Wiring', 'Panel Installation', 'Cable Laying', 'Earthing', 'Lighting', 'Electrical Repair'],
  'Mechanical Works': ['Installation', 'Alignment', 'Overhauling', 'Preventive Maintenance', 'Breakdown Repair', 'Mechanical Fabrication'],
  'Fencing & Boundary': ['RCC Pole Installation', 'Bamboo Installation', 'Wire Installation', 'Electric Fencing', 'Fence Repair'],
  'Roads & Access': ['Road Construction', 'Road Repair', 'Grading', 'Compaction', 'Access Track Development'],
  'Drainage & Water Management': ['Drain Excavation', 'Drain Cleaning', 'Drain Repair', 'Water Channel Construction', 'Desilting'],
  'Equipment & Machinery': ['Installation', 'Operation', 'Preventive Maintenance', 'Breakdown Repair', 'Rental'],
  'Vehicle & Transportation': ['Vehicle Hire', 'Material Transportation', 'Employee Transportation', 'Tractor Hire', 'Trolley Hire'],
  'Material Handling': ['Loading', 'Unloading', 'Shifting', 'Stacking', 'Handling'],
  'Warehouse & Storage': ['Storage', 'Warehouse Handling', 'Stock Shifting', 'Godown Maintenance'],
  'Labour & Manpower': ['Skilled Labour', 'Unskilled Labour', 'Operator', 'Supervisor', 'Helper'],
  'Survey & Inspection': ['Land Survey', 'Technical Inspection', 'Quantity Verification', 'GPS Survey', 'Quality Inspection'],
  'Maintenance & Repair': ['Preventive Maintenance', 'Corrective Maintenance', 'Breakdown Maintenance', 'General Repair'],
  'Fabrication & Installation': ['Fabrication', 'Welding', 'Cutting', 'Erection', 'Installation'],
  'Security Services': ['Security Guard Deployment', 'Patrolling', 'Access Control', 'Event Security', 'Security System Monitoring'],
  'Housekeeping & Cleaning': ['Office Cleaning', 'Industrial Cleaning', 'Deep Cleaning', 'Sanitation', 'Tank Cleaning'],
  'Pest Control': ['General Pest Control', 'Termite Treatment', 'Rodent Control', 'Fumigation', 'Mosquito Control'],
  'IT & Technology': ['Hardware Support', 'Software Support', 'Networking', 'CCTV', 'System Installation'],
  'Office & Administration': ['Data Entry', 'Document Management', 'Office Support', 'Facility Administration', 'Record Digitisation'],
  'Printing & Stationery': ['Document Printing', 'Banner / Signage Printing', 'Binding', 'Photocopying', 'Stationery Supply Service'],
  'Professional / Consultancy Services': ['Consultancy', 'Legal', 'Accounting', 'Engineering', 'Designing', 'Documentation'],
  'Testing & Certification': ['Material Testing', 'Soil Testing', 'Water Testing', 'Equipment Calibration', 'Statutory Certification'],
  'Logistics & Freight': ['Transportation', 'Courier', 'Freight', 'Local Delivery', 'Inter-State Transport'],
  'Loading / Unloading': ['Manual Loading', 'Manual Unloading', 'Machine Loading', 'Machine Unloading', 'Loading with Shifting'],
  'Waste Management': ['Waste Collection', 'Waste Segregation', 'Waste Transportation', 'Disposal', 'Recycling'],
  'Safety & Compliance': ['Safety Audit', 'Fire Safety Service', 'PPE Inspection', 'Compliance Inspection', 'Safety Training'],
  'Other Services': ['Other / Custom Function'],
};

const ENGAGEMENT_TYPES = [
  'One-Time Service', 'Recurring Service', 'Annual / Periodic Service', 'Labour Contract', 'Job Work',
  'Installation Service', 'Repair Service', 'Maintenance Service', 'Preventive Maintenance',
  'Breakdown / Emergency Service', 'Equipment Rental', 'Vehicle Rental', 'Machinery with Operator',
  'Machinery without Operator', 'Transportation Service', 'Loading / Unloading Service', 'Manpower Supply',
  'Professional / Consultancy Service', 'Inspection / Testing Service', 'Fabrication Service', 'Turnkey Service',
  'Rate Contract', 'AMC', 'Other',
] as const;

const SERVICE_SOURCES = [
  'Open / Competitive',
  'Single Source',
  'Proprietary',
  'OEM / Authorized Service Provider',
  'Rate Contract Vendor',
  'Empanelled Vendor',
  'Emergency / Spot Procurement',
] as const;

const UOM_OPTIONS = [
  'Job', 'Lot', 'LS', 'Each / No.', 'Set', 'Unit', 'Acre', 'Hectare', 'Sq. Ft.', 'Sq. Mtr.',
  'Rft', 'Rmt', 'Mtr', 'Km', 'Cu. Ft.', 'Cu. Mtr.', 'Kg', 'MT', 'Bag', 'Ltr',
  'Trip', 'Load', 'Vehicle', 'Vehicle-Day', 'Vehicle-Month', 'Machine-Hour', 'Machine-Day', 'Machine-Month',
  'Hour', 'Shift', 'Day', 'Man-Day', 'Man-Month', 'Person', 'Team', 'Month', 'Quarter', 'Year',
  'Visit', 'Call', 'Inspection', 'Test', 'Sample', 'Case', 'Document', 'Drawing', 'Survey',
  'Installation', 'Repair', 'Service',
] as const;

const emptyRow = (): ServiceRow => ({
  id: genId(),
  serviceDescription: '',
  uom: '',
  quantity: '',
  ratePerUnit: '',
  startDate: '',
  duration: '',
  completionDate: '',
  validity: '',
  servicesFrom: '',
  approxValue: '',
  gstPercent: '18',
  proposedVendors: '',
  previousWO: '',
  remarks: '',
});

const serviceRequisitionFinancialYear = (dateValue: string | Date = new Date()) => {
  const date = dateValue instanceof Date ? dateValue : new Date(`${dateValue}T00:00:00`);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const startYear = safeDate.getMonth() >= 3 ? year : year - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
};

const nextServiceRequisitionNo = (records: WorkOrderRecord[], dateValue: string | Date = new Date()) => {
  const prefix = `SBRPL/SR/${serviceRequisitionFinancialYear(dateValue)}/`;
  const highestSequence = records.reduce((highest, record) => {
    if (!record.sprNo.startsWith(prefix)) return highest;
    const sequence = Number(record.sprNo.slice(prefix.length));
    return Number.isInteger(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);
  return `${prefix}${String(highestSequence + 1).padStart(3, '0')}`;
};

const emptyForm = (): WorkOrderForm => ({
  plant: '',
  sprDate: new Date().toISOString().slice(0, 10),
  sprNo: '',
  areaOfService: '',
  func: '',
  natureOfService: '',
  notes: '',
  rows: [emptyRow()],
});

const INR = (n: number) =>
  '₹ ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const budgetLineCurrentBalance = (line: ApiBudgetLineItem) => {
  if (line.remaining_amount !== undefined && line.remaining_amount !== null) {
    const remaining = Number(line.remaining_amount);
    if (Number.isFinite(remaining)) return Math.max(remaining, 0);
  }
  const totalValue = Number(line.total_value) || 0;
  const pipelineAmount = Number(line.amount_in_pipeline) || 0;
  const utilizedValue = (Number(line.utilized_amount) || 0) * (Number(line.rate_per_unit) || 0);
  return Math.max(totalValue - pipelineAmount - utilizedValue, 0);
};

const calcRowGst = (row: ServiceRow) =>
  (Number(row.approxValue) || 0) * ((Number(row.gstPercent) || 0) / 100);

const computeDurationLabel = (startDate: string, completionDate: string): string => {
  if (!startDate || !completionDate) return '';
  const start = new Date(startDate);
  const end = new Date(completionDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return '';

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  if (days > 0 || parts.length === 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  return parts.join(' ');
};

const calcTotals = (rows: ServiceRow[]) => {
  const subtotal = rows.reduce((s, r) => s + (Number(r.approxValue) || 0), 0);
  const gst = rows.reduce((s, r) => s + calcRowGst(r), 0);
  return { subtotal, gst, total: subtotal + gst };
};

const toWorkOrderRow = (row: ServiceRow, idx: number) => ({
  sr_no: idx + 1,
  service_description: row.serviceDescription,
  uom: row.uom,
  quantity: Number(row.quantity) || 0,
  rate_per_unit: Number(row.ratePerUnit) || 0,
  start_date_of_contract: row.startDate,
  duration_of_contract: row.duration,
  completion_date_of_contract: row.completionDate,
  validity_of_contract: row.validity,
  services_required_from: row.servicesFrom,
  approx_value_of_services: Number(row.approxValue) || 0,
  gst_percentage: Number(row.gstPercent) || 0,
  gst_amount: (Number(row.approxValue) || 0) * ((Number(row.gstPercent) || 0) / 100),
  proposed_vendors: row.proposedVendors,
  previous_wo_details: row.previousWO,
  remarks: row.remarks,
});

const budgetSelectionLabel = (selection: BudgetHeadSelection | null) => selection
  ? selection.lineItems.map((line) => `${selection.budgetName} | ${line.category} | ${line.name} | ${INR(line.amount)}`).join('\n')
  : '';

const formToPdfData = (form: WorkOrderForm, budget: BudgetHeadSelection | null): WorkRequisitionPdfData => ({
  plant: form.plant,
  sprNo: form.sprNo,
  sprDate: form.sprDate,
  areaOfService: form.areaOfService,
  functionName: form.func,
  natureOfService: form.natureOfService,
  notes: form.notes,
  budgetHead: budgetSelectionLabel(budget),
  services: form.rows.map((row, index) => ({
    srNo: index + 1,
    serviceDescription: row.serviceDescription,
    uom: row.uom,
    quantity: Number(row.quantity) || 0,
    startDate: row.startDate,
    duration: row.duration,
    completionDate: row.completionDate,
    validity: row.validity,
    servicesFrom: row.servicesFrom,
    approxValue: Number(row.approxValue) || 0,
    gstPercent: Number(row.gstPercent) || 0,
    gstAmount: calcRowGst(row),
    proposedVendors: row.proposedVendors,
    previousWO: row.previousWO,
    remarks: row.remarks,
  })),
});

const recordToPdfData = (record: WorkOrderRecord): WorkRequisitionPdfData => ({
  plant: record.plant,
  sprNo: record.sprNo,
  sprDate: record.sprDate,
  areaOfService: record.areaOfService,
  functionName: record.func || '',
  natureOfService: record.natureOfService,
  notes: record.notes,
  budgetHead: record.budgetHead,
  services: (record.serviceRows || []).map((row) => ({ ...row })),
  indentedBy: record.indentedBy,
  indentedBySignature: record.indentedBySignature,
  indentedByTimestamp: record.indentedByTimestamp,
  forwardedBy: record.forwardedBy,
  forwardedBySignature: record.forwardedBySignature,
  forwardedByTimestamp: record.forwardedByTimestamp,
  approvedBy: record.approvedBy,
  approvedBySignature: record.approvedBySignature,
  approvedByTimestamp: record.approvedByTimestamp,
});

export const ServiceRequisitionPdfPreview = ({ data }: { data: WorkRequisitionPdfData }) => {
  const subtotal = data.services.reduce((sum, service) => sum + Number(service.approxValue || 0), 0);
  const gst = data.services.reduce((sum, service) => sum + Number(service.gstAmount || 0), 0);
  const display = (value?: string) => String(value || '').trim() || 'Not Recorded';
  const date = (value?: string) => value ? formatDateDDMMYYYY(value) : '—';

  return (
    <article className="flex h-[1050px] w-[742px] flex-col overflow-hidden border border-slate-300 bg-white p-5 font-sans text-[9px] text-slate-700 shadow-xl">
      <header className="text-center">
        <img src={logo3f} alt="Sai Bioresources" className="mx-auto h-12 w-auto object-contain" />
        <h2 className="mt-1.5 text-[16px] font-black tracking-[0.04em] text-[#142D4C]">SAI BIORESOURCES PRIVATE LIMITED</h2>
        <p className="mt-1 text-[7px] font-medium text-slate-500">Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001</p>
        <p className="mt-0.5 text-[7px] text-slate-500">GSTIN: 22ARPCS5442R1ZM | Phone: +91 75870 76870 | Email: rajendra.s@saiobioenergy.com</p>
        <div className="mt-3 h-[3px] bg-[#0D3A35]" />
        <div className="mt-2 bg-[#0D3A35] px-4 py-2 text-[12px] font-black uppercase tracking-[0.16em] text-white">Service Purchase Requisition (SPR)</div>
      </header>

      <section className="grid grid-cols-3 border-l border-t border-slate-300">
        {[
          ['SR Number', data.sprNo || 'Not Generated'], ['SR Date', date(data.sprDate)], ['Department', display(data.plant)],
          ['Service Category', display(data.areaOfService)], ['Service / Activity', display(data.functionName)], ['Engagement Type', display(data.natureOfService)],
        ].map(([label, value]) => <div key={label} className="border-b border-r border-slate-300 px-2.5 py-2"><p className="text-[7px] font-black uppercase tracking-[0.06em] text-slate-500">{label}</p><p className="mt-1 break-words text-[9px] font-bold text-[#142D4C]">{value}</p></div>)}
      </section>

      <section className="mt-3 border border-slate-300">
        <div className="border-b border-slate-300 bg-slate-100 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-700">Service Schedule &amp; Commercial Value</div>
        <table className="w-full table-fixed border-collapse text-[7px]">
          <colgroup><col className="w-[4%]" /><col className="w-[20%]" /><col className="w-[5%]" /><col className="w-[5%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[11%]" /><col className="w-[8%]" /><col className="w-[7%]" /><col className="w-[8%]" /></colgroup>
          <thead className="bg-[#0D3A35] text-white"><tr>{['S.No.', 'Service Description', 'UOM', 'Qty.', 'Start', 'Duration', 'Completion', 'Validity', 'Service Source', 'Approx. Value', 'GST', 'Total'].map((heading) => <th key={heading} className="border-r border-white/20 px-1 py-2 text-center font-bold last:border-r-0">{heading}</th>)}</tr></thead>
          <tbody>
            {data.services.length ? data.services.map((service) => <tr key={service.srNo} className="border-b border-slate-200 last:border-b-0">
              <td className="border-r border-slate-200 px-1 py-2 text-center">{service.srNo}</td><td className="border-r border-slate-200 px-1.5 py-2 font-semibold text-slate-800">{display(service.serviceDescription)}</td><td className="border-r border-slate-200 px-1 py-2 text-center">{display(service.uom)}</td><td className="border-r border-slate-200 px-1 py-2 text-right">{service.quantity || 0}</td><td className="border-r border-slate-200 px-1 py-2 text-center">{date(service.startDate)}</td><td className="border-r border-slate-200 px-1 py-2 text-center">{display(service.duration)}</td><td className="border-r border-slate-200 px-1 py-2 text-center">{date(service.completionDate)}</td><td className="border-r border-slate-200 px-1 py-2 text-center">{date(service.validity)}</td><td className="border-r border-slate-200 px-1 py-2 text-center">{display(service.servicesFrom)}</td><td className="border-r border-slate-200 px-1 py-2 text-right">{INR(service.approxValue)}</td><td className="border-r border-slate-200 px-1 py-2 text-right">{service.gstPercent}%<br />{INR(service.gstAmount)}</td><td className="px-1 py-2 text-right font-bold">{INR(service.approxValue + service.gstAmount)}</td>
            </tr>) : <tr><td colSpan={12} className="px-3 py-6 text-center text-slate-400">Add a service line to populate the PDF schedule.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="grid grid-cols-4 border-x border-b border-slate-300">
        {[['Service Lines', String(data.services.length)], ['Subtotal', INR(subtotal)], ['GST', INR(gst)], ['Total SR Value', INR(subtotal + gst)]].map(([label, value], index) => <div key={label} className={cn('px-3 py-2', index < 3 && 'border-r border-slate-300', index === 3 && 'bg-[#E9F3F0]')}><p className="text-[7px] font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-[10px] font-black text-[#0D3A35]">{value}</p></div>)}
      </section>

      <section className="mt-3 border border-slate-300"><div className="border-b border-slate-300 bg-slate-100 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.08em]">Vendor &amp; Reference Details</div><table className="w-full table-fixed border-collapse text-[7px]"><thead className="bg-[#0D3A35] text-white"><tr>{['S.No.', 'Service', 'Proposed Vendors / Contractor', 'Previous WO', 'Remarks'].map((heading) => <th key={heading} className="border-r border-white/20 px-2 py-1.5 last:border-r-0">{heading}</th>)}</tr></thead><tbody>{data.services.length ? data.services.map((service) => <tr key={`reference-${service.srNo}`} className="border-b border-slate-200 last:border-b-0"><td className="border-r border-slate-200 px-2 py-2 text-center">{service.srNo}</td><td className="border-r border-slate-200 px-2 py-2 font-semibold">{display(service.serviceDescription)}</td><td className="border-r border-slate-200 px-2 py-2">{display(service.proposedVendors)}</td><td className="border-r border-slate-200 px-2 py-2">{display(service.previousWO)}</td><td className="px-2 py-2">{display(service.remarks)}</td></tr>) : <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">No vendor or reference details recorded.</td></tr>}</tbody></table></section>

      <section className="mt-3 grid grid-cols-2 gap-3"><div className="border border-slate-300"><div className="border-b border-slate-300 bg-slate-100 px-3 py-1.5 text-[8px] font-black uppercase">Budget Head / Allocation</div><div className="min-h-14 whitespace-pre-line px-3 py-2 leading-relaxed">{data.budgetHead || 'Not Linked'}</div></div><div className="border border-slate-300"><div className="border-b border-slate-300 bg-slate-100 px-3 py-1.5 text-[8px] font-black uppercase">Requisition Remarks / Notes</div><div className="min-h-14 px-3 py-2 leading-relaxed">{data.notes || 'No remarks recorded'}</div></div></section>

      <section className="mt-3 border border-slate-300"><div className="border-b border-slate-300 bg-slate-100 px-3 py-1.5 text-[8px] font-black uppercase">Approval Details</div><div className="grid grid-cols-[1fr_1.4fr_1.6fr_.8fr] bg-[#0D3A35] text-center text-[7px] font-bold uppercase text-white">{['Approval Stage', 'Name / ID', 'Digital Signature', 'Date'].map((heading) => <div key={heading} className="border-r border-white/20 px-2 py-1.5 last:border-r-0">{heading}</div>)}</div>{[['Indentor Engineer', data.indentedBy, data.indentedBySignature, data.indentedByTimestamp], ['Department HOD', data.forwardedBy, data.forwardedBySignature, data.forwardedByTimestamp], ['Plant Head', data.approvedBy, data.approvedBySignature, data.approvedByTimestamp]].map(([stage, person, signature, timestamp]) => <div key={stage} className="grid grid-cols-[1fr_1.4fr_1.6fr_.8fr] border-b border-slate-200 last:border-b-0"><div className="border-r border-slate-200 px-2 py-2 font-bold">{stage}</div><div className="border-r border-slate-200 px-2 py-2 text-center">{person || 'Pending'}</div><div className="border-r border-slate-200 px-2 py-2 text-center">{signature || 'Pending'}</div><div className="px-2 py-2 text-center">{timestamp ? date(timestamp) : '—'}</div></div>)}</section>

      <footer className="mt-auto grid grid-cols-3 border-t border-slate-300 pt-2 text-[7px] text-slate-500"><span>System-generated Service Purchase Requisition</span><span className="text-center">SR No.: {data.sprNo || 'Draft'}</span><span className="text-right">Page 1</span></footer>
    </article>
  );
};

const indentByAttachSignApi = async (payload: {
  pr_number: string;
  name_id: string;
  signature: string;
}) => {
  const res = await fetch(`${BASE_URL}/purchase_flow/indent_by_attach_sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  try { return text ? JSON.parse(text) : null; } catch { return null; }
};

// ─────────────────────────────────────────────────────────────
// BUDGET HEAD PICKER MODAL
// ─────────────────────────────────────────────────────────────
const BudgetHeadPickerModal = ({
  open,
  onClose,
  onSave,
  requiredAmount,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (selection: BudgetHeadSelection) => void;
  requiredAmount: number;
  initial?: BudgetHeadSelection | null;
}) => {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [budgets, setBudgets] = React.useState<ApiBudget[]>([]);
  const [budgetsLoading, setBudgetsLoading] = React.useState(false);
  const [budgetsError, setBudgetsError] = React.useState<string | null>(null);
  const [selectedBudget, setSelectedBudget] = React.useState<ApiBudget | null>(null);
  const [lineItems, setLineItems] = React.useState<ApiBudgetLineItem[]>([]);
  const [lineItemsLoading, setLineItemsLoading] = React.useState(false);
  const [lineItemsError, setLineItemsError] = React.useState<string | null>(null);
  const [lineItemSelections, setLineItemSelections] = React.useState<Record<string, { checked: boolean; amount: number }>>({});

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelectedBudget(null);
    setLineItems([]);
    setLineItemSelections({});
    setBudgetsError(null);

    setBudgetsLoading(true);
    const ac = new AbortController();
    fetch(`${BASE_URL}/admin_accounts/get_budgets`, { headers: { Accept: 'application/json' }, signal: ac.signal })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setBudgets(d.data ?? []); else setBudgetsError(d?.message || 'Failed to load budgets'); })
      .catch((e) => { if (e?.name !== 'AbortError') setBudgetsError('Failed to load budgets'); })
      .finally(() => setBudgetsLoading(false));

    return () => ac.abort();
  }, [open]);

  useEffect(() => {
    if (!selectedBudget) return;
    setLineItemsLoading(true);
    setLineItemsError(null);
    setLineItems([]);
    setLineItemSelections({});

    const ac = new AbortController();
    fetch(`${BASE_URL}/purchase_flow/get_budget_all_line_items/${selectedBudget.budget_id}`, {
      headers: { Accept: 'application/json' }, signal: ac.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        const items: ApiBudgetLineItem[] = d?.line_items ?? [];
        setLineItems(items);
        const init: Record<string, { checked: boolean; amount: number }> = {};
        items.forEach((li) => { init[li.line_item_id] = { checked: false, amount: 0 }; });
        setLineItemSelections(init);
      })
      .catch((e) => { if (e?.name !== 'AbortError') setLineItemsError('Failed to load line items'); })
      .finally(() => setLineItemsLoading(false));

    return () => ac.abort();
  }, [selectedBudget]);

  const toggleLineItem = (id: string) =>
    setLineItemSelections((prev) => {
      const current = prev[id] ?? { checked: false, amount: 0 };
      return { ...prev, [id]: { ...current, checked: !current.checked } };
    });

  const updateAmount = (id: string, amount: number) =>
    setLineItemSelections((prev) => ({ ...prev, [id]: { ...prev[id], amount } }));

  const handleSave = () => {
    const selected = lineItems
      .map((li, idx) => ({ li, idx }))
      .filter(({ li }) => lineItemSelections[li.line_item_id]?.checked)
      .map(({ li, idx }) => ({
        id: li.line_item_id,
        lineNo: idx + 1,
        name: li.line_item,
        category: li.category,
        budgetType: li.budget_type,
        uom: li.UoM,
        qtyPerAcre: li.quantity_per_acre,
        totalAcres: li.total_acres,
        totalQty: li.total_quantity,
        ratePerUnit: li.rate_per_unit,
        totalValue: li.total_value,
        amount: lineItemSelections[li.line_item_id]?.amount ?? 0,
      }));

    if (selected.length === 0) { toast.error('Select at least one line item'); return; }
    const unfilled = selected.filter((s) => !s.amount);
    if (unfilled.length > 0) { toast.error(`Enter indent amount for: ${unfilled.map((s) => s.name).join(', ')}`); return; }
    const overdrawn = selected.filter((selection) => {
      const source = lineItems.find((line) => line.line_item_id === selection.id);
      return source && selection.amount > budgetLineCurrentBalance(source) + 0.01;
    });
    if (overdrawn.length > 0) {
      toast.error(`Allocation exceeds current balance for: ${overdrawn.map((s) => s.name).join(', ')}`);
      return;
    }
    const allocated = selected.reduce((sum, selection) => sum + selection.amount, 0);
    if (requiredAmount > 0 && Math.abs(allocated - requiredAmount) > 0.01) {
      toast.error(allocated < requiredAmount
        ? `${INR(requiredAmount - allocated)} is still left to allocate`
        : `Allocation exceeds the required amount by ${INR(allocated - requiredAmount)}`);
      return;
    }

    onSave({ budgetId: selectedBudget!.budget_id, budgetName: selectedBudget!.budget_name, lineItems: selected });
    onClose();
  };

  const checkedCount = Object.values(lineItemSelections).filter((v) => v.checked).length;
  const totalAllocated = lineItems
    .filter((li) => lineItemSelections[li.line_item_id]?.checked)
    .reduce((s, li) => s + (lineItemSelections[li.line_item_id]?.amount ?? 0), 0);
  const balanceToChoose = Math.max(requiredAmount - totalAllocated, 0);
  const excessAllocated = Math.max(totalAllocated - requiredAmount, 0);
  const allocationComplete = requiredAmount > 0 && Math.abs(totalAllocated - requiredAmount) <= 0.01;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="flex max-h-[94vh] w-[96vw] max-w-[1400px] flex-col overflow-hidden rounded-2xl border-0 bg-[#f6f8fa] p-0 font-sans shadow-2xl [&>button]:right-5 [&>button]:top-5 [&>button]:text-white/70 [&>button:hover]:text-white">
        <DialogHeader className="shrink-0 bg-[#0D3A35] px-6 py-5 pr-16 text-left">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-white">{step === 1 ? 'Select Budget' : 'Allocate Budget Line Items'}</DialogTitle>
              <p className="mt-1 text-sm font-medium text-white/65">Link the Service Requisition value to approved and available budget lines.</p>
            </div>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-white/80">
              Step {step} of 2
            </span>
          </div>
        </DialogHeader>

        {step === 1 && (
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="mb-5 rounded-2xl border border-[#147D6F]/15 bg-[#E9F3F0] px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.08em] text-[#0D3A35]">Approved budgets</p>
              <p className="mt-1 text-xs text-slate-600">Choose one budget to view its available line-item balances.</p>
            </div>
            {budgetsLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-[#147D6F]" /><span className="ml-2 text-xs text-slate-500">Loading budgets…</span></div>
            ) : budgetsError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 py-10 text-center text-xs font-semibold text-rose-600">{budgetsError}</div>
            ) : budgets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-xs text-slate-400">No approved budgets found</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
              {budgets.map((b) => (
                <button key={b.budget_id} type="button" onClick={() => { setSelectedBudget(b); setStep(2); }}
                  className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#147D6F]/40 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-sm font-black text-slate-800 group-hover:text-[#0D3A35]">{b.budget_name}</p><p className="mt-1 text-xs text-slate-400">{b.crop_season} · FY {b.financial_year_start}–{b.financial_year_end}</p></div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">{b.status}</span>
                  </div>
                  <p className="mt-4 text-[11px] font-bold text-[#147D6F]">View line-item balances →</p>
                </button>
              ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && selectedBudget && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setStep(1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition hover:border-[#147D6F]/30 hover:bg-[#E9F3F0] hover:text-[#0D3A35]">← Back</button>
                <div><p className="text-sm font-black text-slate-800">{selectedBudget.budget_name}</p><p className="mt-0.5 text-xs text-slate-400">{selectedBudget.crop_season} · FY {selectedBudget.financial_year_start}–{selectedBudget.financial_year_end}</p></div>
              </div>
              <span className="rounded-full bg-slate-200/70 px-3 py-1.5 text-[11px] font-bold text-slate-600">{checkedCount} line{checkedCount === 1 ? '' : 's'} selected</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#147D6F]/20 bg-[#E9F3F0] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#147D6F]">Amount to allocate</p>
                <p className="mt-1 text-lg font-black text-[#0D3A35]">{INR(requiredAmount)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Allocated</p>
                <p className="mt-1 text-lg font-black text-slate-800">{INR(totalAllocated)}</p>
              </div>
              <div className={cn('rounded-2xl border px-4 py-3', excessAllocated > 0 ? 'border-rose-200 bg-rose-50' : allocationComplete ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
                <p className={cn('text-[10px] font-black uppercase tracking-[0.08em]', excessAllocated > 0 ? 'text-rose-600' : allocationComplete ? 'text-emerald-600' : 'text-amber-600')}>{excessAllocated > 0 ? 'Excess allocated' : 'Balance to choose'}</p>
                <p className={cn('mt-1 text-lg font-black', excessAllocated > 0 ? 'text-rose-700' : allocationComplete ? 'text-emerald-700' : 'text-amber-700')}>{INR(excessAllocated > 0 ? excessAllocated : balanceToChoose)}</p>
              </div>
            </div>

            {lineItemsLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-green-600" /><span className="text-xs text-gray-500 ml-2">Loading line items…</span></div>
            ) : lineItemsError ? (
              <div className="text-xs text-red-500 text-center py-10">{lineItemsError}</div>
            ) : lineItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-xs text-slate-400">No line items found for this budget</div>
            ) : (
              <div className="max-h-[430px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-[1340px] w-full border-collapse font-sans text-xs">
                  <thead>
                    <tr className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur">
                      <th className="w-10 border-b border-slate-200 px-2 py-3" />
                      {['Line #', 'Category', 'Line Item', 'UoM', 'Qty / Acre', 'Acres', 'Total Qty', 'Rate / Unit', 'Budget Value', 'Current Balance', 'Amount to Allocate *'].map((h) => (
                        <th key={h} className={cn('whitespace-nowrap border-b border-slate-200 px-3 py-3 font-bold uppercase tracking-[0.035em] text-slate-500', ['Qty / Acre', 'Acres', 'Total Qty', 'Rate / Unit', 'Budget Value', 'Current Balance', 'Amount to Allocate *'].includes(h) ? 'text-right' : 'text-left')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, idx) => {
                      const sel = lineItemSelections[li.line_item_id];
                      const isChecked = sel?.checked ?? false;
                      const currentBalance = budgetLineCurrentBalance(li);
                      const balanceAfterAllocation = Math.max(currentBalance - (sel?.amount ?? 0), 0);
                      return (
                        <tr key={li.line_item_id} onClick={() => toggleLineItem(li.line_item_id)}
                          className={cn('cursor-pointer border-b border-slate-100 transition-colors', isChecked ? 'bg-[#E9F3F0] hover:bg-[#DCEDE8]' : idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100')}>
                          <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={isChecked} onChange={() => toggleLineItem(li.line_item_id)} className="h-4 w-4 accent-[#147D6F]" />
                          </td>
                          <td className="px-3 py-3 font-semibold tabular-nums text-slate-500">{idx + 1}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{li.category}</td>
                          <td className="min-w-[190px] px-3 py-3 font-bold text-slate-900">{li.line_item}</td>
                          <td className="px-3 py-3 text-center text-slate-600">{li.UoM}</td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-700">{Number(li.quantity_per_acre || 0).toLocaleString('en-IN')}</td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-700">{Number(li.total_acres || 0).toLocaleString('en-IN')}</td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-700">{Number(li.total_quantity || 0).toLocaleString('en-IN')}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-700">{INR(Number(li.rate_per_unit) || 0)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-slate-800">{INR(Number(li.total_value) || 0)}</td>
                          <td className="whitespace-nowrap bg-emerald-50/60 px-3 py-3 text-right"><p className="font-bold tabular-nums text-emerald-700">{INR(currentBalance)}</p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600/60">Available now</p></td>
                          <td className="min-w-[185px] px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            {isChecked ? (
                              <div className="space-y-1.5">
                                <input type="number" onWheel={(e) => e.currentTarget.blur()} min={0} max={currentBalance} step="0.01"
                                  value={sel!.amount === 0 ? '' : sel!.amount}
                                  placeholder="Enter amount"
                                  onChange={(e) => updateAmount(li.line_item_id, Math.max(0, Number(e.target.value)))}
                                  className={cn('h-9 w-full rounded-lg border bg-white px-2.5 text-right font-sans text-xs font-bold tabular-nums outline-none transition focus:ring-2', !sel!.amount ? 'border-amber-300 placeholder:text-amber-400 focus:border-amber-400 focus:ring-amber-200' : sel!.amount > currentBalance ? 'border-rose-400 text-rose-700 focus:ring-rose-200' : 'border-[#147D6F]/40 text-[#0D3A35] focus:border-[#147D6F] focus:ring-[#147D6F]/15')}
                                />
                                <p className={cn('text-[9px] font-bold', sel!.amount > currentBalance ? 'text-rose-600' : 'text-slate-400')}>{sel!.amount > currentBalance ? `Exceeds by ${INR(sel!.amount - currentBalance)}` : `Balance after: ${INR(balanceAfterAllocation)}`}</p>
                              </div>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-300">Select line</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {checkedCount > 0 && (
                    <tfoot>
                      <tr className="sticky bottom-0 border-t-2 border-[#147D6F]/30 bg-[#E9F3F0]">
                        <td colSpan={11} className="px-3 py-3 text-right text-xs font-black text-slate-700">
                          {checkedCount} line{checkedCount !== 1 ? 's' : ''} selected · Total allocation
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-extrabold tabular-nums text-[#0D3A35]">
                          {totalAllocated > 0 ? INR(totalAllocated) : <span className="text-amber-600">Enter amounts ↑</span>}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-6 py-4 sm:items-center sm:justify-between">
          <div className="mr-auto text-left">
            {step === 2 && (
              <p className={cn('text-xs font-bold', allocationComplete ? 'text-emerald-600' : excessAllocated > 0 ? 'text-rose-600' : 'text-slate-400')}>
                {allocationComplete ? '✓ Required amount fully allocated' : excessAllocated > 0 ? `Reduce allocation by ${INR(excessAllocated)}` : requiredAmount <= 0 ? 'Enter the Service Requisition value before allocating a budget.' : `${INR(balanceToChoose)} remains to be allocated.`}
              </p>
            )}
          </div>
          <Button variant="outline" className="rounded-xl border-slate-200 px-5 font-bold text-slate-600" onClick={onClose}>Cancel</Button>
          {step === 2 && (
            <Button className="rounded-xl bg-[#0D3A35] px-5 font-black text-white hover:bg-[#092b27]" onClick={handleSave} disabled={checkedCount === 0 || lineItemsLoading || !allocationComplete}>
              Save Selection{checkedCount > 0 ? ` (${checkedCount})` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────
// SPR PREVIEW — read-only document view
// ─────────────────────────────────────────────────────────────
const SprPreview = ({ record }: { record: WorkOrderRecord }) => {
  const rows = record.serviceRows ?? [];
  const subtotal = rows.reduce((s, r) => s + r.approxValue, 0);
  const gstTotal = rows.reduce((s, r) => s + r.gstAmount, 0);
  const total = subtotal + gstTotal;

  const C: React.CSSProperties = { border: '1px solid #000', padding: '3px 5px', verticalAlign: 'middle' };
  const TH: React.CSSProperties = { ...C, background: '#f0f0f0', fontWeight: 700, textAlign: 'center', fontSize: '8px', whiteSpace: 'pre-line', lineHeight: '1.2', padding: '3px 2px' };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#000', width: '100%' }}>
      {/* Header */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2px' }}>
        <tbody>
          <tr>
            <td style={{ ...C, width: '28%' }}>
              <div style={{ fontWeight: 700 }}>Department</div>
              <div>{record.plant || '—'}</div>
            </td>
            <td style={{ ...C, width: '44%', textAlign: 'center', fontWeight: 700, fontSize: '13px', textDecoration: 'underline' }}>
              SERVICE PURCHASE REQUISITION (SPR)
            </td>
            <td style={{ ...C, width: '28%' }}>
              <div><span style={{ fontWeight: 700 }}>SPR Date:</span> {record.sprDate || '—'}</div>
              <div><span style={{ fontWeight: 700 }}>SR No:</span> {record.sprNo || '—'}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Area / Function / Nature */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2px' }}>
        <tbody>
          {[
            ['Service Category', record.areaOfService || '—'],
            ['Service / Activity', record.func || '—'],
            ['Engagement Type', record.natureOfService || '—'],
          ].map(([label, value]) => (
            <tr key={label}>
              <td style={{ ...C, width: '50%', fontWeight: 700 }}>{label}</td>
              <td style={{ ...C, width: '50%' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Items table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '900px' }}>
          <thead>
            <tr>
              {['Sr.', 'Service\nDescription', 'UOM', 'Qty', 'Start\nDate', 'Duration', 'Completion', 'Validity', 'Service\nSource', 'Approx\nValue (₹)', 'GST\n%', 'GST\nAmt', 'Proposed\nVendors', 'Prev\nWO', 'Remarks'].map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.srNo}>
                <td style={{ ...C, textAlign: 'center' }}>{row.srNo}</td>
                <td style={C}>{row.serviceDescription}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.uom}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.quantity}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.startDate}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.duration}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.completionDate}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.validity}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.servicesFrom}</td>
                <td style={{ ...C, textAlign: 'right' }}>{INR(row.approxValue)}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.gstPercent}%</td>
                <td style={{ ...C, textAlign: 'right' }}>{INR(row.gstAmount)}</td>
                <td style={C}>{row.proposedVendors}</td>
                <td style={C}>{row.previousWO}</td>
                <td style={C}>{row.remarks}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={15} style={{ ...C, textAlign: 'center', color: '#999' }}>No service rows</td>
              </tr>
            )}
            <tr>
              <td colSpan={9} style={{ ...C, textAlign: 'right', fontWeight: 700 }}>Sub-Total</td>
              <td colSpan={6} style={{ ...C, textAlign: 'right', fontWeight: 700 }}>{INR(subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={9} style={{ ...C, textAlign: 'right', fontWeight: 700 }}>GST</td>
              <td colSpan={6} style={{ ...C, textAlign: 'right', fontWeight: 700 }}>{INR(gstTotal)}</td>
            </tr>
            <tr>
              <td colSpan={9} style={{ ...C, textAlign: 'right', fontWeight: 700, fontSize: '11px' }}>Total</td>
              <td colSpan={6} style={{ ...C, textAlign: 'right', fontWeight: 700, fontSize: '11px' }}>{INR(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Signature section */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
        <thead>
          <tr>
            {['Sai Bio Energy, Bikaner', 'Name / ID', 'Signature', 'Date', 'Remarks / Notes'].map((h) => (
              <th key={h} style={TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...C, height: '40px', fontSize: '9px', verticalAlign: 'top', paddingTop: '4px' }}>Indentor Engineer</td>
            <td style={C}>{record.indentedBy || '—'}</td>
            <td style={{ ...C, fontSize: '9px', color: '#555' }}>{record.indentedBySignature || '—'}</td>
            <td style={C}>{record.indentedByTimestamp || record.sprDate || '—'}</td>
            <td style={C}>{record.notes || ''}</td>
          </tr>
          <tr>
            <td style={{ ...C, height: '40px', fontSize: '9px', verticalAlign: 'top', paddingTop: '4px' }}>Department HOD</td>
            <td style={C}>{record.forwardedBy || '—'}</td>
            <td style={{ ...C, fontSize: '9px', color: '#555' }}>{record.forwardedBySignature || '—'}</td>
            <td style={C}></td>
            <td style={C}></td>
          </tr>
          <tr>
            <td style={{ ...C, height: '40px', fontSize: '9px', verticalAlign: 'top', paddingTop: '4px' }}>Plant Head</td>
            <td style={C}>{record.approvedBy || '—'}</td>
            <td style={{ ...C, fontSize: '9px', color: '#555' }}>{record.approvedBySignature || '—'}</td>
            <td style={C}></td>
            <td style={C}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
const WorkOrder = () => {
  const [records, setRecords] = useState<WorkOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WorkOrderRecord['status']>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [previewRecord, setPreviewRecord] = useState<WorkOrderRecord | null>(null);
  const [attachingMap, setAttachingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${BASE_URL}/purchase_flow/get_indents`);
        if (!res.ok) throw new Error('Failed to fetch indents');
        const json = await res.json();
        const sprs: WorkOrderRecord[] = (json.indents || [])
          .filter((r: any) => r.indent_type === 'SPR')
          .map((r: any) => {
            const date = r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '';
            const hasFwd = Boolean(r.forwarded_by?.signature);
            const hasApproved = Boolean(r.approved_by?.signature);
            const status: WorkOrderRecord['status'] = hasApproved ? 'Approved' : hasFwd ? 'Submitted' : 'Draft';
            const rawServiceRows: any[] = r.indent_data?.item_row || [];
            const serviceRows: ApiServiceRow[] = rawServiceRows.map((it: any) => ({
              srNo: it.sr_no ?? 1,
              serviceDescription: it.service_description ?? '',
              uom: it.uom ?? '',
              quantity: it.quantity ?? 0,
              startDate: it.start_date_of_contract ?? '',
              duration: it.duration_of_contract ?? '',
              completionDate: it.completion_date_of_contract ?? '',
              validity: it.validity_of_contract ?? '',
              servicesFrom: it.services_required_from ?? '',
              approxValue: it.approx_value_of_services ?? 0,
              gstPercent: it.gst_percentage ?? 0,
              gstAmount: it.gst_amount ?? 0,
              proposedVendors: it.proposed_vendors ?? '',
              previousWO: it.previous_wo_details ?? '',
              remarks: it.remarks ?? '',
            }));
            const budgetData = r.budget_head ?? r.indent_data?.budget_head;
            const budgetLines = Array.isArray(budgetData?.line_item) ? budgetData.line_item : [];
            const budgetHead = budgetLines.map((line: any) => [
              budgetData?.budget_name || budgetData?.budget_id,
              line?.category,
              line?.line_item,
              line?.allocated_amount ? INR(Number(line.allocated_amount)) : '',
            ].filter(Boolean).join(' | ')).join('\n');
            return {
              id: r.pr_number ?? date,
              sprNo: r.pr_number ?? '',
              sprDate: r.indent_data?.requisition_date ?? rawServiceRows[0]?.requisition_date ?? date,
              plant: r.indent_data?.project
                ?? r.project
                ?? r.indent_data?.department
                ?? r.department
                ?? rawServiceRows[0]?.requisition_department
                ?? '',
              areaOfService: r.indent_data?.area_of_service ?? '',
              func: r.indent_data?.function ?? '',
              natureOfService: r.indent_data?.name_of_service ?? '',
              status,
              createdAt: r.created_at ?? '',
              notes: r.notes ?? '',
              budgetHead,
              indentedBy: r.indented_by?.name_id ?? '',
              indentedBySignature: r.indented_by?.signature ?? '',
              indentedByTimestamp: r.indented_by?.timestamp
                ? new Date(r.indented_by.timestamp).toISOString().slice(0, 10)
                : '',
              forwardedBy: r.forwarded_by?.name_id ?? '',
              forwardedBySignature: r.forwarded_by?.signature ?? '',
              forwardedByTimestamp: r.forwarded_by?.timestamp
                ? new Date(r.forwarded_by.timestamp).toISOString().slice(0, 10)
                : '',
              approvedBy: r.approved_by?.name_id ?? '',
              approvedBySignature: r.approved_by?.signature ?? '',
              approvedByTimestamp: r.approved_by?.timestamp
                ? new Date(r.approved_by.timestamp).toISOString().slice(0, 10)
                : '',
              serviceRows,
            };
          });
        setRecords(sprs);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load SPRs');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [refreshTick]);

  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => {
      const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
      const matchesQuery = !needle || [
        record.sprNo,
        record.plant,
        record.areaOfService,
        record.func,
        record.natureOfService,
        ...(record.serviceRows || []).map((row) => row.serviceDescription),
      ].some((value) => value?.toLowerCase().includes(needle));
      return matchesStatus && matchesQuery;
    });
  }, [query, records, statusFilter]);

  const overview = useMemo(() => ({
    total: records.length,
    draft: records.filter((record) => record.status === 'Draft').length,
    submitted: records.filter((record) => record.status === 'Submitted').length,
    approved: records.filter((record) => record.status === 'Approved').length,
    value: records.reduce((sum, record) => sum + (record.serviceRows || []).reduce(
      (rowSum, row) => rowSum + Number(row.approxValue || 0) + Number(row.gstAmount || 0),
      0,
    ), 0),
  }), [records]);

  const attachSign = async (record: WorkOrderRecord) => {
    if (!record.sprNo) { toast.error('Missing SR number'); return; }
    const p = readUserProfile();
    const staffName = p.name.trim();
    const staffRole = p.role.trim();
    if (!staffName) { toast.error('No user profile set. Configure your name in Admin Ops → Configure.'); return; }
    const nameId = staffRole ? `${staffName} / ${staffRole}` : staffName;
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const ymd = now.toISOString().slice(0, 10);
    const signature = `Approver | ${staffName} | ${hhmm} | ${ymd}`;

    setAttachingMap((s) => ({ ...s, [record.id]: true }));
    try {
      await indentByAttachSignApi({ pr_number: record.sprNo, name_id: nameId, signature });
      const updated: Partial<WorkOrderRecord> = {
        indentedBy: nameId,
        indentedBySignature: signature,
        indentedByTimestamp: ymd,
        status: 'Submitted',
      };
      setRecords((prev) => prev.map((x) => x.id === record.id ? { ...x, ...updated } : x));
      setPreviewRecord((prev) => prev?.id === record.id ? { ...prev, ...updated } : prev);
      toast.success(`Signature attached for ${staffName}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to attach signature');
    } finally {
      setAttachingMap((s) => ({ ...s, [record.id]: false }));
    }
  };

  const printRecord = async (record: WorkOrderRecord) => {
    try {
      await printWorkRequisitionPdf(recordToPdfData(record));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to prepare the SPR PDF');
    }
  };

  const statCards = [
    { label: 'Total Requisitions', value: overview.total, icon: FileText, tone: 'bg-slate-100 text-slate-700' },
    { label: 'Draft', value: overview.draft, icon: Clock3, tone: 'bg-amber-50 text-amber-700' },
    { label: 'Awaiting Approval', value: overview.submitted, icon: ClipboardCheck, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Approved', value: overview.approved, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Estimated Value', value: INR(overview.value), icon: IndianRupee, tone: 'bg-[#E9F3F0] text-[#0D3A35]' },
  ];

  return (
    <div className="min-h-screen space-y-6 bg-slate-50/70 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0D3A35] text-white shadow-sm">
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#147D6F]">Procurement · Work Order</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Service Requisition</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Raise, track and sign Service Purchase Requisitions before they enter the Work Order process.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start lg:self-auto">
          <Button
            variant="outline"
            onClick={() => { setLoading(true); setRefreshTick((value) => value + 1); }}
            disabled={loading}
            className="h-10 rounded-xl border-slate-200 bg-white px-3 text-slate-600 shadow-sm hover:bg-slate-50"
            aria-label="Refresh requisitions"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button onClick={() => setModalOpen(true)} className="h-10 gap-2 rounded-xl bg-[#0D3A35] px-4 text-white shadow-sm hover:bg-[#14554D]">
            <Plus className="h-4 w-4" /> Create Service Requisition
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statCards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
              </div>
              <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tone)}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Requisition Register</h2>
            <p className="mt-0.5 text-xs text-slate-500">{filteredRecords.length} of {records.length} requisitions shown</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block min-w-0 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search SR, department or service…"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#147D6F] focus:bg-white focus:ring-2 focus:ring-[#147D6F]/10"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | WorkOrderRecord['status'])}
              className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-[#147D6F] focus:ring-2 focus:ring-[#147D6F]/10"
            >
              <option value="all">All statuses</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Awaiting approval</option>
              <option value="Approved">Approved</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="h-7 w-7 animate-spin text-[#147D6F]" />
            <p className="text-sm font-medium">Loading service requisitions…</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-5 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <FileText className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">{records.length ? 'No matching requisitions' : 'No service requisitions yet'}</p>
              <p className="mt-1 text-xs text-slate-500">{records.length ? 'Try changing the search or status filter.' : 'Create an SPR to begin the Work Order process.'}</p>
            </div>
            {!records.length && (
              <Button onClick={() => setModalOpen(true)} className="mt-1 gap-2 rounded-xl bg-[#0D3A35] text-white hover:bg-[#14554D]">
                <Plus className="h-4 w-4" /> Create Requisition
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full text-sm">
              <thead className="bg-[#0D3A35] text-white">
                <tr>
                  {['SR No.', 'Date', 'Department', 'Service Items', 'Engagement Type', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRecords.map((r) => {
                  const alreadySigned = Boolean(r.indentedBySignature);
                  const isAttaching = Boolean(attachingMap[r.id]);
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-5 py-4 font-semibold text-[#0D3A35]">{r.sprNo || '—'}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">{r.sprDate || '—'}</td>
                      <td className="max-w-52 px-5 py-4 text-slate-600">
                        <span className={cn('line-clamp-2', !r.plant && 'italic text-slate-400')}>{r.plant || 'Not Recorded'}</span>
                      </td>
                      <td className="min-w-[260px] px-5 py-4 text-slate-600">
                        {r.serviceRows?.length ? (
                          <div className="space-y-1.5">
                            {r.serviceRows.slice(0, 3).map((item) => (
                              <div key={`${r.id}-${item.srNo}`} className="flex items-start gap-2">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#E9F3F0] text-[10px] font-black text-[#0D3A35]">{item.srNo}</span>
                                <div className="min-w-0">
                                  <p className="line-clamp-1 font-semibold text-slate-700">{item.serviceDescription || 'Unnamed service'}</p>
                                  <p className="text-[11px] text-slate-400">{Number(item.quantity || 0).toLocaleString('en-IN')} {item.uom || ''}</p>
                                </div>
                              </div>
                            ))}
                            {r.serviceRows.length > 3 && <p className="pl-7 text-[11px] font-bold text-[#147D6F]">+{r.serviceRows.length - 3} more item{r.serviceRows.length - 3 === 1 ? '' : 's'}</p>}
                          </div>
                        ) : (
                          <span className="italic text-slate-400">No items recorded</span>
                        )}
                      </td>
                      <td className="max-w-60 px-5 py-4 text-slate-600"><span className="line-clamp-2">{r.natureOfService || '—'}</span></td>
                      <td className="px-5 py-4">
                        <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
                          r.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                          r.status === 'Submitted' ? 'bg-blue-50 text-blue-700 ring-blue-200' :
                          'bg-amber-50 text-amber-700 ring-amber-200'
                        )}>{r.status}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-[#147D6F]/30 hover:bg-[#E9F3F0] hover:text-[#0D3A35]"
                            onClick={() => setPreviewRecord(r)}
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                          <button
                            className={cn(
                              'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition',
                              alreadySigned
                                ? 'cursor-default bg-slate-100 text-slate-400'
                                : 'bg-[#0D3A35] text-white hover:bg-[#14554D]',
                            )}
                            onClick={() => { if (!alreadySigned && !isAttaching) void attachSign(r); }}
                            disabled={alreadySigned || isAttaching}
                          >
                            {isAttaching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                            {alreadySigned ? 'Signed' : isAttaching ? 'Attaching…' : 'Attach Sign'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SPR Preview Dialog */}
      <Dialog open={Boolean(previewRecord)} onOpenChange={(v) => { if (!v) setPreviewRecord(null); }}>
        <DialogContent className="flex max-h-[96vh] w-[96vw] max-w-[1040px] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-slate-100 p-0 shadow-2xl [&>button]:right-5 [&>button]:top-5 [&>button]:text-white/70 [&>button:hover]:text-white">
          <DialogHeader className="shrink-0 bg-[#0D3A35] px-6 py-5 pr-16 text-left text-white">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200/80">Procurement · Service Requisition</p>
                <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-white">SR Preview</DialogTitle>
                <p className="mt-1 text-xs font-medium text-white/65">Review the branded A4 document before printing or attaching your signature.</p>
              </div>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/85">{previewRecord?.sprNo}</span>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto bg-slate-200/60 p-4 sm:p-6">
            {previewRecord && (
              <div className="mx-auto w-fit origin-top" style={{ zoom: 0.78 }}>
                <ServiceRequisitionPdfPreview data={recordToPdfData(previewRecord)} />
              </div>
            )}
          </div>
          {previewRecord && (
            <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
              <div className="flex w-full justify-end gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => setPreviewRecord(null)}>Close</Button>
                <Button variant="outline" className="gap-2 rounded-xl border-slate-200 font-semibold text-[#0D3A35]" onClick={() => void printRecord(previewRecord)}>
                  <Printer className="h-4 w-4" /> Print PDF
                </Button>
                <Button
                  className="gap-2 rounded-xl bg-[#0D3A35] text-white hover:bg-[#14554D]"
                  disabled={Boolean(previewRecord.indentedBySignature) || Boolean(attachingMap[previewRecord.id])}
                  onClick={() => void attachSign(previewRecord)}
                >
                  <Paperclip className="w-4 h-4" />
                  {previewRecord.indentedBySignature
                    ? 'Already Signed'
                    : attachingMap[previewRecord.id]
                    ? 'Attaching…'
                    : 'Attach Signature'}
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {modalOpen && (
        <WorkOrderModal
          existingRecords={records}
          onClose={() => setModalOpen(false)}
          onSave={(rec) => { setRecords((p) => [rec, ...p]); setModalOpen(false); }}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// WORK ORDER MODAL — live SPR document with inline editing
// ─────────────────────────────────────────────────────────────
const WorkOrderModal = ({
  existingRecords,
  onClose,
  onSave,
}: {
  existingRecords: WorkOrderRecord[];
  onClose: () => void;
  onSave: (rec: WorkOrderRecord) => void;
}) => {
  const [form, setForm] = useState<WorkOrderForm>(() => {
    const initialForm = emptyForm();
    return {
      ...initialForm,
      sprNo: nextServiceRequisitionNo(existingRecords, initialForm.sprDate),
    };
  });
  const [saving, setSaving] = useState(false);
  const [budgetPickerOpen, setBudgetPickerOpen] = useState(false);
  const [budgetHeadSelection, setBudgetHeadSelection] = useState<BudgetHeadSelection | null>(null);
  const [customActivity, setCustomActivity] = useState('');
  const [customUomRows, setCustomUomRows] = useState<Set<string>>(new Set());

  const set = (k: keyof Omit<WorkOrderForm, 'rows'>, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const setRow = (id: string, k: keyof ServiceRow, v: string) =>
    setForm((p) => ({ ...p, rows: p.rows.map((r) => r.id === id ? { ...r, [k]: v } : r) }));

  // Start/completion date changes recompute Duration; the field stays editable afterward.
  const updateRowDate = (id: string, key: 'startDate' | 'completionDate', value: string) =>
    setForm((p) => ({
      ...p,
      rows: p.rows.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, [key]: value };
        const computed = computeDurationLabel(next.startDate, next.completionDate);
        return computed ? { ...next, duration: computed } : next;
      }),
    }));

  // Quantity/Rate changes recompute Approx. Service Value; the field stays editable afterward.
  const updateRowQuantityOrRate = (id: string, key: 'quantity' | 'ratePerUnit', value: string) =>
    setForm((p) => ({
      ...p,
      rows: p.rows.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, [key]: value };
        const quantity = Number(next.quantity);
        const rate = Number(next.ratePerUnit);
        return (next.quantity && next.ratePerUnit && !Number.isNaN(quantity) && !Number.isNaN(rate))
          ? { ...next, approxValue: String(quantity * rate) }
          : next;
      }),
    }));

  const addRow = () =>
    setForm((p) => ({ ...p, rows: [...p.rows, emptyRow()] }));

  const removeRow = (id: string) => {
    setForm((p) => ({ ...p, rows: p.rows.filter((r) => r.id !== id) }));
    setCustomUomRows((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const { subtotal, gst, total } = calcTotals(form.rows);
  const resolvedActivity = form.func === 'Other / Custom Function' ? customActivity.trim() : form.func;
  const livePdfData = useMemo(
    () => formToPdfData({ ...form, func: resolvedActivity }, budgetHeadSelection),
    [budgetHeadSelection, form, resolvedActivity],
  );

  const handlePrint = async () => {
    try {
      await printWorkRequisitionPdf(formToPdfData({ ...form, func: resolvedActivity }, budgetHeadSelection));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to prepare the SPR PDF');
    }
  };

  const handleSave = async () => {
    if (!form.plant.trim()) return toast.error('Department is required');
    if (!form.sprNo.trim()) return toast.error('SR No. is required');
    if (!form.sprDate) return toast.error('SPR date is required');
    if (!form.areaOfService.trim()) return toast.error('Service category is required');
    if (!form.func) return toast.error('Service / activity is required');
    if (form.func === 'Other / Custom Function' && !customActivity.trim()) return toast.error('Enter the custom service / activity');
    if (!form.natureOfService) return toast.error('Engagement type is required');
    const activeRows = form.rows.filter((row) => row.serviceDescription.trim());
    if (!activeRows.length) return toast.error('Add at least one service description');
    const incompleteRow = activeRows.find((row) => (
      !row.uom.trim() || !Number(row.quantity) || !row.startDate || !row.duration.trim() ||
      !row.completionDate || !row.validity || !row.servicesFrom || !Number(row.approxValue)
    ));
    if (incompleteRow) return toast.error('Complete all required service, contract, scope and value fields');
    setSaving(true);
    try {
      const payload = {
        project: form.plant,
        pr_number: form.sprNo.trim(),
        department: 'PROCUREMENT',
        notes: form.notes,
        indent_type: 'SPR',
        area_of_service: form.areaOfService,
        function: resolvedActivity,
        name_of_service: form.natureOfService,
        item_row: activeRows.map((row, index) => ({
          ...toWorkOrderRow(row, index),
          requisition_department: form.plant.trim(),
          requisition_date: form.sprDate,
        })),
        ...(budgetHeadSelection && {
          budget_head: {
            budget_id: budgetHeadSelection.budgetId,
            line_item: budgetHeadSelection.lineItems.map((li) => ({
              line_item_id: li.id,
              line_item: li.name,
              category: li.category,
              budget_type: li.budgetType,
              uom: li.uom,
              allocated_amount: li.amount,
            })),
          },
        }),
      };

      const res = await fetch(`${BASE_URL}/purchase_flow/create_indent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || data?.detail || `Server responded ${res.status}`);

      toast.success(`Service Requisition ${form.sprNo} saved`);
      onSave({
        id: genId(), sprNo: form.sprNo, sprDate: form.sprDate,
        plant: form.plant, areaOfService: form.areaOfService,
        func: resolvedActivity, natureOfService: form.natureOfService, status: 'Draft',
        createdAt: new Date().toISOString(),
        notes: form.notes,
        budgetHead: budgetSelectionLabel(budgetHeadSelection),
        serviceRows: activeRows.map((row, index) => {
          const apiRow = toWorkOrderRow(row, index);
          return {
            srNo: apiRow.sr_no,
            serviceDescription: apiRow.service_description,
            uom: apiRow.uom,
            quantity: apiRow.quantity,
            startDate: apiRow.start_date_of_contract,
            duration: apiRow.duration_of_contract,
            completionDate: apiRow.completion_date_of_contract,
            validity: apiRow.validity_of_contract,
            servicesFrom: apiRow.services_required_from,
            approxValue: apiRow.approx_value_of_services,
            gstPercent: apiRow.gst_percentage,
            gstAmount: apiRow.gst_amount,
            proposedVendors: apiRow.proposed_vendors,
            previousWO: apiRow.previous_wo_details,
            remarks: apiRow.remarks,
          };
        }),
      });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = 'mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#147D6F] focus:ring-2 focus:ring-[#147D6F]/10';
  const labelClass = 'text-xs font-bold text-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4">
      <div className="flex max-h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-[#f6f8fa] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-4 bg-[#0D3A35] px-5 py-4 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black sm:text-xl">Create Service Requisition</h2>
              <p className="mt-0.5 truncate text-xs font-medium text-white/65">Record the complete Service Purchase Requisition before approval routing.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void handlePrint()} className="hidden gap-1.5 rounded-xl border-white/20 bg-white/10 text-xs font-bold text-white hover:bg-white/20 hover:text-white sm:inline-flex">
              <Printer className="h-3.5 w-3.5" /> Print PDF
            </Button>
            <button onClick={onClose} className="rounded-xl p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close service requisition">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[.95fr_1.05fr]">
          <div className="min-h-0 space-y-5 overflow-y-auto p-4 sm:p-6 lg:order-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-[#147D6F]" />
              <h3 className="text-sm font-black uppercase tracking-wider text-[#0D3A35]">Requisition Details</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-1">
                <label className={labelClass}>Department *</label>
                <input value={form.plant} onChange={(event) => set('plant', event.target.value)} className={fieldClass} placeholder="Enter department name" />
              </div>
              <div>
                <label className={labelClass}>SR No. *</label>
                <input
                  value={form.sprNo}
                  readOnly
                  aria-readonly="true"
                  className={cn(fieldClass, 'cursor-not-allowed bg-slate-50 font-semibold text-[#0D3A35]')}
                  title="Automatically generated from the financial year and next available sequence"
                />
                <p className="mt-1.5 text-[11px] font-medium text-slate-400">Auto-generated using the requisition financial year.</p>
              </div>
              <div>
                <label className={labelClass}>Requisition Date *</label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 mt-0.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={form.sprDate}
                    onChange={(event) => {
                      const sprDate = event.target.value;
                      setForm((current) => ({
                        ...current,
                        sprDate,
                        sprNo: nextServiceRequisitionNo(existingRecords, sprDate),
                      }));
                    }}
                    className={cn(fieldClass, 'pl-9')}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-black uppercase tracking-wider text-[#0D3A35]">Service Classification</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className={labelClass}>Service Category *</label>
                <select
                  value={form.areaOfService}
                  onChange={(event) => {
                    setForm((previous) => ({ ...previous, areaOfService: event.target.value, func: '' }));
                    setCustomActivity('');
                  }}
                  className={fieldClass}
                >
                  <option value="">Select service category</option>
                  {SERVICE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Service / Activity *</label>
                <select value={form.func} onChange={(event) => set('func', event.target.value)} className={fieldClass} disabled={!form.areaOfService}>
                  <option value="">{form.areaOfService ? 'Select service / activity' : 'Select category first'}</option>
                  {(SERVICE_ACTIVITIES[form.areaOfService] || []).map((activity) => <option key={activity} value={activity}>{activity}</option>)}
                  {form.areaOfService && form.areaOfService !== 'Other Services' && <option value="Other / Custom Function">Other / Custom Function</option>}
                </select>
                {form.func === 'Other / Custom Function' && (
                  <input value={customActivity} onChange={(event) => setCustomActivity(event.target.value)} className={fieldClass} placeholder="Enter custom service / activity" autoFocus />
                )}
              </div>
              <div>
                <label className={labelClass}>Engagement Type *</label>
                <select value={form.natureOfService} onChange={(event) => set('natureOfService', event.target.value)} className={fieldClass}>
                  <option value="">Select engagement type</option>
                  {ENGAGEMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-[#0D3A35]">Services Required</h3>
                <p className="mt-1 text-xs text-slate-500">Capture contract schedule, sourcing and commercial details for every service.</p>
              </div>
              <Button type="button" variant="outline" onClick={addRow} className="gap-2 rounded-xl border-[#147D6F]/30 font-bold text-[#0D3A35] hover:bg-[#E9F3F0]">
                <Plus className="h-4 w-4" /> Add Service
              </Button>
            </div>

            {form.rows.map((row, index) => (
              <article key={row.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0D3A35] text-xs font-black text-white">{index + 1}</span>
                    <div><p className="text-sm font-black text-slate-800">Service Line {index + 1}</p><p className="text-[11px] text-slate-400">All fields marked * are required</p></div>
                  </div>
                  <button type="button" onClick={() => removeRow(row.id)} disabled={form.rows.length === 1} className="rounded-lg p-2 text-rose-500 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300" aria-label={`Remove service line ${index + 1}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-5 p-5">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr]">
                    <div><label className={labelClass}>Service Description *</label><input value={row.serviceDescription} onChange={(event) => setRow(row.id, 'serviceDescription', event.target.value)} className={fieldClass} placeholder="Describe the work or service required" /></div>
                    <div>
                      <label className={labelClass}>UoM *</label>
                      {customUomRows.has(row.id) ? (
                        <div className="space-y-2">
                          <input
                            value={row.uom}
                            onChange={(event) => setRow(row.id, 'uom', event.target.value)}
                            className={fieldClass}
                            placeholder="Enter custom UoM"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setCustomUomRows((prev) => {
                                const next = new Set(prev);
                                next.delete(row.id);
                                return next;
                              });
                              setRow(row.id, 'uom', '');
                            }}
                            className="flex h-9 w-full items-center justify-center rounded-lg border border-slate-200 px-2 text-[11px] font-bold text-slate-500 transition hover:border-[#147D6F]/30 hover:bg-[#E9F3F0] hover:text-[#0D3A35]"
                          >
                            Choose from list
                          </button>
                        </div>
                      ) : (
                        <select
                          value={(UOM_OPTIONS as readonly string[]).includes(row.uom) ? row.uom : ''}
                          onChange={(event) => {
                            if (event.target.value === 'Other') {
                              setCustomUomRows((prev) => new Set(prev).add(row.id));
                              setRow(row.id, 'uom', '');
                            } else {
                              setRow(row.id, 'uom', event.target.value);
                            }
                          }}
                          className={fieldClass}
                        >
                          <option value="">Select UoM</option>
                          {UOM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                          <option value="Other">Other</option>
                        </select>
                      )}
                    </div>
                    <div><label className={labelClass}>Quantity *</label><input type="number" onWheel={(e) => e.currentTarget.blur()} min="0" step="any" value={row.quantity} onChange={(event) => updateRowQuantityOrRate(row.id, 'quantity', event.target.value)} className={fieldClass} placeholder="0" /></div>
                    <div><label className={labelClass}>Rate / Unit</label><input type="number" onWheel={(e) => e.currentTarget.blur()} min="0" step="any" value={row.ratePerUnit} onChange={(event) => updateRowQuantityOrRate(row.id, 'ratePerUnit', event.target.value)} className={fieldClass} placeholder="0.00" /></div>
                  </div>

                  <div>
                    <p className="mb-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Contract Schedule</p>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div><label className={labelClass}>Start Date *</label><input type="date" value={row.startDate} onChange={(event) => updateRowDate(row.id, 'startDate', event.target.value)} className={fieldClass} /></div>
                      <div><label className={labelClass}>Duration *</label><input value={row.duration} onChange={(event) => setRow(row.id, 'duration', event.target.value)} className={fieldClass} placeholder="Auto-calculated from the dates, or type your own" /></div>
                      <div><label className={labelClass}>Completion Date *</label><input type="date" value={row.completionDate} onChange={(event) => updateRowDate(row.id, 'completionDate', event.target.value)} className={fieldClass} /></div>
                      <div><label className={labelClass}>Contract Validity *</label><input type="date" value={row.validity} onChange={(event) => setRow(row.id, 'validity', event.target.value)} className={fieldClass} /></div>
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Sourcing</p>
                    <div className="max-w-xl">
                      <div>
                        <label className={labelClass}>Service Source *</label>
                        <select value={row.servicesFrom} onChange={(event) => setRow(row.id, 'servicesFrom', event.target.value)} className={fieldClass}>
                          <option value="">Select source</option>
                          {SERVICE_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Commercial &amp; Reference Details</p>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div><label className={labelClass}>Approx. Service Value *</label><input type="number" onWheel={(e) => e.currentTarget.blur()} min="0" step="0.01" value={row.approxValue} onChange={(event) => setRow(row.id, 'approxValue', event.target.value)} className={fieldClass} placeholder="0.00" /></div>
                      <div><label className={labelClass}>GST % *</label><input type="number" onWheel={(e) => e.currentTarget.blur()} min="0" step="0.01" value={row.gstPercent} onChange={(event) => setRow(row.id, 'gstPercent', event.target.value)} className={fieldClass} /></div>
                      <div><label className={labelClass}>GST Amount</label><div className="mt-1.5 flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-600">{INR(calcRowGst(row))}</div></div>
                      <div><label className={labelClass}>Line Total</label><div className="mt-1.5 flex h-11 items-center rounded-xl bg-[#E9F3F0] px-3 text-sm font-black text-[#0D3A35]">{INR((Number(row.approxValue) || 0) + calcRowGst(row))}</div></div>
                      <div className="sm:col-span-2"><label className={labelClass}>Proposed Vendors / Contractor</label><input value={row.proposedVendors} onChange={(event) => setRow(row.id, 'proposedVendors', event.target.value)} className={fieldClass} placeholder="Enter preferred or proposed vendors" /></div>
                      <div><label className={labelClass}>Previous WO Details</label><input value={row.previousWO} onChange={(event) => setRow(row.id, 'previousWO', event.target.value)} className={fieldClass} placeholder="WO reference, if any" /></div>
                      <div><label className={labelClass}>Line Remarks</label><input value={row.remarks} onChange={(event) => setRow(row.id, 'remarks', event.target.value)} className={fieldClass} placeholder="Line-specific notes" /></div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div><h3 className="text-sm font-black uppercase tracking-wider text-[#0D3A35]">Budget Head</h3><p className="mt-1 text-xs text-slate-500">Link applicable budget lines and allocation amounts.</p></div>
                <Button type="button" variant="outline" onClick={() => setBudgetPickerOpen(true)} className="gap-1.5 rounded-xl border-[#147D6F]/25 bg-[#E9F3F0] font-bold text-[#0D3A35] hover:bg-[#DCEDE8]"><Plus className="h-3.5 w-3.5" />{budgetHeadSelection ? 'Change' : 'Select Budget'}</Button>
              </div>
              {budgetHeadSelection ? (
                <div className="space-y-2 p-4">
                  {budgetHeadSelection.lineItems.map((line) => <div key={line.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs"><div><p className="font-bold text-slate-700">{line.name}</p><p className="mt-0.5 text-slate-400">{budgetHeadSelection.budgetName} · {line.category}</p></div><span className="whitespace-nowrap font-extrabold tabular-nums text-[#0D3A35]">{INR(line.amount)}</span></div>)}
                  <div className="border-t border-slate-100 pt-2 text-right text-xs font-black text-emerald-700">Allocated: {INR(budgetHeadSelection.lineItems.reduce((sum, line) => sum + line.amount, 0))}</div>
                </div>
              ) : <button type="button" onClick={() => setBudgetPickerOpen(true)} className="w-full px-5 py-8 text-sm font-semibold text-slate-400 transition hover:bg-[#E9F3F0]/40 hover:text-[#147D6F]">No budget linked · Click to select</button>}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-wider text-[#0D3A35]">Value Summary</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between text-slate-500"><dt>Subtotal</dt><dd className="font-bold text-slate-700">{INR(subtotal)}</dd></div>
                <div className="flex justify-between text-slate-500"><dt>GST</dt><dd className="font-bold text-slate-700">{INR(gst)}</dd></div>
                <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-black text-[#0D3A35]"><dt>Total SPR Value</dt><dd>{INR(total)}</dd></div>
              </dl>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-wider text-[#0D3A35]">Remarks / Notes</h3>
            <textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} rows={3} className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#147D6F] focus:ring-2 focus:ring-[#147D6F]/10" placeholder="Add requisition-level instructions, justification or approval notes…" />
          </section>
          </div>

          <aside className="hidden min-h-0 overflow-y-auto border-r border-slate-200 bg-slate-100 p-5 lg:order-1 lg:block">
            <div className="sticky top-0 z-10 mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.1em] text-[#0D3A35]">Live SR PDF Preview</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Updates automatically as the requisition is completed.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void handlePrint()} className="h-8 gap-1.5 rounded-lg border-slate-200 text-[11px] font-bold text-[#0D3A35]"><Printer className="h-3.5 w-3.5" /> Print</Button>
            </div>
            <div className="flex justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-200/60 p-3">
              <div className="origin-top" style={{ zoom: 0.78 }}>
                <ServiceRequisitionPdfPreview data={livePdfData} />
              </div>
            </div>
          </aside>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <p className="hidden text-xs font-medium text-slate-400 md:block">The saved SPR will continue through the existing verifier and approver workflow.</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2 rounded-xl border-slate-200 font-bold text-[#0D3A35] sm:hidden" onClick={() => void handlePrint()}><Printer className="h-4 w-4" /> PDF</Button>
            <Button variant="outline" className="rounded-xl border-slate-200 px-5 font-bold" onClick={onClose}>Cancel</Button>
            <Button className="gap-1.5 rounded-xl bg-[#0D3A35] px-6 font-black text-white hover:bg-[#092b27]" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? 'Saving…' : 'Save Service Requisition'}
            </Button>
          </div>
        </div>
      </div>

      <BudgetHeadPickerModal
        open={budgetPickerOpen}
        onClose={() => setBudgetPickerOpen(false)}
        onSave={(sel) => setBudgetHeadSelection(sel)}
        requiredAmount={total}
      />
    </div>
  );
};

export default WorkOrder;
