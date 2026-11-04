import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test("official MCP client discovers tools over stdio", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wonderlab-stdio-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "mcp/server.ts"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      MODEL_API_KEY: "",
      WONDERLAB_OUTPUT_DIR: root,
      WONDERLAB_INPUT_ROOT: root,
    } as Record<string, string>,
    stderr: "pipe",
  });
  const client = new Client({ name: "wonderlab-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const list = await client.listTools();
    assert.ok(list.tools.some((t) => t.name === "create_visualization"));
    const examples = await client.callTool({
      name: "list_examples",
      arguments: {},
    });
    assert.ok(!examples.isError);
    assert.ok((examples.structuredContent as any).examples.length >= 3);
  } finally {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("HTTP transport enforces auth and origin, then supports a real SDK handshake", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wonderlab-http-")),
    token = randomBytes(24).toString("hex");
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "mcp/server.ts", "--http"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MODEL_API_KEY: "",
        WONDERLAB_MCP_TOKEN: token,
        WONDERLAB_MCP_PORT: String(port),
        WONDERLAB_OUTPUT_DIR: root,
        WONDERLAB_INPUT_ROOT: root,
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  const client = new Client({ name: "wonderlab-http-test", version: "1.0.0" });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Server did not start")),
        10000,
      );
      child.stderr.on("data", (d) => {
        if (String(d).includes("listening")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Server exited early"));
      });
    });
    const url = `http://127.0.0.1:${port}/mcp`;
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            Origin: "https://untrusted.example",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    assert.equal((await client.listTools()).tools.length, 5);
    const call = await client.callTool({
      name: "list_examples",
      arguments: {},
    });
    assert.ok(!call.isError);
  } finally {
    await client.close().catch(() => {});
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise<void>((r) => child.once("exit", () => r()));
      child.kill("SIGTERM");
      await stopped;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});
