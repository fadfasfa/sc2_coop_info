# 简体中文术语核对清单

核对日期：2026-09-06。语言标识为 `zh-CN`，周突变名称字段为 `nameZhCn`。

## 范围与状态

本清单记录翻译实施方的资源核查，不替代独立 QA、真实录像验证或两局真人试玩。资源已形成供 QA 使用的初版；未宣称所有译名都已通过国服客户端逐字核对。

| 资源 | 原有文本值 | 新增文案 | 核查范围 |
| --- | ---: | ---: | --- |
| `tauri-overlay/src/app/i18n/language_data.json` | 420 | 84 | 设置、页面、指挥官、地图、动态状态与悬浮窗 |
| `tauri-overlay/src/app/i18n/unit_translation_data.json` | 390 | 0 | 单位、建筑、召唤物、面板统计 |
| `tauri-overlay/src/app/i18n/commander_mastery.json` | 108 | 0 | 18 位指挥官，每位 6 项，原顺序 |
| `tauri-overlay/src/app/i18n/unit_composition.json` | 19 | 0 | 敌军组合 |
| `s2coop-analyzer/data/prestige_names.json` | 72 | 0 | 每位指挥官 P0—P3，原顺序 |
| `s2coop-analyzer/data/mutators.json` | 176 | 0 | 88 个因子名称与描述 |
| `s2coop-analyzer/data/weekly_mutations.json` | 180 | 0 | 180 个周突变名称，不改排程 |

- [x] 1,449 个中文值均非空；精通及威望数组长度与英文一致。
- [x] 所有原有 `en`、`ko`、canonical ID、aliases、资源路径、地图和因子列表保持原值；新增键补齐英韩中文案。
- [x] 占位符名称及重复次数与英文一致。
- [x] 未翻译昵称、玩家备注、聊天、文件路径、日志或作者更新说明正文。
- [x] 中文显示名不作为统计身份；实际身份与聚合行为由语言架构实现及 QA 验证。
- [ ] 独立 QA、三平台测试、真实录像和两局真人试玩：由集成验收记录独立报告。
- [ ] 下列暂译名称的国服客户端逐字核对：未完成，不能以资源非空测试代替。

## 来源与使用方式

1. 游戏字符串对照使用 [LunaCoopMod 的 zhCN 游戏字符串镜像](https://github.com/Aeroluna/LunaCoopMod/blob/a0c5ec9b33f34616e80e124e45b0ab5ea7a6b987/LunaMaguro_CoopMod.SC2Mod/zhCN.SC2Data/LocalizedData/GameStrings.txt)，以同一提交的 [enUS 文件](https://github.com/Aeroluna/LunaCoopMod/blob/a0c5ec9b33f34616e80e124e45b0ab5ea7a6b987/LunaMaguro_CoopMod.SC2Mod/enUS.SC2Data/LocalizedData/GameStrings.txt) 的相同游戏键交叉匹配。固定提交为 `a0c5ec9b33f34616e80e124e45b0ab5ea7a6b987`。这是社区维护的游戏数据镜像，不是暴雪官方发布渠道，也包含旧名称与模组名称；没有直接把它当作现行国服真源。
2. 本仓既有 `s2coop-analyzer/data/map_names.json` 提供录像地图别名到 canonical 名称的映射；用于核对天界封锁、机会渺茫、死亡摇篮和天穹坠落等，不修改该文件。
3. 合作任务维基的中英文对照用于复核：[阿巴瑟](https://starcraft.huijiwiki.com/wiki/合作任务/阿巴瑟)、[阿拉纳克](https://starcraft.huijiwiki.com/wiki/合作任务/阿拉纳克)、[菲尼克斯](https://starcraft.huijiwiki.com/wiki/合作任务/菲尼克斯)、[德哈卡](https://starcraft.huijiwiki.com/wiki/合作任务/德哈卡)、[霍纳与汉](https://starcraft.huijiwiki.com/wiki/合作任务/霍纳与汉)、[凯瑞甘](https://starcraft.huijiwiki.com/wiki/合作任务/凯瑞甘)、[蒙斯克](https://starcraft.huijiwiki.com/wiki/合作任务/蒙斯克)、[诺娃](https://starcraft.huijiwiki.com/wiki/合作任务/诺娃)、[斯旺](https://starcraft.huijiwiki.com/wiki/合作任务/斯旺)、[沃拉尊](https://starcraft.huijiwiki.com/wiki/合作任务/沃拉尊)、[扎加拉](https://starcraft.huijiwiki.com/wiki/合作任务/扎加拉)、[泽拉图](https://starcraft.huijiwiki.com/wiki/合作任务/泽拉图)、[斯台特曼](https://starcraft.huijiwiki.com/wiki/合作任务/斯台特曼)、[斯托科夫](https://starcraft.huijiwiki.com/wiki/合作任务/斯托科夫)。这些页面本轮直接请求返回 403，使用公开搜索提供的已抓取页面正文核对；不把该路径称作实时客户端验证。
4. 其他定向证据：[机械巢式战列空母](https://starcraft.huijiwiki.com/wiki/合作任务/斯台特曼/机械巢式战列空母)、[罗布“弹头哥”博斯韦尔](https://starcraft.huijiwiki.com/wiki/合作任务/泰凯斯/罗布“弹头哥”博斯韦尔)、[单位名词中英对照](https://starcraft.huijiwiki.com/wiki/星际争霸名词中英对照表)、[天界封锁](https://starcraft.huijiwiki.com/wiki/合作任务/天界封锁)、[机会渺茫](https://starcraft.huijiwiki.com/wiki/合作任务/机会渺茫)、[死亡摇篮](https://starcraft.huijiwiki.com/wiki/合作任务/死亡摇篮)。
5. 威望措辞的补充核对：[阿塔尼斯威望名称](https://wapbaike.baidu.com/item/阿塔尼斯/49980912)、[2020 年威望说明（历史对照，不作最新机制依据）](https://www.doyo.cn/article/403589)、[斯托科夫威望记录](https://moegirl.uk/index.php?title=阿列克谢·斯托科夫&variant=zh-hans)、[雷诺起义军游骑兵的中英同场记录](https://www.bilibili.com/video/BV1Lz421a7XS/)。仅引用名称与身份关系，不采用攻略强度判断。
6. UI 文案和 88 条因子描述根据本仓英文自行翻译；没有导入整份网页或整个游戏字符串库。临时研究缓存、机械补录脚本不属于上游贡献。

## 已处理的冲突与边界

| 项目 | 处理结果与原因 |
| --- | --- |
| `Destroyer` / `Ravager` | 塔达林单位使用“毁灭者”，异虫单位使用“破坏者”。镜像的英文文本匹配会误把前者映射为“破坏者”，已按阿拉纳克单位上下文纠正。 |
| `Vanguard` | 阿拉纳克单位显示“先锋”，未照搬其他上下文的“无情先锋”；canonical 不变。 |
| `Barrier` / `Avenger` / `Power Overwhelming` | 因子分别为“减伤屏障”“复仇战士”“灵能爆表”，不混用单位或技能的同名词。 |
| `Point Defense Drone` | 采用单位键支持的“定点防御无人机”，不取技能候选中的“定点防御靶机”。 |
| `Crooked Sam` | 采用完整单位名称““老油条”萨姆”，不将短昵称“老油条”当成另一实体。 |
| 泰凯斯不法之徒 | James / Kev / Miles / Rob 按 `Unit/Name/TychusWarhound`、`TychusMarauder`、`TychusFirebat`、`TychusHERC` 核对，不凭英文绰号直译。 |
| `Dead of Night` | 显示“亡者之夜”；保留原解析别名“求生无路”，二者不改变同一地图身份。 |
| 阿巴瑟与阿拉纳克威望 | 采用当前对照中的“无限进化”“灵魂巧匠”，不混用早期报道“无极进化”“灵魂工匠”。 |
| 雷诺 / 沃拉尊威望 | 当前采用“死水元帅”“起义军游骑兵”“精神休憩”“暗影守护者”；历史资料存在“死水警长”“游骑兵”“精神休息”“暗影守望者”。保留原英文及 P 索引以便核对。 |
| 精通标签 | 忠于现有英文的属性与顺序，不把镜像中较早的“诺娃复活缩减”错误用于现有 `Nova Energy Regeneration`。 |
| `Mag Mine` / `Magnetic Mine` 等同名 | 即使都显示“麦格天雷”，仍是不同 canonical 项；不得据中文名称合并。 |
| 周突变拼写差异 | `Shield Up!`、`Breath Of Destruction`、`Injustice League`、`Chain Explosion` 等保持原英文字段与 key，只增加中文。 |
| `Wheel of Misfortune` | 用地图中文后缀区分不同条目；地图后缀不是新增排程或 ID。 |
| 扩展 `Endurance` | 现英文“3x more”按游戏倍率语境译为“三倍”。未修改数值或机制；扩展模组若把此短语定义为增加三倍而非变为三倍，需由模组作者进一步确认。 |

## 威望核对表

P0 为原始称号，P1—P3 与现有数组索引严格对应。下表是采用的译文，不代表所有条目已在本机游戏菜单逐字验收。

| Commander | P0 | P1 | P2 | P3 |
| --- | --- | --- | --- | --- |
| Abathur | 进化大师 | 精华贮藏者 | 深隧惊惧 | 无限进化 |
| Alarak | 塔达林的高阶领主 | 灵魂巧匠 | 暴君晋升者 | 死亡阴影 |
| Artanis | 达拉姆大主教 | 勇敢激励者 | 星灵使节 | 方舟指挥官 |
| Dehaka | 原始虫群领袖 | 吞噬者 | 原始竞争者 | 原生双雄 |
| Fenix | 净化者执行官 | 阿昆德拉 | 网络管理员 | 不屈意志 |
| Horner | 雇佣兵首领和帝国上将 | 混沌模范夫妻 | 银翼指挥官 | 星系军火走私者 |
| Karax | 卡莱相位技师 | 战争建筑师 | 圣堂表象 | 天界太阳能 |
| Kerrigan | 刀锋女王 | 恶毒族长 | 人类的愚行 | 荒寂女王 |
| Mengsk | 帝国元首 | 毒性暴君 | 底层的力量 | 死亡贩子 |
| Nova | 帝国幽灵 | 雇佣兵 | 战术调度员 | 渗透专家 |
| Raynor | 游骑兵指挥官 | 死水元帅 | 狂暴骑手 | 起义军游骑兵 |
| Stetmann | 天才英雄 | 信号专家 | 最佳伙伴 | 石油大王 |
| Stukov | 被感染的中将 | 惊人血肉焊机 | 瘟疫守望者 | 尸群领主 |
| Swann | 首席工程师 | 重武器专家 | 机械修理工 | 运载总监 |
| Tychus | 传奇不法之徒 | 技术招聘专员 | 独狼 | 忠诚遛狗师 |
| Vorazun | 奈拉齐姆女族长 | 精神休憩 | 凋零虹吸 | 暗影守护者 |
| Zagara | 虫群虫母 | 爆蚊虫后 | 构造体之母 | 顶级掠食者 |
| Zeratul | 黑暗教长 | 黎明使徒 | 知识探求者 | 虚空先驱 |

## 附英文暂译清单

以下 49 项未取得足以确认现行国服正式名称的证据，使用中文暂译并附原英文。这里包含扩展单位、场景对象、扩展因子和未核实的周突变译名；没有将它们标为官方已核实。它们不阻止技术回归启动，但应在真人验收及 PR 说明中披露。

| 资源 | canonical key / 字段 | 中文显示（含英文） |
| --- | --- | --- |
| unit_translation_data.json | `Air Defense Cannon` | 防空炮（Air Defense Cannon） |
| unit_translation_data.json | `Dogs of War (Maguro Brood)` | 战争恶犬（Dogs of War） |
| unit_translation_data.json | `Dump Truck` | 自卸卡车（Dump Truck） |
| unit_translation_data.json | `Excavator` | 挖掘机（Excavator） |
| unit_translation_data.json | `Infestation Spire` | 感染尖塔（Infestation Spire） |
| unit_translation_data.json | `Infested Swarm Egg` | 被感染的虫群卵（Infested Swarm Egg） |
| unit_translation_data.json | `Jorium Stockpile` | 聚燃储备（Jorium Stockpile） |
| unit_translation_data.json | `Large Egg` | 大型虫卵（Large Egg） |
| unit_translation_data.json | `Logistics Headquarters` | 后勤总部（Logistics Headquarters） |
| unit_translation_data.json | `Psi-Indoctrinator` | 灵能教化装置（Psi-Indoctrinator） |
| unit_translation_data.json | `Sentry Bot` | 哨戒机器人（Sentry Bot） |
| unit_translation_data.json | `Slayn Elemental` | 斯雷恩元素生物（Slayn Elemental） |
| unit_translation_data.json | `Small Egg` | 小型虫卵（Small Egg） |
| unit_translation_data.json | `Tanker Truck` | 罐车（Tanker Truck） |
| unit_translation_data.json | `Terrazine Tank` | 地嗪储罐（Terrazine Tank） |
| unit_translation_data.json | `Wyld Wyngs` | 狂野之翼（Wyld Wyngs） |
| unit_translation_data.json | `Hut` | 小屋（Hut） |
| unit_translation_data.json | `Militarized Transport` | 武装运输船（Militarized Transport） |
| unit_translation_data.json | `Wolf Statue` | 狼雕像（Wolf Statue） |
| mutators.json | `TheMist.name` | 迷雾（The Mist） |
| mutators.json | `TheUsualSuspects.name` | 惯常嫌疑人（The Usual Suspects） |
| mutators.json | `SupremeCommander.name` | 最高指挥官（Supreme Commander） |
| mutators.json | `Shapeshifters.name` | 变形者（Shapeshifters） |
| mutators.json | `RipFieldGenerators.name` | 撕裂力场发生器（Rip Field Generators） |
| mutators.json | `RepulsiveField.name` | 排斥力场（Repulsive Field） |
| mutators.json | `OldTimes.name` | 旧日时光（Old Times） |
| mutators.json | `NuclearMines.name` | 核地雷（Nuclear Mines） |
| mutators.json | `Necronomicon.name` | 死灵之书（Necronomicon） |
| mutators.json | `Mothership.name` | 母舰（Mothership） |
| mutators.json | `Matryoshka.name` | 套娃（Matryoshka） |
| mutators.json | `LevelPlayingField.name` | 公平战场（Level Playing Field） |
| mutators.json | `InfestationStation.name` | 感染站（Infestation Station） |
| mutators.json | `ICollectIChange.name` | 收集与进化（I Collect, I Change） |
| mutators.json | `GreatWall.name` | 长城（Great Wall） |
| mutators.json | `Endurance.name` | 持久战（Endurance） |
| mutators.json | `DarkMirror.name` | 暗黑镜像（Dark Mirror） |
| mutators.json | `Bloodlust.name` | 嗜血（Bloodlust） |
| mutators.json | `BlizzConChallenge.name` | 暴雪嘉年华挑战（BlizzCon Challenge） |
| weekly_mutations.json | `Perfect Storm` | 完美风暴（Perfect Storm） |
| weekly_mutations.json | `Cold Adaptation` | 寒冷适应（Chilling Adaptation） |
| weekly_mutations.json | `Dance Dance Evolution` | 舞动进化（Dance Dance Evolution） |
| weekly_mutations.json | `Train of Pain` | 痛苦列车（Train of Pain） |
| weekly_mutations.json | `Resilient Rifts` | 坚韧裂痕（Resilient Rifts） |
| weekly_mutations.json | `Explosive Hunt` | 爆炸狩猎（Explosive Hunt） |
| weekly_mutations.json | `Tax Day` | 纳税日（Tax Day） |
| weekly_mutations.json | `Aggressive Recruitment` | 强制征募（Aggressive Recruitment） |
| weekly_mutations.json | `Scary Scavengers` | 惊魂拾荒者（Scary Scavengers） |
| weekly_mutations.json | `Of Mines and Miners` | 地雷与矿工（Of Mines and Miners） |
| weekly_mutations.json | `The League of Vermillains` | 维米尔恶人联盟（The League Of Vermillans） |

## 技术与发布边界

实施方只做了结构保真及占位符自检。自动测试、旧 payload、未知语言、中文同名单位、图标、即时切换、重启恢复、窗口布局及便携隔离由独立 QA 和主代理分别验收。任何未通过项均不得通过跳过测试来掩盖。这里没有安装包、录像、玩家备注或私人路径。

### Maintainer summary

This adds Simplified Chinese (`zh-CN`) without modifying the original English/Korean strings, identifiers, assets, mastery/prestige order, or mutation schedules. The table above explicitly identifies provisional names; they retain their English labels. Terminology was cross-checked against pinned community game-string data and Chinese Co-op references, not certified through the live Chinese client. Numeric behavior, parsing, statistics, and parallel analysis are outside this translation change. Independent QA and real-game acceptance are reported separately.
