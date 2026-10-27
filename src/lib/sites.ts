// Tape sites, priors, and per-person goals for the response model.
// Slopes are regularizers. Three intervals are not asked to invent them.

export const SITES = [
    "chest",
    "shoulders",
    "arms",
    "forearms",
    "waist",
    "hips",
    "thighs",
    "calves",
    "neck",
] as const;

export type SiteId = (typeof SITES)[number];

export type BodyClass = "waist" | "torso" | "limb";

export function bodyClass(site: SiteId): BodyClass {
    if (site === "waist") return "waist";
    if (site === "chest" || site === "shoulders") return "torso";
    return "limb";
}

export const SITE_LABEL: Record<SiteId, string> = {
    chest: "Chest",
    shoulders: "Shoulders",
    arms: "Arms",
    forearms: "Forearms",
    waist: "Waist",
    hips: "Hips",
    thighs: "Thighs",
    calves: "Calves",
    neck: "Neck",
};

/** Fixed tape noise, inches. Not estimated. */
export const SIGMA = 0.25;
/** Used when a wrist or ankle anchor moves, which means the tape session drifted. */
export const SIGMA_ANCHOR = 0.5;
export const ANCHOR_DRIFT = 0.25;

/**
 * Every tape change is read as inches per this many weeks, so a 2-week and a
 * 10-week gap between tapes count the same way. Priors and predictions use it too.
 */
export const BLOCK_WEEKS = 4;

/** Past this many direct sets a week on one tape, each extra set costs more than it adds. */
export const SET_PEAK = 20;
/** Inches per block lost per (set over the peak)². Fixed, not fitted. */
export const OVERREACH = 0.002;
/** Working sets in one session past which every tape trained that day pays a fatigue cost. */
export const SESSION_SET_CAP = 25;
/** Inches per block lost per working set over the session cap. Fixed, not fitted. */
export const SESSION_FATIGUE = 0.01;

export const SET_FLOOR = 6;
export const SET_CEILING = 20;
export const TRANSFER_STEPS = [2, 4, 6] as const;

/** Hold sites pay this much utility per inch of predicted move in either direction. */
export const LAMBDA_HOLD = 0.5;

export const PRIORS = {
    interceptSd: 0.35,
    setsMean: 0.15,
    setsMeanSd: 0.15,
    indMean: 0.05,
    indMeanSd: 0.1,
    freq: 0.1,
    freqSd: 0.1,
    fresh: 0.15,
    freshSd: 0.15,
    zone: 0.1,
    zoneSd: 0.15,
    prog: 0.02,
    progSd: 0.05,
    bwWaist: 0.08,
    bwWaistSd: 0.04,
    bwTorso: 0.03,
    bwTorsoSd: 0.02,
    bwLimb: 0.015,
    bwLimbSd: 0.015,
} as const;

export type GoalMode = "grow" | "shrink" | "hold" | "ignore";

export type SiteGoal = {
    mode: GoalMode;
    /** Inches of gap, or a fixed priority when the goal has no tape target. */
    weight: number;
};

export type LatestTapes = Record<SiteId, number | null> & {
    wrist: number | null;
    ankle: number | null;
};

export const GOAL_MODES: GoalMode[] = ["grow", "hold", "shrink", "ignore"];

/** A starting point for a new visitor: every limb and the torso up, waist held. */
export function defaultGoals(): Record<SiteId, SiteGoal> {
    const goals = Object.fromEntries(SITES.map((s) => [s, { mode: "grow", weight: 1 }])) as Record<SiteId, SiteGoal>;
    goals.waist = { mode: "hold", weight: 0 };
    return goals;
}

/** Goals only count for tapes the visitor has measured, once there are tapes at all. */
export function goalsForTapes(goals: Record<SiteId, SiteGoal>, t: LatestTapes | null): Record<SiteId, SiteGoal> {
    if (!t) return goals;
    return Object.fromEntries(
        SITES.map((s) => [s, t[s] == null ? { mode: "ignore", weight: 0 } : goals[s]])
    ) as Record<SiteId, SiteGoal>;
}
