import { z } from "zod";

const coord = z.number().min(0).max(1);
const point = z.tuple([coord, coord]);
const id = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
export const blueprintSchema = z.object({
  title: z.string().max(60),
  subject: z.string().max(60),
  summary: z.string().max(600),
  artDirection: z.string().max(2500),
  parts: z
    .array(
      z.object({
        id,
        label: z.string().max(45),
        explanation: z.string().max(600),
        sourceBox: z.tuple([coord, coord, coord, coord]).nullable(),
      }),
    )
    .min(2)
    .max(12),
  story: z.string().max(2000),
  sourceReading: z.string().max(900),
  assumptions: z.array(z.string().max(300)).min(1).max(6),
  questions: z.array(z.string().max(100)).min(1).max(3),
});
export const choreographySchema = z.object({
  regions: z
    .array(
      z.object({
        id,
        label: z.string().max(45),
        center: point,
        radius: point,
        labelSide: z.enum(["left", "right"]),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    )
    .min(2)
    .max(12),
  flows: z
    .array(
      z.object({
        id,
        label: z.string().max(70),
        points: z.array(point).min(2).max(16),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    )
    .max(10),
  phases: z
    .array(
      z.object({
        id,
        title: z.string().max(60),
        explanation: z.string().max(500),
        duration: z.number().min(0.25).max(10),
        poseDescription: z.string().max(700).optional(),
        movingParts: z.array(id).max(12).optional(),
        highlights: z.array(id).max(12),
        flows: z.array(id).max(10),
        contractions: z
          .array(
            z.object({
              regionId: id,
              strength: z.number().min(-0.04).max(0.04),
            }),
          )
          .max(8),
      }),
    )
    .min(3)
    .max(6),
  limitations: z.array(z.string().max(300)).min(1).max(5),
});
export const cutawaySchema = choreographySchema.extend({
  image: z
    .string()
    .max(12_000_000)
    .regex(
      /^(data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+|\/illustrations\/[a-z0-9-]+\.(webp|png|jpg))$/,
    )
    .optional(),
  provenance: z.literal("muse-image-1.0"),
  poses: z
    .array(
      z.object({
        phaseId: id,
        image: z
          .string()
          .max(5_000_000)
          .regex(
            /^(data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+|\/illustrations\/[a-z0-9-]+\.(webp|png|jpg))$/,
          ),
      }),
    )
    .min(2)
    .max(6)
    .optional(),
});
export type Cutaway = z.infer<typeof cutawaySchema>;
export type Choreography = z.infer<typeof choreographySchema>;
export function validateChoreography(value: unknown): Choreography {
  const data = choreographySchema.parse(value),
    regions = new Set(data.regions.map((r) => r.id)),
    flows = new Set(data.flows.map((f) => f.id));
  if (
    regions.size !== data.regions.length ||
    flows.size !== data.flows.length ||
    new Set(data.phases.map((p) => p.id)).size !== data.phases.length
  )
    throw new Error("Duplicate animation identifiers.");
  for (const r of data.regions)
    if (r.radius.some((v) => v < 0.015 || v > 0.4))
      throw new Error("Invalid animation region radius.");
  for (const phase of data.phases) {
    if (
      phase.highlights.some((id) => !regions.has(id)) ||
      phase.flows.some((id) => !flows.has(id)) ||
      phase.contractions.some((c) => !regions.has(c.regionId)) ||
      phase.movingParts?.some((id) => !regions.has(id))
    )
      throw new Error("Animation references a missing part or flow.");
  }
  for (const flow of data.flows)
    if (
      !flow.points.some(
        (p) => p[0] !== flow.points[0][0] || p[1] !== flow.points[0][1],
      )
    )
      throw new Error("Flow path has no length.");
  return data;
}
export function phaseAt(cutaway: Choreography, time: number) {
  const duration = cutaway.phases.reduce((s, p) => s + p.duration, 0);
  let cursor = ((time % duration) + duration) % duration;
  for (let index = 0; index < cutaway.phases.length; index++) {
    const phase = cutaway.phases[index];
    if (cursor < phase.duration)
      return {
        phase,
        index,
        progress: cursor / phase.duration,
        total: duration,
      };
    cursor -= phase.duration;
  }
  return { phase: cutaway.phases[0], index: 0, progress: 0, total: duration };
}
export function pointAlong(points: number[][], progress: number) {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  let distance = Math.max(0, Math.min(1, progress)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] && lengths[i] > 0) {
      const t = distance / lengths[i];
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * t,
        points[i][1] + (points[i + 1][1] - points[i][1]) * t,
      ];
    }
    distance -= lengths[i];
  }
  return points[points.length - 1];
}
