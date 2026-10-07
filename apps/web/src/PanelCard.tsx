import { useEffect, useState } from "react";
import { Client, errorMessage } from "./api";
import { ACTIVE_PANEL_STATUSES, DialogLine, Job, Panel, panelStatusLabel } from "./types";
import { useAssetUrl } from "./useAssetUrl";

type Props = {
  http: Client;
  label: string;
  panel: Panel;
  isFirst: boolean;
  isLast: boolean;
  onMove: (offset: -1 | 1) => void;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
};

export function PanelCard({ http, label, panel, isFirst, isLast, onMove, onChanged, onError }: Props) {
  const [prompt, setPrompt] = useState(panel.image_prompt ?? "");
  const [negative, setNegative] = useState(panel.negative_prompt ?? "");
  const [dialog, setDialog] = useState<DialogLine[]>(panel.dialog);
  const [lastError, setLastError] = useState<string | null>(null);
  const imageUrl = useAssetUrl(http, panel.image_asset_id);
  const active = ACTIVE_PANEL_STATUSES.includes(panel.generation_status);

  useEffect(() => {
    if (!active) {
      setPrompt(panel.image_prompt ?? "");
    }
  }, [panel.image_prompt, active]);

  useEffect(() => {
    if (panel.generation_status !== "failed") {
      setLastError(null);
      return;
    }
    http
      .get<Job[]>(`/panels/${panel.id}/jobs`)
      .then((jobs) => setLastError(jobs[0]?.error_message ?? jobs[0]?.error_code ?? null))
      .catch(() => setLastError(null));
  }, [http, panel.id, panel.generation_status]);

  async function attempt(action: () => Promise<unknown>) {
    try {
      await action();
      await onChanged();
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  const save = () =>
    attempt(() =>
      http.patch(`/panels/${panel.id}`, {
        image_prompt: prompt,
        negative_prompt: negative,
        dialog: dialog.filter((line) => line.speaker.trim() && line.text.trim()),
      }),
    );

  const generate = () =>
    attempt(async () => {
      await http.patch(`/panels/${panel.id}`, { image_prompt: prompt, negative_prompt: negative });
      await http.post(`/panels/${panel.id}/generate`, {});
    });

  const latestJob = async () => (await http.get<Job[]>(`/panels/${panel.id}/jobs`))[0];

  const cancel = () => {
    const message =
      panel.generation_status === "running"
        ? "Panel đang vẽ. Hủy lúc này là best-effort: worker có thể vẫn chạy hết nhưng ảnh sẽ bị bỏ. Hủy?"
        : "Hủy job đang chờ?";
    if (!window.confirm(message)) {
      return;
    }
    void attempt(async () => {
      const job = await latestJob();
      if (job) {
        await http.post(`/jobs/${job.job_id}/cancel`);
      }
    });
  };

  const retry = () =>
    attempt(async () => {
      const job = await latestJob();
      if (job?.status === "failed") {
        await http.post(`/jobs/${job.job_id}/retry`);
      }
    });

  const remove = () => {
    if (window.confirm(`Xoá panel ${label}?`)) {
      void attempt(() => http.del(`/panels/${panel.id}`));
    }
  };

  const updateLine = (index: number, change: Partial<DialogLine>) =>
    setDialog(dialog.map((line, position) => (position === index ? { ...line, ...change } : line)));

  return (
    <article className="card stack" data-testid="panel" data-status={panel.generation_status}>
      <div className="row">
        <strong>Panel {label}</strong>
        <span className={`badge ${panel.generation_status}`}>{panelStatusLabel[panel.generation_status]}</span>
      </div>
      <div className="frame">
        {imageUrl ? <img src={imageUrl} alt={`Ảnh panel ${label}`} /> : <span>Chưa có ảnh</span>}
      </div>
      {lastError ? <p className="error">{lastError}</p> : null}
      <label>
        Prompt
        <textarea
          rows={3}
          aria-label="Prompt"
          value={prompt}
          placeholder="Để trống thì API ghép style guide, nhân vật và tóm tắt cảnh"
          onChange={(event) => setPrompt(event.target.value)}
        />
      </label>
      <label>
        Negative prompt
        <input aria-label="Negative prompt" value={negative} onChange={(event) => setNegative(event.target.value)} />
      </label>
      <div className="stack tight">
        <span className="muted">Thoại (chỉ hiển thị, không in lên ảnh)</span>
        {dialog.map((line, index) => (
          <div className="row" key={index}>
            <input
              className="speaker"
              placeholder="Người nói"
              value={line.speaker}
              onChange={(event) => updateLine(index, { speaker: event.target.value })}
            />
            <input placeholder="Lời thoại" value={line.text} onChange={(event) => updateLine(index, { text: event.target.value })} />
            <button
              type="button"
              className="ghost small"
              aria-label="Xoá dòng thoại"
              onClick={() => setDialog(dialog.filter((_, position) => position !== index))}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="ghost small" onClick={() => setDialog([...dialog, { speaker: "", text: "" }])}>
          Thêm dòng thoại
        </button>
      </div>
      <div className="row wrap">
        <button type="button" className="small" onClick={generate} disabled={active}>
          {panel.image_asset_id ? "Sinh lại" : "Sinh ảnh"}
        </button>
        {active ? (
          <button type="button" className="ghost small" onClick={cancel}>
            Hủy
          </button>
        ) : null}
        {panel.generation_status === "failed" ? (
          <button type="button" className="ghost small" onClick={retry}>
            Retry
          </button>
        ) : null}
        <button type="button" className="ghost small" onClick={save}>
          Lưu
        </button>
        <button type="button" className="ghost small" onClick={() => onMove(-1)} disabled={isFirst} aria-label="Đưa panel lên trước">
          ←
        </button>
        <button type="button" className="ghost small" onClick={() => onMove(1)} disabled={isLast} aria-label="Đưa panel ra sau">
          →
        </button>
        <button type="button" className="ghost small" onClick={remove} disabled={active}>
          Xoá
        </button>
      </div>
    </article>
  );
}
