import React, { useState } from "react";
import { Eye, EyeOff, Copy, CheckCircle, Clock } from "lucide-react";
import type { Secret } from "../../types";
import { formatDistanceToNow } from "date-fns";

interface SecretViewerProps {
  secret: Secret;
}

export default function SecretViewer({ secret }: SecretViewerProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(secret.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired = secret.expires_at && secret.expires_at * 1000 < Date.now();
  const expiresIn = secret.expires_at
    ? formatDistanceToNow(new Date(secret.expires_at * 1000), { addSuffix: true })
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h3 style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--accent)" }}>
            {secret.path}
          </h3>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: 4, flexWrap: "wrap" }}>
            <span className="badge badge-purple">v{secret.version}</span>
            {isExpired ? (
              <span className="badge badge-red">Expired</span>
            ) : expiresIn ? (
              <span className="badge badge-amber">
                <Clock size={10} />
                Expires {expiresIn}
              </span>
            ) : (
              <span className="badge badge-muted">No expiry</span>
            )}
            {!!secret.metadata?.description && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {String(secret.metadata.description)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            id="btn-secret-toggle-reveal"
            className="btn btn-ghost btn-sm"
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            {revealed ? "Hide" : "Reveal"}
          </button>
          <button
            id="btn-secret-copy"
            className="btn btn-ghost btn-sm"
            onClick={copy}
          >
            {copied ? <CheckCircle size={14} style={{ color: "var(--accent-green)" }} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div
        className={`secret-value${revealed ? " revealed" : ""}`}
        onClick={() => !revealed && setRevealed(true)}
        title={revealed ? "" : "Click to reveal"}
        style={{
          background: "#0a0d14",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "0.75rem 1rem",
          wordBreak: "break-all",
          lineHeight: 1.7,
          minHeight: 52,
          cursor: revealed ? "text" : "pointer",
        }}
      >
        {secret.value}
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        {secret.created_at && (
          <span>Created: {new Date(secret.created_at * 1000).toLocaleString()}</span>
        )}
        {secret.created_by && <span>By: {secret.created_by}</span>}
      </div>
    </div>
  );
}
