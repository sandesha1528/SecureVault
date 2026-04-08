import { useState, useCallback } from "react";
import {
  signCert,
  getCaPubkey,
  getMyCerts,
  revokeCert,
} from "../api/endpoints";
import type { CertRecord, SignedCert } from "../types";

export function useSSH() {
  const [caPubkey, setCaPubkey] = useState<string>("");
  const [lastCert, setLastCert] = useState<SignedCert | null>(null);
  const [certs, setCerts] = useState<CertRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCaPubkey = useCallback(async () => {
    try {
      const data = await getCaPubkey();
      setCaPubkey(data.public_key);
      return data.public_key;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch CA public key");
      throw e;
    }
  }, []);

  const requestCert = useCallback(
    async (publicKey: string, ttlHours?: number) => {
      setLoading(true);
      setError(null);
      try {
        const cert = await signCert({ public_key: publicKey, ttl_hours: ttlHours });
        setLastCert(cert);
        return cert;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Certificate signing failed");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchMyCerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyCerts();
      setCerts(data);
      return data;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load certificates");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const doRevoke = useCallback(async (certId: string) => {
    setLoading(true);
    setError(null);
    try {
      await revokeCert(certId);
      setCerts((prev) =>
        prev.map((c) => (c.id === certId ? { ...c, revoked: true } : c))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Revocation failed");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    caPubkey,
    lastCert,
    certs,
    loading,
    error,
    fetchCaPubkey,
    requestCert,
    fetchMyCerts,
    revokeCert: doRevoke,
    clearLastCert: () => setLastCert(null),
  };
}
