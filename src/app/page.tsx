"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Download, Dumbbell, Ruler, RotateCcw, Upload } from "lucide-react";
import { BodyLog } from "@/components/BodyLog";
import { ImpactView } from "@/components/ImpactView";
import { RoutineEditor } from "@/components/RoutineEditor";
import { diffRoutines, fitFromHistory, versionOn, type Routine } from "@/lib/planner";
import { formatTapeDate } from "@/lib/response-model";
import { cloneRoutine, initialState, loadState, parseState, saveState, today, uid, type LabState } from "@/lib/store";

type Tab = "impact" | "routine" | "body";

const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
    { id: "routine", label: "Routine", icon: Dumbbell },
    { id: "impact", label: "Impact", icon: Activity },
    { id: "body", label: "Body", icon: Ruler },
];

export default function Home() {
    const [state, setState] = useState<LabState | null>(null);
    const [tab, setTab] = useState<Tab>("routine");
    const [startDate, setStartDate] = useState(today());
    const [message, setMessage] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Browser storage only exists after mount, so the saved state is read here.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState(loadState() ?? initialState());
    }, []);

    useEffect(() => {
        if (state) saveState(state);
    }, [state]);

    const activeVersion = useMemo(() => {
        if (!state) return null;
        const sorted = [...state.history].sort((a, b) => a.from.localeCompare(b.from));
        return versionOn(sorted, today()) ?? sorted[0] ?? null;
    }, [state]);
    const active: Routine = useMemo(() => activeVersion?.routine ?? { days: [] }, [activeVersion]);
    const model = useMemo(() => (state ? fitFromHistory(state.tapes, state.history) : null), [state]);
    const pending = useMemo(() => (state ? diffRoutines(active, state.draft).length : 0), [state, active]);

    if (!state || !model) {
        return <div className="p-12 text-center font-black uppercase tracking-widest text-sm opacity-50">Loading…</div>;
    }

    const update = (patch: Partial<LabState>) => setState({ ...state, ...patch });

    const commit = () => {
        const history = state.history.filter((v) => v.from !== startDate);
        history.push({ id: uid(), from: startDate, routine: cloneRoutine(state.draft) });
        history.sort((a, b) => a.from.localeCompare(b.from));
        update({ history });
        setMessage(`Saved. This routine counts from ${formatTapeDate(startDate)}.`);
    };

    const exportData = () => {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `routine-lab-${today()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const importData = async (file: File) => {
        const next = parseState(await file.text());
        if (!next) {
            setMessage("That file is not a Routine Lab export.");
            return;
        }
        setState(next);
        setMessage("Imported.");
    };

    return (
        <div className="flex flex-col min-h-dvh">
            <header className="bg-black text-white p-4 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black tracking-tighter uppercase">Routine Lab</h1>
                        <p className="text-[11px] font-bold opacity-70 uppercase tracking-widest mt-1">
                            Change the routine. See every tape move.
                        </p>
                    </div>
                    <div className="flex border-2 border-white text-[11px] font-black uppercase" role="radiogroup" aria-label="Units">
                        {(["in", "cm"] as const).map((u) => (
                            <button
                                key={u}
                                type="button"
                                role="radio"
                                aria-checked={state.unit === u}
                                onClick={() => update({ unit: u })}
                                className={`px-2 py-1 whitespace-nowrap ${state.unit === u ? "bg-white text-black" : ""}`}
                            >
                                {u === "in" ? "in / lb" : "cm / kg"}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <nav className="grid grid-cols-3 border-b-4 border-black sticky top-0 bg-white z-10">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        className={`p-3 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-1.5 border-l-2 border-black first:border-l-0 ${
                            tab === id ? "bg-black text-white" : "hover:bg-neutral-100"
                        }`}
                    >
                        <Icon size={14} />
                        {label}
                        {id === "impact" && pending > 0 && (
                            <span className={`font-data px-1 ${tab === id ? "bg-white text-black" : "bg-black text-white"}`}>{pending}</span>
                        )}
                    </button>
                ))}
            </nav>

            {message && (
                <div className="bg-action text-white text-xs font-black uppercase tracking-wider p-2 flex justify-between">
                    <span>{message}</span>
                    <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss">
                        ×
                    </button>
                </div>
            )}

            <div className="flex-1 p-4 sm:p-6">
                {tab === "routine" && <RoutineEditor routine={state.draft} onChange={(draft) => update({ draft })} />}
                {tab === "impact" && (
                    <ImpactView
                        model={model}
                        active={active}
                        activeSince={activeVersion?.from ?? null}
                        draft={state.draft}
                        goals={state.goals}
                        unit={state.unit}
                        onGoal={(site, goal) => update({ goals: { ...state.goals, [site]: goal } })}
                    />
                )}
                {tab === "body" && (
                    <BodyLog
                        tapes={state.tapes}
                        unit={state.unit}
                        onAdd={(row) => update({ tapes: [...state.tapes.filter((t) => t.date !== row.date), row] })}
                        onRemove={(date) => update({ tapes: state.tapes.filter((t) => t.date !== date) })}
                    />
                )}
            </div>

            {pending > 0 && tab !== "body" && (
                <div className="sticky bottom-0 bg-white border-t-4 border-black p-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider flex-1 min-w-[10rem]">
                        {pending} unsaved change{pending === 1 ? "" : "s"}
                        {tab === "routine" && (
                            <button type="button" onClick={() => setTab("impact")} className="ml-2 underline">
                                See impact
                            </button>
                        )}
                    </span>
                    <button
                        type="button"
                        onClick={() => update({ draft: cloneRoutine(active) })}
                        className="border-heavy px-3 py-2 text-xs font-black uppercase tracking-widest"
                    >
                        Discard
                    </button>
                    <label className="flex items-center gap-1 text-xs font-black uppercase">
                        from
                        <input
                            type="date"
                            aria-label="Start date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="border-heavy px-1 py-1.5 font-data"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={commit}
                        className="bg-black text-white px-3 py-2 text-xs font-black uppercase tracking-widest"
                    >
                        Start this routine
                    </button>
                </div>
            )}

            <footer className="border-t-4 border-black p-4 flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={exportData} className="border-heavy px-3 py-1.5 text-[11px] font-black uppercase tracking-widest flex items-center gap-1">
                        <Download size={12} /> Export
                    </button>
                    <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        className="border-heavy px-3 py-1.5 text-[11px] font-black uppercase tracking-widest flex items-center gap-1"
                    >
                        <Upload size={12} /> Import
                    </button>
                    <input
                        ref={fileInput}
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void importData(file);
                            e.target.value = "";
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            if (window.confirm("Erase your routine history and measurements from this browser?")) {
                                setState(initialState());
                                setMessage("Started over.");
                            }
                        }}
                        className="border-heavy px-3 py-1.5 text-[11px] font-black uppercase tracking-widest flex items-center gap-1 hover:bg-alert hover:text-white"
                    >
                        <RotateCcw size={12} /> Start over
                    </button>
                </div>
                <p className="text-[10px] font-bold opacity-50 leading-relaxed">
                    Everything stays in this browser; nothing is uploaded. Predictions come from a Bayesian model of tape
                    change against weekly sets, frequency, exercise order, rep range and bodyweight. With no history it uses
                    conservative general priors; each pair of measurements a week or more apart teaches it how your body
                    responds. It estimates, it does not promise.
                </p>
            </footer>
        </div>
    );
}
