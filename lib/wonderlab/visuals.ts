import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Scene, SceneNode } from "./scene";

export function spaceScene(scene: Scene) {
  return (
    scene.environment === "space" ||
    (!scene.environment &&
      /solar|planet|orbital|astronom|galax/i.test(
        scene.subject + " " + scene.title,
      ))
  );
}
export function surfaceFor(node: SceneNode): NonNullable<SceneNode["surface"]> {
  if (node.surface) return node.surface;
  const name = node.label.toLowerCase();
  if (/\bearth\b/.test(name)) return "earth";
  if (/\b(sun|star)\b/.test(name)) return "star";
  if (/cloud|vapor/.test(name)) return "cloud";
  if (/ocean|river|water|rain|fluid/.test(name)) return "water";
  if (/mercury|venus|mars|moon|rock|land/.test(name)) return "rock";
  if (/gear|shaft|piston|bob|pivot|support|metal|axle|rod|bearing/.test(name))
    return "metal";
  if (/glass|bulb|lens/.test(name)) return "glass";
  if (/leaf|cell|membrane|tissue|nucleus/.test(name)) return "organic";
  return "enamel";
}

export function geometryFor(
  shape: SceneNode["shape"],
  node?: SceneNode,
): THREE.BufferGeometry {
  switch (shape) {
    case "lathe":
      return new THREE.LatheGeometry(
        node!.profile!.map(([r, y]) => new THREE.Vector2(r, y)),
        64,
      );
    case "path":
      return new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          node!.path!.map((p) => new THREE.Vector3(...p)),
        ),
        96,
        0.035,
        12,
        false,
      );
    case "sphere":
    case "ellipsoid":
      return new THREE.SphereGeometry(0.5, 64, 40);
    case "cylinder":
      return new THREE.LatheGeometry(
        [
          new THREE.Vector2(0, -0.5),
          new THREE.Vector2(0.46, -0.5),
          new THREE.Vector2(0.49, -0.47),
          new THREE.Vector2(0.5, -0.43),
          new THREE.Vector2(0.5, 0.43),
          new THREE.Vector2(0.49, 0.47),
          new THREE.Vector2(0.46, 0.5),
          new THREE.Vector2(0, 0.5),
        ],
        64,
      );
    case "cone":
      return new THREE.ConeGeometry(0.5, 1, 64);
    case "torus":
      return new THREE.TorusGeometry(0.38, 0.12, 24, 96);
    case "capsule":
      return new THREE.CapsuleGeometry(0.25, 0.5, 12, 32);
    case "tube":
      return new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.38, -0.5),
          new THREE.Vector2(0.48, -0.5),
          new THREE.Vector2(0.5, -0.47),
          new THREE.Vector2(0.5, 0.47),
          new THREE.Vector2(0.48, 0.5),
          new THREE.Vector2(0.38, 0.5),
          new THREE.Vector2(0.38, -0.5),
        ],
        64,
      );
    case "gear": {
      const outline = new THREE.Shape();
      for (let i = 0; i < 16 * 4; i++) {
        const a = (i / (16 * 4)) * Math.PI * 2;
        const r = i % 4 === 1 || i % 4 === 2 ? 0.49 : 0.405;
        const x = Math.cos(a) * r,
          y = Math.sin(a) * r;
        if (i === 0) outline.moveTo(x, y);
        else outline.lineTo(x, y);
      }
      outline.closePath();
      const bore = new THREE.Path();
      bore.absarc(0, 0, 0.12, 0, Math.PI * 2, true);
      outline.holes.push(bore);
      const g = new THREE.ExtrudeGeometry(outline, {
        depth: 0.9,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.012,
        bevelThickness: 0.035,
        curveSegments: 40,
      });
      g.translate(0, 0, -0.45);
      return g;
    }
    case "cloud": {
      const blobs = [
        [0, 0, 0, 0.32],
        [-0.27, -0.06, 0, 0.25],
        [0.27, -0.05, 0.03, 0.25],
        [-0.12, 0.15, 0.02, 0.27],
        [0.14, 0.12, -0.03, 0.25],
        [0.05, -0.1, 0.19, 0.22],
      ];
      const parts = blobs.map(([x, y, z, r]) => {
        const g = new THREE.SphereGeometry(r, 32, 24);
        g.translate(x, y, z);
        return g;
      });
      const merged = mergeGeometries(parts)!;
      parts.forEach((g) => g.dispose());
      merged.computeBoundingBox();
      const size = merged.boundingBox!.getSize(new THREE.Vector3());
      merged.scale(1 / size.x, 1 / size.y, 1 / size.z);
      merged.center();
      return merged;
    }
    case "leaf": {
      const g = new THREE.SphereGeometry(0.5, 48, 32);
      const attr = g.getAttribute("position");
      for (let i = 0; i < attr.count; i++) {
        const y = attr.getY(i);
        attr.setXYZ(
          i,
          attr.getX(i) * Math.max(0.1, 1 - Math.abs(y) * 1.5),
          y,
          attr.getZ(i) * 0.08 + Math.sin(y * Math.PI) * 0.15,
        );
      }
      g.computeVertexNormals();
      return g;
    }
    default:
      return new RoundedBoxGeometry(1, 1, 1, 4, 0.06);
  }
}

function noiseTexture(
  kind: "rock" | "star" | "water" | "organic",
  color: string,
) {
  const size = 256,
    bytes = new Uint8Array(size * size * 4),
    base = new THREE.Color(color);
  let seed = 2931;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const wave =
        Math.sin(x * 0.045 + Math.sin(y * 0.037) * 4) * Math.cos(y * 0.033) +
        Math.sin(x * 0.19 + y * 0.14) * 0.23;
      const n =
        kind === "water"
          ? 0.92 + Math.sin(x * 0.1 + Math.sin(y * 0.13)) * 0.08
          : kind === "star"
            ? 0.82 + wave * 0.2 + random() * 0.12
            : kind === "organic"
              ? 0.85 + wave * 0.1 + random() * 0.12
              : 0.75 + wave * 0.16 + random() * 0.22;
      const i = (y * size + x) * 4;
      bytes[i] = Math.min(255, base.r * 255 * n);
      bytes[i + 1] = Math.min(255, base.g * 255 * n);
      bytes[i + 2] = Math.min(255, base.b * 255 * n);
      bytes[i + 3] = 255;
    }
  const texture = new THREE.DataTexture(bytes, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function createVisual(
  node: SceneNode,
  textures: Set<THREE.Texture>,
): THREE.Mesh {
  const surface = surfaceFor(node);
  const settings: THREE.MeshPhysicalMaterialParameters = {
    color: node.color,
    roughness: 0.32,
    metalness: 0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.25,
    transparent: node.opacity < 1,
    opacity: node.opacity,
  };
  if (surface === "metal")
    Object.assign(settings, {
      metalness: 0.85,
      roughness: 0.24,
      color: new THREE.Color(node.color).lerp(new THREE.Color("#c4d2d5"), 0.5),
      clearcoat: 0.45,
    });
  if (surface === "glass")
    Object.assign(settings, {
      color: "#b5dadd",
      transmission: 0.82,
      thickness: 0.5,
      roughness: 0.08,
      ior: 1.46,
      transparent: true,
      opacity: Math.max(0.45, node.opacity),
    });
  if (surface === "water") {
    const texture = noiseTexture("water", "#68a7b2");
    textures.add(texture);
    Object.assign(settings, {
      color: "#3f8fa6",
      bumpMap: texture,
      bumpScale: 0.012,
      metalness: 0.15,
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      transmission: 0.25,
      thickness: 0.2,
    });
  }
  if (surface === "cloud")
    Object.assign(settings, { color: "#f2f5f4", roughness: 1, clearcoat: 0 });
  if (surface === "rock" || surface === "organic") {
    const texture = noiseTexture(surface, node.color);
    textures.add(texture);
    Object.assign(settings, {
      color: "#ffffff",
      map: texture,
      bumpMap: texture,
      bumpScale: surface === "rock" ? 0.025 : 0.008,
      roughness: surface === "rock" ? 0.9 : 0.45,
      clearcoat: surface === "rock" ? 0 : 0.25,
    });
  }
  if (surface === "star") {
    const texture = noiseTexture("star", "#ffc65e");
    textures.add(texture);
    Object.assign(settings, {
      color: "#ffd685",
      map: texture,
      emissive: "#ffbd41",
      emissiveMap: texture,
      emissiveIntensity: 2.2,
      roughness: 1,
      clearcoat: 0,
    });
  }
  if (surface === "earth") {
    const texture = new THREE.TextureLoader().load("/textures/earth.jpg");
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    textures.add(texture);
    Object.assign(settings, {
      color: "#ffffff",
      map: texture,
      roughness: 0.65,
      clearcoat: 0.22,
    });
  }
  const mesh = new THREE.Mesh(
    geometryFor(
      surface === "cloud" && node.shape === "ellipsoid" ? "cloud" : node.shape,
      node,
    ),
    new THREE.MeshPhysicalMaterial(settings),
  );
  mesh.userData.id = node.id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.baseEmissive = surface === "star" ? "#ffbd41" : "#000000";
  mesh.userData.baseEmissiveIntensity = surface === "star" ? 2.2 : 0;
  if (surface === "earth") {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.508, 48, 32),
      new THREE.MeshPhysicalMaterial({
        color: "#66a3c6",
        transparent: true,
        opacity: 0.1,
        roughness: 1,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    shell.userData.id = node.id;
    mesh.add(shell);
  }
  return mesh;
}

export function addStars(world: THREE.Scene) {
  let seed = 74;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = [];
  for (let i = 0; i < 650; i++) {
    const a = rand() * Math.PI * 2,
      z = rand() * 2 - 1,
      r = 45 + rand() * 25;
    positions.push(
      r * Math.sqrt(1 - z * z) * Math.cos(a),
      r * z,
      r * Math.sqrt(1 - z * z) * Math.sin(a),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  const stars = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: "#a7bcc7",
      size: 0.07,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }),
  );
  world.add(stars);
}
