import type { TaskPriority, TaskStatus } from './taskTypes';

export const formatTaskDate = (value?: string): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const STATUS_TONES: Record<TaskStatus, string> = {
  'DRAFT': 'border-slate-200 bg-slate-50 text-slate-600',
  'PENDING APPROVAL': 'border-amber-200 bg-amber-50 text-amber-700',
  'ASSIGNED': 'border-blue-200 bg-blue-50 text-blue-700',
  'ACCEPTED': 'border-indigo-200 bg-indigo-50 text-indigo-700',
  'IN PROGRESS': 'border-sky-200 bg-sky-50 text-sky-700',
  'ON HOLD': 'border-orange-200 bg-orange-50 text-orange-700',
  'REWORK REQUIRED': 'border-red-200 bg-red-50 text-red-700',
  'SUBMITTED': 'border-purple-200 bg-purple-50 text-purple-700',
  'UNDER VERIFICATION': 'border-cyan-200 bg-cyan-50 text-cyan-700',
  'CLOSED': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'CANCELLED': 'border-slate-200 bg-slate-100 text-slate-500',
  'REJECTED': 'border-red-200 bg-red-50 text-red-700',
};

export const statusTone = (status: TaskStatus): string =>
  STATUS_TONES[status] ?? 'border-slate-200 bg-slate-50 text-slate-600';

const PRIORITY_TONES: Record<TaskPriority, string> = {
  LOW: 'border-slate-200 bg-slate-50 text-slate-600',
  MEDIUM: 'border-blue-200 bg-blue-50 text-blue-700',
  HIGH: 'border-amber-200 bg-amber-50 text-amber-700',
  CRITICAL: 'border-red-200 bg-red-50 text-red-700',
};

export const priorityTone = (priority: TaskPriority): string => PRIORITY_TONES[priority] ?? PRIORITY_TONES.MEDIUM;
