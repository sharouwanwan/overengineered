import { Players, RunService } from "@rbxts/services";

type Budget = { start: number; requests: number; nodes: number; bytes: number };
const budgets = new Map<Player, Budget>();
if (RunService.IsServer()) Players.PlayerRemoving.Connect((player) => budgets.delete(player));
export const finite = (value: unknown): value is number =>
	typeIs(value, "number") && value === value && math.abs(value) < math.huge;

/** Bound traversal before invoking handlers, including nested tables and encoded configuration strings. */
export function validPayload(value: unknown, budget?: Budget): boolean {
	const seen = new Set<object>();
	let nodes = 0;
	let bytes = 0;
	const visit = (v: unknown, depth: number): boolean => {
		if (++nodes > 100000 || depth > 32 || (budget !== undefined && ++budget.nodes > 500000)) return false;
		if (v === undefined || typeIs(v, "boolean")) return true;
		if (typeIs(v, "number")) return finite(v);
		if (typeIs(v, "string")) {
			bytes += v.size();
			if (budget) {
				budget.bytes += v.size();
				if (budget.bytes > 8 * 1024 * 1024) return false;
			}
			return bytes <= 2 * 1024 * 1024;
		}
		if (typeIs(v, "Vector3")) return finite(v.X) && finite(v.Y) && finite(v.Z);
		if (typeIs(v, "Vector2")) return finite(v.X) && finite(v.Y);
		if (typeIs(v, "Color3")) return finite(v.R) && finite(v.G) && finite(v.B);
		if (typeIs(v, "CFrame")) {
			for (const n of [...v.GetComponents()]) if (!finite(n)) return false;
			return true;
		}
		if (typeIs(v, "UDim")) return finite(v.Scale) && finite(v.Offset);
		if (typeIs(v, "UDim2")) return visit(v.X, depth + 1) && visit(v.Y, depth + 1);
		if (typeIs(v, "Rect")) return visit(v.Min, depth + 1) && visit(v.Max, depth + 1);
		if (typeIs(v, "NumberRange")) return finite(v.Min) && finite(v.Max);
		if (typeIs(v, "NumberSequence") || typeIs(v, "ColorSequence")) {
			for (const point of v.Keypoints) if (!visit(point, depth + 1)) return false;
			return true;
		}
		if (typeIs(v, "NumberSequenceKeypoint")) return finite(v.Time) && finite(v.Value) && finite(v.Envelope);
		if (typeIs(v, "ColorSequenceKeypoint")) return finite(v.Time) && visit(v.Value, depth + 1);
		if (typeIs(v, "Instance") || typeIs(v, "EnumItem")) return true;
		if (!typeIs(v, "table") || seen.has(v)) return false;
		seen.add(v);
		for (const [key, child] of pairs(v as Record<string, unknown>)) {
			if (!visit(key, depth + 1) || !visit(child, depth + 1)) return false;
		}
		seen.delete(v);
		return true;
	};
	return visit(value, 0);
}

export function acceptRemote(player: Player, arg: unknown): boolean {
	const now = os.clock();
	let budget = budgets.get(player);
	if (!budget || now - budget.start >= 1) {
		budget = { start: now, requests: 0, nodes: 0, bytes: 0 };
		budgets.set(player, budget);
	}
	if (++budget.requests > 512) return false;
	return validPayload(arg, budget);
}
