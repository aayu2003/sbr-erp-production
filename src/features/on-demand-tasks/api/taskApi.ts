import getBaseUrl from '@/lib/config';
import { createBlankTaskDraft, type LinkedRecord, type TaskDraft, type TaskPerson, type TaskRecord, type TaskStatus } from '../domain/taskTypes';

const base = () => getBaseUrl().replace(/\/$/, '');

const safeJson = async (response: Response) => response.json().catch(() => null);
const normalizeStatus = (value: unknown): TaskStatus => {
  const normalized = String(value || 'ASSIGNED').replace(/_/g, ' ').toUpperCase();
  const allowed: TaskStatus[] = ['DRAFT', 'PENDING APPROVAL', 'CHANGES REQUESTED', 'APPROVED', 'ASSIGNED', 'ACCEPTED', 'IN PROGRESS', 'ON HOLD', 'SUBMITTED', 'UNDER VERIFICATION', 'REWORK REQUIRED', 'VERIFIED', 'CLOSED', 'CANCELLED', 'REJECTED'];
  return allowed.includes(normalized as TaskStatus) ? normalized as TaskStatus : 'ASSIGNED';
};

const extractMetadata = (task: any) => {
  const steps = task?.steps_dict && typeof task.steps_dict === 'object' ? Object.values(task.steps_dict) as any[] : [];
  for (const step of steps) {
    const entries = Array.isArray(step?.data) ? step.data : [];
    const metadata = entries.find((entry: any) => entry?.module_version === 2 || entry?.title || entry?.task_title);
    if (metadata) return metadata;
  }
  return {};
};

export const normalizeTask = (task: any): TaskRecord => {
  const metadata = extractMetadata(task);
  const steps = task?.steps_dict && typeof task.steps_dict === 'object' ? Object.values(task.steps_dict) as any[] : [];
  const statuses = steps.map((step) => String(step?.status || '').toLowerCase());
  const completed = statuses.filter((status) => status === 'completed').length;
  const dueDate = String(metadata.due_date || metadata.dueDate || '');
  const today = new Date().toISOString().slice(0, 10);
  const status = normalizeStatus(metadata.status || (completed > 0 && completed === steps.length ? 'CLOSED' : 'ASSIGNED'));
  const person = (value: any, fallbackId = ''): TaskPerson | null => value
    ? typeof value === 'string' ? { id: value, name: value } : { id: String(value.id || value.staff_id || fallbackId), name: String(value.name || value.staff_name || value.vendor_name || value.id || fallbackId), detail: value.detail || value.designation }
    : fallbackId ? { id: fallbackId, name: fallbackId } : null;
  const primaryLocation = metadata.primary_location || metadata.primaryLocation || null;
  return {
    ...createBlankTaskDraft(),
    id: String(task?.task_id || task?.id || `TASK-${Date.now()}`),
    title: String(metadata.title || metadata.task_title || `Operational Task ${task?.task_id || ''}`).trim(),
    description: String(metadata.description || ''), expectedOutcome: String(metadata.expected_outcome || metadata.expectedOutcome || ''),
    type: metadata.task_type || metadata.type || 'Action', category: metadata.category || 'Other', subcategory: metadata.subcategory || '',
    priority: metadata.priority || 'MEDIUM', criticalReason: metadata.critical_reason || '', tags: Array.isArray(metadata.tags) ? metadata.tags : [],
    status, requester: person(metadata.requester), owner: person(metadata.owner, String(task?.staff_id || '')),
    assignmentMode: metadata.assignment_mode || 'employee', executor: person(metadata.executor, String(task?.staff_id || '')),
    coordinator: person(metadata.coordinator), approver: person(metadata.approver), verifier: person(metadata.verifier),
    collaborators: Array.isArray(metadata.collaborators) ? metadata.collaborators.map((value: any) => person(value)).filter(Boolean) : [],
    observers: Array.isArray(metadata.observers) ? metadata.observers.map((value: any) => person(value)).filter(Boolean) : [],
    locationMode: metadata.location_mode || (primaryLocation ? 'erp' : 'none'), primaryLocation,
    relatedRecords: Array.isArray(metadata.related_records) ? metadata.related_records : [], customLocation: metadata.custom_location || '',
    plannedStart: String(metadata.planned_start || ''), dueDate, estimatedEffort: String(metadata.estimated_effort || ''), recurrence: metadata.recurrence || 'None',
    dependencies: Array.isArray(metadata.dependencies) ? metadata.dependencies : [], resourceRequirements: String(metadata.resource_requirements || ''),
    checklist: Array.isArray(metadata.checklist) ? metadata.checklist : [], evidenceRules: metadata.evidence_rules || createBlankTaskDraft().evidenceRules,
    measurementLabel: metadata.measurement_label || '', quantity: String(metadata.quantity || ''), unit: metadata.unit || '',
    approvalRequired: !!metadata.approval_required, verificationRequired: !!metadata.verification_required,
    closureMethod: metadata.closure_method || 'Verifier closes after acceptance',
    progress: Number(metadata.progress ?? (steps.length ? Math.round((completed / steps.length) * 100) : 0)),
    blocked: !!metadata.blocked, overdue: !!dueDate && dueDate < today && !['CLOSED', 'CANCELLED', 'REJECTED'].includes(status),
    nextActor: String(metadata.next_actor || (status === 'ASSIGNED' ? 'Executor' : status === 'SUBMITTED' ? 'Verifier' : 'Owner')),
    issues: Array.isArray(metadata.issues) ? metadata.issues : [], activity: Array.isArray(metadata.activity) ? metadata.activity : [],
    createdAt: String(task?.created_at || metadata.created_at || ''), updatedAt: String(task?.updated_at || metadata.updated_at || task?.created_at || ''), raw: task,
    templateId: metadata.template_id || '',
  } as TaskRecord;
};

export const getTasks = async (): Promise<TaskRecord[]> => {
  const response = await fetch(`${base()}/admin_all_task/get_all_ondemand_tasks`);
  if (!response.ok) throw new Error(`Unable to load tasks (${response.status})`);
  const body = await safeJson(response);
  const rows = Array.isArray(body) ? body : [
    ...(Array.isArray(body?.allocated_tasks) ? body.allocated_tasks : []),
    ...(Array.isArray(body?.pending_allocation_tasks) ? body.pending_allocation_tasks : []),
  ];
  return rows.map(normalizeTask);
};

const serializeDraft = (draft: TaskDraft, status: TaskStatus) => ({
  module_version: 2, template_id: draft.templateId, title: draft.title, description: draft.description,
  expected_outcome: draft.expectedOutcome, task_type: draft.type, category: draft.category, subcategory: draft.subcategory,
  priority: draft.priority, critical_reason: draft.criticalReason, tags: draft.tags, status, requester: draft.requester,
  owner: draft.owner, assignment_mode: draft.assignmentMode, executor: draft.executor, coordinator: draft.coordinator,
  approver: draft.approver, verifier: draft.verifier, collaborators: draft.collaborators, observers: draft.observers,
  location_mode: draft.locationMode, primary_location: draft.primaryLocation, related_records: draft.relatedRecords,
  custom_location: draft.customLocation, planned_start: draft.plannedStart, due_date: draft.dueDate,
  estimated_effort: draft.estimatedEffort, recurrence: draft.recurrence, dependencies: draft.dependencies,
  resource_requirements: draft.resourceRequirements, checklist: draft.checklist,
  evidence_rules: draft.evidenceRules, measurement_label: draft.measurementLabel, quantity: draft.quantity, unit: draft.unit,
  approval_required: draft.approvalRequired, verification_required: draft.verificationRequired, closure_method: draft.closureMethod,
  progress: 0, blocked: false, next_actor: draft.approvalRequired ? 'Approver' : 'Executor',
});

export const createTask = async (draft: TaskDraft, mode: 'draft' | 'approval' | 'assign', originalTaskId?: string) => {
  const status: TaskStatus = mode === 'draft' ? 'DRAFT' : mode === 'approval' ? 'PENDING APPROVAL' : 'ASSIGNED';
  const metadata = serializeDraft(draft, status);
  const response = await fetch(`${base()}/admin_ops_requests/create_on_demand_tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(originalTaskId ? { task_id: originalTaskId, revision_of: originalTaskId } : {}), staff_id: draft.executor?.id || draft.owner?.id, steps_dict: { step_1: { type: 'others', status: 'pending', data: [metadata] } } }),
  });
  const body = await safeJson(response);
  if (!response.ok) throw new Error(body?.detail || body?.message || `Unable to create task (${response.status})`);
  return body;
};

export type TaskResources = { staff: TaskPerson[]; vendors: TaskPerson[]; records: LinkedRecord[] };
export const getTaskResources = async (): Promise<TaskResources> => {
  const requests = await Promise.allSettled([
    fetch(`${base()}/admin_staff/get_all_staff`).then(safeJson),
    fetch(`${base()}/purchase_flow/get_vendors`).then(safeJson),
    fetch(`${base()}/admin_ops_requests/get_farm_and_farmer`).then(safeJson),
  ]);
  const value = (index: number) => requests[index].status === 'fulfilled' ? (requests[index] as PromiseFulfilledResult<any>).value : null;
  const staffBody = value(0); const vendorBody = value(1); const farmBody = value(2);
  const staffRows = Array.isArray(staffBody) ? staffBody : Array.isArray(staffBody?.staffs) ? staffBody.staffs : Array.isArray(staffBody?.data) ? staffBody.data : [];
  const vendorRows = Array.isArray(vendorBody) ? vendorBody : Array.isArray(vendorBody?.vendors) ? vendorBody.vendors : Array.isArray(vendorBody?.data) ? vendorBody.data : [];
  const farmRows = Array.isArray(farmBody?.farm_farmer_mapping) ? farmBody.farm_farmer_mapping : [];
  return {
    staff: staffRows.map((row: any) => ({ id: String(row.staff_id || row.id || ''), name: String(row.staff_information?.staff_name || row.staff_name || row.name || row.staff_id || ''), detail: String(row.staff_information?.staff_designation || row.staff_information?.staff_department || row.designation || '') })).filter((row: TaskPerson) => row.id),
    vendors: vendorRows.map((row: any) => ({ id: String(row.vendor_id || row.id || row.vendor_code || ''), name: String(row.vendor_name || row.name || row.company_name || row.vendor_id || ''), detail: String(row.contact_person || row.mobile_number || row.phone || '') })).filter((row: TaskPerson) => row.id),
    records: farmRows.map((row: any) => ({ id: String(row.farm_id || row.id || ''), type: 'Land Parcel', label: `${row.owner_name || row.farmer_name || 'Owner not recorded'} — ${row.farm_id || row.id}`, detail: [row.crop_type, row.area ? `${row.area} acres` : ''].filter(Boolean).join(' · ') })).filter((row: LinkedRecord) => row.id),
  };
};
