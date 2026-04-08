import React, { FormEvent, useEffect, useState } from "react";
import { Save, Trash2, AlertCircle, CheckCircle } from "lucide-react";
import type { SecretMeta } from "../../types";

interface SecretEditorProps {
  initialPath?: string;
  onSave: (path: string, value: string, metadata: Record<string, string> | null, expiresAt: number | null) => Promise<void>;
  onDelete?: (path: string, hard: boolean) => Promise<void>;
  existingMeta?: SecretMeta | null;
  loading: boolean;
  error: string | null;
}

export default function SecretEditor({
  initialPath = "",
  onSave,
  onDelete,
  existingMeta,
  loading,
  error,
}: SecretEditorProps) {
  const [path, setPath] = useState(initialPath);
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [ttlDays, setTtlDays] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initialPath) setPath(initialPath);
  }, [initialPath]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const meta = description ? { description } : null;
    const expiresAt = ttlDays ? Math.floor(Date.now() / 1000) + parseInt(ttlDays) * 86400 : null;
    await onSave(path, value, meta, expiresAt);
    setSaved(true);
    setValue("");
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      <div className="form-group">
        <label className="label" htmlFor="secret-path">Secret Path</label>
        <input
          id="secret-path"
          className="input mono"
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="prod/database/postgres"
          required
          disabled={!!existingMeta}
        />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Use slash-separated namespaces, e.g. prod/app/api-key
        </span>
      </div>

      <div className="form-group">
        <label className="label" htmlFor="secret-value">Secret Value</label>
        <textarea
          id="secret-value"
          className="input mono"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter secret value…"
          rows={4}
          required
        />
      </div>

      <div className="form-group">
        <label className="label" htmlFor="secret-description">Description (optional)</label>
        <input
          id="secret-description"
          className="input"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this secret?"
        />
      </div>

      <div className="form-group">
        <label className="label" htmlFor="secret-ttl">TTL in days (optional)</label>
        <input
          id="secret-ttl"
          className="input"
          type="number"
          min="1"
          value={ttlDays}
          onChange={(e) => setTtlDays(e.target.value)}
          placeholder="Leave blank for no expiry"
        />
      </div>

      {error && (
        <div className="alert alert-error animate-fade-in">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {saved && (
        <div className="alert alert-success animate-fade-in">
          <CheckCircle size={15} />
          Secret saved successfully
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          id="btn-secret-save"
          type="submit"
          className="btn btn-primary"
          disabled={loading || !path || !value}
        >
          {loading ? <span className="spinner" /> : <Save size={14} />}
          {existingMeta ? "Save New Version" : "Create Secret"}
        </button>

        {onDelete && existingMeta && (
          <button
            id="btn-secret-delete"
            type="button"
            className="btn btn-danger"
            disabled={loading}
            onClick={() => onDelete(existingMeta.path, false)}
          >
            <Trash2 size={14} />
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
