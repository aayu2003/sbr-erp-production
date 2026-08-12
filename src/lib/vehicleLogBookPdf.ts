// jsPDF-based vehicle log book generator — mirrors grnPdf.ts's header/table styling,
// but simpler: no signer/approval workflow, just a compiled work/fuel history for a period.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo3f from '@/Assets/3f-logo.png';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';

const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001';
const PROJECT_GREEN: [number, number, number] = [13, 58, 53];
const LIGHT_GREEN: [number, number, number] = [241, 247, 245];
const GRID_GREEN: [number, number, number] = [183, 203, 198];

type JsPdfWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

export interface VehicleLogBookWorkEntry {
  date?: string;
  activity?: string;
  request_location?: string;
  staff_id?: string;
  status?: string;
  acres_covered?: number;
}

export interface VehicleLogBookFuelEntry {
  timestamp?: string;
  requested_amount?: number;
  status?: string;
}

export interface VehicleLogBook {
  log_id: string;
  vehicle_id: string;
  vehicle_number?: string;
  vendor_details?: { vendor_id: string; vendor_name: string } | null;
  start_date: string;
  end_date: string;
  log_data_json: {
    work_entries: VehicleLogBookWorkEntry[];
    fuel_entries: VehicleLogBookFuelEntry[];
    service_entries: unknown[];
  };
  // Set when this (rental) log book was also recorded as vendor work in the Operational
  // Calendar — see admin_vehicles.py's generate_log_book — so it can surface as WCC evidence.
  operational_calendar_id?: string | null;
  generated_at: string;
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Failed to read image blob'));
  reader.onload = () => resolve(String(reader.result || ''));
  reader.readAsDataURL(blob);
});

const fetchImageDataUrl = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  return blobToDataUrl(await res.blob());
};

const buildVehicleLogBookPdfDoc = async (logBook: VehicleLogBook): Promise<JsPdfWithAutoTable> => {
  const doc = new jsPDF() as JsPdfWithAutoTable;

  let logoDataUrl: string | null = null;
  try { logoDataUrl = await fetchImageDataUrl(logo3f); } catch { logoDataUrl = null; }
  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 95, 7, 20, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...PROJECT_GREEN);
  doc.text(COMPANY_NAME, 105, 33, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(COMPANY_ADDRESS, 105, 38, { align: 'center' });
  doc.setFillColor(...PROJECT_GREEN);
  doc.roundedRect(14, 41, 182, 7, 1.2, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('VEHICLE LOG BOOK', 105, 46, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(26, 34, 51);

  const vendorLine = logBook.vendor_details?.vendor_name
    ? `Rental — ${logBook.vendor_details.vendor_name}`
    : 'Self-owned';

  autoTable(doc, {
    startY: 50,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, lineColor: GRID_GREEN, lineWidth: 0.15 },
    columnStyles: { 0: { cellWidth: 32 }, 2: { cellWidth: 32 } },
    body: [
      [
        { content: 'Vehicle No.:', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, logBook.vehicle_number || '-',
        { content: 'Ownership:', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, vendorLine,
      ],
      [
        { content: 'Period From:', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, formatDateDDMMYYYY(logBook.start_date),
        { content: 'Period To:', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, formatDateDDMMYYYY(logBook.end_date),
      ],
      [
        { content: 'Log ID:', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, logBook.log_id,
        { content: 'Generated:', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, formatDateDDMMYYYY(logBook.generated_at),
      ],
    ],
  });

  const workEntries = logBook.log_data_json?.work_entries || [];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PROJECT_GREEN);
  doc.text('Work / Trip Entries', 14, doc.lastAutoTable.finalY + 6);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [['Date', 'Activity', 'Location', 'Staff', 'Status', 'Acres Covered']],
    body: workEntries.length > 0
      ? workEntries.map((w) => [
        formatDateDDMMYYYY(w.date),
        w.activity || '-',
        w.request_location || '-',
        w.staff_id || '-',
        w.status || '-',
        typeof w.acres_covered === 'number' ? w.acres_covered.toFixed(2) : '-',
      ])
      : [[{ content: 'No work entries recorded for this period', colSpan: 6, styles: { halign: 'center', textColor: [148, 163, 184] } }]],
    styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: GRID_GREEN, lineWidth: 0.12 },
    headStyles: { fillColor: PROJECT_GREEN, textColor: [255, 255, 255], fontSize: 7.5 },
  });

  const fuelEntries = logBook.log_data_json?.fuel_entries || [];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PROJECT_GREEN);
  doc.text('Fuel Entries', 14, doc.lastAutoTable.finalY + 8);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Date', 'Requested Amount', 'Status']],
    body: fuelEntries.length > 0
      ? fuelEntries.map((f) => [
        formatDateDDMMYYYY(f.timestamp),
        typeof f.requested_amount === 'number' ? f.requested_amount.toFixed(2) : '-',
        f.status || '-',
      ])
      : [[{ content: 'No fuel entries recorded for this period', colSpan: 3, styles: { halign: 'center', textColor: [148, 163, 184] } }]],
    styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: GRID_GREEN, lineWidth: 0.12 },
    headStyles: { fillColor: PROJECT_GREEN, textColor: [255, 255, 255], fontSize: 7.5 },
  });

  return doc;
};

const vehicleLogBookPdfFilename = (logBook: VehicleLogBook) => (
  `LogBook_${(logBook.vehicle_number || logBook.vehicle_id).replace(/[/\\]/g, '_')}_${logBook.start_date}_to_${logBook.end_date}.pdf`
);

export const downloadVehicleLogBookAsPdf = async (logBook: VehicleLogBook) => {
  const doc = await buildVehicleLogBookPdfDoc(logBook);
  doc.save(vehicleLogBookPdfFilename(logBook));
};
