import React from "react";
import { LogOut, User } from "lucide-react";
import type { AuthUser } from "../../types";

interface TopBarProps {
  user: AuthUser;
  onLogout: () => void;
}

const ROLE_COLOR: Record<string, string> = {
  superadmin: "badge-red",
  admin: "badge-purple",
  developer: "badge-green",
  readonly: "badge-muted",
};

export default function TopBar({ user, onLogout }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-title" />
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
            }}
          >
            {user.username.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
            {user.username}
          </span>
          <span className={`badge ${ROLE_COLOR[user.role] ?? "badge-muted"}`}>
            {user.role}
          </span>
        </div>
        <button
          id="btn-logout"
          className="btn btn-ghost btn-sm"
          onClick={onLogout}
          title="Logout"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </header>
  );
}
