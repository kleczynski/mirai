export type MonitoringMetric = {
  label: string;
  value: string | null;
  source: string;
  checkedAt: string | null;
};
export type MonitoringService = {
  id: string;
  name: string;
  status: "running" | "warning" | "degraded" | "paused" | "unknown";
  statusLabel: string;
  details: string;
  metrics: MonitoringMetric[];
  alerts: { severity: "warning" | "critical"; message: string }[];
  billing: { url: string; action: string; description: string };
};
export type MonitoringSnapshot = {
  generatedAt: string;
  summary: {
    totalSessions: number;
    activeInvitations: number;
    totalDemos: number;
    totalFeedback: number;
    discoveryRequests: number;
    discoveryCostUsd: number;
    discoveryBudgetUsd: number;
    discoveryBudgetUsedPercent: number;
  };
  services: MonitoringService[];
};
export type ClerkObservation = {
  count: number | null;
  checkedAt: string | null;
  state: "available" | "unavailable" | "not-configured";
};

// One bounded metadata request. No retries, user profiles or billing assumptions.
export async function observeClerk(
  secret: string | undefined,
  request: typeof fetch = fetch,
): Promise<ClerkObservation> {
  if (!secret) return { count: null, checkedAt: null, state: "not-configured" };
  try {
    const response = await request("https://api.clerk.com/v1/users/count", {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error("Clerk count unavailable");
    const data = (await response.json()) as { total_count?: unknown };
    if (!Number.isSafeInteger(data.total_count) || Number(data.total_count) < 0)
      throw new Error("Invalid Clerk count");
    return {
      count: Number(data.total_count),
      checkedAt: new Date().toISOString(),
      state: "available",
    };
  } catch {
    // Do not log provider bodies, keys or identity. Availability is visible in the UI.
    return { count: null, checkedAt: null, state: "unavailable" };
  }
}

const dollars = (value: number) => `$${value.toFixed(6)}`;
const bytes = (value: number) => `${value.toLocaleString("en-US")} bytes`;
export function buildMonitoringServices(input: {
  now: string;
  summary: MonitoringSnapshot["summary"];
  discovery: {
    enabled: boolean;
    model: string;
    sessionCapUsd: number;
    failed: number;
    pending: number;
    lastActivityAt: number | null;
  };
  databaseBytes: number | null;
  files: { count: number; bytes: number } | null;
  bucketConfigured: boolean;
  clerk: ClerkObservation;
}): MonitoringService[] {
  const { now, summary, discovery } = input;
  const metric = (
    label: string,
    value: string | null,
    source = "Mirai",
    checkedAt: string | null = now,
  ): MonitoringMetric => ({
    label,
    value,
    source,
    checkedAt: value === null ? null : checkedAt,
  });
  const unknownBilling = () => [
    metric("Provider plan", null, "Provider dashboard", null),
    metric("Billing period / reset", null, "Provider dashboard", null),
    metric("Provider charges", null, "Provider dashboard", null),
  ];
  const alerts: MonitoringService["alerts"] = [];
  const remaining = Math.max(0, summary.discoveryBudgetUsd - summary.discoveryCostUsd);
  if (summary.discoveryBudgetUsd <= 0 || remaining <= 0)
    alerts.push({
      severity: "critical",
      message:
        "Mirai's discovery budget is exhausted. Paid discovery is blocked by the internal limit. Review the budget separately from provider credits.",
    });
  else if (summary.discoveryBudgetUsedPercent >= 95)
    alerts.push({
      severity: "critical",
      message:
        "At least 95% of Mirai's discovery budget is used. Review the limit before starting more interviews.",
    });
  else if (summary.discoveryBudgetUsedPercent >= 80)
    alerts.push({
      severity: "warning",
      message:
        "At least 80% of Mirai's discovery budget is used. Plan the next budget review.",
    });
  if (discovery.failed)
    alerts.push({
      severity: "warning",
      message: `${discovery.failed} saved failure/conflict records need review; these are lifetime counts, not a current provider outage.`,
    });
  const cloudflareBilling = "https://dash.cloudflare.com/?to=/:account/billing";
  return [
    {
      id: "discovery-chat",
      name: `OpenAI · Discovery (${discovery.model})`,
      status: !discovery.enabled
        ? "paused"
        : alerts.length
          ? "warning"
          : discovery.pending
            ? "warning"
            : "running",
      statusLabel: !discovery.enabled
        ? "Discovery disabled"
        : alerts.length
          ? "Review needed"
          : discovery.pending
            ? "Processing"
            : "Within internal budget",
      details:
        "Mirai's ledger includes charged usage and reservations for unknown usage. It is not your OpenAI credit balance or an account-wide invoice. No paid health probe is made.",
      alerts,
      metrics: [
        metric("Mirai discovery spending", dollars(summary.discoveryCostUsd)),
        metric(
          "Internal budget remaining",
          `${dollars(remaining)} / ${dollars(summary.discoveryBudgetUsd)}`,
        ),
        metric(
          "Internal budget used",
          `${summary.discoveryBudgetUsedPercent.toFixed(1)}%`,
        ),
        metric("Per-session limit", dollars(discovery.sessionCapUsd)),
        metric("Internal budget period", "Database lifetime · no automatic reset"),
        metric(
          "Discovery requests",
          `${summary.discoveryRequests} · ${discovery.pending} pending · ${discovery.failed} failed/conflict`,
          "Mirai · owner sessions",
        ),
        metric(
          "Last discovery request",
          discovery.lastActivityAt === null
            ? "No requests"
            : new Date(discovery.lastActivityAt).toISOString(),
        ),
        metric("Provider credit balance", null, "OpenAI billing", null),
        ...unknownBilling(),
      ],
      billing: {
        url: "https://platform.openai.com/settings/organization/billing/overview",
        action: "Open OpenAI billing",
        description:
          "Check credits, auto-recharge and payment status. Adding credits does not raise Mirai's internal limits.",
      },
    },
    {
      id: "clerk",
      name: "Clerk · Authentication",
      status: input.clerk.state === "available" ? "running" : "unknown",
      statusLabel:
        input.clerk.state === "available"
          ? "User count checked"
          : input.clerk.state === "not-configured"
            ? "Not configured"
            : "User count unavailable",
      details:
        "Registered users are not monthly retained users (MRU). Check retained-user allowances, your plan and sign-in activity in the Clerk dashboard.",
      alerts: [],
      metrics: [
        metric(
          "Registered users",
          input.clerk.count === null ? null : String(input.clerk.count),
          "Clerk API",
          input.clerk.checkedAt,
        ),
        metric("Monthly retained users / allowance", null, "Clerk dashboard", null),
        ...unknownBilling(),
      ],
      billing: {
        url: "https://dashboard.clerk.com",
        action: "Open Clerk dashboard",
        description:
          "Select the production application and check its plan, retained-user allowance and billing. Upgrade when the verified allowance or required features call for it.",
      },
    },
    {
      id: "workers",
      name: "Cloudflare Workers · Hosting",
      status: "running",
      statusLabel: "Snapshot request served",
      details:
        "This snapshot confirms one successful application request. Monthly traffic, CPU usage and error rates are not connected; this is not a continuous uptime check.",
      alerts: [],
      metrics: [
        metric("Observed request", "Owner monitoring responded"),
        metric("Monthly requests / allowance", null, "Cloudflare analytics", null),
        metric("CPU usage / error rate", null, "Cloudflare analytics", null),
        ...unknownBilling(),
      ],
      billing: {
        url: cloudflareBilling,
        action: "Open Cloudflare billing",
        description:
          "Review the Workers plan, included requests and CPU usage. Paid usage can create charges rather than consume prepaid credits.",
      },
    },
    {
      id: "session-store",
      name: "Cloudflare D1 · Database",
      status: "running",
      statusLabel: "Queries succeeded",
      details:
        "Database size comes from D1 query metadata. Session counts cover this owner; database size covers the whole bound database. Monthly billable reads/writes and plan limits are unavailable here.",
      alerts: [],
      metrics: [
        metric("Sessions", String(summary.totalSessions), "Mirai · owner sessions"),
        metric(
          "Database size",
          input.databaseBytes === null ? null : bytes(input.databaseBytes),
          "D1 metadata",
        ),
        metric("Monthly rows read / written", null, "Cloudflare analytics", null),
        metric("Storage allowance", null, "Cloudflare dashboard", null),
        ...unknownBilling(),
      ],
      billing: {
        url: cloudflareBilling,
        action: "Open Cloudflare billing",
        description:
          "Check D1 storage and read/write allowances before choosing query optimization or a plan upgrade.",
      },
    },
    {
      id: "r2",
      name: "Cloudflare R2 · Files",
      status: input.bucketConfigured && input.files ? "running" : "unknown",
      statusLabel: !input.bucketConfigured
        ? "Binding unavailable"
        : input.files
          ? "File records checked"
          : "File records unavailable",
      details:
        "Counts and bytes come from Mirai's file records, not a bucket scan. They exclude unrecorded objects and other projects/accounts; no R2 availability or billable-operation check is made.",
      alerts: [],
      metrics: [
        metric(
          "Recorded files",
          input.files ? String(input.files.count) : null,
          "Mirai · owner projects",
        ),
        metric(
          "Recorded file size",
          input.files ? bytes(input.files.bytes) : null,
          "Mirai · owner projects",
        ),
        metric("Monthly read/write operations", null, "Cloudflare analytics", null),
        metric("Storage / operation allowances", null, "Cloudflare dashboard", null),
        ...unknownBilling(),
      ],
      billing: {
        url: cloudflareBilling,
        action: "Open Cloudflare billing",
        description:
          "Check billed storage and operation usage. Review retention or upgrade only after verifying the account's actual allowances.",
      },
    },
  ];
}
