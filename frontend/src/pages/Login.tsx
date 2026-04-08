import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import LoginForm from "../components/auth/LoginForm";
import TOTPForm from "../components/auth/TOTPForm";

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<{ requires_totp: boolean }>;
  onTotpVerify: (code: string) => Promise<void>;
  totpPending: { username: string; sessionToken: string } | null;
  loading: boolean;
  error: string | null;
}

export default function Login({ onLogin, onTotpVerify, totpPending, loading, error }: LoginPageProps) {
  const navigate = useNavigate();
  const [localError, setLocalError] = useState<string | null>(null);

  const handleLogin = async (username: string, password: string) => {
    setLocalError(null);
    try {
      const res = await onLogin(username, password);
      if (!res.requires_totp) navigate("/dashboard");
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : "Login failed");
    }
  };

  const handleTotp = async (code: string) => {
    setLocalError(null);
    try {
      await onTotpVerify(code);
      navigate("/dashboard");
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : "Verification failed");
    }
  };

  return (
    <div className="login-page">
      <div className="login-card animate-fade-in">
        {totpPending ? (
          <TOTPForm
            onSubmit={handleTotp}
            loading={loading}
            error={error ?? localError}
          />
        ) : (
          <LoginForm
            onSubmit={handleLogin}
            loading={loading}
            error={error ?? localError}
          />
        )}
      </div>
    </div>
  );
}
