//! Independent Chinese localization regressions. Uses only synthetic data/temp files.
use sco_tauri_overlay::{AppSettings, LocalizedLabels, LocalizedText, OverlayPlayerStatsRow, TauriOverlayOps, WeeklyRowPayload};
use serde_json::json;

#[test]
fn zh_cn_settings_survive_serialization_restart_and_language_cycle() {
    let temp = std::env::temp_dir().join(format!("sco-zh-qa-{}-{}.json", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    let mut previous = AppSettings::merge_settings_with_defaults(json!({"language":"en", "account_folder":"fixtures/empty", "player_notes":{"qa-player":"原样保留 player note"}}));
    for language in ["en", "zh-CN", "ko", "en"] {
        let mut value = previous.to_value();
        value["language"] = json!(language);
        let settings = AppSettings::merge_settings_with_defaults(value);
        assert_eq!(settings.language(), language);
        assert_eq!(settings.overlay_language(), language);
        let runtime = settings.overlay_runtime_settings_payload(3, 1, Default::default());
        assert_eq!(runtime["language"], language);
        assert_eq!(runtime["session_victory"], 3);
        assert_eq!(runtime["session_defeat"], 1);
        // Exercise the public read-from-explicit-path contract, never live AppData.
        std::fs::write(&temp, serde_json::to_vec_pretty(&settings).unwrap()).unwrap();
        let restarted = AppSettings::read_saved_settings_file_from_path(&temp, false);
        assert_eq!(restarted.overlay_language(), language);
        assert_eq!(restarted.to_value()["player_notes"], previous.to_value()["player_notes"]);
        assert_eq!(restarted.to_value()["account_folder"], json!("fixtures/empty"));
        previous = restarted;
    }
    std::fs::remove_file(temp).unwrap();
}

#[test]
fn unknown_settings_language_preserves_existing_english_runtime_fallback() {
    let settings = AppSettings::merge_settings_with_defaults(json!({"language":"unknown-language"}));
    assert_eq!(settings.overlay_language(), "en");
}

#[test]
fn localized_labels_accept_old_payload_and_use_exact_optional_wire_key() {
    let old: LocalizedLabels = serde_json::from_value(json!({"en":["A","B"],"ko":["가","나"]})).unwrap();
    assert!(old.zh_cn.is_none());
    assert!(serde_json::to_value(&old).unwrap().get("zh-CN").is_none());
    let new: LocalizedLabels = serde_json::from_value(json!({"en":["A","B"],"ko":["가","나"],"zh-CN":["甲","乙"]})).unwrap();
    assert_eq!(new.zh_cn, Some(vec!["甲".into(), "乙".into()]));
    assert_eq!(serde_json::to_value(new).unwrap()["zh-CN"], json!(["甲","乙"]));
}

#[test]
fn localized_text_and_weekly_wire_fields_are_optional_without_changing_identity() {
    let mut text = LocalizedText { en: "Black Death".into(), ko: "흑사병".into(), zh_cn: None };
    assert!(serde_json::to_value(&text).unwrap().get("zh-CN").is_none());
    text.zh_cn = Some("黑死病".into());
    assert_eq!(serde_json::to_value(text).unwrap()["zh-CN"], "黑死病");
    let mut row = WeeklyRowPayload { mutation: "Train of the Dead".into(), name_en: "Train of the Dead".into(), map: "Oblivion Express".into(), mutation_order: 7, ..Default::default() };
    let old = serde_json::to_value(&row).unwrap();
    assert!(old.get("nameZhCn").is_none());
    row.name_zh_cn = Some("亡者列车".into());
    let new = serde_json::to_value(row).unwrap();
    for key in ["mutation", "map", "mutationOrder", "wins", "losses", "winrate"] { assert_eq!(old[key], new[key]); }
    assert_eq!(new["nameZhCn"], "亡者列车");
}

#[test]
fn chinese_titles_cover_each_window_without_changing_english_korean_or_unknown_windows() {
    for (label, title) in [("config", "SC2 合作信息设置"), ("overlay", "SC2 录像悬浮窗"), ("sc2-overlay", "SC2 玩家悬浮窗"), ("performance", "SC2 性能窗口")] {
        assert_eq!(TauriOverlayOps::localized_window_title(label, "zh-CN", "Original"), title);
        for language in ["en", "ko", "unknown"] { assert_eq!(TauriOverlayOps::localized_window_title(label, language, "Original"), "Original"); }
    }
    assert_eq!(TauriOverlayOps::localized_window_title("future-window", "zh-CN", "Original"), "Original");
}

#[test]
fn old_player_stats_wire_payload_omits_numeric_age_and_new_payload_preserves_statistics() {
    let row = |seconds| OverlayPlayerStatsRow::Stats { wins: 3, losses: 1, apm: 123, commander: "Abathur".into(), frequency: 0.8, kills: 0.41, last_seen_relative: "2 hours ago".into(), last_seen_seconds: seconds, note: Some("QA原样备注".into()) };
    let old = serde_json::to_value(row(None)).unwrap();
    let new = serde_json::to_value(row(Some(7200))).unwrap();
    assert!(old.get("last_seen_seconds").is_none());
    assert_eq!(new["last_seen_seconds"], 7200);
    for key in ["kind", "wins", "losses", "apm", "commander", "frequency", "kills", "last_seen_relative", "note"] { assert_eq!(old[key], new[key]); }
}
