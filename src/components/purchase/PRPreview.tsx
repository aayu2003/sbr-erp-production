import { formatDateDDMMYYYY } from '@/lib/dateFormat';
import { type SignatureDiary } from '@/lib/signatureDiary';
import logo3f from '@/Assets/3f-logo.png';

export type PRPreviewLineItem = {
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

export type PRPreviewIndent = {
  project: string;
  prNo: string;
  date: string;
  department: string;
  indentedBy: string;
  indentedBySignature?: string;
  indentedByTimestamp?: string;
  forwardedBy: string;
  forwardedBySignature?: string;
  forwardedByTimestamp?: string;
  directorsApproval: string;
  directorsApprovalSignature?: string;
  directorsApprovalTimestamp?: string;
  remarksNotes: string;
  budgetHead: string;
  items: PRPreviewLineItem[];
};

const netPrQty = (item: PRPreviewLineItem) =>
  Math.max(0, (item.totalQtyRequired || 0) - (item.lessQtyAvailableInStock || 0));

const approxValue = (item: PRPreviewLineItem) => netPrQty(item) * (item.ratePerItem || 0);

const totalValue = (items: PRPreviewLineItem[]) =>
  items.reduce((sum, item) => sum + approxValue(item), 0);

const formatInr = (value: number) => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `₹ ${Math.round(value).toLocaleString('en-IN')}`;
  }
};

const formatNumber = (value: number) =>
  Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const signatureContent = (
  person: string,
  storedSignature: string | undefined,
  attachments: SignatureDiary | undefined,
  allowDiarySignature = true,
) => {
  const diaryEntry = person ? attachments?.[person] : undefined;
  if (allowDiarySignature && diaryEntry?.signature) {
    return <img src={diaryEntry.signature} alt={`${person} signature`} className="mx-auto h-8 max-w-full object-contain" />;
  }
  if (storedSignature) return <span className="break-words text-[9px] leading-snug text-emerald-700">{storedSignature}</span>;
  return <span className="text-slate-400">Pending</span>;
};

export function PRPreview({
  indent,
  attachments,
  showDirectorSignature,
}: {
  indent: PRPreviewIndent;
  attachments?: SignatureDiary;
  showDirectorSignature?: boolean;
}) {
  const itemCount = indent.items.length;
  const totalRequired = indent.items.reduce((sum, item) => sum + Number(item.totalQtyRequired || 0), 0);
  const totalNetQuantity = indent.items.reduce((sum, item) => sum + netPrQty(item), 0);
  const approvalRows = [
    {
      stage: 'Indented By',
      person: indent.indentedBy,
      signature: indent.indentedBySignature,
      date: indent.indentedByTimestamp || indent.date,
      allowDiary: true,
    },
    {
      stage: 'Forwarded By',
      person: indent.forwardedBy,
      signature: indent.forwardedBySignature,
      date: indent.forwardedByTimestamp,
      allowDiary: true,
    },
    {
      stage: "Director's Approval",
      person: indent.directorsApproval,
      signature: indent.directorsApprovalSignature,
      date: indent.directorsApprovalTimestamp,
      allowDiary: Boolean(showDirectorSignature),
    },
  ];

  return (
    <article className="min-w-[1040px] overflow-hidden rounded-sm border border-slate-300 bg-white font-sans text-slate-800">
      <header className="px-6 pb-4 pt-5 text-center">
        <img src={logo3f} alt="Sai Bioresources" className="mx-auto h-14 w-auto object-contain" />
        <h2 className="mt-2 text-xl font-black tracking-[0.04em] text-slate-950">SAI BIORESOURCES PRIVATE LIMITED</h2>
        <p className="mt-1 text-[11px] font-medium text-slate-500">
          Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001
        </p>
        <p className="mt-1 text-[10px] font-medium text-slate-500">
          GSTIN: 22ARPCS5442R1ZM &nbsp;|&nbsp; Phone: +91 75870 76870 &nbsp;|&nbsp; Email: rajendra.s@saiobioenergy.com
        </p>
        <div className="mt-4 h-1 bg-[#0D3A35]" />
      </header>

      <div className="mx-6 bg-[#0D3A35] px-4 py-3 text-center text-sm font-black tracking-[0.18em] text-white">
        PURCHASE REQUISITION (PR)
      </div>

      <section className="mx-6 grid grid-cols-4 border-x border-b border-slate-300">
        {[
          ['PR Number', indent.prNo || 'Not Generated'],
          ['PR Date', formatDateDDMMYYYY(indent.date)],
          ['Project', indent.project || 'Not Recorded'],
          ['Department', indent.department || 'Not Recorded'],
        ].map(([label, value], index) => (
          <div key={label} className={`min-w-0 px-3 py-3 ${index < 3 ? 'border-r border-slate-300' : ''}`}>
            <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p>
            <p className="mt-1 break-words text-[12px] font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="mx-6 mt-4 border border-slate-300">
        <div className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-[0.09em] text-slate-700">
          Requisition Items
        </div>
        <table className="w-full table-fixed border-collapse text-[10px]">
          <colgroup>
            <col className="w-[4%]" /><col className="w-[10%]" /><col className="w-[20%]" /><col className="w-[6%]" />
            <col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[10%]" />
            <col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[10%]" />
          </colgroup>
          <thead className="bg-[#0D3A35] text-white">
            <tr>
              {['S. No.', 'Item Code', 'Item / Specification', 'UoM', 'Required Qty.', 'Stock Qty.', 'Net PR Qty.', 'Required By', 'Source', 'Unit Rate', 'Approx. Value'].map((heading) => (
                <th key={heading} className="border-r border-white/25 px-1.5 py-2.5 text-center text-[8px] font-bold uppercase leading-tight tracking-[0.035em] last:border-r-0">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indent.items.length ? indent.items.map((item) => (
              <tr key={item.id} className="border-b border-slate-200 last:border-b-0">
                <td className="border-r border-slate-200 px-2 py-2.5 text-center">{item.srNo}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 font-mono font-bold text-[#0D3A35]">{item.itemCode || '—'}</td>
                <td className="border-r border-slate-200 px-2 py-2.5">
                  <p className="font-bold text-slate-900">{item.partName || 'Not Recorded'}</p>
                  <p className="mt-0.5 text-[9px] leading-snug text-slate-500">{item.specification || 'No specification recorded'}</p>
                </td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-center font-semibold">{item.uom || '—'}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-right">{formatNumber(item.totalQtyRequired)}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-right">{formatNumber(item.lessQtyAvailableInStock)}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-right font-bold">{formatNumber(netPrQty(item))}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-center">{formatDateDDMMYYYY(item.materialRequiredByDate)}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-center">{item.indigenousOrImported || '—'}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-right">{formatInr(item.ratePerItem || 0)}</td>
                <td className="px-2 py-2.5 text-right font-bold">{formatInr(approxValue(item))}</td>
              </tr>
            )) : (
              <tr><td colSpan={11} className="px-4 py-6 text-center text-slate-400">No requisition items recorded.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mx-6 mt-4 grid grid-cols-4 border border-slate-300">
        {[
          ['Line Items', formatNumber(itemCount)],
          ['Total Required Qty.', formatNumber(totalRequired)],
          ['Total Net PR Qty.', formatNumber(totalNetQuantity)],
          ['Total PR Value', formatInr(totalValue(indent.items))],
        ].map(([label, value], index) => (
          <div key={label} className={`px-3 py-3 ${index < 3 ? 'border-r border-slate-300' : ''}`}>
            <p className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="mx-6 mt-4 border border-slate-300">
        <div className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-[0.09em] text-slate-700">
          Procurement &amp; Technical Details
        </div>
        <table className="w-full table-fixed border-collapse text-[9px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Item', 'Preferred Vendor', 'Lead Time', 'Warranty / Guarantee', 'Full Life', 'Actual Life', 'Repairing', 'Replacement Reason'].map((heading) => (
                <th key={heading} className="border-b border-r border-slate-300 px-2 py-2 text-center font-bold uppercase last:border-r-0">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indent.items.map((item) => (
              <tr key={`technical-${item.id}`} className="border-b border-slate-200 last:border-b-0">
                <td className="border-r border-slate-200 px-2 py-2 font-bold">{item.partName || `Item ${item.srNo}`}</td>
                <td className="border-r border-slate-200 px-2 py-2">{item.preferredVendorName || 'Not Recorded'}</td>
                <td className="border-r border-slate-200 px-2 py-2 text-center">{formatNumber(item.procurementLeadTimeWeeks)} week(s)</td>
                <td className="border-r border-slate-200 px-2 py-2 text-center">{item.validityOfWarrantyAndGuarantee || 'N/A'}</td>
                <td className="border-r border-slate-200 px-2 py-2 text-center">{item.fullLifeHr || 'N/A'}</td>
                <td className="border-r border-slate-200 px-2 py-2 text-center">{item.actualLifeHr || 'N/A'}</td>
                <td className="border-r border-slate-200 px-2 py-2 text-center">{item.repairingPossibility || 'N/A'}</td>
                <td className="px-2 py-2">{item.reasonForReplacement || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mx-6 mt-4 grid grid-cols-2 gap-4">
        <div className="border border-slate-300">
          <div className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-[0.09em] text-slate-700">Budget Head</div>
          <div className="min-h-[72px] whitespace-pre-line px-4 py-3 text-[10px] leading-relaxed text-slate-700">{indent.budgetHead || 'Not Recorded'}</div>
        </div>
        <div className="border border-slate-300">
          <div className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-[0.09em] text-slate-700">Remarks / Notes</div>
          <div className="min-h-[72px] px-4 py-3 text-[10px] leading-relaxed text-slate-700">{indent.remarksNotes || 'No remarks recorded'}</div>
        </div>
      </section>

      <section className="mx-6 mt-4 border border-slate-300">
        <div className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-[0.09em] text-slate-700">Approval Details</div>
        <div className="grid grid-cols-[1fr_1.35fr_1.8fr_.8fr] bg-slate-50 text-[9px] font-bold uppercase text-slate-500">
          {['Approval Stage', 'Name / ID', 'Digital Signature', 'Date'].map((heading) => <div key={heading} className="border-r border-slate-300 px-3 py-2 text-center last:border-r-0">{heading}</div>)}
        </div>
        {approvalRows.map((row, index) => (
          <div key={row.stage} className={`grid grid-cols-[1fr_1.35fr_1.8fr_.8fr] text-[10px] ${index < approvalRows.length - 1 ? 'border-b border-slate-200' : ''}`}>
            <div className="border-r border-slate-200 px-3 py-3 font-bold text-slate-800">{row.stage}</div>
            <div className="border-r border-slate-200 px-3 py-3 text-center">{row.person || 'Not Recorded'}</div>
            <div className="border-r border-slate-200 px-3 py-2 text-center">{signatureContent(row.person, row.signature, attachments, row.allowDiary)}</div>
            <div className="px-3 py-3 text-center">{row.date ? formatDateDDMMYYYY(row.date) : '—'}</div>
          </div>
        ))}
      </section>

      <footer className="mx-6 mb-5 mt-4 flex items-center justify-between border-t border-slate-300 pt-2 text-[9px] font-medium text-slate-500">
        <span>System-generated Purchase Requisition</span>
        <span>PR No.: {indent.prNo || 'Draft'}</span>
        <span>SAI BIORESOURCES PRIVATE LIMITED</span>
      </footer>
    </article>
  );
}
