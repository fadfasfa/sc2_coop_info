use chrono::NaiveDate;
use indexmap::IndexMap;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::ops::Deref;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Clone, Debug, Error)]
pub enum DictionaryDataError {
    #[error("SC2 dictionary data directory was not found from '{0}'")]
    DictionaryDirNotFound(PathBuf),
    #[error("failed to read '{path}': {message}")]
    IoRead { path: PathBuf, message: String },
    #[error("failed to parse JSON '{path}': {message}")]
    JsonParse { path: PathBuf, message: String },
    #[error("invalid dictionary file '{file}': {message}")]
    InvalidDictionaryData { file: &'static str, message: String },
}

macro_rules! transparent_json_wrapper {
    ($name:ident, $inner:ty) => {
        #[derive(Clone, Debug, Default, Deserialize, Serialize)]
        #[serde(transparent)]
        pub struct $name(pub $inner);

        impl Deref for $name {
            type Target = $inner;

            fn deref(&self) -> &Self::Target {
                &self.0
            }
        }
    };
}

transparent_json_wrapper!(AmonPlayerIdsJson, IndexMap<String, Vec<i64>>);
transparent_json_wrapper!(BonusObjectivesJson, IndexMap<String, u64>);
transparent_json_wrapper!(CachedMutatorsJson, IndexMap<String, String>);
transparent_json_wrapper!(CoMasteryUpgradesJson, IndexMap<String, Vec<String>>);
transparent_json_wrapper!(HftsUnitsJson, Vec<String>);
transparent_json_wrapper!(HornersUnitsJson, Vec<String>);
transparent_json_wrapper!(MapNamesJson, IndexMap<String, IndexMap<String, String>>);
transparent_json_wrapper!(McUnitsJson, IndexMap<String, String>);
transparent_json_wrapper!(MutatorIdsJson, IndexMap<String, String>);
transparent_json_wrapper!(MutatorPointsJson, Vec<MutatorPointEntryJson>);
transparent_json_wrapper!(MutatorsExcludeIdsJson, Vec<String>);
transparent_json_wrapper!(OutlawsJson, Vec<String>);
transparent_json_wrapper!(PrestigeUpgradesJson, IndexMap<String, IndexMap<String, String>>);
transparent_json_wrapper!(RoyalGuardsJson, Vec<String>);
transparent_json_wrapper!(TusUnitsJson, Vec<String>);
transparent_json_wrapper!(TychusBaseUpgradesJson, Vec<String>);
transparent_json_wrapper!(TychusUltimateUpgradesJson, Vec<String>);
transparent_json_wrapper!(UnitAddKillsToJson, IndexMap<String, String>);
transparent_json_wrapper!(UnitBaseCostsJson, IndexMap<String, IndexMap<String, Vec<f64>>>);
transparent_json_wrapper!(UnitCompDictJson, IndexMap<String, Vec<Vec<String>>>);
transparent_json_wrapper!(UnitNamesJson, IndexMap<String, String>);
transparent_json_wrapper!(UnitsInWavesJson, Vec<String>);
transparent_json_wrapper!(UnitsToStatsJson, Vec<String>);

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct MutatorBrutalPlusRangeJson {
    pub min: u32,
    pub max: u32,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct MutatorPointEntryJson {
    pub value: u32,
    pub ids: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct MutatorBrutalPlusEntryJson {
    pub brutal_plus: u8,
    pub mutator_points: MutatorBrutalPlusRangeJson,
    pub mutator_count: MutatorBrutalPlusRangeJson,
}

transparent_json_wrapper!(MutatorBrutalPlusJson, Vec<MutatorBrutalPlusEntryJson>);

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct LocalizedPrestigeNames {
    pub en: Vec<String>,
    pub ko: Vec<String>,
    #[serde(rename = "zh-CN", default)]
    pub zh_cn: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct LocalizedMutatorText {
    #[serde(default)]
    pub en: String,
    #[serde(default)]
    pub ko: String,
    #[serde(rename = "zh-CN", default)]
    pub zh_cn: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct LocalizedMutatorDescription {
    #[serde(default)]
    pub name: LocalizedMutatorText,
    #[serde(default)]
    pub description: LocalizedMutatorText,
}

transparent_json_wrapper!(MutatorsJson, IndexMap<String, LocalizedMutatorDescription>);
transparent_json_wrapper!(PrestigeNamesJson, IndexMap<String, LocalizedPrestigeNames>);

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct WeeklyMutationJson {
    #[serde(default)]
    #[serde(rename = "nameEn")]
    pub name_en: String,
    #[serde(default)]
    #[serde(rename = "nameKo")]
    pub name_ko: String,
    #[serde(rename = "nameZhCn", default)]
    pub name_zh_cn: String,
    pub map: String,
    pub mutators: Vec<String>,
}

transparent_json_wrapper!(WeeklyMutationsJson, IndexMap<String, WeeklyMutationJson>);

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct WeeklyMutationDateJson {
    pub name: String,
    pub date: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct ReplayAnalysisDataJson {
    pub commander_no_units: HashMap<String, Vec<String>>,
    pub commander_upgrades: HashMap<String, String>,
    pub do_not_count_kills: Vec<String>,
    pub dont_count_morphs: Vec<String>,
    pub dont_include_units: Vec<String>,
    pub dont_show_created_lost: Vec<String>,
    pub duplicating_units: Vec<String>,
    pub icon_units: Vec<String>,
    pub primal_combat_predecessors: HashMap<String, String>,
    pub revival_types: HashMap<String, String>,
    pub salvage_units: Vec<String>,
    pub self_killing_units: Vec<String>,
    pub tychus_outlaws: Vec<String>,
    pub units_killed_in_morph: Vec<String>,
    pub aoe_units: Vec<String>,
    pub skip_strings: Vec<String>,
    #[serde(rename = "UnitAddLossesTo")]
    pub unit_add_losses_to: HashMap<String, String>,
}

#[derive(Clone, Debug, Default)]
pub struct WeeklyMutation {
    pub map: String,
    pub mutators: HashSet<String>,
}

#[derive(Clone, Copy, Debug)]
pub struct CacheGenerationData<'a> {
    pub map_names: &'a MapNamesJson,
    pub prestige_names: &'a HashMap<String, HashMap<i64, String>>,
    pub mutators_all: &'a Vec<String>,
    pub mutators_ui: &'a Vec<String>,
    pub mutator_ids: &'a MutatorIdsJson,
    pub cached_mutators: &'a CachedMutatorsJson,
    pub mutator_brutal_plus: &'a MutatorBrutalPlusJson,
    pub amon_player_ids: &'a AmonPlayerIdsJson,
    pub replay_analysis_data: &'a ReplayAnalysisDataJson,
    pub co_mastery_upgrades: &'a CoMasteryUpgradesJson,
    pub prestige_upgrades: &'a PrestigeUpgradesJson,
    pub unit_name_dict: &'a UnitNamesJson,
    pub unit_add_kills_to: &'a UnitAddKillsToJson,
    pub unit_comp_dict: &'a HashMap<String, Vec<HashSet<String>>>,
    pub unit_base_costs: &'a UnitBaseCostsJson,
    pub units_in_waves: &'a HashSet<String>,
    pub hfts_units: &'a HashSet<String>,
    pub tus_units: &'a HashSet<String>,
    pub royal_guards: &'a HashSet<String>,
    pub horners_units: &'a HashSet<String>,
    pub tychus_base_upgrades: &'a HashSet<String>,
    pub tychus_ultimate_upgrades: &'a HashSet<String>,
    pub outlaws: &'a HashSet<String>,
}

#[derive(Clone, Copy, Debug)]
pub struct TauriUiData<'a> {
    pub prestige_names_json: &'a PrestigeNamesJson,
    pub prestige_names: &'a HashMap<String, HashMap<i64, String>>,
    pub prestige_names_with_u64_levels: &'a HashMap<String, HashMap<u64, String>>,
    pub map_names: &'a MapNamesJson,
    pub bonus_objectives: &'a BonusObjectivesJson,
    pub commander_mind_control_units: &'a McUnitsJson,
    pub units_to_stats: &'a HashSet<String>,
    pub amon_player_ids: &'a AmonPlayerIdsJson,
    pub weekly_mutations_json: &'a WeeklyMutationsJson,
    pub weekly_mutations_as_sets: &'a HashMap<String, WeeklyMutation>,
    pub map_key_to_id_lookup: &'a HashMap<String, String>,
    pub map_id_to_english_lookup: &'a HashMap<String, String>,
}

#[derive(Clone, Debug, Default)]
pub struct Sc2DictionaryData {
    pub prestige_names_json: PrestigeNamesJson,
    pub prestige_names: HashMap<String, HashMap<i64, String>>,
    pub prestige_names_with_u64_levels: HashMap<String, HashMap<u64, String>>,
    pub map_names: MapNamesJson,
    pub bonus_objectives: BonusObjectivesJson,
    pub commander_mind_control_units: McUnitsJson,
    pub mutators_json: MutatorsJson,
    pub mutators_exclude_ids_json: MutatorsExcludeIdsJson,
    pub mutators_all: Vec<String>,
    pub mutators_ui: Vec<String>,
    pub units_to_stats_json: UnitsToStatsJson,
    pub units_to_stats: HashSet<String>,
    pub amon_player_ids: AmonPlayerIdsJson,
    pub amon_player_ids_as_sets: HashMap<String, HashSet<String>>,
    pub prestige_upgrades: PrestigeUpgradesJson,
    pub unit_name_dict: UnitNamesJson,
    pub unit_add_kills_to: UnitAddKillsToJson,
    pub unit_comp_dict_json: UnitCompDictJson,
    pub unit_comp_dict: HashMap<String, Vec<HashSet<String>>>,
    pub unit_base_costs: UnitBaseCostsJson,
    pub unit_base_costs_as_tuples: HashMap<String, HashMap<String, Vec<u64>>>,
    pub mutator_ids: MutatorIdsJson,
    pub mutator_name_to_id_lookup: HashMap<String, String>,
    pub mutator_points: MutatorPointsJson,
    pub cached_mutators: CachedMutatorsJson,
    pub mutator_brutal_plus: MutatorBrutalPlusJson,
    pub weekly_mutations_json: WeeklyMutationsJson,
    pub weekly_mutation_date_json: WeeklyMutationDateJson,
    pub weekly_mutations_as_sets: HashMap<String, WeeklyMutation>,
    pub replay_analysis_data: ReplayAnalysisDataJson,
    pub co_mastery_upgrades: CoMasteryUpgradesJson,
    pub units_in_waves_json: UnitsInWavesJson,
    pub units_in_waves: HashSet<String>,
    pub hfts_units_json: HftsUnitsJson,
    pub hfts_units: HashSet<String>,
    pub tus_units_json: TusUnitsJson,
    pub tus_units: HashSet<String>,
    pub royal_guards_json: RoyalGuardsJson,
    pub royal_guards: HashSet<String>,
    pub horners_units_json: HornersUnitsJson,
    pub horners_units: HashSet<String>,
    pub tychus_base_upgrades_json: TychusBaseUpgradesJson,
    pub tychus_base_upgrades: HashSet<String>,
    pub tychus_ultimate_upgrades_json: TychusUltimateUpgradesJson,
    pub tychus_ultimate_upgrades: HashSet<String>,
    pub outlaws_json: OutlawsJson,
    pub outlaws: HashSet<String>,
    map_key_to_id_lookup: HashMap<String, String>,
    map_id_to_english_lookup: HashMap<String, String>,
}

impl Sc2DictionaryData {
    pub fn cache_generation_data(&self) -> CacheGenerationData<'_> {
        CacheGenerationData {
            map_names: &self.map_names,
            prestige_names: &self.prestige_names,
            mutators_all: &self.mutators_all,
            mutators_ui: &self.mutators_ui,
            mutator_ids: &self.mutator_ids,
            cached_mutators: &self.cached_mutators,
            mutator_brutal_plus: &self.mutator_brutal_plus,
            amon_player_ids: &self.amon_player_ids,
            replay_analysis_data: &self.replay_analysis_data,
            co_mastery_upgrades: &self.co_mastery_upgrades,
            prestige_upgrades: &self.prestige_upgrades,
            unit_name_dict: &self.unit_name_dict,
            unit_add_kills_to: &self.unit_add_kills_to,
            unit_comp_dict: &self.unit_comp_dict,
            unit_base_costs: &self.unit_base_costs,
            units_in_waves: &self.units_in_waves,
            hfts_units: &self.hfts_units,
            tus_units: &self.tus_units,
            royal_guards: &self.royal_guards,
            horners_units: &self.horners_units,
            tychus_base_upgrades: &self.tychus_base_upgrades,
            tychus_ultimate_upgrades: &self.tychus_ultimate_upgrades,
            outlaws: &self.outlaws,
        }
    }

    pub fn tauri_ui_data(&self) -> TauriUiData<'_> {
        TauriUiData {
            prestige_names_json: &self.prestige_names_json,
            prestige_names: &self.prestige_names,
            prestige_names_with_u64_levels: &self.prestige_names_with_u64_levels,
            map_names: &self.map_names,
            bonus_objectives: &self.bonus_objectives,
            commander_mind_control_units: &self.commander_mind_control_units,
            units_to_stats: &self.units_to_stats,
            amon_player_ids: &self.amon_player_ids,
            weekly_mutations_json: &self.weekly_mutations_json,
            weekly_mutations_as_sets: &self.weekly_mutations_as_sets,
            map_key_to_id_lookup: &self.map_key_to_id_lookup,
            map_id_to_english_lookup: &self.map_id_to_english_lookup,
        }
    }

    pub fn load(data_dir: Option<PathBuf>) -> Result<Self, DictionaryDataError> {
        let resolved_data_dir =
            data_dir.unwrap_or_else(DictionaryDataLoader::resolve_default_dictionary_data_dir);
        DictionaryDataLoader::load_shared_dictionary_data(&resolved_data_dir)
    }

    pub fn prestige_name(&self, commander: &str, prestige: u64) -> Option<&str> {
        let prestige = i64::try_from(prestige).ok()?;
        self.prestige_names
            .get(commander)
            .and_then(|levels| levels.get(&prestige))
            .map(String::as_str)
    }

    pub fn canonicalize_coop_map_id(&self, raw: &str) -> Option<String> {
        let key = DictionaryDataLoader::normalize_map_key(raw);
        self.map_key_to_id_lookup.get(&key).cloned()
    }

    pub fn coop_map_id_to_english(&self, raw_map_id: &str) -> Option<String> {
        let key = DictionaryDataLoader::normalize_map_key(raw_map_id);
        self.map_id_to_english_lookup.get(&key).cloned()
    }

    pub fn coop_map_english_name(&self, raw: &str) -> Option<String> {
        self.canonicalize_coop_map_id(raw)
            .and_then(|map_id| self.coop_map_id_to_english(&map_id))
    }

    pub fn canonicalize_coop_map_name(&self, raw: &str) -> Option<String> {
        self.coop_map_english_name(raw)
    }

    pub fn commander_mind_control_unit(&self, commander: &str) -> Option<&str> {
        self.commander_mind_control_units
            .get(commander)
            .map(String::as_str)
    }

    pub fn mutator_data(&self, mutator_id: &str) -> Option<&LocalizedMutatorDescription> {
        self.mutators_json.get(mutator_id)
    }

    pub fn mutator_id_from_name(&self, mutator_name: &str) -> Option<&str> {
        self.mutator_name_to_id_lookup
            .get(mutator_name)
            .map(String::as_str)
    }

    pub fn mutator_list(&self) -> &Vec<String> {
        &self.mutators_ui
    }
}

struct DictionaryDataLoader;

impl DictionaryDataLoader {
    fn read_dictionary_text(
        base_dir: &Path,
        file_name: &'static str,
    ) -> Result<(PathBuf, String), DictionaryDataError> {
        let path = base_dir.join(file_name);
        let content = fs::read_to_string(&path).map_err(|error| DictionaryDataError::IoRead {
            path: path.clone(),
            message: error.to_string(),
        })?;
        Ok((path, content))
    }

    fn load_dictionary_json<T>(
        base_dir: &Path,
        file_name: &'static str,
    ) -> Result<T, DictionaryDataError>
    where
        T: DeserializeOwned,
    {
        let (path, content) = Self::read_dictionary_text(base_dir, file_name)?;
        serde_json::from_str::<T>(&content).map_err(|error| DictionaryDataError::JsonParse {
            path,
            message: error.to_string(),
        })
    }

    fn parse_string_set(values: &[String]) -> HashSet<String> {
        values.iter().cloned().collect()
    }

    fn parse_unit_comp_dict(rows: &UnitCompDictJson) -> HashMap<String, Vec<HashSet<String>>> {
        rows.iter()
            .map(|(key, waves)| {
                (
                    key.clone(),
                    waves
                        .iter()
                        .map(|wave| wave.iter().cloned().collect::<HashSet<String>>())
                        .collect::<Vec<HashSet<String>>>(),
                )
            })
            .collect()
    }

    fn parse_prestige_names_i64(
        raw: &PrestigeNamesJson,
    ) -> Result<HashMap<String, HashMap<i64, String>>, DictionaryDataError> {
        let mut prestige_names = HashMap::new();
        for (commander, entries) in raw.iter() {
            let mut parsed_entries = HashMap::new();
            for (index, value) in entries.en.iter().enumerate() {
                let parsed_key = i64::try_from(index).map_err(|_| {
                    DictionaryDataError::InvalidDictionaryData {
                        file: "prestige_names.json",
                        message: format!("prestige index '{index}' exceeds i64 range"),
                    }
                })?;
                parsed_entries.insert(parsed_key, value.clone());
            }
            prestige_names.insert(commander.clone(), parsed_entries);
        }
        Ok(prestige_names)
    }

    fn parse_prestige_names_with_u64_levels(
        prestige_names: &HashMap<String, HashMap<i64, String>>,
    ) -> HashMap<String, HashMap<u64, String>> {
        prestige_names
            .iter()
            .map(|(commander, levels)| {
                let parsed_levels = levels
                    .iter()
                    .filter_map(|(level, name)| {
                        u64::try_from(*level)
                            .ok()
                            .map(|level| (level, name.clone()))
                    })
                    .collect::<HashMap<u64, String>>();
                (commander.clone(), parsed_levels)
            })
            .collect()
    }

    fn build_mutator_list_all(mutators_json: &MutatorsJson) -> Vec<String> {
        let mut mutators_all = mutators_json.keys().cloned().collect::<Vec<String>>();
        if mutators_all.len() > 19 {
            mutators_all.truncate(mutators_all.len() - 19);
        } else {
            mutators_all.clear();
        }
        mutators_all
    }

    fn build_mutators_ui(
        mutators_all: &[String],
        mutators_exclude_ids_json: &MutatorsExcludeIdsJson,
    ) -> Vec<String> {
        let mutators_exclude_set = Self::parse_string_set(mutators_exclude_ids_json);
        mutators_all
            .iter()
            .filter(|name| !mutators_exclude_set.contains(name.as_str()))
            .cloned()
            .collect()
    }

    fn parse_amon_player_ids_as_sets(
        amon_player_ids: &AmonPlayerIdsJson,
    ) -> HashMap<String, HashSet<String>> {
        amon_player_ids
            .iter()
            .map(|(key, values)| {
                (
                    key.clone(),
                    values
                        .iter()
                        .map(ToString::to_string)
                        .collect::<HashSet<String>>(),
                )
            })
            .collect()
    }

    fn parse_unit_base_costs_as_tuples(
        unit_base_costs: &UnitBaseCostsJson,
    ) -> HashMap<String, HashMap<String, Vec<u64>>> {
        unit_base_costs
            .iter()
            .map(|(unit, costs)| {
                (
                    unit.clone(),
                    costs
                        .iter()
                        .map(|(key, values)| {
                            (
                                key.clone(),
                                values
                                    .iter()
                                    .map(|value| value.round_ties_even().max(0.0) as u64)
                                    .collect::<Vec<u64>>(),
                            )
                        })
                        .collect::<HashMap<String, Vec<u64>>>(),
                )
            })
            .collect()
    }

    fn normalize_map_key(value: &str) -> String {
        value
            .chars()
            .filter(|ch| ch.is_alphanumeric())
            .flat_map(|ch| ch.to_lowercase())
            .collect()
    }

    fn normalize_lookup_key(value: &str) -> String {
        value
            .chars()
            .filter(|ch| ch.is_alphanumeric())
            .flat_map(|ch| ch.to_lowercase())
            .collect()
    }

    fn build_map_key_to_id_lookup(map_names: &MapNamesJson) -> HashMap<String, String> {
        let mut out = HashMap::new();

        for (raw_name, info) in map_names.iter() {
            let map_id = info
                .get("ID")
                .filter(|value| !value.trim().is_empty())
                .cloned();
            let canonical = info
                .get("EN")
                .filter(|value| !value.trim().is_empty())
                .cloned()
                .or_else(|| Some(raw_name.clone()))
                .unwrap_or_default();

            let Some(map_id) = map_id else {
                continue;
            };
            if canonical.is_empty() {
                continue;
            }

            out.insert(Self::normalize_map_key(raw_name), map_id.clone());
            out.insert(Self::normalize_map_key(&canonical), map_id.clone());
            out.insert(Self::normalize_map_key(&map_id), map_id.clone());
        }

        out.insert(
            "acbelshirescort".to_string(),
            "AC_BelshirEscort".to_string(),
        );

        out
    }

    fn build_map_id_to_english_lookup(map_names: &MapNamesJson) -> HashMap<String, String> {
        let mut out = HashMap::new();

        for info in map_names.values() {
            let map_id = info
                .get("ID")
                .filter(|value| !value.trim().is_empty())
                .cloned();
            let english = info
                .get("EN")
                .filter(|value| !value.trim().is_empty())
                .cloned();
            let (Some(map_id), Some(english)) = (map_id, english) else {
                continue;
            };
            out.insert(Self::normalize_map_key(&map_id), english);
        }

        out
    }

    fn parse_weekly_mutations(data: &WeeklyMutationsJson) -> HashMap<String, WeeklyMutation> {
        data.iter()
            .map(|(name, entry)| {
                (
                    name.clone(),
                    WeeklyMutation {
                        map: entry.map.clone(),
                        mutators: entry
                            .mutators
                            .iter()
                            .map(|mutator| Self::normalize_lookup_key(mutator))
                            .filter(|mutator| !mutator.is_empty())
                            .collect(),
                    },
                )
            })
            .collect()
    }

    fn validate_mutator_brutal_plus(
        data: &MutatorBrutalPlusJson,
    ) -> Result<(), DictionaryDataError> {
        let mut expected_level: u8 = 1;

        for entry in data.iter() {
            if entry.brutal_plus != expected_level {
                return Err(DictionaryDataError::InvalidDictionaryData {
                    file: "mutator_brutal_plus.json",
                    message: format!(
                        "expected brutal_plus level {expected_level}, found {}",
                        entry.brutal_plus
                    ),
                });
            }

            if entry.mutator_points.min > entry.mutator_points.max {
                return Err(DictionaryDataError::InvalidDictionaryData {
                    file: "mutator_brutal_plus.json",
                    message: format!(
                        "B+{} mutator_points min {} exceeds max {}",
                        entry.brutal_plus, entry.mutator_points.min, entry.mutator_points.max
                    ),
                });
            }

            if entry.mutator_count.min > entry.mutator_count.max {
                return Err(DictionaryDataError::InvalidDictionaryData {
                    file: "mutator_brutal_plus.json",
                    message: format!(
                        "B+{} mutator_count min {} exceeds max {}",
                        entry.brutal_plus, entry.mutator_count.min, entry.mutator_count.max
                    ),
                });
            }

            expected_level = expected_level.saturating_add(1);
        }

        if expected_level != 7 {
            return Err(DictionaryDataError::InvalidDictionaryData {
                file: "mutator_brutal_plus.json",
                message: format!("expected Brutal+ levels 1 through 6, found {}", data.len()),
            });
        }

        Ok(())
    }

    fn load_shared_dictionary_data(
        data_dir: &Path,
    ) -> Result<Sc2DictionaryData, DictionaryDataError> {
        let prestige_names_json =
            Self::load_dictionary_json::<PrestigeNamesJson>(data_dir, "prestige_names.json")?;
        let prestige_names = Self::parse_prestige_names_i64(&prestige_names_json)?;
        let prestige_names_with_u64_levels =
            Self::parse_prestige_names_with_u64_levels(&prestige_names);
        let map_names = Self::load_dictionary_json::<MapNamesJson>(data_dir, "map_names.json")?;
        let bonus_objectives =
            Self::load_dictionary_json::<BonusObjectivesJson>(data_dir, "bonus_objectives.json")?;
        let commander_mind_control_units =
            Self::load_dictionary_json::<McUnitsJson>(data_dir, "mc_units.json")?;
        let mutators_json = Self::load_dictionary_json::<MutatorsJson>(data_dir, "mutators.json")?;
        let mutators_exclude_ids_json = Self::load_dictionary_json::<MutatorsExcludeIdsJson>(
            data_dir,
            "mutators_exclude_ids.json",
        )?;
        let mutators_all = Self::build_mutator_list_all(&mutators_json);
        let mutators_ui = Self::build_mutators_ui(&mutators_all, &mutators_exclude_ids_json);
        let units_to_stats_json =
            Self::load_dictionary_json::<UnitsToStatsJson>(data_dir, "units_to_stats.json")?;
        let units_to_stats = Self::parse_string_set(&units_to_stats_json);
        let amon_player_ids =
            Self::load_dictionary_json::<AmonPlayerIdsJson>(data_dir, "amon_player_ids.json")?;
        let amon_player_ids_as_sets = Self::parse_amon_player_ids_as_sets(&amon_player_ids);
        let prestige_upgrades =
            Self::load_dictionary_json::<PrestigeUpgradesJson>(data_dir, "prestige_upgrades.json")?;
        let unit_name_dict =
            Self::load_dictionary_json::<UnitNamesJson>(data_dir, "unit_names.json")?;
        let unit_add_kills_to =
            Self::load_dictionary_json::<UnitAddKillsToJson>(data_dir, "unit_add_kills_to.json")?;
        let unit_comp_dict_json =
            Self::load_dictionary_json::<UnitCompDictJson>(data_dir, "unit_comp_dict.json")?;
        let unit_comp_dict = Self::parse_unit_comp_dict(&unit_comp_dict_json);
        let unit_base_costs =
            Self::load_dictionary_json::<UnitBaseCostsJson>(data_dir, "unit_base_costs.json")?;
        let unit_base_costs_as_tuples = Self::parse_unit_base_costs_as_tuples(&unit_base_costs);
        let mutator_ids =
            Self::load_dictionary_json::<MutatorIdsJson>(data_dir, "mutator_ids.json")?;
        let mutator_name_to_id_lookup = mutator_ids
            .iter()
            .map(|(id, name)| (name.clone(), id.clone()))
            .collect::<HashMap<String, String>>();
        let mutator_points =
            Self::load_dictionary_json::<MutatorPointsJson>(data_dir, "mutator_points.json")?;
        let cached_mutators =
            Self::load_dictionary_json::<CachedMutatorsJson>(data_dir, "cached_mutators.json")?;
        let mutator_brutal_plus = Self::load_dictionary_json::<MutatorBrutalPlusJson>(
            data_dir,
            "mutator_brutal_plus.json",
        )?;
        Self::validate_mutator_brutal_plus(&mutator_brutal_plus)?;
        let weekly_mutations_json =
            Self::load_dictionary_json::<WeeklyMutationsJson>(data_dir, "weekly_mutations.json")?;
        let weekly_mutation_date_json = Self::load_dictionary_json::<WeeklyMutationDateJson>(
            data_dir,
            "weekly_mutation_date.json",
        )?;
        if !weekly_mutations_json.contains_key(&weekly_mutation_date_json.name) {
            return Err(DictionaryDataError::InvalidDictionaryData {
                file: "weekly_mutation_date.json",
                message: format!(
                    "initial weekly mutation '{}' does not exist in weekly_mutations.json",
                    weekly_mutation_date_json.name
                ),
            });
        }
        if NaiveDate::parse_from_str(&weekly_mutation_date_json.date, "%Y-%m-%d").is_err() {
            return Err(DictionaryDataError::InvalidDictionaryData {
                file: "weekly_mutation_date.json",
                message: format!(
                    "date '{}' must use YYYY-MM-DD format",
                    weekly_mutation_date_json.date
                ),
            });
        }
        let weekly_mutations_as_sets = Self::parse_weekly_mutations(&weekly_mutations_json);
        let replay_analysis_data = Self::load_dictionary_json::<ReplayAnalysisDataJson>(
            data_dir,
            "replay_analysis_data.json",
        )?;
        let co_mastery_upgrades = Self::load_dictionary_json::<CoMasteryUpgradesJson>(
            data_dir,
            "co_mastery_upgrades.json",
        )?;
        let units_in_waves_json =
            Self::load_dictionary_json::<UnitsInWavesJson>(data_dir, "units_in_waves.json")?;
        let units_in_waves = Self::parse_string_set(&units_in_waves_json);
        let hfts_units_json =
            Self::load_dictionary_json::<HftsUnitsJson>(data_dir, "hfts_units.json")?;
        let hfts_units = Self::parse_string_set(&hfts_units_json);
        let tus_units_json =
            Self::load_dictionary_json::<TusUnitsJson>(data_dir, "tus_units.json")?;
        let tus_units = Self::parse_string_set(&tus_units_json);
        let royal_guards_json =
            Self::load_dictionary_json::<RoyalGuardsJson>(data_dir, "royal_guards.json")?;
        let royal_guards = Self::parse_string_set(&royal_guards_json);
        let horners_units_json =
            Self::load_dictionary_json::<HornersUnitsJson>(data_dir, "horners_units.json")?;
        let horners_units = Self::parse_string_set(&horners_units_json);
        let tychus_base_upgrades_json = Self::load_dictionary_json::<TychusBaseUpgradesJson>(
            data_dir,
            "tychus_base_upgrades.json",
        )?;
        let tychus_base_upgrades = Self::parse_string_set(&tychus_base_upgrades_json);
        let tychus_ultimate_upgrades_json = Self::load_dictionary_json::<TychusUltimateUpgradesJson>(
            data_dir,
            "tychus_ultimate_upgrades.json",
        )?;
        let tychus_ultimate_upgrades = Self::parse_string_set(&tychus_ultimate_upgrades_json);
        let outlaws_json = Self::load_dictionary_json::<OutlawsJson>(data_dir, "outlaws.json")?;
        let outlaws = Self::parse_string_set(&outlaws_json);
        let map_key_to_id_lookup = Self::build_map_key_to_id_lookup(&map_names);
        let map_id_to_english_lookup = Self::build_map_id_to_english_lookup(&map_names);

        Ok(Sc2DictionaryData {
            prestige_names_json,
            prestige_names,
            prestige_names_with_u64_levels,
            map_names,
            bonus_objectives,
            commander_mind_control_units,
            mutators_json,
            mutators_exclude_ids_json,
            mutators_all,
            mutators_ui,
            units_to_stats_json,
            units_to_stats,
            amon_player_ids,
            amon_player_ids_as_sets,
            prestige_upgrades,
            unit_name_dict,
            unit_add_kills_to,
            unit_comp_dict_json,
            unit_comp_dict,
            unit_base_costs,
            unit_base_costs_as_tuples,
            mutator_ids,
            mutator_name_to_id_lookup,
            mutator_points,
            cached_mutators,
            mutator_brutal_plus,
            weekly_mutations_json,
            weekly_mutation_date_json,
            weekly_mutations_as_sets,
            replay_analysis_data,
            co_mastery_upgrades,
            units_in_waves_json,
            units_in_waves,
            hfts_units_json,
            hfts_units,
            tus_units_json,
            tus_units,
            royal_guards_json,
            royal_guards,
            horners_units_json,
            horners_units,
            tychus_base_upgrades_json,
            tychus_base_upgrades,
            tychus_ultimate_upgrades_json,
            tychus_ultimate_upgrades,
            outlaws_json,
            outlaws,
            map_key_to_id_lookup,
            map_id_to_english_lookup,
        })
    }

    const DEFAULT_DATA_DIR_CANDIDATES: [&str; 2] = ["data", "s2coop-analyzer/data"];

    fn add_default_data_dir_candidate(
        candidates: &mut Vec<PathBuf>,
        seen: &mut HashSet<PathBuf>,
        candidate: PathBuf,
    ) {
        if seen.insert(candidate.clone()) {
            candidates.push(candidate);
        }
    }

    fn add_default_data_dir_ancestors(
        candidates: &mut Vec<PathBuf>,
        seen: &mut HashSet<PathBuf>,
        start: &Path,
    ) {
        let mut probe = Some(start);
        while let Some(base) = probe {
            for relative in Self::DEFAULT_DATA_DIR_CANDIDATES {
                Self::add_default_data_dir_candidate(candidates, seen, base.join(relative));
            }
            probe = base.parent();
        }
    }

    fn required_dictionary_files_present(path: &Path) -> bool {
        path.is_dir()
            && path.join("mutators_exclude_ids.json").is_file()
            && path.join("mutator_brutal_plus.json").is_file()
            && path.join("replay_analysis_data.json").is_file()
    }

    fn resolve_default_dictionary_data_dir() -> PathBuf {
        let mut candidates = Vec::<PathBuf>::new();
        let mut seen = HashSet::<PathBuf>::new();

        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            Self::add_default_data_dir_ancestors(
                &mut candidates,
                &mut seen,
                Path::new(&manifest_dir),
            );
        }

        if let Ok(current_dir) = std::env::current_dir() {
            Self::add_default_data_dir_ancestors(&mut candidates, &mut seen, current_dir.as_path());
        }

        if let Ok(current_exe) = std::env::current_exe()
            && let Some(parent) = current_exe.parent()
        {
            Self::add_default_data_dir_ancestors(&mut candidates, &mut seen, parent);
        }

        candidates
            .into_iter()
            .find(|candidate| Self::required_dictionary_files_present(candidate))
            .unwrap_or_else(|| PathBuf::from("./data"))
    }
}
