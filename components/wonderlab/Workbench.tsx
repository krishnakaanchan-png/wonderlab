"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Upload,
  Play,
  Pause,
  RotateCcw,
  ArrowUpRight,
  ArrowUp,
  Plus,
  Box,
  Image as ImageIcon,
  SlidersHorizontal,
  X,
  Check,
  Download,
  ScanLine,
  Layers,
  Maximize2,
  Orbit,
  ChevronRight,
  Info,
  LoaderCircle,
  PanelLeftClose,
  FolderOpen,
  Cable,
  ChevronDown,
} from "lucide-react";
import dynamic from "next/dynamic";
// Three's default loading manager creates an AbortController at module scope.
// Keep WebGL and its initialization out of the Cloudflare server renderer.
const SceneView = dynamic(() => import("./SceneView"), { ssr: false });
const CutawayView = dynamic(() => import("./CutawayView"), { ssr: false });
import { phaseAt } from "@/lib/wonderlab/cutaway-schema";
import { examples } from "@/lib/wonderlab/examples";
import {
  initialValues,
  checkedValues,
  measurements,
  validateScene,
  type Scene,
  type Values,
} from "@/lib/wonderlab/scene";

type Message = { role: "user" | "assistant"; content: string };
type Provenance = {
  model: string;
  elapsedMs: number;
  generatedAt: string;
} | null;
async function imageData(url: string): Promise<string> {
  const img = new window.Image();
  img.src = url;
  await img.decode();
  const factor = Math.min(
    1,
    1400 / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * factor);
  canvas.height = Math.round(img.naturalHeight * factor);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}
export default function Workbench() {
  const initialExample = examples.find((e) => e.id === "heart") || examples[0];
  const [focused, setFocused] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [projectNotice, setProjectNotice] = useState("");
  const projectInput = useRef<HTMLInputElement>(null);
  const [outputMode, setOutputMode] = useState<"cutaway" | "3d">("cutaway");
  const [stage, setStage] = useState("Understanding the picture");
  const [showFlows, setShowFlows] = useState(false);
  const [cutawayTime, setCutawayTime] = useState(0);
  const [seek, setSeek] = useState({ time: 0, nonce: 0 });
  const [scene, setScene] = useState<Scene>(initialExample.scene),
    [values, setValues] = useState<Values>(initialValues(initialExample.scene));
  const [image, setImage] = useState<string | null>(initialExample.image),
    [sourceName, setSourceName] = useState(
      initialExample.imageLabel || initialExample.title,
    ),
    [brief, setBrief] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [playing, setPlaying] = useState(true),
    [speed, setSpeed] = useState(1),
    [labels, setLabels] = useState(true),
    [exploded, setExploded] = useState(false),
    [reset, setReset] = useState(0);
  const [loading, setLoading] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [error, setError] = useState(""),
    [configured, setConfigured] = useState<boolean | null>(null),
    [provenance, setProvenance] = useState<Provenance>(null);
  const [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState(""),
    [asking, setAsking] = useState(false),
    [askError, setAskError] = useState("");
  const [tab, setTab] = useState<"controls" | "explain">("controls"),
    [mobile, setMobile] = useState<"source" | "explore" | "learn">("explore"),
    [help, setHelp] = useState(false),
    [draft, setDraft] = useState(false);
  const upload = useRef<HTMLInputElement>(null),
    chatBottom = useRef<HTMLDivElement>(null),
    viewer = useRef<HTMLDivElement>(null),
    generation = useRef(0);
  const selectedNode = scene.nodes.find((n) => n.id === selected),
    measured = measurements(scene, values);
  const phaseState = scene.cutaway ? phaseAt(scene.cutaway, cutawayTime) : null;
  function seekTo(time: number) {
    setCutawayTime(time);
    setSeek((v) => ({ time, nonce: v.nonce + 1 }));
  }
  function jumpToPhase(index: number) {
    if (!scene.cutaway) return;
    seekTo(
      scene.cutaway.phases.slice(0, index).reduce((t, p) => t + p.duration, 0) +
        scene.cutaway.phases[index].duration * 0.8,
    );
    setPlaying(false);
  }
  useEffect(() => {
    fetch("/api/status")
      .then(
        (r) => r.json() as Promise<{ configured: boolean; demoMode?: boolean }>,
      )
      .then((d) => {
        setConfigured(d.configured);
        setDemoMode(Boolean(d.demoMode));
      })
      .catch(() => setConfigured(false));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      setPlaying(false);
  }, []);
  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    setElapsed(0);
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [loading]);
  useEffect(() => {
    chatBottom.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [messages, asking]);
  useEffect(() => {
    if (!help) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelp(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [help]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        help ||
        loading ||
        (e.target instanceof HTMLElement &&
          e.target.closest("input,textarea,select,[contenteditable]"))
      )
        return;
      if (e.key === "Escape") {
        setFocused(false);
        return;
      }
      if (
        e.code === "Space" &&
        !(
          e.target instanceof Element &&
          e.target.closest('button,summary,a,[role="button"]')
        )
      ) {
        e.preventDefault();
        setPlaying((v) => !v);
      }
      if (e.key.toLowerCase() === "f") setFocused((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [help, loading]);
  async function importProject(file?: File) {
    if (!file || loading || asking) return;
    if (file.size > 30_000_000) {
      setError("Choose a WonderLab project smaller than 30 MB.");
      setMobile("source");
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      const next = validateScene(data.scene ?? data);
      const restored = checkedValues(next, data.values ?? {});
      install(next);
      setValues(restored);
      setImage(null);
      setSourceName(file.name);
      setBrief("");
      setError("");
      setProjectNotice(`Opened ${file.name}`);
    } catch {
      setError(
        "This file is not a valid WonderLab project. Choose an exported project JSON file.",
      );
      setMobile("source");
    }
  }
  function install(next: Scene, meta: Provenance = null) {
    generation.current++;
    setProjectNotice("");
    setScene(next);
    setCutawayTime(0);
    setSeek((v) => ({ time: 0, nonce: v.nonce + 1 }));
    setShowFlows(false);
    setValues(initialValues(next));
    setSelected(null);
    setMessages([]);
    setAskError("");
    setQuestion("");
    setExploded(false);
    setProvenance(meta);
    setReset((v) => v + 1);
    setDraft(false);
    setMobile("explore");
    setTab("controls");
  }
  function chooseExample(id: string) {
    const e = examples.find((e) => e.id === id)!;
    setImage(e.image);
    setSourceName(e.imageLabel || e.title);
    setBrief("");
    setError("");
    install(e.scene);
  }
  async function acceptFile(file?: File) {
    if (!file || loading || asking) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 20_000_000) {
      setError("Choose an image smaller than 20 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      setImage(await imageData(url));
      setSourceName(file.name);
      setDraft(true);
      setError("");
      setMobile("source");
    } catch {
      setError(
        "This image could not be opened. Try exporting it as a JPG or PNG.",
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function generate() {
    if (loading || asking || demoMode) return;
    setError("");
    setLoading(true);
    setStage(
      outputMode === "cutaway"
        ? "Understanding the picture"
        : "Composing the 3D scene",
    );
    try {
      const data = image ? await imageData(image) : null;
      const r = await fetch(
        outputMode === "cutaway" ? "/api/cutaway" : "/api/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: data, brief }),
          signal: AbortSignal.timeout(600000),
        },
      );
      if (outputMode === "cutaway" && r.ok) {
        const reader = r.body!.getReader(),
          decoder = new TextDecoder();
        let buffer = "",
          installed = false;
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop()!;
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.error) throw new Error(event.error);
            if (event.stage) setStage(event.stage);
            if (event.scene) {
              install(validateScene(event.scene), event.meta);
              installed = true;
            }
          }
          if (done) break;
        }
        if (!installed)
          throw new Error(
            "The animation did not finish. Your source is still here; please retry.",
          );
      } else {
        const result = (await r.json()) as {
          error?: string;
          scene: Scene;
          meta: NonNullable<Provenance>;
        };
        if (!r.ok)
          throw new Error(result.error || "The scene could not be created.");
        install(validateScene(result.scene), result.meta);
      }
    } catch (e) {
      setError(
        e instanceof Error && e.name === "TimeoutError"
          ? "The request timed out. Your picture is still here; please retry."
          : e instanceof Error
            ? e.message
            : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function ask(text: string) {
    if (!text.trim() || asking || loading || demoMode) return;
    const version = generation.current;
    setAsking(true);
    setAskError("");
    setTab("explain");
    setMobile("learn");
    setQuestion("");
    const history = messages.slice(-8);
    setMessages((m) => [...m, { role: "user", content: text }]);
    try {
      const r = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene: scene.cutaway
            ? {
                ...scene,
                cutaway: {
                  ...scene.cutaway,
                  image: undefined,
                  poses: undefined,
                },
              }
            : scene,
          values,
          question: text,
          selectedId: selected,
          phaseId: phaseState?.phase.id ?? null,
          history,
        }),
        signal: AbortSignal.timeout(160000),
      });
      const data = (await r.json()) as {
        error?: string;
        answer: string;
        selectedId: string | null;
        actions: { controlId: string; value: number }[];
        phaseId: string | null;
      };
      if (!r.ok) throw new Error(data.error || "Could not get an answer.");
      if (generation.current !== version) return;
      setMessages((m) => [...m, { role: "assistant", content: data.answer }]);
      if (data.selectedId) setSelected(data.selectedId);
      if (data.phaseId && scene.cutaway)
        jumpToPhase(
          scene.cutaway.phases.findIndex((p) => p.id === data.phaseId),
        );
      if (data.actions.length)
        setValues((v) => ({
          ...v,
          ...Object.fromEntries(
            data.actions.map((a: { controlId: string; value: number }) => [
              a.controlId,
              a.value,
            ]),
          ),
        }));
    } catch (e) {
      if (generation.current === version) {
        setAskError(
          e instanceof Error ? e.message : "Could not get an answer.",
        );
        setQuestion(text);
      }
    } finally {
      setAsking(false);
    }
  }
  function exportScene() {
    const blob = new Blob(
      [JSON.stringify({ scene, values, provenance }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wonderlab-experiment.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function resetScene() {
    setValues(initialValues(scene));
    setReset((v) => v + 1);
    seekTo(0);
    setExploded(false);
    setSelected(null);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void ask(question);
  }
  return (
    <main className={`app-shell studio-shell ${focused ? "is-focused" : ""}`}>
      <input
        ref={projectInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          void importProject(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="WonderLab home">
          <span className="brand-mark">
            <Orbit size={25} strokeWidth={1.7} />
          </span>
          WonderLab<span className="beta">Studio</span>
        </a>
        <span className="topline">See the idea. Explore the motion.</span>
        <div className="top-actions">
          <a
            className="agent-link"
            href="/integrations"
            target="_blank"
            rel="noreferrer"
          >
            <Cable size={16} />
            <span>For agents</span>
          </a>
          <button
            className="open-project-button"
            aria-label="Open project"
            disabled={loading || asking}
            onClick={() => projectInput.current?.click()}
          >
            <FolderOpen size={16} />
            <span>Open project</span>
          </button>
          <button
            className="focus-button"
            title="Focus view (F)"
            aria-pressed={focused}
            onClick={() => setFocused((v) => !v)}
          >
            <PanelLeftClose size={16} />
            <span>{focused ? "Exit focus" : "Focus view"}</span>
          </button>
          <span className="meta-status">
            <span
              className={configured ? "status-dot" : "status-dot offline"}
            />
            {demoMode
              ? "Public preview"
              : configured
                ? "Meta connected"
                : configured === false
                  ? "Examples available"
                  : "Connecting"}
          </span>
          <button
            className="icon-button"
            onClick={() => setHelp(true)}
            aria-label="About WonderLab"
          >
            <Info size={18} />
          </button>
          <button
            className="export-button"
            aria-label="Export project data"
            onClick={exportScene}
          >
            <Download size={15} />
            <span>Export data</span>
          </button>
        </div>
      </header>
      <nav className="mobile-tabs" aria-label="Workspace panels">
        {(["source", "explore", "learn"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setMobile(t)}
            aria-current={mobile === t ? "page" : undefined}
          >
            {t === "source"
              ? "Your picture"
              : t === "explore"
                ? "Experiment"
                : "Explore & ask"}
          </button>
        ))}
      </nav>
      <div className="workspace">
        <aside
          className={`source-panel ${mobile === "source" ? "mobile-active" : ""}`}
        >
          <div className="panel-heading">
            <span>
              <ImageIcon size={17} /> Your starting point
            </span>
            <button
              className="icon-button"
              disabled={loading || asking}
              aria-label="Upload a new picture"
              onClick={() => upload.current?.click()}
            >
              <Plus size={18} />
            </button>
          </div>
          <input
            ref={upload}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            hidden
            onChange={(e) => {
              void acceptFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div
            className="upload-area"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void acceptFile(e.dataTransfer.files[0]);
            }}
          >
            {image ? (
              <>
                <div className="source-image">
                  <img src={image} alt={`Source diagram: ${sourceName}`} />
                  {!draft &&
                    scene.nodes
                      .filter((n) => n.sourceBox)
                      .map((n) => {
                        const b = n.sourceBox!;
                        return (
                          <button
                            key={n.id}
                            title={n.label}
                            aria-label={`Select ${n.label} in picture`}
                            className={`source-region ${selected === n.id ? "selected" : ""}`}
                            style={{
                              left: `${b[0] * 100}%`,
                              top: `${b[1] * 100}%`,
                              width: `${(b[2] - b[0]) * 100}%`,
                              height: `${(b[3] - b[1]) * 100}%`,
                            }}
                            onClick={() => setSelected(n.id)}
                          />
                        );
                      })}
                </div>
                <div className="image-caption">
                  <span>{sourceName}</span>
                  <button
                    className="icon-button"
                    disabled={loading || asking}
                    aria-label="Remove picture and use a description"
                    onClick={() => {
                      setImage(null);
                      setDraft(true);
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </>
            ) : (
              <button
                className="empty-upload"
                onClick={() => upload.current?.click()}
              >
                <Upload size={26} />
                <strong>Drop a picture here</strong>
                <span>or choose one from your device</span>
              </button>
            )}
            <button
              className="upload-link"
              disabled={loading || asking}
              onClick={() => upload.current?.click()}
            >
              <Upload size={14} />{" "}
              {image ? "Replace picture" : "Upload picture"}
            </button>
          </div>
          <label className="brief-label" htmlFor="brief">
            What are you curious about?
          </label>
          <textarea
            id="brief"
            className="brief"
            value={brief}
            maxLength={1200}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={
              image
                ? "Optional: “Show how these parts connect…”"
                : "Describe a concept, structure, or mechanism…"
            }
            disabled={loading || asking}
          />
          <label className="output-mode-label" htmlFor="output-mode">
            Create
          </label>
          <select
            id="output-mode"
            className="output-mode"
            value={outputMode}
            disabled={loading || asking}
            onChange={(e) => setOutputMode(e.target.value as "cutaway" | "3d")}
          >
            <option value="cutaway">Detailed animated cutaway</option>
            <option value="3d">Explorable 3D scene</option>
          </select>
          <button
            className="primary generate-button"
            disabled={
              loading ||
              asking ||
              demoMode ||
              (!image && brief.trim().length < 5)
            }
            onClick={generate}
          >
            {loading ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <ScanLine size={17} />
            )}{" "}
            {loading
              ? "Bringing it to life…"
              : outputMode === "cutaway"
                ? "Animate this picture"
                : "Bring it to life"}
            {!loading && <ArrowUpRight size={17} />}
          </button>
          <p className="input-note">
            JPG, PNG, WebP · up to 20 MB
            <br />
            {demoMode
              ? "Public preview: play the examples or import a project. Run locally for new generation and AI chat."
              : "Your picture is sent to Meta for interpretation."}
          </p>
          {error && (
            <div className="inline-error" role="alert">
              {error}
              <button onClick={generate} disabled={loading}>
                Try again
              </button>
            </div>
          )}
          {loading && (
            <div className="generation-status" role="status">
              <span className="status-dot" />
              <div>
                <strong>{stage}</strong>
                <p>
                  {outputMode === "cutaway"
                    ? "Muse Wonder + Muse Image"
                    : "Muse Wonder"}{" "}
                  · {elapsed}s elapsed.
                </p>
              </div>
            </div>
          )}
          {projectNotice && (
            <p className="project-notice" role="status">
              <Check size={14} />
              {projectNotice}
            </p>
          )}
          <details className="example-library">
            <summary>
              <span>Explore examples</span>
              <span>{examples.length}</span>
              <ChevronDown size={15} />
            </summary>
            <div className="example-list">
              {examples.map((e) => (
                <button
                  disabled={loading || asking}
                  key={e.id}
                  className={`example-row ${scene.title === e.scene.title && !draft ? "active" : ""}`}
                  onClick={() => chooseExample(e.id)}
                >
                  <img src={e.image} alt="" />
                  <span>
                    <strong>{e.title}</strong>
                    <small>{e.category}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          </details>
          <div className="source-foot">
            <span className="meta-symbol">∞</span>
            <span>
              Made possible with
              <br />
              <strong>
                {scene.cutaway
                  ? "Muse Wonder + Muse Image"
                  : "Meta Muse Wonder"}
              </strong>
            </span>
          </div>
        </aside>
        <section
          className={`experiment-panel ${mobile === "explore" ? "mobile-active" : ""}`}
          aria-label="Experiment"
        >
          <div className="experiment-heading">
            <div>
              <div className="breadcrumb">
                Your laboratory <ChevronRight size={12} />
                <span>{scene.subject}</span>
              </div>
              <h1>{scene.title}</h1>
            </div>
            <span className="mode-tag">
              {scene.cutaway
                ? "Animated cutaway"
                : scene.mode === "physical"
                  ? "Calculated physics"
                  : "Animated explanation"}
            </span>
          </div>
          <div
            className={`scene-stage ${scene.cutaway ? "cutaway-stage" : ""}`}
            ref={viewer}
          >
            {scene.cutaway ? (
              <CutawayView
                cutaway={scene.cutaway}
                playing={playing}
                speed={speed * (values.animation_pace ?? 1)}
                selected={selected}
                onSelect={setSelected}
                labels={labels}
                showFlows={showFlows}
                reset={reset}
                seek={seek}
                onTime={setCutawayTime}
              />
            ) : (
              <SceneView
                scene={scene}
                values={values}
                playing={playing}
                speed={speed}
                selected={selected}
                onSelect={setSelected}
                labels={labels}
                exploded={exploded}
                reset={reset}
              />
            )}
            <div className="view-tools">
              <button
                title="Show labels"
                aria-label="Show component labels"
                aria-pressed={labels}
                onClick={() => setLabels((v) => !v)}
              >
                <ScanLine size={16} />
              </button>
              <button
                title={
                  scene.cutaway ? "Show flow paths" : "Spread components apart"
                }
                aria-label={scene.cutaway ? "Show flow paths" : "Exploded view"}
                aria-pressed={scene.cutaway ? showFlows : exploded}
                onClick={() =>
                  scene.cutaway
                    ? setShowFlows((v) => !v)
                    : setExploded((v) => !v)
                }
              >
                <Layers size={16} />
              </button>
              <button
                title="Reset view and controls"
                aria-label="Reset experiment"
                onClick={resetScene}
              >
                <RotateCcw size={16} />
              </button>
              <button
                title="Fullscreen"
                aria-label="Fullscreen experiment"
                onClick={() => {
                  if (document.fullscreenElement)
                    void document.exitFullscreen();
                  else void viewer.current?.requestFullscreen().catch(() => {});
                }}
              >
                <Maximize2 size={16} />
              </button>
            </div>
            <div className="scene-caption">
              <span className="scene-caption-dot" />
              {projectNotice
                ? "Imported project"
                : provenance
                  ? scene.cutaway
                    ? "Artwork by Muse Image · directed by Muse Wonder"
                    : "Interpreted by Muse Wonder"
                  : "Curated example · explore or regenerate"}
            </div>
            {draft && (
              <div className="draft-notice">
                New picture ready. Select “Bring it to life” to replace this
                scene.
              </div>
            )}
            <div className="scene-navigation">
              <Orbit size={14} />
              <span>
                {scene.cutaway
                  ? "Scroll to zoom · Select a part · Scrub the sequence"
                  : "Drag to orbit · Scroll to zoom · Select a part"}
              </span>
            </div>
            {loading && (
              <div className="loading-overlay">
                <div className="loading-orbit">
                  <Orbit size={44} strokeWidth={1} />
                </div>
                <strong>A new way to see it.</strong>
                <span>{stage}</span>
                <small>
                  {elapsed}s ·{" "}
                  {outputMode === "cutaway"
                    ? "three stages: understand, illustrate, animate"
                    : "complex scenes can take a minute or two"}
                </small>
              </div>
            )}
          </div>
          <div className="playback">
            <button
              className="play-button"
              aria-label={playing ? "Pause animation" : "Play animation"}
              onClick={() => setPlaying((v) => !v)}
            >
              {playing ? (
                <Pause size={16} fill="currentColor" />
              ) : (
                <Play size={16} fill="currentColor" />
              )}
            </button>
            <span>{playing ? "In motion" : "Paused"}</span>
            <div className="playback-spacer" />
            <label htmlFor="speed">Playback</label>
            <select
              id="speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={0.25}>0.25×</option>
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </select>
            <span className="parts-count">{scene.nodes.length} components</span>
          </div>
          {scene.cutaway && phaseState && (
            <div className="sequence-bar">
              <div className="sequence-heading">
                <span>{phaseState.phase.title}</span>
                <span>
                  {cutawayTime.toFixed(1)} /{" "}
                  {Number(phaseState.total.toFixed(1))}s teaching loop
                </span>
              </div>
              <label className="sr-only" htmlFor="sequence-time">
                Animation timeline
              </label>
              <input
                id="sequence-time"
                type="range"
                min={0}
                max={phaseState.total - 0.01}
                step={0.05}
                value={cutawayTime}
                onChange={(e) => {
                  setPlaying(false);
                  seekTo(Number(e.target.value));
                }}
              />
              <div className="sequence-phases">
                {scene.cutaway.phases.map((p, i) => (
                  <button
                    key={p.id}
                    className={phaseState.index === i ? "active" : ""}
                    onClick={() => jumpToPhase(i)}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div
            className={`understand ${scene.cutaway && !selectedNode ? "quick-questions" : ""}`}
          >
            <div className="understand-title">
              <span className="small-orbit">
                <Box size={19} />
              </span>
              <h2>
                {selectedNode
                  ? selectedNode.label
                  : phaseState
                    ? phaseState.phase.title
                    : "A closer look"}
              </h2>
              {selectedNode && (
                <button
                  className="icon-button"
                  aria-label="Clear selection"
                  onClick={() => setSelected(null)}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <p>
              {selectedNode
                ? selectedNode.explanation
                : phaseState
                  ? phaseState.phase.explanation
                  : scene.summary}
            </p>
            <div className="question-chips">
              {scene.questions.slice(0, 2).map((q) => (
                <button
                  key={q}
                  disabled={asking || loading || demoMode}
                  onClick={() => void ask(q)}
                >
                  {q}
                  <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          </div>
          <details className="assumptions">
            <summary>
              <Info size={14} />
              {scene.mode === "physical"
                ? "Model assumptions"
                : "What this illustration assumes"}
              <span>{scene.assumptions.length}</span>
            </summary>
            <ul>
              {scene.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <p>
              <strong>From the source:</strong> {scene.sourceReading}
            </p>
            {provenance && (
              <p>
                Generated with {provenance.model} in{" "}
                {(provenance.elapsedMs / 1000).toFixed(1)} seconds.
              </p>
            )}
          </details>
        </section>
        <aside
          className={`inspector-panel ${mobile === "learn" ? "mobile-active" : ""}`}
        >
          <div
            className="inspector-tabs"
            role="tablist"
            aria-label="Experiment tools"
          >
            <button
              role="tab"
              aria-selected={tab === "controls"}
              onClick={() => setTab("controls")}
            >
              <SlidersHorizontal size={15} />{" "}
              {scene.cutaway ? "Guide" : "Controls"}
            </button>
            <button
              role="tab"
              aria-selected={tab === "explain"}
              onClick={() => setTab("explain")}
            >
              <span className="meta-small">∞</span> Ask Muse
            </button>
          </div>
          {tab === "controls" ? (
            <div className="inspector-scroll">
              <div className="inspector-intro">
                <h2>
                  {scene.cutaway
                    ? "Follow the explanation"
                    : "What if you changed it?"}
                </h2>
                <p>
                  {scene.cutaway
                    ? "Choose a phase to pause and inspect it."
                    : "Adjust a value. Watch the idea unfold."}
                </p>
              </div>
              {scene.cutaway && phaseState && (
                <div className="guide-content">
                  <div className="phase-explainer">
                    <h3>{phaseState.phase.title}</h3>
                    <p>{phaseState.phase.explanation}</p>
                  </div>
                  <div className="story-steps">
                    {scene.cutaway.phases.map((p, i) => (
                      <button
                        key={p.id}
                        className={phaseState.index === i ? "active" : ""}
                        onClick={() => jumpToPhase(i)}
                      >
                        <span className="story-dot" />
                        <span>
                          <strong>{p.title}</strong>
                          <small>{Number(p.duration.toFixed(1))}s</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="controls">
                {scene.controls.length === 0 ? (
                  <p className="muted">
                    This scene is for inspection. Rotate it or ask about a
                    component.
                  </p>
                ) : (
                  scene.controls.map((c) => (
                    <div className="control" key={c.id}>
                      <label htmlFor={c.id}>
                        {c.label}
                        <output>
                          {Number((values[c.id] ?? c.value).toFixed(2))}
                          <small>{c.unit}</small>
                        </output>
                      </label>
                      <input
                        type="range"
                        id={c.id}
                        min={c.min}
                        max={c.max}
                        step={c.step}
                        value={values[c.id] ?? c.value}
                        disabled={asking}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            [c.id]: Number(e.target.value),
                          }))
                        }
                      />
                      <div className="range-extents">
                        <span>
                          {c.min} {c.unit}
                        </span>
                        <span>
                          {c.max} {c.unit}
                        </span>
                      </div>
                      <p>{c.explanation}</p>
                    </div>
                  ))
                )}
              </div>
              {measured.length > 0 && (
                <div className="measurement">
                  {measured.map((m) => (
                    <div key={m.component}>
                      <span>Calculated period · {m.component}</span>
                      <strong>
                        {m.periodSeconds.toFixed(2)} <small>seconds</small>
                      </strong>
                      <p>T = 2π√(L/g)</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="components-header">
                <h2>Inside the picture</h2>
                <span>{scene.nodes.length}</span>
              </div>
              <div className="components-list">
                {scene.nodes.map((n) => (
                  <button
                    key={n.id}
                    aria-pressed={selected === n.id}
                    className={selected === n.id ? "selected" : ""}
                    onClick={() => setSelected(selected === n.id ? null : n.id)}
                  >
                    <span
                      className="component-swatch"
                      style={{ background: n.color }}
                    />
                    <span>{n.label}</span>
                    {selected === n.id ? (
                      <Check size={14} />
                    ) : (
                      <ChevronRight size={13} />
                    )}
                  </button>
                ))}
              </div>
              <button className="reset-link" onClick={resetScene}>
                <RotateCcw size={14} /> Reset experiment
              </button>
            </div>
          ) : (
            <div className="chat-panel">
              <div className="chat-history">
                <div className="chat-intro">
                  {demoMode && (
                    <p className="project-notice">
                      AI chat is disabled in this public preview. The
                      interactive examples remain available.
                    </p>
                  )}
                  <span className="meta-large">∞</span>
                  <h2>Stay curious.</h2>
                  <p>
                    Ask about what you see, or tell Muse what you want to
                    change.
                  </p>
                </div>
                {messages.length === 0 && (
                  <div className="chat-suggestions">
                    {scene.questions.map((q) => (
                      <button
                        key={q}
                        onClick={() => void ask(q)}
                        disabled={asking || loading || demoMode}
                      >
                        {q}
                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div className={`message ${m.role}`} key={i}>
                    {m.role === "assistant" && <strong>Muse</strong>}
                    <p>{m.content}</p>
                  </div>
                ))}
                {asking && (
                  <div className="thinking" role="status">
                    <LoaderCircle size={14} className="spin" /> Thinking with
                    your experiment…
                  </div>
                )}
                {askError && (
                  <div className="inline-error" role="alert">
                    {askError}
                  </div>
                )}
                <div ref={chatBottom} />
              </div>
              <form className="chat-form" onSubmit={submit}>
                <label className="sr-only" htmlFor="question">
                  Ask Muse about the scene
                </label>
                <textarea
                  id="question"
                  placeholder="What happens if…"
                  value={question}
                  maxLength={1200}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void ask(question);
                    }
                  }}
                />
                <button
                  className="send-button"
                  aria-label="Send question"
                  disabled={asking || loading || demoMode || !question.trim()}
                >
                  <ArrowUp size={18} />
                </button>
              </form>
              <p className="chat-note">
                Grounded in this scene. AI can make mistakes.
              </p>
            </div>
          )}
        </aside>
      </div>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="icon-button modal-close"
              aria-label="Close about dialog"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <Orbit size={32} />
            <h2 id="help-title">A playground for understanding.</h2>
            <p>
              WonderLab turns explanatory pictures into interactive 3D scenes.
              Upload a diagram or describe an idea, then explore its parts and
              ask “what if?”
            </p>
            <h3>What’s real?</h3>
            <p>
              Muse Wonder directs the explanation and Muse Image creates
              detailed cutaway artwork. Flow paths and subtle deformation are
              illustrative, not clinical or engineering simulation. The optional
              3D mode composes a scene from safe geometric building blocks. Most
              scenes are illustrative. Only the small-angle pendulum currently
              uses a validated physical equation.
            </p>
            <h3>Your picture, your choice.</h3>
            <p>
              Uploaded images are sent to Meta for processing. This app does not
              save uploads. The examples are curated scenes and are labeled as
              such. Export saves the current scene to your device.
            </p>
            <button className="primary" onClick={() => setHelp(false)}>
              Let’s explore <ArrowUpRight size={16} />
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
