import { Objects } from "engine/shared/fixes/Objects";
type OfBlocks<T> = object & { readonly [k in BlockUuid]: T };
/** Return the value if all of them are the same; Returns undefined otherwise */
export const sameOrUndefined = <T>(configs: OfBlocks<T>, comparer?: (left: T, right: T) => boolean) => {
	let value: T | undefined;
	for (const [_, config] of pairs(configs)) {
		if (value !== undefined && !(comparer?.(value, config) ?? value === config)) {
			value = undefined;
			break;
		}

		value = config;
	}

	return value;
};
export const sameOrUndefinedBy = <T, U>(config: OfBlocks<T>, func: (value: T) => U) => {
	if (Objects.size(config) === 1) {
		const first = firstValue(config)!;
		return func(first);
	}

	const mapped: Writable<OfBlocks<U>> = {};
	for (const [uuid, v] of pairs(config)) {
		const value = func(v);
		if (value === undefined) {
			return undefined;
		}

		mapped[uuid] = value;
	}

	const same = sameOrUndefined(mapped);
	return same;
};

/** Map the config values, leaving the keys as is */
export const map = <T, TOut extends defined>(
	configs: OfBlocks<T>,
	mapfunc: (value: T, key: BlockUuid) => TOut,
): OfBlocks<TOut> => {
	return asObject(asMap(configs).mapToMap((k, v) => $tuple(k, mapfunc(v, k))));
};

//
