export interface PidInputs {
	p: number;
	i: number;
	d: number;
	target: number;
	now: number;
	imin: number;
	imax: number;
	filter: number;
	outputMin: number;
	outputMax: number;
	measurementDerivative: boolean;
	limitOutput: boolean;
	reset: boolean;
}
export class PidState {
	private integral = 0;
	private previous?: number;
	private derivative = 0;
	private output = 0;
	private measurementMode?: boolean;
	reset() {
		this.integral = 0;
		this.previous = undefined;
		this.derivative = 0;
		this.output = 0;
		this.measurementMode = undefined;
	}
	step(v: PidInputs, dt: number) {
		if (v.reset) this.reset();
		const finite = (n: number) => n === n && math.abs(n) < math.huge;
		if (
			!finite(v.p) ||
			!finite(v.i) ||
			!finite(v.d) ||
			!finite(v.target) ||
			!finite(v.now) ||
			!finite(v.imin) ||
			!finite(v.imax) ||
			!finite(v.filter) ||
			!finite(v.outputMin) ||
			!finite(v.outputMax)
		) {
			this.reset();
			return { integral: 0, output: 0 };
		}
		if (this.measurementMode !== v.measurementDerivative) {
			this.previous = undefined;
			this.derivative = 0;
			this.measurementMode = v.measurementDerivative;
		}
		const sample = v.measurementDerivative ? -v.now : v.target - v.now;
		const errorValue = v.target - v.now;
		if (dt <= 0 || dt !== dt || math.abs(dt) === math.huge || v.reset) {
			this.previous = undefined;
			this.derivative = 0;
			return { integral: this.integral, output: this.output };
		}
		if (dt > 0.5) {
			this.previous = undefined;
			this.derivative = 0;
		}
		const raw = this.previous === undefined ? 0 : (sample - this.previous) / dt;
		const derivative = this.derivative + (dt / (math.max(0, v.filter) + dt)) * (raw - this.derivative);
		const boundedIntegral = math.clamp(this.integral, math.min(v.imin, v.imax), math.max(v.imin, v.imax));
		let integral = math.clamp(
			boundedIntegral + errorValue * math.min(dt, 0.25),
			math.min(v.imin, v.imax),
			math.max(v.imin, v.imax),
		);
		let output = v.p * errorValue + v.i * integral + v.d * derivative;
		if (v.limitOutput) {
			const min = math.min(v.outputMin, v.outputMax),
				max = math.max(v.outputMin, v.outputMax);
			if ((output > max && v.i * errorValue > 0) || (output < min && v.i * errorValue < 0)) {
				integral = boundedIntegral;
				output = v.p * errorValue + v.i * integral + v.d * derivative;
			}
			output = math.clamp(output, min, max);
		}
		if (
			output !== output ||
			math.abs(output) === math.huge ||
			integral !== integral ||
			math.abs(integral) === math.huge
		) {
			this.reset();
		} else {
			this.previous = sample;
			this.integral = integral;
			this.derivative = derivative;
			this.output = output;
		}
		return { integral: this.integral, output: this.output };
	}
}
