// Everything a visitor enters lives in their own browser. Export/import moves it between devices.

import type { TapeRow } from "./response-model";
import { defaultGoals, SITES, type SiteGoal, type SiteId } from "./sites";
import type { PlanDay, PlanExercise, Routine, RoutineVersion } from "./planner";

export type LabState = {
    version: 1;
    /** Routines that were actually followed, each from its start date. */
    history: RoutineVersion[];
    /** The routine being edited. Compared against the routine in force today. */
    draft: Routine;
    tapes: TapeRow[];
    goals: Record<SiteId, SiteGoal>;
    unit: "in" | "cm";
};

const KEY = "routine-lab:v1";

export function uid(): string {
    return Math.random().toString(36).slice(2, 10);
}

export function today(): string {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
}

function ex(name: string, sets: number, repLow: number, repHigh: number): PlanExercise {
    return { id: uid(), name, sets, repLow, repHigh };
}

function day(name: string, exercises: PlanExercise[] = []): PlanDay {
    return { id: uid(), name, exercises };
}

/** A plain upper/lower split so the page has something to change on first visit. */
export function starterRoutine(): Routine {
    return {
        days: [
            day("Upper A", [
                ex("Bench Press", 3, 6, 10),
                ex("Chest Supported Row", 3, 8, 12),
                ex("Seated DB Press", 3, 8, 12),
                ex("Lat Pulldown", 3, 10, 12),
                ex("Cable Curl", 2, 10, 15),
                ex("Triceps Pushdown", 2, 10, 15),
            ]),
            day("Lower A", [
                ex("Back Squat", 3, 5, 8),
                ex("Romanian Deadlift", 3, 8, 10),
                ex("Leg Extension", 2, 12, 15),
                ex("Standing Calf Raise", 3, 10, 15),
            ]),
            day("Rest"),
            day("Upper B", [
                ex("Incline DB Press", 3, 8, 12),
                ex("Barbell Row", 3, 6, 10),
                ex("Lateral Raise", 3, 12, 20),
                ex("Cable Fly", 2, 12, 15),
                ex("Hammer Curl", 2, 10, 12),
                ex("Overhead Extension", 2, 10, 15),
            ]),
            day("Lower B", [
                ex("Hip Thrust", 3, 8, 12),
                ex("Leg Press", 3, 10, 15),
                ex("Seated Leg Curl", 3, 10, 12),
                ex("Seated Calf Raise", 3, 12, 15),
            ]),
            day("Rest"),
            day("Rest"),
        ],
    };
}

export function cloneRoutine(r: Routine): Routine {
    return JSON.parse(JSON.stringify(r)) as Routine;
}

export function initialState(): LabState {
    const draft = starterRoutine();
    return {
        version: 1,
        history: [{ id: uid(), from: today(), routine: cloneRoutine(draft) }],
        draft,
        tapes: [],
        goals: defaultGoals(),
        unit: "in",
    };
}

function isState(value: unknown): value is LabState {
    if (!value || typeof value !== "object") return false;
    const v = value as Partial<LabState>;
    return (
        v.version === 1 &&
        Array.isArray(v.history) &&
        Array.isArray(v.tapes) &&
        !!v.draft &&
        Array.isArray(v.draft.days) &&
        !!v.goals &&
        SITES.every((s) => v.goals?.[s] != null)
    );
}

export function parseState(text: string): LabState | null {
    try {
        const value = JSON.parse(text);
        return isState(value) ? { ...value, unit: value.unit === "cm" ? "cm" : "in" } : null;
    } catch {
        return null;
    }
}

export function loadState(): LabState | null {
    try {
        const raw = window.localStorage.getItem(KEY);
        return raw ? parseState(raw) : null;
    } catch {
        return null;
    }
}

export function saveState(state: LabState): void {
    try {
        window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
        // Private windows can refuse storage. The page still works for this visit.
    }
}
