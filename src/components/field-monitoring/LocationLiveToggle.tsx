import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLocationTracing } from '@/hooks/useLocationTracing';

interface LocationLiveToggleProps {
  staffId: string;
}

export function LocationLiveToggle({ staffId }: LocationLiveToggleProps) {
  const [enabled, setEnabled] = useState(false);
  const { connected, tracerData, totalPoints, error } = useLocationTracing(staffId, enabled);
  const uniquePoints = new Set(tracerData.map((point) => `${point[0]}:${point[1]}`)).size;

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Live tracing</p>
          <p className="text-xs text-gray-500">Staff: {staffId}</p>
        </div>
        <Button type="button" variant={enabled ? 'secondary' : 'outline'} onClick={() => setEnabled((prev) => !prev)}>
          {enabled ? 'Live on' : 'Live'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{connected ? 'Connected' : enabled ? 'Connecting...' : 'Idle'}</span>
        <span>Total points: {totalPoints}</span>
        <span>Unique points: {uniquePoints}</span>
        {error && <span className="text-red-600">{error}</span>}
      </div>

      <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
{JSON.stringify(tracerData, null, 2)}
      </pre>
    </div>
  );
}