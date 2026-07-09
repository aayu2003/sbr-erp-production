import getBaseUrl from "@/lib/config";

// Shared across every page that needs a farm's farmer name (CEO's Desk, Cultivation
// Calendar, Scope of Work, Farm Directory, ...) so a farm_id is only ever resolved once
// per session instead of every page re-fetching it independently.
const CONCURRENCY = 10;

const cache = new Map<string, string>(); // farm_id -> farmer_name
const inFlight = new Map<string, Promise<string>>(); // farm_id -> pending fetch

async function fetchOne(farmId: string): Promise<string> {
  const base = getBaseUrl().replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/farmer_managment/get_farmer_details_from_farm_id/${farmId}`);
    if (!res.ok) return "";
    const data = await res.json().catch(() => null);
    const name = data?.farmer?.farmer_name;
    return typeof name === "string" ? name.trim() : "";
  } catch {
    return "";
  }
}

// Resolves farm_id -> farmer_name for the given ids, reusing cached/in-flight lookups and
// fetching the rest in chunks of CONCURRENCY so a page with many farms doesn't fire them
// all at once.
export async function getFarmerNames(farmIds: string[]): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(farmIds.filter(Boolean)));
  const toFetch = uniqueIds.filter((id) => !cache.has(id) && !inFlight.has(id));

  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const chunk = toFetch.slice(i, i + CONCURRENCY);
    chunk.forEach((id) => {
      inFlight.set(
        id,
        fetchOne(id).then((name) => {
          cache.set(id, name);
          return name;
        })
      );
    });
    await Promise.all(chunk.map((id) => inFlight.get(id)));
    chunk.forEach((id) => inFlight.delete(id));
  }

  // Ids another concurrent caller (e.g. a different page mounted at the same time) is
  // already fetching — wait on their in-flight promise instead of double-fetching.
  const stillPending = uniqueIds.filter((id) => inFlight.has(id));
  if (stillPending.length > 0) {
    await Promise.all(stillPending.map((id) => inFlight.get(id)));
  }

  const result: Record<string, string> = {};
  uniqueIds.forEach((id) => {
    result[id] = cache.get(id) ?? "";
  });
  return result;
}
