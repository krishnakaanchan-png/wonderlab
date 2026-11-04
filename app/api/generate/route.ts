import { requireLiveGeneration } from "@/lib/wonderlab/demo-access";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { generateScene } from "@/lib/wonderlab/meta";
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
    const started = Date.now();
    const scene = await generateScene(
      body.image,
      body.brief,
      (env as unknown as Record<string, string>).MODEL_API_KEY || "",
    );
    return Response.json({
      scene,
      meta: {
        model: "muse-wonder-1.0",
        elapsedMs: Date.now() - started,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
