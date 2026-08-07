import { useCallback, useEffect, useState } from 'react';
import { getTasks } from '../api/taskApi';
import type { TaskRecord } from '../domain/taskTypes';

export const useTasks = () => {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    setError('');
    getTasks()
      .then(setTasks)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load tasks'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { tasks, loading, error, reload };
};
