export class NumericalFilter {
	private low?: number;
	step(input: number, seconds: number, dt: number, reset: boolean) {
		if (input !== input || math.abs(input) === math.huge) return { low: this.low ?? 0, high: 0 };
		if (this.low === undefined || reset) this.low = input;
		if (seconds <= 0) this.low = input;
		else if (dt > 0 && dt < math.huge && seconds === seconds)
			this.low += (1 - math.exp(-dt / seconds)) * (input - this.low);
		return { low: this.low, high: input - this.low };
	}
}
