import type {
    AppSettings,
    LocalizedText,
    OverlayRandomizerCatalog,
    RandomizerResult,
} from "../../../bindings/overlay";
import type { AppLanguage, LanguageManager } from "../../i18n/languageManager";
import type { PrestigeNameMap } from "../types";

export type RandomizerChoices = AppSettings["rng_choices"];
export type RandomizerDraft = {
    rng_choices?: RandomizerChoices | null;
};

export type MutatorCatalogEntry =
    NonNullable<OverlayRandomizerCatalog>["mutators"][number];
export type BrutalPlusCatalogEntry =
    NonNullable<OverlayRandomizerCatalog>["brutal_plus"][number];
export type CommanderRandomizerResult = Extract<
    RandomizerResult,
    { kind: "commander" }
>;
export type MutatorRandomizerResult = Extract<
    RandomizerResult,
    { kind: "mutator" }
>;

export type CommanderGeneratePayload = {
    mode: "commander";
    rng_choices: RandomizerChoices;
    mastery_mode: "all_in" | "random" | "none";
    include_map: boolean;
    include_race: boolean;
};

export type MutatorGeneratePayload = {
    mode: "mutator";
    mutator_mode: "all_random" | "brutal_plus";
    mutator_min: number;
    mutator_max: number;
    brutal_plus: number;
};

export type RandomizerGeneratePayload =
    | CommanderGeneratePayload
    | MutatorGeneratePayload;

export const MASTERY_MODES: Array<{
    labelId: string;
    value: CommanderGeneratePayload["mastery_mode"];
}> = [
    { labelId: "ui_randomizer_mastery_all_in", value: "all_in" },
    { labelId: "ui_randomizer_mastery_random", value: "random" },
    { labelId: "ui_randomizer_mastery_none", value: "none" },
];

export const MUTATOR_MODES: Array<{
    labelId: string;
    value: MutatorGeneratePayload["mutator_mode"];
}> = [
    {
        labelId: "ui_randomizer_mutator_mode_all_random",
        value: "all_random",
    },
    {
        labelId: "ui_randomizer_mutator_mode_brutal_plus",
        value: "brutal_plus",
    },
];

export function buildEffectiveChoices(
    savedChoices: RandomizerChoices | null | undefined,
    commanderNames: string[],
): RandomizerChoices {
    const hasSavedChoices =
        savedChoices !== null &&
        savedChoices !== undefined &&
        Object.keys(savedChoices).length > 0;
    const nextChoices: RandomizerChoices = {};

    for (const commander of commanderNames) {
        for (let prestige = 0; prestige <= 3; prestige += 1) {
            const key = `${commander}_${prestige}`;
            nextChoices[key] = hasSavedChoices
                ? Boolean(savedChoices[key])
                : prestige === 0;
        }
    }

    return nextChoices;
}

export function areAllCommanderPrestigesSelected(
    choices: RandomizerChoices,
    commander: string,
): boolean {
    for (let prestige = 0; prestige <= 3; prestige += 1) {
        if (!choices[`${commander}_${prestige}`]) {
            return false;
        }
    }
    return true;
}

export function areAllPrestigeColumnSelected(
    choices: RandomizerChoices,
    commanderNames: string[],
    prestige: number,
): boolean {
    return commanderNames.every(
        (commander) => choices[`${commander}_${prestige}`] === true,
    );
}

export function prestigeLabelForLanguage(
    prestigeNames: PrestigeNameMap,
    commander: string,
    prestige: number,
    language: AppLanguage,
): string {
    const localized = prestigeNames[commander];
    if (!localized) {
        return `P${prestige}`;
    }

    return (
        localized[language]?.[prestige] ||
        localized.en?.[prestige] ||
        localized.ko?.[prestige] ||
        `P${prestige}`
    );
}

export function masteryRowsFromIndices(
    commander: string,
    masteryIndices: Array<number | null>,
    languageManager: LanguageManager,
): Array<{ points: number; label: string }> {
    const labels = languageManager.commanderMasteryLabels(commander);
    const rows: Array<{ points: number; label: string }> = [];

    for (let pairIndex = 0; pairIndex < 3; pairIndex += 1) {
        const selected = masteryIndices[pairIndex];
        const leftIndex = pairIndex * 2;
        const rightIndex = leftIndex + 1;
        const leftPoints =
            selected === null || selected === undefined ? 0 : selected;
        const rightPoints =
            selected === null || selected === undefined ? 0 : 30 - selected;

        rows.push({
            points: leftPoints,
            label:
                labels[leftIndex] ||
                languageManager
                    .translate("ui_stats_mastery_fallback")
                    .replace("{{index}}", String(leftIndex + 1)),
        });
        rows.push({
            points: rightPoints,
            label:
                labels[rightIndex] ||
                languageManager
                    .translate("ui_stats_mastery_fallback")
                    .replace("{{index}}", String(rightIndex + 1)),
        });
    }

    return rows;
}

export function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(max, Math.max(min, value));
}

export function mutatorIconPath(iconName: string): string {
    return `/overlay/Mutator Icons/${encodeURIComponent(iconName)}.png`;
}

export function localizedMutatorText(
    value: LocalizedText,
    languageManager: LanguageManager,
): string {
    return languageManager.localizedValue(value);
}

export function brutalPlusLabel(brutalPlusText: string, level: number): string {
    return `${brutalPlusText}${level}`;
}
