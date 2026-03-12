---
name: git-unity5x-branch
description: Use when committing fixes for Unity 5.x, pushing to the unity-5x branch, updating the debugger-libs submodule, or managing the forked submodule remote. Triggers on "提交", "push", "unity-5x", "submodule", "debugger-libs", "分支".
---

# Git Unity-5x Branch Workflow

## Overview

本项目维护两条独立分支线，Unity 5.x 专用修复只提交到 `unity-5x`，不合并到 `master`。
`debugger-libs` 子模块指向 **fork 仓库**（`yyqrc/debugger-libs`），原始 Unity-Technologies 仓库已归档只读。

## 仓库结构

| 仓库 | 地址 | 说明 |
|------|------|------|
| 主仓库 | `yyqrc/vscode-unity-debug` | VS Code 扩展 |
| 子模块 fork | `yyqrc/debugger-libs` | Mono 调试器，原仓库已归档 |
| 子模块上游 | `Unity-Technologies/debugger-libs` | 只读，不可推送 |

## 分支策略

| 分支 | 用途 | 版本范围 |
|------|------|---------|
| `unity-5x` | Unity 5.x 专用修复（Mono 2.1） | 3.x.x |
| `master` | Unity 2019+ 新功能（未来） | 4.x.x（待开启） |

**规则：两条分支独立演进，不互相合并。**

## 标准提交流程

### 步骤 1：确认当前在 unity-5x 分支

```bash
cd D:/vscode-unity-debug
git branch          # 应显示 * unity-5x

cd debugger-libs
git branch          # 应显示 * unity-5x
```

### 步骤 2：在子模块提交

```bash
cd D:/vscode-unity-debug/debugger-libs
git add <修改的文件>
git commit -m "fix: <描述>"
git push origin unity-5x
```

### 步骤 3：在主仓库更新子模块指针并提交

```bash
cd D:/vscode-unity-debug
git add debugger-libs   # 更新子模块指针
git add <其他修改文件>  # 如 package.json
git commit -m "CGame Unity Debug vX.X.X: <描述>"
git push origin unity-5x
```

## 常见陷阱

### ⚠️ 子模块 detached HEAD

切换分支后子模块可能回到 detached HEAD 状态，`git diff --stat` 显示已有改动但 `git status` 子模块显示 `modified content`。

**症状**：在子模块 `git log` 看到 commit，但 `git branch` 显示 `HEAD detached`。

**修复**：
```bash
cd debugger-libs
git checkout unity-5x      # 重新附加到分支
# 如果改动丢失，cherry-pick 对应 commit
git cherry-pick <commit-hash>
```

### ⚠️ 推送子模块报 403

原因：子模块 remote 仍指向 Unity-Technologies 归档仓库。

**修复**：
```bash
cd debugger-libs
git remote set-url origin https://github.com/yyqrc/debugger-libs.git
```

### ⚠️ 首次使用需 fork 子模块

```bash
gh repo fork Unity-Technologies/debugger-libs --clone=false
cd debugger-libs
git remote set-url origin https://github.com/yyqrc/debugger-libs.git
```

## 验证检查

提交前确认：
```bash
# 主仓库在正确分支
git branch | grep "* unity-5x"

# 子模块指针指向正确 commit
git submodule status | grep debugger-libs

# 子模块 remote 指向 fork
cd debugger-libs && git remote get-url origin
# 期望: https://github.com/yyqrc/debugger-libs.git
```
