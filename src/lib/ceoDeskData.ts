import getBaseUrl from "@/lib/config";

// A tiny promise cache so the CEO's Desk data can start warming the moment login succeeds
// (or a returning user's token is validated) — while the heavy <CeosDesk> route chunk is
// still downloading — and then be re-used, not re-fetched, when <CeosDesk> mounts and runs
// its own tab loaders.
//
// Keyed by full URL. Each entry holds the in-flight-or-settled parsed-JSON promise plus the
// time it was created; anything older than TTL_MS counts as a miss, so a stale warm (user
// left the login page open for minutes) never serves outdated numbers.
const TTL_MS = 90_000;

type Entry = { at: number; promise: Promise<unknown> };
const jsonCache = new Map<string, Entry>();

const isFresh = (entry: Entry | undefined): entry is Entry =>
  !!entry && Date.now() - entry.at < TTL_MS;

// GET a URL and parse it as JSON, reusing an existing in-flight/recent request for the same
// URL. A rejected request is evicted rather than cached, so the next caller retries for real.
export const cachedJson = <T = unknown>(url: string): Promise<T> => {
  const hit = jsonCache.get(url);
  if (isFresh(hit)) return hit.promise as Promise<T>;

  const promise = fetch(url)
    .then((res) => res.json())
    .catch((err) => {
      jsonCache.delete(url);
      throw err;
    });

  jsonCache.set(url, { at: Date.now(), promise });
  return promise as Promise<T>;
};

// Paths the Dashboard (first tab) and the background tab loaders hit directly with no
// dependency on a prior response — safe to fire blind. The per-budget xlsx pulls and the
// per-calendar crop-type lookups depend on these results, so they're left to <CeosDesk>.
const WARM_PATHS = [
  "/farmer_managment/get_leads",
  "/farmer_managment/get_farms",
  "/ceo_desk/get_cluster_wise_crop_distribution",
  "/admin_cultivation/fetch_cultivation_calander",
  "/ceo_desk/get_financial_analytics_KPIs",
  "/ceo_desk/budget_wise_utilization_bifurcation",
  "/ceo_desk/get_category_wise_budget_utilization",
  "/admin_accounts/get_budgets",
  "/ceo_desk/get_actual_disbursement",
  "/inventory/get_all_item",
  "/admin_staff/get_all_staff",
];

let warmed = false;

// Fire-and-forget. Call once, right after login succeeds (or a returning session validates),
// so these requests overlap the CeosDesk route chunk download instead of starting only after
// <CeosDesk> has mounted. Idempotent per page load; failures are swallowed because <CeosDesk>
// re-requests any miss anyway.
export const warmCeoDeskData = () => {
  if (warmed) return;
  warmed = true;
  const base = getBaseUrl().replace(/\/$/, "");
  for (const path of WARM_PATHS) {
    void cachedJson(`${base}${path}`).catch(() => {});
  }
};
