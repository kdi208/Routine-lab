// The model works in inches and pounds. The page can show centimetres and kilograms.

export type Unit = "in" | "cm";

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

export function lengthOut(inches: number, unit: Unit): number {
    return unit === "cm" ? inches * CM_PER_IN : inches;
}

export function lengthIn(value: number, unit: Unit): number {
    return unit === "cm" ? value / CM_PER_IN : value;
}

export function weightOut(lb: number, unit: Unit): number {
    return unit === "cm" ? lb * KG_PER_LB : lb;
}

export function weightIn(value: number, unit: Unit): number {
    return unit === "cm" ? value / KG_PER_LB : value;
}

export function weightLabel(unit: Unit): string {
    return unit === "cm" ? "kg" : "lb";
}

export function signedLength(inches: number, unit: Unit, digits = 2): string {
    const v = lengthOut(inches, unit);
    const text = Math.abs(v) < 0.5 * 10 ** -digits ? (0).toFixed(digits) : v.toFixed(digits);
    return `${v > 0 && Number(text) !== 0 ? "+" : ""}${text} ${unit}`;
}
