import React, { useEffect, useState } from "react";
import { Lock, Terminal, RefreshCw, ScrollText, TrendingUp, Shield, Clock } from "lucide-react";
import { listSecrets, getMyCerts, listRotationConfigs, getAuditLog } from "../api/endpoints";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: string;
  sub?: string;
}

function StatCard({ label, value, icon, accent = "var(--accent)", sub }: StatCardProps) {
  return (
    <div className="stat-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="stat-label">{label}</span>
        <div
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: `color-mix(in srgb, ${accent} 15%, transparent)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {React.cloneElement(icon as React.ReactElement, { size: 18, color: accent })}
        </div>
      </div>
      <div className="stat-value" style={{ color: accent }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

interface RecentEvent {
  action: string;
  actor: string;
  outcome: string;
  ts: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    secrets: 0,
    activeCerts: 0,
    rotationConfigs: 0,
    auditEvents24h: 0,
  });
  const [recent, setRecent] = useState<RecentEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [paths, certs, rotations, auditRes] = await Promise.allSettled([
          listSecrets(),
          getMyCerts(),
          listRotationConfigs(),
          getAuditLog({ limit: 5 }),
        ]);

        const since24h = Date.now() - 86_400_000;

        setStats({
          secrets: paths.status === "fulfilled" ? paths.value.length : 0,
          activeCerts: certs.status === "fulfilled"
            ? certs.value.filter((c) => !c.revoked && c.valid_to * 1000 > Date.now()).length
            : 0,
          rotationConfigs: rotations.status === "fulfilled" ? rotations.value.length : 0,
          auditEvents24h: auditRes.status === "fulfilled" ? auditRes.value.total : 0,
        });

        if (auditRes.status === "fulfilled") {
          setRecent(
            auditRes.value.events.slice(0, 5).map((e) => ({
              action: e.action,
              actor: e.actor_username ?? e.actor_id ?? "system",
              outcome: e.outcome,
              ts: e.ts,
            }))
          );
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const outcomeColor: Record<string, string> = {
    success: "var(--accent-green)",
    denied:  "var(--accent-amber)",
    error:   "var(--accent-red)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
        <p>SecureVault at a glance</p>
      </div>

      <div className="grid-auto">
        <StatCard label="Total Secrets" value={loading ? "—" : stats.secrets} icon={<Lock />} accent="var(--accent)" />
        <StatCard label="Active SSH Certs" value={loading ? "—" : stats.activeCerts} icon={<Terminal />} accent="var(--accent-green)" />
        <StatCard label="Rotation Configs" value={loading ? "—" : stats.rotationConfigs} icon={<RefreshCw />} accent="var(--accent-amber)" />
        <StatCard label="Audit Events (24h)" value={loading ? "—" : stats.auditEvents24h} icon={<ScrollText />} accent="var(--accent)" />
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "0.75rem 1.25rem",
            borderBottom: "1px solid var(--border)",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <TrendingUp size={14} style={{ color: "var(--accent)" }} />
          Recent Activity
        </div>
        {loading ? (
          <div className="flex-center" style={{ padding: "2rem" }}>
            <span className="spinner" />
          </div>
        ) : recent.length === 0 ? (
          <div className="empty-state" style={{ padding: "2rem" }}>
            <p>No recent activity</p>
          </div>
        ) : (
          <div>
            {recent.map((ev, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.65rem 1.25rem",
                  borderBottom: i < recent.length - 1 ? "1px solid color-mix(in srgb, var(--border) 50%, transparent)" : "none",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span
                    style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: outcomeColor[ev.outcome] ?? "var(--text-muted)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
                    {ev.action}
                  </span>
                  <span style={{ fontSize: 12 }}>by <strong>{ev.actor}</strong></span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: 11, color: "var(--text-muted)" }}>
                  <Clock size={11} />
                  {new Date(ev.ts).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
