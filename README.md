# SLIPSTREAM

A Formula-inspired browser racer set on the expanded **3.16 km Cala Sola Grand Prix circuit**, over twice the original length. Race a private six-car grid with up to five human players and AI filling the remaining seats, or take the car out for solo practice.

## Run

Requires Node.js 22.12+ and a current desktop browser with WebGL 2.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. Development starts both Vite and the authoritative room server; Vite proxies `/ws` to port 3001.

1. Choose **Race with friends**, enter a name, and pick one of six car colours.
2. Create a private room and send its invite link or six-character code to friends.
3. Everyone chooses **I'm ready**, then the host starts the race.
4. Race three complete laps, managing tyre grip and a timed pit stop. Results include finishing order, race time, and best lap. The host can open a rematch.

Names and colours are saved on your device. **Edit your name & colour** in the lobby lets you change them before the next race; saving clears your ready state. Car paint, minimap dots, lobby rows, and standings all use the chosen colour. Car numbers distinguish drivers who pick the same colour.

For another device on the same Wi-Fi, open the LAN URL printed by Vite. For friends elsewhere, run the production server at a public HTTPS address; a localhost or private LAN invite only works on its own machine or network.

## Production

```sh
npm run build
npm start
```

The Node server serves `dist/` and WebSockets on the same port (`PORT`, default 3001), with `/health` for health checks. `render.yaml` includes a deployment configuration. HTTPS hosting must forward WebSocket upgrades to `/ws`. Use one server instance: room state lives in memory, and restarting the server expires existing rooms. Static hosting or `npm run preview` supports solo practice only.

## Controls

| Action                         | Keyboard                      | Standard controller  |
| ------------------------------ | ----------------------------- | -------------------- |
| Accelerate                     | W / ↑                         | Right trigger        |
| Brake; hold at rest to reverse | S / ↓ / Space                 | Left trigger         |
| Steer                          | A D / ← →                     | Left stick           |
| Recover to nearby centerline   | R                             | Y / top face button  |
| Request / cancel a pit stop    | P or the on-screen pit button | X / left face button |
| Change chase-camera distance   | C                             | —                    |
| Pause / settings               | Escape                        | —                    |

Practice pauses on loss of focus. Online races keep running, with AI driving your car while paused or disconnected. A disconnected seat is reserved for 60 seconds, and reconnecting or reloading the same tab restores it. The host role transfers to another connected player when the host leaves. Touch driving is not implemented.

## Laps, tyres and pit stops

Practice now records complete laps, three-sector progress, last lap, and personal best. Online results remain server-authoritative. A lap must cover the complete circuit in order; reversing over the line cannot earn laps. Going off-track or recovering with R invalidates that lap for best-lap timing, while race position and completed distance still count. Pit-lane travel counts normally and service time remains part of your lap.

Tyres wear with distance, cornering load, sliding and off-track running. The tyre meter changes from green to amber to red; worn tyres gradually lose cornering grip, braking strength and acceleration. Smooth inputs extend a stint. A new race starts on fresh tyres; R does not refresh them. AI uses the same tyre model and makes a stop during the three-lap race.

Press **P** to call your crew before pit entry. Keep driving on the circuit: the game guides you into the marked pit lane and applies the **80 km/h limiter**. Steering is assisted in the lane; you control throttle and brake. Follow your numbered team sign and floating marker to your rectangle. The braking guide projects your stopping point assuming full braking: brake when its white marker reaches the green centre, then hold the brake until stopped.

- **Perfect:** within 1.1 m of the target — **2.4 s** tyre change.
- **Good:** within 3.3 m — **3.3 s**.
- **Missed / outside the box:** the crew adjusts — **4.5 s**.

Stopping far before your box asks you to roll forward. If you completely miss the braking point, the pit assist catches the car so you cannot get trapped. The crew animates the wheel change, the car is held for service, and tyres restore only when service finishes. Accelerate on release; normal steering returns at pit exit. Each of the six cars has its own numbered, colour-matched garage and crew. Pausing, reconnecting, or reloading does not skip a service.

## Smoothness and sound

The server runs shared vehicle physics at 120 Hz and broadcasts snapshots at 20 Hz. Local input prediction, reconciliation, rendering between prediction steps, and a 100 ms opponent interpolation buffer keep controls responsive and motion smooth. Graphics settings control resolution and shadows; static geometry is batched and track props are instanced.

The engine uses a bundled real-car recording from OpenGameArt under CC0, with a crossfaded loop, gentle filtering, throttle response, and pitch changes for gear shifts. Settings include an engine volume slider (40% by default) and a saved sound toggle. Countdown cues remain quiet synthesized tones. Asset provenance is in [the credits](docs/ASSETS.md) and `/licenses/Car-engine-CC0.txt`.

## Checks

```sh
npm test                 # Physics, race rules, WebSocket rooms, profiles, prediction
npm run build            # TypeScript and production client/server builds
npm run test:browser     # Solo driving, settings, pause, collision and recovery
npm run test:multiplayer # Two Chrome sessions: profiles, racing, audio, reconnects
npm run test:circuit     # Full 3.16 km lap through real browser keyboard events
npm run test:pits        # Precise/missed stops, pit exit and service reconnect
```

Browser checks require the development server and locally installed Google Chrome. Screenshots and telemetry are saved in the gitignored `artifacts/` directory. Tests cover a full AI race, authoritative results, and rematches. Internet latency and physical controllers still depend on your network and hardware.
