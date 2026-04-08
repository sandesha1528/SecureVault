import React, { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import SecretBrowser from "../components/secrets/SecretBrowser";
import SecretEditor from "../components/secrets/SecretEditor";
import SecretViewer from "../components/secrets/SecretViewer";
import VersionHistory from "../components/secrets/VersionHistory";
import { useSecrets } from "../hooks/useSecrets";
import type { AuthUser } from "../types";

interface SecretsPageProps {
  user: AuthUser;
}

type PanelMode = "view" | "edit" | "new";

export default function Secrets({ user }: SecretsPageProps) {
  const { paths, current, versions, loading, error, fetchPaths, fetchSecret, saveSecret, removeSecret, fetchVersions, clearCurrent } = useSecrets();
  const [mode, setMode] = useState<PanelMode>("view");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);

  useEffect(() => { fetchPaths(); }, []);

  const handleSelectPath = async (path: string) => {
    setSelectedPath(path);
    setMode("view");
    setShowVersions(false);
    await fetchSecret(path);
  };

  const handleSave = async (path: string, value: string, metadata: Record<string, string> | null, expiresAt: number | null) => {
    await saveSecret(path, { value, metadata, expires_at: expiresAt });
    await fetchPaths();
    setSelectedPath(path);
    setMode("view");
    await fetchSecret(path);
  };

  const handleDelete = async (path: string, hard: boolean) => {
    if (!confirm(`${hard ? "Permanently delete" : "Delete"} secret "${path}"?`)) return;
    await removeSecret(path, hard);
    clearCurrent();
    setSelectedPath(null);
    setMode("view");
  };

  const handleRestoreVersion = async (version: number) => {
    if (!selectedPath) return;
    const old = await fetchSecret(selectedPath, version);
    setMode("edit");
  };

  const handleShowVersions = async () => {
    if (!selectedPath) return;
    await fetchVersions(selectedPath);
    setShowVersions((v) => !v);
  };

  return (
    <div style={{ height: "calc(100vh - 56px - 3rem)", display: "flex", gap: "1rem" }}>
      {/* Browser panel */}
      <div style={{ width: 240, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.5rem" }}>
          <button
            id="btn-new-secret"
            className="btn btn-primary btn-sm"
            onClick={() => { clearCurrent(); setSelectedPath(null); setMode("new"); }}
            style={{ flex: 1, justifyContent: "center" }}
          >
            <Plus size={13} /> New
          </button>
          <button id="btn-refresh-secrets" className="btn btn-ghost btn-sm" onClick={() => fetchPaths()}>
            <RefreshCw size={13} />
          </button>
        </div>
        <SecretBrowser
          paths={paths}
          selected={selectedPath}
          onSelect={handleSelectPath}
          loading={loading && !current}
        />
      </div>

      {/* Detail panel */}
      <div
        style={{
          flex: 1,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "1.25rem",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        {mode === "new" || (mode === "edit" && !current) ? (
          <>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>
              {mode === "new" ? "Create Secret" : "Edit Secret"}
            </h2>
            <SecretEditor
              initialPath={selectedPath ?? ""}
              onSave={handleSave}
              loading={loading}
              error={error}
            />
          </>
        ) : current ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Secret Details</h2>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button id="btn-secret-edit-mode" className="btn btn-ghost btn-sm" onClick={() => setMode("edit")}>Edit</button>
                <button id="btn-secret-versions" className="btn btn-ghost btn-sm" onClick={handleShowVersions}>
                  {showVersions ? "Hide" : "Versions"}
                </button>
              </div>
            </div>

            <SecretViewer secret={current} />

            {mode === "edit" && (
              <>
                <div className="divider" />
                <SecretEditor
                  initialPath={current.path}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  existingMeta={current}
                  loading={loading}
                  error={error}
                />
              </>
            )}

            {showVersions && (
              <>
                <div className="divider" />
                <VersionHistory
                  versions={versions}
                  currentVersion={current.version}
                  onRestore={handleRestoreVersion}
                  loading={loading}
                />
              </>
            )}
          </>
        ) : (
          <div className="empty-state" style={{ flex: 1 }}>
            <div style={{ fontSize: 40, opacity: 0.2 }}>🔐</div>
            <p>Select a secret or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}
