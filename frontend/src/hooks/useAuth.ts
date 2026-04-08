import { useState, useCallback, useEffect } from "react";
import { login, logout, verifyTotp } from "../api/endpoints";
import type { AuthUser } from "../types";

function loadUser(): AuthUser | null {
  const token = localStorage.getItem("sv_access_token");
  const refresh = localStorage.getItem("sv_refresh_token");
  const username = localStorage.getItem("sv_username");
  const role = localStorage.getItem("sv_role");
  const user_id = localStorage.getItem("sv_user_id");
  if (token && refresh && username && role && user_id) {
    return { access_token: token, refresh_token: refresh, username, role, user_id };
  }
  return null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(loadUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totpPending, setTotpPending] = useState<{
    sessionToken: string;
    username: string;
  } | null>(null);

  const doLogin = useCallback(
    async (username: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await login({ username, password });
        if (res.requires_totp && res.access_token) {
          setTotpPending({ sessionToken: res.access_token, username });
          return { requires_totp: true };
        }
        if (res.access_token && res.refresh_token) {
          // Parse user_id from JWT payload
          const payload = JSON.parse(atob(res.access_token.split(".")[1]));
          const authUser: AuthUser = {
            user_id: payload.sub,
            username: res.username ?? username,
            role: res.role ?? "readonly",
            access_token: res.access_token,
            refresh_token: res.refresh_token,
          };
          localStorage.setItem("sv_access_token", authUser.access_token);
          localStorage.setItem("sv_refresh_token", authUser.refresh_token);
          localStorage.setItem("sv_username", authUser.username);
          localStorage.setItem("sv_role", authUser.role);
          localStorage.setItem("sv_user_id", authUser.user_id);
          setUser(authUser);
          return { requires_totp: false };
        }
        throw new Error("Unexpected response from login");
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Login failed";
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const doTotpVerify = useCallback(
    async (code: string) => {
      if (!totpPending) throw new Error("No TOTP session");
      setLoading(true);
      setError(null);
      try {
        const res = await verifyTotp({
          username: totpPending.username,
          code,
          session_token: totpPending.sessionToken,
        });
        if (res.access_token && res.refresh_token) {
          const payload = JSON.parse(atob(res.access_token.split(".")[1]));
          const authUser: AuthUser = {
            user_id: payload.sub,
            username: res.username ?? totpPending.username,
            role: res.role ?? "readonly",
            access_token: res.access_token,
            refresh_token: res.refresh_token,
          };
          localStorage.setItem("sv_access_token", authUser.access_token);
          localStorage.setItem("sv_refresh_token", authUser.refresh_token);
          localStorage.setItem("sv_username", authUser.username);
          localStorage.setItem("sv_role", authUser.role);
          localStorage.setItem("sv_user_id", authUser.user_id);
          setUser(authUser);
          setTotpPending(null);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "TOTP verification failed";
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [totpPending]
  );

  const doLogout = useCallback(async () => {
    const refresh = localStorage.getItem("sv_refresh_token") ?? "";
    try {
      await logout(refresh);
    } catch {}
    localStorage.clear();
    setUser(null);
    setTotpPending(null);
  }, []);

  return {
    user,
    loading,
    error,
    totpPending,
    login: doLogin,
    verifyTotp: doTotpVerify,
    logout: doLogout,
    isAuthenticated: user !== null,
  };
}
