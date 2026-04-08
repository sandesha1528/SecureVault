import React from "react";
import { Users, Edit2, Trash2, Shield, CheckCircle, XCircle } from "lucide-react";
import type { UserRecord } from "../../types";
import { formatDistanceToNow } from "date-fns";

interface UserListProps {
  users: UserRecord[];
  currentUserId: string;
  onEdit: (user: UserRecord) => void;
  onDelete: (id: string) => Promise<void>;
  loading: boolean;
}

const ROLE_BADGE: Record<string, string> = {
  superadmin: "badge-red",
  admin:      "badge-purple",
  developer:  "badge-green",
  readonly:   "badge-muted",
};

export default function UserList({ users, currentUserId, onEdit, onDelete, loading }: UserListProps) {
  if (users.length === 0) {
    return (
      <div className="empty-state">
        <Users size={32} />
        <p>No users found</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>2FA</th>
            <th>Status</th>
            <th>Created</th>
            <th>Last Login</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div
                    style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: "var(--accent)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
                    }}
                  >
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 500 }}>
                    {u.username}
                    {u.id === currentUserId && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-muted)" }}>(you)</span>
                    )}
                  </span>
                </div>
              </td>
              <td>
                <span className={`badge ${ROLE_BADGE[u.role_name ?? ""] ?? "badge-muted"}`}>
                  <Shield size={10} />
                  {u.role_name ?? "—"}
                </span>
              </td>
              <td>
                {u.totp_enabled ? (
                  <span className="badge badge-green"><CheckCircle size={10} />Enabled</span>
                ) : (
                  <span className="badge badge-muted">Disabled</span>
                )}
              </td>
              <td>
                {u.is_active ? (
                  <span className="badge badge-green">Active</span>
                ) : (
                  <span className="badge badge-red"><XCircle size={10} />Inactive</span>
                )}
              </td>
              <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {formatDistanceToNow(new Date(u.created_at * 1000), { addSuffix: true })}
              </td>
              <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {u.last_login
                  ? formatDistanceToNow(new Date(u.last_login * 1000), { addSuffix: true })
                  : "Never"}
              </td>
              <td>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button
                    id={`btn-edit-user-${u.id}`}
                    className="btn btn-ghost btn-sm"
                    onClick={() => onEdit(u)}
                  >
                    <Edit2 size={12} />
                  </button>
                  {u.id !== currentUserId && (
                    <button
                      id={`btn-delete-user-${u.id}`}
                      className="btn btn-danger btn-sm"
                      onClick={() => onDelete(u.id)}
                      disabled={loading}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
