use super::*;

impl OverlayInfoOps {
    fn target_monitor_from_runtime<R: Runtime>(
        window: &tauri::WebviewWindow<R>,
        settings_value: &AppSettings,
    ) -> Result<monitor_settings::MonitorDescriptor, String> {
        let monitors = monitor_settings::MonitorSettingsOps::monitor_descriptors(window);
        let state = window.state::<BackendState>();
        let current_window_rect = crate::ActiveWindowDetector::sc2_window_rect_for_placement()
            .ok()
            .flatten()
            .map(|rect| (rect.x(), rect.y(), rect.width(), rect.height()));
        if let Some(current) = current_window_rect.and_then(|rect|
            monitor_settings::MonitorSettingsOps::monitor_for_window_rect(&monitors, rect))
        {
            state.set_latest_sc2_monitor(current);
        }
        monitor_settings::MonitorSettingsOps::target_monitor(
            &monitors,
            current_window_rect,
            state.latest_sc2_monitor().as_ref(),
            settings_value.overlay_placement().monitor(),
        )
        .ok_or_else(|| "No monitors detected".to_string())
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OverlayMonitorGeometry {
    monitor_x: i32,
    monitor_y: i32,
    monitor_width: u32,
    monitor_height: u32,
}

impl OverlayMonitorGeometry {
    pub fn new(monitor_x: i32, monitor_y: i32, monitor_width: u32, monitor_height: u32) -> Self {
        Self {
            monitor_x,
            monitor_y,
            monitor_width,
            monitor_height,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OverlayWindowScale {
    width_ratio: f64,
    height_ratio: f64,
}

impl OverlayWindowScale {
    pub fn new(width_ratio: f64, height_ratio: f64) -> Self {
        Self {
            width_ratio,
            height_ratio,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct OverlayWindowOffsets {
    top_offset: i32,
    right_offset: i32,
    subtract_height: i32,
}

impl OverlayWindowOffsets {
    pub fn new(top_offset: i32, right_offset: i32, subtract_height: i32) -> Self {
        Self {
            top_offset,
            right_offset,
            subtract_height,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OverlayWindowBoundsInput {
    geometry: OverlayMonitorGeometry,
    scale: OverlayWindowScale,
    offsets: OverlayWindowOffsets,
}

impl OverlayWindowBoundsInput {
    pub fn new(
        geometry: OverlayMonitorGeometry,
        scale: OverlayWindowScale,
        offsets: OverlayWindowOffsets,
    ) -> Self {
        Self {
            geometry,
            scale,
            offsets,
        }
    }
}

impl OverlayInfoOps {
    pub fn sc2_overlay_window_bounds_for_rect(
        rect: crate::ScreenRect,
    ) -> (tauri::PhysicalSize<u32>, tauri::PhysicalPosition<i32>) {
        (
            tauri::PhysicalSize {
                width: rect.width(),
                height: rect.height(),
            },
            tauri::PhysicalPosition {
                x: rect.x(),
                y: rect.y(),
            },
        )
    }
}

impl OverlayInfoOps {
    pub fn overlay_window_bounds_for_monitor(
        input: OverlayWindowBoundsInput,
    ) -> (tauri::PhysicalSize<u32>, tauri::PhysicalPosition<i32>) {
        let monitor_x = input.geometry.monitor_x;
        let monitor_y = input.geometry.monitor_y;
        let monitor_width = input.geometry.monitor_width;
        let monitor_height = input.geometry.monitor_height;
        let width_ratio = input.scale.width_ratio;
        let height_ratio = input.scale.height_ratio;
        let top_offset = input.offsets.top_offset;
        let right_offset = input.offsets.right_offset;
        let subtract_height = input.offsets.subtract_height;
        if monitor_width == 0 || monitor_height == 0 {
            let size = tauri::PhysicalSize {
                width: 1,
                height: 1,
            };
            let position = OverlayInfoOps::overlay_window_position_for_monitor(
                monitor_x,
                monitor_y,
                monitor_width,
                size.width,
                top_offset,
                right_offset,
            );
            return (size, position);
        }

        let effective_width_ratio = if monitor_height > monitor_width {
            1.0
        } else {
            width_ratio
        };

        let mut target_width = (monitor_width as f64 * effective_width_ratio).max(1.0) as i64;
        let mut target_height =
            (monitor_height as f64 * height_ratio) as i64 - i64::from(subtract_height);

        if target_width > i64::from(monitor_width) {
            target_width = i64::from(monitor_width);
        }
        if target_height > i64::from(monitor_height) {
            target_height = i64::from(monitor_height);
        }
        target_width = target_width.max(1);
        target_height = target_height.max(1);

        let size = tauri::PhysicalSize {
            width: u32::try_from(target_width).unwrap_or(1),
            height: u32::try_from(target_height).unwrap_or(1),
        };
        let position = OverlayInfoOps::overlay_window_position_for_monitor(
            monitor_x,
            monitor_y,
            monitor_width,
            size.width,
            top_offset,
            right_offset,
        );
        (size, position)
    }
}

impl OverlayInfoOps {
    pub fn overlay_window_position_for_monitor(
        monitor_x: i32,
        monitor_y: i32,
        monitor_width: u32,
        window_width: u32,
        top_offset: i32,
        right_offset: i32,
    ) -> tauri::PhysicalPosition<i32> {
        tauri::PhysicalPosition {
            x: monitor_x
                + i32::try_from(monitor_width.saturating_sub(window_width)).unwrap_or(0)
                + right_offset,
            y: monitor_y + top_offset,
        }
    }
}

impl OverlayInfoOps {
    pub fn overlay_window_size_matches_target(
        actual_size: tauri::PhysicalSize<u32>,
        target_size: tauri::PhysicalSize<u32>,
    ) -> bool {
        const SIZE_TOLERANCE_PX: u32 = 1;

        actual_size.width.abs_diff(target_size.width) <= SIZE_TOLERANCE_PX
            && actual_size.height.abs_diff(target_size.height) <= SIZE_TOLERANCE_PX
    }
}

impl OverlayInfoOps {
    pub fn parse_runtime_flags() -> RuntimeFlags {
        AppSettings::from_saved_file().runtime_flags()
    }
}

impl OverlayInfoOps {
    pub fn apply_overlay_placement<R: Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> Result<(), String> {
        let state = window.state::<BackendState>();
        OverlayInfoOps::apply_overlay_placement_from_settings(window, &state.read_settings_memory())
    }
}

impl OverlayInfoOps {
    pub fn apply_overlay_placement_from_settings<R: Runtime>(
        window: &tauri::WebviewWindow<R>,
        settings_value: &AppSettings,
    ) -> Result<(), String> {
        let settings = settings_value.overlay_placement();
        let selected = OverlayInfoOps::target_monitor_from_runtime(window, settings_value)?;
        let (size, _) =
            OverlayInfoOps::overlay_window_bounds_for_monitor(OverlayWindowBoundsInput::new(
                OverlayMonitorGeometry::new(
                    selected.position_x(),
                    selected.position_y(),
                    selected.width(),
                    selected.height(),
                ),
                OverlayWindowScale::new(settings.width(), settings.height()),
                OverlayWindowOffsets::new(
                    settings.top_offset(),
                    settings.right_offset(),
                    settings.subtract_height(),
                ),
            ));
        let provisional_position = tauri::PhysicalPosition {
            x: selected.position_x(),
            y: selected.position_y(),
        };

        window
            .set_position(provisional_position)
            .map_err(|error| format!("Failed to move overlay to target monitor: {error}"))?;
        window
            .set_size(size)
            .map_err(|error| format!("Failed to set overlay size: {error}"))?;

        OverlayInfoOps::stabilize_overlay_bounds_from_settings(window, settings_value)
    }
}

impl OverlayInfoOps {
    pub fn stabilize_overlay_bounds<R: Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> Result<(), String> {
        let state = window.state::<BackendState>();
        OverlayInfoOps::stabilize_overlay_bounds_from_settings(
            window,
            &state.read_settings_memory(),
        )
    }
}

impl OverlayInfoOps {
    fn stabilize_overlay_bounds_from_settings<R: Runtime>(
        window: &tauri::WebviewWindow<R>,
        settings_value: &AppSettings,
    ) -> Result<(), String> {
        let settings = settings_value.overlay_placement();
        let selected = OverlayInfoOps::target_monitor_from_runtime(window, settings_value)?;
        let (target_size, _) =
            OverlayInfoOps::overlay_window_bounds_for_monitor(OverlayWindowBoundsInput::new(
                OverlayMonitorGeometry::new(
                    selected.position_x(),
                    selected.position_y(),
                    selected.width(),
                    selected.height(),
                ),
                OverlayWindowScale::new(settings.width(), settings.height()),
                OverlayWindowOffsets::new(
                    settings.top_offset(),
                    settings.right_offset(),
                    settings.subtract_height(),
                ),
            ));
        let current_size = window
            .outer_size()
            .map_err(|error| format!("Failed to read overlay size: {error}"))?;

        if !OverlayInfoOps::overlay_window_size_matches_target(current_size, target_size) {
            window
                .set_size(target_size)
                .map_err(|error| format!("Failed to stabilize overlay size: {error}"))?;
        }

        let final_position = OverlayInfoOps::overlay_window_position_for_monitor(
            selected.position_x(),
            selected.position_y(),
            selected.width(),
            target_size.width,
            settings.top_offset(),
            settings.right_offset(),
        );

        if window.outer_position().ok() != Some(final_position) {
            window.set_position(final_position)
                .map_err(|error| format!("Failed to set overlay position: {error}"))?;
        }
        Ok(())
    }
}
