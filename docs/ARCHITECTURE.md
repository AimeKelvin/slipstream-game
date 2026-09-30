# Architecture

## Implemented in Stage 1

Vite serves a TypeScript application. Three.js renders the scene. Plain HTML/CSS handles menus and HUD so we do not need a UI framework for a small number of screens.

```text
src/
  core/       Lifecycle, fixed-step loop, input, configuration, math
  vehicle/    Renderer-independent vehicle state + separate Formula model
  camera/     Damped third-person follow and title camera
  track/      Arc-length circuit, road geometry, environment
  render/     Renderer, quality, materials, geometry batching
  ui/         Title, free-practice HUD, pause/settings, minimap
  audio/      Original layered engine synthesis
tests/        Vehicle and circuit behavior tests
scripts/      Real-browser keyboard and visual checks
```

### Driving

`VehiclePhysics.step(input, dt)` receives normalized input and advances serializable vehicle state. It has no renderer, browser, audio, or wall-clock dependencies. The simulation runs at 120 Hz, independent of display refresh. Previous/current positions interpolate for rendering. A 100 ms frame-time cap prevents a hidden tab or stalled frame from triggering a simulation catch-up spiral; focus loss pauses solo practice.

The planar bicycle model uses filtered steering, wheelbase-based yaw, a speed-dependent lateral grip envelope, drag, progressive engine force, braking, and damped lateral compliance. Downforce raises the grip ceiling modestly at speed. Body roll/pitch are visual weight-transfer cues. They never feed back into collision or handling.

This is an arcade handling model, not rigid-body vehicle simulation. It deliberately avoids wheel suspension solvers, rollover, fragile tire slip, and arbitrary spin impulses. Reverse is capped at 32.4 km/h. There is no handbrake because it would work against the intended Formula handling.

### Circuit and contact

`Circuit` produces a closed centripetal spline with 900 samples distributed by arc length. Road, barriers, reset locations, and minimap derive from the same source. Contact projects the car onto nearby centerline segments; normal driving only searches a local neighborhood. A global search is available for initial placement and tooling.

The road is 13 m wide, with curbs and runoff. Barrier contact projects the car's oriented length and width onto the barrier normal, constrains the center so the nose and tires stay inside, and removes outward velocity with a small restitution impulse. This is an approximate boundary collision model; wheel-by-wheel contact, car-to-car impacts, pit entry, and shortcuts are later-stage work. Grass/gravel currently share a low-grip offroad response.

### Camera

Heading, follow position, look target, and FOV have separate exponential damping. Velocity feed-forward compensates camera lag so acceleration does not make the car disappear into the distance. Speed increases FOV from 53° toward 61°. Steering adds a limited look-ahead offset. Reset snaps camera and car together. No artificial shake or motion blur is used.

### Rendering

ACES tone mapping, environment lighting, one shadowed directional light, hemisphere fill, distant fog, and an original coastal palette establish the first art pass. The dynamic shadow region follows the player and snaps to texel-sized positions. The small visual island bounds scenery cost. Static environment props are merged by material, shadow behavior, and vertex-attribute layout; vegetation and barriers use instancing. The car batches separately movable assemblies. A projected contact shadow survives Low quality.

Medium caps pixel ratio at 1.5 and uses a 2048 shadow map. Low caps pixel ratio at 1 and disables dynamic shadows. High permits pixel ratio 2. The implementation avoids postprocessing buffers and large downloaded textures. Browser tests report FPS, draw calls, and triangles, but a local headless result is not a cross-device performance guarantee.

## Planned multiplayer architecture — not implemented yet

Use a small Node.js WebSocket server hosting authoritative rooms. Clients are not simulation hosts, so a human leaving does not require host migration. The room creator is a lobby organizer whose start/rematch privileges can transfer to the oldest remaining human.

- At most five human seats and six racers total. AI runs on the server using the same input-driven physics. One human produces five AI; five humans retain one AI.
- Each room owns its grid, seed, clock, race state, readiness, validated checkpoint progress, and results.
- Clients send sequenced input at approximately 60 Hz. The server simulates at the shared fixed timestep and sends compact snapshots around 20 Hz.
- The local player predicts with the shared simulator and reconciles to acknowledged inputs. Render corrections are smoothed rather than teleporting the displayed car.
- Remote players and AI render from a short interpolation buffer. Brief packet gaps allow bounded extrapolation; longer gaps hold a sensible state.
- Countdown uses a server start timestamp and a measured clock offset. The server alone validates laps, finishes, and standings.
- A reconnect token reserves the same driver identity for a grace period. During a disconnect, AI temporarily drives that car. On rejoin, authority returns at a snapshot boundary.
- Empty rooms expire. A server restart ends rooms cleanly with a clear disconnect message; persistence is unnecessary for initial private sessions.
- Public deployment uses HTTPS for the client and WSS for the server. The static Stage 1 build needs neither accounts nor a server secret.

Do not add networking to the display meshes, UI, camera, audio, wheel animation, or scenery. Those are client-derived. Shared simulation/race modules will move into an explicit shared package when Stage 3/5 creates the server boundary. This keeps Stage 1 understandable without prematurely implementing unused room abstractions.

## Validation

`npm test` covers circuit continuity/separation, acceleration/braking, reverse, steering response, barrier stability, and a whole-circuit predictive test driver. That test driver is test-only and is not the future AI implementation.

`npm run test:browser` starts installed Chrome, captures title/driving/pause/small-layout screenshots, drives with actual key events, verifies reset/reverse/pause/settings, and fails on browser console errors. `npm run test:circuit` steers a complete circuit with keyboard events, checking progress, track departure, collision reports, and errors.

Remaining qualitative validation: physical controller ergonomics, sustained driving on lower-end integrated GPUs, and human preference for steering/camera tuning. Automated checks establish stability and functionality, not whether every player will find the handling fun.
