export type InspectionReportItem = {
  id: string;
  itemCode: string;
  itemName: string;
  uom: string;
  orderQty: number;
  inspectedQty: number;
  acceptedQty: number;
  rejectedQty: number;
};

export type InspectionChecklistItem = {
  id: string;
  parameter: string;
  result: string;
  remarks: string;
};

export type InspectionApprovalAction = {
  employeeId: string;
  name: string;
  designation: string;
  remarks: string;
  actedAt: string;
};

export type InspectionReportStatus =
  | 'draft'
  | 'pending_admin_ops'
  | 'pending_finance_admin_ops'
  | 'approved'
  | 'rejected';

export type InspectionReportRecord = {
  id: string;
  certificateNo: string;
  certificateDate: string;
  grnNo: string;
  grnDate: string;
  poNo: string;
  vendorName: string;
  vendorId: string;
  inspectionLocation: string;
  inspectionType: string;
  reference: string;
  items: InspectionReportItem[];
  checklist: InspectionChecklistItem[];
  certification: string;
  recommendation: string;
  preparedByName: string;
  preparedByDesignation: string;
  signatoryMode: 'two' | 'three';
  verifiedById: string;
  verifiedByName: string;
  verifiedByDesignation: string;
  approvedById: string;
  approvedByName: string;
  approvedByDesignation: string;
  status: InspectionReportStatus;
  adminOpsApproval?: InspectionApprovalAction;
  financeAdminOpsApproval?: InspectionApprovalAction;
  rejectedByStage?: 'admin_ops' | 'finance_admin_ops';
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = 'farmconnect.inspectionReports.v1';
export const INSPECTION_REPORTS_CHANGED_EVENT = 'farmconnect:inspection-reports-changed';

export const listInspectionReports = (): InspectionReportRecord[] => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((report): report is InspectionReportRecord => Boolean(report?.id && report?.certificateNo))
          .map((report) => ({
            ...report,
            status: report.status === 'completed' ? 'pending_admin_ops' : (report.status || 'draft'),
            signatoryMode: report.signatoryMode === 'three' ? 'three' : 'two',
            verifiedById: report.verifiedById || '',
            verifiedByName: report.verifiedByName || '',
            verifiedByDesignation: report.verifiedByDesignation || '',
            approvedById: report.approvedById || '',
          }))
          .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
      : [];
  } catch {
    return [];
  }
};

const writeInspectionReports = (reports: InspectionReportRecord[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  window.dispatchEvent(new CustomEvent(INSPECTION_REPORTS_CHANGED_EVENT));
};

export const saveInspectionReport = (report: InspectionReportRecord) => {
  const reports = listInspectionReports();
  const existingIndex = reports.findIndex((entry) => entry.id === report.id);
  if (existingIndex >= 0) reports[existingIndex] = report;
  else reports.unshift(report);
  writeInspectionReports(reports);
  return report;
};

export const deleteInspectionReport = (id: string) => {
  writeInspectionReports(listInspectionReports().filter((report) => report.id !== id));
};

export const reviewInspectionReport = (
  id: string,
  stage: 'admin_ops' | 'finance_admin_ops',
  decision: 'approve' | 'reject',
  actor: Omit<InspectionApprovalAction, 'remarks' | 'actedAt'>,
  remarks = '',
) => {
  const report = listInspectionReports().find(entry => entry.id === id);
  if (!report) throw new Error('Inspection report not found');
  if (stage === 'admin_ops' && report.status !== 'pending_admin_ops') {
    throw new Error('This report is not awaiting Admin Ops approval');
  }
  if (stage === 'finance_admin_ops' && report.status !== 'pending_finance_admin_ops') {
    throw new Error('This report is not awaiting Finance Admin Ops approval');
  }

  const action: InspectionApprovalAction = { ...actor, remarks: remarks.trim(), actedAt: new Date().toISOString() };
  const updated: InspectionReportRecord = {
    ...report,
    status: decision === 'reject'
      ? 'rejected'
      : stage === 'admin_ops' ? 'pending_finance_admin_ops' : 'approved',
    rejectedByStage: decision === 'reject' ? stage : undefined,
    rejectionReason: decision === 'reject' ? remarks.trim() : undefined,
    updatedAt: action.actedAt,
  };

  if (stage === 'admin_ops') {
    updated.adminOpsApproval = action;
    if (report.signatoryMode === 'three') {
      updated.verifiedById = actor.employeeId;
      updated.verifiedByName = actor.name;
      updated.verifiedByDesignation = actor.designation;
    }
  } else {
    updated.financeAdminOpsApproval = action;
    updated.approvedById = actor.employeeId;
    updated.approvedByName = actor.name;
    updated.approvedByDesignation = actor.designation;
  }
  return saveInspectionReport(updated);
};

const financialYear = (date: Date) => {
  const fullYear = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? fullYear : fullYear - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
};

export const nextInspectionCertificateNo = (reports: InspectionReportRecord[], date = new Date()) => {
  const fy = financialYear(date);
  const prefix = `SBRPL/ICR/${fy}/`;
  const highest = reports.reduce((maximum, report) => {
    if (!report.certificateNo.startsWith(prefix)) return maximum;
    const sequence = Number(report.certificateNo.slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(maximum, sequence) : maximum;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
};
