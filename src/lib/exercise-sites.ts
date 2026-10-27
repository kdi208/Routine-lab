// Maps a logged exercise id onto the tape it can move.
// Primary credit is 1 direct set. Secondary credit is 0.5 indirect sets.
// The breast tape is one loop around the upper torso, so pec work and
// lat / mid-back work are both direct sets on that tape. A row still
// lends indirect credit to the arms and shoulders it also loads.
// The fit cannot tell a pec change from a lat change.

import type { SiteId } from "./sites";

export type Attribution = {
    kind: "mapped" | "untaped" | "unknown";
    primary: Partial<Record<SiteId, number>>;
    secondary: Partial<Record<SiteId, number>>;
};

function attr(primary: SiteId | null, secondary: SiteId[] = []): Attribution {
    const extra = [...new Set(secondary.filter((s) => s !== primary))];
    if (!primary && extra.length === 0) {
        return { kind: "untaped", primary: {}, secondary: {} };
    }
    return {
        kind: "mapped",
        primary: primary ? { [primary]: 1 } : {},
        secondary: Object.fromEntries(extra.map((s) => [s, 0.5])),
    };
}

const untaped = (): Attribution => attr(null);

function includes(id: string, ...parts: string[]): boolean {
    return parts.some((p) => id.includes(p));
}

function isCore(id: string): boolean {
    return includes(
        id,
        "mobility",
        "vacuum",
        "woodchop",
        "crunch",
        "situp",
        "sit_up",
        "leg_raise",
        "dead_bug",
        "deadbug",
        "plank",
        "ab_wheel",
        "rollout",
        "hollow",
        "russian_twist",
        "pallof",
        "toes_to_bar",
        "knee_raise"
    );
}

function isThigh(id: string): boolean {
    return includes(
        id,
        "leg_curl",
        "leg_ext",
        "squat",
        "lunge",
        "bss",
        "hack",
        "rdl",
        "stiff_leg",
        "hamstring",
        "leg_press",
        "deadlift",
        "step_up",
        "good_morning",
        "nordic",
        "glute_ham",
        "ghr",
        "sissy",
        "pistol",
        "wall_sit"
    );
}

function isHip(id: string): boolean {
    // A triceps kickback is an arm exercise despite the shared word.
    if (id.includes("kickback") && id.includes("tricep")) return false;
    return includes(id, "hip_thrust", "abduct", "kickback", "pull_through", "clamshell", "glute", "bridge", "frog_pump");
}

function isCurl(id: string): boolean {
    return includes(id, "curl", "preacher");
}

function isTriceps(id: string): boolean {
    if (
        includes(
            id,
            "tricep",
            "pressdown",
            "pushdown",
            "cable_ext",
            "overhead_ext",
            "lying_ext",
            "one_arm_ext",
            "skull",
            "crusher",
            "jm_press"
        )
    ) {
        return true;
    }
    return id.includes("extension") && !includes(id, "leg_", "hyper", "neck", "back_ext", "hip_ext");
}

function isShoulder(id: string): boolean {
    if (id.includes("reverse") && (id.includes("fly") || id.includes("pec"))) return true;
    return includes(
        id,
        "shrug",
        "front_raise",
        "lateral",
        "rear_delt",
        "y_raise",
        "face_pull",
        "facepull",
        "ohp",
        "overhead_press",
        "arnold",
        "seated_db_press",
        "shoulder_press",
        "military",
        "push_press",
        "landmine_press",
        "z_press",
        "lat_raise",
        "upright_row",
        "delt"
    );
}

function shoulderAlsoArms(id: string): boolean {
    return includes(
        id,
        "ohp",
        "overhead_press",
        "arnold",
        "seated_db_press",
        "shoulder_press",
        "military",
        "push_press",
        "landmine_press",
        "z_press"
    );
}

function isChest(id: string): boolean {
    if (id.includes("fly") || id.includes("pec") || id.includes("crossover")) return true;
    return includes(
        id,
        "bench",
        "machine_press",
        "incline",
        "decline",
        "dip",
        "push_up",
        "pushup",
        "press_up",
        "chest_press",
        "floor_press",
        "squeeze_press"
    );
}

function chestSecondary(id: string): SiteId[] {
    if (id.includes("fly") || id.includes("pec") || id.includes("crossover")) return [];
    if (id.includes("incline")) return ["shoulders", "arms"];
    return ["arms"];
}

function isStraightArm(id: string): boolean {
    return id.includes("straight_arm") || id.includes("straigh_arm");
}

function isVerticalPull(id: string): boolean {
    return includes(id, "chin", "pull_up", "pullup", "muscle_up");
}

function isBack(id: string): boolean {
    return includes(id, "row", "pulldown", "pull_down", "pullover", "rack_pull") || isVerticalPull(id) || isStraightArm(id);
}

function backCredit(id: string): Attribution {
    if (isStraightArm(id) || id.includes("pullover")) return attr("chest");
    if (id.includes("rack_pull")) return attr(null, ["chest", "shoulders", "forearms"]);
    if (isVerticalPull(id)) return attr("chest", ["arms"]);
    if (id.includes("row")) return attr("chest", ["arms", "shoulders"]);
    if (id.includes("pulldown") || id.includes("pull_down")) return attr("chest", ["arms"]);
    return untaped();
}

/** Classify one exercise id. Matching is on the id text, so retired and current ids share rules. */
export function classifyExercise(rawId: string): Attribution {
    const id = rawId.toLowerCase();

    if (isCore(id)) return untaped();
    if (id.includes("neck")) return attr("neck");
    if (id.includes("wrist") || id.includes("farmer")) return attr("forearms");
    if (id.includes("calf") || id.includes("calves")) return attr("calves");
    if (id.includes("leg_press") && id.includes("glute")) return attr("hips", ["thighs"]);
    if (isThigh(id)) return attr("thighs", ["hips"]);
    if (isHip(id)) {
        const alsoThigh = includes(id, "hip_thrust", "bridge", "kickback");
        return attr("hips", alsoThigh ? ["thighs"] : []);
    }
    if (id.includes("adduct")) return attr("thighs");
    if (isCurl(id)) {
        const alsoForearm = includes(id, "hammer", "reverse_curl", "reverse_cable_curl");
        return attr("arms", alsoForearm ? ["forearms"] : []);
    }
    if (isTriceps(id)) return attr("arms");
    if (isShoulder(id)) return attr("shoulders", shoulderAlsoArms(id) ? ["arms"] : []);
    if (isChest(id)) return attr("chest", chestSecondary(id));
    if (isBack(id)) return backCredit(id);
    if (id.includes("swing")) return attr("thighs", ["hips"]);
    if (includes(id, "hyperextension", "back_ext", "hip_ext", "reverse_hyper")) return attr(null, ["hips", "thighs"]);
    return { kind: "unknown", primary: {}, secondary: {} };
}
