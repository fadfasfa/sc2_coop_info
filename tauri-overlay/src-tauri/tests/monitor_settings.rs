use sco_tauri_overlay::{MonitorDescriptor, MonitorSettingsOps};

#[test]
fn normalize_monitor_descriptors_sorts_by_geometry_and_fills_empty_names() {
    let monitors = vec![
        MonitorDescriptor::new("", 1920, 0, 2560, 1440),
        MonitorDescriptor::new("Portrait", -1080, 0, 1080, 1920),
        MonitorDescriptor::new("Primary", 0, 0, 1920, 1080),
    ];

    let normalized = MonitorSettingsOps::normalize_monitor_descriptors(monitors);

    assert_eq!(normalized[0].name(), "Portrait");
    assert_eq!(normalized[0].position_x(), -1080);
    assert_eq!(normalized[1].name(), "Primary");
    assert_eq!(normalized[1].position_x(), 0);
    assert_eq!(normalized[2].name(), "Monitor 3");
    assert_eq!(normalized[2].position_x(), 1920);
}

#[test]
fn selected_monitor_descriptor_clamps_to_last_available_monitor() {
    let monitors = MonitorSettingsOps::normalize_monitor_descriptors(vec![
        MonitorDescriptor::new("Left", -1080, 0, 1080, 1920),
        MonitorDescriptor::new("Center", 0, 0, 2560, 1440),
    ]);

    assert_eq!(
        MonitorSettingsOps::selected_monitor_index(1, monitors.len()),
        Some(0)
    );
    assert_eq!(
        MonitorSettingsOps::selected_monitor_index(2, monitors.len()),
        Some(1)
    );
    assert_eq!(
        MonitorSettingsOps::selected_monitor_index(3, monitors.len()),
        Some(1)
    );
    assert_eq!(
        MonitorSettingsOps::selected_monitor_index(0, monitors.len()),
        Some(0)
    );

    let selected = MonitorSettingsOps::selected_monitor_descriptor(&monitors, 3)
        .expect("monitor should exist");
    assert_eq!(selected.name(), "Center");
}

#[test]
fn monitor_catalog_from_descriptors_uses_one_based_labels() {
    let monitors = MonitorSettingsOps::normalize_monitor_descriptors(vec![
        MonitorDescriptor::new("Left", -1080, 0, 1080, 1920),
        MonitorDescriptor::new("Primary", 0, 0, 2560, 1440),
    ]);

    let catalog = MonitorSettingsOps::monitor_catalog_from_descriptors(&monitors);

    assert_eq!(catalog.len(), 2);
    assert_eq!(catalog[0].index, 1);
    assert_eq!(catalog[0].label, "1 - Left");
    assert_eq!(catalog[1].index, 2);
    assert_eq!(catalog[1].label, "2 - Primary");
}

#[test]
fn resolve_monitor_descriptors_prefers_friendly_names_when_positions_match() {
    let runtime_monitors = vec![
        MonitorDescriptor::new(r"\\.\DISPLAY2", 0, 0, 2560, 1440),
        MonitorDescriptor::new(r"\\.\DISPLAY1", -1080, 0, 1080, 1920),
    ];
    let named_monitors = vec![
        MonitorDescriptor::new("Primary", 0, 0, 2560, 1440),
        MonitorDescriptor::new("Portrait", -1080, 0, 1080, 1920),
    ];

    let resolved =
        MonitorSettingsOps::resolve_monitor_descriptors(runtime_monitors, named_monitors);

    assert_eq!(resolved[0].name(), "Portrait");
    assert_eq!(resolved[1].name(), "Primary");
}

#[test]
fn monitor_for_window_rect_prefers_center_then_largest_intersection() {
    let monitors = vec![
        MonitorDescriptor::new("Left", -1920, 0, 1920, 1080),
        MonitorDescriptor::new("Primary", 0, 0, 1920, 1080),
        MonitorDescriptor::new("Portrait", 1920, -900, 1080, 1920),
    ];

    let centered = MonitorSettingsOps::monitor_for_window_rect(
        &monitors,
        (100, 100, 800, 600),
    )
    .expect("center monitor should exist");
    assert_eq!(centered.name(), "Primary");

    let spanning = MonitorSettingsOps::monitor_for_window_rect(
        &monitors,
        (-400, 100, 1000, 600),
    )
    .expect("intersecting monitor should exist");
    assert_eq!(spanning.name(), "Primary");
}

#[test]
fn target_monitor_prefers_current_then_recent_then_manual_without_index_reliance() {
    let monitors = vec![
        MonitorDescriptor::new("Left", -1920, 0, 1920, 1080),
        MonitorDescriptor::new("Primary", 0, 0, 1920, 1080),
    ];
    let recent = MonitorDescriptor::new("Left", -1920, 0, 1920, 1080);

    let current = MonitorSettingsOps::target_monitor(
        &monitors,
        Some((100, 100, 800, 600)),
        Some(&recent),
        1,
    )
    .expect("current monitor should win");
    assert_eq!(current.name(), "Primary");

    let recent_target = MonitorSettingsOps::target_monitor(&monitors, None, Some(&recent), 2)
        .expect("recent monitor should win");
    assert_eq!(recent_target.name(), "Left");

    let changed_recent = MonitorDescriptor::new("Left", -1920, 0, 1600, 900);
    let manual_target = MonitorSettingsOps::target_monitor(
        &monitors,
        None,
        Some(&changed_recent),
        2,
    )
    .expect("manual monitor should be available");
    assert_eq!(manual_target.name(), "Primary");
}

#[test]
fn monitor_for_window_rect_supports_negative_and_portrait_coordinates() {
    let monitors = vec![
        MonitorDescriptor::new("Left", -1080, 0, 1080, 1920),
        MonitorDescriptor::new("Portrait", 0, -1200, 1080, 1200),
    ];

    let left = MonitorSettingsOps::monitor_for_window_rect(
        &monitors,
        (-900, 400, 400, 500),
    )
    .expect("negative-coordinate monitor should exist");
    assert_eq!(left.name(), "Left");

    let portrait = MonitorSettingsOps::monitor_for_window_rect(
        &monitors,
        (100, -1000, 400, 400),
    )
    .expect("portrait monitor should exist");
    assert_eq!(portrait.name(), "Portrait");
}
