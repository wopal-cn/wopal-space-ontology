# WopalSpace DSH preset bundle

本 bundle 固定适配 DSH `0.2.0-rc.2`，声明 `wopal`、`fae`、`rook` 三个 preset。每个角色的 `preset.yml` 与 `agent.cordis.yml` 保留为版本管理源；运行时仅加载生成的 `preset.patch.yml`，不读取旧 `.agent-presets/<id>` 软链。

## 生成与安装

使用目标运行时闭包内的官方 YAML 方言生成，不能使用独立安装的 alpha 包替代生成锚点：

```sh
node generate-presets.mjs /absolute/selected-closure/node_modules/@deepseek-ai/dsh/package.json
node generate-presets.mjs /absolute/selected-closure/node_modules/@deepseek-ai/dsh/package.json --check
ellamaka dsh plugin --profile web add /absolute/ontology/dsh/agents-presets
```

配置修改位于 `$WOPAL_HOME/dsh/home/profiles/web/cordis.patch.yml`。默认 preset 对应 `agent-preset-registry` 的 `selectedDefault`；在集成版设置页选择目标 preset，由官方表单保存。provider/model 和 auth token 同样由用户在集成版配置页配置，不复制独立 `~/.dsh` 的整份 home。

## 技能与角色边界

三个命名 preset 各自显式挂载 `skill-filesystem`。项目技能由 `<项目>/.dsh/skills` 指向对应 ontology 的 `skills/`，bundle 自带技能由 `customSkillDirs` 定位到安装包的 `wopal/skills/`。这两处缺少任意一处都会影响技能发现。

自带创作技能及其 references/templates 同步自 `@deepseek-ai/dsh-agent-preset@0.2.0-rc.2`，保留 Ellamaka 集成路径约束。fae 禁止提问、规划、委派；rook 的只读边界由执行策略承担，不因技能可见而放宽。

## 生效与恢复

重新生成并安装 bundle 后，检查注册及激活诊断，在新会话验证。已有会话保留已绑定的 preset revision；程序不会自动重试。代码或包版本替换需要重启产品。

升级前保留集成版 DSH home 与源目录快照；恢复时匹配旧引擎、旧闭包和旧 home。此 bundle 不删除用户的旧 preset 源目录，不清理会话、凭证或附件。
