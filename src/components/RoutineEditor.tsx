"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { attributionFor, TARGETS, type PlanDay, type PlanExercise, type Routine, type Target } from "@/lib/planner";
import { SITE_LABEL, SITES } from "@/lib/sites";
import { uid } from "@/lib/store";

const SUGGESTIONS = [
    "Back Squat",
    "Front Squat",
    "Hack Squat",
    "Leg Press",
    "Bulgarian Split Squat",
    "Walking Lunge",
    "Leg Extension",
    "Romanian Deadlift",
    "Deadlift",
    "Seated Leg Curl",
    "Lying Leg Curl",
    "Hip Thrust",
    "Glute Bridge",
    "Cable Kickback",
    "Hip Abduction",
    "Hip Adduction",
    "Standing Calf Raise",
    "Seated Calf Raise",
    "Bench Press",
    "Incline DB Press",
    "Machine Press",
    "Cable Fly",
    "Pec Deck",
    "Dips",
    "Barbell Row",
    "Chest Supported Row",
    "Cable Row",
    "Lat Pulldown",
    "Chin Ups",
    "Straight Arm Pulldown",
    "Overhead Press",
    "Seated DB Press",
    "Lateral Raise",
    "Rear Delt Fly",
    "Face Pull",
    "Shrug",
    "Barbell Curl",
    "Cable Curl",
    "Hammer Curl",
    "Preacher Curl",
    "Triceps Pushdown",
    "Overhead Extension",
    "Skull Crusher Extension",
    "Wrist Curl",
    "Reverse Curl",
    "Farmer Carry",
    "Neck Curl",
    "Neck Extension",
    "Cable Crunch",
    "Hanging Leg Raise",
    "Plank",
];

type Props = {
    routine: Routine;
    onChange: (next: Routine) => void;
};

function move<T>(list: T[], index: number, by: number): T[] {
    const to = index + by;
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    return next;
}

function TargetPicker({ exercise, onChange }: { exercise: PlanExercise; onChange: (target: Target | undefined) => void }) {
    return (
        <select
            aria-label="Counts toward"
            value={exercise.target ?? ""}
            onChange={(e) => onChange((e.target.value || undefined) as Target | undefined)}
            className="border border-black text-[10px] font-bold uppercase tracking-wider px-1 py-0.5 bg-white"
        >
            <option value="">{exercise.target ? "Match by name" : "Counts toward…"}</option>
            {TARGETS.map((t) => (
                <option key={t} value={t}>
                    {t === "core" ? "Core (no tape)" : SITE_LABEL[t]}
                </option>
            ))}
        </select>
    );
}

function SiteChips({ exercise, onTarget }: { exercise: PlanExercise; onTarget: (target: Target | undefined) => void }) {
    if (!exercise.name.trim() && !exercise.target) return null;
    const a = attributionFor(exercise);
    if (a.kind === "unknown") {
        return (
            <span className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-alert">Not recognised: no tape credit</span>
                <TargetPicker exercise={exercise} onChange={onTarget} />
            </span>
        );
    }
    const picker = exercise.target ? <TargetPicker exercise={exercise} onChange={onTarget} /> : null;
    if (a.kind === "untaped") {
        return (
            <span className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-50">No tape site (core / mobility)</span>
                {picker}
            </span>
        );
    }
    return (
        <span className="flex flex-wrap gap-1">
            {SITES.filter((s) => a.primary[s]).map((s) => (
                <span key={s} className="text-[10px] font-black uppercase tracking-wider bg-black text-white px-1.5 py-0.5">
                    {SITE_LABEL[s]}
                </span>
            ))}
            {SITES.filter((s) => a.secondary[s]).map((s) => (
                <span key={s} className="text-[10px] font-bold uppercase tracking-wider border border-black px-1.5 py-0.5 opacity-70">
                    {SITE_LABEL[s]} ½
                </span>
            ))}
            {picker}
        </span>
    );
}

function NumberCell({
    value,
    label,
    min,
    max,
    onChange,
}: {
    value: number;
    label: string;
    min: number;
    max: number;
    onChange: (n: number) => void;
}) {
    return (
        <input
            aria-label={label}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={value}
            onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
            }}
            className="w-12 border-heavy p-1 text-center font-data font-bold text-sm"
        />
    );
}

function ExerciseRow({
    exercise,
    index,
    count,
    onChange,
    onMove,
    onRemove,
}: {
    exercise: PlanExercise;
    index: number;
    count: number;
    onChange: (next: PlanExercise) => void;
    onMove: (by: number) => void;
    onRemove: () => void;
}) {
    return (
        <li className="border-t-2 border-black p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <span className="font-data text-xs font-bold opacity-40 w-4">{index + 1}</span>
                <input
                    aria-label="Exercise name"
                    list="exercise-suggestions"
                    value={exercise.name}
                    placeholder="Exercise name"
                    onChange={(e) => onChange({ ...exercise, name: e.target.value })}
                    className="flex-1 min-w-0 border-heavy p-1.5 font-bold text-sm"
                />
                <button
                    type="button"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => onMove(-1)}
                    className="p-1 disabled:opacity-20"
                >
                    <ArrowUp size={16} />
                </button>
                <button
                    type="button"
                    aria-label="Move down"
                    disabled={index === count - 1}
                    onClick={() => onMove(1)}
                    className="p-1 disabled:opacity-20"
                >
                    <ArrowDown size={16} />
                </button>
                <button type="button" aria-label="Remove exercise" onClick={onRemove} className="p-1 hover:text-alert">
                    <Trash2 size={16} />
                </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-6">
                <NumberCell
                    label="Sets"
                    value={exercise.sets}
                    min={1}
                    max={12}
                    onChange={(sets) => onChange({ ...exercise, sets })}
                />
                <span className="text-xs font-bold uppercase opacity-60">sets ×</span>
                <NumberCell
                    label="Reps from"
                    value={exercise.repLow}
                    min={1}
                    max={50}
                    onChange={(repLow) => onChange({ ...exercise, repLow, repHigh: Math.max(repLow, exercise.repHigh) })}
                />
                <span className="font-bold">–</span>
                <NumberCell
                    label="Reps to"
                    value={exercise.repHigh}
                    min={1}
                    max={50}
                    onChange={(repHigh) => onChange({ ...exercise, repHigh, repLow: Math.min(repHigh, exercise.repLow) })}
                />
                <span className="text-xs font-bold uppercase opacity-60">reps</span>
                <span className="basis-full">
                    <SiteChips exercise={exercise} onTarget={(target) => onChange({ ...exercise, target })} />
                </span>
            </div>
        </li>
    );
}

function DayCard({
    day,
    index,
    count,
    onChange,
    onMove,
    onRemove,
}: {
    day: PlanDay;
    index: number;
    count: number;
    onChange: (next: PlanDay) => void;
    onMove: (by: number) => void;
    onRemove: () => void;
}) {
    const setExercises = (exercises: PlanExercise[]) => onChange({ ...day, exercises });
    return (
        <section className="border-heavy">
            <header className="flex items-center gap-2 p-2 bg-black text-white">
                <span className="font-data text-xs font-bold opacity-60 w-12">DAY {index + 1}</span>
                <input
                    aria-label="Day name"
                    value={day.name}
                    onChange={(e) => onChange({ ...day, name: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent font-black uppercase tracking-tight border-b border-white/40 focus:outline-none focus:border-white"
                />
                <button type="button" aria-label="Move day up" disabled={index === 0} onClick={() => onMove(-1)} className="p-1 disabled:opacity-20">
                    <ArrowUp size={16} />
                </button>
                <button
                    type="button"
                    aria-label="Move day down"
                    disabled={index === count - 1}
                    onClick={() => onMove(1)}
                    className="p-1 disabled:opacity-20"
                >
                    <ArrowDown size={16} />
                </button>
                <button type="button" aria-label="Remove day" disabled={count === 1} onClick={onRemove} className="p-1 disabled:opacity-20">
                    <Trash2 size={16} />
                </button>
            </header>
            {day.exercises.length === 0 && (
                <p className="px-3 pt-3 text-xs font-bold uppercase tracking-widest opacity-40">Rest day</p>
            )}
            <ul>
                {day.exercises.map((exercise, i) => (
                    <ExerciseRow
                        key={exercise.id}
                        exercise={exercise}
                        index={i}
                        count={day.exercises.length}
                        onChange={(next) => setExercises(day.exercises.map((e) => (e.id === exercise.id ? next : e)))}
                        onMove={(by) => setExercises(move(day.exercises, i, by))}
                        onRemove={() => setExercises(day.exercises.filter((e) => e.id !== exercise.id))}
                    />
                ))}
            </ul>
            <div className="p-3">
                <button
                    type="button"
                    onClick={() => setExercises([...day.exercises, { id: uid(), name: "", sets: 3, repLow: 8, repHigh: 12 }])}
                    className="text-xs font-black uppercase tracking-widest flex items-center gap-1 hover:underline"
                >
                    <Plus size={14} /> Add exercise
                </button>
            </div>
        </section>
    );
}

export function RoutineEditor({ routine, onChange }: Props) {
    const setDays = (days: PlanDay[]) => onChange({ ...routine, days });
    return (
        <div className="flex flex-col gap-4">
            <datalist id="exercise-suggestions">
                {SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                ))}
            </datalist>
            <p className="text-xs font-bold opacity-60">
                {routine.days.length}-day cycle, repeated. Days with no exercises are rest days. Exercise order sets which
                body part is trained fresh.
            </p>
            {routine.days.map((day, i) => (
                <DayCard
                    key={day.id}
                    day={day}
                    index={i}
                    count={routine.days.length}
                    onChange={(next) => setDays(routine.days.map((d) => (d.id === day.id ? next : d)))}
                    onMove={(by) => setDays(move(routine.days, i, by))}
                    onRemove={() => setDays(routine.days.filter((d) => d.id !== day.id))}
                />
            ))}
            <button
                type="button"
                disabled={routine.days.length >= 14}
                onClick={() => setDays([...routine.days, { id: uid(), name: `Day ${routine.days.length + 1}`, exercises: [] }])}
                className="border-heavy border-dashed p-3 font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 hover:bg-black hover:text-white disabled:opacity-30"
            >
                <Plus size={16} /> Add day
            </button>
        </div>
    );
}
