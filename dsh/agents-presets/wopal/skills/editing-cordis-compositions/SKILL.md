---
name: editing-cordis-compositions
description: Use when creating, changing, or validating an agent preset or other Cordis composition for this harness, including deciding host versus preset placement and checking that an authored preset mounts.
---

# Editing Cordis compositions

Agent presets are ordinary `@deepseek-ai/dsh-agent-preset` declarations carried by bundle patches. Nothing edits a declaration in place: a preset is created or changed by installing a bundle whose patch declares or overrides it. This file states the declaration format; when it leaves a question open, read the `@deepseek-ai/dsh-agent-preset` README and `lib/types` declarations under the `packageDir` that `cordis_inspect_query` `Config.listConfigs` returns when queried with a `preset-<id>` row's `entry` id, or `packages/preset/agent-preset/src` in a source checkout.

## Ellamaka 集成部署

本技能基于 DSH 0.2.0-rc.2。集成版 `$DSH_HOME` 为 `$WOPAL_HOME/dsh/home`，用户配置写入 `profiles/web/cordis.patch.yml`，不使用独立官方安装的 `~/.dsh`，也不继续写旧 `settings.yaml`。

官方依赖位于 Ellamaka 管理的 `closures/<fingerprint>/`，只读参考。WopalSpace 的三个 preset 由 `@wopal/dsh-presets` bundle 声明；旧 `preset.yml` 与 `agent.cordis.yml` 是生成源，运行时消费生成的 `preset.patch.yml`。修改源后重新生成并安装 bundle，在新会话确认行为，既有会话保留原 revision。

安装使用 `ellamaka dsh plugin --profile web add <bundle 绝对目录>`：它把目录规格转成 `file:<绝对路径>` 交给官方 dsh 安装器（pnpm），由官方完成声明、依赖、lockfile 与 bundle 登记。本集成里 Wopal 没有 `plugin_manager` 工具，因此以 `install_bundle` 为中心的流程不适用；同样不要在 profile 目录手跑 pnpm 或手改 `package.json`。pnpm 是宿主前置条件（与官方 dsh 一致，产品不随包分发），缺失时安装会直接报错，需先让 `pnpm` 在 PATH 上。

插件的 `@deepseek-ai/*` 依赖必须写在 `peerDependencies`，由 dsh loader 从安装作用域解析（与 `file:`/`link:` 无关）；写进 `dependencies` 会在 profile 里装出第二份模块实例。保留旧源目录和迁移前快照，不依赖 `.agent-presets` 软链自动发现。项目技能经 `<项目>/.dsh/skills` 装配，bundle 自带技能经 `customSkillDirs` 挂载。

## Where declarations live

The shipped Web presets are `presets/<id>.patch.yml` files of the `@deepseek-ai/dsh-web-app` bundle, ids `standard`, `ptc`, `minimal` and `cordis`. Installed, the bundle resolves from the dsh installation, not the profile; querying `Config.listConfigs` with the `entry` id of any `preset-<id>` row it declares returns that `packageDir`. In a source checkout of DSH it is `packages/bundle/web-app/`. Read one file with the file-read tool when you need a template; `minimal.patch.yml` is the shortest. In Desktop the bundle sits inside `app.asar`, which shell commands cannot open. Load `cordis-composition-reference` for the patch dialect and the list of plugin packages a preset can mount.

A declaration row has these `config` fields: `id` (required, lowercase letters, digits and hyphens), `plugins` (required Cordis entry list), and optional `name`, `description` and `order` (roster position). The Loader row `id` is `preset-<id>` by convention.

## Create a preset

Write a bundle directory in the workspace with exactly two files, then install it.

`review-preset/package.json`:

```json
{
  "name": "@local/dsh-review-preset",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`review-preset/cordis.patch.yml`:

```yaml
- insert:
    - id: preset-review
      name: "@deepseek-ai/dsh-agent-preset"
      config:
        id: review
        name: Review
        description: Reviews changes with the shell only.
        order: 10
        plugins:
          - id: persona
            name: "@deepseek-ai/dsh-persona"
            config:
              prefix: You review software changes.
          - id: tool-bash
            name: "@deepseek-ai/dsh-tool-bash"
```

Install with `ellamaka dsh plugin --profile web add <absolute bundle directory>` in this deployment: it forwards the directory to the official dsh installer as `file:<abs>`, which performs package installation and bundle selection itself. Where `plugin_manager` is available, `action: install_bundle` with the same absolute directory is the equivalent entry; either way do not reproduce those steps with shell commands, and never hand-edit the profile's `package.json`.

## Change a shipped preset

Override the declaration by its Loader row id instead of inserting. The override replaces the complete `config`, so restate `id`, `plugins` and every other field the shipped file carries:

```yaml
- id: preset-standard
  name: "@deepseek-ai/dsh-agent-preset"
  config:
    id: standard
    order: 1
    plugins:
      # the shipped list with your changes
```

## Migrate a legacy preset

Before declaration rows, a user preset was a directory `$DSH_HOME/.agent-presets/<id>/` holding `preset.yml` (display `name`, `description`, `order`) and `agent.cordis.yml` (the plugin entry list). Nothing reads that directory any more. To migrate one, create a bundle as above whose declaration takes `id` from the directory name, `name`, `description`, and `order` from `preset.yml`, and `plugins` from `agent.cordis.yml` verbatim; check each plugin name against `cordis-composition-reference` because packages renamed since the preset was written fail at activation. Install it and verify the row in a new session. In this deployment, retain the legacy directory and migration snapshot for recovery.

## Verify

`plugin_manager` `list_bundles` lists the installed bundle; `list_plugins` shows the `preset-<id>` row with its activation state. A declaration whose activation fails stays on the roster with its diagnostic and cannot compose a session until the bundle is fixed and reinstalled. Existing sessions and their children keep the plugin revision they started with; validate changed behavior in a new session. Installing a bundle executes plugin code in the Host process, so it requires Full access or approval.

## Choose plugin placement

Host plugins supply shared services: tools and prompt registries, the Agent loop, sessions, persistence, settings, sandbox policy, model routes, and subagent backends. Preset plugins contribute scoped tools, persona, prompt sections, and policies to those registries. Preset revisions are eagerly activated once and shared by their selecting Agents.

A preset plugin that supplies a service must isolate the provider and all its consumers in the same realm. A service consumed by Host plugins belongs in the Host configuration. Scope controls contributions and event visibility; `isolate` controls service instances. Use ordinary Cordis groups for nested plugin lists. Keep `!!js` expressions only in plugin configuration or `disabled`; the Loader evaluates them when activating the child plugin. Resolve assets from installed packages rather than a preset directory.

## Extend the Host

For new plugin code or profile-wide capabilities, load `cordis-plugin-development`, author a workspace bundle, and install it with `plugin_manager`. Inspect available APIs through `cordis_inspect_list` and `cordis_inspect_query`, including a mounted plugin's Config schema through the Host `Config` provider; those tools do not invoke Remote methods. Verify the installed capability before reporting completion.
