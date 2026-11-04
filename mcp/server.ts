import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Jobs } from "./jobs";
import { examples } from "../lib/wonderlab/examples";

const httpMode = process.argv.includes("--http");
const port = Number(process.env.WONDERLAB_MCP_PORT || 4318),
  host = process.env.WONDERLAB_MCP_HOST || "127.0.0.1";
const token = process.env.WONDERLAB_MCP_TOKEN || "";
if (httpMode && token.length < 24)
  throw new Error(
    "HTTP mode requires WONDERLAB_MCP_TOKEN with at least 24 characters.",
  );
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid WONDERLAB_MCP_PORT.");
const publicUrl = httpMode
  ? process.env.WONDERLAB_PUBLIC_URL || `http://127.0.0.1:${port}`
  : undefined;
const jobs = await Jobs.open({
  root:
    process.env.WONDERLAB_OUTPUT_DIR ||
    path.join(process.cwd(), ".wonderlab-artifacts"),
  inputRoot: process.env.WONDERLAB_INPUT_ROOT || process.cwd(),
  key: process.env.MODEL_API_KEY,
  publicUrl,
});
const imageInput = {
  image_path: z
    .string()
    .max(2000)
    .optional()
    .describe(
      "Optional JPG/PNG/WebP file under WONDERLAB_INPUT_ROOT. Maximum 4 MB.",
    ),
  image_data_url: z
    .string()
    .max(5_500_000)
    .optional()
    .describe("Alternative to image_path: a base64 JPG/PNG/WebP data URL."),
};
const result = (value: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  structuredContent: value,
});
const safe = async (fn: () => Promise<Record<string, unknown>>) => {
  try {
    return result(await fn());
  } catch (e) {
    return {
      content: [
        {
          type: "text" as const,
          text: e instanceof Error ? e.message : "Tool failed.",
        },
      ],
      isError: true,
    };
  }
};
function makeServer() {
  const server = new McpServer(
    { name: "wonderlab", version: "0.2.0" },
    {
      instructions:
        "WonderLab creates educational animated cutaways and 3D scenes with Meta models. Start generation, poll its job ID, then retrieve the project JSON. Do not put image base64 into the model context when a local image_path is available. Results are illustrative, not verified scientific simulations.",
    },
  );
  server.registerTool(
    "list_examples",
    {
      description:
        "List saved WonderLab examples and their viewing URLs. Does not call a model.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      result({
        examples: examples.map((e) => ({
          id: e.id,
          title: e.title,
          category: e.category,
          kind: e.scene.cutaway ? "cutaway" : "3d",
          has_component_animation: !!e.scene.cutaway?.poses,
        })),
        viewer: "https://wonderlab-diagram-playground.firmtrail.chatgpt.site/",
      }),
  );
  server.registerTool(
    "plan_animation",
    {
      description:
        "Ask Muse Wonder to interpret a picture or concept and plan components and teaching stages. Calls the Meta API but does not generate images.",
      inputSchema: { prompt: z.string().min(5).max(1200), ...imageInput },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    (input) => safe(async () => ({ blueprint: await jobs.plan(input) })),
  );
  server.registerTool(
    "create_visualization",
    {
      description:
        "Start a background generation job. Returns a job ID immediately. Cutaway mode creates multiple images and may take several minutes; 3d mode is faster. Calls paid Meta APIs. Only one generation runs at a time. Use request_key to safely retry the same request without duplicate generation.",
      inputSchema: {
        prompt: z.string().min(5).max(1200),
        mode: z.enum(["cutaway", "3d"]).default("cutaway"),
        ...imageInput,
        request_key: z.string().min(1).max(100).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    (input) => safe(async () => jobs.create(input)),
  );
  server.registerTool(
    "get_job",
    {
      description:
        "Read job progress or the completed project artifact path/download URL. Does not return large image data or invoke models.",
      inputSchema: { job_id: z.string().uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ job_id }) => safe(async () => jobs.summary(jobs.get(job_id))),
  );
  server.registerTool(
    "get_manifest",
    {
      description:
        "Read a completed project’s components, controls, stages, and assumptions without loading its large image assets into the conversation.",
      inputSchema: { job_id: z.string().uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ job_id }) =>
      safe(async () => {
        const job = jobs.get(job_id);
        if (job.status !== "completed")
          throw new Error(
            "This job is not completed. Use get_job to check progress.",
          );
        const { scene } = JSON.parse(
          await fs.readFile(jobs.artifactPath(job_id), "utf8"),
        );
        return {
          job_id,
          title: scene.title,
          summary: scene.summary,
          components: scene.nodes.map((n: any) => ({
            id: n.id,
            label: n.label,
            explanation: n.explanation,
          })),
          controls: scene.controls,
          phases: scene.cutaway?.phases || [],
          assumptions: scene.assumptions,
          artifact_path: jobs.artifactPath(job_id),
        };
      }),
  );
  return server;
}

if (!httpMode) {
  await makeServer().connect(new StdioServerTransport());
} else {
  const allowedOrigins = new Set(
    (process.env.WONDERLAB_ALLOWED_ORIGINS || publicUrl!)
      .split(",")
      .map((s) => s.trim()),
  );
  const authorized = (request: IncomingMessage) => {
    const supplied = Buffer.from(request.headers.authorization || ""),
      expected = Buffer.from(`Bearer ${token}`);
    return (
      supplied.length === expected.length && timingSafeEqual(supplied, expected)
    );
  };
  const app = createServer(async (request, response) => {
    if (request.headers.origin && !allowedOrigins.has(request.headers.origin)) {
      response.writeHead(403).end("Origin not allowed");
      return;
    }
    if (!authorized(request)) {
      response
        .writeHead(401, {
          "WWW-Authenticate": "Bearer",
          "Content-Type": "application/json",
        })
        .end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    const pathname = new URL(request.url || "/", publicUrl!).pathname;
    if (pathname.startsWith("/artifacts/") && request.method === "GET") {
      try {
        const id = pathname.slice("/artifacts/".length),
          job = jobs.get(id);
        if (job.status !== "completed") {
          response.writeHead(409).end("Job is not completed");
          return;
        }
        const data = await fs.readFile(jobs.artifactPath(id));
        response
          .writeHead(200, {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="wonderlab-${id}.json"`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          })
          .end(data);
      } catch {
        response.writeHead(404).end("Artifact not found");
      }
      return;
    }
    if (pathname !== "/mcp") {
      response.writeHead(404).end("Not found");
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    const server = makeServer(),
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      let bytes = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        const data = Buffer.from(chunk);
        bytes += data.length;
        if (bytes > 6_000_000) {
          response.writeHead(413).end("Request too large");
          return;
        }
        chunks.push(data);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        response
          .writeHead(400, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: "Invalid JSON" },
            }),
          );
        return;
      }
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
    } catch {
      if (!response.headersSent)
        response
          .writeHead(500, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32603, message: "Internal server error" },
            }),
          );
    }
  });
  app.listen(port, host, () =>
    console.error(
      `WonderLab MCP listening on ${host}:${port}/mcp (authentication required)`,
    ),
  );
}
