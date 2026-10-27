// Gaussian MAP of tape change on training dose, plus a constrained search
// for the next block. The loss is quadratic, so the fit is a linear solve:
// (X'X / σ² + prior precision) θ = X'y / σ² + prior precision × prior mean.
// Every training slope is its own number per tape. With a few blocks
// each one stays near its prior until that tape's own history moves it.

import { classifyExercise } from "./exercise-sites";
import {
    ANCHOR_DRIFT,
    BLOCK_WEEKS,
    bodyClass,
    LAMBDA_HOLD,
    OVERREACH,
    PRIORS,
    SESSION_FATIGUE,
    SESSION_SET_CAP,
    SET_CEILING,
    SET_PEAK,
    SIGMA,
    SIGMA_ANCHOR,
    SITE_LABEL,
    SITES,
    TRANSFER_STEPS,
    type LatestTapes,
    type SiteGoal,
    type SiteId,
} from "./sites";

export type TapeRow = {
    date: string;
    bust: number | null;
    waist: number | null;
    hips: number | null;
    thighs: number | null;
    shoulders: number | null;
    arms: number | null;
    forearms: number | null;
    calves: number | null;
    neck: number | null;
    wrist: number | null;
    ankle: number | null;
    weight: number | null;
};

export type WorkoutLog = {
    workoutId: string;
    date: string;
    exerciseId: string;
    reps: number | null;
    weight: number | null;
    isWarmup: boolean;
    createdAt: string | null;
};

export type SiteDose = {
    directSetsPerWeek: number;
    indirectSetsPerWeek: number;
    frequencyPerWeek: number;
    freshness: number;
    zoneShare: number;
    e1rmSlopePctPerWeek: number;
    /** Average working sets in the sessions that trained this tape directly. */
    sessionSets: number;
};

export type BuiltInterval = {
    start: string;
    end: string;
    weeks: number;
    sigma: number;
    deltaBodyweight: number;
    doses: Record<SiteId, SiteDose>;
    deltaTape: Partial<Record<SiteId, number>>;
    endTapes: LatestTapes;
    rawSetsPerWeek: number;
    unknownExercises: string[];
};

export type Observation = {
    site: SiteId;
    directSetsPerWeek: number;
    indirectSetsPerWeek: number;
    frequencyPerWeek: number;
    freshness: number;
    zoneShare: number;
    e1rmSlopePctPerWeek: number;
    sessionSets: number;
    /** Per BLOCK_WEEKS, like deltaTape. */
    deltaBodyweight: number;
    /** Inches per BLOCK_WEEKS. */
    deltaTape: number;
    sigma: number;
};

export type Fit = {
    a: Record<SiteId, number>;
    bSets: Record<SiteId, number>;
    bInd: Record<SiteId, number>;
    bFreq: Record<SiteId, number>;
    bFresh: Record<SiteId, number>;
    bZone: Record<SiteId, number>;
    bProg: Record<SiteId, number>;
    bBw: { waist: number; torso: number; limb: number };
};

export type Lever =
    | {
          kind: "sets";
          site: SiteId;
          sets: number;
          expectedInches: Partial<Record<SiteId, number>>;
      }
    | {
          kind: "freshness" | "zone";
          site: SiteId;
          expectedInches: Partial<Record<SiteId, number>>;
      };

export type Recommendation = {
    levers: Lever[];
    gain: number;
};

export type RoutineReport = {
    ready: boolean;
    headline: string;
    lines: string[];
    unknownExercises: string[];
    fit: Fit | null;
    recommendation: Recommendation | null;
};

const P = 66;
/** Under a week between tapes is a retest. Weekly rates from it are not a training block. */
const MIN_BLOCK_WEEKS = 1;
/** Opening slots in a week. The largest "train first" gains take them. */
const FIRST_SLOTS = 3;

function siteIndex(site: SiteId): number {
    return SITES.indexOf(site);
}

function zeros(n: number): number[] {
    return Array.from({ length: n }, () => 0);
}

function emptyDose(): SiteDose {
    return {
        directSetsPerWeek: 0,
        indirectSetsPerWeek: 0,
        frequencyPerWeek: 0,
        freshness: 0.5,
        zoneShare: 0.5,
        e1rmSlopePctPerWeek: 0,
        sessionSets: 0,
    };
}

function emptyDoses(): Record<SiteId, SiteDose> {
    return Object.fromEntries(SITES.map((s) => [s, emptyDose()])) as Record<SiteId, SiteDose>;
}

export function num(value: unknown): number | null {
    if (value == null || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

function dayStamp(iso: string): number {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
}

function weeksBetween(start: string, end: string): number {
    return (dayStamp(end) - dayStamp(start)) / 86_400_000 / 7;
}

export function formatTapeDate(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${Number(m)}/${Number(d)}/${y}`;
}

export function latestFromRow(row: TapeRow): LatestTapes {
    return {
        chest: num(row.bust),
        shoulders: num(row.shoulders),
        arms: num(row.arms),
        forearms: num(row.forearms),
        waist: num(row.waist),
        hips: num(row.hips),
        thighs: num(row.thighs),
        calves: num(row.calves),
        neck: num(row.neck),
        wrist: num(row.wrist),
        ankle: num(row.ankle),
    };
}

function tapeOf(row: TapeRow, site: SiteId): number | null {
    const map: Record<SiteId, number | null> = {
        chest: num(row.bust),
        shoulders: num(row.shoulders),
        arms: num(row.arms),
        forearms: num(row.forearms),
        waist: num(row.waist),
        hips: num(row.hips),
        thighs: num(row.thighs),
        calves: num(row.calves),
        neck: num(row.neck),
    };
    return map[site];
}

function solveLinear(matrix: number[][], rhs: number[]): number[] {
    const n = rhs.length;
    const m = matrix.map((row, i) => [...row, rhs[i]]);
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
        }
        if (Math.abs(m[pivot][col]) < 1e-12) {
            throw new Error("Response model could not be solved.");
        }
        const hold = m[col];
        m[col] = m[pivot];
        m[pivot] = hold;
        const div = m[col][col];
        for (let c = col; c <= n; c++) m[col][c] /= div;
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const factor = m[r][col];
            if (factor === 0) continue;
            for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
        }
    }
    return m.map((row) => row[n]);
}

function addPrior(precision: number[][], rhs: number[], index: number, mean: number, sd: number) {
    const w = 1 / (sd * sd);
    precision[index][index] += w;
    rhs[index] += mean * w;
}

/** Design row. Training slopes occupy one column per tape. Scale weight stays in three groups. */
function design(obs: Observation): number[] {
    const x = zeros(P);
    const s = siteIndex(obs.site);
    x[s] = 1;
    x[9 + s] = Math.log1p(obs.directSetsPerWeek) - Math.log1p(10);
    x[18 + s] = Math.log1p(obs.indirectSetsPerWeek) - Math.log1p(4);
    x[27 + s] = obs.frequencyPerWeek - 2;
    x[36 + s] = obs.freshness - 0.5;
    x[45 + s] = obs.zoneShare - 0.5;
    x[54 + s] = obs.e1rmSlopePctPerWeek;
    const cls = bodyClass(obs.site);
    x[cls === "waist" ? 63 : cls === "torso" ? 64 : 65] = obs.deltaBodyweight;
    return x;
}

function readFit(theta: number[]): Fit {
    const a = {} as Record<SiteId, number>;
    const bSets = {} as Record<SiteId, number>;
    const bInd = {} as Record<SiteId, number>;
    const bFreq = {} as Record<SiteId, number>;
    const bFresh = {} as Record<SiteId, number>;
    const bZone = {} as Record<SiteId, number>;
    const bProg = {} as Record<SiteId, number>;
    SITES.forEach((site, i) => {
        a[site] = theta[i];
        bSets[site] = theta[9 + i];
        bInd[site] = theta[18 + i];
        bFreq[site] = theta[27 + i];
        bFresh[site] = theta[36 + i];
        bZone[site] = theta[45 + i];
        bProg[site] = theta[54 + i];
    });
    return {
        a,
        bSets,
        bInd,
        bFreq,
        bFresh,
        bZone,
        bProg,
        bBw: { waist: theta[63], torso: theta[64], limb: theta[65] },
    };
}

/**
 * Inches per block lost to volume past what a tape or a session can use.
 * Fixed rather than fitted: a few blocks cannot locate a peak, and without it
 * the log curve says every added set helps.
 */
export function volumeCost(dose: Pick<SiteDose, "directSetsPerWeek" | "sessionSets">): number {
    const over = Math.max(0, dose.directSetsPerWeek - SET_PEAK);
    const crowd = Math.max(0, dose.sessionSets - SESSION_SET_CAP);
    return OVERREACH * over * over + SESSION_FATIGUE * crowd;
}

export function fitResponse(observations: Observation[]): Fit {
    const precision = Array.from({ length: P }, () => zeros(P));
    const rhs = zeros(P);

    for (const obs of observations) {
        const x = design(obs);
        const w = 1 / (obs.sigma * obs.sigma);
        // The fixed volume cost is an offset: the slopes explain what is left after it.
        const target = obs.deltaTape + volumeCost(obs);
        for (let i = 0; i < P; i++) {
            if (x[i] === 0) continue;
            rhs[i] += w * x[i] * target;
            for (let j = i; j < P; j++) {
                if (x[j] === 0) continue;
                const add = w * x[i] * x[j];
                precision[i][j] += add;
                if (i !== j) precision[j][i] += add;
            }
        }
    }

    SITES.forEach((_, i) => {
        addPrior(precision, rhs, i, 0, PRIORS.interceptSd);
        addPrior(precision, rhs, 9 + i, PRIORS.setsMean, PRIORS.setsMeanSd);
        addPrior(precision, rhs, 18 + i, PRIORS.indMean, PRIORS.indMeanSd);
        addPrior(precision, rhs, 27 + i, PRIORS.freq, PRIORS.freqSd);
        addPrior(precision, rhs, 36 + i, PRIORS.fresh, PRIORS.freshSd);
        addPrior(precision, rhs, 45 + i, PRIORS.zone, PRIORS.zoneSd);
        addPrior(precision, rhs, 54 + i, PRIORS.prog, PRIORS.progSd);
    });
    addPrior(precision, rhs, 63, PRIORS.bwWaist, PRIORS.bwWaistSd);
    addPrior(precision, rhs, 64, PRIORS.bwTorso, PRIORS.bwTorsoSd);
    addPrior(precision, rhs, 65, PRIORS.bwLimb, PRIORS.bwLimbSd);

    return readFit(solveLinear(precision, rhs));
}

export function predictDelta(fit: Fit, site: SiteId, dose: SiteDose, deltaBodyweight: number): number {
    const cls = bodyClass(site);
    return (
        fit.a[site] +
        fit.bSets[site] * (Math.log1p(dose.directSetsPerWeek) - Math.log1p(10)) +
        fit.bInd[site] * (Math.log1p(dose.indirectSetsPerWeek) - Math.log1p(4)) +
        fit.bFreq[site] * (dose.frequencyPerWeek - 2) +
        fit.bFresh[site] * (dose.freshness - 0.5) +
        fit.bZone[site] * (dose.zoneShare - 0.5) +
        fit.bProg[site] * dose.e1rmSlopePctPerWeek +
        fit.bBw[cls] * deltaBodyweight -
        volumeCost(dose)
    );
}

function epley(weight: number, reps: number): number {
    return weight * (1 + reps / 30);
}

function slopePctPerWeek(points: { week: number; y: number }[]): number {
    const n = points.length;
    if (n < 2) return 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (const p of points) {
        sx += p.week;
        sy += p.y;
        sxx += p.week * p.week;
        sxy += p.week * p.y;
    }
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-9) return 0;
    const slope = (n * sxy - sx * sy) / den;
    const mean = sy / n;
    if (mean <= 0) return 0;
    return (slope / mean) * 100;
}

type WorkingSet = WorkoutLog & { weight: number; reps: number };

function isWorking(log: WorkoutLog): log is WorkingSet {
    return !log.isWarmup && (log.reps ?? 0) > 0 && (log.weight ?? 0) > 0;
}

function freshnessFor(index: number, count: number): number {
    if (count <= 1) return 1;
    const slot = index / count;
    if (slot < 1 / 3) return 1;
    if (slot < 2 / 3) return 0.5;
    return 0;
}

export function buildIntervals(tapes: TapeRow[], logs: WorkoutLog[]): {
    intervals: BuiltInterval[];
    skipped: string[];
} {
    const ordered = [...tapes].sort((a, b) => a.date.localeCompare(b.date));
    const skipped: string[] = [];
    const intervals: BuiltInterval[] = [];

    for (let i = 1; i < ordered.length; i++) {
        const startRow = ordered[i - 1];
        const endRow = ordered[i];
        const start = startRow.date.slice(0, 10);
        const end = endRow.date.slice(0, 10);
        const label = `${formatTapeDate(start)} → ${formatTapeDate(end)}`;
        const startWeight = num(startRow.weight);
        const endWeight = num(endRow.weight);
        if (startWeight == null || endWeight == null) {
            skipped.push(`${label} skipped: bodyweight is missing on one of the two dates.`);
            continue;
        }
        const weeks = weeksBetween(start, end);
        if (weeks <= 0) {
            skipped.push(`${label} skipped: the two dates are not in order.`);
            continue;
        }
        if (weeks < MIN_BLOCK_WEEKS) {
            skipped.push(`${label} skipped: ${Math.round(weeks * 7)} days is a retest, not a training block.`);
            continue;
        }

        const windowLogs = logs.filter((log) => {
            const d = log.date.slice(0, 10);
            return d >= start && d < end;
        });
        const byWorkout = new Map<string, WorkoutLog[]>();
        for (const log of windowLogs) {
            const list = byWorkout.get(log.workoutId);
            if (list) list.push(log);
            else byWorkout.set(log.workoutId, [log]);
        }

        const directCounts = Object.fromEntries(SITES.map((s) => [s, 0])) as Record<SiteId, number>;
        const indirectCounts = Object.fromEntries(SITES.map((s) => [s, 0])) as Record<SiteId, number>;
        const freq = Object.fromEntries(SITES.map((s) => [s, 0])) as Record<SiteId, number>;
        const freshSum = Object.fromEntries(SITES.map((s) => [s, 0])) as Record<SiteId, number>;
        const freshN = Object.fromEntries(SITES.map((s) => [s, 0])) as Record<SiteId, number>;
        const zoneN = Object.fromEntries(SITES.map((s) => [s, 0])) as Record<SiteId, number>;
        const directN = Object.fromEntries(SITES.map((s) => [s, 0])) as Record<SiteId, number>;
        const sessionSetSum = Object.fromEntries(SITES.map((s) => [s, 0])) as Record<SiteId, number>;
        const sessionBest = Object.fromEntries(SITES.map((s) => [s, new Map<string, { week: number; y: number }[]>()])) as Record<
            SiteId,
            Map<string, { week: number; y: number }[]>
        >;
        const unknown = new Set<string>();
        let rawSets = 0;

        for (const sets of byWorkout.values()) {
            const date = sets[0].date.slice(0, 10);
            const week = weeksBetween(start, date);
            const working = sets.filter(isWorking);
            rawSets += working.length;

            const exerciseOrder: string[] = [];
            const seen = new Set<string>();
            const orderedSets = [...sets].sort((a, b) => {
                const ta = a.createdAt ?? "";
                const tb = b.createdAt ?? "";
                if (ta !== tb) return ta < tb ? -1 : 1;
                return 0;
            });
            for (const set of orderedSets) {
                if (seen.has(set.exerciseId)) continue;
                seen.add(set.exerciseId);
                exerciseOrder.push(set.exerciseId);
            }
            const freshOf = new Map<string, number>();
            exerciseOrder.forEach((id, index) => freshOf.set(id, freshnessFor(index, exerciseOrder.length)));

            const hit = new Set<SiteId>();
            for (const set of working) {
                const credit = classifyExercise(set.exerciseId);
                if (credit.kind === "unknown") {
                    unknown.add(set.exerciseId);
                    continue;
                }
                for (const site of SITES) {
                    const direct = credit.primary[site] ?? 0;
                    const indirect = credit.secondary[site] ?? 0;
                    if (direct) {
                        directCounts[site] += direct;
                        directN[site] += 1;
                        freshSum[site] += freshOf.get(set.exerciseId) ?? 0.5;
                        freshN[site] += 1;
                        if (set.reps >= 7 && set.reps <= 12) zoneN[site] += 1;
                        hit.add(site);
                        const estimate = epley(set.weight, set.reps);
                        const series = sessionBest[site];
                        const rows = series.get(set.exerciseId) ?? [];
                        const sameSession = rows.find((row) => Math.abs(row.week - week) < 1e-6);
                        if (!sameSession) rows.push({ week, y: estimate });
                        else if (estimate > sameSession.y) sameSession.y = estimate;
                        series.set(set.exerciseId, rows);
                    }
                    if (indirect) indirectCounts[site] += indirect;
                }
            }
            for (const site of hit) {
                freq[site] += 1;
                sessionSetSum[site] += working.length;
            }
        }

        const doses = emptyDoses();
        for (const site of SITES) {
            let prog = 0;
            let bestLen = 0;
            for (const rows of sessionBest[site].values()) {
                if (rows.length > bestLen) {
                    bestLen = rows.length;
                    prog = slopePctPerWeek(rows);
                }
            }
            doses[site] = {
                directSetsPerWeek: directCounts[site] / weeks,
                indirectSetsPerWeek: indirectCounts[site] / weeks,
                frequencyPerWeek: freq[site] / weeks,
                freshness: freshN[site] > 0 ? freshSum[site] / freshN[site] : 0.5,
                zoneShare: directN[site] > 0 ? zoneN[site] / directN[site] : 0.5,
                e1rmSlopePctPerWeek: prog,
                sessionSets: freq[site] > 0 ? sessionSetSum[site] / freq[site] : 0,
            };
        }

        let sigma = SIGMA;
        const drift = (key: "wrist" | "ankle") => {
            const a = num(startRow[key]);
            const b = num(endRow[key]);
            return a != null && b != null && Math.abs(b - a) >= ANCHOR_DRIFT;
        };
        if (drift("wrist") || drift("ankle")) sigma = SIGMA_ANCHOR;

        const deltaTape: Partial<Record<SiteId, number>> = {};
        for (const site of SITES) {
            const a = tapeOf(startRow, site);
            const b = tapeOf(endRow, site);
            if (a != null && b != null) deltaTape[site] = b - a;
        }

        intervals.push({
            start,
            end,
            weeks,
            sigma,
            deltaBodyweight: endWeight - startWeight,
            doses,
            deltaTape,
            endTapes: latestFromRow(endRow),
            rawSetsPerWeek: rawSets / weeks,
            unknownExercises: [...unknown].sort(),
        });
    }

    return { intervals, skipped };
}

export function observationsFrom(intervals: BuiltInterval[]): Observation[] {
    const rows: Observation[] = [];
    for (const interval of intervals) {
        // Rates, not raw differences. A short block's rate is noisier, so its sigma grows by the same factor.
        const scale = BLOCK_WEEKS / interval.weeks;
        for (const site of SITES) {
            const delta = interval.deltaTape[site];
            if (delta == null) continue;
            const dose = interval.doses[site];
            rows.push({
                site,
                directSetsPerWeek: dose.directSetsPerWeek,
                indirectSetsPerWeek: dose.indirectSetsPerWeek,
                frequencyPerWeek: dose.frequencyPerWeek,
                freshness: dose.freshness,
                zoneShare: dose.zoneShare,
                e1rmSlopePctPerWeek: dose.e1rmSlopePctPerWeek,
                sessionSets: dose.sessionSets,
                deltaBodyweight: interval.deltaBodyweight * scale,
                deltaTape: delta * scale,
                sigma: interval.sigma * scale,
            });
        }
    }
    return rows;
}

function cloneDoses(doses: Record<SiteId, SiteDose>): Record<SiteId, SiteDose> {
    return Object.fromEntries(SITES.map((s) => [s, { ...doses[s] }])) as Record<SiteId, SiteDose>;
}

function utility(fit: Fit, doses: Record<SiteId, SiteDose>, goals: Record<SiteId, SiteGoal>): number {
    let score = 0;
    for (const site of SITES) {
        const goal = goals[site];
        if (goal.mode === "ignore") continue;
        const mu = predictDelta(fit, site, doses[site], 0);
        if (goal.mode === "grow") score += goal.weight * mu;
        else if (goal.mode === "shrink") score -= goal.weight * mu;
        else score -= LAMBDA_HOLD * Math.abs(mu);
    }
    return score;
}

function inchesBetween(
    fit: Fit,
    base: Record<SiteId, SiteDose>,
    next: Record<SiteId, SiteDose>,
    sites: SiteId[]
): Partial<Record<SiteId, number>> {
    const out: Partial<Record<SiteId, number>> = {};
    for (const site of sites) {
        out[site] = predictDelta(fit, site, next[site], 0) - predictDelta(fit, site, base[site], 0);
    }
    return out;
}

function siteInches(fit: Fit, doses: Record<SiteId, SiteDose>, site: SiteId, patch: Partial<SiteDose>): number {
    const next = cloneDoses(doses);
    next[site] = { ...next[site], ...patch };
    return predictDelta(fit, site, next[site], 0) - predictDelta(fit, site, doses[site], 0);
}

/** Inches in the direction the goal wants. A rep-range or order change costs one step. Added sets cost the sets. */
function desiredInches(goal: SiteGoal, inches: number): number {
    if (goal.mode === "grow") return goal.weight * inches;
    if (goal.mode === "shrink") return goal.weight * -inches;
    return 0;
}

/** Added weekly sets land in the sessions that already train the tape, so those sessions grow too. */
function addSets(dose: SiteDose, sets: number): Partial<SiteDose> {
    return {
        directSetsPerWeek: dose.directSetsPerWeek + sets,
        sessionSets: dose.sessionSets + sets / Math.max(1, dose.frequencyPerWeek),
    };
}

type SiteOption = {
    kind: "zone" | "freshness" | "sets";
    sets?: number;
    inches: number;
    roi: number;
};

export function recommend(
    fit: Fit,
    doses: Record<SiteId, SiteDose>,
    goals: Record<SiteId, SiteGoal>
): Recommendation {
    const levers: Lever[] = [];
    const ranked: { site: SiteId; options: SiteOption[] }[] = [];
    for (const site of SITES) {
        const goal = goals[site];
        if (goal.mode !== "grow" && goal.mode !== "shrink") continue;
        if (doses[site].directSetsPerWeek <= 0) continue;

        const options: SiteOption[] = [];
        if (doses[site].zoneShare < 0.7 - 1e-9) {
            const inches = siteInches(fit, doses, site, { zoneShare: 0.7 });
            const value = desiredInches(goal, inches);
            if (value > 0.02) options.push({ kind: "zone", inches, roi: value });
        }
        if (doses[site].freshness < 0.99) {
            const inches = siteInches(fit, doses, site, { freshness: 1 });
            const value = desiredInches(goal, inches);
            if (value > 0.02) options.push({ kind: "freshness", inches, roi: value });
        }
        for (const sets of TRANSFER_STEPS) {
            if (doses[site].directSetsPerWeek + sets > SET_CEILING + 1e-9) continue;
            const inches = siteInches(fit, doses, site, addSets(doses[site], sets));
            const value = desiredInches(goal, inches);
            if (value > 0.02) options.push({ kind: "sets", sets, inches, roi: value / sets });
        }

        options.sort((a, b) => b.roi - a.roi);
        if (options.length) ranked.push({ site, options });
    }

    ranked.sort((a, b) => Math.abs(b.options[0].inches) - Math.abs(a.options[0].inches));
    let firstUsed = 0;
    const chosen: { site: SiteId; option: SiteOption }[] = [];
    for (const row of ranked) {
        let option = row.options[0];
        if (option.kind === "freshness" && firstUsed >= FIRST_SLOTS) {
            const fallback = row.options.find((item) => item.kind !== "freshness");
            if (!fallback) continue;
            option = fallback;
        }
        if (option.kind === "freshness") firstUsed += 1;
        chosen.push({ site: row.site, option });
    }

    for (const { site, option } of chosen) {
        const patch: Partial<SiteDose> =
            option.kind === "zone"
                ? { zoneShare: 0.7 }
                : option.kind === "freshness"
                  ? { freshness: 1 }
                  : addSets(doses[site], option.sets ?? 0);
        const next = cloneDoses(doses);
        next[site] = { ...next[site], ...patch };
        levers.push(
            option.kind === "sets"
                ? { kind: "sets", site, sets: option.sets ?? 0, expectedInches: inchesBetween(fit, doses, next, [site]) }
                : { kind: option.kind, site, expectedInches: inchesBetween(fit, doses, next, [site]) }
        );
    }

    levers.sort((a, b) => Math.abs(b.expectedInches[b.site] ?? 0) - Math.abs(a.expectedInches[a.site] ?? 0));
    const final = cloneDoses(doses);
    for (const lever of levers) {
        if (lever.kind === "zone") final[lever.site] = { ...final[lever.site], zoneShare: 0.7 };
        else if (lever.kind === "freshness") final[lever.site] = { ...final[lever.site], freshness: 1 };
        else if (lever.kind === "sets") {
            final[lever.site] = { ...final[lever.site], ...addSets(final[lever.site], lever.sets) };
        }
    }
    return { levers, gain: utility(fit, final, goals) - utility(fit, doses, goals) };
}

export function signed(n: number, digits: number): string {
    const text = n.toFixed(digits);
    return n > 0 ? `+${text}` : text;
}

function movedCoefficients(fit: Fit): string[] {
    const lines: string[] = [];
    for (const site of SITES) {
        if (Math.abs(fit.a[site]) > 0.5 * PRIORS.interceptSd) {
            lines.push(
                `${SITE_LABEL[site]} baseline ${signed(fit.a[site], 2)} in per 4 weeks after sets and scale weight (prior 0).`
            );
        }
    }
    for (const site of SITES) {
        if (Math.abs(fit.bSets[site] - PRIORS.setsMean) > 0.5 * PRIORS.setsMeanSd) {
            lines.push(`${SITE_LABEL[site]} set slope is ${fit.bSets[site].toFixed(2)} (prior ${PRIORS.setsMean}).`);
        }
        if (Math.abs(fit.bFresh[site] - PRIORS.fresh) > 0.5 * PRIORS.freshSd) {
            lines.push(`${SITE_LABEL[site]} order slope is ${fit.bFresh[site].toFixed(2)} (prior ${PRIORS.fresh}).`);
        }
        if (Math.abs(fit.bZone[site] - PRIORS.zone) > 0.5 * PRIORS.zoneSd) {
            lines.push(`${SITE_LABEL[site]} rep-range slope is ${fit.bZone[site].toFixed(2)} (prior ${PRIORS.zone}).`);
        }
    }
    return lines;
}

export function leverSentence(lever: Lever, doses: Record<SiteId, SiteDose>, withInches = true): string {
    const expected = lever.expectedInches[lever.site];
    const inches = expected == null || !withInches ? "" : ` ${SITE_LABEL[lever.site]} ${signed(expected, 2)} in.`;
    if (lever.kind === "sets") {
        return `Add ${lever.sets} direct sets/week on ${SITE_LABEL[lever.site].toLowerCase()}.${inches}`;
    }
    if (lever.kind === "freshness") {
        const current = doses[lever.site].freshness.toFixed(2);
        return `Train ${SITE_LABEL[lever.site].toLowerCase()} first in the session (freshness now ${current}).${inches}`;
    }
    const pct = Math.round(doses[lever.site].zoneShare * 100);
    return `Shift ${SITE_LABEL[lever.site].toLowerCase()} from ${pct}% of sets in the 7–12 range toward 70%.${inches}`;
}

function frozenSentence(levers: Lever[]): string {
    if (levers.length === 0) {
        return "No tape had a change that raised it. Repeat the last block.";
    }
    const touched = new Set<SiteId>(levers.map((lever) => lever.site));
    const addedSets = levers.some((lever) => lever.kind === "sets");
    const quiet = SITES.filter((site) => !touched.has(site)).map((site) => SITE_LABEL[site]);
    const held = addedSets ? "Frequency and load progression stay as they were." : "Set counts, frequency, and load progression stay as they were.";
    return quiet.length ? `${held} No separate change for ${quiet.join(", ")}.` : held;
}

export function buildRoutineReport(
    goals: Record<SiteId, SiteGoal>,
    tapes: TapeRow[],
    logs: WorkoutLog[]
): RoutineReport {
    const { intervals, skipped } = buildIntervals(tapes, logs);
    if (intervals.length === 0) {
        return {
            ready: false,
            headline: "Not enough taped blocks yet.",
            lines: skipped.length ? skipped : ["Two checkpoints with bodyweight are required before the model can run."],
            unknownExercises: [],
            fit: null,
            recommendation: null,
        };
    }

    const observations = observationsFrom(intervals);
    const fit = fitResponse(observations);
    const last = intervals[intervals.length - 1];
    const recommendation = recommend(fit, last.doses, goals);
    const unknown = [...new Set(intervals.flatMap((interval) => interval.unknownExercises))].sort();

    const lines: string[] = [];
    lines.push(
        `${formatTapeDate(last.start)} → ${formatTapeDate(last.end)} · ${last.weeks.toFixed(1)} weeks · ${last.rawSetsPerWeek.toFixed(0)} working sets/week`
    );
    for (const site of SITES) {
        const delta = last.deltaTape[site];
        if (delta == null) continue;
        const sets = last.doses[site].directSetsPerWeek;
        lines.push(
            `${SITE_LABEL[site]} ${signed(delta, 1)} in on the tape, ${sets.toFixed(1)} direct sets/week, baseline ${signed(fit.a[site], 2)} in per 4 weeks.`
        );
    }
    lines.push("");
    if (recommendation.levers.length === 0) {
        lines.push("Next block: hold. No change raised a tape.");
    } else {
        lines.push("Next block, best change on each tape:");
        for (const lever of recommendation.levers) lines.push(leverSentence(lever, last.doses));
    }
    lines.push(frozenSentence(recommendation.levers));

    const learned = movedCoefficients(fit);
    if (learned.length) {
        lines.push("");
        lines.push(...learned);
    }
    const lastTape = [...tapes].map((row) => row.date.slice(0, 10)).sort().at(-1) ?? "";
    const latestSession = logs.reduce((max, log) => {
        const day = log.date.slice(0, 10);
        return day > max ? day : max;
    }, "");
    if (latestSession > lastTape) {
        lines.push("");
        lines.push(`Sessions after ${formatTapeDate(lastTape)} are not in this fit yet. The next tape brings them in.`);
    }
    if (skipped.length) {
        lines.push("");
        lines.push(...skipped);
    }
    if (unknown.length) {
        lines.push("");
        lines.push(`Unmapped exercises excluded: ${unknown.join(", ")}.`);
    }

    return {
        ready: true,
        headline: recommendation.levers.length ? "Best change on each tape." : "Hold the last block.",
        lines,
        unknownExercises: unknown,
        fit,
        recommendation,
    };
}
