import { formatDatabaseBackendKeys } from "engine/server/backend/DatabaseBackend";
import { Objects } from "engine/shared/fixes/Objects";
import { Throttler } from "engine/shared/Throttler";
import type { DatabaseBackend } from "engine/server/backend/DatabaseBackend";

interface DbStoredValue<T, TKeys extends defined[]> {
	keys: TKeys;
	value: T;
	changed: boolean;
	lastAccessedTime: number;
	lastSaveTime: number;
}
abstract class DbBase<T, TDb, TKeys extends defined[]> {
	private readonly cache: { [k in string]: DbStoredValue<T, TKeys> } = {};
	private readonly saving = new Set<string>();
	private readonly scheduled = new Map<string, object>();
	private readonly currentlyLoading: Record<string, Promise<T>> = {};

	constructor(private readonly datastore: DatabaseBackend<TDb, TKeys>) {
		game.BindToClose(() => {
			$log("Game termination detected");

			this.saveChanged();
			this.freeAll();
		});

		task.spawn(() => {
			const freeTimeoutSec = 5 * 60;
			const saveTimeoutSec = 9 * 60;
			$debug(`Initializing db ${this} cache auto-freeing after ${freeTimeoutSec} sec of inactivity`);
			$debug(`Initializing db ${this} cache auto-saving with the interval of ${saveTimeoutSec} sec`);

			while (true as boolean) {
				task.wait(1);

				const freeTimeCutoff = os.time() - freeTimeoutSec;
				const saveTimeCutoff = os.time() - saveTimeoutSec;

				for (const [key, item] of [...asMap(this.cache)]) {
					if (item.lastAccessedTime < freeTimeCutoff) {
						$debug(`Freeing db ${this} key ${key} after ${freeTimeoutSec} sec of inactivity`);

						try {
							this.save(item.keys, key);
						} catch (err) {
							$err(err);
							continue;
						}
						this.free(item.keys, key);
						continue;
					}

					if (item.lastSaveTime < saveTimeCutoff) {
						$debug(`Auto-saving db ${this} key ${key} after ${saveTimeoutSec} sec`);
						try {
							this.save(item.keys, key);
						} catch (err) {
							$err(err);
						}
					}
				}
			}
		});
	}

	protected abstract createDefault(): T;
	protected abstract import(value: TDb): T;
	protected abstract export(value: T): TDb;

	get(keys: TKeys): T {
		const strkey = formatDatabaseBackendKeys(keys);
		if (strkey in this.cache) {
			const value = this.cache[strkey];
			value.lastAccessedTime = os.time();

			return value.value;
		}

		if (strkey in this.currentlyLoading) {
			return Objects.awaitThrow(this.currentlyLoading[strkey]);
		}

		let res: (value: T) => void = undefined!;
		let reject: (reason: unknown) => void = undefined!;
		const promise = new Promise<T>((resolve, rej) => {
			res = resolve;
			reject = rej;
		});
		promise.catch(() => undefined);
		this.currentlyLoading[strkey] = promise;

		try {
			const fromStore = this.load(keys);
			// A set during the yielding backend read must win over the stale result.
			const loaded = this.cache[strkey] ?? fromStore;
			this.cache[strkey] = loaded;
			res(loaded.value);

			return loaded.value;
		} catch (err) {
			reject(err);
			throw err;
		} finally {
			delete this.currentlyLoading[strkey];
		}
	}

	set(keys: TKeys, value: T) {
		const time = os.time();
		const key = formatDatabaseBackendKeys(keys);
		this.cache[key] = {
			keys,
			changed: true,
			lastAccessedTime: time,
			value,
			lastSaveTime: time,
		};

		if (this.scheduled.has(key)) return;
		const token = {};
		this.scheduled.set(key, token);
		task.delay(1, () => {
			if (this.scheduled.get(key) !== token) return;
			this.scheduled.delete(key);
			try {
				this.save(keys, key);
			} catch (err) {
				$err(err);
			}
		});
	}
	delete(keys: TKeys) {
		const key = formatDatabaseBackendKeys(keys);
		while (this.saving.has(key) || this.currentlyLoading[key] !== undefined) task.wait();
		this.saving.add(key);
		try {
			const deleting = this.cache[key];
			this.datastore.RemoveAsync(keys);
			if (this.cache[key] === deleting) {
				this.scheduled.delete(key);
				delete this.cache[key];
			}
		} finally {
			this.saving.delete(key);
		}
	}

	private load(keys: TKeys): DbStoredValue<T, TKeys> {
		const req = Throttler.retryOnFail<TDb | undefined>(3, 1, () => this.datastore!.GetAsync(keys));
		if (!req.success) {
			throw req.error_message;
		}

		if (req.message !== undefined) {
			const time = os.time();
			return {
				keys,
				value: this.import(req.message),
				changed: false,
				lastAccessedTime: time,
				lastSaveTime: time,
			};
		}

		const time = os.time();
		return {
			keys,
			value: this.createDefault(),
			changed: false,
			lastAccessedTime: time,
			lastSaveTime: time,
		};
	}

	loadedUnsavedEntries() {
		return Objects.entriesArray(this.cache).filter((entry) => entry[1].changed);
	}

	/** Removes an entry from the cache */
	free(keys: TKeys, key?: string) {
		const cacheKey = key ?? formatDatabaseBackendKeys(keys);
		if (this.cache[cacheKey]?.changed || this.saving.has(cacheKey)) return;
		delete this.cache[cacheKey];
	}

	/** Clears tha cache */
	freeAll() {
		for (const [key, _] of pairs(this.cache)) {
			if (!this.cache[key].changed && !this.saving.has(key)) delete this.cache[key];
		}
	}

	/** Saves an entry if it's not changed */
	save(keys: TKeys, strkey?: string) {
		strkey ??= formatDatabaseBackendKeys(keys);
		this.scheduled.delete(strkey);

		while (this.saving.has(strkey)) task.wait();
		this.saving.add(strkey);
		try {
			const value = this.cache[strkey];
			if (!value) return;

			value.lastSaveTime = os.time();
			if (!value.changed) return;

			// delay between saves?

			const req = Throttler.retryOnFail(3, 1, () => this.datastore!.SetAsync(this.export(value.value), keys));
			if (!req.success) {
				throw req.error_message;
			}
			value.changed = false;
		} finally {
			this.saving.delete(strkey);
		}
	}

	saveChanged() {
		for (const [key, { keys }] of pairs(this.cache)) {
			try {
				this.save(keys, key);
			} catch (err) {
				$err(err);
			}
		}
	}
}

export class Db<T, TDb, TKeys extends defined[]> extends DbBase<T, TDb, TKeys> {
	constructor(
		datastore: DatabaseBackend<TDb, TKeys>,
		private readonly createDefaultFunc: () => T,
		private readonly importFunc: (value: TDb) => T,
		private readonly exportFunc: (value: T) => TDb,
	) {
		super(datastore);
	}

	protected createDefault(): T {
		return this.createDefaultFunc();
	}
	protected import(value: TDb): T {
		return this.importFunc(value);
	}
	protected export(value: T): TDb {
		return this.exportFunc(value);
	}
}
