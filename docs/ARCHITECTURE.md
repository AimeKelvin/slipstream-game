# Architecture

Vite serves the TypeScript client. Three.js renders the circuit; HTML/CSS provides menus, racing HUD, tyre condition and the pit-braking guide. A Node/Express/WebSocket server owns online race state.

## Shared simulation

`Circuit` produces a closed, 3.16 km centripetal spline with 1,800 arc-length samples. It is 2.2 times the original circuit's length while retaining a 13 m road. Physics, AI, checkpoints, road meshes, scenery placement and minimap coordinates derive from this geometry. The island and scenery distribution expand with the circuit; car and garage dimensions stay at human scale.

`VehiclePhysics.step(input, dt)` runs at 120 Hz and only accepts throttle, brake and steering. Serializable state includes velocity, tyre condition, pit assignment, pit request, pit phase, stop rating and service countdown. It has no renderer or browser dependencies. Its bicycle model uses filtered steering, speed-dependent grip, downforce, drag and barrier contact. Worn tyres progressively reduce lateral grip, braking and drive force without sudden spins or a puncture mechanic.

`Tyres` computes wear from distance with extra wear for cornering load, slip and off-track running. Standing still does not wear tyres. Normal recovery preserves tyre condition; starting a new session or completing pit service restores it.

## Laps and race rules

`RaceProgress` accumulates bounded, ordered progress around the full circuit and tracks three sector gates per lap. It records current, last and best lap times plus finishing time. Reverse crossings do not award laps; large contact jumps do not advance distance. Off-track driving, a large jump, or recovery makes the current lap ineligible for a best time. Pit travel advances the same circuit progress, and service time remains part of lap and race time.

Practice uses the same lap logic with unlimited laps. Online races last three laps, with six cars and up to five humans. AI fills vacancies and drives for paused, disconnected or finished players. The server owns all lap, tyre, pit and result calculations; clients cannot submit transforms, tyre values or service outcomes.

## Pit lane and braking challenge

`PitLane` owns the route, entry/exit indices, six assigned box coordinates, speed limit, and geometric transforms. `PitVisual` uses the same definitions for asphalt, painted rectangles, numbered garages, the player marker and crew. Colours and driver names follow the room profiles.

The driver requests or cancels a stop with P, the HUD button or the controller's left face button. At the entry gate, the shared simulation guides the car into the lane and progressively applies an 80 km/h limiter. Steering is assisted while throttle and brake remain with the driver. The path visits only the assigned box, making the challenge about braking rather than fighting a narrow lane.

`PitStop` handles four states:

1. Track driving, with an optional queued pit request.
2. Pit approach, with stopping-position scoring.
3. Stationary service; input cannot move the car or skip the countdown.
4. Pit exit, followed by normal steering and physics.

The car must be nearly stationary and braking briefly near its own box. Centre error up to 1.1 m earns 2.4 s, up to 3.3 m earns 3.3 s, and a missed box costs 4.5 s. Very early stops require moving forward; a completely missed braking point triggers a short recovery stop. Tyres restore only at service completion. Recovery cannot skip an active stop. Guided pit cars do not collide with one another, keeping the small multiplayer grid free of pit-lane blocking.

The HUD projects full-braking stopping distance against the rectangle. Crew and wheel-removal animations derive from the shared service countdown. AI uses the same lane, braking input, wear and service rules.

## Networking and rendering

The server sends snapshots at 20 Hz. Local players predict 60 Hz input using the shared 120 Hz simulation, reconcile acknowledged inputs, and interpolate between prediction steps. Opponents render from a 100 ms snapshot buffer. Recoveries, control handoffs and pit-phase changes clear stale prediction. Reconnect tokens restore the same seat for 60 seconds; tyre and pit state stay on the server throughout a disconnect.

Static environment and track furniture are batched by material. Trees, barriers and pit crew use instancing. Distance boards share three textures. Quality settings control pixel ratio and shadows; the directional-light shadow region follows the player. Pit animation uses instance-matrix updates without creating meshes each frame.

The engine loops a bundled CC0 real-car recording, crossfades its seam, filters harsh frequencies, and varies pitch and level with driving. Volume and mute are saved locally.

## Hosting and validation

The production Node server serves the client and `/ws` on one port. Rooms live in memory and require a single server instance; a restart ends current rooms. See README for local, LAN and public-hosting instructions.

`npm test` covers shared physics, wear, grip loss, all six boxes, service scoring and completion, lap validation, AI full races, WebSocket room lifecycle and prediction. Chrome checks cover solo controls, two-player sessions, perfect/missed braking, pit exit, service reconnects, and a full keyboard-driven lap. Browser reports and screenshots are stored in `artifacts/`.

This is an accessible Formula-inspired racer. Guided pit steering, automatic limiting and short service penalties are deliberate simplifications; it does not simulate tyre temperatures, compounds, fuel or official sporting regulations.
