use std::borrow::Borrow;
use std::collections::{HashMap, HashSet};
use std::time::Instant;

use s2coop_analyzer::dictionary_data::Sc2DictionaryData;
use serde::Serialize;
use serde_json::{Map, Value};

use crate::shared_types::LocalizedLabels;
use crate::stats_aggregation::{
    StatsAggregateAnalysisPayload, StatsAggregateDifficultyDataRow,
    StatsAggregateFastestMapDetails, StatsAggregateMapDataRow, StatsAggregatePlayerDataRow,
    StatsAggregateRegionDataRow, StatsAggregationOps, StatsCommanderAggregate,
    StatsCommanderDataInput, StatsCommanderPlayerRecord, StatsCommanderTotals, StatsMapAggregate,
    StatsPlayerAggregate, StatsPlayerRecord, StatsPlayerSnapshot, StatsRegionAggregate,
    StatsReplaySnapshot, StatsResultSummary, StatsWinLossAggregate,
};
use crate::{ReplayInfo, StatsSnapshot, TauriOverlayOps};

use super::{FastestMapPlayerInput, ReplayAnalysis, ReplayAnalysisOps};

impl ReplayAnalysis {
    pub fn rebuild_analysis_payload<R>(replays: &[R], include_detailed: bool) -> Value
    where
        R: Borrow<ReplayInfo>,
    {
        let (main_names, main_handles) = ReplayAnalysisOps::default_main_identity();
        Self::rebuild_analysis_payload_with_identity(
            replays,
            include_detailed,
            &main_names,
            &main_handles,
        )
    }

    pub fn rebuild_analysis_payload_with_identity<R>(
        replays: &[R],
        include_detailed: bool,
        main_names: &HashSet<String>,
        main_handles: &HashSet<String>,
    ) -> Value
    where
        R: Borrow<ReplayInfo>,
    {
        let dictionary = Sc2DictionaryData::default();
        Self::rebuild_analysis_payload_with_dictionary(
            replays,
            include_detailed,
            main_names,
            main_handles,
            &dictionary,
        )
    }

    pub fn rebuild_analysis_payload_with_dictionary<R>(
        replays: &[R],
        include_detailed: bool,
        main_names: &HashSet<String>,
        main_handles: &HashSet<String>,
        dictionary: &Sc2DictionaryData,
    ) -> Value
    where
        R: Borrow<ReplayInfo>,
    {
        #[derive(Serialize)]
        struct RebuildAnalysisPayload {
            analysis: Value,
            prestige_names: std::collections::BTreeMap<String, LocalizedLabels>,
        }

        let started_at = Instant::now();
        crate::sco_debug!(
            "[SCO/stats] rebuild_analysis_payload start include_detailed={} replays={}",
            include_detailed,
            replays.len()
        );

        let mut map_values: std::collections::BTreeMap<String, StatsMapAggregate> =
            std::collections::BTreeMap::new();
        let mut main_commander: std::collections::BTreeMap<String, StatsCommanderAggregate> =
            std::collections::BTreeMap::new();
        let mut ally_commander: std::collections::BTreeMap<String, StatsCommanderAggregate> =
            std::collections::BTreeMap::new();
        let mut region_values: std::collections::BTreeMap<String, StatsRegionAggregate> =
            std::collections::BTreeMap::new();
        let mut difficulty_values: std::collections::BTreeMap<String, StatsWinLossAggregate> =
            std::collections::BTreeMap::new();
        let mut player_values: std::collections::BTreeMap<String, StatsPlayerAggregate> =
            std::collections::BTreeMap::new();

        let mut invalid_result = 0u64;
        let mut sum_main = StatsCommanderTotals::default();
        let mut sum_ally = StatsCommanderTotals::default();

        let total_scanned = replays.len() as u64;
        let has_known_main_handles = !main_handles.is_empty();
        let mut considered_games = 0u64;
        for replay in replays.iter().map(Borrow::borrow) {
            if replay.result == "Unparsed" {
                continue;
            }
            let Some(map_key) = dictionary.canonicalize_coop_map_id(&replay.map) else {
                continue;
            };
            let main_player_name = TauriOverlayOps::sanitize_replay_text(&replay.main().name);
            let ally_player_name = TauriOverlayOps::sanitize_replay_text(&replay.ally().name);
            let main_commander_text =
                TauriOverlayOps::sanitize_replay_text(replay.main_commander());
            let ally_commander_text =
                TauriOverlayOps::sanitize_replay_text(replay.ally_commander());
            let map_bonus_total = replay.bonus_total.or_else(|| {
                ReplayAnalysisOps::bonus_objective_total_for_map_id_with_dictionary(
                    &map_key, dictionary,
                )
            });

            let replay_is_victory = match TauriOverlayOps::result_is_victory(&replay.result) {
                Some(result) => result,
                None => {
                    invalid_result += 1;
                    if invalid_result <= 5 {
                        crate::sco_warn!(
                            "[SCO/stats] unrecognized result for {:?}: {}",
                            replay.file,
                            replay.result
                        );
                    }
                    continue;
                }
            };

            let main_kill_fraction =
                TauriOverlayOps::kill_fraction(replay.main_kills(), replay.ally_kills());
            let ally_kill_fraction = 1.0 - main_kill_fraction;
            let main_commander_name =
                TauriOverlayOps::normalized_commander_name(&main_commander_text, &main_player_name);
            let ally_commander_name =
                TauriOverlayOps::normalized_commander_name(&ally_commander_text, &ally_player_name);

            if main_commander_name.is_empty() || ally_commander_name.is_empty() {
                invalid_result += 1;
                continue;
            }
            considered_games += 1;

            let map_snapshot = StatsReplaySnapshot {
                replay_id: 0,
                file: replay.file.clone(),
                map_name: replay.map.clone(),
                result: replay.result.clone(),
                difficulty: replay.difficulty.clone(),
                enemy_race: replay.enemy.clone(),
                date_seconds: replay.date,
                detailed_analysis: replay.is_detailed,
                brutal_plus: replay.brutal_plus,
                extension: replay.extension,
                length_realtime: replay.accurate_length,
                bonus_completed: replay.bonus.len() as u64,
                main: StatsPlayerSnapshot {
                    name: replay.main().name.clone(),
                    handle: replay.main().handle.clone(),
                    commander: main_commander_name.clone(),
                    apm: replay.main_apm(),
                    kills: replay.main_kills(),
                    commander_level: replay.main_commander_level(),
                    mastery_level: replay.main_mastery_level(),
                    prestige: replay.main_prestige(),
                    masteries: replay.main_masteries().to_vec(),
                },
                ally: StatsPlayerSnapshot {
                    name: replay.ally().name.clone(),
                    handle: replay.ally().handle.clone(),
                    commander: ally_commander_name.clone(),
                    apm: replay.ally_apm(),
                    kills: replay.ally_kills(),
                    commander_level: replay.ally_commander_level(),
                    mastery_level: replay.ally_mastery_level(),
                    prestige: replay.ally_prestige(),
                    masteries: replay.ally_masteries().to_vec(),
                },
            };
            map_values.entry(map_key).or_default().record_snapshot(
                &map_snapshot,
                replay_is_victory,
                map_bonus_total,
                false,
            );

            let normalized_p1_handle = Self::normalized_handle_key(&replay.main().handle);
            let normalized_p2_handle = Self::normalized_handle_key(&replay.ally().handle);
            let mut p1_is_main = if has_known_main_handles {
                !normalized_p1_handle.is_empty() && main_handles.contains(&normalized_p1_handle)
            } else {
                true
            };
            let p2_is_main = if has_known_main_handles {
                !normalized_p2_handle.is_empty() && main_handles.contains(&normalized_p2_handle)
            } else {
                false
            };
            if has_known_main_handles && !p1_is_main && !p2_is_main {
                p1_is_main = true;
            }

            let region = if p1_is_main {
                TauriOverlayOps::infer_region_from_handle(&replay.main().handle)
            } else if p2_is_main {
                TauriOverlayOps::infer_region_from_handle(&replay.ally().handle)
            } else {
                TauriOverlayOps::infer_region_from_handle(&replay.main().handle)
                    .or_else(|| TauriOverlayOps::infer_region_from_handle(&replay.ally().handle))
            }
            .unwrap_or_else(|| "Unknown".to_string());
            let replay_difficulty = replay.difficulty.trim();
            let difficulty = if replay.brutal_plus > 0 {
                let level = u8::try_from(replay.brutal_plus).unwrap_or(0).clamp(1, 6);
                format!("B+{}", level)
            } else if replay_difficulty.eq_ignore_ascii_case("Brutal+") {
                "Brutal+".to_string()
            } else if replay_difficulty.is_empty() {
                "Unknown".to_string()
            } else {
                replay_difficulty.to_string()
            };
            let region_entry = region_values.entry(region).or_default();
            region_entry.record_result(replay_is_victory);
            if p1_is_main {
                region_entry.record_player(
                    replay.main_mastery_level(),
                    replay.main_commander_level(),
                    &main_commander_text,
                    &main_commander_name,
                    replay.main_prestige(),
                );
            }
            if p2_is_main {
                region_entry.record_player(
                    replay.ally_mastery_level(),
                    replay.ally_commander_level(),
                    &ally_commander_text,
                    &ally_commander_name,
                    replay.ally_prestige(),
                );
            }

            if !difficulty.contains('/') {
                difficulty_values
                    .entry(difficulty)
                    .or_default()
                    .record_result(replay_is_victory);
            }

            let include_prestige = ReplayAnalysisOps::should_count_prestige(replay.date);
            let main_commander_record = StatsCommanderPlayerRecord::new(
                replay_is_victory,
                replay.is_detailed,
                replay.main_apm(),
                main_kill_fraction,
                replay.main_prestige(),
                replay.main_masteries(),
                include_prestige,
            );
            let ally_commander_record = StatsCommanderPlayerRecord::new(
                replay_is_victory,
                replay.is_detailed,
                replay.ally_apm(),
                ally_kill_fraction,
                replay.ally_prestige(),
                replay.ally_masteries(),
                include_prestige,
            );
            main_commander
                .entry(main_commander_name.clone())
                .or_default()
                .record_player(main_commander_record);
            ally_commander
                .entry(ally_commander_name.clone())
                .or_default()
                .record_player(ally_commander_record);
            sum_main.record_player(main_commander_record);
            sum_ally.record_player(ally_commander_record);

            if !main_player_name.is_empty() {
                let p1 = player_values.entry(main_player_name).or_default();
                let main_player_handle =
                    TauriOverlayOps::sanitize_replay_text(&replay.main().handle);
                p1.record_replay(StatsPlayerRecord::new(
                    &replay.main().name,
                    &main_player_handle,
                    &main_commander_text,
                    replay_is_victory,
                    replay.main_apm(),
                    main_kill_fraction,
                    replay.date,
                ));
            }

            if !ally_player_name.is_empty() {
                let p2 = player_values.entry(ally_player_name).or_default();
                let ally_player_handle =
                    TauriOverlayOps::sanitize_replay_text(&replay.ally().handle);
                p2.record_replay(StatsPlayerRecord::new(
                    &replay.ally().name,
                    &ally_player_handle,
                    &ally_commander_text,
                    replay_is_victory,
                    replay.ally_apm(),
                    ally_kill_fraction,
                    replay.date,
                ));
            }
        }

        let total_games = considered_games;
        if total_games == 0 {
            crate::sco_debug!(
                "[SCO/stats] aggregate stage filtered all replays; scanned={} invalid_result={}",
                total_scanned,
                invalid_result
            );
        }

        let map_count = map_values.len();
        let main_commander_count = main_commander.len();
        let ally_commander_count = ally_commander.len();
        let region_count = region_values.len();
        let difficulty_count = difficulty_values.len();
        let player_count = player_values.len();
        crate::sco_debug!(
            "[SCO/stats] aggregate stage done in {}ms (maps={} commanders={} allies={} regions={} diffs={} players={})",
            started_at.elapsed().as_millis(),
            map_count,
            main_commander_count,
            ally_commander_count,
            region_count,
            difficulty_count,
            player_count
        );

        let mut map_data = Map::new();
        let map_started_at = Instant::now();
        for (map_id, aggregate) in map_values {
            let map_name = dictionary
                .coop_map_id_to_english(&map_id)
                .unwrap_or_else(|| map_id.clone());
            let games = aggregate.games();
            let winrate = TauriOverlayOps::ratio(aggregate.wins(), games);
            let fastest = aggregate.fastest_or_default();
            let fastest_length = if fastest.length_realtime.is_finite() {
                fastest.length_realtime
            } else {
                999_999.0
            };
            let fastest_p1 = ReplayAnalysisOps::fastest_map_player_value_with_dictionary(
                FastestMapPlayerInput {
                    name: &fastest.main.name,
                    handle: &fastest.main.handle,
                    commander: &fastest.main.commander,
                    apm: fastest.main.apm,
                    mastery_level: fastest.main.mastery_level,
                    masteries: &fastest.main.masteries,
                    prestige: fastest.main.prestige,
                },
                dictionary,
            );
            let fastest_p2 = ReplayAnalysisOps::fastest_map_player_value_with_dictionary(
                FastestMapPlayerInput {
                    name: &fastest.ally.name,
                    handle: &fastest.ally.handle,
                    commander: &fastest.ally.commander,
                    apm: fastest.ally.apm,
                    mastery_level: fastest.ally.mastery_level,
                    masteries: &fastest.ally.masteries,
                    prestige: fastest.ally.prestige,
                },
                dictionary,
            );
            let p1_is_main = ReplayAnalysis::is_main_player_identity(
                &fastest.main.name,
                &fastest.main.handle,
                main_names,
                main_handles,
            );
            let p2_is_main = ReplayAnalysis::is_main_player_identity(
                &fastest.ally.name,
                &fastest.ally.handle,
                main_names,
                main_handles,
            );
            let players = if p2_is_main && !p1_is_main {
                vec![fastest_p2, fastest_p1]
            } else {
                vec![fastest_p1, fastest_p2]
            };
            map_data.insert(
                map_name,
                ReplayAnalysisOps::report_value(&StatsAggregateMapDataRow::new(
                    map_id,
                    aggregate.average_victory_time(),
                    TauriOverlayOps::ratio(games, total_games),
                    StatsResultSummary::new(aggregate.wins(), aggregate.losses(), winrate),
                    aggregate.bonus_rate(),
                    aggregate.detailed_count(),
                    StatsAggregateFastestMapDetails::new(
                        fastest_length,
                        fastest.file,
                        fastest.date_seconds,
                        TauriOverlayOps::sanitize_replay_text(&fastest.difficulty),
                        players,
                        TauriOverlayOps::sanitize_replay_text(&fastest.enemy_race),
                    ),
                )),
            );
        }
        crate::sco_debug!(
            "[SCO/stats] map_data stage done in {}ms (rows={})",
            map_started_at.elapsed().as_millis(),
            map_data.len()
        );

        let commander_started_at = Instant::now();
        let commander_data = StatsAggregationOps::build_commander_data(
            StatsCommanderDataInput::new(&main_commander, total_games, &sum_main, None),
        );
        crate::sco_debug!(
            "[SCO/stats] commander_data stage done in {}ms (rows={})",
            commander_started_at.elapsed().as_millis(),
            commander_data.len()
        );

        let main_commander_frequency = main_commander
            .iter()
            .map(|(name, aggregate)| {
                let games = aggregate.games();
                (
                    name.clone(),
                    if sum_main.games() == 0 {
                        0.0
                    } else {
                        games as f64 / sum_main.games() as f64
                    },
                )
            })
            .collect::<HashMap<_, _>>();
        let ally_started_at = Instant::now();
        let ally_commander_data =
            StatsAggregationOps::build_commander_data(StatsCommanderDataInput::new(
                &ally_commander,
                total_games,
                &sum_ally,
                Some(&main_commander_frequency),
            ));
        crate::sco_debug!(
            "[SCO/stats] ally_commander_data stage done in {}ms (rows={})",
            ally_started_at.elapsed().as_millis(),
            ally_commander_data.len()
        );

        let mut difficulty_data = Map::new();
        let difficulty_started_at = Instant::now();
        for (name, agg) in difficulty_values {
            let games = agg.games();
            difficulty_data.insert(
                name,
                ReplayAnalysisOps::report_value(&StatsAggregateDifficultyDataRow::new(
                    StatsResultSummary::new(
                        agg.wins(),
                        agg.losses(),
                        TauriOverlayOps::ratio(agg.wins(), games),
                    ),
                )),
            );
        }
        crate::sco_debug!(
            "[SCO/stats] difficulty_data stage done in {}ms (rows={})",
            difficulty_started_at.elapsed().as_millis(),
            difficulty_data.len()
        );

        let mut region_data = Map::new();
        let region_started_at = Instant::now();
        for (name, agg) in region_values {
            let games = agg.games();
            let mut max_com: Vec<String> = agg
                .max_com()
                .iter()
                .map(|value| TauriOverlayOps::sanitize_replay_text(value))
                .filter(|value| !value.is_empty())
                .collect();
            max_com.sort();
            max_com.dedup();
            let prestiges = agg
                .prestiges()
                .iter()
                .filter_map(|(commander, value)| {
                    let commander = TauriOverlayOps::sanitize_replay_text(commander);
                    if commander.is_empty() {
                        None
                    } else {
                        Some((commander, Value::from(*value)))
                    }
                })
                .collect::<Map<String, Value>>();
            region_data.insert(
                name,
                ReplayAnalysisOps::report_value(&StatsAggregateRegionDataRow::new(
                    TauriOverlayOps::ratio(games, total_games),
                    StatsResultSummary::new(
                        agg.wins(),
                        agg.losses(),
                        TauriOverlayOps::ratio(agg.wins(), games),
                    ),
                    agg.max_asc(),
                    prestiges,
                    max_com,
                )),
            );
        }
        crate::sco_debug!(
            "[SCO/stats] region_data stage done in {}ms (rows={})",
            region_started_at.elapsed().as_millis(),
            region_data.len()
        );

        let mut player_data = Map::new();
        let player_started_at = Instant::now();
        for (name, agg) in &player_values {
            let name = TauriOverlayOps::sanitize_replay_text(name);
            let games = agg.games();
            let (commander, commander_frequency) = agg.dominant_commander();
            player_data.insert(
                name,
                ReplayAnalysisOps::report_value(&StatsAggregatePlayerDataRow::new(
                    StatsResultSummary::new(
                        agg.wins(),
                        agg.losses(),
                        TauriOverlayOps::ratio(agg.wins(), games),
                    ),
                    TauriOverlayOps::median_f64(agg.kill_fractions()),
                    if games == 0 {
                        0.0
                    } else {
                        TauriOverlayOps::median_u64(agg.apm_values())
                    },
                    commander_frequency,
                    agg.last_seen(),
                    TauriOverlayOps::sanitize_replay_text(&commander),
                )),
            );
        }
        crate::sco_debug!(
            "[SCO/stats] player_data stage done in {}ms (rows={})",
            player_started_at.elapsed().as_millis(),
            player_data.len()
        );

        let prestige_names = dictionary.prestige_names_json.clone();

        let unit_data = if include_detailed {
            ReplayAnalysisOps::build_unit_data_from_replays_with_dictionary(
                replays,
                main_handles,
                dictionary,
            )
        } else {
            Value::Null
        };
        let analysis =
            ReplayAnalysisOps::report_value(&StatsAggregateAnalysisPayload::new_ready_map_data(
                map_data,
                commander_data,
                ally_commander_data,
                difficulty_data,
                region_data,
                player_data,
                unit_data,
            ));

        crate::sco_debug!(
            "[SCO/stats] rebuild_analysis_payload completed in {}ms",
            started_at.elapsed().as_millis()
        );
        ReplayAnalysisOps::report_value(&RebuildAnalysisPayload {
            analysis,
            prestige_names: prestige_names
                .iter()
                .map(|(key, value)| {
                    (
                        key.clone(),
                        LocalizedLabels {
                            en: value.en.clone(),
                            ko: value.ko.clone(),
                            zh_cn: Some(value.zh_cn.clone()),
                        },
                    )
                })
                .collect(),
        })
    }

    pub fn build_rebuild_snapshot(replays: &[ReplayInfo], include_detailed: bool) -> StatsSnapshot {
        let (main_names, main_handles) = ReplayAnalysisOps::default_main_identity();
        Self::build_rebuild_snapshot_with_identity(
            replays,
            include_detailed,
            &main_names,
            &main_handles,
        )
    }

    pub fn build_rebuild_snapshot_with_identity(
        replays: &[ReplayInfo],
        include_detailed: bool,
        main_names: &HashSet<String>,
        main_handles: &HashSet<String>,
    ) -> StatsSnapshot {
        let dictionary = Sc2DictionaryData::default();
        Self::build_rebuild_snapshot_with_dictionary(
            replays,
            include_detailed,
            main_names,
            main_handles,
            &dictionary,
        )
    }

    pub fn build_rebuild_snapshot_with_dictionary(
        replays: &[ReplayInfo],
        include_detailed: bool,
        main_names: &HashSet<String>,
        main_handles: &HashSet<String>,
        dictionary: &Sc2DictionaryData,
    ) -> StatsSnapshot {
        let started_at = Instant::now();
        crate::sco_debug!(
            "[SCO/stats] rebuild_state_from_replays start mode={} replays={}",
            if include_detailed {
                "detailed"
            } else {
                "simple"
            },
            replays.len()
        );
        let replay_count = replays
            .iter()
            .filter(|replay| {
                replay.result != "Unparsed"
                    && dictionary.canonicalize_coop_map_id(&replay.map).is_some()
            })
            .count();
        let payload = Self::rebuild_analysis_payload_with_dictionary(
            replays,
            include_detailed,
            main_names,
            main_handles,
            dictionary,
        );
        let analysis = payload
            .get("analysis")
            .cloned()
            .unwrap_or_else(TauriOverlayOps::empty_stats_payload);
        let (main_players, main_handles) =
            ReplayAnalysisOps::collect_main_identity_lists_with_dictionary(
                replays,
                main_names,
                main_handles,
                dictionary,
            );
        crate::sco_debug!(
            "[SCO/stats] rebuild_state_from_replays extracted {} main identities",
            main_players.len().max(main_handles.len())
        );

        let message = if replay_count == 0 {
            "No replay files found.".to_string()
        } else {
            format!("Scanned {replay_count} replay file(s).")
        };
        crate::sco_debug!(
            "[SCO/stats] rebuild_state_from_replays end mode={} ready={} games={} duration={}ms",
            if include_detailed {
                "detailed"
            } else {
                "simple"
            },
            true,
            replay_count,
            started_at.elapsed().as_millis()
        );

        StatsSnapshot::new(
            true,
            replay_count as u64,
            main_players,
            main_handles,
            analysis,
            payload
                .get("prestige_names")
                .cloned()
                .map(serde_json::from_value)
                .transpose()
                .unwrap_or_default()
                .unwrap_or_default(),
            message,
        )
    }
}
