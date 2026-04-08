import React from "react";
import { RotateCcw, Clock } from "lucide-react";
import type { SecretMeta } from "../../types";
import { formatDistanceToNow } from "date-fns";

interface VersionHistoryProps {
  versions: SecretMeta[];
  currentVersion: number;
  onRestore: (version: number) => void;
  loading: boolean;
}

export default function VersionHistory({ versions, currentVersion, onRestore, loading }: VersionHistoryProps) {
  if (versions.length === 0) {
    return (
      <div className="empty-state">
        <Clock size={28} />
        <p>No version history</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        Version History ({versions.length})
      </div>
      {versions.map((v) => {
        const isCurrent = v.version === currentVersion;
        const createdAgo = formatDistanceToNow(new Date(v.created_at * 1000), { addSuffix: true });
        return (
          <div
            key={v.version}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.6rem 0.75rem",
              background: isCurrent ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "var(--surface-hover)",
              border: `1px solid ${isCurrent ? "color-mix(in srgb, var(--accent) 30%, transparent)" : "var(--border)"}`,
              borderRadius: "var(--radius)",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: isCurrent ? "var(--accent)" : "var(--text-primary)",
                }}
              >
                v{v.version}
              </span>
              {isCurrent && <span className="badge badge-purple">current</span>}
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{createdAgo}</span>
              {!!v.metadata?.description && (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  — {String(v.metadata.description)}
                </span>
              )}
            </div>
            {!isCurrent && (
              <button
                id={`btn-restore-v${v.version}`}
                className="btn btn-ghost btn-sm"
                onClick={() => onRestore(v.version)}
                disabled={loading}
              >
                <RotateCcw size={12} />
                Restore
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
