import languageData from "./language_data.json";
import commanderMasteryDataJson from "./commander_mastery.json";
import unitCompositionData from "./unit_composition.json";
import unitTranslationData from "./unit_translation_data.json";

export type AppLanguage = "en" | "ko" | "zh-CN";
type LocalizableValue = string | number | boolean | null | undefined;
export type LanguageValue = {
    en?: string | null;
    ko?: string | null;
    "zh-CN"?: string | null;
};

type LanguageEntry = {
    en: string;
    ko: string;
    "zh-CN"?: string;
    aliases?: string[];
    asset_en?: string;
};

type LanguageData = Record<string, LanguageEntry>;
type UnitCompositionData = Record<string, LanguageEntry>;
type UnitTranslationEntry = {
    en: string;
    ko: string;
    "zh-CN"?: string;
};
type UnitTranslationData = Record<string, UnitTranslationEntry>;
export type LocalizedCommanderMasteryLabels = {
    en: string[];
    ko: string[];
    "zh-CN"?: string[];
};
export type CommanderMasteryData = Record<
    string,
    LocalizedCommanderMasteryLabels
>;

const DEFAULT_LANGUAGE: AppLanguage = "en";
const DIFFICULTY_ID_PREFIX = "difficulty_";
const entries: LanguageData = languageData as LanguageData;
const commanderMasteryEntries: CommanderMasteryData =
    commanderMasteryDataJson as CommanderMasteryData;
const unitCompositionEntries: UnitCompositionData =
    unitCompositionData as UnitCompositionData;
const unitEntries: UnitTranslationData =
    unitTranslationData as UnitTranslationData;

function normalizeAliasKey(value: string): string {
    return value
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[’`]/g, "'")
        .toLocaleLowerCase("en-US");
}

function isAppLanguage(value: string): value is AppLanguage {
    return value === "en" || value === "ko" || value === "zh-CN";
}

// Display labels are aliases only when they identify exactly one entity.
// Repeated UI phrases and translated names must never pick an arbitrary ID.
function createAliasIndex(
    data: Record<string, LanguageEntry | UnitTranslationEntry>,
): Map<string, string> {
    const index = new Map<string, string>();
    const candidates = new Map<string, Set<string>>();
    for (const [id, entry] of Object.entries(data)) {
        const aliases = "aliases" in entry ? entry.aliases || [] : [];
        for (const label of [entry.en, entry.ko, entry["zh-CN"], ...aliases]) {
            if (!label?.trim()) continue;
            const key = normalizeAliasKey(label);
            const ids = candidates.get(key) || new Set<string>();
            ids.add(id);
            candidates.set(key, ids);
        }
    }
    for (const [alias, ids] of candidates) {
        if (ids.size === 1) index.set(alias, [...ids][0]);
    }
    // Canonical keys are authoritative even when another label resembles one.
    for (const id of Object.keys(data)) index.set(normalizeAliasKey(id), id);
    return index;
}

export class LanguageManager {
    private language: AppLanguage;
    private readonly aliasToId: Map<string, string>;
    private readonly unitCompositionAliasToId: Map<string, string>;
    private readonly unitAliasToKey: Map<string, string>;

    constructor(language: string) {
        this.language = isAppLanguage(language) ? language : DEFAULT_LANGUAGE;
        this.aliasToId = createAliasIndex(entries);
        this.unitCompositionAliasToId = createAliasIndex(
            unitCompositionEntries,
        );
        this.unitAliasToKey = createAliasIndex(unitEntries);
    }

    currentLanguage(): AppLanguage {
        return this.language;
    }

    localizedValue(
        value: LanguageValue | null | undefined,
        language: AppLanguage = this.language,
    ): string {
        if (value === null || value === undefined) {
            return "";
        }

        for (const candidate of [language, "en", "ko"] as const) {
            const label = value[candidate];
            if (typeof label === "string" && label.trim() !== "") return label;
        }

        return "";
    }

    setLanguage(language: string): void {
        if (isAppLanguage(language)) {
            this.language = language;
        }
    }

    translate(id: string): string {
        const entry = entries[id];
        if (!entry) {
            return id;
        }
        return this.localizedValue(entry) || id;
    }

    idFromValue(value: LocalizableValue): string | null {
        if (typeof value !== "string") {
            return null;
        }

        const trimmed = value.trim();
        if (trimmed === "") {
            return null;
        }

        return this.aliasToId.get(normalizeAliasKey(trimmed)) || null;
    }

    private unitCompositionIdFromValue(value: LocalizableValue): string | null {
        if (typeof value !== "string") {
            return null;
        }

        const trimmed = value.trim();
        if (trimmed === "") {
            return null;
        }

        return (
            this.unitCompositionAliasToId.get(normalizeAliasKey(trimmed)) ||
            null
        );
    }

    private difficultyIdFromValue(value: string): string | null {
        const id = this.idFromValue(value);
        if (id === null || !id.startsWith(DIFFICULTY_ID_PREFIX)) {
            return null;
        }
        return id;
    }

    private difficultyPartsFromValue(value: string): string[] {
        const trimmed = value.trim();
        if (!trimmed.includes("/")) {
            return [trimmed];
        }

        const parts = trimmed
            .split("/")
            .map((part) => part.trim())
            .filter((part) => part !== "");
        if (
            parts.length < 2 ||
            !parts.every((part) => this.difficultyIdFromValue(part) !== null)
        ) {
            return [trimmed];
        }

        return parts;
    }

    localize(value: LocalizableValue): string {
        if (value === null || value === undefined) {
            return "";
        }

        if (typeof value !== "string") {
            return String(value);
        }

        const trimmed = value.trim();
        if (trimmed === "") {
            return "";
        }

        const id = this.idFromValue(trimmed);
        if (id) {
            return this.translate(id);
        }

        const unitCompositionId = this.unitCompositionIdFromValue(trimmed);
        if (!unitCompositionId) {
            return trimmed;
        }

        const entry = unitCompositionEntries[unitCompositionId];
        return this.localizedValue(entry) || trimmed;
    }

    localizeDifficulty(value: LocalizableValue): string {
        if (value === null || value === undefined) {
            return "";
        }

        if (typeof value !== "string") {
            return String(value);
        }

        const trimmed = value.trim();
        if (trimmed === "") {
            return "";
        }

        const parts = this.difficultyPartsFromValue(trimmed);
        if (parts.length === 1) {
            return this.localize(parts[0]);
        }

        const localizedParts: string[] = [];
        const seenIds = new Set<string>();
        for (const part of parts) {
            const id = this.difficultyIdFromValue(part);
            if (id === null || seenIds.has(id)) {
                continue;
            }
            seenIds.add(id);
            localizedParts.push(this.translate(id));
        }

        return localizedParts.length > 0 ? localizedParts.join("/") : trimmed;
    }

    canonicalUnitKey(value: string): string {
        const trimmed = value.trim();
        return this.unitAliasToKey.get(normalizeAliasKey(trimmed)) || trimmed;
    }

    localizeUnitName(value: LocalizableValue): string {
        if (value === null || value === undefined) {
            return "";
        }

        if (typeof value !== "string") {
            return String(value);
        }

        const trimmed = value.trim();
        if (trimmed === "") {
            return "";
        }

        const key = this.unitAliasToKey.get(normalizeAliasKey(trimmed));
        if (!key) {
            return trimmed;
        }

        const entry = unitEntries[key];
        if (!entry) {
            return trimmed;
        }

        return this.localizedValue(entry) || trimmed;
    }

    englishLabel(value: LocalizableValue): string {
        if (value === null || value === undefined) {
            return "";
        }

        if (typeof value !== "string") {
            return String(value);
        }

        const trimmed = value.trim();
        if (trimmed === "") {
            return "";
        }

        const id = this.idFromValue(trimmed);
        if (id) {
            const entry = entries[id];
            return entry.asset_en || entry.en;
        }

        const unitCompositionId = this.unitCompositionIdFromValue(trimmed);
        if (!unitCompositionId) {
            return trimmed;
        }

        const entry = unitCompositionEntries[unitCompositionId];
        return entry?.asset_en || entry?.en || trimmed;
    }

    localizeMapRacePair(value: LocalizableValue): string {
        if (typeof value !== "string") {
            return this.localize(value);
        }

        const parts = value
            .split("|")
            .map((part) => this.localize(part))
            .filter((part) => part !== "");
        if (parts.length === 0) {
            return "";
        }
        return parts.join(" | ");
    }

    commanderMasteryLabels(commander: string): string[] {
        const labels = commanderMasteryEntries[commander];
        if (labels !== undefined) {
            return this.localizedCommanderMasteryLabels(labels);
        }

        const commanderKey = this.englishLabel(commander);
        const canonicalLabels = commanderMasteryEntries[commanderKey];
        if (canonicalLabels !== undefined) {
            return this.localizedCommanderMasteryLabels(canonicalLabels);
        }

        return [];
    }

    commanderMasteryData(): CommanderMasteryData {
        return commanderMasteryEntries;
    }

    private localizedCommanderMasteryLabels(
        labels: LocalizedCommanderMasteryLabels,
    ): string[] {
        const preferred = labels[this.language];
        const count = Math.max(
            preferred?.length || 0,
            labels.en.length,
            labels.ko.length,
        );
        return Array.from(
            { length: count },
            (_, index) =>
                [preferred?.[index], labels.en[index], labels.ko[index]].find(
                    (label) => typeof label === "string" && label.trim() !== "",
                ) || "",
        );
    }
}

export function createLanguageManager(
    language: string = DEFAULT_LANGUAGE,
): LanguageManager {
    return new LanguageManager(language);
}
