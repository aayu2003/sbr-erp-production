import { type SignatureDiary } from '@/lib/signatureDiary';

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

const netPrQty = (it: PRPreviewLineItem) =>
  Math.max(0, (it.totalQtyRequired || 0) - (it.lessQtyAvailableInStock || 0));

const approxValue = (it: PRPreviewLineItem) => netPrQty(it) * (it.ratePerItem || 0);

const totalValue = (items: PRPreviewLineItem[]) =>
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

export function PRPreview({
  indent,
  attachments,
  showDirectorSignature,
}: {
  indent: PRPreviewIndent;
  attachments?: SignatureDiary;
  showDirectorSignature?: boolean;
}) {
  const sigFor = (name: string) => attachments?.[name] ?? null;

  return (
    <div className="min-w-[980px]">
      <div className="border border-gray-300 bg-white">
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
                <td className="border border-gray-300 px-1 py-1 text-center">{it.indigenousOrImported}</td>
                <td className="border border-gray-300 px-1 py-1 text-right">
                  {it.ratePerItem ? it.ratePerItem.toLocaleString() : ''}
                </td>
                <td className="border border-gray-300 px-1 py-1 text-right">
                  {approxValue(it) ? formatInr(approxValue(it)) : ''}
                </td>
                <td className="border border-gray-300 px-1 py-1">{it.preferredVendorName || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.validityOfWarrantyAndGuarantee || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.fullLifeHr || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.actualLifeHr || ''}</td>
                <td className="border border-gray-300 px-1 py-1">{it.reasonForReplacement || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.repairingPossibility || 'NA'}</td>
              </tr>
            ))}

            <tr>
              <td colSpan={12} className="border border-gray-300 px-1 py-1 text-right font-semibold">
                TOTAL
              </td>
              <td colSpan={7} className="border border-gray-300 px-1 py-1 text-right font-semibold">
                {formatInr(totalValue(indent.items))}
              </td>
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
                    <img
                      src={sigFor(indent.indentedBy)!.signature}
                      alt="Signature"
                      className="h-8 object-contain"
                    />
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
              <div className="p-2 text-center">
                {indent.indentedByTimestamp ? indent.indentedByTimestamp : indent.date || '—'}
              </div>
            </div>
            <div className="grid grid-cols-4 border-b border-gray-300">
              <div className="p-2 font-semibold">Forwarded By</div>
              <div className="p-2 text-center">{indent.forwardedBy || '—'}</div>
              <div className="p-2 flex flex-col items-center justify-center gap-0.5">
                <div className="w-full h-10 border border-gray-200 rounded bg-white flex items-center justify-center px-1">
                  {sigFor(indent.forwardedBy)?.signature ? (
                    <img
                      src={sigFor(indent.forwardedBy)!.signature}
                      alt="Signature"
                      className="h-8 object-contain"
                    />
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
              <div className="p-2 text-center">
                {indent.forwardedByTimestamp ? indent.forwardedByTimestamp : indent.date || '—'}
              </div>
            </div>
            <div className="grid grid-cols-4">
              <div className="p-2 font-semibold">Director's Approval</div>
              <div className="p-2 text-center">{indent.directorsApproval || '—'}</div>
              <div className="p-2 flex flex-col items-center justify-center gap-0.5">
                <div className="w-full h-10 border border-gray-200 rounded bg-white flex items-center justify-center px-1">
                  {(() => {
                    const diaryEntry = sigFor(indent.directorsApproval);
                    if (diaryEntry?.signature && showDirectorSignature) {
                      return <img src={diaryEntry.signature} alt="Signature" className="h-8 object-contain" />;
                    }
                    if (indent.directorsApprovalSignature) {
                      return (
                        <div className="text-[11px] text-gray-700 text-center">
                          {indent.directorsApprovalSignature}
                        </div>
                      );
                    }
                    return <span className="text-gray-400">—</span>;
                  })()}
                </div>
                {(() => {
                  const diaryEntry = sigFor(indent.directorsApproval);
                  if (diaryEntry?.stamp && showDirectorSignature) {
                    return <img src={diaryEntry.stamp} alt="Stamp" className="h-8 object-contain" />;
                  }
                  return null;
                })()}
              </div>
              <div className="p-2 text-center">{indent.date || '—'}</div>
            </div>
          </div>

          <div className="col-span-4">
            <div className="grid grid-cols-1 border-b border-gray-300">
              <div className="p-2 font-semibold">Remarks / Notes</div>
              <div className="p-2 min-h-[56px] text-gray-700">{indent.remarksNotes || ''}</div>
            </div>
            <div className="p-2">
              <div className="font-semibold">Budget Head</div>
              <div className="text-gray-700 text-[11px] whitespace-pre-line leading-snug">{indent.budgetHead || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
