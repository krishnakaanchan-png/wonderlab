import { PublicError } from "./meta";

export async function readBody(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new PublicError("Cross-origin requests are not accepted.", 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new PublicError("Expected JSON.", 415);
  const limit = 6_000_000;
  if (Number(request.headers.get("content-length")) > limit)
    throw new PublicError(
      "The image is too large. Please choose a smaller image.",
      413,
    );
  const reader = request.body?.getReader();
  if (!reader) throw new PublicError("Missing request.", 400);
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new PublicError("The image is too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PublicError("Invalid request.", 400);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof PublicError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && /Timeout|Abort/.test(error.name))
    return Response.json(
      {
        error:
          "The model took too long. Please retry; your picture is still here.",
      },
      { status: 504 },
    );
  console.error(
    "WonderLab request rejected:",
    error instanceof Error ? error.name : "unknown",
  );
  return Response.json(
    {
      error:
        "We could not process this request. Check your input and try again.",
    },
    { status: 400 },
  );
}

// Local/owner-private MVP protection. Public deployment needs a durable rate limiter.
const calls = new Map<string, number[]>();
export function checkRate(request: Request) {
  const who =
    request.headers.get("oai-authenticated-user-id") ||
    request.headers.get("cf-connecting-ip") ||
    "local";
  const now = Date.now();
  if (calls.size > 1000)
    for (const [key, times] of calls)
      if (times.every((t) => now - t >= 60000)) calls.delete(key);
  const recent = (calls.get(who) || []).filter((t) => now - t < 60000);
  if (recent.length >= 12)
    throw new PublicError(
      "Please wait a moment before making another request.",
      429,
    );
  calls.set(who, [...recent, now]);
}
