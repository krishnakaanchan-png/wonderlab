# WonderLab evaluation — 4 November 2026

Six image inputs were sent to the same Muse Wonder generation pipeline using the configured Meta API key. No subject-specific renderer branch was selected for the resulting scenes.

| Input                   | Method                                     | Result                                                          | Time | Generated objects |
| ----------------------- | ------------------------------------------ | --------------------------------------------------------------- | ---: | ----------------: |
| Pendulum diagram        | PNG derived from project SVG               | Valid physical-mode scene; read L = 3 m                         | 41 s |                 7 |
| Water-cycle diagram     | PNG derived from project SVG               | Valid illustrative scene with flow connections                  | 45 s |                10 |
| Planetary-orbit diagram | PNG derived from project SVG               | Valid illustrative orbital scene                                | 25 s |                 9 |
| Open electrical circuit | New diagram uploaded through browser UI    | Valid illustrative scene; recognized open switch and unlit lamp | 35 s |                14 |
| Water molecule          | New diagram, absent from saved examples    | Valid illustrative molecular scene                              | 30 s |                 9 |
| Tilted/blurred pendulum | Synthetic rotation, blur, JPEG compression | Valid physical-mode scene                                       | 34 s |                11 |

These are observed single runs, not benchmark averages. The tilted input is a synthetic photo-like perturbation, **not a camera photograph**. Valid schema does not establish scientific correctness. The set is small and not representative of arbitrary images.

## Conversation check

On the newly generated circuit, asked: “Why is the lamp off? Make the lamp more transparent so I can inspect it.” Muse explained the open path and returned an action changing the lamp opacity from 0.9 to 0.3. It explicitly distinguished transparency from calculated brightness/current. The UI displayed the answer and applied the parameter change.

## Remaining quality limits

- Dense diagrams need selective labels; not every component can be labeled at once without clutter.
- Model-generated bounding boxes are approximate and should be inspected.
- Procedural primitives produce stylized geometry, not faithful CAD reconstruction.
- Parameter changes are scoped to individual objects, except the supported pendulum relationships.
- The image model may add conceptual elements not pictured; source readings and assumptions must distinguish these.
- No expert review, real camera-image study, or public load test has been completed.

## Application checks

- TypeScript typecheck, eight automated tests, and production build passed.
- Production initial HTML response verified HTTP 200 after moving Three.js behind a client-only import (its module-scope AbortController is rejected by Cloudflare SSR).
- Keyboard slider check: length 0.5 m produced a 1.42 s period; reset restored 3 m and 3.47 s.
- Responsive inspector checked 1440, 768, and 390 px. No measured failures; one small-caption typography warning remains. Primary controls use 13–14 px text; secondary captions use 11–12 px.
- Source scan found no API key in tracked files. Local credentials remain ignored; hosted credentials are stored as a secret.

## Rendering upgrade

The scene schema now supports 13 geometry types and nine surface presets. Eleven tests pass, including finite-vertex checks for every geometry and rejection of malformed profiles/paths. The water-cycle saved example now uses an actual Muse-generated 17-component scene, including four curved paths and material choices. Generation completed in 43 seconds in this run. A scene replacement race was fixed: animation frames belonging to the old mesh map stop before reading the new scene. Original scientific limitations remain unchanged.

## Image-backed animation update

User feedback on the heart established that richer primitive materials were insufficient. The accepted direction is now a polished animated cutaway.

- Muse Image generated the new heart artwork in 28 seconds from the diagram visible in the user's supplied screenshot.
- Muse Wonder mapped ten parts and five routes into four coordinated phases. The sample's suggestions were edited into learning questions; explicit limitations note static valve artwork and unreviewed anatomical detail.
- A separate water-cycle image completed the complete streaming pipeline in 67.2 seconds, producing a landscape cutaway and five teaching phases.
- Browser pause held the timeline at 0.85 seconds. Selecting ventricular ejection activated the right-ventricle/pulmonary-artery and left-ventricle/aorta routes together. No browser console errors occurred in that check.
- Fifteen automated tests cover prior functionality plus phase boundaries, loop wrap, coordinated contractions, path interpolation, and invalid references.

These are illustrative animations over generated artwork, not 3D reconstructions, clinical cardiac simulations, or verified anatomy. Heart-flow direction was cross-checked against the NHLBI explanation: https://www.nhlbi.nih.gov/health/heart/blood-flow . A medical illustrator has not reviewed the generated image.

## Component-pose animation

- Generated three additional heart poses with Muse Image (20–29 seconds per pose in the trial).
- Composited motion only within the annotated moving regions, keeping unrelated vessel ends and background anchored to the base illustration.
- Bidirectional optical-flow interpolation runs in a web worker. Tests verify a known synthetic translation, near-zero motion for static inputs, and phase/pose identifier consistency.
- Captured eight seconds of the actual image canvas to `component-motion.webm`; this excludes every SVG flow line, particle, and label overlay. Contact-sheet inspection shows changes in the ventricular cavity, wall, and valve artwork.
- The worker's initial file-URL issue under Vinext was fixed by loading a bundled worker URL relative to the application's HTTP origin.
- Anatomical correctness has not been established. Generated pose details and image morphing remain illustrative.

## Studio UI and MCP prototype

- UI now uses a bounded desktop workspace, collapsible example library, compact guide, focus view, keyboard playback/focus controls, and validated JSON project import.
- Official MCP SDK client tests passed over stdio and Streamable HTTP. HTTP tests rejected missing credentials and untrusted Origin headers.
- Job tests cover asynchronous completion, duplicate request keys, concurrency limits, persistence, interrupted restarts, and directory/symlink boundaries.
- A real stdio MCP job generated “Simple Pendulum: Swing and Period” with Muse in about 35 seconds. The resulting 8 KB project was imported through the actual browser file input and displayed with an “Imported project” caption.
- The MCP service is standalone, single-tenant, and filesystem-backed. It is not running at the hosted studio URL and has not been connected to the user's custom agent deployment.

## Submission release check

The final suite contains 26 passing tests, including the public-demo guard. A fresh request to the complete current `/api/cutaway` pipeline, using the authored water-cycle PNG, produced 7 components, 5 phases, and 5 pose images in 98 seconds. This is one observed run, not an average. The self-contained project and stage timings are included in the submission package as a recording fallback.
