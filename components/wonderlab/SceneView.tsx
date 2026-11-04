"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  createVisual,
  spaceScene,
  surfaceFor,
  addStars,
} from "@/lib/wonderlab/visuals";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { nodeState, type Scene, type Values } from "@/lib/wonderlab/scene";

type Props = {
  scene: Scene;
  values: Values;
  playing: boolean;
  speed: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  labels: boolean;
  exploded: boolean;
  reset: number;
};

export default function SceneView(props: Props) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState("");
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setError(
        "3D needs WebGL. Try a browser with hardware acceleration enabled. You can still inspect the components and ask questions.",
      );
      return;
    }
    setError("");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const isSpace = spaceScene(props.scene);
    host.dataset.environment = isSpace ? "space" : "studio";
    renderer.setClearColor(isSpace ? "#0c1419" : "#e9eeeb");
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isSpace ? 1 : 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D scene. Drag to rotate, scroll to zoom. Use the component list to select with a keyboard.",
    );
    host.appendChild(renderer.domElement);
    const world = new THREE.Scene();
    const textures = new Set<THREE.Texture>();
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(room, 0.04);
    world.environment = environment.texture;
    world.environmentIntensity = isSpace ? 0.12 : 0.7;
    room.dispose();
    pmrem.dispose();
    if (isSpace) addStars(world);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 55;
    controls.minDistance = 2;
    controls.maxPolarAngle = Math.PI * 0.92;
    const bounds = new THREE.Box3();
    props.scene.nodes.forEach((n) => {
      bounds.expandByPoint(
        new THREE.Vector3(...n.position).add(
          new THREE.Vector3(...n.size).multiplyScalar(0.6),
        ),
      );
      bounds.expandByPoint(
        new THREE.Vector3(...n.position).sub(
          new THREE.Vector3(...n.size).multiplyScalar(0.6),
        ),
      );
      if (n.motion.type === "orbit") {
        const axis = { x: 0, y: 1, z: 2 }[n.motion.axis];
        const radius = new THREE.Vector3(...n.position).distanceTo(
          new THREE.Vector3(...n.motion.center),
        );
        const extent = [radius, radius, radius];
        extent[axis] = n.size[axis];
        bounds.expandByPoint(
          new THREE.Vector3(...n.motion.center).add(
            new THREE.Vector3(...extent),
          ),
        );
        bounds.expandByPoint(
          new THREE.Vector3(...n.motion.center).sub(
            new THREE.Vector3(...extent),
          ),
        );
      }
    });
    const center = bounds.getCenter(new THREE.Vector3());
    const dimensions = bounds.getSize(new THREE.Vector3());
    const span = Math.max(
      3.5,
      Math.max(dimensions.x, dimensions.y, dimensions.z) * 0.72,
    );
    function home() {
      camera.position
        .copy(center)
        .add(
          new THREE.Vector3(0.85, 0.72, 1.3).multiplyScalar(
            span * Math.max(1, 1.25 / camera.aspect),
          ),
        );
      controls.target.copy(center);
      controls.update();
    }
    home();
    world.add(
      new THREE.HemisphereLight(
        isSpace ? "#b1c9dd" : "#f3f8ff",
        isSpace ? "#14202c" : "#60796a",
        isSpace ? 0.6 : 1.4,
      ),
    );
    const sun = new THREE.DirectionalLight("#fff3db", isSpace ? 1.3 : 3.2);
    sun.position.set(5, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -15,
      right: 15,
      top: 15,
      bottom: -15,
      near: 0.1,
      far: 50,
    });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 4;
    world.add(sun);
    const fill = new THREE.DirectionalLight("#d4e8ff", isSpace ? 0.25 : 1);
    fill.position.set(-6, 3, -5);
    world.add(fill);
    if (!isSpace) {
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(180, 180),
        new THREE.MeshStandardMaterial({
          color: "#e6ece7",
          roughness: 1,
          metalness: 0,
        }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = Math.min(-0.5, bounds.min.y - 0.08);
      ground.receiveShadow = true;
      world.add(ground);
      world.fog = new THREE.Fog("#e9eeeb", 35, 100);
    }
    const objects = new Map<string, THREE.Mesh>();
    const labelElements = new Map<string, HTMLButtonElement>();
    for (const n of props.scene.nodes) {
      const mesh = createVisual(n, textures);
      if (surfaceFor(n) === "star") {
        const light = new THREE.PointLight("#ffdf99", 28, 35, 1.5);
        mesh.add(light);
      }
      world.add(mesh);
      objects.set(n.id, mesh);
      const label = document.createElement("button");
      label.className = "scene-label";
      label.textContent = n.label;
      label.setAttribute("aria-label", `Select ${n.label}`);
      label.onclick = () => latest.current.onSelect(n.id);
      host.appendChild(label);
      labelElements.set(n.id, label);
      if (n.motion.type === "orbit") {
        const center = new THREE.Vector3(...n.motion.center),
          offset = new THREE.Vector3(...n.position).sub(center);
        const axis = new THREE.Vector3(
          n.motion.axis === "x" ? 1 : 0,
          n.motion.axis === "y" ? 1 : 0,
          n.motion.axis === "z" ? 1 : 0,
        );
        const points = Array.from({ length: 129 }, (_, i) =>
          offset
            .clone()
            .applyAxisAngle(axis, (i / 128) * Math.PI * 2)
            .add(center),
        );
        world.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({
              color: isSpace ? "#597482" : "#8aa59a",
              transparent: true,
              opacity: isSpace ? 0.35 : 0.45,
            }),
          ),
        );
      }
    }
    const linkObjects = props.scene.links.map((link) => {
      const material = new THREE.MeshStandardMaterial({
        color: link.color,
        roughness: 0.6,
        transparent: true,
        opacity: link.style === "flow" ? 0.28 : 0.8,
      });
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 1, 16),
        material,
      );
      world.add(mesh);
      const dots =
        link.style === "flow"
          ? Array.from({ length: 4 }, () => {
              const dot = new THREE.Mesh(
                new THREE.SphereGeometry(0.055, 12, 10),
                new THREE.MeshBasicMaterial({ color: link.color }),
              );
              world.add(dot);
              return dot;
            })
          : [];
      const spring =
        link.style === "spring"
          ? new THREE.Line(
              new THREE.BufferGeometry(),
              new THREE.LineBasicMaterial({ color: link.color }),
            )
          : null;
      if (spring) {
        world.add(spring);
        mesh.visible = false;
      }
      return { link, mesh, dots, spring };
    });
    const raycaster = new THREE.Raycaster();
    let pointerDown = [0, 0];
    const down = (event: PointerEvent) => {
      pointerDown = [event.clientX, event.clientY];
    };
    const up = (event: PointerEvent) => {
      if (
        Math.hypot(
          event.clientX - pointerDown[0],
          event.clientY - pointerDown[1],
        ) > 5
      )
        return;
      const r = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - r.left) / r.width) * 2 - 1,
          (-(event.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const hit = raycaster.intersectObjects([...objects.values()], true)[0];
      latest.current.onSelect(hit?.object.userData.id || null);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    const resize = new ResizeObserver(() => {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      home();
    });
    resize.observe(host);
    let frame = 0,
      time = 0,
      last = performance.now(),
      lastReset = props.reset;
    const yAxis = new THREE.Vector3(0, 1, 0);
    function render(now: number) {
      // React can commit new props before this scene's passive-effect cleanup.
      // Its old mesh map must never render nodes from the replacement scene.
      if (latest.current.scene !== props.scene) return;
      const p = latest.current,
        delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (lastReset !== p.reset) {
        time = 0;
        home();
        lastReset = p.reset;
      }
      if (p.playing) time += delta * p.speed;
      const labelRects: { x: number; y: number; w: number }[] = [];
      const orderedNodes = [...p.scene.nodes].sort((a, b) =>
        a.id === p.selected ? -1 : b.id === p.selected ? 1 : 0,
      );
      for (const n of orderedNodes) {
        const mesh = objects.get(n.id)!;
        const state = nodeState(n, p.scene, p.values, time);
        mesh.position.set(...state.position);
        if (p.exploded)
          mesh.position.sub(center).multiplyScalar(1.4).add(center);
        mesh.rotation.set(...state.rotation);
        mesh.scale.set(...n.size).multiplyScalar(state.scale);
        const mat = mesh.material as THREE.MeshPhysicalMaterial;
        mat.opacity =
          state.opacity * (p.selected && p.selected !== n.id ? 0.65 : 1);
        const transparent = mat.opacity < 1 || mat.transmission > 0;
        if (mat.transparent !== transparent) {
          mat.transparent = transparent;
          mat.needsUpdate = true;
        }
        mat.emissive.set(
          p.selected === n.id ? "#3a7c77" : mesh.userData.baseEmissive,
        );
        mat.emissiveIntensity =
          p.selected === n.id ? 0.22 : mesh.userData.baseEmissiveIntensity;
        const label = labelElements.get(n.id)!;
        const pos = mesh.position
          .clone()
          .add(new THREE.Vector3(0, (n.size[1] * state.scale) / 2 + 0.22, 0))
          .project(camera);
        label.style.display =
          p.labels && pos.z < 1 && pos.z > -1 ? "block" : "none";
        const labelX = Math.max(
          50,
          Math.min(
            host!.clientWidth - 50,
            ((pos.x + 1) * host!.clientWidth) / 2,
          ),
        );
        const projectedY = ((-pos.y + 1) * host!.clientHeight) / 2;
        const width = Math.min(155, n.label.length * 6 + 16);
        const labelY = [0, -27, 27, -54, 54]
          .map((offset) => projectedY + offset)
          .find(
            (y) =>
              y > 75 &&
              y < host!.clientHeight - 35 &&
              !labelRects.some(
                (r) =>
                  Math.abs(r.x - labelX) < (r.w + width) / 2 + 5 &&
                  Math.abs(r.y - y) < 26,
              ),
          );
        if (labelY === undefined) label.style.display = "none";
        else {
          labelRects.push({ x: labelX, y: labelY, w: width });
          label.style.left = `${labelX}px`;
          label.style.top = `${labelY}px`;
        }
        label.classList.toggle("selected", p.selected === n.id);
        label.style.opacity = p.selected && p.selected !== n.id ? "0.5" : "1";
      }
      for (const { link, mesh, dots, spring } of linkObjects) {
        const a = objects.get(link.from)!.position,
          b = objects.get(link.to)!.position,
          vector = b.clone().sub(a),
          length = vector.length();
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.scale.set(1, length, 1);
        mesh.quaternion.setFromUnitVectors(yAxis, vector.normalize());
        dots.forEach((dot, i) =>
          dot.position.copy(a).lerp(b, (time * 0.22 + i / 4) % 1),
        );
        if (spring) {
          const points = Array.from({ length: 81 }, (_, i) => {
            const t = i / 80;
            return new THREE.Vector3(
              Math.cos(t * Math.PI * 16) * 0.1,
              t * length,
              Math.sin(t * Math.PI * 16) * 0.1,
            )
              .applyQuaternion(mesh.quaternion)
              .add(a);
          });
          spring.geometry.dispose();
          spring.geometry = new THREE.BufferGeometry().setFromPoints(points);
        }
      }
      controls.update();
      renderer.render(world, camera);
      frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      world.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Line ||
          object instanceof THREE.Points
        ) {
          object.geometry.dispose();
          const m = object.material;
          (Array.isArray(m) ? m : [m]).forEach((mat) => mat.dispose());
        }
      });
      textures.forEach((texture) => texture.dispose());
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelElements.forEach((el) => el.remove());
    };
  }, [props.scene]);
  return (
    <div className="scene-host" ref={root}>
      {error && (
        <div className="webgl-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
