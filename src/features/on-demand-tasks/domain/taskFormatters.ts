import type { TaskPriority, TaskStatus } from './taskTypes';

export const formatTaskDate = (value?: string, withTime = false) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date).replace(/\//g, '-');
};

export const statusTone = (status: TaskStatus) => {
  if (['CLOSED', 'VERIFIED'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['REJECTED', 'CANCELLED', 'REWORK REQUIRED'].includes(status)) return 'border-red-200 bg-red-50 text-red-700';
  if (['IN PROGRESS', 'ACCEPTED', 'SUBMITTED', 'UNDER VERIFICATION'].includes(status)) return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'ON HOLD') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

export const priorityTone = (priority: TaskPriority) => ({
  LOW: 'border-slate-200 bg-slate-50 text-slate-600',
  MEDIUM: 'border-blue-200 bg-blue-50 text-blue-700',
  HIGH: 'border-amber-200 bg-amber-50 text-amber-700',
  CRITICAL: 'border-red-200 bg-red-50 text-red-700',
}[priority]);

export const titleCaseStatus = (value: string) => value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
