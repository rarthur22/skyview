// Client-side rendering constants.

/** Radius (units) at which sky objects (sun/moon/stars) are drawn. */
export const SKY_DOME_RADIUS = 1000;

/** KM -> scene units multiplier for aircraft placement. */
export const KM_TO_UNIT = 2.4;

/** GM (units) radius of the horizon grid/rings. */
export const HORIZON_RADIUS = 800;

/** Defaults. */
export const DEFAULT_FOV = 110;
export const DEFAULT_VIEW = { azimuth: 0, elevation: 55 };

/** How far aircraft labels/selection tolerate being "selected". */
export const SELECT_MAX_RADIUS = 120;

/** Max aircraft labels rendered at once (perf guard). */
export const MAX_LABELS = 40;
