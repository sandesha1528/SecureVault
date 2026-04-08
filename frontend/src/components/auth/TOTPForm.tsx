import React, { useEffect, useRef, useState } from "react";
import { ShieldCheck, AlertCircle } from "lucide-react";

interface TOTPFormProps {
  onSubmit: (code: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  onBack?: () => void;
}

export default function TOTPForm({ onSubmit, loading, error, onBack }: TOTPFormProps) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  // Single ref holding an array — avoids calling useRef inside a loop (violates Rules of Hooks)
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null));

  const focus = (idx: number) => inputRefs.current[idx]?.focus();

  const handleChange = (idx: number, val: string) => {
    const d = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = d;
    setDigits(next);

    if (d && idx < 5) focus(idx + 1);

    const full = next.join("");
    if (full.length === 6 && next.every(Boolean)) {
      onSubmit(full);
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      focus(idx - 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const arr = pasted.split("");
      setDigits(arr);
      onSubmit(pasted);
    }
  };

  useEffect(() => { focus(0); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: "color-mix(in srgb, var(--accent-green) 15%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent-green) 40%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1rem",
          }}
        >
          <ShieldCheck size={24} color="var(--accent-green)" />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Two-Factor Authentication</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
          Enter the 6-digit code from your authenticator app
        </p>
      </div>

      {error && (
        <div className="alert alert-error animate-fade-in">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      <div
        style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}
        onPaste={handlePaste}
      >
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            id={`totp-digit-${i}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="input"
            style={{
              width: 46,
              height: 52,
              textAlign: "center",
              fontSize: 22,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              padding: "0",
              letterSpacing: 0,
            }}
          />
        ))}
      </div>

      {loading && (
        <div className="flex-center">
          <span className="spinner" />
        </div>
      )}

      {onBack && (
        <button
          id="btn-totp-back"
          className="btn btn-ghost"
          onClick={onBack}
          style={{ width: "100%", justifyContent: "center" }}
        >
          ← Back to login
        </button>
      )}
    </div>
  );
}
