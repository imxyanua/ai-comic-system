import { FormEvent, useEffect, useState } from "react";
import { api, RequestError } from "./api";

const TOKEN_KEY = "comic_access_token";

type Job = {
  job_id: string;
  status: string;
  panel_id: string;
  result_asset_id?: string;
  error_message?: string | null;
};

type Asset = { download_url: string | null; status: string };

const statusLabel: Record<string, string> = {
  pending: "Đang tạo job",
  queued: "Đang chờ worker",
  running: "Đang vẽ",
  succeeded: "Xong",
  failed: "Lỗi",
};

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!token) {
      setEmail("");
      return;
    }
    api<{ email: string }>("/auth/me", {}, token)
      .then((me) => setEmail(me.email))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      });
  }, [token]);

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  return (
    <main className="page">
      <header>
        <div>
          <h1>ComicSystem</h1>
          <p className="muted">Một khung tranh, worker giả lập, ảnh lưu trên MinIO.</p>
        </div>
        {token ? (
          <button type="button" onClick={logout}>
            Đăng xuất
          </button>
        ) : null}
      </header>
      {token ? <Studio token={token} email={email} /> : <Auth onToken={setToken} />}
    </main>
  );
}

function Auth({ onToken }: { onToken: (token: string) => void }) {
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
      localStorage.setItem(TOKEN_KEY, session.access_token);
      onToken(session.access_token);
    } catch (caught) {
      setError(caught instanceof RequestError ? caught.message : "Không gọi được API");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={submit}>
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
      <button
        type="button"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
        style={{ background: "transparent", color: "#1c1915", border: "1px solid #1c1915" }}
      >
        {mode === "login" ? "Chưa có tài khoản" : "Đã có tài khoản"}
      </button>
    </form>
  );
}

function Studio({ token, email }: { token: string; email: string }) {
  const [title, setTitle] = useState("Chương mở đầu");
  const [styleGuide, setStyleGuide] = useState("truyện tranh mực đen, nét rõ");
  const [summary, setSummary] = useState("một con phố sau mưa");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setImageUrl("");
    setJobStatus("Đang tạo comic");
    try {
      const comic = await api<{ id: string }>(
        "/comics",
        { method: "POST", body: JSON.stringify({ title, style_guide: styleGuide }) },
        token,
      );
      const scene = await api<{ id: string }>(
        `/comics/${comic.id}/scenes`,
        { method: "POST", body: JSON.stringify({ summary }) },
        token,
      );
      const panel = await api<{ id: string }>(
        `/scenes/${scene.id}/panels`,
        {
          method: "POST",
          body: JSON.stringify(prompt.trim() ? { image_prompt: prompt } : {}),
        },
        token,
      );
      const created = await api<Job>(`/panels/${panel.id}/generate`, { method: "POST", body: "{}" }, token);
      const finished = await pollJob(token, created.job_id, setJobStatus);
      if (finished.status === "succeeded" && finished.result_asset_id) {
        const asset = await api<Asset>(`/assets/${finished.result_asset_id}`, {}, token);
        if (!asset.download_url) {
          throw new RequestError("Ảnh chưa sẵn sàng", 409);
        }
        setImageUrl(asset.download_url);
        setJobStatus(statusLabel.succeeded);
      } else {
        setError(finished.error_message || "Sinh ảnh thất bại");
      }
    } catch (caught) {
      setError(caught instanceof RequestError ? caught.message : "Không gọi được API");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split">
      <form className="panel stack" onSubmit={submit}>
        <h2>Khung mới</h2>
        <p className="muted">{email}</p>
        <label>
          Tên comic
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          Style guide
          <textarea rows={3} value={styleGuide} onChange={(event) => setStyleGuide(event.target.value)} />
        </label>
        <label>
          Tóm tắt cảnh
          <textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} />
        </label>
        <label>
          Prompt panel
          <textarea
            rows={3}
            value={prompt}
            placeholder="Để trống thì API ghép style guide và tóm tắt cảnh"
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={busy}>
          Tạo và sinh ảnh
        </button>
      </form>
      <section className="panel stack">
        <h2>Ảnh panel</h2>
        <p className="muted">{jobStatus || "Chưa có job"}</p>
        <div className="frame">{imageUrl ? <img src={imageUrl} alt="Panel đã sinh" /> : <span>Chưa có ảnh</span>}</div>
      </section>
    </div>
  );
}

async function pollJob(token: string, jobId: string, onStatus: (label: string) => void): Promise<Job> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const job = await api<Job>(`/jobs/${jobId}`, {}, token);
    onStatus(statusLabel[job.status] ?? job.status);
    if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
      return job;
    }
    await delay(1500);
  }
  throw new RequestError("Hết thời gian chờ job", 408);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
