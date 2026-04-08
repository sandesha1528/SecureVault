import React, { FormEvent, useEffect, useState } from "react";
import { UserPlus, AlertCircle } from "lucide-react";
import type { Role, UserRecord } from "../../types";

interface UserFormProps {
  roles: Role[];
  editing?: UserRecord | null;
  onSubmit: (data: {
    username: string;
    password: string;
    role_id: string;
  }) => Promise<void>;
  onUpdate: (id: string, data: { role_id?: string; is_active?: boolean }) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
  error: string | null;
}

export default function UserForm({ roles, editing, onSubmit, onUpdate, onCancel, loading, error }: UserFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (editing) {
      setUsername(editing.username);
      setRoleId(editing.role_id ?? roles[0]?.id ?? "");
      setIsActive(editing.is_active);
    } else {
      setUsername(""); setPassword(""); setRoleId(roles[0]?.id ?? ""); setIsActive(true);
    }
  }, [editing]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (editing) {
      await onUpdate(editing.id, { role_id: roleId, is_active: isActive });
    } else {
      await onSubmit({ username, password, role_id: roleId });
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h3 style={{ fontSize: 14, fontWeight: 600 }}>
        {editing ? `Edit User: ${editing.username}` : "Create New User"}
      </h3>

      {!editing && (
        <>
          <div className="form-group">
            <label className="label" htmlFor="user-username">Username</label>
            <input
              id="user-username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="user-password">Password</label>
            <input
              id="user-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
        </>
      )}

      <div className="form-group">
        <label className="label" htmlFor="user-role">Role</label>
        <select
          id="user-role"
          className="input"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {editing && (
        <div className="form-group">
          <label className="label" htmlFor="user-active">Status</label>
          <select
            id="user-active"
            className="input"
            value={isActive ? "active" : "inactive"}
            onChange={(e) => setIsActive(e.target.value === "active")}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      )}

      {error && (
        <div className="alert alert-error animate-fade-in">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          id="btn-user-submit"
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? <span className="spinner" /> : <UserPlus size={14} />}
          {editing ? "Update User" : "Create User"}
        </button>
        <button id="btn-user-cancel" type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
