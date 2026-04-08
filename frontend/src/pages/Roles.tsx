import React, { useEffect, useState } from "react";
import RoleEditor from "../components/rbac/RoleEditor";
import { listRoles, createRole, updateRole, deleteRole } from "../api/endpoints";
import type { Role, RoleCreateRequest } from "../types";

export default function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRoles(await listRoles());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data: RoleCreateRequest) => {
    setLoading(true);
    setError(null);
    try {
      const r = await createRole(data);
      setRoles((prev) => [...prev, r]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create role");
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string, data: RoleCreateRequest) => {
    setLoading(true);
    setError(null);
    try {
      await updateRole(id, data);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update role");
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this role?")) return;
    try {
      await deleteRole(id);
      setRoles((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete role");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", height: "100%" }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Role Management</h1>
        <p>Define roles, permissions, and inheritance chains.</p>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <RoleEditor
          roles={roles}
          onSave={handleSave}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          loading={loading}
          error={error}
        />
      </div>
    </div>
  );
}
