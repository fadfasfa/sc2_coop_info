use std::collections::HashMap;

use chrono::{Local, NaiveDate};
use s2coop_analyzer::dictionary_data::Sc2DictionaryData;
use s2coop_analyzer::weekly_mutation_manager::{WeeklyMutationManager, WeeklyMutationStatus};
use serde::Serialize;
use ts_rs::TS;

use crate::shared_types::{LocalizedText, UiMutatorRow};
use crate::stats_aggregation::{StatsPlayerAggregate, StatsPlayerRecord};
use crate::{ReplayInfo, TauriOverlayOps};

use super::{ReplayAnalysis, ReplayAnalysisOps};

#[derive(Clone, Debug, Default, PartialEq, Serialize, TS)]
#[ts(export, export_to = "../src/bindings/overlay.ts")]
pub struct PlayerRowPayload {
    pub handle: String,
    pub player: String,
    pub player_names: Vec<String>,
    #[ts(type = "number")]
    pub wins: u64,
    #[ts(type = "number")]
    pub losses: u64,
    pub winrate: f64,
    pub apm: f64,
    pub commander: String,
    pub frequency: f64,
    pub kills: f64,
    #[ts(type = "number")]
    pub last_seen: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, TS)]
#[ts(export, export_to = "../src/bindings/overlay.ts")]
pub struct WeeklyRowPayload {
    pub mutation: String,
    #[serde(rename = "nameEn")]
    pub name_en: String,
    #[serde(rename = "nameKo")]
    pub name_ko: String,
    #[serde(rename = "nameZhCn", default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub name_zh_cn: Option<String>,
    pub map: String,
    pub mutators: Vec<UiMutatorRow>,
    #[serde(rename = "mutationOrder")]
    #[ts(type = "number")]
    pub mutation_order: usize,
    #[serde(rename = "isCurrent")]
    pub is_current: bool,
    #[serde(rename = "nextDurationDays")]
    #[ts(type = "number")]
    pub next_duration_days: i64,
    #[serde(rename = "nextDuration")]
    pub next_duration: String,
    pub difficulty: String,
    #[ts(type = "number")]
    pub wins: u64,
    #[ts(type = "number")]
    pub losses: u64,
    pub winrate: f64,
}

impl ReplayAnalysis {
    pub fn rebuild_player_rows_fast(replays: &[ReplayInfo]) -> Vec<PlayerRowPayload> {
        let mut player_values: std::collections::BTreeMap<String, StatsPlayerAggregate> =
            std::collections::BTreeMap::new();

        for replay in replays.iter() {
            let replay_is_victory = match TauriOverlayOps::result_is_victory(&replay.result) {
                Some(result) => result,
                None => continue,
            };
            let main_kill_fraction =
                TauriOverlayOps::kill_fraction(replay.main_kills(), replay.ally_kills());
            let ally_kill_fraction = 1.0 - main_kill_fraction;
            let p1_name = TauriOverlayOps::sanitize_replay_text(&replay.main().name);
            let p2_name = TauriOverlayOps::sanitize_replay_text(&replay.ally().name);
            let main_commander = TauriOverlayOps::sanitize_replay_text(replay.main_commander());
            let ally_commander = TauriOverlayOps::sanitize_replay_text(replay.ally_commander());
            if !p1_name.is_empty() {
                let p1_handle_key = ReplayAnalysis::normalized_handle_key(&replay.main().handle);
                let p1 = player_values.entry(p1_handle_key).or_default();
                let p1_handle = TauriOverlayOps::sanitize_replay_text(&replay.main().handle);
                p1.record_replay(StatsPlayerRecord::new(
                    &p1_name,
                    &p1_handle,
                    &main_commander,
                    replay_is_victory,
                    replay.main_apm(),
                    main_kill_fraction,
                    replay.date,
                ));
            }

            if !p2_name.is_empty() {
                let p2_handle_key = ReplayAnalysis::normalized_handle_key(&replay.ally().handle);
                let p2 = player_values.entry(p2_handle_key).or_default();
                let p2_handle = TauriOverlayOps::sanitize_replay_text(&replay.ally().handle);
                p2.record_replay(StatsPlayerRecord::new(
                    &p2_name,
                    &p2_handle,
                    &ally_commander,
                    replay_is_victory,
                    replay.ally_apm(),
                    ally_kill_fraction,
                    replay.date,
                ));
            }
        }

        let mut rows = Vec::new();
        for (handle_key, agg) in player_values {
            if handle_key.is_empty() {
                continue;
            }
            let games = agg.games();
            let (commander, commander_frequency) = agg.dominant_commander();
            let apm = if games == 0 {
                0.0
            } else {
                TauriOverlayOps::median_u64(agg.apm_values())
            };
            let handle = agg
                .handles()
                .iter()
                .next()
                .cloned()
                .unwrap_or_else(|| handle_key.clone());
            let player_names = agg.names_by_recency();
            let player = player_names
                .first()
                .cloned()
                .unwrap_or_else(|| handle.clone());
            rows.push(PlayerRowPayload {
                handle,
                player,
                player_names,
                wins: agg.wins(),
                losses: agg.losses(),
                winrate: TauriOverlayOps::ratio(agg.wins(), games),
                apm,
                commander: TauriOverlayOps::sanitize_replay_text(&commander),
                frequency: commander_frequency,
                kills: TauriOverlayOps::median_f64(agg.kill_fractions()),
                last_seen: agg.last_seen(),
            });
        }
        rows
    }

    fn format_next_weekly_duration(days: i64) -> String {
        if days <= 0 {
            return "Now".to_string();
        }

        let weeks = days / 7;
        let remaining_days = days % 7;
        match (weeks, remaining_days) {
            (0, days_only) => format!("{days_only}d"),
            (weeks_only, 0) => format!("{weeks_only}w"),
            (weeks_only, days_only) => format!("{weeks_only}w {days_only}d"),
        }
    }

    pub fn rebuild_weeklies_rows(replays: &[ReplayInfo]) -> Vec<WeeklyRowPayload> {
        let dictionary = Sc2DictionaryData::default();
        Self::rebuild_weeklies_rows_with_dictionary(replays, Local::now().date_naive(), &dictionary)
    }

    pub fn rebuild_weeklies_rows_for_date(
        replays: &[ReplayInfo],
        current_date: NaiveDate,
    ) -> Vec<WeeklyRowPayload> {
        let dictionary = Sc2DictionaryData::default();
        Self::rebuild_weeklies_rows_with_dictionary(replays, current_date, &dictionary)
    }

    pub fn rebuild_weeklies_rows_with_dictionary(
        replays: &[ReplayInfo],
        current_date: NaiveDate,
        dictionary: &Sc2DictionaryData,
    ) -> Vec<WeeklyRowPayload> {
        #[derive(Default)]
        struct WeeklyMutatorUi<'a> {
            name_en: &'a str,
            name_ko: &'a str,
            name_zh_cn: &'a str,
            map: &'a str,
            mutators: Vec<UiMutatorRow>,
        }

        #[derive(Default)]
        struct WeeklyAggregate {
            wins: u64,
            losses: u64,
            best_difficulty_rank: i64,
            best_difficulty_label: String,
        }

        fn weekly_difficulty_rank_and_label(difficulty: &str, brutal_plus: u64) -> (i64, String) {
            if brutal_plus > 0 {
                let level = brutal_plus.min(6);
                return (100 + level as i64, format!("B+{level}"));
            }

            let trimmed = difficulty.trim();
            if trimmed.is_empty() {
                return (0, "Unknown".to_string());
            }

            let lower = trimmed.to_ascii_lowercase();
            if let Some(rest) = lower.strip_prefix("b+")
                && let Ok(level) = rest.trim().parse::<u64>()
            {
                let level = level.min(6);
                return (100 + level as i64, format!("B+{level}"));
            }

            let rank = if lower == "casual" {
                10
            } else if lower == "normal" {
                20
            } else if lower == "hard" {
                30
            } else if lower == "brutal" {
                40
            } else {
                5
            };

            (rank, trimmed.to_string())
        }

        let weekly_mutation_order = dictionary
            .weekly_mutations_json
            .keys()
            .enumerate()
            .map(|(index, name)| (name.clone(), index))
            .collect::<HashMap<String, usize>>();

        let schedule_statuses = WeeklyMutationManager::from_dictionary_data(dictionary)
            .ok()
            .and_then(|manager| manager.statuses_for_date(current_date).ok());
        let schedule_lookup = schedule_statuses
            .as_ref()
            .map(|statuses| {
                statuses
                    .iter()
                    .cloned()
                    .map(|status| (status.name.clone(), status))
                    .collect::<HashMap<String, WeeklyMutationStatus>>()
            })
            .unwrap_or_default();

        let mut aggregates = HashMap::<String, WeeklyAggregate>::new();
        let weekly_mutation_details = dictionary
            .weekly_mutations_json
            .iter()
            .map(|(weekly_name, weekly_data)| {
                let mutators = weekly_data
                    .mutators
                    .iter()
                    .map(|mutator| {
                        let mutator_id = ReplayAnalysisOps::canonical_mutator_id_with_dictionary(
                            mutator, dictionary,
                        );
                        let (name_en, name_ko, name_zh_cn, description_en, description_ko, description_zh_cn) = dictionary
                            .mutator_data(&mutator_id)
                            .map(|value| {
                                (
                                    ReplayAnalysisOps::decode_html_entities(&value.name.en),
                                    ReplayAnalysisOps::decode_html_entities(&value.name.ko),
                                    ReplayAnalysisOps::decode_html_entities(&value.name.zh_cn),
                                    ReplayAnalysisOps::decode_html_entities(&value.description.en),
                                    ReplayAnalysisOps::decode_html_entities(&value.description.ko),
                                    ReplayAnalysisOps::decode_html_entities(&value.description.zh_cn),
                                )
                            })
                            .unwrap_or_default();
                        let fallback_name_en =
                            ReplayAnalysisOps::mutator_display_name_en_with_dictionary(
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
                        UiMutatorRow {
                            id: mutator_id.clone(),
                            name: LocalizedText {
                                en: display_name_en,
                                ko: name_ko,
                                zh_cn: Some(name_zh_cn),
                            },
                            icon_name,
                            description: LocalizedText {
                                en: description_en,
                                ko: description_ko,
                                zh_cn: Some(description_zh_cn),
                            },
                        }
                    })
                    .collect::<Vec<_>>();
                (
                    weekly_name.clone(),
                    WeeklyMutatorUi {
                        name_en: if weekly_data.name_en.trim().is_empty() {
                            weekly_name.as_str()
                        } else {
                            weekly_data.name_en.as_str()
                        },
                        name_ko: weekly_data.name_ko.as_str(),
                        name_zh_cn: weekly_data.name_zh_cn.as_str(),
                        map: weekly_data.map.as_str(),
                        mutators,
                    },
                )
            })
            .collect::<HashMap<String, WeeklyMutatorUi<'_>>>();

        for replay in replays {
            if replay.result == "Unparsed" {
                continue;
            }
            if !replay.weekly {
                continue;
            }

            let Some(replay_wins_main) = TauriOverlayOps::result_is_victory(&replay.result) else {
                continue;
            };
            let mutation_name = replay
                .weekly_name
                .clone()
                .map(|value| TauriOverlayOps::sanitize_replay_text(&value))
                .filter(|value| !value.is_empty())
                .or_else(|| {
                    ReplayAnalysisOps::resolve_weekly_mutation_name_with_dictionary(
                        &replay.map,
                        &replay.mutators,
                        dictionary,
                    )
                    .map(|value| TauriOverlayOps::sanitize_replay_text(&value))
                    .filter(|value| !value.is_empty())
                })
                .unwrap_or_else(|| "Unknown Weekly".to_string());
            let aggregate = aggregates.entry(mutation_name).or_default();
            if replay_wins_main {
                aggregate.wins = aggregate.wins.saturating_add(1);
            } else {
                aggregate.losses = aggregate.losses.saturating_add(1);
            }

            let (difficulty_rank, difficulty_label) = weekly_difficulty_rank_and_label(
                &TauriOverlayOps::sanitize_replay_text(&replay.difficulty),
                replay.brutal_plus,
            );
            if difficulty_rank > aggregate.best_difficulty_rank {
                aggregate.best_difficulty_rank = difficulty_rank;
                aggregate.best_difficulty_label = difficulty_label;
            }
        }

        let mut rows = Vec::new();
        for mutation in dictionary.weekly_mutations_json.keys() {
            let aggregate = aggregates.remove(mutation).unwrap_or_default();
            let total = aggregate.wins + aggregate.losses;
            let weekly_details = weekly_mutation_details.get(mutation);
            let mutation_order = weekly_mutation_order
                .get(mutation)
                .copied()
                .unwrap_or(usize::MAX);
            let schedule_status = schedule_lookup.get(mutation);
            let is_current = schedule_status
                .map(|status| status.is_current)
                .unwrap_or(false);
            let next_duration_days = schedule_status
                .map(|status| status.next_duration_days)
                .unwrap_or(i64::MAX);
            rows.push(WeeklyRowPayload {
                mutation: mutation.clone(),
                name_en: weekly_details
                    .map(|value| value.name_en.to_string())
                    .unwrap_or_else(|| mutation.clone()),
                name_ko: weekly_details
                    .map(|value| value.name_ko.to_string())
                    .unwrap_or_default(),
                name_zh_cn: weekly_details.map(|value| value.name_zh_cn.to_string()),
                map: weekly_details
                    .map(|value| value.map.to_string())
                    .unwrap_or_default(),
                mutators: weekly_details
                    .map(|value| value.mutators.clone())
                    .unwrap_or_default(),
                mutation_order,
                is_current,
                next_duration_days,
                next_duration: if next_duration_days == i64::MAX {
                    "Unknown".to_string()
                } else {
                    Self::format_next_weekly_duration(next_duration_days)
                },
                difficulty: if aggregate.best_difficulty_label.is_empty() {
                    "N/A".to_string()
                } else {
                    aggregate.best_difficulty_label.clone()
                },
                wins: aggregate.wins,
                losses: aggregate.losses,
                winrate: if total == 0 {
                    0.0
                } else {
                    aggregate.wins as f64 / total as f64
                },
            });
        }

        for (mutation, aggregate) in aggregates {
            let total = aggregate.wins + aggregate.losses;
            rows.push(WeeklyRowPayload {
                mutation: mutation.clone(),
                name_en: mutation,
                name_ko: String::new(),
                name_zh_cn: None,
                map: String::new(),
                mutators: Vec::new(),
                mutation_order: usize::MAX,
                is_current: false,
                next_duration_days: i64::MAX,
                next_duration: "Unknown".to_string(),
                difficulty: if aggregate.best_difficulty_label.is_empty() {
                    "N/A".to_string()
                } else {
                    aggregate.best_difficulty_label
                },
                wins: aggregate.wins,
                losses: aggregate.losses,
                winrate: if total == 0 {
                    0.0
                } else {
                    aggregate.wins as f64 / total as f64
                },
            });
        }

        rows.sort_by(|left, right| {
            let left_is_current = left.is_current;
            let right_is_current = right.is_current;
            let left_order = left.mutation_order;
            let right_order = right.mutation_order;
            right_is_current
                .cmp(&left_is_current)
                .then_with(|| left_order.cmp(&right_order))
                .then_with(|| left.mutation.cmp(&right.mutation))
        });

        rows
    }
}
