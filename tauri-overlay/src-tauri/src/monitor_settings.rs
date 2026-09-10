use display_info::DisplayInfo;
use tauri::{Manager, Runtime};

use crate::shared_types::MonitorOption;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MonitorDescriptor {
    name: String,
    position_x: i32,
    position_y: i32,
    width: u32,
    height: u32,
}

impl MonitorDescriptor {
    pub fn new(
        name: impl Into<String>,
        position_x: i32,
        position_y: i32,
        width: u32,
        height: u32,
    ) -> Self {
        Self {
            name: name.into(),
            position_x,
            position_y,
            width: width.max(1),
            height: height.max(1),
        }
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn position_x(&self) -> i32 {
        self.position_x
    }

    pub fn position_y(&self) -> i32 {
        self.position_y
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn matches_exactly(&self, other: &Self) -> bool {
        self.name == other.name
            && self.position_x == other.position_x
            && self.position_y == other.position_y
            && self.width == other.width
            && self.height == other.height
    }
}

pub struct MonitorSettingsOps;

impl MonitorSettingsOps {
    pub fn normalize_monitor_descriptors(
        mut monitors: Vec<MonitorDescriptor>,
    ) -> Vec<MonitorDescriptor> {
        MonitorSettingsOps::sort_monitor_descriptors(&mut monitors);

        for (idx, monitor) in monitors.iter_mut().enumerate() {
            if monitor.name.trim().is_empty() {
                monitor.name = format!("Monitor {}", idx + 1);
            }
        }

        monitors
    }
}

impl MonitorSettingsOps {
    fn sort_monitor_descriptors(monitors: &mut [MonitorDescriptor]) {
        monitors.sort_by(|left, right| {
            left.position_x
                .cmp(&right.position_x)
                .then(left.position_y.cmp(&right.position_y))
                .then(left.name.cmp(&right.name))
        });
    }
}

impl MonitorSettingsOps {
    fn runtime_monitor_descriptors<R: Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> Vec<MonitorDescriptor> {
        let mut monitors = window
            .available_monitors()
            .unwrap_or_default()
            .into_iter()
            .map(|monitor| {
                let position = monitor.position();
                let size = monitor.size();
                MonitorDescriptor::new(
                    monitor
                        .name()
                        .map(|value| value.trim().to_string())
                        .unwrap_or_default(),
                    position.x,
                    position.y,
                    size.width,
                    size.height,
                )
            })
            .collect::<Vec<_>>();

        MonitorSettingsOps::sort_monitor_descriptors(&mut monitors);
        monitors
    }
}

impl MonitorSettingsOps {
    fn named_monitor_descriptors() -> Vec<MonitorDescriptor> {
        let mut monitors = DisplayInfo::all()
            .unwrap_or_default()
            .into_iter()
            .map(|monitor| {
                let name = if !monitor.friendly_name.trim().is_empty() {
                    monitor.friendly_name.trim().to_string()
                } else {
                    monitor.name.trim().to_string()
                };
                MonitorDescriptor::new(name, monitor.x, monitor.y, monitor.width, monitor.height)
            })
            .collect::<Vec<_>>();

        MonitorSettingsOps::sort_monitor_descriptors(&mut monitors);
        monitors
    }
}

impl MonitorSettingsOps {
    pub fn resolve_monitor_descriptors(
        mut runtime_monitors: Vec<MonitorDescriptor>,
        mut named_monitors: Vec<MonitorDescriptor>,
    ) -> Vec<MonitorDescriptor> {
        MonitorSettingsOps::sort_monitor_descriptors(&mut runtime_monitors);
        MonitorSettingsOps::sort_monitor_descriptors(&mut named_monitors);

        if runtime_monitors.is_empty() {
            return MonitorSettingsOps::normalize_monitor_descriptors(named_monitors);
        }
        if named_monitors.is_empty() {
            return MonitorSettingsOps::normalize_monitor_descriptors(runtime_monitors);
        }

        let mut runtime_named = vec![false; runtime_monitors.len()];
        let mut named_used = vec![false; named_monitors.len()];

        for (runtime_index, runtime_monitor) in runtime_monitors.iter_mut().enumerate() {
            let matched = named_monitors
                .iter()
                .enumerate()
                .find(|(named_index, named_monitor)| {
                    !named_used[*named_index]
                        && runtime_monitor.position_x == named_monitor.position_x
                        && runtime_monitor.position_y == named_monitor.position_y
                });
            let Some((named_index, named_monitor)) = matched else {
                continue;
            };
            if !named_monitor.name.trim().is_empty() {
                runtime_monitor.name = named_monitor.name.clone();
                runtime_named[runtime_index] = true;
            }
            named_used[named_index] = true;
        }

        if runtime_monitors.len() == named_monitors.len() {
            for (runtime_index, runtime_monitor) in runtime_monitors.iter_mut().enumerate() {
                if runtime_named[runtime_index] {
                    continue;
                }
                let matched =
                    named_monitors
                        .iter()
                        .enumerate()
                        .find(|(named_index, named_monitor)| {
                            !named_used[*named_index] && !named_monitor.name.trim().is_empty()
                        });
                let Some((named_index, named_monitor)) = matched else {
                    continue;
                };
                runtime_monitor.name = named_monitor.name.clone();
                named_used[named_index] = true;
            }
        }

        MonitorSettingsOps::normalize_monitor_descriptors(runtime_monitors)
    }
}

impl MonitorSettingsOps {
    pub fn monitor_descriptors<R: Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> Vec<MonitorDescriptor> {
        MonitorSettingsOps::resolve_monitor_descriptors(
            MonitorSettingsOps::runtime_monitor_descriptors(window),
            MonitorSettingsOps::named_monitor_descriptors(),
        )
    }
}

impl MonitorSettingsOps {
    pub fn selected_monitor_index(requested_monitor: usize, monitor_count: usize) -> Option<usize> {
        if monitor_count == 0 {
            return None;
        }

        Some(
            requested_monitor
                .max(1)
                .saturating_sub(1)
                .min(monitor_count - 1),
        )
    }
}

impl MonitorSettingsOps {
    pub fn selected_monitor_descriptor(
        monitors: &[MonitorDescriptor],
        requested_monitor: usize,
    ) -> Option<&MonitorDescriptor> {
        let index = MonitorSettingsOps::selected_monitor_index(requested_monitor, monitors.len())?;
        monitors.get(index)
    }
}

impl MonitorSettingsOps {
    /// xcap reports macOS window bounds in points. Tauri's monitor bounds are
    /// physical pixels, including the origin, so select in points and return
    /// the original physical descriptor for placement and the recent cache.
    pub fn monitor_for_logical_window_rect(
        monitors: &[MonitorDescriptor],
        scale_factors: &[f64],
        rect: (i32, i32, u32, u32),
    ) -> Option<MonitorDescriptor> {
        if monitors.len() != scale_factors.len()
            || scale_factors
                .iter()
                .any(|scale| !scale.is_finite() || *scale <= 0.0)
        {
            return None;
        }
        let logical_monitors = monitors
            .iter()
            .zip(scale_factors)
            .map(|(monitor, scale)| {
                MonitorDescriptor::new(
                    monitor.name.clone(),
                    (f64::from(monitor.position_x) / scale).round() as i32,
                    (f64::from(monitor.position_y) / scale).round() as i32,
                    (f64::from(monitor.width) / scale).round() as u32,
                    (f64::from(monitor.height) / scale).round() as u32,
                )
            })
            .collect::<Vec<_>>();
        let selected = Self::monitor_for_window_rect(&logical_monitors, rect)?;
        let index = logical_monitors
            .iter()
            .position(|monitor| monitor == &selected)?;
        monitors.get(index).cloned()
    }

    pub fn monitor_for_sc2_window_rect<R: Runtime>(
        window: &tauri::WebviewWindow<R>,
        monitors: &[MonitorDescriptor],
        rect: (i32, i32, u32, u32),
    ) -> Option<MonitorDescriptor> {
        #[cfg(target_os = "macos")]
        {
            let runtime_monitors = window.available_monitors().ok()?;
            // Match geometry, not enumeration order or friendly display names.
            // If topology changed between snapshots, use recent/manual fallback.
            let scales = monitors
                .iter()
                .map(|monitor| {
                    runtime_monitors
                        .iter()
                        .find(|runtime| {
                            runtime.position().x == monitor.position_x
                                && runtime.position().y == monitor.position_y
                                && runtime.size().width == monitor.width
                                && runtime.size().height == monitor.height
                        })
                        .map(|runtime| runtime.scale_factor())
                })
                .collect::<Option<Vec<_>>>()?;
            Self::monitor_for_logical_window_rect(monitors, &scales, rect)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = window;
            Self::monitor_for_window_rect(monitors, rect)
        }
    }

    /// Return the monitor containing the window's center, falling back to the
    /// monitor with the largest intersection for windows spanning displays or
    /// whose center lies exactly on a display boundary.
    pub fn monitor_for_window_rect(
        monitors: &[MonitorDescriptor],
        rect: (i32, i32, u32, u32),
    ) -> Option<MonitorDescriptor> {
        let (window_x, window_y, window_width, window_height) = rect;
        if window_width == 0 || window_height == 0 {
            return None;
        }

        let center_x = i64::from(window_x) + i64::from(window_width) / 2;
        let center_y = i64::from(window_y) + i64::from(window_height) / 2;
        if let Some(monitor) = monitors.iter().find(|monitor| {
            let left = i64::from(monitor.position_x);
            let top = i64::from(monitor.position_y);
            let right = left + i64::from(monitor.width);
            let bottom = top + i64::from(monitor.height);
            center_x >= left && center_x < right && center_y >= top && center_y < bottom
        }) {
            return Some(monitor.clone());
        }

        let window_left = i64::from(window_x);
        let window_top = i64::from(window_y);
        let window_right = window_left + i64::from(window_width);
        let window_bottom = window_top + i64::from(window_height);
        monitors
            .iter()
            .filter_map(|monitor| {
                let left = window_left.max(i64::from(monitor.position_x));
                let top = window_top.max(i64::from(monitor.position_y));
                let right =
                    window_right.min(i64::from(monitor.position_x) + i64::from(monitor.width));
                let bottom =
                    window_bottom.min(i64::from(monitor.position_y) + i64::from(monitor.height));
                let area = (right - left).max(0) * (bottom - top).max(0);
                (area > 0).then_some((area, monitor))
            })
            .max_by_key(|(area, _monitor)| *area)
            .map(|(_area, monitor)| monitor.clone())
    }

    pub fn matching_recent_monitor(
        monitors: &[MonitorDescriptor],
        recent: Option<&MonitorDescriptor>,
    ) -> Option<MonitorDescriptor> {
        recent.and_then(|recent| {
            monitors
                .iter()
                .find(|monitor| monitor.matches_exactly(recent))
                .cloned()
        })
    }

    /// Resolve the placement target without relying on the current enumeration
    /// index. The saved monitor index remains the final, backwards-compatible
    /// fallback only.
    pub fn target_monitor(
        monitors: &[MonitorDescriptor],
        current_window_rect: Option<(i32, i32, u32, u32)>,
        recent_monitor: Option<&MonitorDescriptor>,
        requested_monitor: usize,
    ) -> Option<MonitorDescriptor> {
        current_window_rect
            .and_then(|rect| Self::monitor_for_window_rect(monitors, rect))
            .or_else(|| Self::matching_recent_monitor(monitors, recent_monitor))
            .or_else(|| Self::selected_monitor_descriptor(monitors, requested_monitor).cloned())
    }
}

impl MonitorSettingsOps {
    pub fn selected_monitor_for_window<R: Runtime>(
        window: &tauri::WebviewWindow<R>,
        requested_monitor: usize,
    ) -> Result<MonitorDescriptor, String> {
        let monitors = MonitorSettingsOps::monitor_descriptors(window);
        MonitorSettingsOps::selected_monitor_descriptor(&monitors, requested_monitor)
            .cloned()
            .ok_or_else(|| "No monitors detected".to_string())
    }
}

impl MonitorSettingsOps {
    pub fn monitor_catalog_from_descriptors(monitors: &[MonitorDescriptor]) -> Vec<MonitorOption> {
        monitors
            .iter()
            .enumerate()
            .map(|(idx, monitor)| MonitorOption {
                index: idx + 1,
                label: format!("{} - {}", idx + 1, monitor.name()),
            })
            .collect()
    }
}

impl MonitorSettingsOps {
    pub fn available_monitor_catalog<R: Runtime>(app: &tauri::AppHandle<R>) -> Vec<MonitorOption> {
        let window = app
            .get_webview_window("config")
            .or_else(|| app.get_webview_window("overlay"))
            .or_else(|| app.get_webview_window("performance"));
        let Some(window) = window else {
            return Vec::new();
        };

        MonitorSettingsOps::monitor_catalog_from_descriptors(
            &MonitorSettingsOps::monitor_descriptors(&window),
        )
    }
}
