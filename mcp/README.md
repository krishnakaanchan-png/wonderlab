# WonderLab MCP prototype

A standalone MCP service for custom agent workflows. It reuses the same Meta generation functions as the web app and writes a portable WonderLab project JSON. It is **not deployed at the hosted Site's `/mcp` path**. Run it alongside your agent or on your own Node server.

## Requirements

- Node.js 22.13+ and `npm install` from the project root.
- `MODEL_API_KEY` for Meta Model API. Read-only discovery works without a key.
- Official MCP SDK 1.32.2; protocol compatibility is tested at **2025-11-25**, over stdio and Streamable HTTP. 2026-only clients are not validated.

## Local stdio

```sh
# Run from the WonderLab project directory.
node --env-file=.dev.vars --import tsx mcp/server.ts
```

The server writes only MCP messages to stdout. Configure your agent's stdio transport with the project root as its working directory, `node` as command, and `--import`, `tsx`, `mcp/server.ts` as arguments. Supply MODEL_API_KEY through the client's environment/secret configuration, or add `--env-file=/absolute/path/to/.dev.vars` before `--import`.

Working example with the official MCP client:

```sh
# Discover tools (no paid model calls):
node --env-file=.dev.vars mcp/examples/client.mjs

# Generate a small 3D example, poll, and print the resulting artifact path:
node --env-file=.dev.vars mcp/examples/client.mjs --generate

# Generate a full illustrated animation instead:
WONDERLAB_MODE=cutaway node --env-file=.dev.vars mcp/examples/client.mjs --generate
```

Set `WONDERLAB_PROMPT` to override the example prompt and `WONDERLAB_IMAGE` to pass an image path.

## Authenticated HTTP

Set a separate long random `WONDERLAB_MCP_TOKEN` (at least 24 characters) in the server environment or an ignored env file. Then:

```sh
node --env-file=.dev.vars --import tsx mcp/server.ts --http
# Listens on http://127.0.0.1:4318/mcp
```

Use `Authorization: Bearer <WONDERLAB_MCP_TOKEN>` on MCP and artifact requests. A custom agent can use the official `StreamableHTTPClientTransport`:

```js
const transport = new StreamableHTTPClientTransport(
  new URL(process.env.WONDERLAB_MCP_URL),
  {
    requestInit: {
      headers: {
        Authorization: `Bearer ${process.env.WONDERLAB_MCP_TOKEN}`,
      },
    },
  },
);
await client.connect(transport);
```

For remote hosting, bind explicitly with `WONDERLAB_MCP_HOST`, terminate HTTPS at a trusted proxy, and set `WONDERLAB_PUBLIC_URL` to the service's public base URL. This is a single-tenant token model, not an OAuth or multi-user service. The allowed Origin list defaults to the public URL; set `WONDERLAB_ALLOWED_ORIGINS` to a comma-separated list of trusted browser origins only if needed. Server-to-server requests usually omit Origin.

## Tools

| Tool                   | Purpose                                                                 | Model/API usage                                               |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `list_examples`        | List examples and the studio URL                                        | None                                                          |
| `plan_animation`       | Interpret a concept/image and plan parts and stages                     | Muse Wonder                                                   |
| `create_visualization` | Start a background `cutaway` or `3d` job                                | Meta text models; cutaway also uses multiple Muse Image calls |
| `get_job`              | Poll stage/status and retrieve the result location                      | None                                                          |
| `get_manifest`         | Inspect parts, controls, stages, and assumptions without image payloads | None                                                          |

A typical workflow:

```js
const started = await client.callTool({
  name: "create_visualization",
  arguments: {
    prompt: "Explain the pumping cycle of this heart diagram.",
    mode: "cutaway",
    image_path: "inputs/heart.png",
    request_key: "lesson-42-heart-v1",
  },
});
const jobId = started.structuredContent.job_id;
// Poll get_job with {job_id: jobId} until completed or failed.
```

`request_key` makes retries idempotent: the same key and input return the same job. Reusing a key with changed input is rejected. Only one generation runs at a time, preventing accidental concurrent image-generation batches. Keep the server process alive while a job is running.

## Inputs and artifacts

- `image_path` is restricted to `WONDERLAB_INPUT_ROOT` (default: working directory), including protection against symlink escapes. JPG, PNG and WebP files must be under 4 MB.
- Remote agents may use `image_data_url` instead, under 5.5 MB. Do not provide both.
- Projects are saved under `WONDERLAB_OUTPUT_DIR` (default: `.wonderlab-artifacts/`). The directory is Git-ignored.
- Completed artifacts and status survive a restart. In-progress jobs become failed/interrupted; they are not silently replayed, because replaying would spend API credits.
- `get_job` returns an artifact path for stdio and also an authenticated `/artifacts/<job_id>` download URL in HTTP mode.
- Open the result with **Open project** in the hosted WonderLab studio. Import validates the scene and parameters before replacing the current project.
- The original uploaded image is not copied into the artifact; generated artwork and poses are included.

## Limits

The service does not control an already-open browser session. It generates project artifacts for downstream agents or the viewer. There is no distributed queue, multi-user access control, automatic retry after process failure, or OAuth. Outputs are educational illustrations, not validated scientific or medical simulations.

## Tests

```sh
npm run typecheck
npm run test:mcp
```

Tests cover real SDK discovery over both transports, missing-token and cross-origin rejection, asynchronous job completion, idempotency, concurrency, persistence, restart behavior, and image-path boundaries. A live Muse-backed job was also generated through the stdio example client and imported into the studio.
