import type { TaskDraft } from './taskTypes';

export type TaskValidationIssue = {
  field: string;
  message: string;
  blocking: boolean;
  section: number;
};

// Section indices mirror on_demand_task_new.tsx's `sections` array:
// 0 Basics, 1 Context, 2 People, 3 Plan, 4 Completion Controls, 5 Review
export const validateTaskDraft = (draft: TaskDraft): TaskValidationIssue[] => {
  const issues: TaskValidationIssue[] = [];
  const push = (field: string, message: string, section: number, blocking = true) =>
    issues.push({ field, message, blocking, section });

  if (!draft.title.trim()) push('title', 'Task title is required', 0);
  if (!draft.category.trim()) push('category', 'Category is required', 0);
  if (draft.priority === 'CRITICAL' && !draft.criticalReason.trim()) {
    push('criticalReason', 'Critical priority requires a reason', 0);
  }

  if (draft.locationMode === 'erp' && !draft.primaryLocation) {
    push('primaryLocation', 'Select a primary location', 1);
  }
  if (draft.locationMode === 'custom' && !draft.customLocation.trim()) {
    push('customLocation', 'Enter a custom location', 1);
  }

  if (!draft.requester) push('requester', 'Requester is required', 2);
  if (!draft.owner) push('owner', 'Task owner is required', 2);
  if (!draft.executor) {
    push('executor', draft.assignmentMode === 'vendor' ? 'Select a vendor/contractor' : 'Select an executor', 2);
  }
  if (draft.assignmentMode === 'vendor' && !draft.coordinator) {
    push('coordinator', 'Internal coordinator is required for vendor tasks', 2);
  }

  if (!draft.dueDate) push('dueDate', 'Due date is required', 3);
  if (draft.plannedStart && draft.dueDate && draft.plannedStart > draft.dueDate) {
    push('plannedStart', 'Planned start must be on or before the due date', 3);
  }
  if (draft.checklist.some((item) => !item.title.trim())) {
    push('checklist', 'Every checklist item needs a title', 3);
  }

  if (draft.evidenceRules.photos < 0 || draft.evidenceRules.documents < 0) {
    push('evidenceRules', 'Evidence counts cannot be negative', 4, false);
  }

  return issues;
};
