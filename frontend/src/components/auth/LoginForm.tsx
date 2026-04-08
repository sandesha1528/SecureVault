import React, { FormEvent, useState } from "react";
import { Lock, User, AlertCircle } from "lucide-react";

interface LoginFormProps {
  onSubmit: (username: string, password: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export default function LoginForm({ onSubmit, loading, error }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit(username, password);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: "color-mix(in srgb, var(--accent) 15%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1rem",
          }}
        >
          <Lock size={24} color="var(--accent)" />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>SecureVault</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Sign in to access your secrets
        </p>
      </div>

      {error && (
        <div className="alert alert-error animate-fade-in">
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      <div className="form-group">
        <label className="label" htmlFor="login-username">Username</label>
        <div style={{ position: "relative" }}>
          <User
            size={15}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
            }}
          />
          <input
            id="login-username"
            className="input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            autoComplete="username"
            required
            style={{ paddingLeft: "2rem" }}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="label" htmlFor="login-password">Password</label>
        <div style={{ position: "relative" }}>
          <Lock
            size={15}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
            }}
          />
          <input
            id="login-password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            style={{ paddingLeft: "2rem" }}
          />
        </div>
      </div>

      <button
        id="btn-login-submit"
        type="submit"
        className="btn btn-primary"
        disabled={loading || !username || !password}
        style={{ width: "100%", justifyContent: "center", padding: "0.65rem" }}
      >
        {loading ? <span className="spinner" /> : <Lock size={15} />}
        {loading ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}
