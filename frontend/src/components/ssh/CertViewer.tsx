import React, { useEffect, useState } from "react";
import { Copy, Download, CheckCircle, Clock, Shield } from "lucide-react";
import type { SignedCert } from "../../types";

interface CertViewerProps {
  cert: SignedCert;
}

function useCountdown(validTo: number) {
  const [remaining, setRemaining] = useState(validTo * 1000 - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(validTo * 1000 - Date.now()), 1000);
    return () => clearInterval(id);
  }, [validTo]);

  return remaining;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "Expired";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function CertViewer({ cert }: CertViewerProps) {
  const [copied, setCopied] = useState(false);
  const remaining = useCountdown(cert.valid_to);

  const copy = () => {
    navigator.clipboard.writeText(cert.cert);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([cert.cert], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `id_ed25519-cert.pub`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const countdownClass =
    remaining <= 0
      ? "countdown-danger"
      : remaining < 3600_000
      ? "countdown-danger"
      : remaining < 7200_000
      ? "countdown-warn"
      : "countdown-ok";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div
        style={{
          background: "color-mix(in srgb, var(--accent-green) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--accent-green) 25%, transparent)",
          borderRadius: "var(--radius)",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Shield size={16} style={{ color: "var(--accent-green)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-green)" }}>
            Certificate issued successfully
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: 13 }}>
          <Clock size={13} className={countdownClass} />
          <span className={countdownClass} style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
            {formatDuration(remaining)}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <span className="badge badge-muted">Serial #{cert.serial}</span>
        <span className="badge badge-muted">
          FP: {cert.fingerprint.replace("SHA256:", "").slice(0, 12)}…
        </span>
        {cert.principals.map((p) => (
          <span key={p} className="badge badge-purple">{p}</span>
        ))}
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
          Signed Certificate
        </div>
        <div className="cert-display">{cert.cert}</div>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--surface-hover)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", fontFamily: "var(--font-mono)" }}>
        <div style={{ marginBottom: 4, color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
          Usage
        </div>
        <div style={{ color: "var(--accent-green)" }}>
          # Save this cert next to your private key:<br />
          echo "{cert.cert}" &gt; ~/.ssh/id_ed25519-cert.pub<br />
          # Then SSH normally — the cert is picked up automatically:<br />
          ssh user@your-server
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button id="btn-cert-copy" className="btn btn-ghost btn-sm" onClick={copy}>
          {copied ? <CheckCircle size={14} style={{ color: "var(--accent-green)" }} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy Cert"}
        </button>
        <button id="btn-cert-download" className="btn btn-ghost btn-sm" onClick={download}>
          <Download size={14} />
          Download
        </button>
      </div>
    </div>
  );
}
