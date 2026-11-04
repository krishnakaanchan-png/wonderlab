import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const client = new Client({
  name: "wonderlab-example-agent",
  version: "1.0.0",
});
const transport = process.env.WONDERLAB_MCP_URL
  ? new StreamableHTTPClientTransport(new URL(process.env.WONDERLAB_MCP_URL), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${process.env.WONDERLAB_MCP_TOKEN || ""}`,
        },
      },
    })
  : new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "mcp/server.ts"],
      cwd: root,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => v !== undefined),
      ),
      stderr: "inherit",
    });
try {
  await client.connect(transport);
  if (!process.argv.includes("--generate")) {
    console.log(
      (await client.listTools()).tools.map((t) => ({
        name: t.name,
        description: t.description,
      })),
    );
  } else {
    const prompt =
      process.env.WONDERLAB_PROMPT || "Explain how a simple pendulum works.";
    const started = await client.callTool({
      name: "create_visualization",
      arguments: {
        prompt,
        mode: process.env.WONDERLAB_MODE || "3d",
        request_key: randomUUID(),
        ...(process.env.WONDERLAB_IMAGE
          ? { image_path: process.env.WONDERLAB_IMAGE }
          : {}),
      },
    });
    if (started.isError) throw new Error(JSON.stringify(started.content));
    const { job_id } = started.structuredContent;
    let last = "";
    for (let i = 0; i < 240; i++) {
      const result = await client.callTool({
        name: "get_job",
        arguments: { job_id },
      });
      if (result.isError) throw new Error(JSON.stringify(result.content));
      const job = result.structuredContent;
      if (job.stage !== last) {
        console.log(job.stage);
        last = job.stage;
      }
      if (job.status === "completed") {
        console.log(JSON.stringify(job, null, 2));
        break;
      }
      if (job.status === "failed") throw new Error(job.error);
      if (i === 239)
        throw new Error(
          `Still running: ${job_id}. Keep the server running and resume polling.`,
        );
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
} finally {
  await client.close();
}
