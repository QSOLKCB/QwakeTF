// SPDX-License-Identifier: Apache-2.0
// Fixed simulation step with bounded catch-up, interpolation alpha and time scaling.
// Adapted from QSOLKCB/VANILLAJS modules/time (FixedClock).
export class FixedClock {
  constructor({ step = 1 / 60, maxFrame = 0.25, maxSteps = 32 } = {}) {
    if (!(Number.isFinite(step) && step > 0 && Number.isFinite(maxFrame) && maxFrame > 0 && Number.isInteger(maxSteps) && maxSteps > 0)) {
      throw new RangeError('invalid fixed clock limits');
    }
    Object.assign(this, { step, maxFrame, maxSteps, accumulator: 0, ticks: 0, dropped: 0 });
  }
  reset() { this.accumulator = 0; this.ticks = 0; this.dropped = 0; }
  /** Runs update(step) for each whole step in `seconds * timeScale`. Returns steps taken and render alpha. */
  advance(seconds, update, timeScale = 1) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    if (!Number.isFinite(timeScale) || timeScale < 0) timeScale = 1;
    timeScale = Math.min(timeScale, 4);
    if (timeScale === 0) return { steps: 0, alpha: this.accumulator / this.step, dropped: 0 };
    let dropped = Math.max(0, seconds - this.maxFrame) * timeScale;
    this.accumulator += Math.min(seconds, this.maxFrame) * timeScale;
    let steps = 0;
    // The epsilon stops accumulated float error from skipping a step and causing judder.
    while (this.accumulator + 1e-9 >= this.step && steps < this.maxSteps) {
      update(this.step);
      this.accumulator = Math.max(0, this.accumulator - this.step);
      this.ticks++; steps++;
    }
    if (this.accumulator >= this.step) {
      const debt = Math.floor(this.accumulator / this.step) * this.step;
      dropped += debt; this.accumulator -= debt;
    }
    this.dropped += dropped;
    return { steps, alpha: this.accumulator / this.step, dropped };
  }
}
