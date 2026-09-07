use crate::{ReplayAnalysis, TauriOverlayOps, UiMutatorRow, shared_types};
use s2coop_analyzer::dictionary_data::Sc2DictionaryData;
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use ts_rs::TS;

#[derive(Clone, Serialize, Default, PartialEq, TS)]
#[ts(export, export_to = "../src/bindings/overlay.ts")]
pub struct ReplayChatMessage {
    pub player: u8,
    pub text: String,
    pub time: f64,
}

#[derive(Clone, Serialize, Default, PartialEq, TS)]
#[ts(export, export_to = "../src/bindings/overlay.ts")]
pub struct ReplayChatPayload {
    pub file: String,
    #[ts(type = "number")]
    pub date: u64,
    pub map: String,
    pub result: String,
    pub slot1_name: String,
    pub slot2_name: String,
    pub messages: Vec<ReplayChatMessage>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, TS)]
#[ts(export, export_to = "../src/bindings/overlay.ts")]
pub struct GamesRowPayload {
    pub file: String,
    #[ts(type = "number")]
    pub date: u64,
    pub map: String,
    pub result: String,
    pub difficulty: String,
    pub p1: String,
    pub p2: String,
    pub slot1_commander: String,
    pub slot2_commander: String,
    pub enemy: String,
    pub main_commander: String,
    pub ally_commander: String,
    #[ts(type = "number")]
    pub length: u64,
    #[ts(type = "number")]
    pub main_apm: u64,
    #[ts(type = "number")]
    pub ally_apm: u64,
    #[ts(type = "number")]
    pub main_kills: u64,
    #[ts(type = "number")]
    pub ally_kills: u64,
    pub extension: bool,
    #[ts(type = "number")]
    pub brutal_plus: u64,
    pub weekly: bool,
    #[ts(optional)]
    pub weekly_name: Option<String>,
    pub mutators: Vec<UiMutatorRow>,
    pub is_mutation: bool,
}

#[derive(Clone, Default)]
pub struct ReplayInfo {
    pub file: String,
    pub date: u64,
    pub map: String,
    pub result: String,
    pub difficulty: String,
    pub enemy: String,
    pub length: u64,
    pub accurate_length: f64,
    pub slot1: ReplayPlayerInfo,
    pub slot2: ReplayPlayerInfo,
    pub main_slot: usize,
    pub amon_units: Value,
    pub player_stats: Value,
    pub extension: bool,
    pub brutal_plus: u64,
    pub weekly: bool,
    pub weekly_name: Option<String>,
    pub mutators: Vec<String>,
    pub comp: String,
    pub bonus: Vec<u64>,
    pub bonus_total: Option<u64>,
    pub messages: Vec<ReplayChatMessage>,
    pub is_detailed: bool,
}

#[derive(Clone, Default)]
pub struct ReplayPlayerInfo {
    pub name: String,
    pub handle: String,
    pub apm: u64,
    pub kills: u64,
    pub commander: String,
    pub commander_level: u64,
    pub mastery_level: u64,
    pub prestige: u64,
    pub masteries: Vec<u64>,
    pub units: Value,
    pub icons: Value,
}

#[derive(Default, Clone)]
pub struct UnitStatsRollup {
    pub created: i64,
    pub created_hidden: bool,
    pub made: u64,
    pub lost: i64,
    pub lost_hidden: bool,
    pub kills: i64,
    pub kill_percentages: Vec<f64>,
}

#[derive(Default)]
pub struct CommanderUnitRollup {
    pub count: u64,
    pub units: HashMap<String, UnitStatsRollup>,
}

impl ReplayPlayerInfo {
    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn handle(&self) -> &str {
        &self.handle
    }

    pub fn apm(&self) -> u64 {
        self.apm
    }

    pub fn kills(&self) -> u64 {
        self.kills
    }

    pub fn commander(&self) -> &str {
        &self.commander
    }

    pub fn commander_level(&self) -> u64 {
        self.commander_level
    }

    pub fn mastery_level(&self) -> u64 {
        self.mastery_level
    }

    pub fn prestige(&self) -> u64 {
        self.prestige
    }

    pub fn masteries(&self) -> &[u64] {
        &self.masteries
    }

    pub fn units(&self) -> &Value {
        &self.units
    }

    pub fn icons(&self) -> &Value {
        &self.icons
    }

    pub fn set_name(&mut self, value: impl Into<String>) {
        self.name = value.into();
    }

    pub fn with_name(mut self, value: impl Into<String>) -> Self {
        self.set_name(value);
        self
    }

    pub fn set_handle(&mut self, value: impl Into<String>) {
        self.handle = value.into();
    }

    pub fn with_handle(mut self, value: impl Into<String>) -> Self {
        self.set_handle(value);
        self
    }

    pub fn set_apm(&mut self, value: u64) {
        self.apm = value;
    }

    pub fn with_apm(mut self, value: u64) -> Self {
        self.set_apm(value);
        self
    }

    pub fn set_kills(&mut self, value: u64) {
        self.kills = value;
    }

    pub fn with_kills(mut self, value: u64) -> Self {
        self.set_kills(value);
        self
    }

    pub fn set_commander(&mut self, value: impl Into<String>) {
        self.commander = value.into();
    }

    pub fn with_commander(mut self, value: impl Into<String>) -> Self {
        self.set_commander(value);
        self
    }

    pub fn set_commander_level(&mut self, value: u64) {
        self.commander_level = value;
    }

    pub fn with_commander_level(mut self, value: u64) -> Self {
        self.set_commander_level(value);
        self
    }

    pub fn set_mastery_level(&mut self, value: u64) {
        self.mastery_level = value;
    }

    pub fn with_mastery_level(mut self, value: u64) -> Self {
        self.set_mastery_level(value);
        self
    }

    pub fn set_prestige(&mut self, value: u64) {
        self.prestige = value;
    }

    pub fn with_prestige(mut self, value: u64) -> Self {
        self.set_prestige(value);
        self
    }

    pub fn set_masteries(&mut self, value: Vec<u64>) {
        self.masteries = value;
    }

    pub fn with_masteries(mut self, value: Vec<u64>) -> Self {
        self.set_masteries(value);
        self
    }

    pub fn set_units(&mut self, value: Value) {
        self.units = value;
    }

    pub fn with_units(mut self, value: Value) -> Self {
        self.set_units(value);
        self
    }

    pub fn set_icons(&mut self, value: Value) {
        self.icons = value;
    }

    pub fn with_icons(mut self, value: Value) -> Self {
        self.set_icons(value);
        self
    }

    fn sanitized_for_client(&self) -> Self {
        Self {
            name: TauriOverlayOps::sanitize_replay_text(&self.name),
            handle: self.handle.clone(),
            apm: self.apm,
            kills: self.kills,
            commander: TauriOverlayOps::sanitize_replay_text(&self.commander),
            commander_level: self.commander_level,
            mastery_level: self.mastery_level,
            prestige: self.prestige,
            masteries: TauriOverlayOps::normalize_mastery_values(&self.masteries),
            units: TauriOverlayOps::sanitize_unit_map(&self.units),
            icons: TauriOverlayOps::sanitize_icon_map(&self.icons),
        }
    }
}

impl ReplayInfo {
    pub fn should_keep_existing_detailed_variant(
        existing_is_detailed: bool,
        incoming_is_detailed: bool,
    ) -> bool {
        existing_is_detailed || !incoming_is_detailed
    }

    pub fn oriented_for_main_identity(
        mut self,
        main_names: &HashSet<String>,
        main_handles: &HashSet<String>,
    ) -> Self {
        if !TauriOverlayOps::replay_should_swap_main_and_ally(&self, main_names, main_handles) {
            return self;
        }

        self.main_slot = self.ally_index();
        TauriOverlayOps::swap_player_stats_sides(&mut self.player_stats);
        self
    }

    pub fn sort_replays(replays: &mut [Self]) {
        replays.sort_by(|left, right| {
            right
                .date
                .cmp(&left.date)
                .then_with(|| right.file.cmp(&left.file))
        });
    }

    pub fn with_players(
        slot1: ReplayPlayerInfo,
        slot2: ReplayPlayerInfo,
        main_slot: usize,
    ) -> Self {
        Self {
            slot1,
            slot2,
            main_slot: main_slot.min(1),
            ..Self::default()
        }
    }

    fn slot(&self, index: usize) -> &ReplayPlayerInfo {
        match index {
            0 => &self.slot1,
            1 => &self.slot2,
            _ => &self.slot1,
        }
    }

    pub fn slot1(&self) -> &ReplayPlayerInfo {
        &self.slot1
    }

    pub fn slot2(&self) -> &ReplayPlayerInfo {
        &self.slot2
    }

    pub fn file(&self) -> &str {
        &self.file
    }

    pub fn date(&self) -> u64 {
        self.date
    }

    pub fn map(&self) -> &str {
        &self.map
    }

    pub fn result(&self) -> &str {
        &self.result
    }

    pub fn difficulty(&self) -> &str {
        &self.difficulty
    }

    pub fn enemy(&self) -> &str {
        &self.enemy
    }

    pub fn length(&self) -> u64 {
        self.length
    }

    pub fn accurate_length(&self) -> f64 {
        self.accurate_length
    }

    pub fn amon_units(&self) -> &Value {
        &self.amon_units
    }

    pub fn player_stats(&self) -> &Value {
        &self.player_stats
    }

    pub fn extension(&self) -> bool {
        self.extension
    }

    pub fn brutal_plus(&self) -> u64 {
        self.brutal_plus
    }

    pub fn weekly(&self) -> bool {
        self.weekly
    }

    pub fn weekly_name(&self) -> Option<&str> {
        self.weekly_name.as_deref()
    }

    pub fn mutators(&self) -> &[String] {
        &self.mutators
    }

    pub fn comp(&self) -> &str {
        &self.comp
    }

    pub fn bonus(&self) -> &[u64] {
        &self.bonus
    }

    pub fn bonus_total(&self) -> Option<u64> {
        self.bonus_total
    }

    pub fn messages(&self) -> &[ReplayChatMessage] {
        &self.messages
    }

    pub fn is_detailed(&self) -> bool {
        self.is_detailed
    }

    pub fn set_file(&mut self, value: impl Into<String>) {
        self.file = value.into();
    }

    pub fn set_date(&mut self, value: u64) {
        self.date = value;
    }

    pub fn set_map(&mut self, value: impl Into<String>) {
        self.map = value.into();
    }

    pub fn set_result(&mut self, value: impl Into<String>) {
        self.result = value.into();
    }

    pub fn set_difficulty(&mut self, value: impl Into<String>) {
        self.difficulty = value.into();
    }

    pub fn set_enemy(&mut self, value: impl Into<String>) {
        self.enemy = value.into();
    }

    pub fn set_length(&mut self, value: u64) {
        self.length = value;
    }

    pub fn set_accurate_length(&mut self, value: f64) {
        self.accurate_length = value;
    }

    pub fn set_amon_units(&mut self, value: Value) {
        self.amon_units = value;
    }

    pub fn set_player_stats(&mut self, value: Value) {
        self.player_stats = value;
    }

    pub fn set_extension(&mut self, value: bool) {
        self.extension = value;
    }

    pub fn set_brutal_plus(&mut self, value: u64) {
        self.brutal_plus = value;
    }

    pub fn set_weekly(&mut self, value: bool) {
        self.weekly = value;
    }

    pub fn set_weekly_name(&mut self, value: Option<String>) {
        self.weekly_name = value;
    }

    pub fn set_mutators(&mut self, value: Vec<String>) {
        self.mutators = value;
    }

    pub fn set_comp(&mut self, value: impl Into<String>) {
        self.comp = value.into();
    }

    pub fn set_bonus(&mut self, value: Vec<u64>) {
        self.bonus = value;
    }

    pub fn set_bonus_total(&mut self, value: Option<u64>) {
        self.bonus_total = value;
    }

    pub fn set_messages(&mut self, value: Vec<ReplayChatMessage>) {
        self.messages = value;
    }

    pub fn set_is_detailed(&mut self, value: bool) {
        self.is_detailed = value;
    }

    pub fn main_index(&self) -> usize {
        self.main_slot.min(1)
    }

    pub fn ally_index(&self) -> usize {
        1 - self.main_index()
    }

    pub fn main(&self) -> &ReplayPlayerInfo {
        self.slot(self.main_index())
    }

    pub fn ally(&self) -> &ReplayPlayerInfo {
        self.slot(self.ally_index())
    }

    pub fn main_apm(&self) -> u64 {
        self.main().apm
    }

    pub fn ally_apm(&self) -> u64 {
        self.ally().apm
    }

    pub fn main_kills(&self) -> u64 {
        self.main().kills
    }

    pub fn ally_kills(&self) -> u64 {
        self.ally().kills
    }

    pub fn main_commander(&self) -> &str {
        &self.main().commander
    }

    pub fn ally_commander(&self) -> &str {
        &self.ally().commander
    }

    pub fn main_commander_level(&self) -> u64 {
        self.main().commander_level
    }

    pub fn ally_commander_level(&self) -> u64 {
        self.ally().commander_level
    }

    pub fn main_mastery_level(&self) -> u64 {
        self.main().mastery_level
    }

    pub fn ally_mastery_level(&self) -> u64 {
        self.ally().mastery_level
    }

    pub fn main_prestige(&self) -> u64 {
        self.main().prestige
    }

    pub fn ally_prestige(&self) -> u64 {
        self.ally().prestige
    }

    pub fn main_masteries(&self) -> &[u64] {
        &self.main().masteries
    }

    pub fn ally_masteries(&self) -> &[u64] {
        &self.ally().masteries
    }

    pub fn main_units(&self) -> &Value {
        &self.main().units
    }

    pub fn ally_units(&self) -> &Value {
        &self.ally().units
    }

    pub fn main_icons(&self) -> &Value {
        &self.main().icons
    }

    pub fn ally_icons(&self) -> &Value {
        &self.ally().icons
    }

    pub fn date_seconds_for_filter(&self) -> u64 {
        if self.date > 0 {
            return self.date;
        }

        ReplayAnalysis::modified_seconds(Path::new(&self.file))
    }

    pub fn has_detailed_unit_stats(&self) -> bool {
        self.main_units()
            .as_object()
            .is_some_and(|units| !units.is_empty())
            || self
                .ally_units()
                .as_object()
                .is_some_and(|units| !units.is_empty())
            || self
                .amon_units
                .as_object()
                .is_some_and(|units| !units.is_empty())
    }

    pub fn has_detailed_analysis_cache(&self) -> bool {
        self.is_detailed || self.has_detailed_unit_stats()
    }

    pub fn as_games_row_payload_with_dictionary(
        &self,
        dictionary: &Sc2DictionaryData,
    ) -> GamesRowPayload {
        let sanitized = self.sanitized_for_client_with_dictionary(dictionary);
        let mutators = sanitized
            .mutators
            .iter()
            .map(|mutator| {
                let mutator_id =
                    TauriOverlayOps::canonical_mutator_id_with_dictionary(mutator, dictionary);
                let (name_en, name_ko, name_zh_cn, description_en, description_ko, description_zh_cn) = dictionary
                    .mutator_data(&mutator_id)
                    .map(|value| {
                        (
                            TauriOverlayOps::decode_html_entities(&value.name.en),
                            TauriOverlayOps::decode_html_entities(&value.name.ko),
                            TauriOverlayOps::decode_html_entities(&value.name.zh_cn),
                            TauriOverlayOps::decode_html_entities(&value.description.en),
                            TauriOverlayOps::decode_html_entities(&value.description.ko),
                            TauriOverlayOps::decode_html_entities(&value.description.zh_cn),
                        )
                    })
                    .unwrap_or_default();
                let fallback_name_en = TauriOverlayOps::mutator_display_name_en_with_dictionary(
                    &mutator_id,
                    dictionary,
                );
                let icon_name = if name_en.is_empty() {
                    fallback_name_en.to_string()
                } else {
                    name_en.to_string()
                };
                let display_name_en = if name_en.is_empty() {
                    fallback_name_en
                } else {
                    name_en
                };
                shared_types::UiMutatorRow {
                    id: mutator_id.clone(),
                    name: shared_types::LocalizedText {
                        en: display_name_en,
                        ko: name_ko,
                        zh_cn: Some(name_zh_cn),
                    },
                    icon_name,
                    description: shared_types::LocalizedText {
                        en: description_en,
                        ko: description_ko,
                        zh_cn: Some(description_zh_cn),
                    },
                }
            })
            .collect::<Vec<_>>();
        GamesRowPayload {
            file: sanitized.file.clone(),
            date: sanitized.date,
            map: sanitized.map.clone(),
            result: sanitized.result.clone(),
            difficulty: sanitized.difficulty.clone(),
            p1: sanitized.slot1().name.clone(),
            p2: sanitized.slot2().name.clone(),
            slot1_commander: sanitized.slot1().commander.clone(),
            slot2_commander: sanitized.slot2().commander.clone(),
            enemy: sanitized.enemy.clone(),
            main_commander: sanitized.main().commander.clone(),
            ally_commander: sanitized.ally().commander.clone(),
            length: sanitized.length,
            main_apm: sanitized.main().apm,
            ally_apm: sanitized.ally().apm,
            main_kills: sanitized.main().kills,
            ally_kills: sanitized.ally().kills,
            extension: sanitized.extension,
            brutal_plus: sanitized.brutal_plus,
            weekly: sanitized.weekly,
            weekly_name: sanitized.weekly_name,
            mutators,
            is_mutation: sanitized.weekly || !sanitized.mutators.is_empty(),
        }
    }

    pub fn as_games_row_payload(&self) -> GamesRowPayload {
        let sanitized = self.sanitized_for_client();
        let mutators = sanitized
            .mutators
            .iter()
            .map(|mutator| {
                let display_name = TauriOverlayOps::decode_html_entities(mutator);
                shared_types::UiMutatorRow {
                    id: mutator.clone(),
                    name: shared_types::LocalizedText {
                        en: display_name.clone(),
                        ko: String::new(),
                        zh_cn: None,
                    },
                    icon_name: display_name,
                    description: shared_types::LocalizedText::default(),
                }
            })
            .collect::<Vec<_>>();
        GamesRowPayload {
            file: sanitized.file.clone(),
            date: sanitized.date,
            map: sanitized.map.clone(),
            result: sanitized.result.clone(),
            difficulty: sanitized.difficulty.clone(),
            p1: sanitized.slot1().name.clone(),
            p2: sanitized.slot2().name.clone(),
            slot1_commander: sanitized.slot1().commander.clone(),
            slot2_commander: sanitized.slot2().commander.clone(),
            enemy: sanitized.enemy.clone(),
            main_commander: sanitized.main().commander.clone(),
            ally_commander: sanitized.ally().commander.clone(),
            length: sanitized.length,
            main_apm: sanitized.main().apm,
            ally_apm: sanitized.ally().apm,
            main_kills: sanitized.main().kills,
            ally_kills: sanitized.ally().kills,
            extension: sanitized.extension,
            brutal_plus: sanitized.brutal_plus,
            weekly: sanitized.weekly,
            weekly_name: sanitized.weekly_name,
            mutators,
            is_mutation: sanitized.weekly || !sanitized.mutators.is_empty(),
        }
    }

    pub fn as_games_row_with_dictionary(&self, dictionary: &Sc2DictionaryData) -> Value {
        TauriOverlayOps::to_json_value(self.as_games_row_payload_with_dictionary(dictionary))
    }

    pub fn as_games_row(&self) -> Value {
        TauriOverlayOps::to_json_value(self.as_games_row_payload())
    }

    pub fn chat_payload_with_dictionary(
        &self,
        dictionary: &Sc2DictionaryData,
    ) -> ReplayChatPayload {
        let sanitized = self.sanitized_for_client_with_dictionary(dictionary);

        ReplayChatPayload {
            file: sanitized.file.clone(),
            date: sanitized.date,
            map: sanitized.map.clone(),
            result: sanitized.result.clone(),
            slot1_name: sanitized.slot1().name.clone(),
            slot2_name: sanitized.slot2().name.clone(),
            messages: sanitized.messages.clone(),
        }
    }

    pub fn chat_payload(&self) -> ReplayChatPayload {
        let sanitized = self.sanitized_for_client();

        ReplayChatPayload {
            file: sanitized.file.clone(),
            date: sanitized.date,
            map: sanitized.map.clone(),
            result: sanitized.result.clone(),
            slot1_name: sanitized.slot1().name.clone(),
            slot2_name: sanitized.slot2().name.clone(),
            messages: sanitized.messages.clone(),
        }
    }

    pub fn sanitized_for_client_with_dictionary(&self, dictionary: &Sc2DictionaryData) -> Self {
        let client_result = if self.result.eq_ignore_ascii_case("Unparsed") {
            "Failed".to_string()
        } else {
            TauriOverlayOps::sanitize_replay_text(&self.result)
        };
        Self {
            file: self.file.clone(),
            date: self.date,
            map: TauriOverlayOps::sanitize_replay_text(
                &dictionary
                    .coop_map_english_name(&self.map)
                    .unwrap_or_else(|| self.map.to_string()),
            ),
            result: client_result,
            difficulty: TauriOverlayOps::sanitize_replay_text(&self.difficulty),
            enemy: TauriOverlayOps::sanitize_replay_text(&self.enemy),
            length: self.length,
            accurate_length: self.accurate_length,
            slot1: self.slot1.sanitized_for_client(),
            slot2: self.slot2.sanitized_for_client(),
            main_slot: self.main_index(),
            amon_units: TauriOverlayOps::sanitize_unit_map(&self.amon_units),
            player_stats: TauriOverlayOps::sanitize_player_stats_payload(&self.player_stats),
            extension: self.extension,
            brutal_plus: self.brutal_plus,
            weekly: self.weekly,
            weekly_name: self
                .weekly_name
                .as_ref()
                .map(|value| TauriOverlayOps::sanitize_replay_text(value))
                .filter(|value| !value.is_empty()),
            mutators: self.mutators.clone(),
            comp: self.comp.clone(),
            bonus: self.bonus.clone(),
            bonus_total: self.bonus_total,
            messages: self
                .messages
                .iter()
                .map(|message| ReplayChatMessage {
                    player: message.player,
                    text: TauriOverlayOps::sanitize_replay_text(&message.text),
                    time: if message.time.is_finite() {
                        message.time.max(0.0)
                    } else {
                        0.0
                    },
                })
                .collect(),
            is_detailed: self.is_detailed,
        }
    }

    pub fn sanitized_for_client(&self) -> Self {
        let client_result = if self.result.eq_ignore_ascii_case("Unparsed") {
            "Failed".to_string()
        } else {
            TauriOverlayOps::sanitize_replay_text(&self.result)
        };
        Self {
            file: self.file.clone(),
            date: self.date,
            map: TauriOverlayOps::sanitize_replay_text(&self.map),
            result: client_result,
            difficulty: TauriOverlayOps::sanitize_replay_text(&self.difficulty),
            enemy: TauriOverlayOps::sanitize_replay_text(&self.enemy),
            length: self.length,
            accurate_length: self.accurate_length,
            slot1: self.slot1.sanitized_for_client(),
            slot2: self.slot2.sanitized_for_client(),
            main_slot: self.main_index(),
            amon_units: TauriOverlayOps::sanitize_unit_map(&self.amon_units),
            player_stats: TauriOverlayOps::sanitize_player_stats_payload(&self.player_stats),
            extension: self.extension,
            brutal_plus: self.brutal_plus,
            weekly: self.weekly,
            weekly_name: self
                .weekly_name
                .as_ref()
                .map(|value| TauriOverlayOps::sanitize_replay_text(value))
                .filter(|value| !value.is_empty()),
            mutators: self.mutators.clone(),
            comp: self.comp.clone(),
            bonus: self.bonus.clone(),
            bonus_total: self.bonus_total,
            messages: self
                .messages
                .iter()
                .map(|message| ReplayChatMessage {
                    player: message.player,
                    text: TauriOverlayOps::sanitize_replay_text(&message.text),
                    time: if message.time.is_finite() {
                        message.time.max(0.0)
                    } else {
                        0.0
                    },
                })
                .collect(),
            is_detailed: self.is_detailed,
        }
    }

    pub fn sanitized(&self) -> Self {
        self.clone()
    }
}
