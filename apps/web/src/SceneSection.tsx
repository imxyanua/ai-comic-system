import { useState } from "react";
import { Client, errorMessage } from "./api";
import { PanelCard } from "./PanelCard";
import { Panel, Scene } from "./types";

type Props = {
  http: Client;
  index: number;
  scene: Scene;
  panels: Panel[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
};

export function SceneSection({ http, index, scene, panels, onChanged, onError }: Props) {
  const [title, setTitle] = useState(scene.title ?? "");
  const [summary, setSummary] = useState(scene.summary ?? "");

  async function attempt(action: () => Promise<unknown>) {
    try {
      await action();
      await onChanged();
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  const save = () => attempt(() => http.patch(`/scenes/${scene.id}`, { title, summary }));
  const addPanel = () => attempt(() => http.post(`/scenes/${scene.id}/panels`, {}));
  const remove = () => {
    if (window.confirm(`Xoá cảnh ${index + 1} và mọi panel trong đó?`)) {
      void attempt(() => http.del(`/scenes/${scene.id}`));
    }
  };
  const move = (panelId: string, offset: -1 | 1) => {
    const ids = panels.map((panel) => panel.id);
    const from = ids.indexOf(panelId);
    const to = from + offset;
    if (to < 0 || to >= ids.length) {
      return;
    }
    [ids[from], ids[to]] = [ids[to], ids[from]];
    void attempt(() => http.put(`/scenes/${scene.id}/panel-order`, { panel_ids: ids }));
  };

  return (
    <section className="panel stack" data-testid="scene">
      <div className="scene-head">
        <span className="scene-index" aria-hidden="true">
          {index + 1}
        </span>
        <h2>Cảnh {index + 1}</h2>
        <input placeholder="Tiêu đề cảnh" value={title} onChange={(event) => setTitle(event.target.value)} />
        <button type="button" className="small" onClick={save}>
          Lưu cảnh
        </button>
        <button type="button" className="ghost small" onClick={remove}>
          Xoá cảnh
        </button>
      </div>
      <label>
        Tóm tắt cảnh (ghép vào prompt khi panel chưa có prompt)
        <textarea rows={2} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <div className="cards">
        {panels.map((panel, position) => (
          <PanelCard
            key={panel.id}
            http={http}
            label={`${index + 1}.${position + 1}`}
            panel={panel}
            isFirst={position === 0}
            isLast={position === panels.length - 1}
            onMove={(offset) => move(panel.id, offset)}
            onChanged={onChanged}
            onError={onError}
          />
        ))}
      </div>
      <button type="button" className="ghost" onClick={addPanel}>
        Thêm panel
      </button>
    </section>
  );
}
