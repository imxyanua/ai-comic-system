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

async function call(method, path, { token, body, expect = [200] } = {}) {
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
  for (let attempt = 0; attempt < 30; attempt += 1) {
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

  await step("delete panel and scene", async () => {
    await call("DELETE", `/panels/${panels[2].id}`, { token: owner, expect: [204] });
    await call("DELETE", `/scenes/${sceneB.id}`, { token: owner, expect: [204] });
    const scenes = (await call("GET", `/comics/${comic.id}/scenes`, { token: owner })).json;
    assert(scenes.length === 1, "scene was not deleted");
    const remaining = (await call("GET", `/scenes/${sceneA.id}/panels`, { token: owner })).json;
    assert(remaining.length === 2, "panel was not deleted");
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
