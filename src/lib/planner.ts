// A visitor's routine is a repeating cycle of days. Each saved version starts on a date.
// The response model reads logged sets, so the routine history is turned into the sets
// the visitor would have logged by following it. Doses, the fit, and every what-if
// come out of the same code path the private tracker uses.

import { classifyExercise, type Attribution } from "./exercise-sites";
import {
    buildIntervals,
    fitResponse,
    observationsFrom,
    predictDelta,
    recommend,
    type Fit,
    type Recommendation,
    type SiteDose,
    type TapeRow,
    type WorkoutLog,
} from "./response-model";
import { LAMBDA_HOLD, SITES, type SiteGoal, type SiteId } from "./sites";

export type PlanExercise = {
    id: string;
    name: string;
    sets: number;
    repLow: number;
    repHigh: number;
    /** Set by the visitor when the name is not recognised. Overrides the name match. */
    target?: Target;
};

/** A tape the visitor can credit an exercise to, or core work that moves no tape. */
export type Target = Exclude<SiteId, "waist"> | "core";

/** One exercise id per target that the matcher credits to that tape alone. */
const TARGET_ID: Record<Target, string> = {
    chest: "pec_deck",
    shoulders: "lateral_raise",
    arms: "cable_curl",
    forearms: "wrist_curl",
    hips: "hip_abduction",
    thighs: "adductor",
    calves: "calf_raise",
    neck: "neck_curl",
    core: "plank",
};

export const TARGETS = Object.keys(TARGET_ID) as Target[];

export type PlanDay = {
    id: string;
    name: string;
    /** No exercises means a rest day. */
    exercises: PlanExercise[];
};

export type Routine = {
    days: PlanDay[];
};

export type RoutineVersion = {
    id: string;
    /** First day this routine was followed, YYYY-MM-DD. */
    from: string;
    routine: Routine;
};

/** Window used to read a routine's weekly dose. Four weeks covers any cycle up to 28 days evenly enough. */
const DOSE_WEEKS = 4;

export function exerciseKey(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/** The id the model reads for an exercise: the visitor's override if there is one, else the name. */
export function modelId(exercise: Pick<PlanExercise, "name" | "target">): string {
    return exercise.target ? TARGET_ID[exercise.target] : exerciseKey(exercise.name);
}

export function attributionFor(exercise: Pick<PlanExercise, "name" | "target">): Attribution {
    return classifyExercise(modelId(exercise));
}

function addDays(iso: string, days: number): string {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dayDiff(from: string, to: string): number {
    const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
    const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
    return Math.round((b - a) / 86_400_000);
}

/** The version in force on a date: the latest one that started on or before it. */
export function versionOn(versions: RoutineVersion[], date: string): RoutineVersion | null {
    let found: RoutineVersion | null = null;
    for (const version of [...versions].sort((a, b) => a.from.localeCompare(b.from))) {
        if (version.from <= date) found = version;
    }
    return found;
}

/**
 * The working sets a visitor following these versions would have logged in [start, end).
 * Load is held flat, so progression stays at zero. Reps sit at the middle of the range.
 * createdAt carries exercise order so freshness is read the same way as real logs.
 */
export function synthesizeLogs(versions: RoutineVersion[], start: string, end: string): WorkoutLog[] {
    const logs: WorkoutLog[] = [];
    const total = dayDiff(start, end);
    for (let i = 0; i < total; i++) {
        const date = addDays(start, i);
        const version = versionOn(versions, date);
        if (!version || version.routine.days.length === 0) continue;
        const cycle = version.routine.days;
        const day = cycle[dayDiff(version.from, date) % cycle.length];
        if (day.exercises.length === 0) continue;
        const workoutId = `${date}:${day.id}`;
        day.exercises.forEach((exercise, order) => {
            const reps = Math.round((exercise.repLow + exercise.repHigh) / 2);
            for (let set = 0; set < exercise.sets; set++) {
                logs.push({
                    workoutId,
                    date,
                    exerciseId: modelId(exercise),
                    reps,
                    weight: 1,
                    isWarmup: false,
                    createdAt: `${date}T${String(order).padStart(4, "0")}:${String(set).padStart(3, "0")}`,
                });
            }
        });
    }
    return logs;
}

function flatTape(date: string): TapeRow {
    return {
        date,
        bust: 0,
        waist: 0,
        hips: 0,
        thighs: 0,
        shoulders: 0,
        arms: 0,
        forearms: 0,
        calves: 0,
        neck: 0,
        wrist: null,
        ankle: null,
        weight: 0,
    };
}

/** Weekly dose per tape for a routine, read over a fixed window by the model's own interval code. */
export function routineDoses(routine: Routine): Record<SiteId, SiteDose> {
    const start = "2000-01-03";
    const end = addDays(start, DOSE_WEEKS * 7);
    const logs = synthesizeLogs([{ id: "probe", from: start, routine }], start, end);
    const { intervals } = buildIntervals([flatTape(start), flatTape(end)], logs);
    return intervals[0].doses;
}

export type ModelState = {
    fit: Fit;
    /** Measurement blocks that fed the fit. Zero means the fit is the prior. */
    blocks: number;
    skipped: string[];
    unknownExercises: string[];
};

export function fitFromHistory(tapes: TapeRow[], versions: RoutineVersion[]): ModelState {
    const ordered = [...tapes].sort((a, b) => a.date.localeCompare(b.date));
    if (ordered.length < 2 || versions.length === 0) {
        return { fit: fitResponse([]), blocks: 0, skipped: [], unknownExercises: [] };
    }
    const first = ordered[0].date.slice(0, 10);
    const last = ordered[ordered.length - 1].date.slice(0, 10);
    const logs = synthesizeLogs(versions, first, last);
    const { intervals, skipped } = buildIntervals(ordered, logs);
    return {
        fit: fitResponse(observationsFrom(intervals)),
        blocks: intervals.length,
        skipped,
        unknownExercises: [...new Set(intervals.flatMap((i) => i.unknownExercises))].sort(),
    };
}

export type SiteForecast = {
    site: SiteId;
    base: number;
    next: number;
    /** next − base, inches per measurement block. */
    change: number;
    baseSets: number;
    nextSets: number;
};

export function forecast(fit: Fit, base: Routine, next: Routine): SiteForecast[] {
    const a = routineDoses(base);
    const b = routineDoses(next);
    return SITES.map((site) => {
        const before = predictDelta(fit, site, a[site], 0);
        const after = predictDelta(fit, site, b[site], 0);
        return {
            site,
            base: before,
            next: after,
            change: after - before,
            baseSets: a[site].directSetsPerWeek,
            nextSets: b[site].directSetsPerWeek,
        };
    });
}

/** Sum of goal-weighted inches. Positive means the change moves tapes the way the goals want. */
export function goalScore(rows: SiteForecast[], goals: Record<SiteId, SiteGoal>): number {
    let score = 0;
    for (const row of rows) {
        const goal = goals[row.site];
        if (goal.mode === "grow") score += goal.weight * row.change;
        else if (goal.mode === "shrink") score -= goal.weight * row.change;
        else if (goal.mode === "hold") score -= LAMBDA_HOLD * (Math.abs(row.next) - Math.abs(row.base));
    }
    return score;
}

export function recommendFor(fit: Fit, routine: Routine, goals: Record<SiteId, SiteGoal>): Recommendation {
    return recommend(fit, routineDoses(routine), goals);
}

// ---- Changes between two routines, one at a time ----

export type RoutineChange =
    | { kind: "add-day"; dayId: string; label: string }
    | { kind: "remove-day"; dayId: string; label: string }
    | { kind: "add"; dayId: string; exerciseId: string; label: string }
    | { kind: "remove"; dayId: string; exerciseId: string; label: string }
    | { kind: "edit"; dayId: string; exerciseId: string; label: string }
    | { kind: "reorder"; dayId: string; label: string };

function describeSets(e: PlanExercise): string {
    return `${e.sets}×${e.repLow === e.repHigh ? e.repLow : `${e.repLow}–${e.repHigh}`}`;
}

export function diffRoutines(base: Routine, next: Routine): RoutineChange[] {
    const changes: RoutineChange[] = [];
    const baseDays = new Map(base.days.map((d) => [d.id, d]));
    const nextDays = new Map(next.days.map((d) => [d.id, d]));

    for (const day of base.days) {
        if (!nextDays.has(day.id)) changes.push({ kind: "remove-day", dayId: day.id, label: `Removed ${day.name}` });
    }
    for (const day of next.days) {
        const before = baseDays.get(day.id);
        if (!before) {
            changes.push({ kind: "add-day", dayId: day.id, label: `Added ${day.name}` });
            continue;
        }
        const beforeEx = new Map(before.exercises.map((e) => [e.id, e]));
        const afterEx = new Map(day.exercises.map((e) => [e.id, e]));
        for (const e of before.exercises) {
            if (!afterEx.has(e.id)) {
                changes.push({ kind: "remove", dayId: day.id, exerciseId: e.id, label: `${day.name}: removed ${e.name}` });
            }
        }
        for (const e of day.exercises) {
            const old = beforeEx.get(e.id);
            if (!old) {
                changes.push({
                    kind: "add",
                    dayId: day.id,
                    exerciseId: e.id,
                    label: `${day.name}: added ${e.name} ${describeSets(e)}`,
                });
            } else if (
                old.name !== e.name ||
                old.sets !== e.sets ||
                old.repLow !== e.repLow ||
                old.repHigh !== e.repHigh ||
                old.target !== e.target
            ) {
                const what = old.name !== e.name ? `${old.name} → ${e.name}` : e.name;
                changes.push({
                    kind: "edit",
                    dayId: day.id,
                    exerciseId: e.id,
                    label: `${day.name}: ${what} ${describeSets(old)} → ${describeSets(e)}`,
                });
            }
        }
        const kept = (list: PlanExercise[], other: Map<string, PlanExercise>) =>
            list.filter((e) => other.has(e.id)).map((e) => e.id).join(",");
        if (kept(before.exercises, afterEx) !== kept(day.exercises, beforeEx)) {
            changes.push({ kind: "reorder", dayId: day.id, label: `${day.name}: exercise order` });
        }
    }
    return changes;
}

/** The base routine with only this one change from next applied. */
export function applyChange(base: Routine, next: Routine, change: RoutineChange): Routine {
    const nextDay = next.days.find((d) => d.id === change.dayId);
    if (change.kind === "remove-day") {
        return { days: base.days.filter((d) => d.id !== change.dayId) };
    }
    if (change.kind === "add-day") {
        if (!nextDay) return base;
        // Slot the new day where it sits in the next cycle, among the days base already has.
        const index = next.days.indexOf(nextDay);
        const before = next.days.slice(0, index).filter((d) => base.days.some((b) => b.id === d.id)).length;
        const days = [...base.days];
        days.splice(before, 0, nextDay);
        return { days };
    }
    return {
        days: base.days.map((day) => {
            if (day.id !== change.dayId || !nextDay) return day;
            if (change.kind === "remove") {
                return { ...day, exercises: day.exercises.filter((e) => e.id !== change.exerciseId) };
            }
            if (change.kind === "edit") {
                const updated = nextDay.exercises.find((e) => e.id === change.exerciseId);
                return {
                    ...day,
                    exercises: day.exercises.map((e) => (e.id === change.exerciseId && updated ? updated : e)),
                };
            }
            if (change.kind === "add") {
                const added = nextDay.exercises.find((e) => e.id === change.exerciseId);
                if (!added) return day;
                const index = nextDay.exercises.indexOf(added);
                const before = nextDay.exercises
                    .slice(0, index)
                    .filter((e) => day.exercises.some((b) => b.id === e.id)).length;
                const exercises = [...day.exercises];
                exercises.splice(before, 0, added);
                return { ...day, exercises };
            }
            // reorder: base's exercises in next's order, extras kept at the end.
            const order = nextDay.exercises.map((e) => e.id);
            const rank = (id: string) => {
                const i = order.indexOf(id);
                return i === -1 ? Number.MAX_SAFE_INTEGER : i;
            };
            return { ...day, exercises: [...day.exercises].sort((a, b) => rank(a.id) - rank(b.id)) };
        }),
    };
}

export type ChangeImpact = {
    change: RoutineChange;
    sites: SiteForecast[];
    score: number;
};

export function changeImpacts(
    fit: Fit,
    base: Routine,
    next: Routine,
    goals: Record<SiteId, SiteGoal>
): ChangeImpact[] {
    return diffRoutines(base, next).map((change) => {
        const sites = forecast(fit, base, applyChange(base, next, change));
        return { change, sites, score: goalScore(sites, goals) };
    });
}
