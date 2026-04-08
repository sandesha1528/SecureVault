import React, { useEffect, useState } from "react";
import { Terminal, RefreshCw, XCircle, Clock } from "lucide-react";
import CertRequest from "../components/ssh/CertRequest";
import CertViewer from "../components/ssh/CertViewer";
import CAPublicKey from "../components/ssh/CAPublicKey";
import { useSSH } from "../hooks/useSSH";
import type { AuthUser } from "../types";
import { formatDistanceToNow } from "date-fns";

interface SSHPageProps {
  user: AuthUser;
}

const ROLE_PRINCIPALS: Record<string, string[]> = {
  superadmin: ["ubuntu", "ec2-user", "root", "admin", "deploy"],
  admin:      ["ubuntu", "ec2-user", "admin", "deploy"],
  developer:  ["ubuntu", "deploy"],
  readonly:   [],
};

export default function SSH({ user }: SSHPageProps) {
  const [tab, setTab] = useState<"sign" | "certs" | "ca">("sign");
  const { caPubkey, lastCert, certs, loading, error, fetchCaPubkey, requestCert, fetchMyCerts, revokeCert } = useSSH();

  useEffect(() => {
    if (tab === "certs") fetchMyCerts();
    if (tab === "ca") fetchCaPubkey();
  }, [tab]);

  const principals = ROLE_PRINCIPALS[user.role] ?? ["ubuntu"];

  const tabs = [
    { id: "sign", label: "Request Certificate", icon: <Terminal size={14} /> },
    { id: "certs", label: "My Certificates", icon: <Clock size={14} /> },
    { id: "ca", label: "CA Public Key", icon: <RefreshCw size={14} /> },
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>SSH Certificate Authority</h1>
        <p>Issue and manage short-lived signed SSH certificates.</p>
      </div>

      <div style={{ display: "flex", gap: "0.25rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "0.25rem", width: "fit-content" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`btn-ssh-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className="btn btn-sm"
            style={{
              background: tab === t.id ? "var(--accent)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--text-muted)",
              border: "none",
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        {tab === "sign" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>Sign Your Public Key</h2>
            <CertRequest
              onRequest={async (k, t) => { await requestCert(k, t); }}
              loading={loading}
              error={error}
              allowedPrincipals={principals}
            />
            {lastCert && (
              <>
                <div className="divider" />
                <CertViewer cert={lastCert} />
              </>
            )}
          </div>
        )}

        {tab === "certs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>My Certificates</h2>
              <button id="btn-refresh-certs" className="btn btn-ghost btn-sm" onClick={fetchMyCerts}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
            {loading ? (
              <div className="flex-center" style={{ padding: "2rem" }}>
                <span className="spinner" />
              </div>
            ) : certs.length === 0 ? (
              <div className="empty-state">
                <Terminal size={28} />
                <p>No certificates issued yet</p>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Serial</th>
                      <th>Fingerprint</th>
                      <th>Principals</th>
                      <th>Valid Until</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certs.map((c) => {
                      const expired = c.valid_to * 1000 < Date.now();
                      const expiresIn = formatDistanceToNow(new Date(c.valid_to * 1000), { addSuffix: true });
                      return (
                        <tr key={c.id}>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>#{c.serial}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                            {c.public_key_fingerprint.replace("SHA256:", "").slice(0, 16)}…
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                              {c.principals.map((p) => (
                                <span key={p} className="badge badge-purple">{p}</span>
                              ))}
                            </div>
                          </td>
                          <td style={{ fontSize: 12, color: expired ? "var(--accent-red)" : "var(--accent-green)" }}>
                            {expiresIn}
                          </td>
                          <td>
                            {c.revoked ? (
                              <span className="badge badge-red"><XCircle size={10} /> Revoked</span>
                            ) : expired ? (
                              <span className="badge badge-muted">Expired</span>
                            ) : (
                              <span className="badge badge-green">Valid</span>
                            )}
                          </td>
                          <td>
                            {!c.revoked && !expired && (
                              <button
                                id={`btn-revoke-cert-${c.id}`}
                                className="btn btn-danger btn-sm"
                                onClick={() => confirm("Revoke this certificate?") && revokeCert(c.id)}
                                disabled={loading}
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "ca" && (
          <CAPublicKey pubkey={caPubkey} onFetch={async () => { await fetchCaPubkey(); }} loading={loading} />
        )}
      </div>
    </div>
  );
}
