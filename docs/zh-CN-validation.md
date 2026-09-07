# 简体中文验证记录 / zh-CN validation

## PR #1 后续：快捷方式辅助进程超时

- 将快捷方式动作移到 `spawn_blocking`，保持整个事务及 Windows mutex 在同一工作线程执行；不再阻塞异步工作线程。
- 新增标准库子进程执行器：单次 helper 15 秒截止，终止确认与输出回收分别有 2 秒宽限；stdout/stderr 并行持续读取、限额保存，避免管道背压和无界输出。
- 超时后终止并回收子进程；安装阶段失败不假定旧链接未变，而是在确认退出后检查现场再决定是否恢复备份。无法确认退出时保留现场并阻止后续快捷方式操作，不影响设置页解除 busy。
- 本轮前端两组类型检查、资源合同 10/10、build 通过；完整 Playwright 120/120 通过，包含两项中英文延迟超时反馈／解除 busy／再次点击回归。
- 现有 Windows COM 生产脚本隔离 fixture 的 10 项检查重跑通过。该 fixture 不执行 Rust 子进程编排。
- 新增 Rust 成功输出、双流大输出、挂起子进程和后代进程持有输出管道的执行器测试。本机仍缺少 Rust 工具链，无法在本机运行这些 Rust 测试。
- 新增只读权限的 `Shortcut process timeout tests` CI，在 Windows/macOS/Linux 直接编译生产 `bounded_process.rs` 并运行上述测试；具体结果绑定对应 PR 提交和 Actions run，不打包、不发布、不使用签名密钥。该窄测试不能代替整个 Tauri 应用原生构建，新包及真人验收缺口保持不变。

## 2026-09-07：个人 fork Draft PR 收口

目标为 `fadfasfa/sc2_coop_info:codex/zh-cn` → `fadfasfa/sc2_coop_info:main`，由仓库所有者审查、手动合并；不向原作者仓库发布 PR，不合并个人便携包装分支。以下为本轮复验，下方历史结果保留，不混作当前提交验收。

- `npm run typecheck`、`npm run typecheck:tests`、`npm run build` 通过；构建仅保留大 chunk 警告。
- `npm run test:zh-cn`：10/10 通过，包括原英文／韩文值、canonical 顺序、资源和排程保真；新增快捷方式反馈后共有 1,454 个中文文本值。
- `npm run test:config -- --workers=2`：118/118 通过，包含快捷方式创建／幂等／替换／失败／不可用的中英文反馈、设置页与中文悬浮窗回归。测试使用合成数据和 Tauri mock，不代表原生动作或真人对局通过。
- 在 Windows PowerShell 中由 `& .\tauri-overlay\tests\desktop-shortcut-windows.ps1` 调用 Rust 内嵌的实际生产脚本，10 项检查通过：已知桌面只读解析、四字段、中文及特殊字符、幂等读取、既有备份保留、锁定链接／备份失败保护、回滚备份保留及损坏旧链接拒绝且不写入。测试只创建独立临时 fixture，结束后删除该 fixture，不写真实桌面。此测试不执行 Rust 编排代码或新 EXE。
- 独立快捷方式审查指出崩溃后残留文件锁的问题，已改用内核命名 mutex；实际脚本测试还发现 PowerShell 5 的 null 参数转换使回滚失败，已改用 `[NullString]::Value` 并重跑通过。mutex 与 Rust 编排仍待原生编译测试。
- 本机 PATH 与标准用户 Rust 安装位置均没有可用 Cargo/Rust 工具链；未宣称当前 Rust 检查、工作区测试或 Windows 新包构建通过。
- 独立差异审查发现新安装的 `zh-CN` 系统语言被截断为 `zh` 并回退英文；已按完整 locale 修正简体中文默认选择，保留用户已保存设置及其他语言行为，并新增三组 Rust 纯函数测试（本机未运行）。
- 只读复核 [Actions 34110738466](https://github.com/fadfasfa/sc2_coop_info/actions/runs/34110738466)：Windows job 被取消；macOS/Linux 的 Rust 测试因 `capture_focused_window_visible_region` 的 `E0624` 失败。该运行绑定旧贡献 `24a0205`，不能用于当前快捷方式修复验收。
- 现有便携包 manifest 仍绑定 `f195a5a6`；未用旧包冒充当前源码产物，也未启动非隔离 EXE、读取原版配置或真实录像。
- 旧包只读完整性复核为 666/666 文件哈希匹配；既有桌面入口仍指向该旧包。这不是本次快捷方式代码的新包启动验收。
- 当前 PR 必须保留 Draft：最终 SHA 的 Rust/native、便携包 manifest/hash/启动路径、双屏/DPI/拔插和普通合作／周突变真人验收未闭环。49 个暂译项和历史跳过项仍按下文披露。

English: This review is for the owner's fork only. All 118 local browser tests, both TypeScript checks, the frontend build and 10 resource-contract tests passed. Native Rust, a new isolated package and real-game acceptance remain pending; the PR is a draft, not a release-ready claim. Personal packaging and private user data are excluded.

## 历史验证记录

更新：2026-09-06。当前结论：本地前端与资源回归通过；跨平台 Rust 自动门和 Windows 原生／真人试用尚未完成，不能据此宣称完整验收或提交稳定 PR。

最新远端复核：[Actions 34004188099](https://github.com/fadfasfa/sc2_coop_info/actions/runs/34004188099) 的 macOS 对贡献 `0af667c8c0cf1414ed7827cbebb9acb30e1f59c2` 得到 **101/105 Playwright 通过、4 项失败**。失败是英文 commander mastery 分布列表横向溢出、16 logical cores 性能窗 DPR 1／1.5 两项中文累计行裁切，以及 800px 中文设置页 `scrollWidth=802 > 801`。原断言保留，修复后的同平台复验仍未完成，未重跑通过前不能关闭；下文 105/105 仅为本地 Windows 浏览器结果，不代表三平台 GO。

后续最小修复已在本地验证：恢复英文／韩文原有字体回退，只给中文配置额外字体；中文性能窗减少固定间距、中文设置响应式堆叠及快捷键标签换行。原四项失败组本地4/4通过（5.7秒），随后完整105/105通过（49.0秒），两组typecheck、build、diff检查通过。新增按钮文字边界与英韩字体恢复断言均通过；800px设置页宽／scrollWidth均800，16核中文性能最后文字底边570px。此为 Windows 浏览器修后证据，仍待新提交在远端macOS复验，不覆盖既有失败记录。

## 范围与可复现命令

上游基线是 `fb16c6c7eacb4b5f3589e22795b0fc45334b01a1`，应用版本为 0.4.10。该基线相对 0.4.10 tag 仅有文档差异。此次本地 QA 对象是贡献提交 `d5e957458e036f9079810d08f21927e816005504` 加后续中文布局修复及独立回归测试，不是未修改的 `d5e9574` 本身。具体贡献 SHA 以对应 Actions／包 manifest 为准；最终提交后的 Actions 结果必须重新绑定最终 SHA。

在 `tauri-overlay` 下运行：

```text
npm ci
npm run typecheck
npm run typecheck:tests
npm run test:zh-cn
npm run build
npm run test:config -- --workers=2 --reporter=line
```

Playwright 使用 `CI=true`，自行启动仅绑定回环地址的开发服务；不复用已运行的服务。资源合同测试需 Git 中存在上述上游基线对象。Rust 从仓库根目录执行 `cargo test --workspace --locked -- --nocapture`，通过 GitHub Actions 执行；本地未安装 Rust/C++ 工具链。

## 自动检查结果

| 检查层级 | 当前证据与结果 |
| --- | --- |
| 依赖安装 | `npm ci` 通过；未修改依赖或 lockfile。仍有 7 项审计告警：5 high、1 moderate、1 low，不能当作安全清零。 |
| 前端／测试类型 | 两组 typecheck 通过。 |
| 七份中文资源 | Node 合同测试 10/10，通过 1,449 个中文值覆盖与非空检查；包括 1,365 个原有文本值和 84 个新增 UI 文案。 |
| 原始数据不变 | 深比较保留原英文、韩文、canonical 字段、数组长度／顺序；占位符名称与重复数量一致。静态资源和未修改排程按 Git-normalized identity 比对通过。 |
| 前端构建 | `npm run build` 通过；保留既有大 chunk 警告，不进行无关打包重构。 |
| 全量浏览器回归 | 105/105 通过，47.9 秒。追加几何证据文件保存后，受影响中文测试再次 18/18 通过，18.3 秒。没有通过新增 skip 或降低布局断言隐藏失败。 |
| Windows Rust 已提交候选 | [集成候选 Actions](https://github.com/fadfasfa/sc2_coop_info/actions/runs/33978583842) 的未包装 `d5e9574` workspace 测试通过；新增 `tests/zh_cn.rs` 仍须最终 SHA 的 Actions 编译执行，不能借用旧候选结果。 |
| macOS／Linux Rust | [上游基线 Actions](https://github.com/fadfasfa/sc2_coop_info/actions/runs/33975399426) 与上述集成候选均为同一 `E0624`：`today_win_bonus/window_capture.rs:165` 调用 `detector.rs:49` 的私有 `capture_focused_window_visible_region`。这是基线阻塞，未为汉化夹带跨平台修复；完整三平台自动门未通过。 |

中文回归覆盖语言 `en → zh-CN → ko → en`、未知语言、可选中文字段和旧 payload 回退、设置即时预览、延迟运行时同步、保存／模拟重载、恢复设置、重复短语的别名歧义、中文同名单位独立聚合、原昵称／备注不变、周突变旧新字段、图标路径和实际加载、相对时间、玩家归属、击杀／时长／统计值与随机选择请求不受语言影响。设置重载是在合成 Tauri mock 中验证；Rust 文件读回测试与真实桌面重启是不同层级。

四份旧 overlay 测试修正的是旧 fixture：补齐当前 `config_get/config_action` 与事件注销合同、将威望目录放进当前 runtime init payload；独立玩家窗口不再隐藏录像窗口会话面板，portrait 测试只测该窗口真实存在的节点。旧失败证据保留，所有相关测试已重跑，未修改生产窗口生命周期来迎合旧 mock。

## 视觉与数值对照

按现有设计验证，不进行视觉重设计。配置页涵盖设置、对局、玩家、周突变、统计、随机选择器、性能和链接页，视口为 390×844、800×900、1280×900；录像悬浮窗为 480×900、1000×900；性能悬浮窗为 400×600。

除页面横向溢出和按钮可达外，还以实际文字 Range fragments 检查录像昵称、指挥官／精通、地图／时间、击杀数值与单位表头之间的相互遮挡，以及性能窗标签／数值之间的所有交叉碰撞。透明悬浮窗只在合成测试 fixture 添加深色背景，没有修改生产背景。独立复核了长中文设置、窄统计表、录像、玩家信息、周突变扩展说明和性能窗截图。

性能测试使用相同数值、16 与 32 logical CPU rows，对照英文和中文；DPR 1 与 1.5 得到相同 CSS 几何结果：

| 400×600 性能窗 | 英文最后文字底边 | 中文最后文字底边 | 结论 |
| --- | ---: | ---: | --- |
| 16 logical cores | 671 px | 586 px | 中文受测文本均在窗内，无相互遮挡。 |
| 32 logical cores | 1007 px | 906 px | 两种语言仍有底部 CPU 行／累计值被固定高度裁切；中文没有新增高度回归，但不代表 32 核全可读通过。 |

上述数值来自本地 Windows 浏览器，不跨平台外推。最新 macOS 相同矩阵为16核英文702／中文611px、32核英文1054／中文947px；16核中文“累计”和“92.4%”两片段在590–611px，截图确认底部实际裁切，故两DPR测试失败。所有性能矩阵中文字相撞／横向溢出仍为0。800px设置截图还显示长快捷键按钮文字伸出按钮边界，回归测试已增加实际按钮文字边界检查，不能仅以页面宽度代表标签可读。

32 logical cores 是本机硬件对应场景，不能以 16 核结果替代。此为既有固定高度布局边界，未扩大为性能采样或窗口布局重构。浏览器 DPR 1.5 是栅格缩放检查，**不是 Windows 150% 原生显示缩放验收**。

## 真实录像／缓存缺失：不计为解析通过

以下 15 项在已保存的 Windows Actions 日志中打印 `skipping ...` 后提前返回，虽然 Rust harness 显示 `ok`，本报告不计入真实录像解析通过。日志按 `Running tests/...` 边界与测试名对应，并核对源代码 guard；未读取任何真实录像或 Accounts。

| 测试文件（仓库相对路径） | 测试名 | 缺失条件 |
| --- | --- | --- |
| `s2coop-analyzer/tests/generate_cache_timing_report.rs` | `detailed_report_timings_are_aggregated_when_enabled` | 未配置 Accounts |
| `s2coop-analyzer/tests/replay_analysis_cradle_enemy_comp.rs` | `full_cradle_replay_keeps_spawned_wave_comp` | 未配置指定录像 |
| `s2coop-analyzer/tests/replay_analysis_cradle_enemy_comp.rs` | `short_cradle_replay_identifies_comp_from_startup_removed_units` | 未配置指定录像 |
| `s2coop-analyzer/tests/replay_analysis_malwarfare_weekly.rs` | `malwarfare_weekly_replay_with_korean_filename_builds_detailed_report` | 未配置 Accounts |
| `s2coop-analyzer/tests/replay_analysis_rust_only_smoke.rs` | `rust_only_path_can_build_report_from_real_replay` | 未配置 Accounts |
| `s2protocol-port/tests/ordered_events.rs` | `command_metadata_decodes_from_command_events` | 未配置 Accounts |
| `s2protocol-port/tests/ordered_events.rs` | `filtered_events_only_parse_matches_filtered_ordered_replay_events` | 未配置 Accounts |
| `s2protocol-port/tests/ordered_events.rs` | `events_only_parse_matches_ordered_replay_events` | 未配置 Accounts |
| `s2protocol-port/tests/ordered_events.rs` | `filtered_ordered_file_parse_matches_filtered_events_only_parse` | 未配置 Accounts |
| `s2protocol-port/tests/ordered_events.rs` | `ordered_event_parse_matches_split_detailed_events` | 未配置 Accounts |
| `s2protocol-port/tests/parse_file_modes.rs` | `replay_parse_mode_controls_event_streams` | 未配置 Accounts |
| `s2protocol-port/tests/parse_file_modes.rs` | `replay_parse_options_can_skip_attributes` | 未配置 Accounts |
| `s2protocol-port/tests/tracker_events_real_replay.rs` | `malwarfare_weekly_replay_has_tracker_events` | 未配置 Accounts |
| `tauri-overlay/src-tauri/tests/replay_analysis.rs` | `mastery_sum_filters_partition_existing_cache_replays` | 缺少必要缓存 fixture |
| `tauri-overlay/src-tauri/tests/replay_analysis.rs` | `miner_evacuation_fastest_payload_matches_reference_fastest_replay` | 缺少必要缓存 fixture |

另有三个原本标记为 ignored 的真实 Accounts 性能 benchmark，未启用，也不计为通过：

- `detailed_analysis_sqlite_benchmark_support::candidate_flows::benchmark_candidate_pruning_flows_cold_warm`。
- `detailed_analysis_sqlite_benchmark_support::sqlite_runs::benchmark_full_detailed_analysis_to_sqlite`。
- `detailed_analysis_sqlite_benchmark_support::sqlite_runs::benchmark_warm_detailed_analysis_from_sqlite`。

入口为 `tauri-overlay/src-tauri/tests/detailed_analysis_sqlite_benchmark.rs`；具体实现为同级 `detailed_analysis_sqlite_benchmark_support/candidate_flows.rs` 与 `sqlite_runs.rs`。

## 尚未完成的门与术语范围

- 最终贡献 SHA 的三平台 Actions，以及新增 Rust 回归的实际编译执行。
- Windows 原生窗口当前缩放和 150% 缩放检查、托盘语言、全局快捷键、真正保存退出重开、指定历史录像。
- 普通合作和周突变各一局真实试用：开局玩家信息、结束自动统计、快捷键、悬浮窗、无崩溃、退出后无残留进程及原版数据不变。
- 私人便携包装的编译、隔离运行和原版保护验证另行记录；个人包装／工作流／运行资料不进入上游中文贡献。
- [术语清单](zh-CN-terminology.md) 披露 49 项附英文暂译和扩展语义未核项；自动资源覆盖不是官方术语逐项核实，未把核心实质语义冲突猜译为完成。

## English summary

Local resource contracts, both TypeScript checks, production frontend build and all 105 Playwright tests passed. The 18 affected Chinese tests were rerun after persisting geometry evidence and passed again. Tests use synthetic data only, preserve canonical identity/statistics, and explicitly check text-to-text collisions rather than only container bounds.

The subsequent macOS run for `0af667c8` passed 101/105 Playwright tests and failed four layout checks (English mastery-list overflow, two 16-core Chinese performance total-row clipping checks, and 800px Chinese settings overflow). Same-platform reruns of the fixes remain pending; the earlier local Windows result is not a cross-platform GO.

Minimal font-fallback/spacing/responsive fixes subsequently passed the original four failing tests and all 105 tests locally again, including stronger button-text containment and English/Korean font-restoration assertions. Both type checks and the build passed. The corrected commit still needs a macOS CI rerun; local Windows passing does not close that platform's failures.

Windows Rust passed for the earlier unbundled `d5e9574` candidate; the final commit and new Rust tests still require CI. macOS/Linux share the same upstream baseline `E0624` private-method error. Fifteen data-dependent tests returned early because real replay/cache fixtures were absent, and three existing real-data benchmarks remained ignored: none is claimed as real replay validation. A 32-core performance overlay still clips bottom rows in both languages at its fixed 400×600 default size, although Chinese adds no clipping regression. Browser DPR 1.5 does not replace native Windows 150% scaling, historical replay or the ordinary-co-op/weekly-mutation human trials. The 49 provisional translations and existing seven dependency-audit findings remain disclosed. The complete release/PR gate is not yet satisfied.
