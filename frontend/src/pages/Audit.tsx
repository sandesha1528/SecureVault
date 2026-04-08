import React, { useEffect } from "react";
import AuditLog from "../components/audit/AuditLog";
import { useAudit } from "../hooks/useAudit";

export default function Audit() {
  const { events, total, loading, fetchLog } = useAudit();

  useEffect(() => { fetchLog(); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Audit Log</h1>
        <p>
          Immutable append-only record of every action taken in SecureVault.
          Rows can never be deleted via the UI.
        </p>
      </div>
      <AuditLog
        events={events}
        total={total}
        loading={loading}
        onFilter={fetchLog}
      />
    </div>
  );
}
