import { z } from "zod";
import { cutawaySchema, validateChoreography } from "./cutaway-schema";

const vec = z.tuple([
  z.number().min(-20).max(20),
  z.number().min(-20).max(20),
  z.number().min(-20).max(20),
]);
export const nodeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  label: z.string().min(1).max(70),
  explanation: z.string().max(700),
  shape: z.enum([
    "sphere",
    "box",
    "cylinder",
    "cone",
    "torus",
    "ellipsoid",
    "gear",
    "tube",
    "capsule",
    "cloud",
    "leaf",
    "lathe",
    "path",
  ]),
  surface: z
    .enum([
      "enamel",
      "metal",
      "glass",
      "water",
      "rock",
      "earth",
      "star",
      "cloud",
      "organic",
    ])
    .optional(),
  profile: z
    .array(z.tuple([z.number().min(0).max(0.5), z.number().min(-0.5).max(0.5)]))
    .min(3)
    .max(24)
    .nullable()
    .optional(),
  path: z
    .array(
      z.tuple([
        z.number().min(-0.5).max(0.5),
        z.number().min(-0.5).max(0.5),
        z.number().min(-0.5).max(0.5),
      ]),
    )
    .min(2)
    .max(24)
    .nullable()
    .optional(),
  position: vec,
  size: z.tuple([
    z.number().min(0.05).max(12),
    z.number().min(0.05).max(12),
    z.number().min(0.05).max(12),
  ]),
  rotation: vec,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  opacity: z.number().min(0.12).max(1),
  sourceBox: z
    .tuple([
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
    ])
    .nullable(),
  motion: z.object({
    type: z.enum(["none", "rotate", "orbit", "oscillate", "pulse", "pendulum"]),
    axis: z.enum(["x", "y", "z"]),
    speed: z.number().min(-5).max(5),
    amplitude: z.number().min(0).max(8),
    center: vec,
  }),
});

export const modelSceneSchema = z.object({
  title: z.string().min(1).max(70),
  subject: z.string().max(50),
  environment: z.enum(["studio", "space"]).optional(),
  summary: z.string().max(700),
  mode: z.enum(["illustration", "physical"]),
  physics: z.enum(["none", "pendulum"]),
  sourceReading: z.string().max(1000),
  assumptions: z.array(z.string().max(300)).min(1).max(8),
  nodes: z.array(nodeSchema).min(1).max(32),
  links: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        style: z.enum(["rod", "flow", "spring"]),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        label: z.string().max(70),
      }),
    )
    .max(45),
  controls: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
        label: z.string().max(50),
        unit: z.string().max(20),
        target: z.string(),
        property: z.enum([
          "speed",
          "scale",
          "amplitude",
          "opacity",
          "positionX",
          "positionY",
          "positionZ",
          "length",
          "gravity",
        ]),
        min: z.number().min(-20).max(20),
        max: z.number().min(-20).max(20),
        value: z.number().min(-20).max(20),
        step: z.number().positive().max(5),
        explanation: z.string().max(250),
      }),
    )
    .max(6),
  questions: z.array(z.string().max(120)).min(1).max(4),
});

export const sceneSchema = modelSceneSchema.extend({
  cutaway: cutawaySchema.optional(),
});

export type Scene = z.infer<typeof sceneSchema>;
export type SceneNode = Scene["nodes"][number];
export type Values = Record<string, number>;

export function validateScene(input: unknown): Scene {
  const s = sceneSchema.parse(input);
  if (s.cutaway) {
    validateChoreography(s.cutaway);
    if (
      s.cutaway.poses &&
      (s.cutaway.poses.length !== s.cutaway.phases.length ||
        s.cutaway.poses.some(
          (pose, i) => pose.phaseId !== s.cutaway!.phases[i].id,
        ))
    )
      throw new Error("Animation poses must match every phase in order.");
    if (s.cutaway.regions.some((r) => !s.nodes.some((n) => n.id === r.id)))
      throw new Error("Cutaway region has no matching component.");
  }
  const ids = new Set(s.nodes.map((n) => n.id));
  if (ids.size !== s.nodes.length)
    throw new Error("Duplicate component identifiers.");
  if (new Set(s.controls.map((c) => c.id)).size !== s.controls.length)
    throw new Error("Duplicate control identifiers.");
  for (const n of s.nodes) {
    if (n.shape === "lathe" && (!n.profile || !n.profile.some((p) => p[0] > 0)))
      throw new Error("A lathe needs a nonzero radius profile.");
    if (
      n.shape === "path" &&
      (!n.path || !n.path.some((p) => p.some((v, i) => v !== n.path![0][i])))
    )
      throw new Error("A path needs at least two different points.");
    if (
      n.sourceBox &&
      (n.sourceBox[0] >= n.sourceBox[2] || n.sourceBox[1] >= n.sourceBox[3])
    )
      throw new Error("Invalid image region.");
  }
  for (const l of s.links)
    if (!ids.has(l.from) || !ids.has(l.to) || l.from === l.to)
      throw new Error("A connection points to a missing component.");
  for (const c of s.controls) {
    if (
      !ids.has(c.target) ||
      c.min >= c.max ||
      c.value < c.min ||
      c.value > c.max
    )
      throw new Error("Invalid experiment control.");
    if (["length", "gravity", "scale"].includes(c.property) && c.min <= 0)
      throw new Error("This control must remain positive.");
    if (c.property === "opacity" && (c.min < 0.12 || c.max > 1))
      throw new Error("Opacity must remain visible.");
    if (
      ["length", "gravity"].includes(c.property) &&
      s.nodes.find((n) => n.id === c.target)?.motion.type !== "pendulum"
    )
      throw new Error("Physical controls require a pendulum.");
    if (
      c.property === "amplitude" &&
      s.nodes.find((n) => n.id === c.target)?.motion.type === "pendulum" &&
      (c.min < 0 || c.max > 0.25)
    )
      throw new Error(
        "Pendulum amplitude must stay between 0 and 0.25 radians.",
      );
  }
  // Only this implemented equation is allowed to carry the physical-simulation label.
  if (
    s.mode === "physical" &&
    (s.physics !== "pendulum" ||
      !s.nodes.some((n) => n.motion.type === "pendulum"))
  )
    throw new Error("Unsupported physics model.");
  if (s.physics === "pendulum" && s.mode !== "physical")
    throw new Error("Pendulum physics must be labeled correctly.");
  return s;
}

export const initialValues = (scene: Scene): Values =>
  Object.fromEntries(scene.controls.map((c) => [c.id, c.value]));
export function checkedValues(scene: Scene, values: Values): Values {
  return Object.fromEntries(
    scene.controls.map((c) => {
      const v = values[c.id] ?? c.value;
      if (!Number.isFinite(v) || v < c.min || v > c.max)
        throw new Error(`Value out of range for ${c.label}.`);
      return [c.id, v];
    }),
  );
}

export function nodeState(
  node: SceneNode,
  scene: Scene,
  values: Values,
  time: number,
) {
  const position = [...node.position] as [number, number, number];
  const rotation = [...node.rotation] as [number, number, number];
  let speed = node.motion.speed,
    amplitude = node.motion.amplitude,
    scale = 1,
    opacity = node.opacity;
  let length = Math.max(
      0.1,
      Math.abs(node.motion.center[1] - node.position[1]),
    ),
    gravity = 9.81;
  for (const c of scene.controls.filter((c) => c.target === node.id)) {
    const value = values[c.id] ?? c.value;
    if (c.property === "speed") speed = value;
    if (c.property === "amplitude") amplitude = value;
    if (c.property === "scale") scale = value;
    if (c.property === "opacity") opacity = value;
    if (c.property === "length") length = value;
    if (c.property === "gravity") gravity = value;
    if (c.property === "positionX") position[0] = value;
    if (c.property === "positionY") position[1] = value;
    if (c.property === "positionZ") position[2] = value;
  }
  const axis = { x: 0, y: 1, z: 2 }[node.motion.axis];
  const angle = time * speed;
  if (node.motion.type === "rotate") rotation[axis] += angle;
  if (node.motion.type === "oscillate")
    position[axis] += Math.sin(angle) * amplitude;
  if (node.motion.type === "pulse")
    scale *= 1 + Math.sin(angle) * Math.min(amplitude, 0.35);
  if (node.motion.type === "orbit") {
    const a = (axis + 1) % 3,
      b = (axis + 2) % 3;
    const da = position[a] - node.motion.center[a],
      db = position[b] - node.motion.center[b];
    position[a] =
      node.motion.center[a] + da * Math.cos(angle) - db * Math.sin(angle);
    position[b] =
      node.motion.center[b] + da * Math.sin(angle) + db * Math.cos(angle);
  }
  if (node.motion.type === "pendulum") {
    const theta =
      Math.min(amplitude, 0.25) * Math.cos(Math.sqrt(gravity / length) * time);
    position[0] = node.motion.center[0] + length * Math.sin(theta);
    position[1] = node.motion.center[1] - length * Math.cos(theta);
    position[2] = node.motion.center[2];
  }
  return { position, rotation, scale, opacity, length, gravity };
}

export function measurements(scene: Scene, values: Values) {
  return scene.nodes
    .filter((n) => n.motion.type === "pendulum")
    .map((n) => {
      const state = nodeState(n, scene, values, 0);
      return {
        component: n.label,
        periodSeconds: 2 * Math.PI * Math.sqrt(state.length / state.gravity),
        lengthMeters: state.length,
        gravity: state.gravity,
      };
    });
}
