import React, { FormEvent, useState } from "react";
import { Search, Filter } from "lucide-react";
import type { AuditEvent } from "../../types";

interface AuditLogProps {
  events: AuditEvent[];
  total: number;
  loading: boolean;
  onFilter: (params: {
    action?: string;
    actor?: string;
    outcome?: string;
  }) => void;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === "success") return <span className="badge badge-green">success</span>;
  if (outcome === "denied")  return <span className="badge badge-amber">denied</span>;
  return <span className="badge badge-red">error</span>;
}

function rowClass(outcome: string) {
  if (outcome === "success") return "audit-success";
  if (outcome === "denied")  return "audit-denied";
  return "audit-error";
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function AuditLog({ events, total, loading, onFilter }: AuditLogProps) {
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [outcome, setOutcome] = useState("");

  const handleFilter = (e: FormEvent) => {
    e.preventDefault();
    onFilter({ action: action || undefined, actor: actor || undefined, outcome: outcome || undefined });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <form
        onSubmit={handleFilter}
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "0.75rem 1rem",
          alignItems: "flex-end",
        }}
      >
        <div className="form-group" style={{ flex: "1 1 180px", gap: 4 }}>
          <label className="label" htmlFor="audit-action">Action</label>
          <input id="audit-action" className="input" style={{ fontSize: 13 }} value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. secret.read" />
        </div>
        <div className="form-group" style={{ flex: "1 1 140px", gap: 4 }}>
          <label className="label" htmlFor="audit-actor">Actor</label>
          <input id="audit-actor" className="input" style={{ fontSize: 13 }} value={actor} onChange={(e) => setActor(e.target.value)} placeholder="username or ID" />
        </div>
        <div className="form-group" style={{ flex: "1 1 120px", gap: 4 }}>
          <label className="label" htmlFor="audit-outcome">Outcome</label>
          <select id="audit-outcome" className="input" style={{ fontSize: 13 }} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="denied">Denied</option>
            <option value="error">Error</option>
          </select>
        </div>
        <button id="btn-audit-filter" type="submit" className="btn btn-ghost btn-sm" style={{ height: 36 }}>
          <Filter size={13} /> Filter
        </button>
        <button
          id="btn-audit-clear"
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ height: 36 }}
          onClick={() => { setAction(""); setActor(""); setOutcome(""); onFilter({}); }}
        >
          Clear
        </button>
      </form>

      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Showing {events.length} of {total.toLocaleString()} events — append-only log
      </div>

      {loading ? (
        <div className="flex-center" style={{ padding: "3rem" }}>
          <span className="spinner" />
        </div>
      ) : events.length === 0 ? (
        <div className="empty-state">
          <Search size={28} />
          <p>No audit events found</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Outcome</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className={rowClass(ev.outcome)}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, whiteSpace: "nowrap" }}>
                    {formatTs(ev.ts)}
                  </td>
                  <td style={{ fontSize: 13 }}>{ev.actor_username ?? ev.actor_id ?? "—"}</td>
                  <td>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
                      {ev.action}
                    </span>
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ev.resource ?? "—"}
                  </td>
                  <td><OutcomeBadge outcome={ev.outcome} /></td>
                  <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{ev.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
