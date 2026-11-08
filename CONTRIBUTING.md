# Contributing

We appreciate your interest in contributing. This document provides guidelines for contributing to the project.

## CLI

- `npm i` - Install node libraries
- `lune list` - List of available toolchain scripts
- `lune run assemble` - Build a place.rbxl file to work with
- `node scripts/save-assets.js` - Save changed assets from place.rbxl, not needed when place file assets watcher is running

### Development

- `npm run dev` - Runs all watchers
- `npm run watch` - Runs only roblox-ts compiler
- `npm run rojo` - Runs only rojo
- `node ./scripts/lunewatch.js` - Runs only place file assets watcher

## Development Workflow

- Ensure your code adheres to the project's style guidelines (ESLint and Prettier are utilized).
- Thoroughly test your changes.
- Execute `npm run build` to verify compilation.

## Pull Request Process

1. Implement your changes and test them.
2. Commit your changes with clear, descriptive messages.
3. Push your changes and create a Pull Request.
4. Await review.

## What PRs will never be accepted

- Systems for transferring/sharing slots
- "Unrealistic" or game-breaking changes, such as switchable anchors
- Trivial changes to comments

Note: There is a distinction between our proprietary database version and the public GitHub version. Slot limitations differ significantly; our database accommodates up to 16 megabytes of data, while Roblox's conventional method is restricted to 4 megabytes. This disparity influences capacity and may pose current challenges.

## Reporting Issues

Utilize GitHub Issues to report bugs or suggest features.

## Code of Conduct

Maintain respectful and constructive communication.


## Regression and performance checks

- `npm test` runs isolated regression checks for failed-save retries, dirty-cache retention,
  write coalescing, updates made during backend reads/deletes, remote validation and
  throttling, foreign-block rejection, and failed asset exports. These use mocked
  Roblox services; they do not replace a Studio session.
- `npm run benchmark` compares the old repeated block-count scan with indexed counts
  at 1,000, 5,000 and 10,000 blocks. The operation counts show scaling; the JavaScript
  timings are not Roblox frame-time measurements.
- `npm run verify:assets` runs real Lune extraction into an ignored `.asset-export-*`
  directory without replacing `game`. Inspect that directory to review the result.
  Normal asset exports retain the previous `game` directory as `backup` in staging.
- If the compiler exhausts Node memory, run
  `node --max-old-space-size=8192 node_modules/roblox-ts/out/CLI/cli.js`.

### Studio integration checks

Use a disposable test place and test data, with two local players:

1. Place, edit, paint, wire and delete blocks; verify both clients see the changes.
   Exercise large builds, block limits, displays, projectiles and particle effects.
2. Save and load a slot, then test invalid saved data. A failed load must preserve
   the previous build; a failed save must not update the client's slot metadata.
3. Change settings rapidly, leave within the coalescing interval, and rejoin. Verify
   the final settings persist and server shutdown flushes dirty records.
4. Send malformed requests and requests referencing the other player's blocks.
   Verify rejection without changes to either plot. Check valid requests resume
   after a rate-limit window expires.
5. Ride above and below the terrain-loading altitude, then return. Confirm chunks
   load and unload correctly. Repeatedly spawn/destroy impact and motor blocks and
   inspect connection and memory counts for growth.
6. Profile 1,000/5,000/10,000-block loads and destruction in MicroProfiler. Record
   server frame time, memory and remote traffic before treating the algorithm
   benchmark as an in-game performance result.

### Gameplay changes and Studio verification

- Ragdoll builds joints as they appear, keeps the neck safe while motors are
  disabled, disables constraints while walking, and cancels obsolete recovery work.
  Upgraded avatars release their AnimationConstraint drivers and use their existing
  physical sockets; legacy avatars retain the Motor6D path. The local Animate script
  and active tracks pause during ragdoll and resume on recovery.
  Local Studio verification on 2026-11-07 reproduced the stiff animated R15 fall
  before this fix. Afterward, X released 14 R15 / 5 R6 limb drivers, with zero
  playing tracks and health 100. Both recovered to Running with every driver
  restored and animation resumed. R6 was replaced during play to exercise character
  rebinding; repeated activation and a moving R6 fall also passed. These checks
  used one client, not a multiplayer latency test.
- TNT uses relative contact velocity plus a swept sphere for fast movement. Reports
  retain their original position/time across two bounded retries. The server accepts
  a source once, validates a maximum 500 ms report age and bounded position error,
  and checks recent moving-block poses without rewinding live physics. History is
  sampled at 10 Hz, capped at 12 snapshots and 10,000 colliders per snapshot.
  This is bounded compensation, not a guarantee of identical physics at every latency.
- Radar Section uses a wireframe cone, Cone Angle and up to 40,960 studs of range.
  Its bounded scanner enumerates cached build containers only, never world scenery.
  Radial Radar uses build-only spherical distance checks up to a 20,480-stud
  diameter, with a three-ring wireframe. RWR reads both radar field geometries.
- PID preserves the original connectors/default gains. Optional settings add
  derivative-on-measurement, derivative filtering (seconds), output limits and reset.
  Output limiting enables conditional anti-windup. Invalid numbers reset state;
  zero-duration ticks hold output. Long gaps restart derivative history and cap
  the integration step at 250 ms. Existing zero integral bounds still disable I.

Before release, test R6/R15 manual activation/recovery and respawn; TNT impacts
between two moving vehicles with latency simulation; radar visibility, self-filtering,
minimum distance zero and large block counts; PID tuning and saved configuration
round-trips. The Node regression harness mocks Roblox APIs and cannot establish
multiplayer physics correctness or in-game frame-time improvements.

### Fire/explosion upgrade (awaiting Studio verification)

Fire schedules at most 16 ignitions and eight due spread jobs per heartbeat,
with 1/2 ms scheduling budgets. Client visuals are clustered within six studs,
limited to 48 groups within 400 studs, and use pooled emitters at 15 particles/sec.
Only the first eight groups get shadowless lights. Fire sensors read replicated
active-fire state independently of cosmetic effects. Suppressed visual effects
are omitted for that ignition, rather than restored when the camera approaches.

Removed client normalization forces targeting the origin. Explosion knockback
has distance falloff and an assembly velocity-change budget of 62.5 studs/sec
per 100 ms. Detection proxies are excluded from explosion damage and ignition.
Joint-breaking probability and normal debris cleanup remain; broken parts carry
LastDamageCause for inspection. Explosion particles use fixed bursts.

Pending Studio checks: fire sensor with effects disabled; dense fire and
simultaneous TNT profiling; small/large vehicle knockback with latency and
ownership changes. No Studio tests were performed for this upgrade.

Radar Section preserves the extended wireframe cone without world overlap queries.
Build candidates are cached until build-container membership changes. Each scan
processes at most 256 candidates or 2 ms per scheduler turn. Detect Players defaults
off and adds living character roots. Hold Lost Target defaults off on both detectors
and RWR, retaining last known world positions while lost; disabling clears memory.
RWR count remains live. Full-range cone math and build-only registry behavior are
covered by the Node regression harness; Studio detection checks remain pending.

Block search now debounces typing, matches normalized words in any order with
literal substring matching, and shares build counts. Preview cloning is limited
to two visible cards per frame; off-screen models do not animate. Hollow half/
quarter shape names are consistent without changing saved block IDs.
Studio validation for these final changes is deferred at the user's request.
