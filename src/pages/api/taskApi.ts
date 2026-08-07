import getBaseUrl from '@/lib/config';
import type { TaskDraft, TaskPerson, TaskRecord, TaskRecordRef } from '../domain/taskTypes';

const BASE_URL = getBaseUrl().replace(/\/$/, '');
const TASKS_STORAGE_KEY = 'sbr:on-demand-task:tasks.v1';

export type TaskResources = {
  staff: TaskPerson[];
  vendors: TaskPerson[];
  records: TaskRecordRef[];
};

const readStoredTasks = (): TaskRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TASKS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStoredTasks = (tasks: TaskRecord[]) => {
  window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
};

const genId = () => `TASK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

// This module (on_demand_task_new) is a self-contained rebuild of the On-Demand
// Task screen. Task read/write stays local to the browser for now — deliberately
// not wired into the legacy /admin_ops_requests/*_on_demand_tasks* endpoints
// OnDemandTask.tsx uses, since that backend's task shape doesn't line up with this
// module's richer draft (checklist/evidence/approval chain). Staff and location
// pickers do use the real backend so the People/Context tabs work with real data.
export const getTasks = async (): Promise<TaskRecord[]> => readStoredTasks();

export const getTaskResources = async (): Promise<TaskResources> => {
  const resources: TaskResources = { staff: [], vendors: [], records: [] };

  try {
    const res = await fetch(`${BASE_URL}/admin_staff/get_all_staff`);
    const data: any = await res.json().catch(() => null);
    if (Array.isArray(data)) {
      resources.staff = data
        .map((staff: any) => ({
          id: String(staff?.staff_id ?? ''),
          name: String(staff?.staff_information?.staff_name ?? '').trim(),
          detail: String(staff?.staff_information?.staff_designation ?? '').trim() || undefined,
        }))
        .filter((person: TaskPerson) => person.id && person.name);
    }
  } catch {
    // Staff list stays empty — the People tab shows "No employees available."
  }

  try {
    const res = await fetch(`${BASE_URL}/farmer_managment/get_farms`);
    const data: any = await res.json().catch(() => null);
    if (Array.isArray(data?.farms)) {
      resources.records = data.farms
        .map((farm: any) => {
          const landData = farm?.land_data || {};
          const village = landData.village || farm?.village || '';
          const district = landData.district || farm?.district || '';
          return {
            id: String(farm?.farm_id ?? ''),
            type: 'Land Parcel',
            label: [village, district].filter(Boolean).join(', ') || String(farm?.farm_id ?? 'Land parcel'),
            detail: farm?.area ? `${farm.area} acres` : undefined,
          };
        })
        .filter((record: TaskRecordRef) => record.id);
    }
  } catch {
    // Location picker stays empty — custom location remains available.
  }

  return resources;
};

export const createTask = async (
  draft: TaskDraft,
  mode: 'draft' | 'approval' | 'assign',
  taskId?: string,
): Promise<TaskRecord> => {
  const tasks = readStoredTasks();
  const now = new Date().toISOString();
  const status = mode === 'draft' ? 'DRAFT' : mode === 'approval' ? 'PENDING APPROVAL' : 'ASSIGNED';
  const nextActor = mode === 'draft'
    ? draft.owner?.name || 'Unassigned'
    : mode === 'approval'
      ? draft.approver?.name || 'Approver'
      : draft.executor?.name || 'Unassigned';

  if (taskId) {
    const index = tasks.findIndex((task) => task.id === taskId);
    const existing = index >= 0 ? tasks[index] : null;
    const updated: TaskRecord = {
      ...draft,
      id: taskId,
      status,
      progress: existing?.progress ?? 0,
      nextActor,
      overdue: false,
      blocked: false,
      issues: existing?.issues ?? [],
      activity: [
        ...(existing?.activity ?? []),
        { id: `act-${Date.now()}`, action: 'Task revised', actor: draft.owner?.name || 'System', at: now },
      ],
    };
    if (index >= 0) tasks[index] = updated;
    else tasks.push(updated);
    writeStoredTasks(tasks);
    return updated;
  }

  const created: TaskRecord = {
    ...draft,
    id: genId(),
    status,
    progress: 0,
    nextActor,
    overdue: false,
    blocked: false,
    issues: [],
    activity: [{ id: `act-${Date.now()}`, action: 'Task created', actor: draft.owner?.name || 'System', at: now }],
  };
  tasks.unshift(created);
  writeStoredTasks(tasks);
  return created;
};
