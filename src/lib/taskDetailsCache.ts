import getBaseUrl from "@/lib/config";

// Shared across every consumer that needs a Tasks-table record by task_id (Cultivation
// Calendar's Task Timeline photos + day-popup vendor lookup, WccModal's task lookups, ...) so a
// task_id is only ever resolved once per session instead of every consumer re-fetching it
// independently.

export type TaskDetails = Record<string, unknown>;

const cache = new Map<string, TaskDetails>();
const inFlight = new Map<string, Promise<void>>(); // task_id -> the bulk fetch it's part of

// One request for every id that isn't cached yet, instead of one request per task_id.
async function fetchBulk(taskIds: string[]): Promise<void> {
  const base = getBaseUrl().replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/admin_all_task/get_task_details_bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_ids: taskIds }),
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    const results: Record<string, unknown> = data?.results && typeof data.results === "object" ? data.results : {};
    taskIds.forEach((id) => {
      const entry = results[id];
      cache.set(id, entry && typeof entry === "object" ? (entry as TaskDetails) : {});
    });
  } catch {
    taskIds.forEach((id) => cache.set(id, {}));
  }
}

// Resolves task_id -> its Tasks-table record for the given ids, reusing cached/in-flight
// lookups and fetching whatever's missing in a single bulk request.
export async function getTaskDetailsBulk(taskIds: string[]): Promise<Record<string, TaskDetails>> {
  const uniqueIds = Array.from(new Set(taskIds.filter(Boolean)));
  const toFetch = uniqueIds.filter((id) => !cache.has(id) && !inFlight.has(id));

  if (toFetch.length > 0) {
    const bulkPromise = fetchBulk(toFetch);
    toFetch.forEach((id) => inFlight.set(id, bulkPromise));
    await bulkPromise;
    toFetch.forEach((id) => inFlight.delete(id));
  }

  // Ids another concurrent caller is already fetching — wait on their in-flight promise
  // instead of double-fetching.
  const stillPending = new Set(uniqueIds.filter((id) => inFlight.has(id)).map((id) => inFlight.get(id)!));
  if (stillPending.size > 0) {
    await Promise.all(Array.from(stillPending));
  }

  const result: Record<string, TaskDetails> = {};
  uniqueIds.forEach((id) => {
    result[id] = cache.get(id) ?? {};
  });
  return result;
}
