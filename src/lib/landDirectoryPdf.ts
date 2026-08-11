import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

import logo3f from '@/Assets/3f-logo.png';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';

const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001';
const COMPANY_DETAILS = 'GSTIN: 22ARPCS5442R1ZM  |  Phone: +91 75870 76870  |  Email: rajendra.s@saiobioenergy.com';
const PROJECT_GREEN: [number, number, number] = [13, 58, 53];
const LIGHT_GREEN: [number, number, number] = [237, 245, 242];
const GRID_SLATE: [number, number, number] = [203, 213, 225];
const TEXT_SLATE: [number, number, number] = [51, 65, 85];
const MUTED_SLATE: [number, number, number] = [100, 116, 139];

export type LandDirectoryPdfRecord = {
  parcelId: string;
  ownerName: string;
  location: string;
  crop: string;
  areaAcres: number;
  plotCount: number;
  investment: number;
};

export type LandDirectoryPdfOptions = {
  generatedBy?: string;
};

export type LandDetailsPdfPlot = {
  id: string;
  name: string;
  crop: string;
  areaAcres: number;
  coordinates: [number, number][];
  createdAt: string;
};

export type LandDetailsPdfMapping = {
  name: string;
  type: string;
  shape: string;
  coordinates: [number, number][];
  details: string;
};

export type LandDetailsPdfHistory = {
  type: string;
  title: string;
  date: string;
  status: string;
  description: string;
};

export type LandDetailsPdfInvestment = {
  date: string;
  voucher: string;
  item: string;
  code: string;
  quantity: string;
  description: string;
  amount: number;
};

export type LandDetailsPdfRecord = {
  parcelId: string;
  ownerName: string;
  ownerId: string;
  blockId: string;
  farmingType: string;
  crop: string;
  areaAcres: number;
  priority: string;
  village: string;
  district: string;
  state: string;
  createdAt: string;
  boundary: [number, number][];
  plots: LandDetailsPdfPlot[];
  mappings: LandDetailsPdfMapping[];
  supervisor: string;
  supervisorContact: string;
  fieldManagers: string;
  fieldManagerContacts: string;
  imageCount: number;
  hasVideo: boolean;
  history: LandDetailsPdfHistory[];
  investments: LandDetailsPdfInvestment[];
};

const display = (value: unknown, fallback = 'Not Recorded') => {
  const normalized = String(value ?? '').trim();
  return normalized && normalized.toLowerCase() !== 'n/a' ? normalized : fallback;
};

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

const reportMetadata = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return {
    reportId: `LDR-${year}${month}${day}-${hours}${minutes}`,
    generatedOn: `${formatDateDDMMYYYY(date)} ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
  };
};

const drawPageFrame = (
  doc: jsPDF,
  pageNumber: number,
  pageCount: number,
  reportId: string,
  footerTitle = 'System-generated Land Directory Summary',
) => {
  doc.setDrawColor(184, 197, 209);
  doc.setLineWidth(0.3);
  doc.rect(8, 8, 194, 281);
  doc.setDrawColor(...GRID_SLATE);
  doc.setLineWidth(0.2);
  doc.line(12, 280, 198, 280);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(...MUTED_SLATE);
  doc.text(footerTitle, 12, 284);
  doc.text(`Report ID: ${reportId}`, 105, 284, { align: 'center' });
  doc.text(`Page ${pageNumber} of ${pageCount}`, 198, 284, { align: 'right' });
};

export const buildLandDirectoryPdf = async (
  records: LandDirectoryPdfRecord[],
  options: LandDirectoryPdfOptions = {},
) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date();
  const { reportId, generatedOn } = reportMetadata(now);
  let logoDataUrl = '';
  try {
    logoDataUrl = await imageAsDataUrl(new URL(logo3f, window.location.href).href);
  } catch {
    logoDataUrl = '';
  }

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 297, 'F');
  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 97, 11, 16, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 45, 76);
  doc.text(COMPANY_NAME, 105, 33, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(82, 97, 115);
  doc.setFontSize(6.2);
  doc.text(COMPANY_ADDRESS, 105, 38, { align: 'center' });
  doc.text(COMPANY_DETAILS, 105, 42.5, { align: 'center' });
  doc.setDrawColor(...PROJECT_GREEN);
  doc.setLineWidth(0.6);
  doc.line(12, 47, 198, 47);
  doc.setFillColor(...PROJECT_GREEN);
  doc.rect(12, 50, 186, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('LAND DIRECTORY SUMMARY', 105, 56.2, { align: 'center' });

  const metadata = [
    { label: 'Report ID', value: reportId },
    { label: 'Land Parcels', value: records.length.toLocaleString('en-IN') },
    { label: 'Generated On', value: generatedOn },
    { label: 'Generated By', value: display(options.generatedBy, 'System User') },
  ];
  const metadataWidth = 186 / metadata.length;
  metadata.forEach((entry, index) => {
    const x = 12 + index * metadataWidth;
    doc.setDrawColor(...GRID_SLATE);
    doc.rect(x, 61, metadataWidth, 13);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(...MUTED_SLATE);
    doc.text(entry.label.toUpperCase(), x + 2, 65);
    doc.setFontSize(6.3);
    doc.setTextColor(20, 45, 76);
    doc.text(doc.splitTextToSize(entry.value, metadataWidth - 4).slice(0, 2), x + 2, 70);
  });

  const totalArea = records.reduce((sum, record) => sum + (Number(record.areaAcres) || 0), 0);
  const totalPlots = records.reduce((sum, record) => sum + (Number(record.plotCount) || 0), 0);
  const totalInvestment = records.reduce((sum, record) => sum + (Number(record.investment) || 0), 0);
  const cropCount = new Set(records.map((record) => display(record.crop, '').trim().toLowerCase()).filter(Boolean)).size;
  const summaries = [
    { label: 'Total Land Area', value: `${totalArea.toLocaleString('en-IN', { maximumFractionDigits: 3 })} acres` },
    { label: 'Total Plots', value: totalPlots.toLocaleString('en-IN') },
    { label: 'Crop Types', value: cropCount.toLocaleString('en-IN') },
    { label: 'Total Investment', value: `Rs. ${totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` },
  ];
  const summaryWidth = 186 / summaries.length;
  summaries.forEach((entry, index) => {
    const x = 12 + index * summaryWidth;
    doc.setDrawColor(...GRID_SLATE);
    doc.setFillColor(...LIGHT_GREEN);
    doc.rect(x, 77, summaryWidth, 14, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.6);
    doc.setTextColor(...MUTED_SLATE);
    doc.text(entry.label.toUpperCase(), x + 2, 81.5);
    doc.setFontSize(6.4);
    doc.setTextColor(...PROJECT_GREEN);
    doc.text(doc.splitTextToSize(entry.value, summaryWidth - 4).slice(0, 2), x + 2, 87);
  });

  const totalRowStyles = {
    fillColor: LIGHT_GREEN,
    textColor: PROJECT_GREEN,
    fontStyle: 'bold' as const,
    lineColor: PROJECT_GREEN,
  };
  const tableBody = records.length ? [
    ...records.map((record, index) => [
      index + 1,
      display(record.parcelId),
      display(record.ownerName),
      display(record.location),
      display(record.crop),
      (Number(record.areaAcres) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 }),
      (Number(record.plotCount) || 0).toLocaleString('en-IN'),
      `Rs. ${(Number(record.investment) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
    ]),
    [
      { content: 'TOTAL', colSpan: 5, styles: { ...totalRowStyles, halign: 'right' as const } },
      { content: totalArea.toLocaleString('en-IN', { maximumFractionDigits: 3 }), styles: { ...totalRowStyles, halign: 'right' as const } },
      { content: totalPlots.toLocaleString('en-IN'), styles: { ...totalRowStyles, halign: 'center' as const } },
      { content: `Rs. ${totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, styles: { ...totalRowStyles, halign: 'right' as const } },
    ],
  ] : [[{ content: 'No land parcels recorded.', colSpan: 8, styles: { halign: 'center' as const } }]];

  autoTable(doc, {
    startY: 95,
    margin: { top: 18, right: 12, bottom: 20, left: 12 },
    head: [[
      'S.No.', 'Land Parcel ID', 'Land Owner Name', 'Location', 'Crop', 'Area (Acres)', 'Plots', 'Investment',
    ]],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 4.8,
      cellPadding: 1,
      lineColor: GRID_SLATE,
      lineWidth: 0.18,
      textColor: TEXT_SLATE,
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: PROJECT_GREEN,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      fontSize: 4.6,
      minCellHeight: 8,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 23 },
      2: { cellWidth: 30 },
      3: { cellWidth: 39 },
      4: { cellWidth: 18 },
      5: { cellWidth: 19, halign: 'right' },
      6: { cellWidth: 12, halign: 'center' },
      7: { cellWidth: 37, halign: 'right' },
    },
    willDrawPage: ({ pageNumber }) => {
      if (pageNumber > 1) {
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, 210, 297, 'F');
      }
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    drawPageFrame(doc, page, pageCount, reportId);
  }
  return doc;
};

export const printLandDirectoryAsPdf = async (
  records: LandDirectoryPdfRecord[],
  options: LandDirectoryPdfOptions = {},
) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Pop-up blocked. Please allow pop-ups to print.');

  try {
    printWindow.document.title = 'Generating Land Directory...';
    const doc = await buildLandDirectoryPdf(records, options);
    doc.autoPrint();
    printWindow.location.href = String(doc.output('bloburl'));
  } catch (error) {
    printWindow.close();
    throw error;
  }
};

const mappingPalette: Array<[number, number, number]> = [
  [234, 88, 12], [37, 99, 235], [147, 51, 234], [8, 145, 178],
  [220, 38, 38], [22, 163, 74], [180, 83, 9], [219, 39, 119],
];

const drawLandDetailsHeader = (doc: jsPDF, logoDataUrl: string) => {
  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 97, 11, 16, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 45, 76);
  doc.text(COMPANY_NAME, 105, 33, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(82, 97, 115);
  doc.text(COMPANY_ADDRESS, 105, 38, { align: 'center' });
  doc.text(COMPANY_DETAILS, 105, 42.5, { align: 'center' });
  doc.setDrawColor(...PROJECT_GREEN);
  doc.setLineWidth(0.6);
  doc.line(12, 47, 198, 47);
  doc.setFillColor(...PROJECT_GREEN);
  doc.rect(12, 50, 186, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('LAND PARCEL DETAILS', 105, 56.2, { align: 'center' });
};

const satelliteMapDataUrl = async (coordinates: [number, number][]) => {
  if (!coordinates.length) return '';
  const lats = coordinates.map(([lat]) => lat).filter(Number.isFinite);
  const lngs = coordinates.map(([, lng]) => lng).filter(Number.isFinite);
  if (!lats.length || !lngs.length) return '';
  const rawLatSpan = Math.max(...lats) - Math.min(...lats);
  const rawLngSpan = Math.max(...lngs) - Math.min(...lngs);
  const latPadding = Math.max(rawLatSpan * 0.18, 0.0006);
  const lngPadding = Math.max(rawLngSpan * 0.18, 0.0006);
  const bbox = [
    Math.min(...lngs) - lngPadding,
    Math.min(...lats) - latPadding,
    Math.max(...lngs) + lngPadding,
    Math.max(...lats) + latPadding,
  ].join(',');
  const url = new URL('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export');
  url.searchParams.set('bbox', bbox);
  url.searchParams.set('bboxSR', '4326');
  url.searchParams.set('imageSR', '4326');
  url.searchParams.set('size', '1200,760');
  url.searchParams.set('format', 'png32');
  url.searchParams.set('f', 'image');
  try {
    return await imageAsDataUrl(url.href);
  } catch {
    return '';
  }
};

const drawLandMapping = async (doc: jsPDF, record: LandDetailsPdfRecord, y: number) => {
  const mapX = 12;
  const mapY = y;
  const mapWidth = 186;
  const mapHeight = 112;
  const allCoordinates = [
    ...record.boundary,
    ...record.plots.flatMap((plot) => plot.coordinates),
    ...record.mappings.flatMap((mapping) => mapping.coordinates),
  ].filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(...GRID_SLATE);
  doc.roundedRect(mapX, mapY, mapWidth, mapHeight, 1.5, 1.5, 'FD');
  const satelliteImage = await satelliteMapDataUrl(allCoordinates);
  if (satelliteImage) doc.addImage(satelliteImage, 'PNG', mapX + 0.4, mapY + 0.4, mapWidth - 0.8, mapHeight - 0.8);

  if (!allCoordinates.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED_SLATE);
    doc.text('No mapping coordinates recorded', 105, mapY + mapHeight / 2, { align: 'center' });
    return;
  }

  const lats = allCoordinates.map(([lat]) => lat);
  const lngs = allCoordinates.map(([, lng]) => lng);
  const rawLatSpan = Math.max(...lats) - Math.min(...lats);
  const rawLngSpan = Math.max(...lngs) - Math.min(...lngs);
  const latPadding = Math.max(rawLatSpan * 0.18, 0.0006);
  const lngPadding = Math.max(rawLngSpan * 0.18, 0.0006);
  const minLat = Math.min(...lats) - latPadding;
  const maxLat = Math.max(...lats) + latPadding;
  const minLng = Math.min(...lngs) - lngPadding;
  const maxLng = Math.max(...lngs) + lngPadding;
  const toPoint = ([lat, lng]: [number, number]) => ({
    x: mapX + ((lng - minLng) / Math.max(maxLng - minLng, 0.000001)) * mapWidth,
    y: mapY + mapHeight - ((lat - minLat) / Math.max(maxLat - minLat, 0.000001)) * mapHeight,
  });
  const drawPath = (coordinates: [number, number][], color: [number, number, number], closed: boolean, width = 0.7) => {
    if (coordinates.length < 2) return;
    doc.setDrawColor(...color);
    doc.setLineWidth(width);
    const points = coordinates.map(toPoint);
    points.slice(1).forEach((point, index) => doc.line(points[index].x, points[index].y, point.x, point.y));
    if (closed && points.length > 2) doc.line(points[points.length - 1].x, points[points.length - 1].y, points[0].x, points[0].y);
  };

  drawPath(record.boundary, [253, 224, 71], true, 1.2);
  record.plots.forEach((plot, index) => {
    const color = mappingPalette[index % mappingPalette.length];
    drawPath(plot.coordinates, color, true, 0.8);
    if (plot.coordinates.length) {
      const center = plot.coordinates.reduce((sum, coordinate) => {
        const point = toPoint(coordinate);
        return { x: sum.x + point.x, y: sum.y + point.y };
      }, { x: 0, y: 0 });
      doc.setFillColor(255, 255, 255);
      doc.setTextColor(...color);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.text(display(plot.name, `Plot ${index + 1}`), center.x / plot.coordinates.length, center.y / plot.coordinates.length, { align: 'center' });
    }
  });
  record.mappings.forEach((mapping, index) => {
    const color = mappingPalette[(index + record.plots.length) % mappingPalette.length];
    const shape = mapping.shape.toLowerCase();
    if (shape === 'point') {
      mapping.coordinates.forEach((coordinate) => {
        const point = toPoint(coordinate);
        doc.setFillColor(...color);
        doc.circle(point.x, point.y, 1.6, 'F');
        doc.setFillColor(255, 255, 255);
        doc.setTextColor(...color);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5);
        doc.text(display(mapping.name), point.x + 2.2, point.y + 1.2);
      });
    } else {
      drawPath(mapping.coordinates, color, shape === 'polygon', 0.9);
    }
  });
};

export const buildLandDetailsPdf = async (
  record: LandDetailsPdfRecord,
  options: LandDirectoryPdfOptions = {},
) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date();
  const { reportId, generatedOn } = reportMetadata(now);
  let logoDataUrl = '';
  try {
    logoDataUrl = await imageAsDataUrl(new URL(logo3f, window.location.href).href);
  } catch {
    logoDataUrl = '';
  }
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 297, 'F');
  drawLandDetailsHeader(doc, logoDataUrl);
  const prepareTableSection = (title: string, count: number, proposedY: number) => {
    let sectionY = proposedY;
    if (sectionY > 245) {
      doc.addPage();
      sectionY = 18;
    }
    doc.setFillColor(...LIGHT_GREEN);
    doc.setDrawColor(...PROJECT_GREEN);
    doc.setLineWidth(0.25);
    doc.rect(12, sectionY, 186, 7, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...PROJECT_GREEN);
    doc.text(title.toUpperCase(), 14, sectionY + 4.7);
    doc.setFontSize(6.2);
    doc.text(`${count.toLocaleString('en-IN')} RECORD${count === 1 ? '' : 'S'}`, 196, sectionY + 4.7, { align: 'right' });
    return sectionY + 9;
  };

  autoTable(doc, {
    startY: 62,
    margin: { left: 12, right: 12 },
    body: [
      ['Land Parcel ID', display(record.parcelId), 'Land Owner', display(record.ownerName)],
      ['Land Owner ID', display(record.ownerId), 'Block ID', display(record.blockId)],
      ['Location', display([record.village, record.district, record.state].filter(Boolean).join(', ')), 'Farming Type', display(record.farmingType)],
      ['Crop', display(record.crop), 'Total Area', `${record.areaAcres.toLocaleString('en-IN', { maximumFractionDigits: 3 })} acres`],
      ['Priority', display(record.priority), 'Created On', record.createdAt ? formatDateDDMMYYYY(record.createdAt, display(record.createdAt)) : 'Not Recorded'],
      ['Supervisor', display(record.supervisor), 'Field Manager(s)', display(record.fieldManagers)],
      ['Supervisor Contact', display(record.supervisorContact), 'Manager Contact(s)', display(record.fieldManagerContacts)],
      ['Land Media', `${record.imageCount} image(s)`, 'Land Video', record.hasVideo ? 'Available' : 'Not Uploaded'],
    ],
    theme: 'grid',
    styles: { fontSize: 5.8, cellPadding: 1.1, lineColor: GRID_SLATE, lineWidth: 0.18, textColor: TEXT_SLATE },
    columnStyles: {
      0: { cellWidth: 26, fillColor: LIGHT_GREEN, fontStyle: 'bold', textColor: PROJECT_GREEN },
      1: { cellWidth: 67 },
      2: { cellWidth: 26, fillColor: LIGHT_GREEN, fontStyle: 'bold', textColor: PROJECT_GREEN },
      3: { cellWidth: 67 },
    },
  });
  const mapStartY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(...GRID_SLATE);
  doc.rect(12, mapStartY, 186, 7, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...TEXT_SLATE);
  doc.text(`LAND MAPPING - ${record.boundary.length} BOUNDARY POINTS`, 14, mapStartY + 4.7);
  await drawLandMapping(doc, record, mapStartY + 9);

  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 297, 'F');
  let currentY = prepareTableSection('Land Plots', record.plots.length, 18);
  autoTable(doc, {
    startY: currentY,
    margin: { top: 18, right: 12, bottom: 20, left: 12 },
    head: [['Plot ID', 'Plot Name', 'Crop', 'Area (Acres)', 'Boundary Points', 'Created On']],
    body: record.plots.length ? record.plots.map((plot) => [
      display(plot.id), display(plot.name), display(plot.crop),
      plot.areaAcres.toLocaleString('en-IN', { maximumFractionDigits: 3 }),
      plot.coordinates.length.toLocaleString('en-IN'),
      plot.createdAt ? formatDateDDMMYYYY(plot.createdAt, display(plot.createdAt)) : 'Not Recorded',
    ]) : [[{ content: 'No plots recorded.', colSpan: 6, styles: { halign: 'center' } }]],
    theme: 'grid',
    styles: { fontSize: 5.3, cellPadding: 1.2, lineColor: GRID_SLATE, lineWidth: 0.18, textColor: TEXT_SLATE },
    headStyles: { fillColor: PROJECT_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  currentY = prepareTableSection(
    'Additional Mappings',
    record.mappings.length,
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
  );
  autoTable(doc, {
    startY: currentY,
    margin: { top: 18, right: 12, bottom: 20, left: 12 },
    head: [['Mapping Name', 'Type', 'Shape', 'Coordinates', 'Details']],
    body: record.mappings.length ? record.mappings.map((mapping) => [
      display(mapping.name), display(mapping.type), display(mapping.shape), mapping.coordinates.length.toLocaleString('en-IN'), display(mapping.details),
    ]) : [[{ content: 'No additional mappings recorded.', colSpan: 5, styles: { halign: 'center' } }]],
    theme: 'grid',
    styles: { fontSize: 5.2, cellPadding: 1.2, lineColor: GRID_SLATE, lineWidth: 0.18, textColor: TEXT_SLATE },
    headStyles: { fillColor: PROJECT_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 30 }, 2: { cellWidth: 22 }, 3: { cellWidth: 22, halign: 'center' }, 4: { cellWidth: 76 } },
  });

  currentY = prepareTableSection(
    'Land History and Activities',
    record.history.length,
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
  );
  autoTable(doc, {
    startY: currentY,
    margin: { top: 18, right: 12, bottom: 20, left: 12 },
    head: [['Type', 'Activity / Item', 'Date', 'Status', 'Description']],
    body: record.history.length ? record.history.map((item) => [
      display(item.type), display(item.title), item.date ? formatDateDDMMYYYY(item.date, display(item.date)) : 'Not Recorded', display(item.status), display(item.description),
    ]) : [[{ content: 'No land history recorded.', colSpan: 5, styles: { halign: 'center' } }]],
    theme: 'grid',
    styles: { fontSize: 5.1, cellPadding: 1.1, lineColor: GRID_SLATE, lineWidth: 0.18, textColor: TEXT_SLATE },
    headStyles: { fillColor: PROJECT_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 42 }, 2: { cellWidth: 25 }, 3: { cellWidth: 25 }, 4: { cellWidth: 74 } },
  });

  const totalInvestment = record.investments.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  currentY = prepareTableSection(
    'Investment Ledger',
    record.investments.length,
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
  );
  autoTable(doc, {
    startY: currentY,
    margin: { top: 18, right: 12, bottom: 20, left: 12 },
    head: [['Date', 'Voucher', 'Item', 'Code', 'Quantity', 'Description', 'Amount']],
    body: record.investments.length ? [
      ...record.investments.map((entry) => [
        entry.date ? formatDateDDMMYYYY(entry.date, display(entry.date)) : 'Not Recorded', display(entry.voucher), display(entry.item), display(entry.code), display(entry.quantity), display(entry.description), `Rs. ${entry.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
      ]),
      [{ content: 'TOTAL INVESTMENT', colSpan: 6, styles: { fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN, fontStyle: 'bold', halign: 'right' } }, { content: `Rs. ${totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, styles: { fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN, fontStyle: 'bold', halign: 'right' } }],
    ] : [[{ content: 'No investment entries recorded.', colSpan: 7, styles: { halign: 'center' } }]],
    theme: 'grid',
    styles: { fontSize: 4.9, cellPadding: 1.05, lineColor: GRID_SLATE, lineWidth: 0.18, textColor: TEXT_SLATE },
    headStyles: { fillColor: PROJECT_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 25 }, 2: { cellWidth: 34 }, 3: { cellWidth: 22 }, 4: { cellWidth: 25 }, 5: { cellWidth: 35 }, 6: { cellWidth: 23, halign: 'right' } },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    drawPageFrame(doc, page, pageCount, reportId, 'System-generated Land Parcel Details');
    if (page > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...PROJECT_GREEN);
      doc.text(`${record.parcelId} - ${record.ownerName}`, 12, 13);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED_SLATE);
      doc.text(`Generated on ${generatedOn} by ${display(options.generatedBy, 'System User')}`, 198, 13, { align: 'right' });
    }
  }
  return doc;
};

export const printLandDetailsAsPdf = async (
  record: LandDetailsPdfRecord,
  options: LandDirectoryPdfOptions = {},
) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Pop-up blocked. Please allow pop-ups to print.');
  try {
    printWindow.document.title = `Generating ${record.parcelId} Land Details...`;
    const doc = await buildLandDetailsPdf(record, options);
    doc.autoPrint();
    printWindow.location.href = String(doc.output('bloburl'));
  } catch (error) {
    printWindow.close();
    throw error;
  }
};
