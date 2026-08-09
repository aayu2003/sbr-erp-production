import { useCallback, useEffect, useState } from 'react';
import { getTasks } from '../api/taskApi';
import type { TaskRecord } from '../domain/taskTypes';

export const useTasks = () => {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setTasks(await getTasks()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load tasks'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  return { tasks, loading, error, reload };
};
