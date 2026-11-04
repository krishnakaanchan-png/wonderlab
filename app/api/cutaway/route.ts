import { requireLiveGeneration } from "@/lib/wonderlab/demo-access";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { generateCutaway } from "@/lib/wonderlab/cutaway";
import { readBody, errorResponse, checkRate } from "@/lib/wonderlab/http";

const input = z
  .object({
    image: z
      .string()
      .max(5_500_000)
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
      .nullable(),
    brief: z.string().max(1200),
  })
  .refine((v) => v.image || v.brief.trim().length >= 5);
export async function POST(request: Request) {
  try {
    requireLiveGeneration(env as unknown as Record<string, unknown>);
    checkRate(request);
    const body = input.parse(await readBody(request));
    const key = (env as unknown as Record<string, string>).MODEL_API_KEY || "";
    if (!key)
      return Response.json(
        { error: "The Meta API key is not configured on this server." },
        { status: 503 },
      );
    const encoder = new TextEncoder();
    let cancelled = false;
    return new Response(
      new ReadableStream({
        async start(controller) {
          const send = (event: object) => {
            if (!cancelled)
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          };
          const started = Date.now();
          try {
            const scene = await generateCutaway(
              body.image,
              body.brief,
              key,
              (stage) => send({ stage }),
            );
            send({
              scene,
              meta: {
                model: "muse-wonder-1.0 + muse-image-1.0",
                elapsedMs: Date.now() - started,
                generatedAt: new Date().toISOString(),
              },
            });
          } catch (e) {
            const response = errorResponse(e);
            send((await response.json()) as object);
          } finally {
            if (!cancelled) controller.close();
          }
        },
        cancel() {
          cancelled = true;
        },
      }),
      {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
