# WonderLab design

Framed-sheet app direction, seed 1665876988. The frame is tinted a quiet laboratory green; the white work surface holds the image, experiment, and controls. IBM Plex Sans is the sole text family. Color belongs to scene objects and their corresponding component swatches.

Primary question: What does this picture mean when I can manipulate it?
Signature interaction: source-image regions and 3D objects share the same selection.

Desktop: source at left, primary 3D experiment at center, controls or conversation at right. Tablet moves the inspector below the experiment. Mobile shows one panel at a time with explicit tabs. All core actions remain accessible through labeled buttons and sliders.

Initial review: frame and hierarchy clear; scene initially too small and text too fine. Increased scene scale, raised primary labels to 13px, darkened muted text, and avoided overlapping scene labels. General generated scenes need manual scientific review before stronger accuracy claims.

## Studio UI refinement

Preserved the green frame, IBM Plex Sans, and image-first identity. Desktop now fits the workspace in a bounded viewport: compact source controls, a larger central animation, and a guide with one readable explanation plus a concise phase list. Example projects are disclosed on demand. Focus view hides the side panels without losing the project. Keyboard Space controls playback, F toggles focus, and Escape exits focus. Mobile keeps explicit source / experiment / learn panels. Project import provides the handoff from MCP-generated artifacts. Primary labels and explanatory text are 13–14 px; secondary captions remain 11–12 px.
