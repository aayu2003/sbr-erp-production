import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyTaskDraft, type TaskDraft } from '../domain/taskTypes';

const AUTOSAVE_DELAY_MS = 600;
const DEFAULT_KEY = 'sbr:on-demand-task:draft:new';

const readDraft = (key: string): TaskDraft => {
  if (typeof window === 'undefined') return emptyTaskDraft;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...emptyTaskDraft, ...JSON.parse(raw) } : emptyTaskDraft;
  } catch {
    return emptyTaskDraft;
  }
};

// Autosaves a task draft to localStorage under `storageKey` (falls back to a
// shared "new task" slot when editing a fresh, not-yet-created task). Used by
// TaskFormPage for both the create and edit flows.
export const useTaskDraft = (storageKey?: string) => {
  const key = storageKey || DEFAULT_KEY;
  const [hasSavedDraft] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(key) !== null;
  });
  const [draft, setDraftState] = useState<TaskDraft>(() => readDraft(key));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(draft));
        setSavedAt(new Date().toISOString());
      } catch {
        // localStorage unavailable — autosave silently skipped.
      }
    }, AUTOSAVE_DELAY_MS);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [draft, key]);

  const setDraft = useCallback((updater: TaskDraft | ((current: TaskDraft) => TaskDraft)) => {
    setDraftState((current) => (typeof updater === 'function' ? (updater as (c: TaskDraft) => TaskDraft)(current) : updater));
  }, []);

  const clearDraft = useCallback(() => {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    setDraftState(emptyTaskDraft);
    setSavedAt(null);
  }, [key]);

  return { draft, setDraft, savedAt, clearDraft, hasSavedDraft };
};
