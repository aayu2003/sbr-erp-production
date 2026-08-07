export type TaskStatus =
  | 'DRAFT'
  | 'PENDING APPROVAL'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'IN PROGRESS'
  | 'ON HOLD'
  | 'REWORK REQUIRED'
  | 'SUBMITTED'
  | 'UNDER VERIFICATION'
  | 'CLOSED'
  | 'CANCELLED'
  | 'REJECTED';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TaskType =
  | 'Action'
  | 'Inspection'
  | 'Follow-up'
  | 'Information'
  | 'Corrective Action'
  | 'Approval'
  | 'Other';

export type TaskPerson = {
  id: string;
  name: string;
  detail?: string;
};

export type TaskRecordRef = {
  id: string;
  type?: string;
  label: string;
  detail?: string;
};

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
};

export type EvidenceRules = {
  photos: number;
  documents: number;
  gps: boolean;
  measurement: boolean;
  quantity: boolean;
  signature: boolean;
};

export type TaskDraft = {
  templateId: string;
  title: string;
  type: TaskType;
  category: string;
  subcategory: string;
  priority: TaskPriority;
  description: string;
  expectedOutcome: string;
  criticalReason: string;
  tags: string[];
  locationMode: 'none' | 'erp' | 'custom';
  primaryLocation: TaskRecordRef | null;
  customLocation: string;
  relatedRecords: TaskRecordRef[];
  requester: TaskPerson | null;
  owner: TaskPerson | null;
  assignmentMode: 'employee' | 'team' | 'department' | 'vendor';
  executor: TaskPerson | null;
  coordinator: TaskPerson | null;
  approver: TaskPerson | null;
  verifier: TaskPerson | null;
  collaborators: TaskPerson[];
  observers: TaskPerson[];
  plannedStart: string;
  dueDate: string;
  estimatedEffort: string;
  recurrence: string;
  dependencies: TaskRecordRef[];
  resourceRequirements: string;
  checklist: ChecklistItem[];
  evidenceRules: EvidenceRules;
  measurementLabel: string;
  quantity: string;
  unit: string;
  approvalRequired: boolean;
  verificationRequired: boolean;
};

export type TaskIssue = {
  id: string;
  title: string;
  severity: string;
  resolved: boolean;
};

export type TaskActivity = {
  id: string;
  action: string;
  actor: string;
  at: string;
};

export type TaskRecord = TaskDraft & {
  id: string;
  status: TaskStatus;
  progress: number;
  nextActor: string;
  overdue: boolean;
  blocked: boolean;
  issues: TaskIssue[];
  activity: TaskActivity[];
};

export const TASK_CATEGORIES = [
  'Cultivation',
  'Irrigation',
  'Equipment',
  'Maintenance',
  'Procurement',
  'Compliance',
  'Logistics',
  'Administration',
  'Other',
];

export const TASK_STATUSES: TaskStatus[] = [
  'DRAFT',
  'PENDING APPROVAL',
  'ASSIGNED',
  'ACCEPTED',
  'IN PROGRESS',
  'ON HOLD',
  'REWORK REQUIRED',
  'SUBMITTED',
  'UNDER VERIFICATION',
  'CLOSED',
  'CANCELLED',
  'REJECTED',
];

export const emptyEvidenceRules: EvidenceRules = {
  photos: 0,
  documents: 0,
  gps: false,
  measurement: false,
  quantity: false,
  signature: false,
};

export const emptyTaskDraft: TaskDraft = {
  templateId: '',
  title: '',
  type: 'Action',
  category: '',
  subcategory: '',
  priority: 'MEDIUM',
  description: '',
  expectedOutcome: '',
  criticalReason: '',
  tags: [],
  locationMode: 'none',
  primaryLocation: null,
  customLocation: '',
  relatedRecords: [],
  requester: null,
  owner: null,
  assignmentMode: 'employee',
  executor: null,
  coordinator: null,
  approver: null,
  verifier: null,
  collaborators: [],
  observers: [],
  plannedStart: '',
  dueDate: '',
  estimatedEffort: '',
  recurrence: 'None',
  dependencies: [],
  resourceRequirements: '',
  checklist: [],
  evidenceRules: { ...emptyEvidenceRules },
  measurementLabel: '',
  quantity: '',
  unit: '',
  approvalRequired: false,
  verificationRequired: false,
};

type TaskTemplate = {
  id: string;
  name: string;
  description: string;
  type: TaskType;
  category: string;
  priority: TaskPriority;
  durationDays: number;
  locationRequired: boolean;
  checklist: Pick<ChecklistItem, 'title' | 'description' | 'mandatory' | 'evidenceRequired'>[];
  evidenceRules: EvidenceRules;
  verificationRequired: boolean;
};

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'field-inspection',
    name: 'Field Inspection',
    description: 'Routine walk-through of a land parcel to check crop health and irrigation.',
    type: 'Inspection',
    category: 'Cultivation',
    priority: 'MEDIUM',
    durationDays: 1,
    locationRequired: true,
    checklist: [
      { title: 'Check crop stage and health', description: 'Note any pest, disease or nutrient deficiency signs.', mandatory: true, evidenceRequired: true },
      { title: 'Check irrigation system', description: 'Confirm water reaches all zones.', mandatory: true, evidenceRequired: false },
      { title: 'Record soil moisture', description: '', mandatory: false, evidenceRequired: false },
    ],
    evidenceRules: { photos: 2, documents: 0, gps: true, measurement: false, quantity: false, signature: false },
    verificationRequired: true,
  },
  {
    id: 'equipment-maintenance',
    name: 'Equipment Maintenance',
    description: 'Scheduled servicing for farm equipment or vehicles.',
    type: 'Action',
    category: 'Equipment',
    priority: 'MEDIUM',
    durationDays: 2,
    locationRequired: false,
    checklist: [
      { title: 'Inspect for visible wear/damage', description: '', mandatory: true, evidenceRequired: true },
      { title: 'Service / replace consumables', description: 'Oil, filters, belts as applicable.', mandatory: true, evidenceRequired: false },
      { title: 'Test run after service', description: '', mandatory: true, evidenceRequired: false },
    ],
    evidenceRules: { photos: 1, documents: 1, gps: false, measurement: false, quantity: false, signature: true },
    verificationRequired: true,
  },
  {
    id: 'procurement-followup',
    name: 'Procurement Follow-up',
    description: 'Chase a pending purchase order or delivery.',
    type: 'Follow-up',
    category: 'Procurement',
    priority: 'HIGH',
    durationDays: 3,
    locationRequired: false,
    checklist: [
      { title: 'Confirm vendor acknowledgement', description: '', mandatory: true, evidenceRequired: false },
      { title: 'Confirm dispatch/ETA', description: '', mandatory: true, evidenceRequired: false },
    ],
    evidenceRules: { photos: 0, documents: 1, gps: false, measurement: false, quantity: true, signature: false },
    verificationRequired: false,
  },
  {
    id: 'compliance-check',
    name: 'Compliance Check',
    description: 'Verify statutory or contractual compliance for a farm or vendor.',
    type: 'Corrective Action',
    category: 'Compliance',
    priority: 'HIGH',
    durationDays: 5,
    locationRequired: true,
    checklist: [
      { title: 'Review documentation', description: '', mandatory: true, evidenceRequired: true },
      { title: 'Site verification', description: '', mandatory: true, evidenceRequired: true },
      { title: 'Corrective action plan (if needed)', description: '', mandatory: false, evidenceRequired: false },
    ],
    evidenceRules: { photos: 2, documents: 2, gps: true, measurement: false, quantity: false, signature: true },
    verificationRequired: true,
  },
];

export const taskRecordToDraft = (task: TaskRecord): TaskDraft => ({
  templateId: task.templateId,
  title: task.title,
  type: task.type,
  category: task.category,
  subcategory: task.subcategory,
  priority: task.priority,
  description: task.description,
  expectedOutcome: task.expectedOutcome,
  criticalReason: task.criticalReason,
  tags: task.tags,
  locationMode: task.locationMode,
  primaryLocation: task.primaryLocation,
  customLocation: task.customLocation,
  relatedRecords: task.relatedRecords,
  requester: task.requester,
  owner: task.owner,
  assignmentMode: task.assignmentMode,
  executor: task.executor,
  coordinator: task.coordinator,
  approver: task.approver,
  verifier: task.verifier,
  collaborators: task.collaborators,
  observers: task.observers,
  plannedStart: task.plannedStart,
  dueDate: task.dueDate,
  estimatedEffort: task.estimatedEffort,
  recurrence: task.recurrence,
  dependencies: task.dependencies,
  resourceRequirements: task.resourceRequirements,
  checklist: task.checklist,
  evidenceRules: task.evidenceRules,
  measurementLabel: task.measurementLabel,
  quantity: task.quantity,
  unit: task.unit,
  approvalRequired: task.approvalRequired,
  verificationRequired: task.verificationRequired,
});
