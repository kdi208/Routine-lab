import { classifyExercise } from "../src/lib/exercise-sites";
import { buildIntervals, observationsFrom, predictDelta, type Fit, type SiteDose, type TapeRow } from "../src/lib/response-model";
import { PRIORS, SET_PEAK, SITES, type SiteId } from "../src/lib/sites";

function dose(overrides: Partial<SiteDose> = {}): SiteDose {
    return {
        directSetsPerWeek: 10,
        indirectSetsPerWeek: 4,
        frequencyPerWeek: 2,
        freshness: 0.5,
        zoneShare: 0.5,
        e1rmSlopePctPerWeek: 0,
        sessionSets: 15,
        ...overrides,
    };
}

function perSite(value: number): Record<SiteId, number> {
    return Object.fromEntries(SITES.map((s) => [s, value])) as Record<SiteId, number>;
}

function priorFit(): Fit {
    return {
        a: perSite(0),
        bSets: perSite(PRIORS.setsMean),
        bInd: perSite(PRIORS.indMean),
        bFreq: perSite(PRIORS.freq),
        bFresh: perSite(PRIORS.fresh),
        bZone: perSite(PRIORS.zone),
        bProg: perSite(PRIORS.prog),
        bBw: { waist: PRIORS.bwWaist, torso: PRIORS.bwTorso, limb: PRIORS.bwLimb },
    };
}

describe("free-typed exercise names", () => {
    it.each([
        ["pull_ups", "chest"],
        ["push_ups", "chest"],
        ["shoulder_press", "shoulders"],
        ["military_press", "shoulders"],
        ["upright_row", "shoulders"],
        ["chest_press", "chest"],
        ["step_ups", "thighs"],
        ["good_morning", "thighs"],
        ["nordic_curl", "thighs"],
        ["skull_crushers", "arms"],
        ["tricep_kickback", "arms"],
    ])("%s trains %s", (id, site) => {
        expect(classifyExercise(id).primary).toEqual({ [site]: 1 });
    });

    it("credits a back extension to hips and thighs, not triceps", () => {
        const back = classifyExercise("back_extension");
        expect(back.primary).toEqual({});
        expect(back.secondary).toEqual({ hips: 0.5, thighs: 0.5 });
    });
});

describe("volume ceiling", () => {
    const fit = priorFit();
    const arms = (directSetsPerWeek: number, sessionSets = 15) =>
        predictDelta(fit, "arms", dose({ directSetsPerWeek, sessionSets }), 0);

    it("stops paying for sets past the peak", () => {
        expect(arms(SET_PEAK)).toBeGreaterThan(arms(10));
        expect(arms(30)).toBeLessThan(arms(SET_PEAK));
        expect(arms(60)).toBeLessThan(arms(10));
    });

    it("charges every tape trained in an overlong session", () => {
        expect(arms(12, 40)).toBeLessThan(arms(12, 20));
        expect(arms(12, 25)).toBeCloseTo(arms(12, 20), 9);
    });
});

describe("block length", () => {
    const row = (date: string, arms: number): TapeRow => ({
        date, bust: 42, waist: 32, hips: 40, thighs: 25, shoulders: 46,
        arms, forearms: 13, calves: 16, neck: 15, wrist: null, ankle: null, weight: 200,
    });

    it("reads the same rate from a 2-week and an 8-week block", () => {
        const short = observationsFrom(buildIntervals([row("2026-01-01", 15), row("2026-01-15", 15.25)], []).intervals);
        const long = observationsFrom(buildIntervals([row("2026-01-01", 15), row("2026-02-26", 16)], []).intervals);
        const armsShort = short.find((o) => o.site === "arms")!;
        const armsLong = long.find((o) => o.site === "arms")!;
        expect(armsShort.deltaTape).toBeCloseTo(0.5, 9);
        expect(armsLong.deltaTape).toBeCloseTo(0.5, 9);
        // The short block's rate is less certain, so it counts for less.
        expect(armsShort.sigma).toBeGreaterThan(armsLong.sigma);
    });
});
