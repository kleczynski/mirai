import type { MonitoringSnapshot } from "@/lib/monitoring";
import "./monitoring.css";

export default function MonitoringPanel({
  snapshot,
}: {
  snapshot: MonitoringSnapshot;
}) {
  const alerts = snapshot.services.flatMap((service) =>
    service.alerts.map((alert) => ({ ...alert, service: service.name })),
  );
  const unavailable = snapshot.services.filter((service) =>
    service.metrics.some((metric) => metric.value === null),
  ).length;
  return (
    <div className="monitoring-panel">
      <section className="panel">
        <div className="row-between">
          <h2>Usage and billing</h2>
          <span className="tag">Owner only</span>
        </div>
        <p>Know what is measured, what needs a billing check, and where to act.</p>
        <div className="monitoring-summary">
          <div>
            <strong>{snapshot.services.length}</strong>
            <span>Services in this runtime</span>
          </div>
          <div>
            <strong>{alerts.length}</strong>
            <span>Internal budget / request alerts</span>
          </div>
          <div>
            <strong>{unavailable}</strong>
            <span>Services with unavailable provider data</span>
          </div>
        </div>
        <p className="meta">
          Provider plans, credit balances and billing periods are not connected.
          “Unavailable” does not mean zero cost or unlimited usage. Open the provider
          dashboard to verify whether payment or an upgrade is needed.
        </p>
      </section>
      {alerts.length > 0 && (
        <section
          className="monitoring-alerts"
          aria-label="Usage alerts"
        >
          {alerts.map((alert, index) => (
            <div
              key={`${alert.service}-${index}`}
              className={`monitoring-alert ${alert.severity}`}
              role="status"
            >
              <strong>{alert.service}</strong>
              <p>{alert.message}</p>
            </div>
          ))}
        </section>
      )}
      <div className="monitoring-services">
        {snapshot.services.map((service) => (
          <section
            className="panel monitoring-service"
            key={service.id}
            aria-label={service.name}
          >
            <div className="monitoring-service-heading">
              <h2>{service.name}</h2>
              <span className={`status status-${service.status}`}>
                <span />
                {service.statusLabel}
              </span>
            </div>
            <p className="meta">{service.details}</p>
            {service.id === "discovery-chat" && (
              <div className="monitoring-budget">
                <label htmlFor="discovery-budget">
                  Mirai internal budget ·{" "}
                  {snapshot.summary.discoveryBudgetUsedPercent.toFixed(1)}% used
                </label>
                <meter
                  id="discovery-budget"
                  min={0}
                  max={100}
                  low={80}
                  high={95}
                  optimum={0}
                  value={snapshot.summary.discoveryBudgetUsedPercent}
                />
                <small>
                  Lifetime limit, no automatic reset. Provider credits are separate.
                </small>
              </div>
            )}
            <dl className="monitoring-metrics">
              {service.metrics.map((metric) => (
                <div
                  className="monitoring-metric"
                  key={metric.label}
                >
                  <dt>{metric.label}</dt>
                  <dd
                    className={
                      metric.value === null ? "monitoring-unavailable" : undefined
                    }
                  >
                    {metric.value ?? "Unavailable"}
                  </dd>
                  <small>
                    {metric.source} ·{" "}
                    {metric.checkedAt ? (
                      <>
                        Checked{" "}
                        <time dateTime={metric.checkedAt}>
                          {new Date(metric.checkedAt).toLocaleString()}
                        </time>
                      </>
                    ) : (
                      "Not checked"
                    )}
                  </small>
                </div>
              ))}
            </dl>
            <div className="monitoring-billing">
              <p>{service.billing.description}</p>
              <a
                className="button secondary"
                href={service.billing.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {service.billing.action}
                <span aria-hidden="true">↗</span>
                <span className="monitoring-sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </section>
        ))}
      </div>
      <section className="panel">
        <h2>Other operational checks</h2>
        <p>
          <a
            href="https://github.com/kleczynski/mirai/actions"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Actions ↗
          </a>{" "}
          — review failed builds and deployment checks. CI billing is not connected.
        </p>
        <p>
          <a
            href="https://dash.cloudflare.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Domain and HTTPS ↗
          </a>{" "}
          — inspect mirai.party routing and HTTPS; check expiry and auto-renewal with
          the domain registrar. Renewal data is not connected.
        </p>
        <p className="meta">
          Supabase is not used by this Mirai runtime. Browser voice input has no
          separate paid transcription integration in Mirai.
        </p>
      </section>
    </div>
  );
}
