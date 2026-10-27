import {
    applyChange,
    attributionFor,
    changeImpacts,
    diffRoutines,
    fitFromHistory,
    forecast,
    routineDoses,
    synthesizeLogs,
    versionOn,
    type Routine,
    type RoutineVersion,
} from "../src/lib/planner";
import { fitResponse, type TapeRow } from "../src/lib/response-model";
import { defaultGoals } from "../src/lib/sites";
import { cloneRoutine, starterRoutine } from "../src/lib/store";

function routine(): Routine {
    return {
        days: [
            {
                id: "d1",
                name: "Arms",
                exercises: [
                    { id: "e1", name: "Cable Curl", sets: 3, repLow: 8, repHigh: 12 },
                    { id: "e2", name: "Triceps Pushdown", sets: 3, repLow: 8, repHigh: 12 },
                ],
            },
            { id: "d2", name: "Rest", exercises: [] },
        ],
    };
}

/** Arms once a week: 6 direct sets, well under the peak. */
function weekly(): Routine {
    const r = routine();
    const rest = (i: number) => ({ id: `r${i}`, name: "Rest", exercises: [] });
    return { days: [r.days[0], ...[1, 2, 3, 4, 5, 6].map(rest)] };
}

function tape(date: string, arms: number, weight = 180): TapeRow {
    return {
        date,
        bust: 40,
        waist: 32,
        hips: 38,
        thighs: 23,
        shoulders: 48,
        arms,
        forearms: 12,
        calves: 15,
        neck: 15,
        wrist: null,
        ankle: null,
        weight,
    };
}

describe("exercise names", () => {
    it("maps every starter exercise onto a tape", () => {
        for (const day of starterRoutine().days) {
            for (const e of day.exercises) {
                expect([e.name, attributionFor(e).kind]).toEqual([e.name, "mapped"]);
            }
        }
    });

    it("reads free-typed names the way the tracker reads ids", () => {
        expect(attributionFor({ name: "Romanian Deadlift" }).primary).toEqual({ thighs: 1 });
        expect(attributionFor({ name: "Lat Pulldown" }).primary).toEqual({ chest: 1 });
        expect(attributionFor({ name: "lateral raise" }).primary).toEqual({ shoulders: 1 });
        expect(attributionFor({ name: "Juggling" }).kind).toBe("unknown");
        expect(attributionFor({ name: "Pull Ups" }).primary).toEqual({ chest: 1 });
        expect(attributionFor({ name: "Military Press" }).primary).toEqual({ shoulders: 1 });
    });

    it("credits an unrecognised name to the tape the visitor picks", () => {
        expect(attributionFor({ name: "Juggling", target: "forearms" }).primary).toEqual({ forearms: 1 });
        expect(attributionFor({ name: "Juggling", target: "core" }).kind).toBe("untaped");
        const base = routine();
        const next = cloneRoutine(base);
        next.days[0].exercises.push({ id: "j", name: "Juggling", sets: 3, repLow: 10, repHigh: 10 });
        const unpicked = forecast(fitResponse([]), base, next).find((r) => r.site === "forearms")!;
        next.days[0].exercises[2].target = "forearms";
        const picked = forecast(fitResponse([]), base, next).find((r) => r.site === "forearms")!;
        expect(unpicked.change).toBe(0);
        expect(picked.change).toBeGreaterThan(0);
        expect(diffRoutines(base, next).map((c) => c.kind)).toEqual(["add"]);
    });
});

describe("routine dose", () => {
    it("repeats the cycle from the version's start date", () => {
        const versions: RoutineVersion[] = [{ id: "v", from: "2026-01-01", routine: routine() }];
        const logs = synthesizeLogs(versions, "2026-01-01", "2026-01-05");
        expect([...new Set(logs.map((l) => l.date))]).toEqual(["2026-01-01", "2026-01-03"]);
        expect(logs.filter((l) => l.date === "2026-01-01")).toHaveLength(6);
    });

    it("counts weekly direct sets, frequency, and rep zone for a two-day cycle", () => {
        const doses = routineDoses(routine());
        // A two-day cycle trains arms 3.5 times a week, 6 sets each time.
        expect(doses.arms.directSetsPerWeek).toBeCloseTo(21, 5);
        expect(doses.arms.frequencyPerWeek).toBeCloseTo(3.5, 5);
        expect(doses.arms.zoneShare).toBe(1);
        expect(doses.chest.directSetsPerWeek).toBe(0);
    });

    it("picks the latest version that has started", () => {
        const versions: RoutineVersion[] = [
            { id: "a", from: "2026-01-01", routine: routine() },
            { id: "b", from: "2026-02-01", routine: routine() },
        ];
        expect(versionOn(versions, "2026-01-31")?.id).toBe("a");
        expect(versionOn(versions, "2026-02-01")?.id).toBe("b");
        expect(versionOn(versions, "2025-12-31")).toBeNull();
    });
});

describe("what-if", () => {
    it("credits added curl sets to the arm tape and nowhere unrelated", () => {
        const base = weekly();
        const next = cloneRoutine(base);
        next.days[0].exercises[0].sets = 6;
        const rows = forecast(fitResponse([]), base, next);
        const arms = rows.find((r) => r.site === "arms")!;
        const calves = rows.find((r) => r.site === "calves")!;
        expect(arms.change).toBeGreaterThan(0);
        expect(calves.change).toBe(0);
    });

    it("lists each change and applies them one at a time", () => {
        const base = routine();
        const next = cloneRoutine(base);
        next.days[0].exercises.reverse();
        next.days[0].exercises.push({ id: "e3", name: "Lateral Raise", sets: 3, repLow: 12, repHigh: 15 });
        next.days[1] = { id: "d3", name: "Legs", exercises: [{ id: "e4", name: "Leg Press", sets: 4, repLow: 10, repHigh: 12 }] };

        const changes = diffRoutines(base, next);
        expect(changes.map((c) => c.kind).sort()).toEqual(["add", "add-day", "remove-day", "reorder"]);

        const add = changes.find((c) => c.kind === "add")!;
        expect(applyChange(base, next, add).days[0].exercises.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
        const reorder = changes.find((c) => c.kind === "reorder")!;
        expect(applyChange(base, next, reorder).days[0].exercises.map((e) => e.id)).toEqual(["e2", "e1"]);

        const impacts = changeImpacts(fitResponse([]), base, next, defaultGoals());
        const legs = impacts.find((i) => i.change.kind === "add-day")!;
        expect(legs.sites.find((s) => s.site === "thighs")!.change).toBeGreaterThan(0);
    });

    it("stops rewarding piled-on volume", () => {
        const base = weekly();
        const more = cloneRoutine(base);
        more.days[0].exercises[0].sets = 6;
        const huge = cloneRoutine(base);
        // 30 arm sets in one session: past both the weekly peak and the session cap.
        huge.days[0].exercises[0].sets = 12;
        huge.days[0].exercises[1].sets = 6;
        huge.days[0].exercises.push({ id: "x", name: "Hammer Curl", sets: 12, repLow: 8, repHigh: 12 });
        const fit = fitResponse([]);
        const arms = (r: Routine) => forecast(fit, base, r).find((row) => row.site === "arms")!.change;
        expect(arms(more)).toBeGreaterThan(0);
        expect(arms(huge)).toBeLessThan(0);
    });

    it("reports no changes for an identical routine", () => {
        expect(diffRoutines(routine(), routine())).toEqual([]);
    });
});

describe("history fit", () => {
    it("stays on the prior until two tapes bracket a followed routine", () => {
        const versions: RoutineVersion[] = [{ id: "v", from: "2026-01-01", routine: routine() }];
        expect(fitFromHistory([tape("2026-01-01", 14)], versions).blocks).toBe(0);
        const state = fitFromHistory([tape("2026-01-01", 14), tape("2026-02-01", 15)], versions);
        expect(state.blocks).toBe(1);
        expect(state.fit.a.arms).toBeGreaterThan(0);
    });
});
