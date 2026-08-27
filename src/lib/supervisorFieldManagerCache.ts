import getBaseUrl from "@/lib/config";

// Shared across every consumer that needs a farm's assigned supervisor/field manager (the
// Cultivation Calendar's Task Timeline panel and day popup, so far) — a farm_id is only ever
// resolved once per session instead of every consumer re-fetching it independently.

export type FarmTeamAssignment = {
  supervisorName: string;
  supervisorContact: string;
  fieldManagers: { name: string; contact: string }[];
};

const EMPTY_ASSIGNMENT: FarmTeamAssignment = { supervisorName: "", supervisorContact: "", fieldManagers: [] };

const cache = new Map<string, FarmTeamAssignment>();
const inFlight = new Map<string, Promise<void>>(); // farm_id -> the bulk fetch it's part of

// One request for every id that isn't cached yet, instead of one request per farm_id.
async function fetchBulk(farmIds: string[]): Promise<void> {
  const base = getBaseUrl().replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/farmer_managment/get_assigned_supervisor_and_field_manager_bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ farm_ids: farmIds }),
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    const results: Record<string, unknown> = data?.success && data?.results && typeof data.results === "object" ? data.results : {};
    farmIds.forEach((id) => {
      const entry = (results[id] ?? {}) as { assigned_supervisor?: Record<string, unknown>; assigned_field_manager?: unknown };
      const sup = entry.assigned_supervisor;
      const fmRaw = entry.assigned_field_manager;
      const fms = Array.isArray(fmRaw) ? fmRaw : fmRaw ? [fmRaw] : [];
      cache.set(id, {
        supervisorName: typeof sup?.supervisor_name === "string" ? sup.supervisor_name : "",
        supervisorContact: typeof sup?.suervisor_contact === "string" ? sup.suervisor_contact : typeof sup?.supervisor_contact === "string" ? (sup.supervisor_contact as string) : "",
        fieldManagers: fms.map((fm) => {
          const f = (fm ?? {}) as Record<string, unknown>;
          return { name: typeof f.name === "string" ? f.name : "", contact: typeof f.contact === "string" ? f.contact : "" };
        }),
      });
    });
  } catch {
    farmIds.forEach((id) => cache.set(id, EMPTY_ASSIGNMENT));
  }
}

// Resolves farm_id -> {supervisorName, supervisorContact, fieldManagers} for the given ids,
// reusing cached/in-flight lookups and fetching whatever's missing in a single bulk request.
export async function getAssignedSupervisorAndFieldManagers(farmIds: string[]): Promise<Record<string, FarmTeamAssignment>> {
  const uniqueIds = Array.from(new Set(farmIds.filter(Boolean)));
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

  const result: Record<string, FarmTeamAssignment> = {};
  uniqueIds.forEach((id) => {
    result[id] = cache.get(id) ?? EMPTY_ASSIGNMENT;
  });
  return result;
}
