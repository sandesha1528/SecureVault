import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import UserList from "../components/rbac/UserList";
import UserForm from "../components/rbac/UserForm";
import { listUsers, createUser, updateUser, deleteUser, listRoles } from "../api/endpoints";
import type { Role, UserRecord } from "../types";

interface UsersPageProps {
  currentUserId: string;
}

export default function Users({ currentUserId }: UsersPageProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([listUsers(), listRoles()]);
      setUsers(u);
      setRoles(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (data: { username: string; password: string; role_id: string }) => {
    setLoading(true);
    setError(null);
    try {
      const user = await createUser(data);
      setUsers((prev) => [...prev, user]);
      setShowForm(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create user");
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string, data: { role_id?: string; is_active?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      await updateUser(id, data);
      setEditing(null);
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update user");
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deactivate this user?")) return;
    try {
      await deleteUser(id);
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, is_active: false } : u));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    }
  };

  const handleEdit = (user: UserRecord) => {
    setEditing(user);
    setShowForm(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>User Management</h1>
          <p>Create and manage SecureVault users and their roles.</p>
        </div>
        <button
          id="btn-add-user"
          className="btn btn-primary"
          onClick={() => { setEditing(null); setShowForm((v) => !v); }}
        >
          <Plus size={14} />
          {showForm && !editing ? "Cancel" : "Add User"}
        </button>
      </div>

      {showForm && (
        <div className="card animate-fade-in">
          <UserForm
            roles={roles}
            editing={editing}
            onSubmit={handleCreate}
            onUpdate={handleUpdate}
            onCancel={() => { setShowForm(false); setEditing(null); }}
            loading={loading}
            error={error}
          />
        </div>
      )}

      <UserList
        users={users}
        currentUserId={currentUserId}
        onEdit={handleEdit}
        onDelete={handleDelete}
        loading={loading}
      />
    </div>
  );
}
