import { ChangeEvent, FormEvent, useState } from "react";
import { Client, errorMessage } from "./api";
import { Character } from "./types";
import { useAssetUrl } from "./useAssetUrl";

type Props = {
  http: Client;
  comicId: string;
  characters: Character[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
};

export function CharactersSection({ http, comicId, characters, onChanged, onError }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await http.post(`/comics/${comicId}/characters`, { name, description });
      setName("");
      setDescription("");
      await onChanged();
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  return (
    <section className="panel stack">
      <p className="kicker">Cast</p>
      <h2>Nhân vật</h2>
      <p className="muted">Mô tả nhân vật được ghép vào prompt khi panel chưa có prompt riêng.</p>
      <div className="cards">
        {characters.map((character) => (
          <CharacterCard key={character.id} http={http} comicId={comicId} character={character} onChanged={onChanged} onError={onError} />
        ))}
      </div>
      <form className="row wrap" onSubmit={create}>
        <input placeholder="Tên" value={name} onChange={(event) => setName(event.target.value)} required />
        <input placeholder="Mô tả" value={description} onChange={(event) => setDescription(event.target.value)} />
        <button type="submit">Thêm nhân vật</button>
      </form>
    </section>
  );
}

function CharacterCard({
  http,
  comicId,
  character,
  onChanged,
  onError,
}: {
  http: Client;
  comicId: string;
  character: Character;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(character.name);
  const [description, setDescription] = useState(character.description);
  const [uploading, setUploading] = useState(false);
  const imageUrl = useAssetUrl(http, character.reference_asset_id);

  async function save() {
    try {
      await http.patch(`/characters/${character.id}`, { name, description });
      await onChanged();
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  async function remove() {
    if (!window.confirm(`Xoá nhân vật ${character.name}?`)) {
      return;
    }
    try {
      await http.del(`/characters/${character.id}`);
      await onChanged();
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      const target = await http.post<{ asset_id: string; upload_url: string; headers: Record<string, string> }>(
        `/comics/${comicId}/assets/upload-url`,
        { filename: file.name, mime_type: file.type, kind: "character_ref", size_bytes: file.size },
      );
      const put = await fetch(target.upload_url, { method: "PUT", headers: target.headers, body: file });
      if (!put.ok) {
        throw new Error(`Upload lỗi ${put.status}`);
      }
      await http.post(`/assets/${target.asset_id}/complete`);
      await http.patch(`/characters/${character.id}`, { reference_asset_id: target.asset_id });
      await onChanged();
    } catch (caught) {
      onError(caught instanceof Error && !("status" in caught) ? caught.message : errorMessage(caught));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card stack">
      <div className="thumb">{imageUrl ? <img src={imageUrl} alt={`Ảnh tham chiếu ${character.name}`} /> : <span>Chưa có ảnh</span>}</div>
      <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Tên nhân vật" />
      <textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} aria-label="Mô tả nhân vật" />
      <label className="file">
        {uploading ? "Đang upload…" : "Ảnh tham chiếu (PNG, JPEG, WebP, ≤ 5 MB)"}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} disabled={uploading} />
      </label>
      <div className="row">
        <button type="button" className="small" onClick={save}>
          Lưu
        </button>
        <button type="button" className="ghost small" onClick={remove}>
          Xoá
        </button>
      </div>
    </div>
  );
}
