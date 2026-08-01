import { useMemo, useRef } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type GRNRecord } from '@/lib/grnApi';
import logo3f from '@/Assets/3f-logo.png';

const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh – 491001';

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

const formatDate = (v?: string) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
};

export function GrnPrint({ grn }: { grn: GRNRecord }) {
  const printRef = useRef<HTMLDivElement>(null);

  const totals = useMemo(() => {
    const billed = sum(grn.items.map((x) => x.billedQty || 0));
    const received = sum(grn.items.map((x) => x.receivedQty || 0));
    const rejected = sum(grn.items.map((x) => x.rejectedQty || 0));
    const accepted = sum(grn.items.map((x) => (x.receivedQty || 0) - (x.rejectedQty || 0)));
    const short = sum(grn.items.map((x) => x.shortQty || 0));

    const basic = sum(grn.items.map((x) => x.basicValue || 0));
    const freight = sum(grn.items.map((x) => x.freight || 0));
    const gst = sum(grn.items.map((x) => x.gstAmount || 0));
    const withTax = sum(grn.items.map((x) => x.valueWithTax || 0));
    const pf = sum(grn.items.map((x) => x.pf || 0));
    const total = sum(grn.items.map((x) => x.totalGrnValue || 0));

    return { billed, received, rejected, accepted, short, basic, freight, gst, withTax, pf, total };
  }, [grn]);

  const onPrint = () => {
    const content = printRef.current;
    if (!content) return;
    const w = window.open('', '_blank');
    if (!w) return;

    w.document.write(`
      <html><head><title>${grn.grnNo}</title>
      <style>
        @page { size: A4; margin: 10mm; }
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; color: #1a2233; }
        .sheet { border: 1px solid #c7d2e0; border-radius: 14px; padding: 16px; }

        .header { text-align: center; margin-bottom: 10px; }
        .header img { height: 46px; width: auto; margin-bottom: 4px; }
        .company { font-weight: 800; font-size: 18px; margin: 2px 0; letter-spacing: 0.3px; }
        .companyAddr { font-size: 10.5px; color: #4a5568; margin-bottom: 6px; }
        .docTitle { font-weight: 800; font-size: 14px; letter-spacing: 1px; margin: 6px 0 0; }

        table { width: 100%; border-collapse: collapse; }

        .topGrid td { border: 1px solid #c7d2e0; padding: 6px 8px; font-size: 11px; }
        .topGrid { margin-top: 10px; }
        .topGrid .k { font-weight: 700; width: 22%; background: #f4f7fb; }
        .topGrid .v { width: 28%; }

        .band { background: #1e3a5f; color: #fff; text-align: center; font-weight: 800; font-size: 11px; letter-spacing: 1px; padding: 5px; margin-top: 10px; border-radius: 6px 6px 0 0; }

        .particulars td { border: 1px solid #c7d2e0; padding: 6px 8px; font-size: 11px; vertical-align: top; }
        .particulars .k { font-weight: 700; width: 20%; background: #f4f7fb; }
        .particulars .v { width: 30%; }

        .items { margin-top: 12px; }
        .items th, .items td { border: 1px solid #c7d2e0; padding: 4px 5px; font-size: 10px; }
        .items thead th { font-weight: 700; background: #1e3a5f; color: #fff; }
        .center { text-align: center; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .total-row td { font-weight: 800; background: #f4f7fb; }

        .totalsWrap { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; align-items: start; }
        .totalsBox td { border: 1px solid #c7d2e0; padding: 5px 8px; font-size: 11px; }
        .totalsBox .k { font-weight: 700; background: #f4f7fb; }
        .grandTotal { border: 2px solid #1e3a5f; border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; font-weight: 800; }
        .grandTotal .amt { font-size: 15px; color: #1e3a5f; }

        .certification { margin-top: 12px; border: 1px solid #c7d2e0; border-radius: 0 0 8px 8px; padding: 8px 10px; font-size: 10.5px; }
        .certification p { margin: 2px 0; }

        .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
        .sigBlock { border: 1px solid #c7d2e0; border-radius: 8px; padding: 8px 10px; font-size: 10.5px; }
        .sigTitle { font-weight: 800; margin-bottom: 4px; color: #1e3a5f; }
        .sigLine { margin-top: 14px; border-top: 1px dashed #c7d2e0; padding-top: 3px; color: #4a5568; }

        .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 12px; font-size: 9.5px; color: #4a5568; }
        .footer ol { margin: 2px 0 0 14px; padding: 0; }
        .qr { width: 54px; height: 54px; border: 1px dashed #c7d2e0; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #4a5568; border-radius: 6px; }
      </style></head><body>
      ${content.innerHTML}
      </body></html>
    `);

    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" className="gap-2" onClick={onPrint}>
        <Printer className="h-4 w-4" /> Print GRN
      </Button>

      <div className="hidden">
        <div ref={printRef}>
          <div className="sheet">
            <div className="header">
              <img src={logo3f} alt="Sai Bioresources" />
              <div className="company">{COMPANY_NAME}</div>
              <div className="companyAddr">{COMPANY_ADDRESS}</div>
              <div className="docTitle">GOODS RECEIPT NOTE (GRN)</div>
            </div>

            <table className="topGrid">
              <tbody>
                <tr>
                  <td className="k">GRN No.:</td>
                  <td className="v">{grn.grnNo}</td>
                  <td className="k">GRN Date:</td>
                  <td className="v">{formatDate(grn.grnDate)}</td>
                </tr>
                <tr>
                  <td className="k">Gate Entry No.:</td>
                  <td className="v">{grn.geNo || '-'}</td>
                  <td className="k">Gate Entry Date:</td>
                  <td className="v">{grn.geDate || '-'}</td>
                </tr>
              </tbody>
            </table>

            <div className="band">PARTICULARS</div>
            <table className="particulars">
              <tbody>
                <tr>
                  <td className="k">Work Order No.</td>
                  <td className="v">{grn.poNo}</td>
                  <td className="k">PO Date</td>
                  <td className="v">{formatDate(grn.poDate) || '-'}</td>
                </tr>
                <tr>
                  <td className="k">Vendor / Supplier</td>
                  <td className="v">{grn.vendorName}</td>
                  <td className="k">Vendor Code</td>
                  <td className="v">{grn.vendorId || '-'}</td>
                </tr>
                <tr>
                  <td className="k">Invoice No.</td>
                  <td className="v">{grn.invNo || '-'}</td>
                  <td className="k">Invoice Date</td>
                  <td className="v">{grn.invDate || '-'}</td>
                </tr>
                <tr>
                  <td className="k">Challan No.</td>
                  <td className="v">{grn.challanNo || '-'}</td>
                  <td className="k">Challan Date</td>
                  <td className="v">{grn.challanDate || '-'}</td>
                </tr>
                <tr>
                  <td className="k">LR / Transport No.</td>
                  <td className="v">{grn.lrNo || '-'}</td>
                  <td className="k">PR No.</td>
                  <td className="v">{grn.prNo || '-'}</td>
                </tr>
                <tr>
                  <td className="k">Department</td>
                  <td className="v">{grn.department || '-'}</td>
                  <td className="k">Group</td>
                  <td className="v">{grn.group || '-'}</td>
                </tr>
                <tr>
                  <td className="k">Remarks</td>
                  <td className="v" colSpan={3}>{grn.remarks || '-'}</td>
                </tr>
              </tbody>
            </table>

            <table className="items">
              <thead>
                <tr>
                  <th rowSpan={2} className="center" style={{ width: 30 }}>S.<br/>No.</th>
                  <th rowSpan={2} className="center" style={{ width: 70 }}>ITEM CODE</th>
                  <th rowSpan={2} className="center">ITEM DESCRIPTION</th>
                  <th rowSpan={2} className="center" style={{ width: 44 }}>UOM</th>
                  <th rowSpan={2} className="center" style={{ width: 66 }}>RATE (₹)</th>
                  <th colSpan={5} className="center">QUANTITY WISE DETAILS</th>
                  <th colSpan={6} className="center">VALUE WISE DETAILS</th>
                </tr>
                <tr>
                  <th className="center" style={{ width: 50 }}>PO QTY</th>
                  <th className="center" style={{ width: 50 }}>RECEIVED</th>
                  <th className="center" style={{ width: 50 }}>ACCEPTED</th>
                  <th className="center" style={{ width: 50 }}>REJECTED</th>
                  <th className="center" style={{ width: 50 }}>SHORTAGE</th>

                  <th className="center" style={{ width: 74 }}>BASIC VALUE</th>
                  <th className="center" style={{ width: 44 }}>DISC %</th>
                  <th className="center" style={{ width: 56 }}>FREIGHT</th>
                  <th className="center" style={{ width: 56 }}>GST %</th>
                  <th className="center" style={{ width: 78 }}>VALUE<br/>WITH TAX</th>
                  <th className="center" style={{ width: 78 }}>TOTAL (₹)</th>
                </tr>
              </thead>

              <tbody>
                {grn.items.map((it, idx) => (
                  <tr key={it.itemId}>
                    <td className="center">{idx + 1}</td>
                    <td className="center">{it.itemCode || ''}</td>
                    <td>{it.description}</td>
                    <td className="center">{it.uom}</td>
                    <td className="num">{(it.unitPrice || 0).toFixed(2)}</td>

                    <td className="num">{it.billedQty}</td>
                    <td className="num">{it.receivedQty}</td>
                    <td className="num">{((it.receivedQty || 0) - (it.rejectedQty || 0)).toFixed(2)}</td>
                    <td className="num">{(it.rejectedQty || 0).toFixed(2)}</td>
                    <td className="num">{(it.shortQty || 0).toFixed(2)}</td>

                    <td className="num">{(it.basicValue || 0).toFixed(2)}</td>
                    <td className="center">{it.discPercent ? `${it.discPercent}` : '-'}</td>
                    <td className="num">{(it.freight || 0).toFixed(2)}</td>
                    <td className="center">{it.gstPercent || 0}%</td>
                    <td className="num">{(it.valueWithTax || 0).toFixed(2)}</td>
                    <td className="num">{(it.totalGrnValue || 0).toFixed(2)}</td>
                  </tr>
                ))}

                <tr className="total-row">
                  <td className="center" colSpan={5}>TOTAL</td>
                  <td className="num">{totals.billed}</td>
                  <td className="num">{totals.received}</td>
                  <td className="num">{totals.accepted.toFixed(2)}</td>
                  <td className="num">{totals.rejected.toFixed(2)}</td>
                  <td className="num">{totals.short.toFixed(2)}</td>
                  <td className="num">{totals.basic.toFixed(2)}</td>
                  <td className="center">-</td>
                  <td className="num">{totals.freight ? totals.freight.toFixed(2) : '-'}</td>
                  <td className="center">-</td>
                  <td className="num">{totals.withTax.toFixed(2)}</td>
                  <td className="num">{totals.total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <div className="totalsWrap">
              <table className="totalsBox">
                <tbody>
                  <tr><td className="k">Total PO Quantity</td><td className="num">{totals.billed}</td></tr>
                  <tr><td className="k">Total Received Quantity</td><td className="num">{totals.received}</td></tr>
                  <tr><td className="k">Total Accepted Quantity</td><td className="num">{totals.accepted.toFixed(2)}</td></tr>
                  <tr><td className="k">Total Rejected Quantity</td><td className="num">{totals.rejected.toFixed(2)}</td></tr>
                </tbody>
              </table>
              <div className="grandTotal">
                <span>Total GRN Value (₹)</span>
                <span className="amt">₹{totals.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="band">CERTIFICATION</div>
            <div className="certification">
              <p>This is to certify that the items specified above have been received in good condition and quantity as mentioned.</p>
              <p>The quality and quantity of the material have been verified and found satisfactory.</p>
            </div>

            <div className="signatures">
              <div className="sigBlock">
                <div className="sigTitle">Prepared By</div>
                <div>Name: {grn.preparedBy?.name || '-'}</div>
                <div>Designation: {grn.preparedBy?.designation || '-'}</div>
                <div className="sigLine">Date: {formatDate(grn.preparedBy?.timestamp) || '-'}</div>
              </div>
              <div className="sigBlock">
                <div className="sigTitle">Verified By</div>
                <div>Name: {grn.verifiedBy?.name || '-'}</div>
                <div>Designation: {grn.verifiedBy?.designation || '-'}</div>
                <div className="sigLine">Date: {formatDate(grn.verifiedBy?.timestamp) || '-'}</div>
              </div>
              <div className="sigBlock">
                <div className="sigTitle">Approved By</div>
                <div>Name: {grn.approvedBy?.name || '-'}</div>
                <div>Designation: {grn.approvedBy?.designation || '-'}</div>
                <div className="sigLine">Date: {formatDate(grn.approvedBy?.timestamp) || '-'}</div>
              </div>
            </div>

            <div className="footer">
              <div>
                <b>Note:</b>
                <ol>
                  <li>This is a system generated document.</li>
                  <li>No signature is required if digitally approved.</li>
                </ol>
              </div>
              <div className="qr">QR</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
