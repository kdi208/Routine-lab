"use client";

import type { SiteGoal, SiteId } from "@/lib/sites";

// Front view, 120 × 260. Each shape is one tape site. Paired limbs share a site.
const SHAPES: { site: SiteId; d: string }[] = [
    { site: "neck", d: "M52 34 h16 v12 h-16 z" },
    { site: "shoulders", d: "M28 48 q8 -6 20 -4 v14 h-24 q-2 -6 4 -10 z M92 48 q-8 -6 -20 -4 v14 h24 q2 -6 -4 -10 z" },
    { site: "chest", d: "M48 44 h24 v32 h-24 z M30 58 h18 v18 h-14 z M90 58 h-18 v18 h14 z" },
    { site: "arms", d: "M22 60 l10 0 l-2 36 l-10 0 z M98 60 l-10 0 l2 36 l10 0 z" },
    { site: "forearms", d: "M20 98 l10 0 l-2 34 l-9 0 z M100 98 l-10 0 l2 34 l9 0 z" },
    { site: "waist", d: "M36 78 h48 l-2 22 h-44 z" },
    { site: "hips", d: "M38 102 h44 l4 22 h-52 z" },
    { site: "thighs", d: "M34 126 h24 l-2 54 h-18 z M86 126 h-24 l2 54 h18 z" },
    { site: "calves", d: "M38 186 h16 l-2 52 h-12 z M82 186 h-16 l2 52 h12 z" },
];

export type FigureValue = Partial<Record<SiteId, number>>;

function fill(value: number | undefined, goal: SiteGoal, scale: number): string {
    if (goal.mode === "ignore") return "#e5e5e5";
    if (value == null || Math.abs(value) < 1e-4 || scale <= 0) return "#ffffff";
    const strength = Math.min(1, Math.abs(value) / scale);
    let good: boolean;
    if (goal.mode === "grow") good = value > 0;
    else if (goal.mode === "shrink") good = value < 0;
    else good = false;
    // Light to full colour. Green moves toward the goal, orange moves away.
    const [r, g, b] = good ? [0, 168, 0] : [255, 79, 0];
    const t = 0.18 + 0.82 * strength;
    const mix = (c: number) => Math.round(255 + (c - 255) * t);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function BodyFigure({
    values,
    goals,
    selected,
    onSelect,
}: {
    values: FigureValue;
    goals: Record<SiteId, SiteGoal>;
    selected?: SiteId | null;
    onSelect?: (site: SiteId) => void;
}) {
    const scale = Math.max(0, ...Object.values(values).map((v) => Math.abs(v ?? 0)));
    return (
        <svg viewBox="0 0 120 262" className="w-full h-full" role="img" aria-label="Predicted change by body part">
            <circle cx="60" cy="18" r="14" fill="#ffffff" stroke="black" strokeWidth="2" />
            {SHAPES.map(({ site, d }) => (
                <path
                    key={site}
                    d={d}
                    fill={fill(values[site], goals[site], scale)}
                    stroke="black"
                    strokeWidth={selected === site ? 3 : 1.5}
                    strokeLinejoin="round"
                    onClick={onSelect ? () => onSelect(site) : undefined}
                    className={onSelect ? "cursor-pointer" : undefined}
                >
                    <title>{site}</title>
                </path>
            ))}
        </svg>
    );
}
