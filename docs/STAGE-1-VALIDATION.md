# Stage 1 validation

Verified locally on September 30, 2026, using Node 24 and installed Google Chrome through Playwright. Browser captures use a 1440 × 900 viewport at device pixel ratio 1. These measurements describe this machine and test, not every laptop.

## Passed

- TypeScript strict checking and Vite production build. Production JavaScript is approximately 148 kB gzipped; all static output, including font fallbacks and license notices, is approximately 832 kB on disk. Vite reports its standard >500 kB uncompressed chunk advisory for the Three.js bundle.
- Six simulation tests: circuit continuity and separation, 0–100 km/h acceleration and braking, coast/reverse, progressive steering and centering, barrier collision stability, and a full predictive circuit drive.
- Browser keyboard tests: acceleration, braking, right steering, reset, reverse, camera toggle, pause/resume, session-clock freeze, graphics selection, audio toggle, title return, and a narrow viewport.
- Deliberate browser wall impact and successful recovery back onto the circuit. No invalid vehicle coordinates. Screenshot inspection exposed nose overlap in the initial collision margin; the final version projects the full oriented car footprint against the barrier and includes a regression assertion.
- Focus-loss pausing and input release; returning to the game does not retain throttle.
- A complete circuit driven via actual browser keyboard events: 910 centerline segments traversed (900 per lap), zero impacts, maximum centerline deviation 3.48 m on a 13 m wide road, and no browser errors.
- The circuit drive reported 59–60 FPS locally. Title-scene rendering decreased from 168 to 63 draw calls after batching; measured counts vary with camera visibility.
- Inspected title, grid, driving, cornering, pause, small-layout, and collision screenshots. Adjusted asphalt contrast, lighting, camera follow lag, reversed wing lettering, and stale toast visibility after inspection.

## Reproduce

Start `npm run dev`, then run `npm test`, `npm run test:browser`, and `npm run test:circuit`. The final command takes roughly 80 seconds. Avoid editing application source during browser tests, since Vite reloads the active page.

The scripts write screenshots and telemetry into `artifacts/`. Those files are local evidence and are intentionally gitignored.

## Still to validate

Physical-controller feel, lower-end integrated graphics hardware, other browser engines, and human preference for handling/camera tuning. Automated driving demonstrates stability and usability of the controls, but cannot establish subjective fun.

AI, race rules, lap validation, multiplayer rooms, and network tests are not part of this Stage 1 build.
