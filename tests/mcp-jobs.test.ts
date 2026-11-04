import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Jobs } from "../mcp/jobs";
import { examples } from "../lib/wonderlab/examples";
import type { Scene } from "../lib/wonderlab/scene";

test("jobs are asynchronous, idempotent, concurrency-limited, and persistent", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wonderlab-jobs-"));
  let finish!: (s: Scene) => void;
  try {
    const jobs = await Jobs.open({
      root: path.join(root, "jobs"),
      inputRoot: root,
      generate: async (_input, _image, progress) => {
        progress("Testing generation");
        return new Promise((resolve) => (finish = resolve));
      },
    });
    const input = {
      prompt: "Explain a pendulum",
      mode: "3d" as const,
      request_key: "repeat-safe",
    };
    const first = await jobs.create(input);
    assert.ok(["queued", "running"].includes(first.status));
    const retry = await jobs.create(input);
    assert.equal(retry.job_id, first.job_id);
    await assert.rejects(
      () => jobs.create({ ...input, prompt: "Different prompt" }),
      /different inputs/,
    );
    await assert.rejects(
      () => jobs.create({ ...input, request_key: "second" }),
      /already running/,
    );
    for (let i = 0; i < 100 && !finish; i++)
      await new Promise((r) => setTimeout(r, 5));
    finish(examples[1].scene);
    for (
      let i = 0;
      i < 200 && jobs.get(first.job_id).status !== "completed";
      i++
    )
      await new Promise((r) => setTimeout(r, 5));
    assert.equal(jobs.get(first.job_id).status, "completed");
    const file = JSON.parse(
      await fs.readFile(jobs.artifactPath(first.job_id), "utf8"),
    );
    assert.equal(file.scene.title, examples[1].title);
    // Wait for status persistence before reopening the same store.
    for (let i = 0; i < 100; i++) {
      const saved = JSON.parse(
        await fs.readFile(
          path.join(root, "jobs", first.job_id, "status.json"),
          "utf8",
        ),
      );
      if (saved.status === "completed") break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const reopened = await Jobs.open({
      root: path.join(root, "jobs"),
      inputRoot: root,
    });
    assert.equal(reopened.get(first.job_id).status, "completed");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("image inputs cannot escape their allowed directory, including symlinks", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wonderlab-input-"));
  await fs.mkdir(path.join(root, "input"));
  try {
    await fs.writeFile(
      path.join(root, "outside.png"),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    await fs.symlink(
      path.join(root, "outside.png"),
      path.join(root, "input", "link.png"),
    );
    const jobs = await Jobs.open({
      root: path.join(root, "jobs"),
      inputRoot: path.join(root, "input"),
    });
    await assert.rejects(
      () => jobs.readImage({ image_path: "../outside.png" }),
      /outside/,
    );
    await assert.rejects(
      () => jobs.readImage({ image_path: "link.png" }),
      /outside/,
    );
    await fs.writeFile(path.join(root, "input", "fake.png"), "not an image");
    await assert.rejects(
      () => jobs.readImage({ image_path: "fake.png" }),
      /must contain/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("server restart marks unfinished jobs interrupted instead of replaying paid calls", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wonderlab-restart-")),
    id = randomUUID();
  try {
    await fs.mkdir(path.join(root, id));
    await fs.writeFile(
      path.join(root, id, "status.json"),
      JSON.stringify({
        id,
        status: "running",
        stage: "Painting",
        mode: "cutaway",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        input_hash: "test",
      }),
    );
    const jobs = await Jobs.open({ root, inputRoot: root });
    assert.equal(jobs.get(id).status, "failed");
    assert.match(jobs.get(id).error!, /server stopped/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
