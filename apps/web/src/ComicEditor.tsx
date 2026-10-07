import { FormEvent, useCallback, useEffect, useState } from "react";
import { Client, errorMessage } from "./api";
import { CharactersSection } from "./CharactersSection";
import { SceneSection } from "./SceneSection";
import {
  ACTIVE_PANEL_STATUSES,
  Character,
  Comic,
  Panel,
  Scene,
  Story,
  Workflow,
  workflowStatusLabel,
} from "./types";

const POLL_MS = 2000;

export function ComicEditor({ http, comicId }: { http: Client; comicId: string }) {
  const [comic, setComic] = useState<Comic | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [panels, setPanels] = useState<Record<string, Panel[]>>({});
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadStructure = useCallback(async () => {
    const nextScenes = await http.get<Scene[]>(`/comics/${comicId}/scenes`);
    const entries = await Promise.all(
      nextScenes.map(async (scene) => [scene.id, await http.get<Panel[]>(`/scenes/${scene.id}/panels`)] as const),
    );
    setScenes(nextScenes);
    setPanels(Object.fromEntries(entries));
  }, [http, comicId]);

  const loadCharacters = useCallback(async () => {
    setCharacters(await http.get<Character[]>(`/comics/${comicId}/characters`));
  }, [http, comicId]);

  useEffect(() => {
    (async () => {
      try {
        const [nextComic, nextStory] = await Promise.all([
          http.get<Comic>(`/comics/${comicId}`),
          http.get<Story>(`/comics/${comicId}/story`),
        ]);
        setComic(nextComic);
        setStory(nextStory);
        await Promise.all([loadCharacters(), loadStructure()]);
      } catch (caught) {
        setError(errorMessage(caught));
      }
    })();
  }, [http, comicId, loadCharacters, loadStructure]);

  const anyActive =
    Object.values(panels).some((list) => list.some((panel) => ACTIVE_PANEL_STATUSES.includes(panel.generation_status))) ||
    workflow?.status === "running";

  useEffect(() => {
    if (!anyActive) {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        await loadStructure();
        if (workflow?.status === "running") {
          setWorkflow(await http.get<Workflow>(`/workflows/${workflow.workflow_id}`));
        }
      } catch {
        // keep polling; the next tick may succeed
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [anyActive, http, loadStructure, workflow?.status, workflow?.workflow_id]);

  async function run(action: () => Promise<void>, success?: string) {
    setError("");
    setNotice("");
    try {
      await action();
      if (success) {
        setNotice(success);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function saveComic(event: FormEvent) {
    event.preventDefault();
    if (!comic) {
      return;
    }
    await run(async () => {
      setComic(
        await http.patch<Comic>(`/comics/${comicId}`, {
          title: comic.title,
          description: comic.description ?? "",
          style_guide: comic.style_guide ?? "",
        }),
      );
    }, "Đã lưu comic");
  }

  async function saveStory(event: FormEvent) {
    event.preventDefault();
    if (!story) {
      return;
    }
    await run(async () => {
      setStory(
        await http.put<Story>(`/comics/${comicId}/story`, {
          title: story.title,
          synopsis: story.synopsis ?? "",
          content: story.content ?? "",
        }),
      );
    }, "Đã lưu story");
  }

  async function addScene() {
    await run(async () => {
      await http.post(`/comics/${comicId}/scenes`, { summary: "" });
      await loadStructure();
    });
  }

  async function startBatch() {
    await run(async () => {
      setWorkflow(await http.post<Workflow>(`/comics/${comicId}/workflows/batch-panel-images`, {}));
      await loadStructure();
    });
  }

  async function cancelBatch() {
    if (!workflow) {
      return;
    }
    await run(async () => {
      setWorkflow(await http.post<Workflow>(`/workflows/${workflow.workflow_id}/cancel`));
      await loadStructure();
    }, "Đã hủy batch. Panel đang vẽ có thể vẫn chạy hết trên worker nhưng ảnh sẽ bị bỏ.");
  }

  async function exportZip() {
    await run(async () => {
      const result = await http.post<{ download_url: string; files: string[] }>(`/comics/${comicId}/export`, {
        format: "zip",
      });
      window.location.assign(result.download_url);
      setNotice(`Đã tạo ZIP gồm ${result.files.length} ảnh`);
    });
  }

  if (!comic || !story) {
    return <p className="muted">{error || "Đang tải…"}</p>;
  }

  return (
    <div className="stack">
      <p>
        <a href="#/">← Danh sách comic</a>
      </p>

      <div className="split">
        <form className="panel stack" onSubmit={saveComic}>
          <h2>Comic</h2>
          <label>
            Tên
            <input value={comic.title} onChange={(event) => setComic({ ...comic, title: event.target.value })} required />
          </label>
          <label>
            Mô tả
            <textarea
              rows={2}
              value={comic.description ?? ""}
              onChange={(event) => setComic({ ...comic, description: event.target.value })}
            />
          </label>
          <label>
            Style guide
            <textarea
              rows={2}
              value={comic.style_guide ?? ""}
              onChange={(event) => setComic({ ...comic, style_guide: event.target.value })}
            />
          </label>
          <button type="submit">Lưu comic</button>
        </form>

        <form className="panel stack" onSubmit={saveStory}>
          <h2>Story</h2>
          <label>
            Tiêu đề
            <input value={story.title} onChange={(event) => setStory({ ...story, title: event.target.value })} required />
          </label>
          <label>
            Tóm tắt
            <textarea
              rows={2}
              value={story.synopsis ?? ""}
              onChange={(event) => setStory({ ...story, synopsis: event.target.value })}
            />
          </label>
          <label>
            Ghi chú
            <textarea
              rows={2}
              value={story.content ?? ""}
              onChange={(event) => setStory({ ...story, content: event.target.value })}
            />
          </label>
          <button type="submit">Lưu story</button>
        </form>
      </div>

      <CharactersSection http={http} comicId={comicId} characters={characters} onChanged={loadCharacters} onError={setError} />

      <section className="panel toolbar">
        <div className="row">
          <button type="button" onClick={startBatch} disabled={workflow?.status === "running"}>
            Sinh ảnh tất cả panel
          </button>
          {workflow?.status === "running" ? (
            <button type="button" className="ghost" onClick={cancelBatch}>
              Hủy batch
            </button>
          ) : null}
          <button type="button" className="ghost" onClick={exportZip}>
            Export ZIP
          </button>
          <button type="button" className="ghost" onClick={addScene}>
            Thêm cảnh
          </button>
        </div>
        {workflow ? (
          <p className="muted" data-testid="workflow-status">
            Batch: {workflowStatusLabel[workflow.status]} · {workflow.succeeded}/{workflow.total} xong · {workflow.failed} lỗi ·{" "}
            {workflow.cancelled} hủy · {workflow.pending} đang chờ
          </p>
        ) : null}
        {notice ? <p className="notice">{notice}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      {scenes.length === 0 ? <p className="muted">Chưa có cảnh nào. Bấm “Thêm cảnh” để bắt đầu.</p> : null}
      {scenes.map((scene, index) => (
        <SceneSection
          key={scene.id}
          http={http}
          index={index}
          scene={scene}
          panels={panels[scene.id] ?? []}
          onChanged={loadStructure}
          onError={setError}
        />
      ))}
    </div>
  );
}
