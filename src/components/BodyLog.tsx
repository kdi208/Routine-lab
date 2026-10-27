"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatTapeDate, type TapeRow } from "@/lib/response-model";
import { SITE_LABEL } from "@/lib/sites";
import { today } from "@/lib/store";
import { lengthIn, lengthOut, weightIn, weightLabel, weightOut, type Unit } from "@/lib/units";

type Field = Exclude<keyof TapeRow, "date">;

const FIELDS: { field: Field; label: string; hint: string }[] = [
    { field: "weight", label: "Bodyweight", hint: "Required for the model" },
    { field: "bust", label: SITE_LABEL.chest, hint: "Around the nipples and lats" },
    { field: "shoulders", label: SITE_LABEL.shoulders, hint: "Widest point, arms down" },
    { field: "arms", label: SITE_LABEL.arms, hint: "Upper arm, flexed" },
    { field: "forearms", label: SITE_LABEL.forearms, hint: "Widest point" },
    { field: "neck", label: SITE_LABEL.neck, hint: "Below the Adam's apple" },
    { field: "waist", label: SITE_LABEL.waist, hint: "At the navel, relaxed" },
    { field: "hips", label: SITE_LABEL.hips, hint: "Widest point of the glutes" },
    { field: "thighs", label: SITE_LABEL.thighs, hint: "Mid-thigh" },
    { field: "calves", label: SITE_LABEL.calves, hint: "Widest point" },
    { field: "wrist", label: "Wrist", hint: "Optional check on tape placement" },
    { field: "ankle", label: "Ankle", hint: "Optional check on tape placement" },
];

type Props = {
    tapes: TapeRow[];
    unit: Unit;
    onAdd: (row: TapeRow) => void;
    onRemove: (date: string) => void;
};

function shown(row: TapeRow, field: Field, unit: Unit): number | null {
    const v = row[field];
    if (v == null) return null;
    return field === "weight" ? weightOut(v, unit) : lengthOut(v, unit);
}

export function BodyLog({ tapes, unit, onAdd, onRemove }: Props) {
    const ordered = [...tapes].sort((a, b) => b.date.localeCompare(a.date));
    const last = ordered[0];
    const [date, setDate] = useState(today());
    const [values, setValues] = useState<Partial<Record<Field, string>>>({});

    const save = () => {
        const row: TapeRow = {
            date,
            bust: null,
            waist: null,
            hips: null,
            thighs: null,
            shoulders: null,
            arms: null,
            forearms: null,
            calves: null,
            neck: null,
            wrist: null,
            ankle: null,
            weight: null,
        };
        for (const { field } of FIELDS) {
            const raw = values[field];
            const n = raw == null || raw.trim() === "" ? NaN : Number(raw);
            if (!Number.isFinite(n) || n <= 0) continue;
            row[field] = field === "weight" ? weightIn(n, unit) : lengthIn(n, unit);
        }
        onAdd(row);
        setValues({});
    };

    const filled = FIELDS.some(({ field }) => (values[field] ?? "").trim() !== "");
    const replaces = tapes.some((t) => t.date === date);

    return (
        <div className="flex flex-col gap-6">
            <section className="border-heavy">
                <header className="p-3 bg-black text-white flex items-center justify-between gap-2">
                    <h2 className="font-black uppercase tracking-tight">New measurement</h2>
                    <input
                        type="date"
                        aria-label="Measurement date"
                        value={date}
                        max={today()}
                        onChange={(e) => setDate(e.target.value)}
                        className="bg-white text-black font-data text-sm px-2 py-1"
                    />
                </header>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3">
                    {FIELDS.map(({ field, label, hint }) => {
                        const prev = last ? shown(last, field, unit) : null;
                        return (
                            <label key={field} className="flex flex-col gap-1">
                                <span className="text-[11px] font-black uppercase tracking-wider">
                                    {label}{" "}
                                    <span className="font-bold opacity-50 normal-case">
                                        {field === "weight" ? weightLabel(unit) : unit}
                                    </span>
                                </span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.1"
                                    value={values[field] ?? ""}
                                    placeholder={prev != null ? prev.toFixed(1) : ""}
                                    onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                                    className="border-heavy p-2 font-data font-bold"
                                />
                                <span className="text-[10px] opacity-50 leading-tight">{hint}</span>
                            </label>
                        );
                    })}
                </div>
                <div className="p-3 border-t-2 border-black flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold opacity-60">
                        {replaces ? `Replaces the ${formatTapeDate(date)} entry.` : "Same time of day, same tape, each time."}
                    </p>
                    <button
                        type="button"
                        disabled={!filled}
                        onClick={save}
                        className="bg-black text-white px-4 py-2 font-black uppercase tracking-widest text-sm flex items-center gap-1 disabled:opacity-30"
                    >
                        <Plus size={16} /> Save
                    </button>
                </div>
            </section>

            {ordered.length === 0 ? (
                <p className="text-sm font-bold opacity-60">
                    No measurements yet. Take one today and another in 3–6 weeks: each pair brackets a training block the
                    model learns from.
                </p>
            ) : (
                <section className="overflow-x-auto border-heavy">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-black text-white text-[10px] uppercase tracking-wider">
                                <th className="p-2 text-left sticky left-0 bg-black">Date</th>
                                {FIELDS.map(({ field, label }) => (
                                    <th key={field} className="p-2 text-right whitespace-nowrap">
                                        {label}
                                    </th>
                                ))}
                                <th className="p-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {ordered.map((row, i) => {
                                const prev = ordered[i + 1];
                                return (
                                    <tr key={row.date} className="border-t-2 border-black">
                                        <td className="p-2 font-data font-bold whitespace-nowrap sticky left-0 bg-white">
                                            {formatTapeDate(row.date)}
                                        </td>
                                        {FIELDS.map(({ field }) => {
                                            const v = shown(row, field, unit);
                                            const p = prev ? shown(prev, field, unit) : null;
                                            const d = v != null && p != null ? v - p : null;
                                            return (
                                                <td key={field} className="p-2 text-right font-data whitespace-nowrap">
                                                    {v == null ? "—" : v.toFixed(1)}
                                                    {d != null && Math.abs(d) >= 0.05 && (
                                                        <span className={`block text-[10px] ${d > 0 ? "text-action" : "text-accent"}`}>
                                                            {d > 0 ? "+" : ""}
                                                            {d.toFixed(1)}
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        <td className="p-2">
                                            <button
                                                type="button"
                                                aria-label={`Delete ${row.date}`}
                                                onClick={() => {
                                                    if (window.confirm(`Delete the ${formatTapeDate(row.date)} measurement?`)) onRemove(row.date);
                                                }}
                                                className="hover:text-alert"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
}
