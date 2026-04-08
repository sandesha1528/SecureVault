import React, { FormEvent, useState } from "react";
import { Terminal, Clock, Shield, AlertCircle } from "lucide-react";

interface CertRequestProps {
  onRequest: (publicKey: string, ttlHours?: number) => Promise<void>;
  loading: boolean;
  error: string | null;
  allowedPrincipals?: string[];
}

export default function CertRequest({ onRequest, loading, error, allowedPrincipals }: CertRequestProps) {
  const [pubkey, setPubkey] = useState("");
  const [ttl, setTtl] = useState("8");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onRequest(pubkey.trim(), ttl ? parseInt(ttl) : undefined);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="form-group">
        <label className="label" htmlFor="cert-pubkey">
          Your SSH Public Key
        </label>
        <textarea
          id="cert-pubkey"
          className="input mono"
          value={pubkey}
          onChange={(e) => setPubkey(e.target.value)}
          placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA… or ssh-rsa AAAAB3Nza…"
          rows={4}
          required
          spellCheck={false}
        />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Paste the contents of your ~/.ssh/id_ed25519.pub or ~/.ssh/id_rsa.pub
        </span>
      </div>

      <div className="form-group">
        <label className="label" htmlFor="cert-ttl">
          <Clock size={12} style={{ display: "inline", marginRight: 4 }} />
          Certificate validity (hours)
        </label>
        <input
          id="cert-ttl"
          className="input"
          type="number"
          min="1"
          max="168"
          value={ttl}
          onChange={(e) => setTtl(e.target.value)}
        />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Maximum 168 hours (7 days). Default is 8 hours.
        </span>
      </div>

      {allowedPrincipals && allowedPrincipals.length > 0 && (
        <div
          style={{
            background: "color-mix(in srgb, var(--accent) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
            borderRadius: "var(--radius)",
            padding: "0.75rem 1rem",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <Shield size={13} />
            Principals your certificate will include:
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {allowedPrincipals.map((p) => (
              <span key={p} className="badge badge-purple">{p}</span>
            ))}
          </div>
          <p style={{ fontSize: 11, marginTop: 6 }}>
            These are the Unix usernames you can SSH in as on servers that trust this CA.
          </p>
        </div>
      )}

      {error && (
        <div className="alert alert-error animate-fade-in">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      <button
        id="btn-request-cert"
        type="submit"
        className="btn btn-primary"
        disabled={loading || !pubkey.trim()}
      >
        {loading ? <span className="spinner" /> : <Terminal size={15} />}
        {loading ? "Signing…" : "Request Certificate"}
      </button>
    </form>
  );
}
