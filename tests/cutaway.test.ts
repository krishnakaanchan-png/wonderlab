import test from "node:test";
import assert from "node:assert/strict";
import {
  phaseAt,
  pointAlong,
  validateChoreography,
  type Choreography,
} from "../lib/wonderlab/cutaway-schema";
const plan: Choreography = {
  regions: [
    {
      id: "left",
      label: "Left chamber",
      center: [0.6, 0.5],
      radius: [0.1, 0.15],
      labelSide: "right",
      color: "#ff0000",
    },
    {
      id: "right",
      label: "Right chamber",
      center: [0.4, 0.5],
      radius: [0.1, 0.15],
      labelSide: "left",
      color: "#0000ff",
    },
  ],
  flows: [
    {
      id: "out",
      label: "Outflow",
      points: [
        [0.6, 0.5],
        [0.6, 0.2],
      ],
      color: "#ff0000",
    },
  ],
  phases: [
    {
      id: "fill",
      title: "Fill",
      explanation: "Filling",
      duration: 3,
      highlights: ["left", "right"],
      flows: [],
      contractions: [],
    },
    {
      id: "pump",
      title: "Pump",
      explanation: "Both chambers contract",
      duration: 4,
      highlights: ["left", "right"],
      flows: ["out"],
      contractions: [
        { regionId: "left", strength: -0.02 },
        { regionId: "right", strength: -0.02 },
      ],
    },
    {
      id: "relax",
      title: "Relax",
      explanation: "Relaxing",
      duration: 3,
      highlights: [],
      flows: [],
      contractions: [],
    },
  ],
  limitations: ["Illustrative teaching sequence."],
};
test("timeline boundaries, wrap and scrubbing select the correct phase", () => {
  assert.equal(phaseAt(plan, 0).phase.id, "fill");
  assert.equal(phaseAt(plan, 3).phase.id, "pump");
  assert.equal(phaseAt(plan, 7).phase.id, "relax");
  assert.equal(phaseAt(plan, 10).phase.id, "fill");
  assert.equal(phaseAt(plan, 15).progress, 0.5);
});
test("coupled contractions share one timeline", () => {
  const state = phaseAt(plan, 5);
  assert.equal(state.phase.contractions.length, 2);
  assert.equal(state.progress, 0.5);
  assert.equal(
    state.phase.contractions[0].strength,
    state.phase.contractions[1].strength,
  );
});
test("path interpolation preserves start, end and distance across unequal segments", () => {
  const p = [
    [0, 0],
    [0.25, 0],
    [1, 0],
  ];
  assert.deepEqual(pointAlong(p, 0), [0, 0]);
  assert.deepEqual(pointAlong(p, 0.5), [0.5, 0]);
  assert.deepEqual(pointAlong(p, 1), [1, 0]);
});
test("rejects invalid animation references, zero-length paths and oversized regions", () => {
  assert.doesNotThrow(() => validateChoreography(plan));
  const p = structuredClone(plan);
  p.phases[0].flows = ["missing"];
  assert.throws(() => validateChoreography(p));
  p.phases[0].flows = [];
  p.flows[0].points = [
    [0.2, 0.2],
    [0.2, 0.2],
  ];
  assert.throws(() => validateChoreography(p));
  p.flows = [];
  p.phases[1].flows = [];
  p.regions[0].radius = [0.9, 0.9];
  assert.throws(() => validateChoreography(p));
});
