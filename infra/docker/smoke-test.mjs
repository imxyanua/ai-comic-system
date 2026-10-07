// End-to-end checks against the Compose stack with the mock worker.
const API = process.env.API_BASE_URL ?? "http://localhost:3000";
const WEB = process.env.WEB_URL ?? "http://localhost:5173";
const PNG_SIGNATURE = "89504e470d0a1a0a";

let failures = 0;

async function step(name, run) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
    throw error;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // stack still starting
    }
    await sleep(2000);
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function call(method, path, { token, body, expect = method === "POST" ? [200, 201] : [200] } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  assert(expect.includes(response.status), `${method} ${path} returned ${response.status}: ${text}`);
  return { status: response.status, json };
}

async function registerUser(label) {
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const password = "smoke-password";
  await call("POST", "/auth/register", { body: { email, password } });
  const { json } = await call("POST", "/auth/login", { body: { email, password } });
  return json.access_token;
}

async function waitForJob(token, jobId) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const { json } = await call("GET", `/jobs/${jobId}`, { token });
    if (["succeeded", "failed", "cancelled"].includes(json.status)) {
      return json;
    }
    await sleep(2000);
  }
  throw new Error(`job ${jobId} did not finish`);
}

async function downloadAsset(token, assetId) {
  const { json } = await call("GET", `/assets/${assetId}`, { token });
  assert(json.download_url, `asset ${assetId} has no download_url`);
  const response = await fetch(json.download_url);
  assert(response.ok, `download returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await waitFor(`${API}/health`);
  await waitFor(WEB);

  const owner = await registerUser("owner");
  const stranger = await registerUser("stranger");
  let comic;
  let sceneA;
  let sceneB;
  let panels = [];

  await step("comic CRUD", async () => {
    comic = (await call("POST", "/comics", { token: owner, body: { title: "Smoke", style_guide: "ink" } })).json;
    const patched = (
      await call("PATCH", `/comics/${comic.id}`, {
        token: owner,
        body: { title: "Smoke renamed", description: "mô tả", status: "active" },
      })
    ).json;
    assert(patched.title === "Smoke renamed" && patched.status === "active", "PATCH comic did not apply");
    const fetched = (await call("GET", `/comics/${comic.id}`, { token: owner })).json;
    assert(fetched.description === "mô tả", "GET comic did not return the update");
  });

  await step("comics are isolated per owner", async () => {
    await call("GET", `/comics/${comic.id}`, { token: stranger, expect: [404] });
    await call("PATCH", `/comics/${comic.id}`, { token: stranger, body: { title: "x" }, expect: [404] });
    const list = (await call("GET", "/comics", { token: stranger })).json;
    assert(!list.some((item) => item.id === comic.id), "stranger sees the owner's comic");
  });

  await step("story GET and PUT", async () => {
    const initial = (await call("GET", `/comics/${comic.id}/story`, { token: owner })).json;
    assert(initial.comic_id === comic.id, "story not created with comic");
    const saved = (
      await call("PUT", `/comics/${comic.id}/story`, {
        token: owner,
        body: { title: "Arc 1", synopsis: "tóm tắt", content: "ghi chú" },
      })
    ).json;
    assert(saved.title === "Arc 1" && saved.content === "ghi chú", "PUT story did not apply");
  });

  await step("character CRUD", async () => {
    const hero = (
      await call("POST", `/comics/${comic.id}/characters`, { token: owner, body: { name: "An", description: "áo đỏ" } })
    ).json;
    const extra = (
      await call("POST", `/comics/${comic.id}/characters`, { token: owner, body: { name: "Tạm", description: "" } })
    ).json;
    await call("PATCH", `/characters/${hero.id}`, { token: owner, body: { description: "áo đỏ, tóc ngắn" } });
    await call("DELETE", `/characters/${extra.id}`, { token: owner, expect: [204] });
    await call("PATCH", `/characters/${hero.id}`, { token: stranger, body: { name: "x" }, expect: [404] });
    const list = (await call("GET", `/comics/${comic.id}/characters`, { token: owner })).json;
    assert(list.length === 1 && list[0].description === "áo đỏ, tóc ngắn", "character list is wrong");
  });

  await step("character reference upload with presign", async () => {
    const hero = (await call("GET", `/comics/${comic.id}/characters`, { token: owner })).json[0];
    const image = Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
        "1f15c4890000000d49444154789c63f8cfc0f01f0005000201a5f4d6e30000000049454e44ae426082",
      "hex",
    );
    await call("POST", `/comics/${comic.id}/assets/upload-url`, {
      token: owner,
      body: { filename: "a.txt", mime_type: "text/plain", kind: "character_ref", size_bytes: 10 },
      expect: [400],
    });
    await call("POST", `/comics/${comic.id}/assets/upload-url`, {
      token: owner,
      body: { filename: "big.png", mime_type: "image/png", kind: "character_ref", size_bytes: 6 * 1024 * 1024 },
      expect: [400],
    });
    const upload = (
      await call("POST", `/comics/${comic.id}/assets/upload-url`, {
        token: owner,
        body: { filename: "an.png", mime_type: "image/png", kind: "character_ref", size_bytes: image.length },
      })
    ).json;
    await call("POST", `/assets/${upload.asset_id}/complete`, { token: owner, expect: [400] });
    await call("PATCH", `/characters/${hero.id}`, {
      token: owner,
      body: { reference_asset_id: upload.asset_id },
      expect: [400],
    });
    const put = await fetch(upload.upload_url, { method: "PUT", headers: upload.headers, body: image });
    assert(put.ok, `presigned PUT returned ${put.status}: ${await put.text()}`);
    const ready = (await call("POST", `/assets/${upload.asset_id}/complete`, { token: owner })).json;
    assert(ready.status === "ready" && ready.size_bytes === image.length, "asset not ready after upload");
    const linked = (
      await call("PATCH", `/characters/${hero.id}`, { token: owner, body: { reference_asset_id: upload.asset_id } })
    ).json;
    assert(linked.reference_asset_id === upload.asset_id, "character not linked to the reference");
    await call("GET", `/assets/${upload.asset_id}`, { token: stranger, expect: [404] });
    const downloaded = await downloadAsset(owner, upload.asset_id);
    assert(downloaded.equals(image), "downloaded reference differs from the upload");
  });

  await step("scene CRUD", async () => {
    sceneA = (await call("POST", `/comics/${comic.id}/scenes`, { token: owner, body: { summary: "phố sau mưa" } })).json;
    sceneB = (await call("POST", `/comics/${comic.id}/scenes`, { token: owner, body: { title: "B" } })).json;
    await call("PATCH", `/scenes/${sceneB.id}`, { token: owner, body: { summary: "mái nhà" } });
    await call("PATCH", `/scenes/${sceneB.id}`, { token: owner, body: { sort_order: sceneA.sort_order }, expect: [409] });
    const list = (await call("GET", `/comics/${comic.id}/scenes`, { token: owner })).json;
    assert(list.map((scene) => scene.id).join() === [sceneA.id, sceneB.id].join(), "scene order is wrong");
    assert(list[1].summary === "mái nhà", "scene PATCH did not apply");
  });

  await step("panel CRUD with dialog and reorder", async () => {
    for (const label of ["one", "two", "three"]) {
      const { json } = await call("POST", `/scenes/${sceneA.id}/panels`, {
        token: owner,
        body: { dialog: [{ speaker: "An", text: `câu ${label}` }] },
      });
      panels.push(json);
    }
    await call("PATCH", `/panels/${panels[0].id}`, {
      token: owner,
      body: {
        negative_prompt: "blurry",
        dialog: [
          { speaker: "narrator", text: "Đêm." },
          { speaker: "An", text: "Ai đó?" },
        ],
      },
    });
    const order = [panels[2].id, panels[0].id, panels[1].id];
    await call("PUT", `/scenes/${sceneA.id}/panel-order`, { token: owner, body: { panel_ids: order } });
    await call("PUT", `/scenes/${sceneA.id}/panel-order`, {
      token: owner,
      body: { panel_ids: order.slice(1) },
      expect: [400],
    });
    const list = (await call("GET", `/scenes/${sceneA.id}/panels`, { token: owner })).json;
    assert(list.map((panel) => panel.id).join() === order.join(), "panel reorder did not apply");
    assert(list[1].dialog.map((line) => line.text).join("|") === "Đêm.|Ai đó?", "dialog PATCH did not apply");
    panels = list;
  });

  await step("generate one panel with the mock worker", async () => {
    const generated = await call("POST", `/panels/${panels[0].id}/generate`, { token: owner, body: {}, expect: [202] });
    const job = await waitForJob(owner, generated.json.job_id);
    assert(job.status === "succeeded", `job ended as ${job.status}: ${job.error_message}`);
    const image = await downloadAsset(owner, job.result_asset_id);
    assert(image.subarray(0, 8).toString("hex") === PNG_SIGNATURE, "downloaded file is not a PNG");
    const list = (await call("GET", `/scenes/${sceneA.id}/panels`, { token: owner })).json;
    assert(list[0].generation_status === "succeeded", "panel status is not succeeded");
    assert(list[0].image_asset_id === job.result_asset_id, "panel does not point to the new image");
    const history = (await call("GET", `/panels/${panels[0].id}/jobs`, { token: owner })).json;
    assert(history.length === 1 && history[0].attempt === 1, "job history is wrong");
  });

  const createPanel = async (prompt) =>
    (await call("POST", `/scenes/${sceneA.id}/panels`, { token: owner, body: { image_prompt: prompt } })).json;
  const getPanel = async (panelId) =>
    (await call("GET", `/scenes/${sceneA.id}/panels`, { token: owner })).json.find((panel) => panel.id === panelId);

  await step("regenerate keeps the old image until the new job succeeds", async () => {
    const before = await getPanel(panels[0].id);
    await call("PATCH", `/panels/${panels[0].id}`, { token: owner, body: { image_prompt: "[mock:slow] mưa to hơn" } });
    const regenerated = await call("POST", `/panels/${panels[0].id}/generate`, { token: owner, body: {}, expect: [202] });
    const during = await getPanel(panels[0].id);
    assert(["queued", "running"].includes(during.generation_status), `panel status is ${during.generation_status}`);
    assert(during.image_asset_id === before.image_asset_id, "old image was replaced before the new job finished");
    const repeat = await call("POST", `/panels/${panels[0].id}/generate`, {
      token: owner,
      body: { seed: 1 },
      expect: [409],
    });
    assert(repeat.json.error.code === "CONFLICT", "second job with other params was not rejected");
    const job = await waitForJob(owner, regenerated.json.job_id);
    assert(job.status === "succeeded", `regenerate ended as ${job.status}`);
    const after = await getPanel(panels[0].id);
    assert(after.image_asset_id === job.result_asset_id && after.image_asset_id !== before.image_asset_id, "new image not attached");
    const history = (await call("GET", `/panels/${panels[0].id}/jobs`, { token: owner })).json;
    assert(history.length === 2, `expected 2 jobs, got ${history.length}`);
  });

  await step("cancel a queued job", async () => {
    const busy = await createPanel("[mock:slow] worker bận");
    const waiting = await createPanel("chờ tới lượt");
    const busyJob = (await call("POST", `/panels/${busy.id}/generate`, { token: owner, body: {}, expect: [202] })).json;
    const waitingJob = (await call("POST", `/panels/${waiting.id}/generate`, { token: owner, body: {}, expect: [202] })).json;
    const cancelled = (await call("POST", `/jobs/${waitingJob.job_id}/cancel`, { token: owner })).json;
    assert(cancelled.status === "cancelled", `cancel returned ${cancelled.status}`);
    assert((await getPanel(waiting.id)).generation_status === "cancelled", "panel not cancelled");
    await call("POST", `/jobs/${waitingJob.job_id}/cancel`, { token: owner, expect: [409] });
    assert((await waitForJob(owner, busyJob.job_id)).status === "succeeded", "busy job did not succeed");
    await sleep(4000);
    const after = (await call("GET", `/jobs/${waitingJob.job_id}`, { token: owner })).json;
    assert(after.status === "cancelled", `cancelled job became ${after.status}`);
    const panel = await getPanel(waiting.id);
    assert(panel.generation_status === "cancelled" && panel.image_asset_id === null, "cancelled job still attached an image");
  });

  await step("retry a failed job creates a new attempt", async () => {
    const panel = await createPanel("[mock:fail] bão");
    const first = (await call("POST", `/panels/${panel.id}/generate`, { token: owner, body: {}, expect: [202] })).json;
    const failed = await waitForJob(owner, first.job_id);
    assert(failed.status === "failed" && failed.error_code === "MOCK_FAILURE", `first job ended as ${failed.status}`);
    assert((await getPanel(panel.id)).generation_status === "failed", "panel not failed");
    const retried = (await call("POST", `/jobs/${first.job_id}/retry`, { token: owner, expect: [202] })).json;
    assert(retried.job_id !== first.job_id, "retry reused the old job");
    const second = await waitForJob(owner, retried.job_id);
    assert(second.attempt === 2, `retry attempt is ${second.attempt}`);
    const original = (await call("GET", `/jobs/${first.job_id}`, { token: owner })).json;
    assert(original.status === "failed", "old job changed after retry");
    const succeededJob = (await call("GET", `/panels/${panels[0].id}/jobs`, { token: owner })).json[0];
    await call("POST", `/jobs/${succeededJob.job_id}/retry`, { token: owner, expect: [409] });
  });

  const waitForWorkflow = async (workflowId) => {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      const { json } = await call("GET", `/workflows/${workflowId}`, { token: owner });
      if (json.status !== "running") {
        return json;
      }
      await sleep(2000);
    }
    throw new Error(`workflow ${workflowId} did not finish`);
  };
  const createScene = async (summary) =>
    (await call("POST", `/comics/${comic.id}/scenes`, { token: owner, body: { summary } })).json;
  const addPanel = async (sceneId, prompt) =>
    (await call("POST", `/scenes/${sceneId}/panels`, { token: owner, body: { image_prompt: prompt } })).json;
  const startBatch = (sceneIds, expect = [202]) =>
    call("POST", `/comics/${comic.id}/workflows/batch-panel-images`, {
      token: owner,
      body: { scene_ids: sceneIds },
      expect,
    });

  await step("batch with one failing panel ends completed_with_errors", async () => {
    const scene = await createScene("batch");
    const good = await addPanel(scene.id, "trời quang");
    const bad = await addPanel(scene.id, "[mock:fail] sấm");
    const started = (await startBatch([scene.id])).json;
    assert(started.total === 2, `batch total is ${started.total}`);
    await call("GET", `/workflows/${started.workflow_id}`, { token: stranger, expect: [404] });
    const done = await waitForWorkflow(started.workflow_id);
    assert(done.status === "completed_with_errors", `workflow ended as ${done.status}`);
    assert(done.succeeded === 1 && done.failed === 1 && done.pending === 0, `counts ${JSON.stringify(done)}`);
    assert(done.current_step === "finished", `current_step is ${done.current_step}`);
    const panelsAfter = (await call("GET", `/scenes/${scene.id}/panels`, { token: owner })).json;
    const goodAfter = panelsAfter.find((panel) => panel.id === good.id);
    const badAfter = panelsAfter.find((panel) => panel.id === bad.id);
    assert(goodAfter.generation_status === "succeeded" && goodAfter.image_asset_id, "good panel has no image");
    assert(badAfter.generation_status === "failed" && !badAfter.image_asset_id, "failed panel has an image");
    const image = await downloadAsset(owner, goodAfter.image_asset_id);
    assert(image.subarray(0, 8).toString("hex") === PNG_SIGNATURE, "batch image is not a PNG");
    const goodJobs = (await call("GET", `/panels/${good.id}/jobs`, { token: owner })).json;
    assert(goodJobs[0].workflow_run_id === started.workflow_id, "job not linked to the workflow");
  });

  await step("batch rejects foreign or empty scenes", async () => {
    const foreignComic = (await call("POST", "/comics", { token: stranger, body: { title: "Khác" } })).json;
    const foreignScene = (
      await call("POST", `/comics/${foreignComic.id}/scenes`, { token: stranger, body: { summary: "x" } })
    ).json;
    await startBatch([foreignScene.id], [400]);
    const empty = await createScene("trống");
    await startBatch([empty.id], [400]);
    await call("DELETE", `/scenes/${empty.id}`, { token: owner, expect: [204] });
  });

  await step("cancel a running batch", async () => {
    const scene = await createScene("batch hủy");
    await addPanel(scene.id, "[mock:slow] một");
    await addPanel(scene.id, "[mock:slow] hai");
    const started = (await startBatch([scene.id])).json;
    const cancelled = (await call("POST", `/workflows/${started.workflow_id}/cancel`, { token: owner })).json;
    assert(cancelled.status === "cancelled" && cancelled.cancelled === 2, `cancel returned ${JSON.stringify(cancelled)}`);
    await call("POST", `/workflows/${started.workflow_id}/cancel`, { token: owner, expect: [409] });
    await sleep(9000);
    const after = (await call("GET", `/workflows/${started.workflow_id}`, { token: owner })).json;
    assert(after.status === "cancelled" && after.cancelled === 2, `workflow became ${JSON.stringify(after)}`);
    const panelsAfter = (await call("GET", `/scenes/${scene.id}/panels`, { token: owner })).json;
    assert(
      panelsAfter.every((panel) => panel.generation_status === "cancelled" && panel.image_asset_id === null),
      "a cancelled batch panel received an image",
    );
  });

  await step("delete panel and scene", async () => {
    const before = (await call("GET", `/scenes/${sceneA.id}/panels`, { token: owner })).json.length;
    await call("DELETE", `/panels/${panels[2].id}`, { token: owner, expect: [204] });
    await call("DELETE", `/scenes/${sceneB.id}`, { token: owner, expect: [204] });
    const scenes = (await call("GET", `/comics/${comic.id}/scenes`, { token: owner })).json;
    assert(scenes.length === 1, "scene was not deleted");
    const remaining = (await call("GET", `/scenes/${sceneA.id}/panels`, { token: owner })).json;
    assert(remaining.length === before - 1, "panel was not deleted");
  });

  await step("archive hides the comic from the list", async () => {
    const archived = (await call("DELETE", `/comics/${comic.id}`, { token: owner })).json;
    assert(archived.status === "archived", "comic not archived");
    const list = (await call("GET", "/comics", { token: owner })).json;
    assert(!list.some((item) => item.id === comic.id), "archived comic still listed");
  });

  console.log("smoke test passed");
}

main().catch((error) => {
  if (failures === 0) {
    console.log(`smoke test aborted: ${error.message}`);
  }
  process.exit(1);
});
