#!/usr/bin/env bash
# -*- coding: utf-8 -*-
#
# worktree.sh — Git Worktree 管理工具（WopalSpace 适配版）
#
# 空间根目录定位：向上查找 .wopal/.git worktree 指针文件
# 主分支识别：git ls-remote --symref → symbolic-ref → main
# 创建基准：本地主分支最新已提交状态（不检查脏区，不触碰未提交变更）
#
# 用法：
#   ./scripts/worktree.sh create <project> <branch> [--existing]
#   ./scripts/worktree.sh list [project|--all]
#   ./scripts/worktree.sh remove <project> <branch>
#   ./scripts/worktree.sh prune <project>
#   ./scripts/worktree.sh help

set -euo pipefail

die() { echo "ERROR: $1" >&2; exit 1; }

# ============================================
# 空间根目录定位
# ============================================

find_workspace_root() {
    local dir
    dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    while [ "$dir" != "/" ]; do
        if [ -f "$dir/.wopal/.git" ]; then
            local content
            content=$(head -1 "$dir/.wopal/.git" 2>/dev/null || true)
            if [[ "$content" == gitdir:* ]]; then
                echo "$dir"
                return 0
            fi
        fi
        dir=$(dirname "$dir")
    done
    return 1
}

# ============================================
# 项目扫描
# ============================================

scan_projects() {
    local workspace_root="$1"
    local projects_root="$workspace_root/projects"
    [ -d "$projects_root" ] || return 0
    for entry in "$projects_root"/*; do
        [ -d "$entry" ] || continue
        [ -d "$entry/.git" ] || [ -f "$entry/.git" ] || continue
        basename "$entry"
    done | sort
}

resolve_project_dir() {
    local project="$1"
    local workspace_root="$2"
    local candidate="$workspace_root/projects/$project"
    if [ -d "$candidate/.git" ] || [ -f "$candidate/.git" ]; then
        echo "$candidate"
        return 0
    fi
    return 1
}

validate_project() {
    local project="$1"
    local workspace_root="$2"
    if ! resolve_project_dir "$project" "$workspace_root" >/dev/null; then
        local available
        available=$(scan_projects "$workspace_root" | tr '\n' ' ')
        die "invalid project: $project (available: $available)"
    fi
}

# ============================================
# 主分支识别
# ============================================

detect_main_branch() {
    local project_dir="$1"

    local result
    if result=$(git -C "$project_dir" ls-remote --symref origin HEAD 2>/dev/null); then
        local first_line
        first_line=$(echo "$result" | head -1)
        if [[ "$first_line" == "ref: refs/heads/"* ]]; then
            echo "${first_line##*/}" | sed 's/\t.*//'
            return 0
        fi
    fi

    if result=$(git -C "$project_dir" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null); then
        basename "$result"
        return 0
    fi

    echo "main"
}

# ============================================
# 依赖安装提示
# ============================================

print_install_hint() {
    local dir="$1"
    if [ -f "$dir/package.json" ]; then
        local pm
        pm=$(grep -o '"packageManager"[[:space:]]*:[[:space:]]*"[^"]*"' "$dir/package.json" 2>/dev/null | sed 's/.*"\([^"]*\)".*/\1/' | cut -d'@' -f1 || true)
        if [ -n "$pm" ]; then
            echo "install: cd $dir && $pm install"
        elif [ -f "$dir/pnpm-lock.yaml" ] || [ -f "$dir/pnpm-workspace.yaml" ]; then
            echo "install: cd $dir && pnpm install"
        elif [ -f "$dir/bun.lock" ] || [ -f "$dir/bun.lockb" ]; then
            echo "install: cd $dir && bun install"
        else
            echo "install: cd $dir && npm install"
        fi
    elif [ -f "$dir/pyproject.toml" ] || [ -f "$dir/requirements.txt" ]; then
        echo "install: cd $dir && pip install -e ."
    elif [ -f "$dir/Cargo.toml" ]; then
        echo "install: cd $dir && cargo build"
    elif [ -f "$dir/go.mod" ]; then
        echo "install: cd $dir && go mod download"
    fi
}

# ============================================
# create
# ============================================

cmd_create() {
    local project="$1"
    local branch="$2"
    shift 2

    [ -z "$project" ] && die "project required"
    [ -z "$branch" ] && die "branch required"

    local use_existing=false
    while [[ $# -gt 0 ]]; do
        case $1 in
            --existing) use_existing=true; shift ;;
            *) die "unknown option: $1" ;;
        esac
    done

    local workspace_root
    workspace_root=$(find_workspace_root) || die "workspace root not found"

    validate_project "$project" "$workspace_root"

    local project_dir
    project_dir=$(resolve_project_dir "$project" "$workspace_root") || die "project dir not found: $project"

    local main_branch
    main_branch=$(detect_main_branch "$project_dir")

    if ! git -C "$project_dir" rev-parse --verify "$main_branch" >/dev/null 2>&1; then
        die "local branch '$main_branch' not found, fetch or checkout first"
    fi

    local branch_path
    branch_path=$(echo "$branch" | sed 's/\//-/g')
    local worktree_base="$workspace_root/.worktrees"
    local worktree_path="$worktree_base/${project}-${branch_path}"

    [ -d "$worktree_path" ] && die "worktree already exists: $worktree_path"

    mkdir -p "$worktree_base"

    if [ "$use_existing" = true ]; then
        git -C "$project_dir" rev-parse --verify "$branch" >/dev/null 2>&1 || \
            die "branch '$branch' not found (--existing requires existing branch)"
        git -C "$project_dir" worktree add "$worktree_path" "$branch" >/dev/null 2>&1
    else
        git -C "$project_dir" rev-parse --verify "$branch" >/dev/null 2>&1 && \
            die "branch '$branch' already exists, use --existing to reuse"
        git -C "$project_dir" worktree add -b "$branch" "$worktree_path" "$main_branch" >/dev/null 2>&1

    if [ -f "$worktree_path/.gitmodules" ]; then
        echo "submodule: initialize from project instructions before building"
    fi
    fi

    echo "$worktree_path"
    print_install_hint "$worktree_path"
}

# ============================================
# list
# ============================================

cmd_list() {
    local filter_project=""
    local show_all=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --all) show_all=true; shift ;;
            *)     filter_project="$1"; shift ;;
        esac
    done

    local workspace_root
    workspace_root=$(find_workspace_root) || die "workspace root not found"

    local worktree_base="$workspace_root/.worktrees"
    [ -d "$worktree_base" ] || return 0

    for wt_dir in "$worktree_base"/*; do
        [ -d "$wt_dir" ] || continue
        local wt_name
        wt_name=$(basename "$wt_dir")

        if [ -n "$filter_project" ] && [ "$show_all" = false ]; then
            [[ "$wt_name" == "${filter_project}-"* ]] || continue
        fi

        [ -d "$wt_dir/.git" ] || [ -f "$wt_dir/.git" ] || continue
        echo "$wt_name"
    done
}

# ============================================
# remove
# ============================================

cmd_remove() {
    local project="$1"
    local branch="$2"
    shift 2 2>/dev/null || true

    [ -z "$project" ] && die "project required"
    [ -z "$branch" ] && die "branch required"

    local workspace_root
    workspace_root=$(find_workspace_root) || die "workspace root not found"

    validate_project "$project" "$workspace_root"

    local project_dir
    project_dir=$(resolve_project_dir "$project" "$workspace_root") || die "project dir not found: $project"

    local branch_path
    branch_path=$(echo "$branch" | sed 's/\//-/g')
    local worktree_path="$workspace_root/.worktrees/${project}-${branch_path}"

    if [ -d "$worktree_path" ]; then
        if ! git -C "$project_dir" worktree remove "$worktree_path" 2>/dev/null; then
            [ -z "$(git -C "$worktree_path" status --porcelain --ignore-submodules=none)" ] || \
                die "worktree contains local files: $worktree_path (worktree and branch were preserved)"
            git -C "$project_dir" worktree remove --force "$worktree_path" || \
                die "failed to remove worktree: $worktree_path (worktree and branch were preserved)"
        fi
        echo "removed worktree: $worktree_path"
    else
        git -C "$project_dir" worktree prune >/dev/null 2>&1
    fi

    local current_branch
    current_branch=$(git -C "$project_dir" symbolic-ref --short HEAD 2>/dev/null || echo "")

    if [ "$branch" = "$current_branch" ]; then
        return 0
    fi

    if git -C "$project_dir" rev-parse --verify "$branch" >/dev/null 2>&1; then
        git -C "$project_dir" branch -d "$branch" 2>/dev/null || \
            git -C "$project_dir" branch -D "$branch" >/dev/null 2>&1
        echo "deleted branch: $branch"
    fi
}

# ============================================
# prune
# ============================================

cmd_prune() {
    local project="$1"
    [ -z "$project" ] && die "project required"

    local workspace_root
    workspace_root=$(find_workspace_root) || die "workspace root not found"

    validate_project "$project" "$workspace_root"

    local project_dir
    project_dir=$(resolve_project_dir "$project" "$workspace_root") || die "project dir not found: $project"

    git -C "$project_dir" worktree prune
    echo "pruned worktrees for $project"
}

# ============================================
# help
# ============================================

cmd_help() {
    cat << 'EOF'
usage: worktree.sh <command> [args]

commands:
  create <project> <branch> [--existing]  create worktree from main branch
  list [project|--all]                    list worktrees
  remove <project> <branch>               remove worktree and branch
  prune <project>                         prune stale worktree records
  help                                    show this help

create:
  Default: creates new branch from local main branch HEAD.
  --existing: reuse an existing branch.
  Does NOT check dirty workspace or touch uncommitted changes.

path: .worktrees/<project>-<branch-slug>
EOF
}

# ============================================
# 主入口
# ============================================

main() {
    local cmd="${1:-help}"
    shift || true

    case "$cmd" in
        create)       cmd_create "$@" ;;
        list|ls)      cmd_list "$@" ;;
        remove|rm)    cmd_remove "$@" ;;
        prune)        cmd_prune "$@" ;;
        help|--help|-h) cmd_help ;;
        *)            die "unknown command: $cmd (use 'help')" ;;
    esac
}

main "$@"
