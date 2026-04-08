import React, { useEffect } from "react";
import { Copy, CheckCircle, Server } from "lucide-react";
import { useState } from "react";

interface CAPublicKeyProps {
  pubkey: string;
  onFetch: () => Promise<void>;
  loading: boolean;
}

export default function CAPublicKey({ pubkey, onFetch, loading }: CAPublicKeyProps) {
  const [copied, setCopied] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onFetch(); }, []);

  const copy = () => {
    navigator.clipboard.writeText(pubkey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>CA Public Key</h3>
        <button id="btn-ca-copy" className="btn btn-ghost btn-sm" onClick={copy} disabled={!pubkey}>
          {copied ? <CheckCircle size={14} style={{ color: "var(--accent-green)" }} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {loading ? (
        <div className="flex-center" style={{ padding: "1.5rem" }}>
          <span className="spinner" />
        </div>
      ) : (
        <div className="cert-display" style={{ fontSize: 11 }}>
          {pubkey || "Loading…"}
        </div>
      )}

      <div
        style={{
          background: "var(--surface-hover)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.75rem",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          <Server size={14} style={{ color: "var(--accent)" }} />
          Trust this CA on your servers
        </div>
        <div className="cert-display" style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {`# On each server, append this line to /etc/ssh/sshd_config:
TrustedUserCAKeys /etc/ssh/securevault_ca.pub

# Save the CA key:
curl -s https://YOUR_DOMAIN/ssh/krl -o /etc/ssh/securevault_krl
echo '${pubkey || "<CA_PUBLIC_KEY>"}' > /etc/ssh/securevault_ca.pub

# Add revocation check:
RevokedKeys /etc/ssh/securevault_krl

# Reload sshd:
systemctl reload sshd`}
        </div>
      </div>
    </div>
  );
}
