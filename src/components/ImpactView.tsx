"use client";

import { useMemo, useState } from "react";
import { formatTapeDate, leverSentence } from "@/lib/response-model";
import {
    changeImpacts,
    forecast,
    goalScore,
    recommendFor,
    routineDoses,
    type ModelState,
    type Routine,
} from "@/lib/planner";
import { GOAL_MODES, SITE_LABEL, SITES, type GoalMode, type SiteGoal, type SiteId } from "@/lib/sites";
import { signedLength, type Unit } from "@/lib/units";
import { BodyFigure, type FigureValue } from "./BodyFigure";

const GOAL_LABEL: Record<GoalMode, string> = { grow: "Grow", hold: "Hold", shrink: "Shrink", ignore: "Off" };

/** Changes below this, in inches per block, are shown as no change. */
const NOISE = 0.005;

type Props = {
    model: ModelState;
    active: Routine;
    activeSince: string | null;
    draft: Routine;
    goals: Record<SiteId, SiteGoal>;
    unit: Unit;
    onGoal: (site: SiteId, goal: SiteGoal) => void;
};

function verdict(score: number): { text: string; className: string } {
    if (score > 0.005) return { text: "Helps your goals", className: "bg-action text-white" };
    if (score < -0.005) return { text: "Works against your goals", className: "bg-accent text-white" };
    return { text: "Neutral", className: "bg-neutral-200 text-black" };
}

function towardGoal(goal: SiteGoal, change: number): boolean | null {
    if (goal.mode === "ignore" || Math.abs(change) < NOISE) return null;
    if (goal.mode === "grow") return change > 0;
    if (goal.mode === "shrink") return change < 0;
    return false;
}

export function ImpactView({ model, active, activeSince, draft, goals, unit, onGoal }: Props) {
    const [focus, setFocus] = useState<number | null>(null);
    const [site, setSite] = useState<SiteId | null>(null);

    const total = useMemo(() => forecast(model.fit, active, draft), [model.fit, active, draft]);
    const impacts = useMemo(() => changeImpacts(model.fit, active, draft, goals), [model.fit, active, draft, goals]);
    const recommendation = useMemo(() => recommendFor(model.fit, draft, goals), [model.fit, draft, goals]);
    const draftDoses = useMemo(() => routineDoses(draft), [draft]);

    const shownRows = focus != null && impacts[focus] ? impacts[focus].sites : total;
    const figure: FigureValue = Object.fromEntries(shownRows.map((r) => [r.site, r.change]));
    const totalScore = goalScore(total, goals);
    const maxAbs = Math.max(NOISE, ...shownRows.map((r) => Math.abs(r.change)));

    return (
        <div className="flex flex-col gap-6">
            <section className="border-heavy p-3 text-xs font-bold leading-relaxed">
                {model.blocks === 0 ? (
                    <p>
                        <span className="font-black uppercase">Using general priors.</span> Log measurements (with bodyweight)
                        at least a week apart while following a saved routine, and the model starts learning how{" "}
                        <em>your</em> body responds.
                    </p>
                ) : (
                    <p>
                        <span className="font-black uppercase">
                            Personalised on {model.blocks} measurement block{model.blocks === 1 ? "" : "s"}.
                        </span>{" "}
                        Each tape&apos;s response starts at a general prior and moves as its own history moves it.
                    </p>
                )}
                {model.skipped.map((line) => (
                    <p key={line} className="opacity-60">
                        {line}
                    </p>
                ))}
                {model.unknownExercises.length > 0 && (
                    <p className="opacity-60">Not credited to any tape: {model.unknownExercises.join(", ")}.</p>
                )}
            </section>

            <section className="border-heavy">
                <header className="p-3 bg-black text-white">
                    <h2 className="font-black uppercase tracking-tight">
                        {focus != null && impacts[focus] ? impacts[focus].change.label : "Your edits, all together"}
                    </h2>
                    <p className="text-[11px] font-bold opacity-70">
                        Predicted tape change per measurement block vs. the routine in force
                        {activeSince ? ` since ${formatTapeDate(activeSince)}` : ""}.
                    </p>
                </header>
                <div className="grid grid-cols-[minmax(0,7rem)_1fr] sm:grid-cols-[10rem_1fr] gap-3 p-3">
                    <div className="h-64 sm:h-80">
                        <BodyFigure values={figure} goals={goals} selected={site} onSelect={(s) => setSite(s === site ? null : s)} />
                    </div>
                    <ul className="flex flex-col gap-1.5">
                        {shownRows.map((row) => {
                            const goal = goals[row.site];
                            const good = towardGoal(goal, row.change);
                            const width = `${Math.min(50, (Math.abs(row.change) / maxAbs) * 50)}%`;
                            return (
                                <li
                                    key={row.site}
                                    className={`text-xs ${site && site !== row.site ? "opacity-40" : ""} ${goal.mode === "ignore" ? "opacity-50" : ""}`}
                                >
                                    <div className="flex items-baseline justify-between gap-2">
                                        <button type="button" onClick={() => setSite(row.site === site ? null : row.site)} className="font-black uppercase">
                                            {SITE_LABEL[row.site]}
                                        </button>
                                        <span className="font-data font-bold">
                                            {Math.abs(row.change) < NOISE ? "—" : signedLength(row.change, unit, 2)}
                                        </span>
                                    </div>
                                    <div className="relative h-2.5 bg-neutral-100 border border-black">
                                        <div className="absolute inset-y-0 left-1/2 w-px bg-black" />
                                        {Math.abs(row.change) >= NOISE && (
                                            <div
                                                className={`absolute inset-y-0 ${good ? "bg-action" : good === false ? "bg-accent" : "bg-neutral-400"}`}
                                                style={row.change > 0 ? { left: "50%", width } : { right: "50%", width }}
                                            />
                                        )}
                                    </div>
                                    <div className="flex justify-between text-[10px] font-bold opacity-60">
                                        <span>
                                            {row.baseSets.toFixed(1)} → {row.nextSets.toFixed(1)} direct sets/wk
                                        </span>
                                        <span>goal: {GOAL_LABEL[goal.mode]}</span>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
                {focus == null && (
                    <div className="px-3 pb-3">
                        <span className={`inline-block text-[11px] font-black uppercase tracking-wider px-2 py-1 ${verdict(totalScore).className}`}>
                            {impacts.length === 0 ? "No edits yet" : verdict(totalScore).text}
                        </span>
                    </div>
                )}
            </section>

            <section className="border-heavy">
                <header className="p-3 bg-black text-white flex items-baseline justify-between">
                    <h2 className="font-black uppercase tracking-tight">Each change on its own</h2>
                    {focus != null && (
                        <button type="button" onClick={() => setFocus(null)} className="text-[11px] font-black uppercase underline">
                            Show all
                        </button>
                    )}
                </header>
                {impacts.length === 0 ? (
                    <p className="p-3 text-sm font-bold opacity-60">
                        Edit the routine (add or remove exercises, change sets, reps or order) and every change shows up here
                        with the body parts it moves.
                    </p>
                ) : (
                    <ul>
                        {impacts.map((impact, i) => {
                            const v = verdict(impact.score);
                            const moved = impact.sites.filter((s) => Math.abs(s.change) >= NOISE);
                            return (
                                <li key={`${impact.change.kind}:${impact.change.label}`} className="border-t-2 border-black first:border-t-0">
                                    <button
                                        type="button"
                                        onClick={() => setFocus(focus === i ? null : i)}
                                        className={`w-full text-left p-3 flex flex-col gap-1.5 ${focus === i ? "bg-neutral-100" : "hover:bg-neutral-50"}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="font-bold text-sm">{impact.change.label}</span>
                                            <span className={`shrink-0 text-[10px] font-black uppercase px-1.5 py-0.5 ${v.className}`}>{v.text}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {moved.length === 0 ? (
                                                <span className="text-[11px] font-bold opacity-50">No tape moves</span>
                                            ) : (
                                                moved.map((s) => {
                                                    const good = towardGoal(goals[s.site], s.change);
                                                    return (
                                                        <span
                                                            key={s.site}
                                                            className={`text-[11px] font-data font-bold px-1.5 py-0.5 border ${
                                                                good ? "border-action text-action" : good === false ? "border-accent text-accent" : "border-neutral-400 opacity-60"
                                                            }`}
                                                        >
                                                            {SITE_LABEL[s.site]} {signedLength(s.change, unit, 2)}
                                                        </span>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <section className="border-heavy">
                <header className="p-3 bg-black text-white">
                    <h2 className="font-black uppercase tracking-tight">Goals per body part</h2>
                    <p className="text-[11px] font-bold opacity-70">Decides what counts as better, and what the suggestions aim for.</p>
                </header>
                <ul>
                    {SITES.map((s) => (
                        <li key={s} className="border-t-2 border-black first:border-t-0 p-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-black uppercase">{SITE_LABEL[s]}</span>
                            <div className="flex border-heavy" role="radiogroup" aria-label={`${SITE_LABEL[s]} goal`}>
                                {GOAL_MODES.map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        role="radio"
                                        aria-checked={goals[s].mode === mode}
                                        onClick={() =>
                                            onGoal(s, { mode, weight: mode === "grow" || mode === "shrink" ? Math.max(goals[s].weight, 1) : 0 })
                                        }
                                        className={`px-2 py-1 text-[10px] font-black uppercase tracking-wider border-l-2 border-black first:border-l-0 ${
                                            goals[s].mode === mode ? "bg-black text-white" : "bg-white"
                                        }`}
                                    >
                                        {GOAL_LABEL[mode]}
                                    </button>
                                ))}
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="border-heavy">
                <header className="p-3 bg-black text-white">
                    <h2 className="font-black uppercase tracking-tight">Suggested next changes</h2>
                    <p className="text-[11px] font-bold opacity-70">The best single lever per body part, for the routine as edited.</p>
                </header>
                {recommendation.levers.length === 0 ? (
                    <p className="p-3 text-sm font-bold opacity-60">Nothing the model can do raises a goal tape. Keep the routine as it is.</p>
                ) : (
                    <ul>
                        {recommendation.levers.map((lever) => (
                            <li key={`${lever.kind}:${lever.site}`} className="border-t-2 border-black first:border-t-0 p-3 text-sm font-bold">
                                {leverSentence(lever, draftDoses, false)}{" "}
                                <span className="font-data text-action">
                                    {signedLength(lever.expectedInches[lever.site] ?? 0, unit, 2)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
