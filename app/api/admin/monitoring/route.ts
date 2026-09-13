import { env } from "cloudflare:workers";
import { database, failure, json, owner } from "@/lib/server";
import { discoveryConfig } from "@/lib/discovery-provider";

export const dynamic = "force-dynamic";

type MonitoringService = {
  id: string;
  name: string;
  status: "running" | "warning" | "degraded" | "paused";
  statusLabel: string;
  usageCount: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  costUsd: number;
  budgetUsd: number | null;
  budgetUsedPercent: number | null;
  lastActivityAt: string | null;
  details: string;
};

type MonitoringSnapshot = {
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

export async function GET() {
  try {
    const u = await owner();
    const now = new Date().toISOString();
    const db = database();
    const config = discoveryConfig(env);

    const sessionSummary = await db
      .prepare(
        `
        SELECT
          COUNT(*) AS totalSessions,
          SUM(CASE WHEN expires_at > ? THEN 1 ELSE 0 END) AS activeInvitations,
          COALESCE(SUM(json_array_length(json_extract(data, '$.demos')), 0) AS totalDemos,
          COALESCE(SUM(json_array_length(json_extract(data, '$.feedback')), 0) AS totalFeedback
        FROM sessions
        WHERE owner_id = ?
      `,
      )
      .bind(now, u.userId)
      .first<{
        totalSessions: number;
        activeInvitations: number;
        totalDemos: number;
        totalFeedback: number;
      }>();

    const discoveryStats = await db
      .prepare(
        `
        SELECT
          COUNT(*) AS requests,
          COALESCE(SUM(CASE WHEN status = 'saved' THEN 1 ELSE 0 END), 0) AS successRequests,
          COALESCE(SUM(CASE WHEN status IN ('failed', 'conflict') THEN 1 ELSE 0 END), 0) AS failedRequests,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pendingRequests,
          COALESCE(SUM(COALESCE(charged_microusd, reserved_microusd)), 0) AS accountedMicrousd
        FROM discovery_requests
        INNER JOIN sessions ON sessions.id = discovery_requests.session_id
        WHERE sessions.owner_id = ?
      `,
      )
      .bind(u.userId)
      .first<{
        requests: number;
        successRequests: number;
        failedRequests: number;
        pendingRequests: number;
        accountedMicrousd: number;
      }>();

    const discoveryLatest = await db
      .prepare(
        `
        SELECT status AS latestStatus, created_at AS latestAt
        FROM discovery_requests
        INNER JOIN sessions ON sessions.id = discovery_requests.session_id
        WHERE sessions.owner_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
      )
      .bind(u.userId)
      .first<{ latestStatus: string; latestAt: string }>();

    const retiredUsage = await db
      .prepare("SELECT COALESCE(SUM(accounted_microusd), 0) AS accountedMicrousd FROM discovery_retired_usage")
      .first<{ accountedMicrousd: number }>();

    const totalDiscoveryMicrousd =
      Number(discoveryStats?.accountedMicrousd ?? 0) + Number(retiredUsage?.accountedMicrousd ?? 0);
    const discoveryBudgetMicrousd = config.workspaceCapMicrousd ?? 0;
    const discoveryBudgetUsedPercent = discoveryBudgetMicrousd
      ? Math.min(
          100,
          Number((totalDiscoveryMicrousd / discoveryBudgetMicrousd) * 100),
        )
      : 100;
    const discoveryCostUsd = totalDiscoveryMicrousd / 1_000_000;

    const discoveryService: MonitoringService = {
      id: "discovery-chat",
      name: `Discovery interviewer (${config.model})`,
      usageCount: Number(discoveryStats?.requests ?? 0),
      successCount: Number(discoveryStats?.successRequests ?? 0),
      failedCount: Number(discoveryStats?.failedRequests ?? 0),
      pendingCount: Number(discoveryStats?.pendingRequests ?? 0),
      costUsd: discoveryCostUsd,
      budgetUsd: discoveryBudgetMicrousd ? discoveryBudgetMicrousd / 1_000_000 : null,
      budgetUsedPercent: discoveryBudgetMicrousd ? discoveryBudgetUsedPercent : null,
      lastActivityAt: discoveryLatest?.latestAt ?? null,
      status: "running",
      statusLabel: "Running",
      details: "",
    };

    if (!config.enabled) {
      discoveryService.status = "paused";
      discoveryService.statusLabel = "Discovery disabled";
      discoveryService.details = "Chat is currently disabled in environment settings.";
    } else if (discoveryService.pendingCount > 0 || discoveryLatest?.latestStatus === "pending") {
      discoveryService.status = "warning";
      discoveryService.statusLabel = "Processing";
      discoveryService.details = "One or more discovery calls are waiting for provider completion.";
    } else if (discoveryService.failedCount > 0) {
      discoveryService.status = "degraded";
      discoveryService.statusLabel = "Attention needed";
      discoveryService.details = "Recent discovery requests failed and may need review in logs.";
    } else if (discoveryBudgetMicrousd && discoveryBudgetUsedPercent >= 95) {
      discoveryService.status = "warning";
      discoveryService.statusLabel = "Budget near limit";
      discoveryService.details = "Discovery budget is near the configured workspace cap.";
    } else {
      discoveryService.details = "Discovery traffic and budget are within normal operating limits.";
    }

    const storageService: MonitoringService = {
      id: "session-store",
      name: "Session storage (Cloudflare D1)",
      status: "running",
      statusLabel: "Active",
      usageCount: Number(sessionSummary?.totalSessions ?? 0),
      successCount: Number(sessionSummary?.totalDemos ?? 0),
      failedCount: 0,
      pendingCount: 0,
      costUsd: 0,
      budgetUsd: null,
      budgetUsedPercent: null,
      lastActivityAt: now,
      details:
        "Mirai session state and discovery evidence are persisted in D1. Cost is provisioned in the Cloudflare account and not metered in this app.",
    };

    const summary: MonitoringSnapshot["summary"] = {
      totalSessions: Number(sessionSummary?.totalSessions ?? 0),
      activeInvitations: Number(sessionSummary?.activeInvitations ?? 0),
      totalDemos: Number(sessionSummary?.totalDemos ?? 0),
      totalFeedback: Number(sessionSummary?.totalFeedback ?? 0),
      discoveryRequests: Number(discoveryStats?.requests ?? 0),
      discoveryCostUsd: Number(discoveryCostUsd.toFixed(6)),
      discoveryBudgetUsd:
        discoveryBudgetMicrousd > 0 ? discoveryBudgetMicrousd / 1_000_000 : 0,
      discoveryBudgetUsedPercent: Number(discoveryBudgetUsedPercent.toFixed(1)),
    };

    return json({
      generatedAt: now,
      summary,
      services: [discoveryService, storageService],
    });
  } catch (e) {
    return failure(e);
  }
}
