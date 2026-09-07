import type * as React from "react";
import type {
    LocalizedLabels,
    StatsAnalysisPayload,
    StatsStatePayload,
} from "../../bindings/overlay";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonObject = {
    [key: string]: JsonValue;
};
export type JsonArray = readonly JsonValue[];
export type DisplayValue = JsonValue | undefined;

export type DifficultyFilterKey =
    | "Casual"
    | "Normal"
    | "Hard"
    | "Brutal"
    | "BrutalPlus1"
    | "BrutalPlus2"
    | "BrutalPlus3"
    | "BrutalPlus4"
    | "BrutalPlus5"
    | "BrutalPlus6";

export type DifficultyFilters = Record<DifficultyFilterKey, boolean>;

export type StatisticsDifficultyKey = DifficultyFilterKey;
export type StatisticsRegionKey = "NA" | "EU" | "KR" | "CN";

export type StatisticsSubtab =
    | "maps"
    | "ally"
    | "my"
    | "diffregion"
    | "units"
    | "amon";

export type StatisticsBoolFilterKey =
    | "includeNormalGames"
    | "includeMutations"
    | "overrideFolderSelection"
    | "includeMultiBox"
    | "includeWins"
    | "includeLosses"
    | "includeMainSub15"
    | "includeMainOver15"
    | "includeAllySub15"
    | "includeAllyOver15"
    | "includeMainNormalMastery"
    | "includeMainAbnormalMastery"
    | "includeAllyNormalMastery"
    | "includeAllyAbnormalMastery";

export type StatisticsTextFilterKey = "fromDate" | "toDate" | "player";
export type StatisticsNumberFilterKey = "minLength" | "maxLength";

export type StatisticsFilters = {
    difficulties: DifficultyFilters;
    regions: Record<StatisticsRegionKey, boolean>;
    includeNormalGames: boolean;
    includeMutations: boolean;
    overrideFolderSelection: boolean;
    includeMultiBox: boolean;
    includeWins: boolean;
    includeLosses: boolean;
    includeMainSub15: boolean;
    includeMainOver15: boolean;
    includeAllySub15: boolean;
    includeAllyOver15: boolean;
    includeMainNormalMastery: boolean;
    includeMainAbnormalMastery: boolean;
    includeAllyNormalMastery: boolean;
    includeAllyAbnormalMastery: boolean;
    minLength: number;
    maxLength: number;
    fromDate: string;
    toDate: string;
    player: string;
};

export type StatisticsState = {
    filters: StatisticsFilters;
    activeSubtab: StatisticsSubtab;
    selectedMap: string;
    selectedMyCommander: string;
    selectedAllyCommander: string;
    selectedUnitMainCommander: string;
    selectedUnitAllyCommander: string;
    selectedUnitSide: "main" | "ally";
    selectedUnitSortBy: string;
    selectedUnitSortReverse: boolean;
    amonSearch: string;
};

export type StatisticsAnalysis = StatsAnalysisPayload;

export type StatisticsPayload = Omit<
    StatsStatePayload,
    "analysis" | "main_handles" | "prestige_names"
> & {
    analysis?: StatisticsAnalysis | null;
    prestige_names: PrestigeNameMap;
    main_handles: string[];
    query?: string;
};

export type LocalizedMasteryNames = {
    en: string[];
    ko: string[];
    "zh-CN"?: string[];
};

export type CommanderMasteryEntry = string[] | LocalizedMasteryNames;
export type CommanderMasteryMap = Record<string, CommanderMasteryEntry>;

export type PrestigeNameMap = Record<string, LocalizedLabels>;
export type LocalizedText = {
    en?: string | null;
    ko?: string | null;
    "zh-CN"?: string | null;
};

export type MutatorData = {
    id?: string | null;
    name?: LocalizedText | null;
    description?: LocalizedText | null;
    iconName?: string | null;
};

export type StatsHelpers = {
    isBusy: boolean;
    setStatsState: React.Dispatch<React.SetStateAction<StatisticsState>>;
    refreshStats: () => void;
    startSimpleAnalysis: () => void;
    dumpData: () => void;
    deleteParsedData: () => void;
    showReplay: (file: string) => void;
    revealReplay: (file: string) => void;
    setStatsBool: (key: StatisticsBoolFilterKey) => void;
    setStatsText: (key: StatisticsTextFilterKey, value: string) => void;
    setStatsNumber: (
        key: StatisticsNumberFilterKey,
        value: number | string,
    ) => void;
    toggleDifficulty: (key: StatisticsDifficultyKey) => void;
    toggleRegion: (key: StatisticsRegionKey) => void;
};
