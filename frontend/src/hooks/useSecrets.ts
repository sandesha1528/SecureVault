import { useState, useCallback } from "react";
import {
  listSecrets,
  getSecret,
  writeSecret,
  deleteSecret,
  listVersions,
} from "../api/endpoints";
import type { Secret, SecretMeta, SecretWriteRequest } from "../types";

export function useSecrets() {
  const [paths, setPaths] = useState<string[]>([]);
  const [current, setCurrent] = useState<Secret | null>(null);
  const [versions, setVersions] = useState<SecretMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPaths = useCallback(async (prefix = "") => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSecrets(prefix);
      setPaths(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load secrets");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSecret = useCallback(async (path: string, version?: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSecret(path, version);
      setCurrent(data);
      return data;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load secret");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSecret = useCallback(
    async (path: string, body: SecretWriteRequest) => {
      setLoading(true);
      setError(null);
      try {
        const data = await writeSecret(path, body);
        return data;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to save secret");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const removeSecret = useCallback(async (path: string, hard = false) => {
    setLoading(true);
    setError(null);
    try {
      await deleteSecret(path, hard);
      setPaths((prev) => prev.filter((p) => p !== path));
      if (current?.path === path) setCurrent(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete secret");
      throw e;
    } finally {
      setLoading(false);
    }
  }, [current]);

  const fetchVersions = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listVersions(path);
      setVersions(data);
      return data;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load versions");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    paths,
    current,
    versions,
    loading,
    error,
    fetchPaths,
    fetchSecret,
    saveSecret,
    removeSecret,
    fetchVersions,
    clearCurrent: () => setCurrent(null),
  };
}
