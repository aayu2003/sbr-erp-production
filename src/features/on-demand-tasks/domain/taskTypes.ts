export const TASK_STATUSES = [
  'DRAFT', 'PENDING APPROVAL', 'CHANGES REQUESTED', 'APPROVED', 'ASSIGNED', 'ACCEPTED',
  'IN PROGRESS', 'ON HOLD', 'SUBMITTED', 'UNDER VERIFICATION', 'REWORK REQUIRED',
  'VERIFIED', 'CLOSED', 'CANCELLED', 'REJECTED',
] as const;

export type TaskStatus = typeof TASK_STATUSES[number];
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskType = 'Action' | 'Inspection' | 'Follow-up' | 'Information' | 'Corrective Action' | 'Approval' | 'Other';
export type AssignmentMode = 'employee' | 'team' | 'department' | 'vendor';
export type LocationMode = 'none' | 'erp' | 'custom';

export type TaskPerson = { id: string; name: string; detail?: string; activeTasks?: number; overdueTasks?: number };
export type LinkedRecord = { id: string; type: string; label: string; detail?: string };
export type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  mandatory: boolean;
  completed: boolean;
  assignee: string;
  dueDate: string;
  weight: number;
  evidenceRequired: boolean;
  dependencyId?: string;
};
export type TaskEvidenceRules = {
  photos: number;
  documents: number;
  gps: boolean;
  measurement: boolean;
  quantity: boolean;
  signature: boolean;
};
export type TaskIssue = { id: string; title: string; severity: string; blocking: boolean; resolved: boolean; owner?: string };
export type TaskActivity = { id: string; at: string; actor: string; action: string; detail?: string };

export type TaskRecord = {
  id: string;
  title: string;
  description: string;
  expectedOutcome: string;
  type: TaskType;
  category: string;
  subcategory: string;
  priority: TaskPriority;
  criticalReason: string;
  tags: string[];
  status: TaskStatus;
  requester: TaskPerson | null;
  owner: TaskPerson | null;
  assignmentMode: AssignmentMode;
  executor: TaskPerson | null;
  coordinator: TaskPerson | null;
  approver: TaskPerson | null;
  verifier: TaskPerson | null;
  collaborators: TaskPerson[];
  observers: TaskPerson[];
  locationMode: LocationMode;
  primaryLocation: LinkedRecord | null;
  relatedRecords: LinkedRecord[];
  customLocation: string;
  plannedStart: string;
  dueDate: string;
  estimatedEffort: string;
  recurrence: string;
  dependencies: LinkedRecord[];
  resourceRequirements: string;
  checklist: ChecklistItem[];
  evidenceRules: TaskEvidenceRules;
  measurementLabel: string;
  quantity: string;
  unit: string;
  approvalRequired: boolean;
  verificationRequired: boolean;
  closureMethod: string;
  progress: number;
  blocked: boolean;
  overdue: boolean;
  nextActor: string;
  issues: TaskIssue[];
  activity: TaskActivity[];
  createdAt: string;
  updatedAt: string;
  raw?: unknown;
};

export type TaskDraft = Omit<TaskRecord, 'id' | 'status' | 'progress' | 'blocked' | 'overdue' | 'nextActor' | 'issues' | 'activity' | 'createdAt' | 'updatedAt'> & {
  templateId: string;
};

export type TaskTemplate = {
  id: string;
  name: string;
  description: string;
  type: TaskType;
  category: string;
  priority: TaskPriority;
  durationDays: number;
  locationRequired: boolean;
  checklist: Array<Pick<ChecklistItem, 'title' | 'description' | 'mandatory' | 'evidenceRequired'>>;
  evidenceRules: TaskEvidenceRules;
  verificationRequired: boolean;
};

export const TASK_CATEGORIES = [
  'Cultivation', 'Maintenance', 'Inspection', 'Survey', 'Material Movement', 'Logistics',
  'Procurement Follow-up', 'Documentation', 'Compliance', 'Office Administration', 'Finance',
  'HR', 'IT Support', 'Safety', 'Quality', 'Vendor Coordination', 'Emergency', 'Other',
];

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'land-inspection', name: 'Land Inspection', description: 'Inspect crop condition, water and fencing with geo-tagged evidence.',
    type: 'Inspection', category: 'Inspection', priority: 'MEDIUM', durationDays: 2, locationRequired: true,
    checklist: [
      { title: 'Inspect crop condition', description: '', mandatory: true, evidenceRequired: true },
      { title: 'Check water availability', description: '', mandatory: true, evidenceRequired: false },
      { title: 'Check fencing status', description: '', mandatory: true, evidenceRequired: true },
    ], evidenceRules: { photos: 2, documents: 0, gps: true, measurement: false, quantity: false, signature: false }, verificationRequired: true,
  },
  {
    id: 'fertilizer-application', name: 'Fertilizer Application', description: 'Plan and verify fertilizer application across selected plots.',
    type: 'Action', category: 'Cultivation', priority: 'HIGH', durationDays: 1, locationRequired: true,
    checklist: [
      { title: 'Verify material and dosage', description: '', mandatory: true, evidenceRequired: false },
      { title: 'Complete field application', description: '', mandatory: true, evidenceRequired: true },
    ], evidenceRules: { photos: 2, documents: 0, gps: true, measurement: true, quantity: true, signature: false }, verificationRequired: true,
  },
  {
    id: 'borewell-repair', name: 'Borewell Repair', description: 'Diagnose, repair and document a borewell service job.',
    type: 'Corrective Action', category: 'Maintenance', priority: 'HIGH', durationDays: 3, locationRequired: true,
    checklist: [
      { title: 'Record diagnosis', description: '', mandatory: true, evidenceRequired: true },
      { title: 'Record spare parts used', description: '', mandatory: true, evidenceRequired: false },
      { title: 'Complete service test', description: '', mandatory: true, evidenceRequired: true },
    ], evidenceRules: { photos: 2, documents: 1, gps: false, measurement: true, quantity: false, signature: false }, verificationRequired: true,
  },
  {
    id: 'material-delivery', name: 'Material Delivery', description: 'Track source, destination, vehicle, challan and delivered quantity.',
    type: 'Action', category: 'Material Movement', priority: 'MEDIUM', durationDays: 1, locationRequired: true,
    checklist: [{ title: 'Confirm delivered quantity', description: '', mandatory: true, evidenceRequired: true }],
    evidenceRules: { photos: 1, documents: 1, gps: false, measurement: false, quantity: true, signature: true }, verificationRequired: false,
  },
  {
    id: 'document-submission', name: 'Document Submission', description: 'Submit a document and record authority acknowledgement.',
    type: 'Action', category: 'Documentation', priority: 'MEDIUM', durationDays: 3, locationRequired: false,
    checklist: [{ title: 'Upload acknowledgement', description: '', mandatory: true, evidenceRequired: true }],
    evidenceRules: { photos: 0, documents: 1, gps: false, measurement: false, quantity: false, signature: false }, verificationRequired: true,
  },
  {
    id: 'procurement-follow-up', name: 'Procurement Follow-up', description: 'Follow up a purchase request or order with the selected vendor.',
    type: 'Follow-up', category: 'Procurement Follow-up', priority: 'MEDIUM', durationDays: 2, locationRequired: false,
    checklist: [{ title: 'Record vendor response', description: '', mandatory: true, evidenceRequired: false }],
    evidenceRules: { photos: 0, documents: 0, gps: false, measurement: false, quantity: false, signature: false }, verificationRequired: false,
  },
];

export const createBlankTaskDraft = (): TaskDraft => ({
  templateId: '', title: '', description: '', expectedOutcome: '', type: 'Action', category: '', subcategory: '',
  priority: 'MEDIUM', criticalReason: '', tags: [], requester: null, owner: null, assignmentMode: 'employee', executor: null,
  coordinator: null, approver: null, verifier: null, collaborators: [], observers: [], locationMode: 'none', primaryLocation: null,
  relatedRecords: [], customLocation: '', plannedStart: '', dueDate: '', estimatedEffort: '', recurrence: 'None', checklist: [],
  dependencies: [], resourceRequirements: '',
  evidenceRules: { photos: 0, documents: 0, gps: false, measurement: false, quantity: false, signature: false }, measurementLabel: '',
  quantity: '', unit: '', approvalRequired: false, verificationRequired: false, closureMethod: 'Verifier closes after acceptance', raw: undefined,
});

export const taskRecordToDraft = (task: TaskRecord): TaskDraft => {
  const { id: _id, status: _status, progress: _progress, blocked: _blocked, overdue: _overdue, nextActor: _nextActor,
    issues: _issues, activity: _activity, createdAt: _createdAt, updatedAt: _updatedAt, ...editable } = task;
  return { ...editable, templateId: (task as TaskRecord & { templateId?: string }).templateId || '' };
};
