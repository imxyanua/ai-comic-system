import { FormEvent, useState } from "react";
import { api, errorMessage } from "./api";

export function Auth({ onToken }: { onToken: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        await api("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
      }
      const session = await api<{ access_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onToken(session.access_token);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel stack narrow" onSubmit={submit}>
      <h2>{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h2>
      <label>
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label>
        Mật khẩu
        <input
          type="password"
          minLength={mode === "register" ? 8 : 1}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit" disabled={busy}>
        {mode === "login" ? "Vào xưởng" : "Đăng ký và vào"}
      </button>
      <button type="button" className="ghost" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Chưa có tài khoản" : "Đã có tài khoản"}
      </button>
    </form>
  );
}
