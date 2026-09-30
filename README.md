# SLIPSTREAM

An independent Formula-inspired browser racer. **Stage 1: First Drive** is implemented: one car, one complete circuit, and a stable driving/camera foundation. Online rooms, opponents, lap rules, and results are subsequent stages, not implemented features of this build.

## Run

Requires Node.js 22.12+ (or 20.19+) and a current desktop browser with WebGL 2.

```sh
npm install
npm run dev
```

Open **http://localhost:5173** and choose **Take the wheel**. The server also prints a LAN URL. Another device can load the build over that LAN address, but this Stage 1 build does not synchronize players.

```sh
npm run build       # TypeScript check + static production build in dist/
npm run preview     # Serve that production build locally
npm test            # Circuit and vehicle behavior tests
npm run test:browser # Chrome keyboard/UI play-test; run dev server first
npm run test:circuit # Full circuit through real browser keyboard events
npm run format      # Format source, tests, and docs
```

Browser checks use locally installed Google Chrome through Playwright. Screenshots and JSON reports go into `artifacts/` (gitignored). A static host can serve `dist/` for solo practice. Multiplayer will require the separate room server described in [the architecture notes](docs/ARCHITECTURE.md).

## Controls

| Action                         | Keyboard      | Standard controller |
| ------------------------------ | ------------- | ------------------- |
| Accelerate                     | W / ↑         | Right trigger       |
| Brake; hold at rest to reverse | S / ↓ / Space | Left trigger        |
| Steer                          | A D / ← →     | Left stick          |
| Recover to nearby centerline   | R             | Y / top face button |
| Change chase-camera distance   | C             | —                   |
| Pause / settings               | Escape        | —                   |

The browser automatically pauses when focus is lost. Click the page if keyboard input is going elsewhere. Controller support uses the standard Gamepad API mapping; physical-controller testing remains to be done. Touch driving is not implemented.

## What to try

1. Accelerate down the pit straight. 0–100 km/h takes about 3 seconds.
2. Brake before the turn by the lighthouse. Steering comes in progressively, with more lock available at low speed.
3. Try a brief lift or brake mid-corner, then accelerate on exit.
4. Run wide deliberately. Runoff reduces traction and speed; barriers absorb an impact without launching the car.
5. Press R to recover, or C to compare the close and standard chase cameras.

Cala Sola is a 1.44 km closed coastal layout. This pass uses a flat road for consistent handling; the visual island, sea, rocks, and distant scenery have height. The car is the fictional **Veloce 07**, built from original shaped bodywork, exposed tires, suspension links, halo, cockpit, and layered wings.

## Performance and assets

Low / Medium / High settings control pixel density and real-time shadows. All levels retain the car's soft contact shadow and the same art direction. Static props and car components are batched; vegetation and barriers are instanced. Fonts are local, not fetched from a CDN. The initial audio is a quiet original engine synthesizer; full sound design belongs to Stage 7.

All 3D geometry, textures, signage, liveries, UI, and synthesized audio are original to this project. Third-party fonts use the SIL Open Font License; Three.js uses MIT. See [asset credits](docs/ASSETS.md). License notices are also copied into the production build under `/licenses/`.

## Next stages

- **2 — Visual development:** refine car materials and modeling, coast and terrain, track furniture, pit lane, fencing, atmosphere, and lighting.
- **3 — Race management:** validated checkpoint progress, laps, timing, starting lights, position, and results.
- **4 — AI:** five opponents using a predictive racing line and the same vehicle simulation.
- **5 — Multiplayer:** first a tested two-player authoritative session; then private room codes, ready states, reconnects, and race results.
- **6 — Mixed grids:** always six racers, one to five humans, remaining seats filled by AI.
- **7 — Polish:** richer sound, effects, animations, performance profiling, network smoothing, and deployment.

Stage 1 intentionally ends at the handling foundation. It does not claim the finished game's visual or multiplayer scope.
