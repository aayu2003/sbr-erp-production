import type { TaskDraft } from './taskTypes';

export type TaskValidationIssue = { section: number; field: string; message: string; blocking: boolean };

export const validateTaskDraft = (draft: TaskDraft): TaskValidationIssue[] => {
  const issues: TaskValidationIssue[] = [];
  const required = (condition: boolean, section: number, field: string, message: string) => {
    if (!condition) issues.push({ section, field, message, blocking: true });
  };
  required(!!draft.title.trim(), 0, 'title', 'Task title is required.');
  required(!!draft.type, 0, 'type', 'Task type is required.');
  required(!!draft.category, 0, 'category', 'Category is required.');
  required(!!draft.requester, 2, 'requester', 'Requester is required.');
  required(!!draft.owner, 2, 'owner', 'An accountable internal owner is required.');
  required(!!draft.executor, 2, 'executor', 'Select an executor or department queue.');
  required(!!draft.dueDate, 3, 'dueDate', 'Due date is required.');
  required(draft.locationMode !== 'erp' || !!draft.primaryLocation, 1, 'primaryLocation', 'Select a primary ERP location or record.');
  required(draft.locationMode !== 'custom' || !!draft.customLocation.trim(), 1, 'customLocation', 'Enter the custom location.');
  required(draft.assignmentMode !== 'vendor' || !!draft.coordinator, 2, 'coordinator', 'Vendor tasks require an internal coordinator.');
  required(!draft.approvalRequired || !!draft.approver, 2, 'approver', 'Select an approver.');
  required(!draft.verificationRequired || !!draft.verifier, 2, 'verifier', 'Select a verifier.');
  required(draft.priority !== 'CRITICAL' || !!draft.criticalReason.trim(), 0, 'criticalReason', 'Critical priority requires a reason.');
  if (draft.plannedStart && draft.dueDate && draft.dueDate < draft.plannedStart) {
    issues.push({ section: 3, field: 'dueDate', message: 'Due date cannot be before the planned start date.', blocking: true });
  }
  if (draft.checklist.length === 0) {
    issues.push({ section: 3, field: 'checklist', message: 'Add at least one checklist item for clearer execution.', blocking: false });
  }
  return issues;
};
