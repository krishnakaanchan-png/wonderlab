import { requireLiveGeneration } from "@/lib/wonderlab/demo-access";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  sceneSchema,
  validateScene,
  checkedValues,
  measurements,
} from "@/lib/wonderlab/scene";
import {
  callMeta,
  explainInstructions,
  jsonSchema,
  PublicError,
} from "@/lib/wonderlab/meta";
import { readBody, errorResponse, checkRate } from "@/lib/wonderlab/http";

const resultSchema = z.object({
  answer: z.string().max(1800),
  selectedId: z.string().nullable(),
  phaseId: z.string().nullable(),
  actions: z
    .array(z.object({ controlId: z.string(), value: z.number() }))
    .max(6),
});
const inputSchema = z.object({
  scene: sceneSchema,
  values: z.record(z.number()),
  question: z.string().min(1).max(1200),
  selectedId: z.string().nullable(),
  phaseId: z.string().max(40).nullable().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      }),
    )
    .max(8),
});

export async function POST(request: Request) {
  try {
    requireLiveGeneration(env as unknown as Record<string, unknown>);
    checkRate(request);
    const input = inputSchema.parse(await readBody(request));
    const scene = validateScene(input.scene),
      values = checkedValues(scene, input.values);
    const answer = resultSchema.parse(
      await callMeta(
        [
          { role: "system", content: explainInstructions },
          {
            role: "user",
            content: JSON.stringify({
              scene,
              values,
              measurements: measurements(scene, values),
              selectedId: input.selectedId,
              activePhase:
                scene.cutaway?.phases.find((p) => p.id === input.phaseId) ??
                null,
            }),
          },
          ...input.history,
          { role: "user", content: input.question },
        ],
        jsonSchema(resultSchema),
        "SceneAnswer",
        (env as unknown as Record<string, string>).MODEL_API_KEY || "",
        2500,
      ),
    );
    if (
      answer.selectedId &&
      !scene.nodes.some((n) => n.id === answer.selectedId)
    )
      answer.selectedId = null;
    const updated = { ...values };
    if (
      answer.phaseId &&
      !scene.cutaway?.phases.some((p) => p.id === answer.phaseId)
    )
      throw new PublicError(
        "That animation stage is not available. Choose one of the stages shown in the timeline.",
      );
    for (const action of answer.actions) {
      if (!scene.controls.some((c) => c.id === action.controlId))
        throw new PublicError(
          "That change is not supported by this experiment. Try a control shown in the panel.",
        );
      updated[action.controlId] = action.value;
    }
    checkedValues(scene, updated);
    return Response.json(answer);
  } catch (e) {
    return errorResponse(e);
  }
}
