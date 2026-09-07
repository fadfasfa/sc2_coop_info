use super::*;

impl ReplayCacheDatabase {
    pub(super) fn statistics_payload_from_snapshots(
        &self,
        snapshots: Vec<StatsReplaySnapshot>,
        include_detailed: bool,
        main_names: &HashSet<String>,
        main_handles: &HashSet<String>,
        dictionary: &Sc2DictionaryData,
    ) -> Result<ReplayCacheStatisticsPayload, ReplayCacheDbError> {
        let total_started_at = Instant::now();
        let aggregate_started_at = Instant::now();
        let snapshot_count = snapshots.len();
        let mut map_values = BTreeMap::<String, StatsMapAggregate>::new();
        let mut main_commander = BTreeMap::<String, StatsCommanderAggregate>::new();
        let mut ally_commander = BTreeMap::<String, StatsCommanderAggregate>::new();
        let mut region_values = BTreeMap::<String, StatsRegionAggregate>::new();
        let mut difficulty_values = BTreeMap::<String, StatsWinLossAggregate>::new();
        let mut player_values = BTreeMap::<String, StatsPlayerAggregate>::new();
        let mut valid_snapshots = Vec::new();
        let mut main_players = BTreeSet::new();
        let mut main_player_handles = BTreeSet::new();

        let mut sum_main = StatsCommanderTotals::default();
        let mut sum_ally = StatsCommanderTotals::default();

        let has_known_main_identity = !main_names.is_empty() || !main_handles.is_empty();
        let has_known_main_handles = !main_handles.is_empty();
        for snapshot in snapshots {
            let Some(map_id) = dictionary.canonicalize_coop_map_id(&snapshot.map_name) else {
                continue;
            };
            let Some(replay_is_victory) =
                ReplayCacheStatisticsLoadOps::result_is_victory(&snapshot.result)
            else {
                continue;
            };
            let main_name = ReplayCacheStatisticsLoadOps::sanitize_replay_text(&snapshot.main.name);
            let ally_name = ReplayCacheStatisticsLoadOps::sanitize_replay_text(&snapshot.ally.name);
            let main_commander_text =
                ReplayCacheStatisticsLoadOps::sanitize_replay_text(&snapshot.main.commander);
            let ally_commander_text =
                ReplayCacheStatisticsLoadOps::sanitize_replay_text(&snapshot.ally.commander);
            let main_commander_name =
                ReplayCacheStatisticsLoadOps::normalized_commander_name(&main_commander_text);
            let ally_commander_name =
                ReplayCacheStatisticsLoadOps::normalized_commander_name(&ally_commander_text);
            if main_commander_name.is_empty() || ally_commander_name.is_empty() {
                continue;
            }

            let p1_is_main_identity = Self::stats_player_is_main(
                &snapshot.main,
                main_names,
                main_handles,
                has_known_main_identity,
                true,
            );
            let p2_is_main_identity = Self::stats_player_is_main(
                &snapshot.ally,
                main_names,
                main_handles,
                has_known_main_identity,
                false,
            );
            if p1_is_main_identity {
                if !snapshot.main.name.trim().is_empty() {
                    main_players.insert(snapshot.main.name.trim().to_string());
                }
                if !snapshot.main.handle.trim().is_empty() {
                    main_player_handles.insert(snapshot.main.handle.trim().to_string());
                }
            }
            if p2_is_main_identity {
                if !snapshot.ally.name.trim().is_empty() {
                    main_players.insert(snapshot.ally.name.trim().to_string());
                }
                if !snapshot.ally.handle.trim().is_empty() {
                    main_player_handles.insert(snapshot.ally.handle.trim().to_string());
                }
            }

            let main_kill_fraction = ReplayCacheStatisticsLoadOps::kill_fraction(
                snapshot.main.kills,
                snapshot.ally.kills,
            );
            let ally_kill_fraction = 1.0 - main_kill_fraction;
            let include_prestige =
                StatsAggregationOps::should_count_prestige(snapshot.date_seconds);

            let map_bonus_total = if replay_is_victory && snapshot.detailed_analysis {
                dictionary
                    .coop_map_id_to_english(&map_id)
                    .as_deref()
                    .and_then(|name| {
                        crate::replay_analysis::ReplayAnalysisOps::bonus_objective_total_for_canonical_map_with_dictionary(name, dictionary)
                    })
            } else {
                None
            };
            map_values
                .entry(map_id.clone())
                .or_default()
                .record_snapshot(&snapshot, replay_is_victory, map_bonus_total, true);

            let (main_is_region_main, ally_is_region_main) =
                Self::stats_region_main_flags(&snapshot, has_known_main_handles, main_handles);
            let region = Self::stats_region_for_snapshot(
                &snapshot,
                has_known_main_handles,
                main_is_region_main,
                ally_is_region_main,
            );
            let region_entry = region_values.entry(region).or_default();
            region_entry.record_result(replay_is_victory);
            if main_is_region_main {
                region_entry.record_player(
                    snapshot.main.mastery_level,
                    snapshot.main.commander_level,
                    &main_commander_text,
                    &main_commander_name,
                    snapshot.main.prestige,
                );
            }
            if ally_is_region_main {
                region_entry.record_player(
                    snapshot.ally.mastery_level,
                    snapshot.ally.commander_level,
                    &ally_commander_text,
                    &ally_commander_name,
                    snapshot.ally.prestige,
                );
            }

            let difficulty = Self::stats_difficulty_label(&snapshot);
            if !difficulty.contains('/') {
                difficulty_values
                    .entry(difficulty)
                    .or_default()
                    .record_result(replay_is_victory);
            }

            let main_commander_record = StatsCommanderPlayerRecord::new(
                replay_is_victory,
                snapshot.detailed_analysis,
                snapshot.main.apm,
                main_kill_fraction,
                snapshot.main.prestige,
                &snapshot.main.masteries,
                include_prestige,
            );
            let ally_commander_record = StatsCommanderPlayerRecord::new(
                replay_is_victory,
                snapshot.detailed_analysis,
                snapshot.ally.apm,
                ally_kill_fraction,
                snapshot.ally.prestige,
                &snapshot.ally.masteries,
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

            if !main_name.is_empty() {
                let main_handle =
                    ReplayCacheStatisticsLoadOps::sanitize_replay_text(&snapshot.main.handle);
                player_values
                    .entry(main_name)
                    .or_default()
                    .record_replay(StatsPlayerRecord::new(
                        &snapshot.main.name,
                        &main_handle,
                        &snapshot.main.commander,
                        replay_is_victory,
                        snapshot.main.apm,
                        main_kill_fraction,
                        snapshot.date_seconds,
                    ));
            }
            if !ally_name.is_empty() {
                let ally_handle =
                    ReplayCacheStatisticsLoadOps::sanitize_replay_text(&snapshot.ally.handle);
                player_values
                    .entry(ally_name)
                    .or_default()
                    .record_replay(StatsPlayerRecord::new(
                        &snapshot.ally.name,
                        &ally_handle,
                        &snapshot.ally.commander,
                        replay_is_victory,
                        snapshot.ally.apm,
                        ally_kill_fraction,
                        snapshot.date_seconds,
                    ));
            }

            valid_snapshots.push(snapshot);
        }

        let total_games = valid_snapshots.len() as u64;
        let detailed_parsed_count = valid_snapshots
            .iter()
            .filter(|snapshot| snapshot.detailed_analysis)
            .count() as u64;
        crate::sco_debug!(
            "[SCO/stats/e2e/backend] stage=aggregate_snapshots rows_in={} valid={} detailed={} elapsed_ms={:.3}",
            snapshot_count,
            total_games,
            detailed_parsed_count,
            ReplayCacheStatisticsLoadOps::elapsed_ms(aggregate_started_at)
        );

        let map_started_at = Instant::now();
        let mut map_data = Map::new();
        for (map_id, aggregate) in map_values {
            let map_name = dictionary
                .coop_map_id_to_english(&map_id)
                .unwrap_or_else(|| map_id.clone());
            let games = aggregate.games();
            let fastest = aggregate.fastest_or_default();
            let fastest_players =
                Self::fastest_players_value(&fastest, main_names, main_handles, dictionary);
            map_data.insert(
                map_name,
                ReplayCacheStatisticsLoadOps::to_value(&StatsAggregateMapDataRow::new(
                    map_id,
                    aggregate.average_victory_time(),
                    StatsAggregationOps::ratio(games, total_games),
                    StatsResultSummary::new(
                        aggregate.wins(),
                        aggregate.losses(),
                        StatsAggregationOps::ratio(aggregate.wins(), games),
                    ),
                    aggregate.bonus_rate(),
                    aggregate.detailed_count(),
                    StatsAggregateFastestMapDetails::new(
                        fastest.length_realtime,
                        fastest.file,
                        fastest.date_seconds,
                        ReplayCacheStatisticsLoadOps::sanitize_replay_text(&fastest.difficulty),
                        fastest_players,
                        ReplayCacheStatisticsLoadOps::sanitize_replay_text(&fastest.enemy_race),
                    ),
                )),
            );
        }
        crate::sco_debug!(
            "[SCO/stats/e2e/backend] stage=map_data rows={} elapsed_ms={:.3}",
            map_data.len(),
            ReplayCacheStatisticsLoadOps::elapsed_ms(map_started_at)
        );

        let commander_started_at = Instant::now();
        let commander_data = StatsAggregationOps::build_commander_data(
            StatsCommanderDataInput::new(&main_commander, total_games, &sum_main, None),
        );
        crate::sco_debug!(
            "[SCO/stats/e2e/backend] stage=commander_data rows={} elapsed_ms={:.3}",
            commander_data.len(),
            ReplayCacheStatisticsLoadOps::elapsed_ms(commander_started_at)
        );
        let main_frequency = main_commander
            .iter()
            .map(|(commander, aggregate)| {
                let games = aggregate.games();
                (
                    commander.clone(),
                    StatsAggregationOps::ratio(games, sum_main.games()),
                )
            })
            .collect::<HashMap<_, _>>();
        let ally_commander_started_at = Instant::now();
        let ally_commander_data =
            StatsAggregationOps::build_commander_data(StatsCommanderDataInput::new(
                &ally_commander,
                total_games,
                &sum_ally,
                Some(&main_frequency),
            ));
        crate::sco_debug!(
            "[SCO/stats/e2e/backend] stage=ally_commander_data rows={} elapsed_ms={:.3}",
            ally_commander_data.len(),
            ReplayCacheStatisticsLoadOps::elapsed_ms(ally_commander_started_at)
        );

        let difficulty_started_at = Instant::now();
        let difficulty_data = difficulty_values
            .into_iter()
            .map(|(difficulty, aggregate)| {
                let games = aggregate.games();
                (
                    difficulty,
                    ReplayCacheStatisticsLoadOps::to_value(&StatsAggregateDifficultyDataRow::new(
                        StatsResultSummary::new(
                            aggregate.wins(),
                            aggregate.losses(),
                            StatsAggregationOps::ratio(aggregate.wins(), games),
                        ),
                    )),
                )
            })
            .collect::<Map<String, Value>>();
        crate::sco_debug!(
            "[SCO/stats/e2e/backend] stage=difficulty_data rows={} elapsed_ms={:.3}",
            difficulty_data.len(),
            ReplayCacheStatisticsLoadOps::elapsed_ms(difficulty_started_at)
        );

        let region_started_at = Instant::now();
        let region_data = region_values
            .into_iter()
            .map(|(region, aggregate)| {
                let games = aggregate.games();
                let prestiges = aggregate
                    .prestiges()
                    .iter()
                    .map(|(commander, prestige)| (commander.clone(), Value::from(*prestige)))
                    .collect::<Map<String, Value>>();
                (
                    region,
                    ReplayCacheStatisticsLoadOps::to_value(&StatsAggregateRegionDataRow::new(
                        StatsAggregationOps::ratio(games, total_games),
                        StatsResultSummary::new(
                            aggregate.wins(),
                            aggregate.losses(),
                            StatsAggregationOps::ratio(aggregate.wins(), games),
                        ),
                        aggregate.max_asc(),
                        prestiges,
                        aggregate.max_com().iter().cloned().collect(),
                    )),
                )
            })
            .collect::<Map<String, Value>>();
        crate::sco_debug!(
            "[SCO/stats/e2e/backend] stage=region_data rows={} elapsed_ms={:.3}",
            region_data.len(),
            ReplayCacheStatisticsLoadOps::elapsed_ms(region_started_at)
        );

        let player_started_at = Instant::now();
        let player_data = player_values
            .into_iter()
            .map(|(name, aggregate)| {
                let games = aggregate.games();
                let (commander, frequency) = aggregate.dominant_commander();
                (
                    ReplayCacheStatisticsLoadOps::sanitize_replay_text(&name),
                    ReplayCacheStatisticsLoadOps::to_value(&StatsAggregatePlayerDataRow::new(
                        StatsResultSummary::new(
                            aggregate.wins(),
                            aggregate.losses(),
                            StatsAggregationOps::ratio(aggregate.wins(), games),
                        ),
                        StatsAggregationOps::median_f64(aggregate.kill_fractions()),
                        StatsAggregationOps::median_u64(aggregate.apm_values()),
                        frequency,
                        aggregate.last_seen(),
                        ReplayCacheStatisticsLoadOps::sanitize_replay_text(&commander),
                    )),
                )
            })
            .collect::<Map<String, Value>>();
        crate::sco_debug!(
            "[SCO/stats/e2e/backend] stage=player_data rows={} elapsed_ms={:.3}",
            player_data.len(),
            ReplayCacheStatisticsLoadOps::elapsed_ms(player_started_at)
        );

        let unit_started_at = Instant::now();
        let unit_data = if include_detailed {
            let replay_ids = valid_snapshots
                .iter()
                .map(|snapshot| snapshot.replay_id)
                .collect::<Vec<_>>();
            self.load_statistics_unit_data_from_facts(&replay_ids, main_handles, dictionary)?
        } else {
            Value::Null
        };
        crate::sco_debug!(
            "[SCO/stats/e2e/backend] stage=unit_data include_detailed={} elapsed_ms={:.3}",
            include_detailed,
            ReplayCacheStatisticsLoadOps::elapsed_ms(unit_started_at)
        );

        let serialize_started_at = Instant::now();
        let analysis = ReplayCacheStatisticsLoadOps::to_value(
            &StatsAggregateAnalysisPayload::new_ready_map_data(
                map_data,
                commander_data,
                ally_commander_data,
                difficulty_data,
                region_data,
                player_data,
                unit_data,
            ),
        );
        let prestige_names = dictionary
            .prestige_names_json
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
            .collect::<BTreeMap<_, _>>();
        crate::sco_debug!(
            "[SCO/stats/e2e/backend] stage=payload_serialize elapsed_ms={:.3}",
            ReplayCacheStatisticsLoadOps::elapsed_ms(serialize_started_at)
        );

        let payload = ReplayCacheStatisticsPayload::new(
            analysis,
            prestige_names,
            total_games,
            detailed_parsed_count,
            total_games,
            main_players.into_iter().collect(),
            main_player_handles.into_iter().collect(),
        );
        crate::sco_debug!(
            "[SCO/stats/e2e/backend] stage=statistics_payload_from_snapshots_total games={} elapsed_ms={:.3}",
            payload.games(),
            ReplayCacheStatisticsLoadOps::elapsed_ms(total_started_at)
        );
        Ok(payload)
    }

    fn stats_player_is_main(
        player: &StatsPlayerSnapshot,
        main_names: &HashSet<String>,
        main_handles: &HashSet<String>,
        has_known_identity: bool,
        fallback_main: bool,
    ) -> bool {
        let handle_match = !main_handles.is_empty()
            && main_handles.contains(&ReplayCacheStatisticsLoadOps::normalized_handle_key(
                &player.handle,
            ));
        let name_match =
            !main_names.is_empty() && main_names.contains(&player.name.trim().to_ascii_lowercase());
        handle_match || name_match || (!has_known_identity && fallback_main)
    }

    fn stats_region_for_snapshot(
        snapshot: &StatsReplaySnapshot,
        has_known_main_handles: bool,
        p1_is_main: bool,
        p2_is_main: bool,
    ) -> String {
        if has_known_main_handles && p1_is_main {
            ReplayCacheStatisticsLoadOps::infer_region_from_handle(&snapshot.main.handle)
        } else if has_known_main_handles && p2_is_main {
            ReplayCacheStatisticsLoadOps::infer_region_from_handle(&snapshot.ally.handle)
        } else {
            ReplayCacheStatisticsLoadOps::infer_region_from_handle(&snapshot.main.handle).or_else(
                || ReplayCacheStatisticsLoadOps::infer_region_from_handle(&snapshot.ally.handle),
            )
        }
        .unwrap_or_else(|| "Unknown".to_string())
    }

    fn stats_region_main_flags(
        snapshot: &StatsReplaySnapshot,
        has_known_main_handles: bool,
        main_handles: &HashSet<String>,
    ) -> (bool, bool) {
        if !has_known_main_handles {
            return (true, false);
        }
        let mut main_is_main =
            ReplayAnalysis::is_main_player_by_handle(&snapshot.main.handle, main_handles);
        let ally_is_main =
            ReplayAnalysis::is_main_player_by_handle(&snapshot.ally.handle, main_handles);
        if !main_is_main && !ally_is_main {
            main_is_main = true;
        }
        (main_is_main, ally_is_main)
    }

    fn stats_difficulty_label(snapshot: &StatsReplaySnapshot) -> String {
        if snapshot.brutal_plus > 0 {
            return format!("B+{}", snapshot.brutal_plus.min(6));
        }
        let difficulty = snapshot.difficulty.trim();
        if difficulty.eq_ignore_ascii_case("Brutal+") {
            "Brutal+".to_string()
        } else if difficulty.is_empty() {
            "Unknown".to_string()
        } else {
            difficulty.to_string()
        }
    }

    fn fastest_player_value(player: &StatsPlayerSnapshot, dictionary: &Sc2DictionaryData) -> Value {
        #[derive(Serialize)]
        struct FastestPlayer {
            name: String,
            handle: String,
            commander: String,
            apm: u64,
            mastery_level: u64,
            masteries: Vec<u64>,
            prestige: u64,
            prestige_name: String,
        }

        let commander = ReplayCacheStatisticsLoadOps::sanitize_replay_text(
            &ReplayCacheStatisticsLoadOps::normalized_commander_name(&player.commander),
        );
        let prestige_name = dictionary
            .prestige_name(&commander, player.prestige)
            .map(str::to_string)
            .unwrap_or_else(|| format!("P{}", player.prestige));
        ReplayCacheStatisticsLoadOps::to_value(&FastestPlayer {
            name: ReplayCacheStatisticsLoadOps::sanitize_replay_text(&player.name),
            handle: player.handle.clone(),
            commander,
            apm: player.apm,
            mastery_level: player.mastery_level,
            masteries: StatsAggregationOps::normalize_mastery_values(&player.masteries),
            prestige: player.prestige,
            prestige_name,
        })
    }

    fn fastest_players_value(
        snapshot: &StatsReplaySnapshot,
        main_names: &HashSet<String>,
        main_handles: &HashSet<String>,
        dictionary: &Sc2DictionaryData,
    ) -> Vec<Value> {
        let main_value = Self::fastest_player_value(&snapshot.main, dictionary);
        let ally_value = Self::fastest_player_value(&snapshot.ally, dictionary);
        let main_is_main = ReplayAnalysis::is_main_player_identity(
            &snapshot.main.name,
            &snapshot.main.handle,
            main_names,
            main_handles,
        );
        let ally_is_main = ReplayAnalysis::is_main_player_identity(
            &snapshot.ally.name,
            &snapshot.ally.handle,
            main_names,
            main_handles,
        );
        if ally_is_main && !main_is_main {
            vec![ally_value, main_value]
        } else {
            vec![main_value, ally_value]
        }
    }
}
