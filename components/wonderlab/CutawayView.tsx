"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { preparePoses } from "./pose-textures";
import {
  phaseAt,
  pointAlong,
  type Cutaway,
} from "@/lib/wonderlab/cutaway-schema";

type Props = {
  cutaway: Cutaway;
  playing: boolean;
  speed: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  labels: boolean;
  showFlows: boolean;
  reset: number;
  seek: { time: number; nonce: number };
  onTime: (time: number) => void;
};
export default function CutawayView(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null),
    content = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  latest.current = props;
  const [phaseIndex, setPhaseIndex] = useState(0),
    [rect, setRect] = useState({ left: 0, top: 0, width: 0, height: 0 }),
    [fallback, setFallback] = useState(false),
    [preparing, setPreparing] = useState(Boolean(props.cutaway.poses)),
    [motionError, setMotionError] = useState("");
  useEffect(() => {
    const root = host.current!,
      mount = surface.current!,
      layer = content.current!;
    let alive = true,
      frame = 0,
      time = 0,
      last = performance.now(),
      reported = 0,
      currentPhase = -1,
      lastReset = props.reset,
      lastSeek = props.seek.nonce,
      aspect = 1.5,
      zoom = 1,
      panX = 0,
      panY = 0;
    const uniforms = {
      uTexture: { value: null as THREE.Texture | null },
      uRegions: {
        value: Array.from({ length: 12 }, () => new THREE.Vector4()),
      },
      uStrengths: { value: Array(12).fill(0) },
      uCount: { value: props.cutaway.regions.length },
      uAspect: { value: aspect },
      uPoseMode: { value: 0 },
      uPoseMix: { value: 0 },
      uFrom: { value: null as THREE.Texture | null },
      uTo: { value: null as THREE.Texture | null },
      uFlowForward: { value: null as THREE.Texture | null },
      uFlowBackward: { value: null as THREE.Texture | null },
      uFlowSize: { value: new THREE.Vector2(1, 1) },
    };
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      mount.appendChild(renderer.domElement);
      setFallback(false);
    } catch {
      setFallback(true);
    }
    const world = new THREE.Scene(),
      camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    camera.position.z = 2;
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `varying vec2 vUv; uniform vec4 uRegions[12]; uniform float uStrengths[12]; uniform int uCount; uniform float uAspect;uniform float uPoseMode;
      void main(){vUv=uv;vec2 delta=vec2(0.0);if(uPoseMode<.5){for(int i=0;i<12;i++){if(i>=uCount)break;vec2 offset=uv-uRegions[i].xy;vec2 d=offset/max(uRegions[i].zw,vec2(0.015));float weight=exp(-dot(d,d)*2.0);delta+=d*uStrengths[i]*weight*.7;}}vec3 p=position;p.xy+=delta*vec2(2.0*uAspect,2.0);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
      fragmentShader: `varying vec2 vUv; uniform sampler2D uTexture;uniform sampler2D uFrom;uniform sampler2D uTo;uniform sampler2D uFlowForward;uniform sampler2D uFlowBackward;uniform vec2 uFlowSize;uniform float uPoseMode;uniform float uPoseMix;
vec2 flowAt(sampler2D image,vec2 uv){vec2 p=clamp(vec2(uv.x,1.0-uv.y),0.0,1.0)*(uFlowSize-1.0);vec2 i=floor(p);vec2 f=fract(p);vec2 a=texture2D(image,(i+.5)/uFlowSize).rg;vec2 b=texture2D(image,(i+vec2(1.5,.5))/uFlowSize).rg;vec2 c=texture2D(image,(i+vec2(.5,1.5))/uFlowSize).rg;vec2 d=texture2D(image,(i+1.5)/uFlowSize).rg;return mix(mix(a,b,f.x),mix(c,d,f.x),f.y)*vec2(1.0,-1.0);}
void main(){if(uPoseMode>.5){vec2 f=flowAt(uFlowForward,vUv);vec2 b=flowAt(uFlowBackward,vUv);vec4 a=texture2D(uFrom,clamp(vUv-uPoseMix*f,0.0,1.0));vec4 c=texture2D(uTo,clamp(vUv-(1.0-uPoseMix)*b,0.0,1.0));gl_FragColor=mix(a,c,uPoseMix);}else{gl_FragColor=texture2D(uTexture,vUv);}
#include <colorspace_fragment>
}`,
    });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 2, 96, 72),
      material,
    );
    world.add(mesh);
    props.cutaway.regions.forEach((r, i) =>
      uniforms.uRegions.value[i].set(
        r.center[0],
        1 - r.center[1],
        r.radius[0],
        r.radius[1],
      ),
    );
    const texture = new THREE.TextureLoader().load(
      props.cutaway.image!,
      (t) => {
        if (!alive) {
          t.dispose();
          return;
        }
        aspect = t.image.width / t.image.height;
        uniforms.uAspect.value = aspect;
        camera.left = -aspect;
        camera.right = aspect;
        camera.updateProjectionMatrix();
        mesh.geometry.dispose();
        mesh.geometry = new THREE.PlaneGeometry(2 * aspect, 2, 96, 72);
        t.colorSpace = THREE.SRGBColorSpace;
        uniforms.uTexture.value = t;
        resize();
      },
      undefined,
      () => {
        if (alive) setFallback(true);
      },
    );
    const abort = new AbortController();
    let poses: Awaited<ReturnType<typeof preparePoses>> | null = null;
    setPreparing(Boolean(props.cutaway.poses));
    setMotionError("");
    if (props.cutaway.poses) {
      preparePoses(props.cutaway, abort.signal)
        .then((result) => {
          if (!alive) {
            result.dispose();
            return;
          }
          poses = result;
          uniforms.uPoseMode.value = 1;
          setPreparing(false);
        })
        .catch((e) => {
          if (alive && e.name !== "AbortError") {
            console.error("Motion preparation:", e.message);
            setPreparing(false);
            setMotionError(
              "Component motion could not load. Refresh to retry.",
            );
          }
        });
    }
    function resize() {
      const w = root.clientWidth,
        h = root.clientHeight;
      const width = Math.min(w, h * aspect),
        height = width / aspect;
      setRect({ left: (w - width) / 2, top: (h - height) / 2, width, height });
      renderer?.setSize(width, height);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();
    const transform = () => {
      layer.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.max(1, Math.min(2.5, zoom * Math.exp(-e.deltaY * 0.001)));
      if (zoom === 1) {
        panX = panY = 0;
      }
      transform();
    };
    root.addEventListener("wheel", wheel, { passive: false });
    let drag: { x: number; y: number; px: number; py: number } | null = null;
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest("button,[role=button]") || zoom === 1)
        return;
      drag = { x: e.clientX, y: e.clientY, px: panX, py: panY };
      root.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      panX = drag.px + e.clientX - drag.x;
      panY = drag.py + e.clientY - drag.y;
      transform();
    };
    const up = () => {
      drag = null;
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", up);
    function render(now: number) {
      if (!alive || latest.current.cutaway !== props.cutaway) return;
      const p = latest.current,
        delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (lastReset !== p.reset) {
        time = 0;
        zoom = 1;
        panX = panY = 0;
        transform();
        lastReset = p.reset;
      }
      if (lastSeek !== p.seek.nonce) {
        time = p.seek.time;
        lastSeek = p.seek.nonce;
      }
      if (p.playing && (!p.cutaway.poses || poses)) time += delta * p.speed;
      const state = phaseAt(p.cutaway, time),
        cycleTime = time % state.total;
      if (state.index !== currentPhase) {
        currentPhase = state.index;
        setPhaseIndex(currentPhase);
      }
      if (now - reported > 100) {
        p.onTime(cycleTime);
        reported = now;
      }
      const pulse = Math.sin(Math.PI * state.progress);
      if (poses) {
        const i = state.index,
          previous = (i + poses.textures.length - 1) % poses.textures.length,
          t = Math.min(1, state.progress / 0.7);
        uniforms.uFrom.value = poses.textures[previous];
        uniforms.uTo.value = poses.textures[i];
        uniforms.uFlowForward.value = poses.pairs[i].forward;
        uniforms.uFlowBackward.value = poses.pairs[i].backward;
        uniforms.uFlowSize.value.copy(poses.pairs[i].size);
        uniforms.uPoseMix.value = t * t * (3 - 2 * t);
      }
      uniforms.uStrengths.value.fill(0);
      for (const contraction of state.phase.contractions) {
        const i = p.cutaway.regions.findIndex(
          (r) => r.id === contraction.regionId,
        );
        if (i >= 0 && !poses)
          uniforms.uStrengths.value[i] = contraction.strength * pulse;
      }
      function warped(point: number[]) {
        let x = point[0],
          y = point[1];
        p.cutaway.regions.forEach((r, i) => {
          const dx = point[0] - r.center[0],
            dy = point[1] - r.center[1],
            weight = Math.exp(
              -2 * ((dx / r.radius[0]) ** 2 + (dy / r.radius[1]) ** 2),
            );
          x += (dx / r.radius[0]) * uniforms.uStrengths.value[i] * weight * 0.7;
          y += (dy / r.radius[1]) * uniforms.uStrengths.value[i] * weight * 0.7;
        });
        return [x * 1000, y * 1000];
      }
      for (const flow of p.cutaway.flows) {
        const active = p.showFlows && state.phase.flows.includes(flow.id);
        const group = root.querySelector<SVGGElement>(
          `[data-flow="${flow.id}"]`,
        );
        if (!group) continue;
        group.style.opacity = active ? "1" : "0";
        const points = flow.points.map(warped);
        group
          .querySelector("path")
          ?.setAttribute(
            "d",
            points
              .map((v, i) => `${i === 0 ? "M" : "L"}${v[0]},${v[1]}`)
              .join(" "),
          );
        group.querySelectorAll("circle").forEach((dot, i) => {
          const pos = warped(
            pointAlong(flow.points, (time * 0.28 + i / 8) % 1),
          );
          dot.setAttribute("cx", String(pos[0]));
          dot.setAttribute("cy", String(pos[1]));
        });
      }
      renderer?.render(world, camera);
      frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener("wheel", wheel);
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      texture.dispose();
      abort.abort();
      poses?.dispose();
      mesh.geometry.dispose();
      material.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [props.cutaway]);
  const phase = props.cutaway.phases[phaseIndex] || props.cutaway.phases[0];
  const visible = props.cutaway.regions.filter((r) =>
    props.selected ? r.id === props.selected : phase.highlights.includes(r.id),
  );
  const positions: Record<string, number> = {};
  for (const side of ["left", "right"]) {
    let last = 0.1;
    for (const region of [...visible]
      .filter((r) => r.labelSide === side)
      .sort((a, b) => a.center[1] - b.center[1])) {
      const y = Math.min(0.84, Math.max(last + 0.09, region.center[1]));
      positions[region.id] = y;
      last = y;
    }
  }
  return (
    <div
      className="cutaway-view"
      ref={host}
      data-component-motion={
        props.cutaway.poses && !preparing && !motionError
          ? "ready"
          : "illustrative"
      }
    >
      {(preparing || motionError) && (
        <div className="motion-status" role="status">
          {motionError || "Preparing component motion…"}
        </div>
      )}
      <div
        className="cutaway-content"
        ref={content}
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }}
      >
        <div className="cutaway-surface" ref={surface} />
        {fallback && (
          <img
            className="cutaway-fallback"
            src={
              props.cutaway.poses?.[phaseIndex]?.image || props.cutaway.image
            }
            alt="Generated scientific cutaway"
          />
        )}
        <svg
          className="cutaway-overlay"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          aria-label="Animated pathways and selectable parts"
        >
          {props.cutaway.flows.map((f) => (
            <g key={f.id} data-flow={f.id} style={{ opacity: 0 }}>
              <path
                fill="none"
                stroke={f.color}
                strokeWidth="1.2"
                opacity=".42"
              />
              {Array.from({ length: 8 }, (_, i) => (
                <circle
                  key={i}
                  r={i === 0 ? 3.2 : 2.3}
                  fill={f.color}
                  opacity={0.95 - i * 0.065}
                />
              ))}
            </g>
          ))}
          {props.cutaway.regions.map((r) => (
            <ellipse
              key={r.id}
              cx={r.center[0] * 1000}
              cy={r.center[1] * 1000}
              rx={r.radius[0] * 1000}
              ry={r.radius[1] * 1000}
              fill="transparent"
              stroke={props.selected === r.id ? r.color : "transparent"}
              strokeWidth="1.5"
              role="button"
              tabIndex={0}
              aria-label={`Select ${r.label}`}
              onClick={() => props.onSelect(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  props.onSelect(r.id);
                }
              }}
              style={{ pointerEvents: "all", cursor: "pointer" }}
            />
          ))}
          {props.labels &&
            visible.map((r) => (
              <g key={r.id}>
                <path
                  d={`M${r.center[0] * 1000},${r.center[1] * 1000} L${r.labelSide === "left" ? 220 : 780},${positions[r.id] * 1000} L${r.labelSide === "left" ? 185 : 815},${positions[r.id] * 1000}`}
                  fill="none"
                  stroke={r.color}
                  strokeWidth="1"
                  opacity=".7"
                />
                <circle
                  cx={r.center[0] * 1000}
                  cy={r.center[1] * 1000}
                  r="3"
                  fill={r.color}
                />
              </g>
            ))}
        </svg>
        {props.labels &&
          visible.map((r) => (
            <button
              key={r.id}
              className={`cutaway-label ${r.labelSide}`}
              style={{ top: `${positions[r.id] * 100}%`, borderColor: r.color }}
              onClick={() => props.onSelect(r.id)}
            >
              {r.label}
            </button>
          ))}
      </div>
      <div className="cutaway-phase-caption">
        <span>Now exploring</span>
        <strong>{phase.title}</strong>
      </div>
    </div>
  );
}
