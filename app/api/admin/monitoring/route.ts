import { env } from "cloudflare:workers";
import { database, failure, json, owner } from "@/lib/server";
import { discoveryConfig } from "@/lib/discovery-provider";
import {
  buildMonitoringServices,
  observeClerk,
  type MonitoringSnapshot,
} from "@/lib/monitoring";

export const dynamic = "force-dynamic";

export async function GET() {
  let stage = "owner";
  try {
    const u = await owner();
    stage = "configuration";
    const now = new Date().toISOString();
    const db = database();
    const config = discoveryConfig({
      MIRAI_DISCOVERY_ENABLED: env.MIRAI_DISCOVERY_ENABLED,
      MIRAI_DISCOVERY_MODEL: env.MIRAI_DISCOVERY_MODEL,
      MIRAI_DISCOVERY_SESSION_CAP_USD: env.MIRAI_DISCOVERY_SESSION_CAP_USD,
      MIRAI_DISCOVERY_WORKSPACE_CAP_USD: env.MIRAI_DISCOVERY_WORKSPACE_CAP_USD,
    });

    stage = "sessionSummary";
    const sessionResult = await db
      .prepare(
        `
        SELECT
          COUNT(*) AS totalSessions,
          SUM(CASE WHEN expires_at > ? THEN 1 ELSE 0 END) AS activeInvitations,
          COALESCE(
            SUM(
              CASE
                WHEN json_type(json_extract(data, '$.demos')) = 'array'
                  THEN json_array_length(json_extract(data, '$.demos'))
                ELSE 0
              END
            ),
            0
          ) AS totalDemos,
          COALESCE(
            SUM(
              CASE
                WHEN json_type(json_extract(data, '$.feedback')) = 'array'
                  THEN json_array_length(json_extract(data, '$.feedback'))
                ELSE 0
              END
            ),
            0
          ) AS totalFeedback
        FROM sessions
        WHERE owner_id = ?
      `,
      )
      .bind(now, u.userId)
      .all<{
        totalSessions: number;
        activeInvitations: number;
        totalDemos: number;
        totalFeedback: number;
      }>();

    const sessionSummary = sessionResult.results[0];

    stage = "discoveryStats";
    const discoveryStats = await db
      .prepare(
        `
        SELECT
          COUNT(*) AS requests,
          COALESCE(SUM(CASE WHEN status = 'saved' THEN 1 ELSE 0 END), 0) AS successRequests,
          COALESCE(SUM(CASE WHEN status IN ('failed', 'conflict') THEN 1 ELSE 0 END), 0) AS failedRequests,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pendingRequests,
          COALESCE(SUM(COALESCE(charged_microusd, reserved_microusd)), 0) AS accountedMicrousd,
          (SELECT COALESCE(SUM(COALESCE(charged_microusd, reserved_microusd)), 0) FROM discovery_requests) AS workspaceAccountedMicrousd
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
        workspaceAccountedMicrousd: number;
      }>();

    stage = "discoveryLatest";
    const discoveryLatest = await db
      .prepare(
        `
        SELECT discovery_requests.status AS latestStatus, discovery_requests.created_at AS latestAt
        FROM discovery_requests
        INNER JOIN sessions ON sessions.id = discovery_requests.session_id
        WHERE sessions.owner_id = ?
        ORDER BY discovery_requests.created_at DESC
        LIMIT 1
      `,
      )
      .bind(u.userId)
      .first<{ latestStatus: string; latestAt: number }>();

    stage = "retiredUsage";
    const retiredUsage = await db
      .prepare(
        "SELECT COALESCE(SUM(accounted_microusd), 0) AS accountedMicrousd FROM discovery_retired_usage",
      )
      .first<{ accountedMicrousd: number }>();

    stage = "snapshot";
    const totalDiscoveryMicrousd =
      Number(discoveryStats?.workspaceAccountedMicrousd ?? 0) +
      Number(retiredUsage?.accountedMicrousd ?? 0);
    const discoveryBudgetMicrousd = config.workspaceCapMicrousd ?? 0;
    const discoveryBudgetUsedPercent = discoveryBudgetMicrousd
      ? Math.min(100, Number((totalDiscoveryMicrousd / discoveryBudgetMicrousd) * 100))
      : 100;
    const discoveryCostUsd = totalDiscoveryMicrousd / 1_000_000;

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

    stage = "optionalObservations";
    // Metadata checks are optional: failures must not blank the spending snapshot.
    const [clerk, files] = await Promise.all([
      observeClerk(env.CLERK_SECRET_KEY),
      Promise.resolve()
        .then(() =>
          db
            .prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(project_files.size), 0) AS bytes
        FROM project_files
        INNER JOIN sessions ON sessions.id = project_files.project_id
        WHERE sessions.owner_id = ?
      `)
            .bind(u.userId)
            .first<{ count: number; bytes: number }>(),
        )
        .catch(() => null),
    ]);
    const size = sessionResult.meta?.size_after;
    const snapshot: MonitoringSnapshot = {
      generatedAt: now,
      summary,
      services: buildMonitoringServices({
        now,
        summary,
        discovery: {
          enabled: config.enabled,
          model: config.model,
          sessionCapUsd: config.capMicrousd / 1_000_000,
          failed: Number(discoveryStats?.failedRequests ?? 0),
          pending: Number(discoveryStats?.pendingRequests ?? 0),
          lastActivityAt: discoveryLatest?.latestAt ?? null,
        },
        databaseBytes:
          typeof size === "number" && Number.isFinite(size) && size >= 0 ? size : null,
        files,
        bucketConfigured: Boolean(env.BUCKET),
        clerk,
      }),
    };
    return json(snapshot);
  } catch (e) {
    const response = failure(e);
    if (response.status >= 500) {
      // Static stage + stack frames only: never log identity, bindings or evidence.
      console.error("Mirai monitoring failed", {
        endpoint: "/api/admin/monitoring",
        stage,
        stack:
          e instanceof Error
            ? e.stack
                ?.split("\n")
                .filter((line) => /^\s+at /.test(line))
                .slice(0, 8)
                .join("\n")
            : undefined,
      });
    }
    return response;
  }
}
