import { FormEvent, useEffect, useState } from "react";
import { Client, errorMessage } from "./api";
import { Comic } from "./types";

export function ComicList({ http }: { http: Client }) {
  const [comics, setComics] = useState<Comic[] | null>(null);
  const [title, setTitle] = useState("");
  const [styleGuide, setStyleGuide] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setComics(await http.get<Comic[]>("/comics"));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const comic = await http.post<Comic>("/comics", { title, style_guide: styleGuide });
      window.location.hash = `#/comics/${comic.id}`;
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function archive(comic: Comic) {
    if (!window.confirm(`Archive "${comic.title}"? Comic sẽ ẩn khỏi danh sách.`)) {
      return;
    }
    try {
      await http.del(`/comics/${comic.id}`);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="split">
      <section className="panel stack">
        <p className="kicker">Danh sách</p>
        <h2>Comic của bạn</h2>
        {comics === null ? <p className="muted">Đang tải…</p> : null}
        {comics?.length === 0 ? <p className="empty">Chưa có comic nào.</p> : null}
        <ul className="list">
          {comics?.map((comic) => (
            <li key={comic.id}>
              <a href={`#/comics/${comic.id}`}>{comic.title}</a>
              <span className="chip">{comic.status}</span>
              <button type="button" className="ghost small" onClick={() => archive(comic)}>
                Archive
              </button>
            </li>
          ))}
        </ul>
        {error ? <p className="error">{error}</p> : null}
      </section>
      <form className="panel stack" onSubmit={create}>
        <p className="kicker">Tạo mới</p>
        <h2>Comic mới</h2>
        <label>
          Tên comic
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          Style guide
          <textarea
            rows={3}
            value={styleGuide}
            placeholder="truyện tranh mực đen, nét rõ"
            onChange={(event) => setStyleGuide(event.target.value)}
          />
        </label>
        <button type="submit" className="accent" disabled={busy}>
          Tạo comic
        </button>
      </form>
    </div>
  );
}
