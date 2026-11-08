import { HttpService } from "@rbxts/services";
import { Matrix3 } from "shared/blockLogic/Matrix3";
export namespace Matrix3Text {
	export function isMatrix(value: unknown): value is Matrix3 {
		if (!typeIs(value, "table")) return false;
		const record = value as Record<string, unknown>;
		return Matrix3.keys.every((k) => typeIs(record[k], "number"));
	}
	export function format(value: Matrix3, multiline = false): string {
		const rows: string[] = [];
		for (let row = 0; row < 3; row++)
			rows.push(
				"[" + [0, 1, 2].map((column) => tostring(value[Matrix3.keys[row * 3 + column]])).join(", ") + "]",
			);
		return "[" + rows.join(multiline ? ",\n " : ", ") + "]";
	}
	export function parse(text: string): Matrix3 | undefined {
		if (text.size() > 4096) return undefined;
		const [ok, decoded] = pcall(() => HttpService.JSONDecode(text) as unknown);
		if (!ok || !typeIs(decoded, "table")) return undefined;
		const rows = decoded as unknown[];
		if (rows.size() !== 3) return undefined;
		const result = { ...Matrix3.zero };
		for (let row = 0; row < 3; row++) {
			const values = rows[row];
			if (!typeIs(values, "table")) return undefined;
			const columns = values as unknown[];
			if (columns.size() !== 3) return undefined;
			for (let column = 0; column < 3; column++) {
				const n = columns[column];
				if (!typeIs(n, "number") || n !== n || math.abs(n) === math.huge) return undefined;
				result[Matrix3.keys[row * 3 + column]] = n;
			}
		}
		return result;
	}
}
