import getBaseUrl from "@/lib/config";

// Shared across every page that needs a farm's farmer name (CEO's Desk, Cultivation
// Calendar, Scope of Work, Farm Directory, ...) so a farm_id is only ever resolved once
// per session instead of every page re-fetching it independently.

const cache = new Map<string, string>(); // farm_id -> farmer_name
const inFlight = new Map<string, Promise<void>>(); // farm_id -> the bulk fetch it's part of

// One request for every id that isn't cached yet, instead of one request per farm_id.
async function fetchBulk(farmIds: string[]): Promise<void> {
  const base = getBaseUrl().replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/farmer_managment/get_farmer_names_bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ farm_ids: farmIds }),
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    const names: Record<string, unknown> = data?.success && data?.data && typeof data.data === "object" ? data.data : {};
    farmIds.forEach((id) => {
      const name = names[id];
      cache.set(id, typeof name === "string" ? name.trim() : "");
    });
  } catch {
    farmIds.forEach((id) => cache.set(id, ""));
  }
}

// Resolves farm_id -> farmer_name for the given ids, reusing cached/in-flight lookups and
// fetching whatever's missing in a single bulk request.
export async function getFarmerNames(farmIds: string[]): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(farmIds.filter(Boolean)));
  const toFetch = uniqueIds.filter((id) => !cache.has(id) && !inFlight.has(id));

  if (toFetch.length > 0) {
    const bulkPromise = fetchBulk(toFetch);
    toFetch.forEach((id) => inFlight.set(id, bulkPromise));
    await bulkPromise;
    toFetch.forEach((id) => inFlight.delete(id));
  }

  // Ids another concurrent caller (e.g. a different page mounted at the same time) is
  // already fetching — wait on their in-flight promise instead of double-fetching.
  const stillPending = new Set(uniqueIds.filter((id) => inFlight.has(id)).map((id) => inFlight.get(id)!));
  if (stillPending.size > 0) {
    await Promise.all(Array.from(stillPending));
  }

  const result: Record<string, string> = {};
  uniqueIds.forEach((id) => {
    result[id] = cache.get(id) ?? "";
  });
  return result;
}
