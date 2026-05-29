import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { bootstrapAdmin, login } from "../api/auth";
import { useAppStore } from "../state/store";

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAppStore((s) => s.setAuth);
  const showToast = useAppStore((s) => s.showToast);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"login" | "bootstrap" | null>(null);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (axios.isAxiosError(error)) {
      const detail = error.response?.data?.detail;
      if (typeof detail === "string" && detail.trim()) {
        return detail;
      }
      if (typeof error.response?.data === "string" && error.response.data.trim()) {
        return error.response.data;
      }
    }
    return fallback;
  };

  const submitLogin = async () => {
    setBusy("login");
    try {
      const res = await login(email, password);
      setAuth(res.access_token, {
        id: res.user_id,
        email: res.email,
        role: res.role,
        active: true,
      });
      navigate("/");
    } catch (error) {
      showToast(getErrorMessage(error, "Login failed."), "error");
    } finally {
      setBusy(null);
    }
  };

  const submitBootstrap = async () => {
    setBusy("bootstrap");
    try {
      const res = await bootstrapAdmin(email, password);
      setAuth(res.access_token, {
        id: res.user_id,
        email: res.email,
        role: res.role,
        active: true,
      });
      navigate("/");
    } catch (error) {
      showToast(getErrorMessage(error, "Bootstrap failed. Admin may already exist."), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card card">
        <div className="eyebrow">Access control</div>
        <h1 className="page-title">Threat Actor Validator</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          Use bootstrap once to create the first admin. After that, sign in normally.
        </p>
        <label className="field-label">
          Email
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field-label">
          Password
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div className="action-row" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={submitLogin} disabled={busy !== null}>
            {busy === "login" ? "Signing in..." : "Sign in"}
          </button>
          <button className="btn" onClick={submitBootstrap} disabled={busy !== null}>
            {busy === "bootstrap" ? "Bootstrapping..." : "Bootstrap admin"}
          </button>
        </div>
      </div>
    </div>
  );
}
