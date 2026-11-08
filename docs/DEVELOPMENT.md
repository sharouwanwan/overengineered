# Fork development

The fork is https://github.com/sharouwanwan/overengineered. The original repository is the local upstream remote; origin points to the fork. Work is on codex/pvp-foundation. Main is unchanged until its draft PR is reviewed and merged.

## Checks

- npm test: deterministic regressions for saves, validation, radar, wiring, TNT, matrices, filters and server weapon rules.
- npm run watch: compile continuously and report TypeScript/Luau errors. Keep one watcher per checkout.
- npm run build: one compilation.
- npm run verify:assets: verify exports without replacing live assets.

Studio tests remain separate from these checks. Restart the play session after changes to services, remote schemas or model preparation; an already-running session does not reliably reload them.

## Developer-only weapons

All modular weapon blocks use devOnly. The existing block picker and placement checks hide/reject them for ordinary players. The server also rejects firing requests from non-developers. Studio is allowed; published games use the existing PlayerRank developer list.

Weapon markers receive named, idempotent welds before placement and before Ride mode. They are hidden during Ride and cannot collide or add aerodynamic forces. Projectiles use bounded server sweeps and anchored client visuals; lasers use server rays. These are a developer preview pending multiplayer and gameplay tuning in Studio.

Assembly discovery runs on the server only and follows replacement Blocks folders when players claim plots or reload builds. Dirty assemblies are batched at 10 Hz and flushed before firing. Queries include only that plot's weapon models; stationary assemblies do not rescan every frame. Machine gun, plasma and laser cores can emit directly; a cannon breech requires a compatible cannon base. Attach matching, aligned barrels to extend a weapon. F is the default fire key in Ride mode.

TNT uses its original Explode, Explosion radius, Explosion pressure, Flammable and Impact controls. Arming, timer, proximity and fuse outputs were removed. Swept impacts, bounded retries, server confirmation, capped blast forces and fire optimizations remain.

## Logic conventions

- Matrix3 is a distinct row-major 3x3 type. Matrix x Vector multiplies a column vector. Input/display syntax: [[1,0,0],[0,1,0],[0,0,1]]. Singular inverse returns zero with Valid=false.
- Numerical Filter supports Number and Vector3, Low-pass/High-pass, seconds-based time constant and Reset. No separate derivative block.
- Memory's default seeds the value and is used by Reset. Changing Default alone does not overwrite a stored value. Reset takes precedence over Set.
- Radial Detection Diameter is twice reach. For radius feedback, wire 2 * (Offset magnitude + margin). Section Max Distance measures cone-axis length. Any returns a valid contact without distance ranking; Nearest/Farthest rank by distance. Scenery is excluded.

## Release notes

Edit src/shared/data/UpdateHistory.ts and increment UPDATE_REVISION only for new player-facing notes. Opening UPD saves the read revision through player data. Published games persist it; the local-file Studio database is intentionally in memory. Historical entries use their recorded date where the original implementation date was not retained.

Heating and infrared sensors remain deferred.
