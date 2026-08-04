import { useMemo, useRef } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type GRNRecord } from '@/lib/grnApi';
import logo3f from '@/Assets/3f-logo.png';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';
import { getPersonEntry } from '@/lib/signatureDiary';
import { downloadGrnAsPdf } from '@/lib/grnPdf';
import { loadGrnAnnexure } from '@/lib/grnAnnexure';

const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001';

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

const formatDate = (v?: string) => formatDateDDMMYYYY(v, v || '');
const formatNumber = (value: number, decimals = 2) => value.toLocaleString('en-IN', {
  minimumFractionDigits: decimals,
  maximumFractionDigits: decimals,
});

const imageAsDataUrl = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to load company logo');
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read company logo'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
};

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export function GrnPrint({ grn }: { grn: GRNRecord }) {
  const printRef = useRef<HTMLDivElement>(null);
  const isApproved = grn.status === 'approved';
  const preparedSignature = grn.preparedBy?.name ? getPersonEntry(grn.preparedBy.name)?.signature : '';
  const verifiedSignature = grn.verifiedBy?.name ? getPersonEntry(grn.verifiedBy.name)?.signature : '';
  const approvedSignature = grn.approvedBy?.name ? getPersonEntry(grn.approvedBy.name)?.signature : '';

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

  const onPrint = async () => {
    const content = printRef.current;
    if (!content) return;
    const w = window.open('', '_blank');
    if (!w) return;

    let printableMarkup = content.innerHTML;
    let printableLogo = new URL(logo3f, window.location.href).href;
    try {
      printableLogo = await imageAsDataUrl(logo3f);
      printableMarkup = printableMarkup.replace(/(<img[^>]+src=")[^"]+("[^>]*>)/i, `$1${printableLogo}$2`);
    } catch {
      // Keep the resolved application URL as a fallback if data-URL conversion is blocked.
      printableMarkup = printableMarkup.replace(/(<img[^>]+src=")[^"]+("[^>]*>)/i, `$1${printableLogo}$2`);
    }
    const annexure = await loadGrnAnnexure(grn).catch(() => ({ gateEntries: [], itemPictures: [] }));
    const gateRows = annexure.gateEntries.length
      ? annexure.gateEntries.map((entry) => `<tr>
          <td>${escapeHtml(entry.siteEntryNo || entry.enteryId)}</td>
          <td>${escapeHtml(formatDate(entry.entryDate))} ${escapeHtml(entry.entryTime)}</td>
          <td>${escapeHtml(entry.destinationName || entry.gateNo || '-')}</td>
          <td>${escapeHtml(entry.vendorName || '-')}</td>
          <td>${escapeHtml(entry.invoiceNumber || '-')} / ${escapeHtml(entry.challanNumber || '-')}</td>
          <td>${escapeHtml(entry.itemName || '-')}</td>
          <td class="num">${escapeHtml(formatNumber(entry.itemQuantity || 0))} ${escapeHtml(entry.itemUnit || '')}</td>
        </tr>`).join('')
      : '<tr><td colspan="7" class="empty">Gate entry details are not available.</td></tr>';
    const pictureCards = annexure.itemPictures.length
      ? annexure.itemPictures.map((picture) => `<div class="pictureCard">
          ${picture.imageUrl ? `<img src="${escapeHtml(picture.imageUrl)}" alt="${escapeHtml(picture.itemName)}" />` : '<div class="pictureEmpty">No picture recorded</div>'}
          <div class="pictureCaption"><b>${escapeHtml(picture.itemName)}</b><span>${escapeHtml(picture.itemCode || picture.itemId)}</span></div>
        </div>`).join('')
      : '<div class="empty">No item pictures are available.</div>';
    printableMarkup += `<section class="annexure">
      <div class="header"><img src="${printableLogo}" alt="Sai Bioresources" /><div class="company">${COMPANY_NAME}</div><div class="companyAddr">${COMPANY_ADDRESS}</div></div>
      <div class="annexureTitle">ANNEXURE - A</div>
      <div class="annexureRef">Gate Entry Details and Item Pictures - GRN ${escapeHtml(grn.grnNo)} - PO ${escapeHtml(grn.poNo)}</div>
      <table class="annexureTable"><thead><tr><th>Gate Entry No.</th><th>Date & Time</th><th>Gate / Destination</th><th>Vendor</th><th>Invoice / Challan</th><th>Item</th><th>Quantity</th></tr></thead><tbody>${gateRows}</tbody></table>
      <div class="band">ITEM PICTURES</div><div class="pictures">${pictureCards}</div>
    </section>`;

    w.document.write(`
      <html><head><title>${grn.grnNo}</title>
      <style>
        @page { size: A4; margin: 10mm; }
        html, body, .sheet, .sheet * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; color: #1a2233; }
        .sheet { border: 1px solid #b7cbc6; border-radius: 14px; padding: 16px; }

        .header { text-align: center; margin-bottom: 10px; }
        .header img { height: 64px; width: auto; margin-bottom: 5px; object-fit: contain; }
        .company { font-weight: 800; font-size: 18px; margin: 2px 0; letter-spacing: 0.3px; }
        .companyAddr { font-size: 10.5px; color: #4a5568; margin-bottom: 6px; }
        .docTitle { background: #0D3A35; color: #fff; border-radius: 6px; padding: 6px; font-weight: 800; font-size: 14px; letter-spacing: 1px; margin: 8px 0 0; }

        table { width: 100%; border-collapse: collapse; }

        .topGrid td { border: 1px solid #c7d2e0; padding: 6px 8px; font-size: 11px; }
        .topGrid { margin-top: 10px; }
        .topGrid .k { font-weight: 700; width: 22%; background: #f1f7f5; color: #0D3A35; }
        .topGrid .v { width: 28%; }

        .band { background: #0D3A35; color: #fff; text-align: center; font-weight: 800; font-size: 11px; letter-spacing: 1px; padding: 5px; margin-top: 10px; border-radius: 6px 6px 0 0; }

        .particulars td { border: 1px solid #c7d2e0; padding: 6px 8px; font-size: 11px; vertical-align: top; }
        .particulars .k { font-weight: 700; width: 20%; background: #f1f7f5; color: #0D3A35; }
        .particulars .v { width: 30%; }

        .items { margin-top: 12px; }
        .items th, .items td { border: 1px solid #c7d2e0; padding: 4px 5px; font-size: 10px; }
        .items thead { display: table-header-group; }
        .items thead th { font-weight: 700; background-color: #fff !important; color: #1a2233 !important; border-color: #9fb8b2; }
        .center { text-align: center; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .total-row td { font-weight: 800; background: #f1f7f5; }

        .totalsWrap { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; align-items: stretch; }
        .totalsBox td { border: 1px solid #c7d2e0; padding: 5px 8px; font-size: 11px; }
        .totalsBox .k { font-weight: 700; background: #f1f7f5; color: #0D3A35; }
        .grandTotal { box-sizing: border-box; height: 100%; border: 2px solid #0D3A35; background: #f1f7f5; border-radius: 8px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-weight: 800; }
        .grandTotal .amt { font-size: 20px; color: #0D3A35; white-space: nowrap; }

        .notes { min-height: 32px; border: 1px solid #c7d2e0; border-radius: 0 0 8px 8px; background: #f8fbfa; padding: 8px 10px; font-size: 10.5px; color: #4a5568; }

        .annexure { page-break-before: always; border: 1px solid #b7cbc6; border-radius: 14px; padding: 16px; box-sizing: border-box; }
        .annexureTitle { background: #0D3A35; color: #fff; border-radius: 6px; padding: 7px; text-align: center; font-weight: 800; font-size: 14px; letter-spacing: 2px; }
        .annexureRef { margin: 7px 0 10px; text-align: center; font-size: 10px; color: #4a5568; }
        .annexureTable th, .annexureTable td { border: 1px solid #c7d2e0; padding: 5px; font-size: 9px; vertical-align: top; }
        .annexureTable th { background: #fff; color: #1a2233; text-align: center; font-weight: 700; }
        .empty { padding: 18px !important; text-align: center; color: #718096; font-size: 10px; }
        .pictures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; border: 1px solid #c7d2e0; border-radius: 0 0 6px 6px; padding: 10px; }
        .pictureCard { overflow: hidden; border: 1px solid #c7d2e0; border-radius: 7px; background: #f8fbfa; break-inside: avoid; }
        .pictureCard img, .pictureEmpty { width: 100%; height: 120px; object-fit: contain; box-sizing: border-box; padding: 6px; background: #fff; }
        .pictureEmpty { display: flex; align-items: center; justify-content: center; color: #718096; font-size: 10px; }
        .pictureCaption { border-top: 1px solid #c7d2e0; padding: 6px 8px; font-size: 9px; }
        .pictureCaption b, .pictureCaption span { display: block; }
        .pictureCaption span { margin-top: 2px; color: #718096; font-family: monospace; }

        .certification { margin-top: 12px; border: 1px solid #c7d2e0; border-radius: 0 0 8px 8px; padding: 8px 10px; font-size: 10.5px; }
        .certification p { margin: 2px 0; }

        .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
        .sigBlock { border: 1px solid #c7d2e0; border-radius: 8px; padding: 8px 10px; font-size: 10.5px; }
        .sigTitle { font-weight: 800; margin-bottom: 4px; color: #0D3A35; }
        .sigLine { margin-top: 14px; border-top: 1px dashed #c7d2e0; padding-top: 3px; color: #4a5568; }
        .digitalSign { min-height: 48px; margin: 4px 0 7px; padding: 5px; border: 1px solid #a7d8c4; border-radius: 6px; background: #f1f7f5; color: #137052; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .digitalSign img { display: block; max-width: 100%; height: 30px; object-fit: contain; margin-bottom: 2px; }
        .digitalSign strong { font-size: 9px; letter-spacing: .7px; text-transform: uppercase; }
        .digitalSign span { font-size: 8px; }

      </style></head><body>
      ${printableMarkup}
      </body></html>
    `);

    w.document.close();
    const images = Array.from(w.document.images);
    await Promise.all(images.map((image) => image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      })));
    await w.document.fonts?.ready;
    w.focus();
    window.setTimeout(() => {
      w.print();
      w.close();
    }, 150);
  };

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" className="gap-2" onClick={onPrint}>
        <Printer className="h-4 w-4" /> Print GRN
      </Button>
      <Button
        type="button"
        size="sm"
        className="gap-2 bg-[#0D3A35] text-white hover:bg-[#092e2a]"
        onClick={() => void downloadGrnAsPdf(grn)}
      >
        <Download className="h-4 w-4" /> Download PDF
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
                  <td className="v">{formatDate(grn.geDate) || '-'}</td>
                </tr>
              </tbody>
            </table>

            <div className="band">PARTICULARS</div>
            <table className="particulars">
              <tbody>
                <tr>
                  <td className="k">Purchase Order No.</td>
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
                  <td className="v">{formatDate(grn.invDate) || '-'}</td>
                </tr>
                <tr>
                  <td className="k">Challan No.</td>
                  <td className="v">{grn.challanNo || '-'}</td>
                  <td className="k">Challan Date</td>
                  <td className="v">{formatDate(grn.challanDate) || '-'}</td>
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
                    <td className="num">{formatNumber(it.unitPrice || 0, 2)}</td>

                    <td className="num">{formatNumber(it.billedQty || 0)}</td>
                    <td className="num">{formatNumber(it.receivedQty || 0)}</td>
                    <td className="num">{formatNumber((it.receivedQty || 0) - (it.rejectedQty || 0), 2)}</td>
                    <td className="num">{formatNumber(it.rejectedQty || 0, 2)}</td>
                    <td className="num">{formatNumber(it.shortQty || 0, 2)}</td>

                    <td className="num">{formatNumber(it.basicValue || 0, 2)}</td>
                    <td className="center">{formatNumber(it.discPercent || 0)}</td>
                    <td className="num">{formatNumber(it.freight || 0, 2)}</td>
                    <td className="center">{formatNumber(it.gstPercent || 0)}%</td>
                    <td className="num">{formatNumber(it.valueWithTax || 0, 2)}</td>
                    <td className="num">{formatNumber(it.totalGrnValue || 0, 2)}</td>
                  </tr>
                ))}

                <tr className="total-row">
                  <td className="center" colSpan={5}>TOTAL</td>
                  <td className="num">{formatNumber(totals.billed)}</td>
                  <td className="num">{formatNumber(totals.received)}</td>
                  <td className="num">{formatNumber(totals.accepted, 2)}</td>
                  <td className="num">{formatNumber(totals.rejected, 2)}</td>
                  <td className="num">{formatNumber(totals.short, 2)}</td>
                  <td className="num">{formatNumber(totals.basic, 2)}</td>
                  <td className="center">-</td>
                  <td className="num">{formatNumber(totals.freight, 2)}</td>
                  <td className="center">-</td>
                  <td className="num">{formatNumber(totals.withTax, 2)}</td>
                  <td className="num">{formatNumber(totals.total, 2)}</td>
                </tr>
              </tbody>
            </table>

            <div className="totalsWrap">
              <table className="totalsBox">
                <tbody>
                  <tr><td className="k">Total PO Quantity</td><td className="num">{formatNumber(totals.billed)}</td></tr>
                  <tr><td className="k">Total Received Quantity</td><td className="num">{formatNumber(totals.received)}</td></tr>
                  <tr><td className="k">Total Accepted Quantity</td><td className="num">{formatNumber(totals.accepted, 2)}</td></tr>
                  <tr><td className="k">Total Rejected Quantity</td><td className="num">{formatNumber(totals.rejected, 2)}</td></tr>
                </tbody>
              </table>
              <div className="grandTotal">
                <span>Total GRN Value (₹)</span>
                <span className="amt">₹{formatNumber(totals.total, 2)}</span>
              </div>
            </div>

            <div className="band">NOTES</div>
            <div className="notes">{grn.remarks || 'No additional notes recorded.'}</div>

            <div className="band">CERTIFICATION</div>
            <div className="certification">
              <p>This is to certify that the items specified above have been received in good condition and quantity as mentioned.</p>
              <p>The quality and quantity of the material have been verified and found satisfactory.</p>
            </div>

            <div className="signatures">
              <div className="sigBlock">
                <div className="sigTitle">Prepared By</div>
                {isApproved && grn.preparedBy && <div className="digitalSign">{preparedSignature && <img src={preparedSignature} alt="Prepared by digital signature" />}<strong>Digitally Signed</strong><span>Approval recorded electronically</span></div>}
                <div>Name: {grn.preparedBy?.name || '-'}</div>
                <div>Designation: {grn.preparedBy?.designation || '-'}</div>
                <div className="sigLine">Date: {formatDate(grn.preparedBy?.timestamp) || '-'}</div>
              </div>
              <div className="sigBlock">
                <div className="sigTitle">Verified By</div>
                {isApproved && grn.verifiedBy && <div className="digitalSign">{verifiedSignature && <img src={verifiedSignature} alt="Verified by digital signature" />}<strong>Digitally Signed</strong><span>Approval recorded electronically</span></div>}
                <div>Name: {grn.verifiedBy?.name || '-'}</div>
                <div>Designation: {grn.verifiedBy?.designation || '-'}</div>
                <div className="sigLine">Date: {formatDate(grn.verifiedBy?.timestamp) || '-'}</div>
              </div>
              <div className="sigBlock">
                <div className="sigTitle">Approved By</div>
                {isApproved && grn.approvedBy && <div className="digitalSign">{approvedSignature && <img src={approvedSignature} alt="Approved by digital signature" />}<strong>Digitally Signed</strong><span>Approval recorded electronically</span></div>}
                <div>Name: {grn.approvedBy?.name || '-'}</div>
                <div>Designation: {grn.approvedBy?.designation || '-'}</div>
                <div className="sigLine">Date: {formatDate(grn.approvedBy?.timestamp) || '-'}</div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
