use super::*;

impl OverlayReplayPayload {
    pub fn localized_prestige_text_with_dictionary(
        commander: &str,
        prestige: u64,
        language: &str,
        dictionary: &Sc2DictionaryData,
    ) -> String {
        if prestige == 0 {
            return String::new();
        }

        let commander = TauriOverlayOps::sanitize_replay_text(commander);
        let Some(index) = usize::try_from(prestige).ok() else {
            return format!("P{prestige}");
        };
        if let Some(lookup) = dictionary
            .prestige_names_json
            .get(&commander)
            .and_then(|value| {
                let preferred = match language {
                    "zh-CN" => &value.zh_cn,
                    "ko" => &value.ko,
                    _ => &value.en,
                };
                [preferred, &value.en, &value.ko]
                    .into_iter()
                    .filter_map(|labels| labels.get(index))
                    .find(|label| !label.trim().is_empty())
            })
            .map(String::as_str)
        {
            return lookup.to_string();
        }

        if let Some(lookup) = dictionary.prestige_name(&commander, prestige) {
            return lookup.to_string();
        }

        format!("P{prestige}")
    }

    pub fn localized_prestige_text(prestige: u64) -> String {
        if prestige == 0 {
            return String::new();
        }

        format!("P{prestige}")
    }

    fn from_replay_with_dictionary(
        replay: &crate::ReplayInfo,
        language: &str,
        dictionary: &Sc2DictionaryData,
    ) -> Self {
        let sanitized = replay.sanitized_for_client_with_dictionary(dictionary);
        let main_prestige = Self::localized_prestige_text_with_dictionary(
            sanitized.main_commander(),
            sanitized.main_prestige(),
            language,
            dictionary,
        );
        let ally_prestige = Self::localized_prestige_text_with_dictionary(
            sanitized.ally_commander(),
            sanitized.ally_prestige(),
            language,
            dictionary,
        );
        let player_stats = SharedTypesOps::replay_data_record_from_value(&sanitized.player_stats);
        let (main_player_stats, ally_player_stats) =
            OverlayInfoOps::semantic_player_stats_from_record(
                &player_stats,
                &sanitized.main().name,
                &sanitized.ally().name,
                sanitized.main_kills(),
                sanitized.ally_kills(),
            );
        Self {
            file: sanitized.file.clone(),
            map_name: sanitized.map.clone(),
            main: sanitized.main().name.clone(),
            ally: sanitized.ally().name.clone(),
            main_commander: sanitized.main_commander().to_string(),
            ally_commander: sanitized.ally_commander().to_string(),
            main_apm: OverlayInfoOps::as_u32(sanitized.main_apm()),
            ally_apm: OverlayInfoOps::as_u32(sanitized.ally_apm()),
            mainkills: OverlayInfoOps::as_u32(sanitized.main_kills()),
            allykills: OverlayInfoOps::as_u32(sanitized.ally_kills()),
            result: sanitized.result.clone(),
            difficulty: sanitized.difficulty.clone(),
            enemy: sanitized.enemy.clone(),
            length: OverlayInfoOps::as_u32(sanitized.length),
            brutal_plus: OverlayInfoOps::as_u32(sanitized.brutal_plus),
            weekly: sanitized.weekly,
            weekly_name: sanitized.weekly_name.clone(),
            extension: sanitized.extension,
            main_commander_level: OverlayInfoOps::as_u32(sanitized.main_commander_level()),
            ally_commander_level: OverlayInfoOps::as_u32(sanitized.ally_commander_level()),
            main_mastery_level: OverlayInfoOps::as_u32(sanitized.main_mastery_level()),
            ally_mastery_level: OverlayInfoOps::as_u32(sanitized.ally_mastery_level()),
            main_masteries: OverlayInfoOps::as_u32_vec(sanitized.main_masteries()),
            ally_masteries: OverlayInfoOps::as_u32_vec(sanitized.ally_masteries()),
            main_units: SharedTypesOps::unit_stats_map_from_value(sanitized.main_units()),
            ally_units: SharedTypesOps::unit_stats_map_from_value(sanitized.ally_units()),
            amon_units: SharedTypesOps::unit_stats_map_from_value(&sanitized.amon_units),
            main_icons: SharedTypesOps::overlay_icon_payload_from_value(sanitized.main_icons()),
            ally_icons: SharedTypesOps::overlay_icon_payload_from_value(sanitized.ally_icons()),
            mutators: sanitized
                .mutators
                .iter()
                .map(|mutator_id| {
                    OverlayInfoOps::overlay_mutator_name_with_dictionary(mutator_id, dictionary)
                })
                .collect(),
            bonus: sanitized
                .bonus
                .iter()
                .copied()
                .map(OverlayInfoOps::as_u32)
                .collect(),
            bonus_total: sanitized.bonus_total.map(OverlayInfoOps::as_u32),
            player_stats: Some(player_stats),
            main_player_stats,
            ally_player_stats,
            main_prestige,
            ally_prestige,
            victory: None,
            defeat: None,
            commander: None,
            prestige: None,
            new_replay: None,
            fastest: None,
            comp: sanitized.comp,
        }
    }

    fn from_replay(replay: &crate::ReplayInfo, language: &str) -> Self {
        let _ = language;
        let sanitized = replay.sanitized_for_client();
        let main_prestige = Self::localized_prestige_text(sanitized.main_prestige());
        let ally_prestige = Self::localized_prestige_text(sanitized.ally_prestige());
        let player_stats = SharedTypesOps::replay_data_record_from_value(&sanitized.player_stats);
        let (main_player_stats, ally_player_stats) =
            OverlayInfoOps::semantic_player_stats_from_record(
                &player_stats,
                &sanitized.main().name,
                &sanitized.ally().name,
                sanitized.main_kills(),
                sanitized.ally_kills(),
            );
        Self {
            file: sanitized.file.clone(),
            map_name: sanitized.map.clone(),
            main: sanitized.main().name.clone(),
            ally: sanitized.ally().name.clone(),
            main_commander: sanitized.main_commander().to_string(),
            ally_commander: sanitized.ally_commander().to_string(),
            main_apm: OverlayInfoOps::as_u32(sanitized.main_apm()),
            ally_apm: OverlayInfoOps::as_u32(sanitized.ally_apm()),
            mainkills: OverlayInfoOps::as_u32(sanitized.main_kills()),
            allykills: OverlayInfoOps::as_u32(sanitized.ally_kills()),
            result: sanitized.result.clone(),
            difficulty: sanitized.difficulty.clone(),
            enemy: sanitized.enemy.clone(),
            length: OverlayInfoOps::as_u32(sanitized.length),
            brutal_plus: OverlayInfoOps::as_u32(sanitized.brutal_plus),
            weekly: sanitized.weekly,
            weekly_name: sanitized.weekly_name.clone(),
            extension: sanitized.extension,
            main_commander_level: OverlayInfoOps::as_u32(sanitized.main_commander_level()),
            ally_commander_level: OverlayInfoOps::as_u32(sanitized.ally_commander_level()),
            main_mastery_level: OverlayInfoOps::as_u32(sanitized.main_mastery_level()),
            ally_mastery_level: OverlayInfoOps::as_u32(sanitized.ally_mastery_level()),
            main_masteries: OverlayInfoOps::as_u32_vec(sanitized.main_masteries()),
            ally_masteries: OverlayInfoOps::as_u32_vec(sanitized.ally_masteries()),
            main_units: SharedTypesOps::unit_stats_map_from_value(sanitized.main_units()),
            ally_units: SharedTypesOps::unit_stats_map_from_value(sanitized.ally_units()),
            amon_units: SharedTypesOps::unit_stats_map_from_value(&sanitized.amon_units),
            main_icons: SharedTypesOps::overlay_icon_payload_from_value(sanitized.main_icons()),
            ally_icons: SharedTypesOps::overlay_icon_payload_from_value(sanitized.ally_icons()),
            mutators: sanitized.mutators.clone(),
            bonus: sanitized
                .bonus
                .iter()
                .copied()
                .map(OverlayInfoOps::as_u32)
                .collect(),
            bonus_total: sanitized.bonus_total.map(OverlayInfoOps::as_u32),
            player_stats: Some(player_stats),
            main_player_stats,
            ally_player_stats,
            main_prestige,
            ally_prestige,
            victory: None,
            defeat: None,
            commander: None,
            prestige: None,
            new_replay: None,
            fastest: None,
            comp: sanitized.comp,
        }
    }

    fn swap_sides(&mut self) {
        std::mem::swap(&mut self.main, &mut self.ally);
        std::mem::swap(&mut self.main_commander, &mut self.ally_commander);
        std::mem::swap(&mut self.main_apm, &mut self.ally_apm);
        std::mem::swap(&mut self.mainkills, &mut self.allykills);
        std::mem::swap(
            &mut self.main_commander_level,
            &mut self.ally_commander_level,
        );
        std::mem::swap(&mut self.main_mastery_level, &mut self.ally_mastery_level);
        std::mem::swap(&mut self.main_masteries, &mut self.ally_masteries);
        std::mem::swap(&mut self.main_units, &mut self.ally_units);
        std::mem::swap(&mut self.main_icons, &mut self.ally_icons);
        std::mem::swap(&mut self.main_prestige, &mut self.ally_prestige);
        std::mem::swap(&mut self.main_player_stats, &mut self.ally_player_stats);
        SharedTypesOps::swap_replay_data_record_sides(&mut self.player_stats);
    }
}

impl OverlayInfoOps {
    fn player_series_by_name(
        player_stats: &ReplayDataRecord,
        player_name: &str,
        excluded_index: Option<usize>,
    ) -> Option<ReplayPlayerSeries> {
        let target_name = player_name.trim();
        if target_name.is_empty() {
            return None;
        }

        player_stats
            .values()
            .enumerate()
            .find(|(index, series)| {
                Some(*index) != excluded_index && series.name.trim() == target_name
            })
            .map(|(_, series)| series.clone())
    }
}

impl OverlayInfoOps {
    fn player_series_final_kills(series: &ReplayPlayerSeries) -> Option<f64> {
        series
            .killed
            .last()
            .copied()
            .filter(|value| value.is_finite())
    }

    fn player_series_kill_distance(series: &ReplayPlayerSeries, expected_kills: u64) -> f64 {
        Self::player_series_final_kills(series)
            .map(|actual_kills| (actual_kills - expected_kills as f64).abs())
            .unwrap_or(f64::INFINITY)
    }

    fn player_stats_should_swap_for_totals(
        main_player_stats: &ReplayPlayerSeries,
        ally_player_stats: &ReplayPlayerSeries,
        main_kills: u64,
        ally_kills: u64,
    ) -> bool {
        let current_distance = Self::player_series_kill_distance(main_player_stats, main_kills)
            + Self::player_series_kill_distance(ally_player_stats, ally_kills);
        let swapped_distance = Self::player_series_kill_distance(main_player_stats, ally_kills)
            + Self::player_series_kill_distance(ally_player_stats, main_kills);

        swapped_distance < current_distance
    }

    fn realign_player_stats_by_kill_totals(
        main_player_stats: &mut Option<ReplayPlayerSeries>,
        ally_player_stats: &mut Option<ReplayPlayerSeries>,
        main_kills: u64,
        ally_kills: u64,
    ) {
        let should_swap = match (main_player_stats.as_ref(), ally_player_stats.as_ref()) {
            (Some(main_stats), Some(ally_stats)) => Self::player_stats_should_swap_for_totals(
                main_stats, ally_stats, main_kills, ally_kills,
            ),
            _ => false,
        };
        if should_swap {
            std::mem::swap(main_player_stats, ally_player_stats);
        }
    }

    fn semantic_player_stats_from_record(
        player_stats: &ReplayDataRecord,
        main_name: &str,
        ally_name: &str,
        main_kills: u64,
        ally_kills: u64,
    ) -> (Option<ReplayPlayerSeries>, Option<ReplayPlayerSeries>) {
        let mut main_player_stats =
            OverlayInfoOps::player_series_by_name(player_stats, main_name, None)
                .or_else(|| player_stats.get("1").cloned());
        let mut ally_player_stats = OverlayInfoOps::player_series_by_name(
            player_stats,
            ally_name,
            main_player_stats
                .as_ref()
                .and_then(|target| player_stats.values().position(|series| series == target)),
        )
        .or_else(|| player_stats.get("2").cloned());

        Self::realign_player_stats_by_kill_totals(
            &mut main_player_stats,
            &mut ally_player_stats,
            main_kills,
            ally_kills,
        );
        if let Some(stats) = main_player_stats.as_mut() {
            stats.name = main_name.to_string();
        }
        if let Some(stats) = ally_player_stats.as_mut() {
            stats.name = ally_name.to_string();
        }

        (main_player_stats, ally_player_stats)
    }
}

impl OverlayInfoOps {
    pub fn overlay_payload_from_replay(
        state: &BackendState,
        replay: &crate::ReplayInfo,
        mark_new_replay: bool,
        show_session: bool,
        session_victories: u64,
        session_defeats: u64,
    ) -> OverlayReplayPayload {
        let main_names = state.configured_main_names();
        let main_handles = state.configured_main_handles();
        let settings = state.read_settings_memory();
        let language = settings.overlay_language();
        let dictionary = state.dictionary_data().ok();
        let mut payload = dictionary
            .as_deref()
            .map(|dictionary| {
                OverlayReplayPayload::from_replay_with_dictionary(replay, language, dictionary)
            })
            .unwrap_or_else(|| OverlayReplayPayload::from_replay(replay, language));
        if TauriOverlayOps::replay_should_swap_main_and_ally(replay, &main_names, &main_handles) {
            payload.swap_sides();
        }
        if show_session {
            payload.victory = Some(OverlayInfoOps::as_u32(session_victories));
            payload.defeat = Some(OverlayInfoOps::as_u32(session_defeats));
        }
        payload.new_replay = mark_new_replay.then_some(true);
        payload
    }
}
