import React from "react";
import { RefreshCw, Trash2, Play, CheckCircle, Clock, AlertCircle } from "lucide-react";
import type { RotationConfig } from "../../types";
import { formatDistanceToNow, formatDistance } from "date-fns";

interface RotationListProps {
  configs: RotationConfig[];
  onTrigger: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  loading: boolean;
}

function DbTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    postgres: "badge-purple",
    mysql:    "badge-amber",
    redis:    "badge-red",
    mongo:    "badge-green",
  };
  return <span className={`badge ${colors[type] ?? "badge-muted"}`}>{type}</span>;
}

export default function RotationList({ configs, onTrigger, onDelete, loading }: RotationListProps) {
  if (configs.length === 0) {
    return (
      <div className="empty-state">
        <RefreshCw size={32} />
        <p>No rotation configs yet</p>
        <span style={{ fontSize: 12 }}>
          Create a config to start automatic credential rotation
        </span>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Secret Path</th>
            <th>Interval</th>
            <th>Last Rotated</th>
            <th>Next Rotation</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {configs.map((cfg) => {
            const now = Date.now() / 1000;
            const isDue = cfg.next_rotation_at && cfg.next_rotation_at <= now;
            const nextIn = cfg.next_rotation_at
              ? formatDistanceToNow(new Date(cfg.next_rotation_at * 1000), { addSuffix: true })
              : "—";
            const lastAt = cfg.last_rotated_at
              ? formatDistanceToNow(new Date(cfg.last_rotated_at * 1000), { addSuffix: true })
              : "Never";

            return (
              <tr key={cfg.id}>
                <td style={{ fontWeight: 600 }}>{cfg.name}</td>
                <td><DbTypeBadge type={cfg.db_type} /></td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
                  {cfg.secret_path}
                </td>
                <td style={{ fontSize: 12 }}>{cfg.rotation_interval_hours}h</td>
                <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{lastAt}</td>
                <td style={{ fontSize: 12 }}>
                  <span className={isDue ? "text-red" : "text-green"}>{nextIn}</span>
                </td>
                <td>
                  {cfg.is_active ? (
                    <span className="badge badge-green">
                      <CheckCircle size={10} /> Active
                    </span>
                  ) : (
                    <span className="badge badge-muted">Inactive</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      id={`btn-rotate-${cfg.id}`}
                      className="btn btn-ghost btn-sm"
                      onClick={() => onTrigger(cfg.id)}
                      disabled={loading}
                      title="Trigger rotation now"
                    >
                      <Play size={12} />
                    </button>
                    <button
                      id={`btn-delete-rotation-${cfg.id}`}
                      className="btn btn-danger btn-sm"
                      onClick={() => onDelete(cfg.id)}
                      disabled={loading}
                      title="Delete config"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
