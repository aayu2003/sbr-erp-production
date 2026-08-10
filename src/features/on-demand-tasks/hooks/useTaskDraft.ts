import { useEffect, useState } from 'react';
import { createBlankTaskDraft, type TaskDraft } from '../domain/taskTypes';

const KEY = 'sbr:on-demand-task:draft:v2';

export const useTaskDraft = (storageKey = KEY) => {
  const [hasSavedDraft] = useState(() => !!localStorage.getItem(storageKey));
  const [draft, setDraft] = useState<TaskDraft>(() => {
    try { return { ...createBlankTaskDraft(), ...JSON.parse(localStorage.getItem(storageKey) || '{}') }; }
    catch { return createBlankTaskDraft(); }
  });
  const [savedAt, setSavedAt] = useState<string>('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      setSavedAt(new Date().toISOString());
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, storageKey]);
  const clearDraft = () => { localStorage.removeItem(storageKey); setDraft(createBlankTaskDraft()); setSavedAt(''); };
  return { draft, setDraft, savedAt, clearDraft, hasSavedDraft };
};
