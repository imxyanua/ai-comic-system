import { useEffect, useMemo, useState } from "react";
import { api, client } from "./api";
import { Auth } from "./Auth";
import { ComicEditor } from "./ComicEditor";
import { ComicList } from "./ComicList";

const TOKEN_KEY = "comic_access_token";

function comicIdFromHash(): string | null {
  const match = window.location.hash.match(/^#\/comics\/([0-9a-f-]{36})$/);
  return match ? match[1] : null;
}

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [email, setEmail] = useState("");
  const [comicId, setComicId] = useState<string | null>(comicIdFromHash);
  const http = useMemo(() => (token ? client(token) : null), [token]);

  useEffect(() => {
    const onHash = () => setComicId(comicIdFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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

  function signIn(next: string) {
    localStorage.setItem(TOKEN_KEY, next);
    setToken(next);
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    window.location.hash = "";
  }

  return (
    <main className="page">
      <header>
        <div>
          <h1>
            <a href="#/">ComicSystem</a>
          </h1>
          <p className="muted">Comic, nhân vật, cảnh, panel. Ảnh sinh bất đồng bộ trên worker.</p>
        </div>
        {http ? (
          <div className="row">
            <span className="muted">{email}</span>
            <button type="button" className="ghost" onClick={signOut}>
              Đăng xuất
            </button>
          </div>
        ) : null}
      </header>
      {!http ? (
        <Auth onToken={signIn} />
      ) : comicId ? (
        <ComicEditor key={comicId} http={http} comicId={comicId} />
      ) : (
        <ComicList http={http} />
      )}
    </main>
  );
}
