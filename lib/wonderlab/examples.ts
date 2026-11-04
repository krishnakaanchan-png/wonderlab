import generatedWaterCutaway from "./generated-water-cutaway.json";
import generatedHeart from "./generated-heart.json";
import generatedWater from "./generated-water.json";
import { validateScene } from "./scene";
import { type Scene, type SceneNode } from "./scene";

const node = (
  id: string,
  label: string,
  shape: SceneNode["shape"],
  position: SceneNode["position"],
  size: SceneNode["size"],
  color: string,
  explanation: string,
  extra: Partial<SceneNode> = {},
): SceneNode => ({
  id,
  label,
  shape,
  position,
  size,
  color,
  explanation,
  rotation: [0, 0, 0],
  opacity: 1,
  sourceBox: null,
  motion: {
    type: "none",
    axis: "y",
    speed: 0,
    amplitude: 0,
    center: [0, 0, 0],
  },
  ...extra,
});
export const examples: {
  id: string;
  title: string;
  category: string;
  image: string;
  imageLabel?: string;
  description: string;
  scene: Scene;
}[] = [
  {
    id: "orbits",
    title: "A little solar system",
    category: "Astronomy",
    image: "/examples/orbits.svg",
    description: "See motion from a new perspective.",
    scene: {
      title: "A little solar system",
      subject: "Orbital motion",
      summary:
        "An orbit is a continuous journey around another body. Explore the paths from above, then tilt the scene to see their shared plane.",
      mode: "illustration",
      physics: "none",
      sourceReading:
        "The diagram shows the Sun and four planetary paths. Distances and sizes are schematic.",
      assumptions: [
        "Planet sizes and distances are exaggerated for visibility.",
        "Paths are circular animations, not an integration of gravitational forces.",
        "The rotation-speed control changes the animation only.",
      ],
      nodes: [
        node(
          "sun",
          "Sun",
          "sphere",
          [0, 1, 0],
          [1.4, 1.4, 1.4],
          "#d3a54c",
          "The Sun is the central star. Its gravity dominates planetary motion.",
          {
            sourceBox: [0.43, 0.38, 0.57, 0.62],
            motion: {
              type: "rotate",
              axis: "y",
              speed: 0.1,
              amplitude: 0,
              center: [0, 1, 0],
            },
          },
        ),
        node(
          "mercury",
          "Mercury",
          "sphere",
          [1.35, 1, 0],
          [0.25, 0.25, 0.25],
          "#9baead",
          "The innermost planet has the shortest orbital period.",
          {
            sourceBox: [0.61, 0.45, 0.66, 0.55],
            motion: {
              type: "orbit",
              axis: "y",
              speed: 0.8,
              amplitude: 0,
              center: [0, 1, 0],
            },
          },
        ),
        node(
          "venus",
          "Venus",
          "sphere",
          [-1.8, 1, 1],
          [0.45, 0.45, 0.45],
          "#bf715d",
          "Venus is the second planet from the Sun.",
          {
            sourceBox: [0.28, 0.44, 0.35, 0.56],
            motion: {
              type: "orbit",
              axis: "y",
              speed: 0.5,
              amplitude: 0,
              center: [0, 1, 0],
            },
          },
        ),
        node(
          "earth",
          "Earth",
          "sphere",
          [2.7, 1, 0],
          [0.56, 0.56, 0.56],
          "#287f80",
          "Earth follows an orbit around the Sun. Its orbital period is one year; this animation uses an illustrative speed.",
          {
            sourceBox: [0.76, 0.44, 0.83, 0.57],
            motion: {
              type: "orbit",
              axis: "y",
              speed: 0.3,
              amplitude: 0,
              center: [0, 1, 0],
            },
          },
        ),
        node(
          "mars",
          "Mars",
          "sphere",
          [-3.4, 1, -1.1],
          [0.38, 0.38, 0.38],
          "#a85e4e",
          "Mars orbits farther from the Sun than Earth.",
          {
            sourceBox: [0.12, 0.45, 0.18, 0.55],
            motion: {
              type: "orbit",
              axis: "y",
              speed: 0.18,
              amplitude: 0,
              center: [0, 1, 0],
            },
          },
        ),
      ],
      links: [],
      controls: [
        {
          id: "earth-speed",
          label: "Earth animation speed",
          unit: "rad/s",
          target: "earth",
          property: "speed",
          min: 0,
          max: 1.5,
          value: 0.3,
          step: 0.05,
          explanation:
            "Changes the speed along the illustrated orbit. This does not calculate a new gravitational orbit.",
        },
        {
          id: "sun-size",
          label: "Sun display size",
          unit: "×",
          target: "sun",
          property: "scale",
          min: 0.5,
          max: 1.5,
          value: 1,
          step: 0.05,
          explanation:
            "Changes the visual size of the Sun, not its mass or gravity.",
        },
      ],
      questions: [
        "Why do the planets keep orbiting?",
        "What is not to scale here?",
        "Make Earth move twice as fast.",
      ],
    },
  },
  {
    id: "pendulum",
    title: "The rhythm of a pendulum",
    category: "Mechanics",
    image: "/examples/pendulum.svg",
    description: "Discover what changes the swing.",
    scene: {
      title: "The rhythm of a pendulum",
      subject: "Simple harmonic motion",
      summary:
        "A longer pendulum swings more slowly. Change its length or gravity and watch the period update from the small-angle equation.",
      mode: "physical",
      physics: "pendulum",
      sourceReading:
        "The diagram labels a fixed pivot, a string of length L, a bob, and gravity g.",
      assumptions: [
        "Ideal, massless string and point-mass bob; no air resistance or friction.",
        "Small-angle approximation with amplitude limited to 0.25 radians (about 14°).",
        "World distances represent meters; the support is decorative.",
      ],
      nodes: [
        node(
          "support",
          "Support",
          "box",
          [0, 3.8, 0],
          [3, 0.18, 0.5],
          "#9baead",
          "The support holds the pivot fixed.",
          { sourceBox: [0.25, 0.13, 0.75, 0.2] },
        ),
        node(
          "pivot",
          "Pivot",
          "sphere",
          [0, 3.6, 0],
          [0.16, 0.16, 0.16],
          "#536c71",
          "The point around which the pendulum swings.",
          { sourceBox: [0.48, 0.17, 0.53, 0.24] },
        ),
        node(
          "bob",
          "Pendulum bob",
          "sphere",
          [0, 0.6, 0],
          [0.55, 0.55, 0.55],
          "#287f80",
          "Gravity provides the restoring force. For small angles the period is T = 2π√(L/g), independent of the bob’s mass.",
          {
            sourceBox: [0.58, 0.68, 0.72, 0.86],
            motion: {
              type: "pendulum",
              axis: "z",
              speed: 1,
              amplitude: 0.22,
              center: [0, 3.6, 0],
            },
          },
        ),
      ],
      links: [
        {
          from: "pivot",
          to: "bob",
          style: "rod",
          color: "#536c71",
          label: "String",
        },
      ],
      controls: [
        {
          id: "length",
          label: "String length",
          unit: "m",
          target: "bob",
          property: "length",
          min: 0.5,
          max: 3.5,
          value: 3,
          step: 0.1,
          explanation:
            "The calculated period grows with the square root of length.",
        },
        {
          id: "gravity",
          label: "Gravity",
          unit: "m/s²",
          target: "bob",
          property: "gravity",
          min: 1.6,
          max: 19.6,
          value: 9.81,
          step: 0.01,
          explanation:
            "Lower gravity produces a longer period. Try 1.62 for approximately lunar gravity.",
        },
      ],
      questions: [
        "Why does a longer pendulum swing more slowly?",
        "Set gravity to the Moon’s gravity.",
        "Does a heavier bob swing faster?",
      ],
    },
  },
  {
    id: "water",
    title: generatedWater.title,
    category: "Natural processes",
    image: "/examples/water.svg",
    description: "A saved scene generated by Muse Wonder from this diagram.",
    scene: validateScene(generatedWater),
  },
  {
    id: "heart",
    title: generatedHeart.title,
    category: "Animated cutaway",
    image: "/illustrations/heart-cutaway.webp",
    imageLabel: "Saved artwork · original reference omitted",
    description: "A coordinated heart cycle, illustrated by Muse Image.",
    scene: validateScene(generatedHeart),
  },
  {
    id: "water-cutaway",
    title: generatedWaterCutaway.title,
    category: "Animated cutaway",
    image: "/examples/water.svg",
    description: "A detailed landscape explanation generated with Muse.",
    scene: validateScene(generatedWaterCutaway),
  },
];
