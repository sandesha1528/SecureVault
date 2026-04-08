import { useState, useCallback, useRef } from "react";
import { getAuditLog } from "../api/endpoints";
import type { AuditEvent } from "../types";

export function useAudit() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLog = useCallback(
    async (params: {
      limit?: number;
      offset?: number;
      action?: string;
      actor?: string;
      outcome?: string;
      since?: number;
      until?: number;
    } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const data = await getAuditLog({ limit: 100, ...params });
        setEvents(data.events);
        setTotal(data.total);
        return data;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load audit log");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const startPolling = useCallback(
    (intervalMs = 10000, params: Parameters<typeof fetchLog>[0] = {}) => {
      fetchLog(params);
      pollRef.current = setInterval(() => fetchLog(params), intervalMs);
    },
    [fetchLog]
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  return {
    events,
    total,
    loading,
    error,
    fetchLog,
    startPolling,
    stopPolling,
  };
}
