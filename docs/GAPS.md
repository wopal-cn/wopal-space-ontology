# GAPS — ontology Design vs Implementation Divergence

> **Status**: Active
> **Updated**: 2026-09-29
> **Design Source**: `./DESIGN.md`（差距对照的设计真相源，子设计见其 Sub-DESIGNs）
> **Companion**: 追踪 ontology 本体资产与 wopal-plugin 实现的目标态差距，逐项解决后关闭。

---

## Assembly Carriers

### ONT-G6: 类型装配载体与空间装配状态契约不一致（P0）

**Current**: coding 装配单还没有把通用 `dsh` 目录列入 `paths`；空间根模板和本体进化提案模板尚不能准确表达单文件状态、私有内容保盘与新资产归属。Agent 执行能力进化时缺少一次声明资产装配归属的固定槽位。

**Target**: 类型装配单使用可严格解析的引用并声明实际通用目录；空间根模板保盘私有内容而不忽略受跟踪的装配状态；进化提案对新增整项资产声明 `type-default` 或 `space-local`，技能中的维护命令语义与 CLI 自动状态提交一致。

**Design**: `./DESIGN-assembly.md`（引用、状态与 Generic Path Assembly）；`./DESIGN-evolution.md`（进化命令边界）。余下部分由本体提案 `enhance-assembly-carriers`（`paths`、根模板、Assembly Intent、技能措辞）承载。

**Exit**:
- [ ] coding 装配单引用与目标资产形态一致，`paths` 声明的目录能在隔离空间完整物化
- [ ] 根模板不忽略 `space-meta.json` 与用户文档，私有内容保盘路径被精确忽略
- [ ] 新整项资产在提案模板有装配归属槽位，维护技能不误称本地选择零根仓库提交

---

## Reference Documents

| 文档 | 说明 |
|------|------|
| `./DESIGN-assembly.md` | 装配模型设计 |
| `./DESIGN-capabilities.md` | 能力体系设计 |
| `./DESIGN-evolution.md` | 进化闭环设计 |
| `./DESIGN-wopal-plugin.md` | wopal-plugin 设计 |
