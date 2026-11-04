import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { generateCutaway, planCutaway } from "../lib/wonderlab/cutaway";
import { generateScene } from "../lib/wonderlab/meta";
import { initialValues, type Scene } from "../lib/wonderlab/scene";

export type GenerationInput = {
  prompt: string;
  mode: "cutaway" | "3d";
  image_path?: string;
  image_data_url?: string;
  request_key?: string;
};
export type Job = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  mode: "cutaway" | "3d";
  created_at: string;
  updated_at: string;
  request_key?: string;
  input_hash: string;
  error?: string;
  title?: string;
  components?: number;
  phases?: number;
  bytes?: number;
};
type Generate = (
  input: GenerationInput,
  image: string | null,
  progress: (stage: string) => void,
) => Promise<Scene>;
const validId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export class Jobs {
  readonly jobs = new Map<string, Job>();
  private active: string | null = null;
  private writes: Promise<void> = Promise.resolve();
  private constructor(
    readonly root: string,
    readonly inputRoot: string,
    private key: string,
    private generate: Generate,
    readonly publicUrl?: string,
  ) {}
  static async open(options: {
    root: string;
    inputRoot: string;
    key?: string;
    publicUrl?: string;
    generate?: Generate;
  }) {
    await fs.mkdir(options.root, { recursive: true, mode: 0o700 });
    const root = await fs.realpath(options.root),
      inputRoot = await fs.realpath(options.inputRoot),
      key = options.key || "";
    const generate: Generate =
      options.generate ||
      ((input, image, progress) =>
        input.mode === "cutaway"
          ? generateCutaway(image, input.prompt, key, progress)
          : generateScene(image, input.prompt, key));
    const store = new Jobs(root, inputRoot, key, generate, options.publicUrl);
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !validId.test(entry.name)) continue;
      try {
        const job = JSON.parse(
          await fs.readFile(path.join(root, entry.name, "status.json"), "utf8"),
        ) as Job;
        if (job.id !== entry.name) continue;
        if (job.status === "queued" || job.status === "running") {
          job.status = "failed";
          job.stage = "Interrupted";
          job.error =
            "The server stopped before this job finished. Submit a new request key to retry.";
          await store.persist(job);
        }
        store.jobs.set(job.id, job);
      } catch {
        /* An incomplete directory is not a runnable job. */
      }
    }
    return store;
  }
  async readImage(
    input: Pick<GenerationInput, "image_path" | "image_data_url">,
  ) {
    if (input.image_path && input.image_data_url)
      throw new Error("Provide image_path or image_data_url, not both.");
    if (input.image_data_url) {
      if (
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
          input.image_data_url,
        ) ||
        input.image_data_url.length > 5_500_000
      )
        throw new Error("Use a JPG, PNG, or WebP data URL below 5.5 MB.");
      return input.image_data_url;
    }
    if (!input.image_path) return null;
    const requested = path.resolve(this.inputRoot, input.image_path);
    const candidate = path.relative(this.inputRoot, requested);
    if (
      candidate === ".." ||
      candidate.startsWith(".." + path.sep) ||
      path.isAbsolute(candidate)
    )
      throw new Error("Image path is outside WONDERLAB_INPUT_ROOT.");
    const real = await fs.realpath(requested);
    const relative = path.relative(this.inputRoot, real);
    if (
      relative.startsWith(".." + path.sep) ||
      relative === ".." ||
      path.isAbsolute(relative)
    )
      throw new Error("Image path is outside WONDERLAB_INPUT_ROOT.");
    const stat = await fs.stat(real);
    if (!stat.isFile() || stat.size > 4_000_000)
      throw new Error("Choose an image file smaller than 4 MB.");
    const bytes = await fs.readFile(real);
    const mime = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "png"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "jpeg"
        : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP"
          ? "webp"
          : null;
    if (!mime)
      throw new Error("The file must contain a JPG, PNG, or WebP image.");
    return `data:image/${mime};base64,${bytes.toString("base64")}`;
  }
  private persist(job: Job) {
    const snapshot = JSON.stringify(job, null, 2),
      folder = path.join(this.root, job.id);
    this.writes = this.writes
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(folder, { recursive: true, mode: 0o700 });
        const tmp = path.join(folder, "status.tmp");
        await fs.writeFile(tmp, snapshot, { mode: 0o600 });
        await fs.rename(tmp, path.join(folder, "status.json"));
      });
    return this.writes;
  }
  async plan(
    input: Pick<GenerationInput, "prompt" | "image_path" | "image_data_url">,
  ) {
    return planCutaway(await this.readImage(input), input.prompt, this.key);
  }
  async create(input: GenerationInput) {
    const image = await this.readImage(input),
      hash = createHash("sha256")
        .update(
          JSON.stringify({ prompt: input.prompt, mode: input.mode, image }),
        )
        .digest("hex");
    if (input.request_key) {
      const prior = [...this.jobs.values()].find(
        (j) => j.request_key === input.request_key,
      );
      if (prior) {
        if (prior.input_hash !== hash)
          throw new Error(
            "This request_key was already used for different inputs.",
          );
        return this.summary(prior);
      }
    }
    if (this.active)
      throw new Error(
        `Generation is already running. Check job ${this.active} before starting another.`,
      );
    const now = new Date().toISOString(),
      job: Job = {
        id: randomUUID(),
        status: "queued",
        stage: "Queued",
        mode: input.mode,
        created_at: now,
        updated_at: now,
        request_key: input.request_key,
        input_hash: hash,
      };
    this.active = job.id;
    this.jobs.set(job.id, job);
    try {
      await this.persist(job);
    } catch {
      this.active = null;
      this.jobs.delete(job.id);
      throw new Error("Could not write the job to the output directory.");
    }
    void this.run(job, input, image);
    return this.summary(job);
  }
  private async run(job: Job, input: GenerationInput, image: string | null) {
    try {
      job.status = "running";
      job.stage = "Generating";
      await this.persist(job);
      const scene = await this.generate(input, image, (stage) => {
        job.stage = stage;
        job.updated_at = new Date().toISOString();
        void this.persist(job).catch(() => {});
      });
      const artifact = {
        scene,
        values: initialValues(scene),
        provenance: {
          model:
            input.mode === "cutaway"
              ? "muse-wonder-1.0 + muse-image-1.0"
              : "muse-wonder-1.0",
          generatedAt: new Date().toISOString(),
          elapsedMs: Date.now() - Date.parse(job.created_at),
        },
      };
      const body = JSON.stringify(artifact),
        destination = this.artifactPath(job.id);
      await fs.writeFile(destination + ".tmp", body, { mode: 0o600 });
      await fs.rename(destination + ".tmp", destination);
      const finished: Job = {
        ...job,
        status: "completed",
        stage: "Ready",
        title: scene.title,
        components: scene.nodes.length,
        phases: scene.cutaway?.phases.length || 0,
        bytes: Buffer.byteLength(body),
        updated_at: new Date().toISOString(),
      };
      await this.persist(finished);
      Object.assign(job, finished);
      if (this.active === job.id) this.active = null;
    } catch (e) {
      job.status = "failed";
      job.stage = "Failed";
      job.error = e instanceof Error ? e.message : "Generation failed.";
      if (this.key) job.error = job.error.replaceAll(this.key, "[redacted]");
    } finally {
      job.updated_at = new Date().toISOString();
      try {
        await this.persist(job);
      } catch {
        job.status = "failed";
        job.error = "Could not persist the result status.";
      }
      if (this.active === job.id) this.active = null;
    }
  }
  get(id: string) {
    if (!validId.test(id)) throw new Error("Invalid job ID.");
    const job = this.jobs.get(id);
    if (!job) throw new Error("Job not found.");
    return job;
  }
  artifactPath(id: string) {
    if (!validId.test(id)) throw new Error("Invalid job ID.");
    return path.join(this.root, id, "project.json");
  }
  summary(job: Job) {
    return {
      job_id: job.id,
      status: job.status,
      stage: job.stage,
      mode: job.mode,
      created_at: job.created_at,
      updated_at: job.updated_at,
      title: job.title,
      components: job.components,
      phases: job.phases,
      error: job.error,
      ...(job.status === "completed"
        ? {
            artifact_path: this.artifactPath(job.id),
            download_url: this.publicUrl
              ? `${this.publicUrl.replace(/\/$/, "")}/artifacts/${job.id}`
              : undefined,
            bytes: job.bytes,
            open_in: "Open project in WonderLab; select this JSON file.",
          }
        : { poll_after_ms: 3000 }),
    };
  }
}
