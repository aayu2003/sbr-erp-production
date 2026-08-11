import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Eye,
  FileCheck2,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/context/AuthContext';
import getBaseUrl from '@/lib/config';
import { cn } from '@/lib/utils';
import { listGrns, type GRNRecord } from '@/lib/grnApi';
import { printInspectionReport } from '@/lib/inspectionReportPdf';
import {
  deleteInspectionReport,
  listInspectionReports,
  nextInspectionCertificateNo,
  saveInspectionReport,
  type InspectionChecklistItem,
  type InspectionReportItem,
  type InspectionReportRecord,
} from '@/lib/inspectionReportStore';
import { readUserProfile } from '@/lib/signatureDiary';

const DEFAULT_CERTIFICATION = 'This is to certify that the materials inspected above have been physically verified against the applicable Purchase Order and Goods Receipt Note and approved.';
const DEFAULT_RECOMMENDATION = 'The inspected materials have been found satisfactory in terms of quantity, quality, workmanship and overall condition. Based on the observations recorded during inspection, the material is accepted.';

const todayIso = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const displayDate = (value: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value || '-';
};

const displayApprovalDateTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const statusLabel = (status: GRNRecord['status']) => ({
  approved: 'Approved',
  pending_approval: 'Pending Approval',
  pending_verification: 'Pending Verification',
  needs_revision: 'Needs Revision',
}[status]);

export const CertificatePreview = ({ report }: { report: InspectionReportRecord }) => {
  const signatories = [
    { title: 'Prepared & Inspected By', name: report.preparedByName, designation: report.preparedByDesignation, approvedAt: '' },
    ...(report.signatoryMode === 'three' ? [{ title: 'Verified By', name: report.verifiedByName, designation: report.verifiedByDesignation, approvedAt: report.adminOpsApproval?.actedAt }] : []),
    { title: 'Approved By', name: report.approvedByName, designation: report.approvedByDesignation, approvedAt: report.financeAdminOpsApproval?.actedAt },
  ];
  return (
    <article className="mx-auto w-full max-w-[900px] bg-white p-4 text-[10px] text-[#334155] shadow-sm sm:p-7">
      <div className="min-h-[1120px] border border-slate-300 px-5 pb-8 pt-5 sm:px-7">
        <header className="text-center"><img src="/3f-logo.png" alt="Sai Bioresources" className="mx-auto h-14 w-auto object-contain"/><h2 className="mt-2 text-lg font-extrabold tracking-wide text-[#142D4C]">SAI BIORESOURCES PRIVATE LIMITED</h2><p className="mt-1 text-[9px] text-slate-500">Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001</p><p className="mt-1 text-[9px] text-slate-500">GSTIN: 22ARPCS5442R1ZM&nbsp;&nbsp; | &nbsp;&nbsp;Phone: +91 75870 76870&nbsp;&nbsp; | &nbsp;&nbsp;Email: rajendra.s@saiobioenergy.com</p><div className="mt-4 h-0.5 bg-[#0D3A35]"/><div className="mt-2 bg-[#0D3A35] px-3 py-2.5 text-sm font-extrabold uppercase tracking-wider text-white">Inspection Certificate ({report.inspectionType})</div></header>

        <div className="mt-2 grid grid-cols-[.75fr_1.25fr_.75fr_1.25fr] border-l border-t border-slate-300"><div className="border-b border-r border-slate-300 bg-slate-100 px-3 py-2 font-bold uppercase text-slate-500">Certificate No.</div><div className="border-b border-r border-slate-300 px-3 py-2 font-bold text-[#142D4C]">{report.certificateNo}</div><div className="border-b border-r border-slate-300 bg-slate-100 px-3 py-2 font-bold uppercase text-slate-500">Certificate Date</div><div className="border-b border-r border-slate-300 px-3 py-2 font-bold text-[#142D4C]">{displayDate(report.certificateDate)}</div></div>

        <div className="mt-3 border border-slate-300 bg-slate-100 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-700">Inspection Details</div>
        <table className="w-full border-collapse"><tbody>{[['GRN No.', report.grnNo], ['Purchase Order No.', report.poNo || 'Not Recorded'], ['Vendor Name', report.vendorName], ['Inspection Location', report.inspectionLocation], ['Inspection Type', report.inspectionType], ['Reference', report.reference || 'NA']].map(([label, value]) => <tr key={label}><th className="w-[32%] border border-t-0 border-slate-300 bg-slate-50 px-3 py-1.5 text-left font-bold text-[#142D4C]">{label}</th><td className="border border-t-0 border-slate-300 px-3 py-1.5 font-semibold">{value || '-'}</td></tr>)}</tbody></table>

        <div className="mt-3 border border-slate-300 bg-slate-100 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-700">Material Inspection</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[650px] border-collapse"><thead><tr>{['S. No.', 'Item', 'UoM', 'Order Qty.', 'Inspected Qty.', 'Accepted Qty.', 'Rejected Qty.'].map(head => <th key={head} className="border border-t-0 border-slate-300 bg-[#0D3A35] px-2 py-2 text-center text-[9px] font-bold text-white">{head}</th>)}</tr></thead><tbody>{report.items.map((item, index) => <tr key={item.id} className="even:bg-slate-50"><td className="border border-slate-300 px-2 py-2 text-center">{index + 1}</td><td className="border border-slate-300 px-2 py-2 font-bold">{item.itemName}{item.itemCode && <span className="block font-mono text-[8px] font-normal text-slate-400">{item.itemCode}</span>}</td><td className="border border-slate-300 px-2 py-2 text-center">{item.uom}</td>{[item.orderQty, item.inspectedQty, item.acceptedQty, item.rejectedQty].map((value, valueIndex) => <td key={valueIndex} className="border border-slate-300 px-2 py-2 text-right">{value.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>)}</tr>)}</tbody></table></div>

        <div className="mt-3 border border-slate-300 bg-slate-100 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-700">Quality Inspection Checklist</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] border-collapse"><thead><tr>{['S. No.', 'Inspection Parameter', 'Inspection Result', 'Remarks'].map(head => <th key={head} className="border border-t-0 border-slate-300 bg-[#0D3A35] px-2 py-2 text-center text-[9px] font-bold text-white">{head}</th>)}</tr></thead><tbody>{report.checklist.map((item, index) => <tr key={item.id} className="even:bg-slate-50"><td className="border border-slate-300 px-2 py-2 text-center">{index + 1}</td><td className="border border-slate-300 px-2 py-2 font-bold">{item.parameter}</td><td className="border border-slate-300 px-2 py-2 text-center font-semibold">{item.result}</td><td className="border border-slate-300 px-2 py-2">{item.remarks || '-'}</td></tr>)}</tbody></table></div>

        <div className="mt-3 border border-slate-300 bg-slate-100 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-700">Certification</div><div className="min-h-28 border border-t-0 border-slate-300 px-4 py-4 leading-relaxed"><p>{report.certification}</p><p className="mt-4 font-bold text-slate-800">{report.recommendation}</p></div>

        <div className={cn('grid', report.signatoryMode === 'three' ? 'grid-cols-3' : 'grid-cols-2')}>{signatories.map((signatory, index) => <div key={signatory.title} className={cn('border border-t-0 border-slate-300', index > 0 && 'border-l-0')}><div className="bg-[#0D3A35] px-2 py-2 text-center text-[9px] font-bold uppercase text-white">{signatory.title}</div><div className="relative min-h-32 p-3"><p><strong>Name:</strong> {signatory.name || '-'}</p><p className="mt-3"><strong>Designation:</strong> {signatory.designation || '-'}</p><p className="absolute bottom-3 left-3"><strong>Signature:</strong></p>{signatory.approvedAt && <div className="absolute bottom-3 right-3 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-right"><p className="text-[8px] font-extrabold uppercase tracking-wider text-emerald-700">Approved</p><p className="mt-0.5 text-[7px] font-semibold text-emerald-800">{displayApprovalDateTime(signatory.approvedAt)}</p></div>}</div></div>)}</div>

        <footer className="mt-12 flex items-center justify-between border-t border-slate-300 pt-2 text-[8px] text-slate-500"><span>System-generated Inspection Certificate</span><span>{report.certificateNo}</span><span>Page 1 of 1</span></footer>
      </div>
    </article>
  );
};

const numberValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

type EmployeeOption = {
  id: string;
  name: string;
  designation: string;
};

const toEmployeeOption = (raw: unknown): EmployeeOption => {
  const staff = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const information = staff.staff_information && typeof staff.staff_information === 'object'
    ? staff.staff_information as Record<string, unknown>
    : {};
  return {
    id: String(staff.staff_id || staff.employee_id || '').trim(),
    name: String(information.staff_name || staff.name || '').trim(),
    designation: String(information.staff_designation || staff.designation || '').trim(),
  };
};

export default function InspectionReport() {
  const { user } = useAuth();
  const [grns, setGrns] = useState<GRNRecord[]>([]);
  const [reports, setReports] = useState<InspectionReportRecord[]>(() => listInspectionReports());
  const [loadingGrns, setLoadingGrns] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<InspectionReportRecord | null>(null);
  const [viewReport, setViewReport] = useState<InspectionReportRecord | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const refreshGrns = () => {
    setLoadingGrns(true);
    listGrns()
      .then(setGrns)
      .catch(error => toast.error(error instanceof Error ? error.message : 'Failed to load GRNs'))
      .finally(() => setLoadingGrns(false));
  };

  useEffect(refreshGrns, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadEmployees = async () => {
      setLoadingEmployees(true);
      try {
        const baseUrl = getBaseUrl().replace(/\/$/, '');
        const response = await fetch(`${baseUrl}/admin_staff/get_all_staff`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const data: unknown = await response.json().catch(() => null);
        const dataRecord = data && typeof data === 'object' ? data as Record<string, unknown> : {};
        if (!response.ok) throw new Error(String(dataRecord.message || dataRecord.error || 'Failed to load employees'));
        const rows: unknown[] = Array.isArray(data) ? data : Array.isArray(dataRecord.staff) ? dataRecord.staff : [];
        setEmployees(rows.map(toEmployeeOption).filter((employee: EmployeeOption) => employee.id && employee.name)
          .sort((first: EmployeeOption, second: EmployeeOption) => first.name.localeCompare(second.name)));
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setEmployees([]);
          toast.error(error instanceof Error ? error.message : 'Failed to load employees');
        }
      } finally {
        setLoadingEmployees(false);
      }
    };
    void loadEmployees();
    return () => controller.abort();
  }, []);

  const filteredReports = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter(report => [report.certificateNo, report.grnNo, report.poNo, report.vendorName, report.inspectionType]
      .some(value => value.toLowerCase().includes(q)));
  }, [query, reports]);

  const createReport = () => {
    if (!grns.length) {
      toast.error('No GRNs are available. Create a GRN first.');
      return;
    }
    const localProfile = readUserProfile();
    const now = new Date().toISOString();
    setEditor({
      id: uid(),
      certificateNo: nextInspectionCertificateNo(reports),
      certificateDate: todayIso(),
      grnNo: '',
      grnDate: '',
      poNo: '',
      vendorName: '',
      vendorId: '',
      inspectionLocation: '',
      inspectionType: 'Prior to Dispatch',
      reference: '',
      items: [],
      checklist: [],
      certification: DEFAULT_CERTIFICATION,
      recommendation: DEFAULT_RECOMMENDATION,
      preparedByName: user?.name || localProfile.name || '',
      preparedByDesignation: user?.designation || localProfile.role || '',
      signatoryMode: 'two',
      verifiedById: '',
      verifiedByName: '',
      verifiedByDesignation: '',
      approvedById: '',
      approvedByName: '',
      approvedByDesignation: '',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
  };

  const selectGrn = (grnNo: string) => {
    const grn = grns.find(entry => entry.grnNo === grnNo);
    if (!editor || !grn) return;
    const items: InspectionReportItem[] = grn.items.map(item => ({
      id: uid(),
      itemCode: item.itemCode || '',
      itemName: item.description,
      uom: item.uom,
      orderQty: item.billedQty,
      inspectedQty: item.receivedQty,
      acceptedQty: Math.max(0, item.receivedQty - item.rejectedQty),
      rejectedQty: item.rejectedQty,
    }));
    const checklist: InspectionChecklistItem[] = [
      ...grn.items.map(item => ({ id: uid(), parameter: `${item.description} - Quality & Dimensions`, result: 'As per PO', remarks: '' })),
      { id: uid(), parameter: 'Overall Product Specifications', result: 'As per PO', remarks: '' },
    ];
    setEditor({
      ...editor,
      grnNo: grn.grnNo,
      grnDate: grn.grnDate,
      poNo: grn.poNo,
      vendorName: grn.vendorName,
      vendorId: grn.vendorId,
      inspectionLocation: grn.vendorName ? `Factory - ${grn.vendorName}` : grn.vendorAddress || '',
      reference: grn.grnNo,
      items,
      checklist,
      approvedById: grn.approvedBy?.staffId || editor.approvedById,
      approvedByName: grn.approvedBy?.name || editor.approvedByName,
      approvedByDesignation: grn.approvedBy?.designation || editor.approvedByDesignation,
    });
  };

  const updateItem = (id: string, field: keyof InspectionReportItem, value: string) => {
    if (!editor) return;
    setEditor({ ...editor, items: editor.items.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: numberValue(value) };
      if (field === 'inspectedQty' || field === 'rejectedQty') {
        updated.acceptedQty = Math.max(0, updated.inspectedQty - updated.rejectedQty);
      }
      return updated;
    }) });
  };

  const updateChecklist = (id: string, field: keyof InspectionChecklistItem, value: string) => {
    if (!editor) return;
    setEditor({ ...editor, checklist: editor.checklist.map(item => item.id === id ? { ...item, [field]: value } : item) });
  };

  const selectEmployee = (role: 'verified' | 'approved', employeeId: string) => {
    if (!editor) return;
    const employee = employees.find(entry => entry.id === employeeId);
    if (role === 'verified') {
      setEditor({
        ...editor,
        verifiedById: employee?.id || '',
        verifiedByName: employee?.name || '',
        verifiedByDesignation: employee?.designation || '',
      });
    } else {
      setEditor({
        ...editor,
        approvedById: employee?.id || '',
        approvedByName: employee?.name || '',
        approvedByDesignation: employee?.designation || '',
      });
    }
  };

  const saveEditor = () => {
    if (!editor) return;
    if (!editor.grnNo) { toast.error('Select a GRN'); return; }
    if (!editor.inspectionLocation.trim()) { toast.error('Enter the inspection location'); return; }
    if (!editor.items.length) { toast.error('The selected GRN has no items to inspect'); return; }
    if (editor.items.some(item => item.acceptedQty + item.rejectedQty > item.inspectedQty)) {
      toast.error('Accepted and rejected quantities cannot exceed inspected quantity');
      return;
    }
    if (editor.checklist.some(item => !item.parameter.trim() || !item.result.trim())) {
      toast.error('Complete every checklist parameter and result');
      return;
    }
    if (editor.signatoryMode === 'three' && !editor.verifiedById) {
      toast.error('Select the employee who verified the inspection report');
      return;
    }
    if (!editor.approvedById) {
      toast.error('Select the employee who approved the inspection report');
      return;
    }
    const localProfile = readUserProfile();
    const saved = saveInspectionReport({
      ...editor,
      preparedByName: user?.name || localProfile.name || editor.preparedByName,
      preparedByDesignation: user?.designation || localProfile.role || editor.preparedByDesignation,
      status: 'pending_admin_ops',
      adminOpsApproval: undefined,
      financeAdminOpsApproval: undefined,
      rejectedByStage: undefined,
      rejectionReason: undefined,
      updatedAt: new Date().toISOString(),
    });
    setReports(listInspectionReports());
    setEditor(null);
    toast.success(`${saved.certificateNo} sent to Admin Ops for approval`);
  };

  const printReport = async (report: InspectionReportRecord) => {
    setPrintingId(report.id);
    try {
      await printInspectionReport(report);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate inspection certificate');
    } finally {
      setPrintingId(null);
    }
  };

  const removeReport = (report: InspectionReportRecord) => {
    if (!window.confirm(`Delete ${report.certificateNo}?`)) return;
    deleteInspectionReport(report.id);
    setReports(listInspectionReports());
    toast.success(`${report.certificateNo} deleted`);
  };

  const editReport = (report: InspectionReportRecord) => {
    const localProfile = readUserProfile();
    setEditor({
      ...report,
      preparedByName: user?.name || localProfile.name || report.preparedByName,
      preparedByDesignation: user?.designation || localProfile.role || report.preparedByDesignation,
      items: report.items.map(item => ({ ...item })),
      checklist: report.checklist.map(item => ({ ...item })),
    });
  };

  const completedGrns = new Set(reports.map(report => report.grnNo));

  return (
    <div className="min-h-screen animate-in space-y-6 bg-slate-50/70 p-4 font-sans duration-300 fade-in sm:p-6 lg:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-[#0D3A35] p-3.5 text-white shadow-[0_12px_28px_-12px_rgba(13,58,53,0.75)]"><ClipboardCheck className="h-7 w-7" /></div>
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#0D3A35]">Inventory Operations</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Inspection Reports</h1>
            <p className="mt-1 max-w-lg text-sm text-slate-500">Create material inspection certificates from existing Goods Receipt Notes.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button type="button" onClick={createReport} className="inline-flex items-center gap-2 rounded-xl bg-[#0D3A35] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#092e2a]"><Plus className="h-4 w-4" />Create Inspection Report</button>
          <button type="button" onClick={refreshGrns} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"><RefreshCw className={cn('h-4 w-4', loadingGrns && 'animate-spin')} />Refresh</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'GRNs Available', value: grns.length, icon: FileCheck2 },
          { label: 'Inspection Reports', value: reports.length, icon: ClipboardCheck },
          { label: 'GRNs Inspected', value: completedGrns.size, icon: ShieldCheck },
        ].map(card => <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.45)]"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{card.label}</p><p className="mt-2 text-2xl font-extrabold text-slate-900">{card.value.toLocaleString('en-IN')}</p></div><div className="rounded-xl bg-emerald-50 p-3 text-[#0D3A35]"><card.icon className="h-5 w-5" /></div></div></div>)}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_32px_-24px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-bold text-slate-900">Inspection Report Register</h2><p className="mt-0.5 text-xs text-slate-500">{filteredReports.length} of {reports.length} certificates</p></div><div className="relative w-full sm:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search certificate, GRN, PO or vendor" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-[#0D3A35] focus:bg-white" /></div></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-[#0D3A35] text-white"><tr>{['Certificate No.', 'Date', 'GRN No.', 'Purchase Order', 'Vendor', 'Inspection Type', 'Items', 'Prepared By', 'Approval Status', 'Action'].map(head => <th key={head} className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.08em]">{head}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReports.length ? filteredReports.map(report => <tr key={report.id} className="hover:bg-emerald-50/30">
                <td className="px-3 py-3 text-center font-mono text-xs font-bold text-[#0D3A35]">{report.certificateNo}</td><td className="px-3 py-3 text-center text-xs text-slate-600">{displayDate(report.certificateDate)}</td><td className="px-3 py-3 text-center font-mono text-xs text-slate-700">{report.grnNo}</td><td className="px-3 py-3 text-center font-mono text-xs text-slate-600">{report.poNo || '-'}</td><td className="px-3 py-3 text-xs font-semibold text-slate-700">{report.vendorName}</td><td className="px-3 py-3 text-center text-xs text-slate-600">{report.inspectionType}</td><td className="px-3 py-3 text-center text-xs text-slate-600">{report.items.length}</td><td className="px-3 py-3 text-center text-xs text-slate-600">{report.preparedByName || '-'}</td><td className="px-3 py-3 text-center"><span className={cn('inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold', report.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : report.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>{({ draft: 'Draft', pending_admin_ops: 'Pending Admin Ops', pending_finance_admin_ops: 'Pending Finance Admin Ops', approved: 'Approved', rejected: 'Rejected' } as const)[report.status]}</span></td>
                <td className="px-3 py-3"><div className="flex items-center justify-center gap-1.5"><button onClick={() => setViewReport(report)} title="View report" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-[#0D3A35] hover:bg-emerald-50"><Eye className="h-3.5 w-3.5" /></button>{(report.status === 'draft' || report.status === 'rejected') && <button onClick={() => editReport(report)} title="Edit and resubmit" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-amber-600 hover:bg-amber-50"><Pencil className="h-3.5 w-3.5" /></button>}<button onClick={() => void printReport(report)} title="Print report" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-blue-600 hover:bg-blue-50">{printingId === report.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}</button>{(report.status === 'draft' || report.status === 'rejected') && <button onClick={() => removeReport(report)} title="Delete report" className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>}</div></td>
              </tr>) : <tr><td colSpan={10} className="px-6 py-16 text-center"><ClipboardCheck className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">No inspection reports found</p><p className="mt-1 text-xs text-slate-400">Create a report from an existing GRN.</p></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {editor && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"><div className="flex max-h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-center justify-between bg-[#0D3A35] px-5 py-4 text-white"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">Inspection Workflow</p><h2 className="mt-1 text-lg font-bold">{reports.some(report => report.id === editor.id) ? `Edit ${editor.certificateNo}` : 'Create Inspection Report'}</h2></div><button onClick={() => setEditor(null)} className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5" /></button></div>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[1.05fr_.95fr]"><div className="min-h-0 space-y-5 overflow-y-auto bg-slate-50 p-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-bold text-slate-900">Certificate &amp; GRN Details</h3><div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Certificate No.<input value={editor.certificateNo} readOnly className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-600" /></label>
            <label className="text-xs font-bold text-slate-600">Certificate Date<input type="date" value={editor.certificateDate} onChange={event => setEditor({ ...editor, certificateDate: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">Goods Receipt Note <span className="text-red-500">*</span><select value={editor.grnNo} onChange={event => selectGrn(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Select GRN</option>{grns.map(grn => <option key={grn.grnNo} value={grn.grnNo}>{grn.grnNo} - {grn.vendorName} - {statusLabel(grn.status)}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Purchase Order<input value={editor.poNo} readOnly className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm" /></label><label className="text-xs font-bold text-slate-600">Vendor<input value={editor.vendorName} readOnly className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm" /></label>
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">Inspection Location <span className="text-red-500">*</span><input value={editor.inspectionLocation} onChange={event => setEditor({ ...editor, inspectionLocation: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
            <label className="text-xs font-bold text-slate-600">Inspection Type<select value={editor.inspectionType} onChange={event => setEditor({ ...editor, inspectionType: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option>Prior to Dispatch</option><option>Incoming Material</option><option>Quality Verification</option><option>Final Inspection</option></select></label><label className="text-xs font-bold text-slate-600">Reference<input value={editor.reference} onChange={event => setEditor({ ...editor, reference: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
          </div></section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-4 py-3"><h3 className="text-sm font-bold text-slate-900">Material Inspection</h3><p className="mt-1 text-xs text-slate-500">Item details are populated from the selected GRN.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-xs"><thead className="bg-slate-50"><tr>{['Item', 'UoM', 'Order Qty.', 'Inspected', 'Accepted', 'Rejected'].map(head => <th key={head} className="px-3 py-2.5 text-left text-[10px] uppercase text-slate-500">{head}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{editor.items.map(item => <tr key={item.id}><td className="px-3 py-2 font-semibold text-slate-700">{item.itemName}<span className="block text-[9px] font-normal text-slate-400">{item.itemCode}</span></td><td className="px-3 py-2">{item.uom}</td>{(['orderQty', 'inspectedQty', 'acceptedQty', 'rejectedQty'] as const).map(field => <td key={field} className="px-2 py-2"><input type="number" min="0" step="any" value={item[field]} onChange={event => updateItem(item.id, field, event.target.value)} className="h-9 w-24 rounded-lg border border-slate-200 px-2 text-right" /></td>)}</tr>)}</tbody></table></div></section>

          <section className="rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h3 className="text-sm font-bold text-slate-900">Quality Inspection Checklist</h3><p className="mt-1 text-xs text-slate-500">Record the result and remarks for each inspection parameter.</p></div><button onClick={() => setEditor({ ...editor, checklist: [...editor.checklist, { id: uid(), parameter: '', result: 'As per PO', remarks: '' }] })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#0D3A35] hover:bg-emerald-50"><Plus className="h-3.5 w-3.5" />Add Parameter</button></div><div className="space-y-3 p-4">{editor.checklist.map((item, index) => <div key={item.id} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[28px_1.5fr_1fr_1fr_auto]"><span className="pt-2 text-center text-xs font-bold text-slate-400">{index + 1}</span><input value={item.parameter} onChange={event => updateChecklist(item.id, 'parameter', event.target.value)} placeholder="Inspection parameter" className="h-9 rounded-lg border border-slate-200 px-3 text-xs" /><select value={item.result} onChange={event => updateChecklist(item.id, 'result', event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option>As per PO</option><option>Acceptable</option><option>Satisfactory</option><option>Not Satisfactory</option><option>Rejected</option></select><input value={item.remarks} onChange={event => updateChecklist(item.id, 'remarks', event.target.value)} placeholder="Remarks" className="h-9 rounded-lg border border-slate-200 px-3 text-xs" /><button onClick={() => setEditor({ ...editor, checklist: editor.checklist.filter(entry => entry.id !== item.id) })} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>)}</div></section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-900">Certification &amp; Signatories</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600 sm:col-span-2">Certification<textarea value={editor.certification} onChange={event => setEditor({ ...editor, certification: event.target.value })} rows={3} className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm" /></label>
              <label className="text-xs font-bold text-slate-600 sm:col-span-2">Recommendation<textarea value={editor.recommendation} onChange={event => setEditor({ ...editor, recommendation: event.target.value })} rows={3} className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm" /></label>

              <div className="sm:col-span-2">
                <p className="text-xs font-bold text-slate-600">Signatory Layout</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {[
                    { value: 'two' as const, title: 'Two Signatories', detail: 'Prepared & Inspected By + Approved By' },
                    { value: 'three' as const, title: 'Three Signatories', detail: 'Prepared & Inspected By + Verified By + Approved By' },
                  ].map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setEditor({
                        ...editor,
                        signatoryMode: option.value,
                        ...(option.value === 'two' ? { verifiedById: '', verifiedByName: '', verifiedByDesignation: '' } : {}),
                      })}
                      className={cn(
                        'rounded-xl border p-3 text-left transition',
                        editor.signatoryMode === option.value
                          ? 'border-[#0D3A35] bg-emerald-50 ring-2 ring-[#0D3A35]/10'
                          : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30',
                      )}
                    >
                      <span className="block text-xs font-bold text-slate-800">{option.title}</span>
                      <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{option.detail}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="text-xs font-bold text-slate-600">Prepared &amp; Inspected By
                <input value={editor.preparedByName} readOnly className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600" />
                <span className="mt-1 block text-[10px] font-medium text-emerald-700">Automatically set to the logged-in employee</span>
              </label>
              <label className="text-xs font-bold text-slate-600">Designation
                <input value={editor.preparedByDesignation} readOnly className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600" />
              </label>

              {editor.signatoryMode === 'three' && <>
                <label className="text-xs font-bold text-slate-600">Verified By <span className="text-red-500">*</span>
                  <select value={editor.verifiedById} onChange={event => selectEmployee('verified', event.target.value)} disabled={loadingEmployees} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50">
                    <option value="">{loadingEmployees ? 'Loading employees...' : 'Select employee'}</option>
                    {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name} - {employee.designation || 'Designation not recorded'}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">Designation
                  <input value={editor.verifiedByDesignation} readOnly className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600" />
                </label>
              </>}

              <label className="text-xs font-bold text-slate-600">Approved By <span className="text-red-500">*</span>
                <select value={editor.approvedById} onChange={event => selectEmployee('approved', event.target.value)} disabled={loadingEmployees} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50">
                  <option value="">{loadingEmployees ? 'Loading employees...' : 'Select employee'}</option>
                  {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name} - {employee.designation || 'Designation not recorded'}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-600">Designation
                <input value={editor.approvedByDesignation} readOnly className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600" />
              </label>
            </div>
          </section>
        </div><div className="hidden min-h-0 overflow-y-auto border-l border-slate-200 bg-slate-100 p-5 lg:block"><div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Live Certificate Preview</div><CertificatePreview report={editor} /></div></div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4"><button onClick={() => setEditor(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button onClick={saveEditor} className="inline-flex items-center gap-2 rounded-xl bg-[#0D3A35] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#092e2a]"><ShieldCheck className="h-4 w-4" />Submit to Admin Ops</button></div></div></div>}

      {viewReport && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between bg-[#0D3A35] px-5 py-4 text-white"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">Inspection Certificate</p><h2 className="mt-1 text-lg font-bold">{viewReport.certificateNo}</h2></div><button onClick={() => setViewReport(null)} className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5" /></button></div><div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-5"><CertificatePreview report={viewReport} /></div><div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4"><button onClick={() => setViewReport(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Close</button><button onClick={() => void printReport(viewReport)} className="inline-flex items-center gap-2 rounded-xl bg-[#0D3A35] px-5 py-2.5 text-sm font-semibold text-white">{printingId === viewReport.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Print Certificate</button></div></div></div>}
    </div>
  );
}
