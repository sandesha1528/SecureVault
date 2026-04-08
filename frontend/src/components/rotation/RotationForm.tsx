import React, { FormEvent, useState } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import type { RotationConfigCreate } from "../../types";

interface RotationFormProps {
  onSubmit: (data: RotationConfigCreate) => Promise<void>;
  loading: boolean;
  error: string | null;
}

const DB_TYPES = ["postgres", "mysql", "redis", "mongo"] as const;

const DSN_PLACEHOLDERS: Record<string, string> = {
  postgres: "postgresql://user:password@host:5432/dbname",
  mysql:    "mysql://user:password@host:3306/dbname",
  redis:    "redis://:password@host:6379/0",
  mongo:    "mongodb://user:password@host:27017/admin",
};

export default function RotationForm({ onSubmit, loading, error }: RotationFormProps) {
  const [name, setName] = useState("");
  const [dbType, setDbType] = useState<typeof DB_TYPES[number]>("postgres");
  const [dsn, setDsn] = useState("");
  const [secretPath, setSecretPath] = useState("");
  const [intervalHours, setIntervalHours] = useState("24");
  const [webhookUrl, setWebhookUrl] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit({
      name,
      db_type: dbType,
      connection_string: dsn,
      secret_path: secretPath,
      rotation_interval_hours: parseInt(intervalHours),
      webhook_url: webhookUrl || null,
    });
    setName(""); setDsn(""); setSecretPath(""); setWebhookUrl("");
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="form-group">
          <label className="label" htmlFor="rot-name">Config Name</label>
          <input
            id="rot-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="prod-postgres-main"
            required
          />
        </div>
        <div className="form-group">
          <label className="label" htmlFor="rot-type">Database Type</label>
          <select
            id="rot-type"
            className="input"
            value={dbType}
            onChange={(e) => setDbType(e.target.value as typeof DB_TYPES[number])}
          >
            {DB_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="label" htmlFor="rot-dsn">Connection String (DSN)</label>
        <input
          id="rot-dsn"
          className="input mono"
          type="password"
          value={dsn}
          onChange={(e) => setDsn(e.target.value)}
          placeholder={DSN_PLACEHOLDERS[dbType]}
          required
        />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Stored encrypted with AES-256-GCM. Never stored in plaintext.
        </span>
      </div>

      <div className="form-group">
        <label className="label" htmlFor="rot-path">Vault Secret Path</label>
        <input
          id="rot-path"
          className="input mono"
          value={secretPath}
          onChange={(e) => setSecretPath(e.target.value)}
          placeholder="prod/database/postgres/password"
          required
        />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          New credentials will be written here after each rotation.
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="form-group">
          <label className="label" htmlFor="rot-interval">Rotation Interval (hours)</label>
          <input
            id="rot-interval"
            className="input"
            type="number"
            min="1"
            value={intervalHours}
            onChange={(e) => setIntervalHours(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="label" htmlFor="rot-webhook">Webhook URL (optional)</label>
          <input
            id="rot-webhook"
            className="input"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.example.com/notify"
          />
        </div>
      </div>

      {error && (
        <div className="alert alert-error animate-fade-in">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      <button
        id="btn-rotation-submit"
        type="submit"
        className="btn btn-primary"
        disabled={loading || !name || !dsn || !secretPath}
      >
        {loading ? <span className="spinner" /> : <RefreshCw size={14} />}
        {loading ? "Creating…" : "Create Rotation Config"}
      </button>
    </form>
  );
}
