// Increment for newly published notes. Historical groups share their recorded date.
export const UPDATE_REVISION = 2;
export const UPDATE_HISTORY = [
	{
		title: "PvP & Logic",
		date: "8 Nov 2026 · Developer preview",
		items: [
			"Weapons restricted to developers while fixes are tested.",
			"TNT arming, timed fuse and proximity trigger.",
			"Matrix blocks and readable matrix editing/display.",
			"Smoother wing physics and wind updates.",
		],
	},
	{
		title: "Control & Tracking",
		date: "8 Nov 2026",
		items: [
			"Radar range fix; Any, Nearest and Farthest selection.",
			"Section reach: 15,000 studs. Radial reach: 7,500 studs.",
			"Mouse click outputs; low/high-pass Numerical Filter.",
			"Wireable Memory default and saved update notifications.",
		],
	},
	{
		title: "Radar & Building",
		date: "Earlier work · recorded 8 Nov 2026",
		items: [
			"Wireframe radar views; scenery excluded from scans.",
			"Player detection and Hold Lost Target options.",
			"Faster search, consistent part names and wiring fixes.",
			"Backmount equip range limited to five studs.",
		],
	},
	{
		title: "Reliability",
		date: "Earlier work · recorded 8 Nov 2026",
		items: [
			"Manual R6/R15 ragdoll and PID controller fixes.",
			"TNT hit synchronization, capped knockback and faster fire.",
			"Save retries, migrations and remote validation.",
			"Terrain, asset export and build-tool improvements.",
		],
	},
] as const;
