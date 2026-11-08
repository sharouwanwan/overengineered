/** One latched fuse; disarming cancels it before a detonation request is sent. */
export class TNTFuse {
	private armedAt?: number;
	private deadline?: number;
	private fired = false;
	update(now: number, armed: boolean, armingDelay: number): boolean {
		if (!armed) {
			this.armedAt = undefined;
			this.deadline = undefined;
			return false;
		}
		this.armedAt ??= now;
		return !this.fired && now - this.armedAt >= armingDelay;
	}
	trigger(now: number, delay: number): void {
		if (!this.fired) this.deadline ??= now + delay;
	}
	remaining(now: number): number {
		return this.deadline === undefined ? 0 : math.max(0, this.deadline - now);
	}
	triggered(): boolean {
		return this.deadline !== undefined;
	}
	due(now: number): boolean {
		return !this.fired && this.deadline !== undefined && now >= this.deadline;
	}
	confirm(): void {
		this.fired = true;
	}
}
