// One complete free-roam day is ten minutes of active play.
const clamp = n => Math.min(100, Math.max(0, n));
const restore = (value, fallback) => Number.isFinite(value) ? clamp(value) : fallback;
export const PERIOD = 100;
export const DAY_PHASES = ['day', 'noon', 'afternoon', 'dusk', 'night', 'dawn'];
const night = DAY_PHASES.indexOf('night');

export class RoamVitals {
  constructor(saved) {
    this.food = restore(saved?.food, 85);
    this.clean = restore(saved?.clean, 90);
    this.health = restore(saved?.health, 100);
    this.water = restore(saved?.water, 90);
    this.fatigue = restore(saved?.fatigue, 10);
    this.capacity = Math.max(65, restore(saved?.capacity, 100));
    this.phase = Number.isInteger(saved?.phase) && DAY_PHASES[saved.phase] ? saved.phase : 0;
    this.elapsed = Number.isFinite(saved?.elapsed) && saved.elapsed >= 0 && saved.elapsed < PERIOD ? saved.elapsed : 0;
    this.nightSleep = this.phase === night ? Math.min(this.elapsed, restore(saved?.nightSleep, 0)) : 0;
    this.day = Number.isSafeInteger(saved?.day) && saved.day >= 0 ? saved.day : 0;
    this.netHelpedAt = Number.isFinite(saved?.netHelpedAt) && saved.netHelpedAt >= 0 ? saved.netHelpedAt : null;
    this.letterDeliveredDay = Number.isSafeInteger(saved?.letterDeliveredDay) && saved.letterDeliveredDay >= 0 ? saved.letterDeliveredDay : null;
    this.carryingLetter = this.letterDeliveredDay === null && saved?.carryingLetter === true;
    this.kiteProgress = ['broken','fixed','flown'].includes(saved?.kiteProgress) ? saved.kiteProgress : 'new';
    this.lampFixedAt = Number.isFinite(saved?.lampFixedAt) && saved.lampFixedAt >= 0 ? saved.lampFixedAt : null;
  }

  advance(seconds, effort = 0, cycling = false, sleeping = false) {
    // Split a skipped period at short intervals so crossing a threshold has the
    // same effect as playing through that period.
    const load = Math.min(1, Math.max(0, effort));
    while (seconds > 0) {
      const dt = Math.min(seconds, 1, PERIOD - this.elapsed);
      this.food = clamp(this.food - dt * (sleeping ? .07 : .14 + .12 * load));
      this.clean = clamp(this.clean - dt * (sleeping ? .03 : .065 + .13 * load));
      this.water = clamp(this.water - dt * (sleeping ? .05 : .11 + (cycling ? .34 : .28) * load));
      this.fatigue = clamp(this.fatigue + dt * (sleeping ? -.9 : (this.phase === night ? .24 : .105) + .10 * load));
      const loss = (this.food <= 20 ? .18 : 0) + (this.clean <= 20 ? .09 : 0) + (this.water <= 12 ? .16 : 0);
      if (loss) this.health = Math.max(15, this.health - dt * loss);
      else if (this.food >= 45 && this.clean >= 40 && this.water >= 30) this.health = clamp(this.health + dt * .18);
      if (sleeping && this.phase === night) this.nightSleep += dt;
      this.elapsed += dt;
      if (PERIOD - this.elapsed < 1e-9) {
        if (this.phase === night) {
          this.day++;
          this.capacity = Math.round(65 + 35 * this.nightSleep / PERIOD);
          this.nightSleep = 0;
        }
        this.phase = (this.phase + 1) % DAY_PHASES.length;
        this.elapsed = 0;
      }
      seconds -= dt;
    }
  }

  eat() { this.food = clamp(this.food + 65); }
  get townTime() { return (this.day * DAY_PHASES.length + (this.phase + 1) % DAY_PHASES.length) * PERIOD + this.elapsed; }
  wash() { this.clean = 100; }
  drink() { this.water = clamp(this.water + 55); }
  get bedtime() { return this.phase === night || this.phase === night - 1; }
  sleepToDawn() {
    if (!this.bedtime) return;
    this.advance((night - this.phase + 1) * PERIOD - this.elapsed, 0, false, true);
  }
  restInBed() {
    if (this.bedtime) this.sleepToDawn();
    else this.advance(PERIOD / 2, 0, false, true);
  }

  get pace() {
    if (this.food <= 10 || this.health <= 30 || this.water <= 8 || this.fatigue >= 92) return 1.4;
    if (this.food <= 25 || this.health <= 50 || this.water <= 22 || this.fatigue >= 78) return 2.6;
    return Infinity;
  }
}
