import React, { FormEvent, useState } from "react";
import { Shield, Plus, X, AlertCircle } from "lucide-react";
import type { Role, RoleCreateRequest } from "../../types";

const ALL_PERMISSIONS = [
  "secrets:read:*", "secrets:write:*", "secrets:delete:*",
  "ssh:sign", "ssh:revoke", "ssh:rotate_ca",
  "rotation:read", "rotation:write", "rotation:trigger",
  "users:read", "users:write", "audit:read", "admin:*",
];

interface RoleEditorProps {
  roles: Role[];
  onSave: (data: RoleCreateRequest) => Promise<void>;
  onUpdate: (id: string, data: RoleCreateRequest) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

const PROTECTED = ["role-superadmin", "role-admin", "role-developer", "role-readonly"];

export default function RoleEditor({ roles, onSave, onUpdate, onDelete, loading, error }: RoleEditorProps) {
  const [selected, setSelected] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [customPerm, setCustomPerm] = useState("");

  const selectRole = (role: Role) => {
    setSelected(role);
    setName(role.name);
    setParentId(role.parent_role_id);
    setPermissions(role.permissions);
  };

  const newRole = () => {
    setSelected(null);
    setName(""); setParentId(null); setPermissions([]);
  };

  const togglePerm = (p: string) => {
    setPermissions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const addCustom = () => {
    if (customPerm.trim() && !permissions.includes(customPerm.trim())) {
      setPermissions((p) => [...p, customPerm.trim()]);
      setCustomPerm("");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const data: RoleCreateRequest = { name, parent_role_id: parentId, permissions };
    if (selected) await onUpdate(selected.id, data);
    else await onSave(data);
    newRole();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "1rem", height: "100%" }}>
      {/* Role list */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Roles
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0.4rem" }}>
          {roles.map((r) => (
            <button
              key={r.id}
              id={`btn-role-${r.id}`}
              onClick={() => selectRole(r)}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                width: "100%", padding: "0.5rem 0.6rem", borderRadius: 6,
                background: selected?.id === r.id ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
                color: selected?.id === r.id ? "var(--accent)" : "var(--text-primary)",
                border: "none", cursor: "pointer", fontSize: 13, textAlign: "left",
                transition: "all 150ms",
              }}
            >
              <Shield size={13} />
              {r.name}
              {PROTECTED.includes(r.id) && (
                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>built-in</span>
              )}
            </button>
          ))}
        </div>
        <div style={{ padding: "0.6rem" }}>
          <button id="btn-new-role" className="btn btn-ghost btn-sm" onClick={newRole} style={{ width: "100%", justifyContent: "center" }}>
            <Plus size={13} /> New Role
          </button>
        </div>
      </div>

      {/* Role editor */}
      <div className="card">
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>
            {selected ? `Edit: ${selected.name}` : "Create New Role"}
          </h3>

          <div className="form-group">
            <label className="label" htmlFor="role-name">Role Name</label>
            <input id="role-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required disabled={selected ? PROTECTED.includes(selected.id) : false} />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="role-parent">Parent Role (inherits permissions)</label>
            <select id="role-parent" className="input" value={parentId ?? ""} onChange={(e) => setParentId(e.target.value || null)}>
              <option value="">None</option>
              {roles.filter((r) => r.id !== selected?.id).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <div className="label" style={{ marginBottom: 8 }}>Permissions</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: 8 }}>
              {ALL_PERMISSIONS.map((p) => {
                const active = permissions.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    id={`perm-${p.replace(/[^a-z0-9]/g, "-")}`}
                    onClick={() => togglePerm(p)}
                    className={`badge ${active ? "badge-purple" : "badge-muted"}`}
                    style={{ cursor: "pointer", userSelect: "none", border: "none", fontFamily: "var(--font-mono)", fontSize: 11 }}
                  >
                    {active && <span>✓</span>}
                    {p}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                id="perm-custom"
                className="input mono"
                style={{ fontSize: 12 }}
                value={customPerm}
                onChange={(e) => setCustomPerm(e.target.value)}
                placeholder="secrets:read:prod/*"
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={addCustom}>
                <Plus size={12} /> Add
              </button>
            </div>
            {permissions.filter((p) => !ALL_PERMISSIONS.includes(p)).map((p) => (
              <div key={p} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, marginRight: 4 }}>
                <span className="badge badge-amber" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{p}</span>
                <button type="button" onClick={() => togglePerm(p)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-red)", padding: 0 }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          {error && (
            <div className="alert alert-error animate-fade-in">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="submit" id="btn-role-save" className="btn btn-primary" disabled={loading || !name}>
              {loading ? <span className="spinner" /> : <Shield size={14} />}
              {selected ? "Update Role" : "Create Role"}
            </button>
            {selected && !PROTECTED.includes(selected.id) && (
              <button
                type="button"
                id="btn-role-delete"
                className="btn btn-danger"
                disabled={loading}
                onClick={() => onDelete(selected.id)}
              >
                Delete
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
