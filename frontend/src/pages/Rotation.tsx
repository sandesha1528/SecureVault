import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import RotationList from "../components/rotation/RotationList";
import RotationForm from "../components/rotation/RotationForm";
import { listRotationConfigs, createRotationConfig, deleteRotationConfig, triggerRotation } from "../api/endpoints";
import type { RotationConfig, RotationConfigCreate } from "../types";

export default function Rotation() {
  const [configs, setConfigs] = useState<RotationConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setConfigs(await listRotationConfigs());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (data: RotationConfigCreate) => {
    setLoading(true);
    setError(null);
    try {
      const created = await createRotationConfig(data);
      setConfigs((prev) => [...prev, created]);
      setShowForm(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create");
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this rotation config?")) return;
    try {
      await deleteRotationConfig(id);
      setConfigs((prev) => prev.filter((c) => c.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleTrigger = async (id: string) => {
    try {
      await triggerRotation(id);
      setTimeout(load, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to trigger");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Credential Rotation</h1>
          <p>Automatic password rotation for Postgres, MySQL, Redis, and MongoDB.</p>
        </div>
        <button id="btn-add-rotation" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={14} />
          {showForm ? "Cancel" : "Add Config"}
        </button>
      </div>

      {showForm && (
        <div className="card animate-fade-in">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: "1rem" }}>New Rotation Config</h2>
          <RotationForm onSubmit={handleCreate} loading={loading} error={error} />
        </div>
      )}

      <RotationList
        configs={configs}
        onTrigger={handleTrigger}
        onDelete={handleDelete}
        loading={loading}
      />
    </div>
  );
}
