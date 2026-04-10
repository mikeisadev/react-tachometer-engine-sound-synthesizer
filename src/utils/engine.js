// ─────────────────────────────────────────────────────
// CONFIG: Engine sound parameters
// ─────────────────────────────────────────────────────
export const ENGINE_CONFIG = {
  idleRPM: 800,
  minRPM: 600,
  maxRPM: 6000,
  cylinders: 4,
  strokeType: 4,
};

/**
 * Firing frequency: f = (RPM / 60) * (cylinders / strokeType)
 * Per un 4cil 4T a 800RPM → (800/60)*(4/2) = 26.67 Hz
 */
export const calcFiringFreq = (rpm) =>
  (rpm / 60) * (ENGINE_CONFIG.cylinders / ENGINE_CONFIG.strokeType);

export const calcCrankFreq = (rpm) => rpm / 60;