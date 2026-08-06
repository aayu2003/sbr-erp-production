export type WccValuationMethod =
  | 'quantity_rate'
  | 'lump_sum_percentage'
  | 'milestone'
  | 'time_based'
  | 'measurement_based'
  | 'equipment_usage'
  | 'recurring'
  | 'fixed_fee'
  | 'non_valued';

export type WccType = 'partial' | 'milestone' | 'periodic' | 'final' | 'rectification';
export type WccReferenceType = 'work_order' | 'service_purchase_order' | 'rate_contract' | 'other_contract';
export type WccDraftStatus = 'draft' | 'submitted' | 'technical_verification' | 'commercial_verification' | 'changes_requested' | 'pending_approval' | 'partially_approved' | 'approved' | 'rejected' | 'reversed' | 'cancelled' | 'superseded';
export type ChecklistResult = 'accepted' | 'accepted_with_observations' | 'partially_accepted' | 'rejected' | 'not_applicable';

export interface WccWorkTemplate {
  id: string;
  label: string;
  description: string;
  subcategories: string[];
  valuationMethods: WccValuationMethod[];
  defaultValuation: WccValuationMethod;
  landMode: 'required' | 'optional' | 'none';
  measurementFields: string[];
  checklist: string[];
  evidence: string[];
}

const commonChecklist = ['Quality inspection', 'Safety compliance', 'Workmanship', 'Scope compliance'];

export const WCC_WORK_TEMPLATES: WccWorkTemplate[] = [
  { id: 'cultivation', label: 'Cultivation & Agricultural Fieldwork', description: 'Crop, parcel, acreage and field activities.', subcategories: ['Land preparation', 'Sowing', 'Crop maintenance', 'Harvesting', 'Agricultural services'], valuationMethods: ['measurement_based', 'quantity_rate', 'lump_sum_percentage'], defaultValuation: 'measurement_based', landMode: 'required', measurementFields: ['parcel', 'crop', 'activity', 'area'], checklist: [...commonChecklist, 'Agronomy verification'], evidence: ['Completion photographs', 'Measurement sheet'] },
  { id: 'civil', label: 'Civil & Structural Works', description: 'BOQ and drawing-based construction work.', subcategories: ['Earthwork', 'RCC', 'Masonry', 'Finishing', 'Structural steel'], valuationMethods: ['measurement_based', 'quantity_rate', 'milestone'], defaultValuation: 'measurement_based', landMode: 'optional', measurementFields: ['location', 'length', 'width', 'height', 'count'], checklist: [...commonChecklist, 'Drawing compliance', 'Material test results'], evidence: ['Measurement sheet', 'Drawings', 'Completion photographs'] },
  { id: 'electrical', label: 'Electrical Works', description: 'Installation, testing and energization.', subcategories: ['HT/LT', 'Cabling', 'Lighting', 'Panels', 'Solar'], valuationMethods: ['quantity_rate', 'milestone', 'lump_sum_percentage'], defaultValuation: 'quantity_rate', landMode: 'optional', measurementFields: ['location', 'equipment_tag', 'count'], checklist: [...commonChecklist, 'Testing completed', 'Energization clearance'], evidence: ['Test certificate', 'Drawings', 'Completion photographs'] },
  { id: 'mechanical_hvac', label: 'Mechanical & HVAC Works', description: 'Mechanical installation, alignment and commissioning.', subcategories: ['HVAC', 'Pumps', 'Piping', 'Rotating equipment', 'Utilities'], valuationMethods: ['milestone', 'quantity_rate', 'lump_sum_percentage'], defaultValuation: 'milestone', landMode: 'optional', measurementFields: ['location', 'equipment_tag', 'count'], checklist: [...commonChecklist, 'Alignment verified', 'Commissioning completed'], evidence: ['Test certificate', 'Commissioning report'] },
  { id: 'plumbing', label: 'Plumbing & Drainage', description: 'Water supply, sanitary and drainage works.', subcategories: ['Water supply', 'Sanitary', 'Drainage', 'Rainwater'], valuationMethods: ['measurement_based', 'quantity_rate'], defaultValuation: 'measurement_based', landMode: 'optional', measurementFields: ['location', 'length', 'diameter', 'count'], checklist: [...commonChecklist, 'Pressure/leak test'], evidence: ['Measurement sheet', 'Test certificate'] },
  { id: 'fabrication', label: 'Fabrication & Erection', description: 'Shop/site fabrication and erection services.', subcategories: ['Structural', 'Piping', 'Platforms', 'Custom fabrication'], valuationMethods: ['quantity_rate', 'measurement_based', 'milestone'], defaultValuation: 'quantity_rate', landMode: 'optional', measurementFields: ['location', 'weight', 'count'], checklist: [...commonChecklist, 'Welding inspection', 'Erection alignment'], evidence: ['Inspection report', 'Completion photographs'] },
  { id: 'installation', label: 'Equipment Installation & Commissioning', description: 'Installation, trial run and handover.', subcategories: ['Machinery', 'Process equipment', 'Instrumentation', 'IT equipment'], valuationMethods: ['milestone', 'lump_sum_percentage', 'quantity_rate'], defaultValuation: 'milestone', landMode: 'optional', measurementFields: ['location', 'equipment_tag', 'count'], checklist: [...commonChecklist, 'Trial run completed', 'Handover documents'], evidence: ['Commissioning report', 'Test certificate'] },
  { id: 'repair_maintenance', label: 'Repair & Maintenance', description: 'Preventive, breakdown and annual maintenance.', subcategories: ['Preventive', 'Breakdown', 'AMC', 'Overhaul'], valuationMethods: ['quantity_rate', 'time_based', 'lump_sum_percentage', 'recurring'], defaultValuation: 'quantity_rate', landMode: 'optional', measurementFields: ['location', 'equipment_tag', 'hours'], checklist: [...commonChecklist, 'Equipment restored'], evidence: ['Service report', 'Before/after photographs'] },
  { id: 'manpower', label: 'Housekeeping, Security & Manpower', description: 'Attendance and shift-based recurring services.', subcategories: ['Housekeeping', 'Security', 'Skilled manpower', 'Unskilled manpower'], valuationMethods: ['time_based', 'recurring', 'quantity_rate'], defaultValuation: 'time_based', landMode: 'optional', measurementFields: ['role', 'headcount', 'shifts', 'days', 'hours'], checklist: [...commonChecklist, 'Attendance verified', 'Statutory compliance'], evidence: ['Attendance sheet', 'Statutory records'] },
  { id: 'transport', label: 'Transportation & Equipment Hire', description: 'Trip, kilometre, shift and meter-based services.', subcategories: ['Transportation', 'Vehicle hire', 'Equipment hire', 'Material handling'], valuationMethods: ['equipment_usage', 'time_based', 'quantity_rate'], defaultValuation: 'equipment_usage', landMode: 'optional', measurementFields: ['vehicle', 'route', 'trips', 'distance', 'meter_opening', 'meter_closing', 'downtime'], checklist: [...commonChecklist, 'Logbook verified'], evidence: ['Logbook', 'Equipment log', 'Challan'] },
  { id: 'consultancy', label: 'Consultancy & Professional Services', description: 'Deliverable, milestone or fixed-fee professional work.', subcategories: ['Design', 'Advisory', 'Audit', 'Survey', 'Professional support'], valuationMethods: ['fixed_fee', 'milestone', 'time_based'], defaultValuation: 'fixed_fee', landMode: 'none', measurementFields: ['deliverable', 'hours', 'milestone'], checklist: [...commonChecklist, 'Deliverable accepted'], evidence: ['Deliverable', 'Timesheet'] },
  { id: 'supply_install', label: 'Supply & Installation Contracts', description: 'Combined delivery, installation and commissioning.', subcategories: ['Turnkey supply', 'Supply and erection', 'Supply and commissioning'], valuationMethods: ['milestone', 'quantity_rate', 'lump_sum_percentage'], defaultValuation: 'milestone', landMode: 'optional', measurementFields: ['location', 'equipment_tag', 'count'], checklist: [...commonChecklist, 'Material reconciliation', 'Installation accepted'], evidence: ['Delivery challan', 'Installation report'] },
  { id: 'lump_sum', label: 'Lump-Sum Jobs', description: 'Completion percentage or weighted milestone claims.', subcategories: ['Turnkey', 'Fixed-scope job', 'Package work'], valuationMethods: ['lump_sum_percentage', 'milestone'], defaultValuation: 'lump_sum_percentage', landMode: 'optional', measurementFields: ['milestone', 'contractual_weight', 'claimed_percentage', 'accepted_percentage'], checklist: commonChecklist, evidence: ['Progress report', 'Completion photographs'] },
  { id: 'rate_contract', label: 'Rate-Contract Work', description: 'Call-off work measured at contracted rates.', subcategories: ['Annual rate contract', 'Call-off service', 'Schedule of rates'], valuationMethods: ['quantity_rate', 'measurement_based', 'time_based'], defaultValuation: 'quantity_rate', landMode: 'optional', measurementFields: ['location', 'quantity'], checklist: commonChecklist, evidence: ['Measurement sheet'] },
  { id: 'milestone', label: 'Milestone-Based Services', description: 'Contractual milestone achievement and acceptance.', subcategories: ['Project milestone', 'Deliverable milestone', 'Commissioning milestone'], valuationMethods: ['milestone'], defaultValuation: 'milestone', landMode: 'optional', measurementFields: ['milestone', 'contractual_weight', 'claimed_percentage', 'accepted_percentage'], checklist: commonChecklist, evidence: ['Milestone evidence'] },
  { id: 'measurement', label: 'Measurement-Based Work', description: 'Measured quantity certified against schedule rates.', subcategories: ['Area', 'Length', 'Volume', 'Weight', 'Count'], valuationMethods: ['measurement_based', 'quantity_rate'], defaultValuation: 'measurement_based', landMode: 'optional', measurementFields: ['location', 'length', 'width', 'height', 'count'], checklist: commonChecklist, evidence: ['Measurement sheet'] },
  { id: 'recurring', label: 'Recurring Services', description: 'Monthly or periodic service acceptance.', subcategories: ['Monthly service', 'Quarterly service', 'Subscription service'], valuationMethods: ['recurring', 'fixed_fee', 'time_based'], defaultValuation: 'recurring', landMode: 'none', measurementFields: ['period', 'days', 'hours'], checklist: commonChecklist, evidence: ['Service report'] },
  { id: 'other', label: 'Other / Custom Work', description: 'Permission-controlled custom contracted service.', subcategories: ['Custom'], valuationMethods: ['quantity_rate', 'lump_sum_percentage', 'milestone', 'time_based', 'non_valued'], defaultValuation: 'quantity_rate', landMode: 'optional', measurementFields: ['description', 'quantity'], checklist: commonChecklist, evidence: ['Supporting document'] },
];

export interface WccHeader {
  company: string; businessUnit: string; plant: string; project: string; site: string; department: string; costCentre: string;
  vendorId: string; vendorName: string; referenceType: WccReferenceType; referenceNumber: string;
  contractFrom: string; contractTo: string; wccType: WccType; statementFrom: string; statementTo: string;
  workCategory: string; subcategory: string; currency: string; preparedById: string; preparedByName: string;
  contractorReference: string; contractorReferenceDate: string; manualJustification: string; expiredOverrideReason: string;
  orderValue: number; previouslyCertifiedValue: number; projectSiteLabel: string;
}

export interface WccServiceLine {
  id: string; orderItem: string; serviceLine: string; serviceCode: string; description: string; specification: string;
  wbsCode: string; costCentre: string; taxCode: string; unit: string; orderedQty: number; previousQty: number;
  currentQty: number; rate: number; toleranceQty: number; retentionPercent: number; locationReference: string;
  startDate: string; completionDate: string; remarks: string; selected: boolean; unplanned: boolean; justification: string;
}

export interface WccMeasurement {
  id: string; lineId: string; date: string; location: string; description: string; length: number; width: number;
  height: number; count: number; manualQty: number; overrideReason: string; unit: string; recordedBy: string;
  sourceReference: string; fields: Record<string, string | number>;
}

export interface WccChecklistResponse { id: string; label: string; result: ChecklistResult; remarks: string; blocking: boolean; owner: string; dueDate: string; resolved: boolean; }
export interface WccAttachment { id: string; name: string; category: string; caption: string; fileUrl: string; uploadedAt: string; uploadedBy: string; }
export interface WccAdjustment { id: string; type: string; mode: 'amount' | 'percentage'; value: number; reason: string; documentUrl: string; enteredBy: string; enteredAt: string; approvalRequired: boolean; direction: 'addition' | 'deduction'; }
export interface WccHistoryEntry { id: string; at: string; userId: string; userName: string; designation: string; from: WccDraftStatus | ''; to: WccDraftStatus; comments: string; }

export interface WccEnterpriseDraft {
  schemaVersion: 2; draftId: string; certificateId?: string; revision: number; status: WccDraftStatus; currentStep: number;
  valuationMethod: WccValuationMethod; header: WccHeader; serviceLines: WccServiceLine[]; measurements: WccMeasurement[];
  checklist: WccChecklistResponse[]; attachments: WccAttachment[]; adjustments: WccAdjustment[]; history: WccHistoryEntry[];
  landIds: string[]; activityNames: string[]; finalConfirmations: Record<string, boolean>; createdAt: string; updatedAt: string;
}

export interface WccValidationFinding { id: string; severity: 'blocking' | 'approval' | 'warning'; step: number; field: string; message: string; }
export type WccWorkflowAction = 'submit' | 'technical_verify' | 'commercial_verify' | 'request_changes' | 'approve' | 'reject' | 'reverse' | 'revise';
export interface WccWorkflowContext { action: WccWorkflowAction; actorId: string; permissions: string[]; reason?: string; }
export interface WccWorkflowDecision { allowed: boolean; message: string; nextStatus?: WccDraftStatus; }

export const roundMoney = (value: number) => {
  const numeric = Number(value || 0);
  const correction = Number.EPSILON * Math.max(1, Math.abs(numeric));
  return Math.round((numeric + Math.sign(numeric || 1) * correction) * 100) / 100;
};
export const multiplyDecimal = (left: number, right: number) => roundMoney(Number(left || 0) * Number(right || 0));

export const lineCurrentValue = (line: WccServiceLine, method: WccValuationMethod) => {
  if (!line.selected || method === 'non_valued') return 0;
  if (method === 'lump_sum_percentage' || method === 'milestone') return roundMoney(line.rate * line.currentQty / 100);
  return multiplyDecimal(line.currentQty, line.rate);
};

export const calculateWccTotals = (draft: WccEnterpriseDraft) => {
  const selected = draft.serviceLines.filter((line) => line.selected);
  const gross = roundMoney(selected.reduce((sum, line) => sum + lineCurrentValue(line, draft.valuationMethod), 0));
  const retention = roundMoney(selected.reduce((sum, line) => sum + lineCurrentValue(line, draft.valuationMethod) * Number(line.retentionPercent || 0) / 100, 0));
  const additions = roundMoney(draft.adjustments.filter((item) => item.direction === 'addition').reduce((sum, item) => sum + (item.mode === 'percentage' ? gross * item.value / 100 : item.value), 0));
  const deductions = roundMoney(draft.adjustments.filter((item) => item.direction === 'deduction').reduce((sum, item) => sum + (item.mode === 'percentage' ? gross * item.value / 100 : item.value), 0));
  const net = roundMoney(gross + additions - deductions - retention);
  const previous = roundMoney(draft.header.previouslyCertifiedValue);
  return { gross, retention, additions, deductions, net, previous, cumulative: roundMoney(previous + gross), remaining: roundMoney(draft.header.orderValue - previous - gross) };
};

export const validateWccDraft = (draft: WccEnterpriseDraft): WccValidationFinding[] => {
  const findings: WccValidationFinding[] = [];
  const push = (severity: WccValidationFinding['severity'], step: number, field: string, message: string) => findings.push({ id: `${step}-${field}-${findings.length}`, severity, step, field, message });
  const h = draft.header;
  if (!h.vendorId) push('blocking', 1, 'vendorId', 'Select a vendor or contractor.');
  if (!h.referenceNumber.trim()) push('blocking', 1, 'referenceNumber', 'Enter a contract, work order or purchase order number.');
  if (!h.statementFrom || !h.statementTo) push('blocking', 1, 'statementPeriod', 'Enter the statement/service period.');
  if (h.statementFrom && h.statementTo && h.statementFrom > h.statementTo) push('blocking', 1, 'statementPeriod', 'Statement start date cannot be after the end date.');
  if (!h.workCategory) push('blocking', 1, 'workCategory', 'Select a work category.');
  if (h.workCategory === 'other' && !h.manualJustification.trim()) push('blocking', 1, 'manualJustification', 'Custom WCCs require a justification.');
  const template = WCC_WORK_TEMPLATES.find((item) => item.id === h.workCategory);
  if (template?.landMode === 'required' && draft.landIds.length === 0) push('blocking', 1, 'landIds', `${template.label} requires at least one land parcel or work location.`);
  if (h.contractTo && h.statementTo && h.statementTo > h.contractTo) push(h.expiredOverrideReason.trim() ? 'approval' : 'warning', 1, 'expiredOverrideReason', h.expiredOverrideReason.trim() ? 'The service period exceeds contract validity and requires authorized override approval.' : 'The service period exceeds contract validity; record an override reason before approval.');
  const selectedLines = draft.serviceLines.filter((line) => line.selected);
  if (selectedLines.length === 0) push('blocking', 2, 'serviceLines', 'Select at least one eligible service line.');
  selectedLines.forEach((line, index) => {
    if (!line.description.trim()) push('blocking', 2, `line-${line.id}-description`, `Line ${index + 1} requires a description.`);
    if (!line.unit.trim()) push('blocking', 2, `line-${line.id}-unit`, `Line ${index + 1} requires a unit.`);
    if (template?.landMode === 'required' && !line.locationReference.trim()) push('blocking', 2, `line-${line.id}-land`, `Line ${index + 1} requires a land parcel from the selected scope.`);
    if (line.currentQty < 0) push('blocking', 3, `line-${line.id}-currentQty`, `Line ${index + 1} current quantity cannot be negative.`);
    if (line.previousQty + line.currentQty > line.orderedQty + line.toleranceQty) push('blocking', 3, `line-${line.id}-currentQty`, `Line ${index + 1} exceeds the permitted order quantity or tolerance.`);
    if (lineCurrentValue(line, draft.valuationMethod) > Math.max(0, (line.orderedQty - line.previousQty) * line.rate) && !['lump_sum_percentage', 'milestone'].includes(draft.valuationMethod)) push('blocking', 4, `line-${line.id}-value`, `Line ${index + 1} exceeds the remaining commitment.`);
    if (line.unplanned && !line.justification.trim()) push('blocking', 2, `line-${line.id}-justification`, `Unplanned line ${index + 1} requires justification.`);
    if (line.unplanned && line.justification.trim()) push('approval', 2, `line-${line.id}-approval`, `Unplanned line ${index + 1} requires explicit approver acceptance.`);
  });
  const refs = draft.measurements.map((item) => item.sourceReference.trim().toLowerCase()).filter(Boolean);
  if (new Set(refs).size !== refs.length) push('warning', 3, 'measurements', 'Duplicate measurement/source-document references were detected.');
  draft.measurements.forEach((measurement, index) => {
    if (measurement.manualQty < 0) push('blocking', 3, `measurement-${measurement.id}`, `Measurement ${index + 1} cannot be negative.`);
    if (measurement.overrideReason === '' && measurement.manualQty > 0 && measurement.length * measurement.width * Math.max(measurement.height, 1) * Math.max(measurement.count, 1) > 0) push('warning', 3, `measurement-${measurement.id}`, `Measurement ${index + 1} uses a manual quantity without an override reason.`);
  });
  draft.adjustments.forEach((item, index) => { if (item.value && !item.reason.trim()) push('blocking', 4, `adjustment-${item.id}`, `Adjustment ${index + 1} requires a reason.`); if (item.approvalRequired) push('approval', 4, `adjustment-${item.id}`, `Adjustment ${index + 1} requires additional approval.`); });
  const totals = calculateWccTotals(draft);
  if (totals.remaining < 0) push('blocking', 4, 'remainingValue', 'Current value exceeds the remaining order commitment.');
  if (draft.header.wccType === 'final') {
    ['allWorkComplete', 'defectsResolved', 'measurementsRecorded', 'remainingScopeDeclared'].forEach((key) => { if (!draft.finalConfirmations[key]) push('blocking', 5, key, 'Complete all final WCC declarations before submission.'); });
  }
  if (!draft.finalConfirmations.submissionDeclaration) push('blocking', 5, 'submissionDeclaration', 'Accept the certification declaration before submission.');
  if (draft.status === 'approved') push('blocking', 5, 'status', 'Approved WCCs cannot be edited directly. Create a revision or reversal.');
  return findings;
};

const workflowRules: Record<WccWorkflowAction, { from: WccDraftStatus[]; to: WccDraftStatus; permission: string }> = {
  submit: { from: ['draft', 'changes_requested'], to: 'submitted', permission: 'wcc.submit' },
  technical_verify: { from: ['submitted', 'technical_verification'], to: 'commercial_verification', permission: 'wcc.technical_verify' },
  commercial_verify: { from: ['commercial_verification'], to: 'pending_approval', permission: 'wcc.commercial_verify' },
  request_changes: { from: ['submitted', 'technical_verification', 'commercial_verification', 'pending_approval'], to: 'changes_requested', permission: 'wcc.request_changes' },
  approve: { from: ['pending_approval'], to: 'approved', permission: 'wcc.approve' },
  reject: { from: ['submitted', 'technical_verification', 'commercial_verification', 'pending_approval'], to: 'rejected', permission: 'wcc.reject' },
  reverse: { from: ['approved'], to: 'reversed', permission: 'wcc.reverse' },
  revise: { from: ['approved', 'rejected', 'reversed', 'superseded'], to: 'draft', permission: 'wcc.revise' },
};

export const canTransitionWcc = (draft: WccEnterpriseDraft, context: WccWorkflowContext): WccWorkflowDecision => {
  const rule = workflowRules[context.action];
  if (!context.permissions.includes(rule.permission) && !context.permissions.includes('wcc.admin')) return { allowed: false, message: `Missing permission: ${rule.permission}.` };
  if (!rule.from.includes(draft.status)) return { allowed: false, message: `${context.action.replaceAll('_', ' ')} is not allowed while the WCC is ${draft.status.replaceAll('_', ' ')}.` };
  if (context.action === 'approve' && context.actorId && context.actorId === draft.header.preparedById) return { allowed: false, message: 'The preparer cannot approve the same WCC.' };
  if (['request_changes', 'reject', 'reverse'].includes(context.action) && !context.reason?.trim()) return { allowed: false, message: 'A reason is required for this action.' };
  if (context.action === 'submit' && validateWccDraft(draft).some((finding) => finding.severity === 'blocking')) return { allowed: false, message: 'Resolve all blocking validation findings before submission.' };
  return { allowed: true, message: 'Transition allowed.', nextStatus: rule.to };
};

export const calculateReversalRestoration = (draft: WccEnterpriseDraft) => ({
  quantity: roundMoney(draft.serviceLines.filter((line) => line.selected).reduce((sum, line) => sum + Number(line.currentQty || 0), 0)),
  value: calculateWccTotals(draft).gross,
});

const blankHeader = (): WccHeader => ({ company: 'SAI BIORESOURCES PRIVATE LIMITED', businessUnit: '', plant: '', project: '', site: '', department: '', costCentre: '', vendorId: '', vendorName: '', referenceType: 'work_order', referenceNumber: '', contractFrom: '', contractTo: '', wccType: 'partial', statementFrom: '', statementTo: '', workCategory: '', subcategory: '', currency: 'INR', preparedById: '', preparedByName: '', contractorReference: '', contractorReferenceDate: '', manualJustification: '', expiredOverrideReason: '', orderValue: 0, previouslyCertifiedValue: 0, projectSiteLabel: '' });

export const createWccDraft = (preparedBy?: { id?: string; name?: string }): WccEnterpriseDraft => {
  const now = new Date().toISOString();
  return { schemaVersion: 2, draftId: `WCC-DRAFT-${Date.now()}`, revision: 0, status: 'draft', currentStep: 1, valuationMethod: 'quantity_rate', header: { ...blankHeader(), preparedById: preparedBy?.id || '', preparedByName: preparedBy?.name || '' }, serviceLines: [], measurements: [], checklist: [], attachments: [], adjustments: [], history: [], landIds: [], activityNames: [], finalConfirmations: {}, createdAt: now, updatedAt: now };
};

export const serviceLineFromOrder = (raw: Record<string, unknown>, index: number): WccServiceLine => {
  const text = (...keys: string[]) => keys.map((key) => String(raw[key] ?? '').trim()).find(Boolean) || '';
  const num = (...keys: string[]) => Number(keys.map((key) => raw[key]).find((value) => value !== undefined && value !== null && value !== '') || 0) || 0;
  return { id: text('id', 'line_id', 'service_code') || `LINE-${Date.now()}-${index}`, orderItem: text('order_item', 'item_no', 's_no') || String(index + 1).padStart(3, '0'), serviceLine: text('service_line', 'service_line_no') || String(index + 1).padStart(4, '0'), serviceCode: text('service_code', 'item_code', 'code'), description: text('description', 'item_description', 'item_name', 'service_description'), specification: text('specification', 'specs'), wbsCode: text('wbs_code', 'project_code'), costCentre: text('cost_centre', 'cost_center'), taxCode: text('tax_code', 'gst'), unit: text('unit', 'uom') || 'NOS', orderedQty: num('ordered_qty', 'quantity', 'qty'), previousQty: num('previous_qty', 'previously_accepted_qty'), currentQty: 0, rate: num('rate', 'unit_rate', 'price'), toleranceQty: num('tolerance_qty'), retentionPercent: num('retention_percent'), locationReference: text('location', 'asset', 'equipment', 'land_reference'), startDate: text('start_date'), completionDate: text('completion_date'), remarks: '', selected: true, unplanned: false, justification: '' };
};

export const buildLegacyAnnexure = (draft: WccEnterpriseDraft) => {
  const selected = draft.serviceLines.filter((line) => line.selected);
  const activities = Array.from(new Set(selected.map((line) => line.description || line.serviceCode || 'Service')));
  const rows = selected.map((line) => ({ landId: line.locationReference || line.serviceLine || line.id, farmerName: line.description, area: line.currentQty, byActivity: { [line.description || 'Service']: line.currentQty }, total: line.currentQty }));
  const grandByActivity: Record<string, number> = {};
  selected.forEach((line) => { const key = line.description || 'Service'; grandByActivity[key] = (grandByActivity[key] || 0) + line.currentQty; });
  const grandTotal = roundMoney(selected.reduce((sum, line) => sum + line.currentQty, 0));
  return { activities, crops: [{ crop: WCC_WORK_TEMPLATES.find((item) => item.id === draft.header.workCategory)?.label || 'Contracted Work', rows, subtotalByActivity: grandByActivity, subtotalTotal: grandTotal }], grandByActivity, grandTotal, enterprise: draft };
};
