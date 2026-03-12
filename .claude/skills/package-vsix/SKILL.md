---
name: package-vsix
description: Use when packaging the cgame-unity-debug extension into a .vsix file, building the C# adapter, compiling TypeScript, or releasing a new version. Triggers on "打包", "vsix", "package", "build", "release".
---

# Package VSIX

## Overview

在 Windows 上打包 cgame-unity-debug 扩展为 `.vsix`。`make` 不可用，`tsc`/`vsce` 在 Git Bash 中不可直接调用，必须通过 `pwsh` 包装。

**每次打包前必须先升级版本号。**

## 步骤 0：升级版本号

### 版本号规则（语义化版本 MAJOR.MINOR.PATCH）

| 本次变更类型 | 升哪位 | 示例 |
|-------------|--------|------|
| Bug 修复、日志优化、小调整 | PATCH | 3.3.0 → 3.3.1 |
| 新功能、行为改变、新命令 | MINOR，PATCH 归零 | 3.3.0 → 3.4.0 |
| 破坏性变更、架构重构 | MAJOR，其余归零 | 3.3.0 → 4.0.0 |

判断原则：**根据本次改动内容自行决定**，不确定时偏保守选低一级。

### 修改方式

读取 `package.json` 的 `version` 字段，计算新版本，然后更新：

```powershell
# 示例：将 3.3.0 → 3.3.1
pwsh -NoProfile -Command "(Get-Content D:\vscode-unity-debug\package.json -Raw) -replace '\"version\": \"3.3.0\"', '\"version\": \"3.3.1\"' | Set-Content D:\vscode-unity-debug\package.json -NoNewline"
```

同时更新 `package.json` 顶部的 `CHANGELOG` 或 `Changelog.txt`（如存在），记录本次变更摘要。

## 四步打包流程

### 步骤 1：编译 C# 适配器

```powershell
pwsh -NoProfile -Command "& 'C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe' 'D:\vscode-unity-debug\UnityDebug\UnityDebug.csproj' /p:Configuration=Release /v:minimal"
```

成功标志：末尾出现 `UnityDebug -> D:\vscode-unity-debug\bin\UnityDebug.exe`

### 步骤 2：编译 TypeScript

```powershell
pwsh -NoProfile -Command "cd D:\vscode-unity-debug; npx tsc -p ./typescript"
```

无输出 = 成功。

### 步骤 3：打包 VSIX

```powershell
pwsh -NoProfile -Command "cd D:\vscode-unity-debug; npx vsce package"
```

成功标志：`DONE  Packaged: D:\vscode-unity-debug\cgame-unity-debug-X.X.X.vsix`

## 输出

| 产物 | 路径 |
|------|------|
| C# 适配器 | `bin/UnityDebug.exe` |
| TS 编译输出 | `out/` |
| VSIX 包 | `cgame-unity-debug-{version}.vsix`（项目根目录） |

版本号来自 `package.json` 的 `version` 字段。

## 常见错误

| 错误 | 原因 | 修复 |
|------|------|------|
| `make: command not found` | Git Bash 无 make | 按上述三步手动执行 |
| `tsc: command not found` | 未用 pwsh 包装 | 改用 `pwsh -NoProfile -Command "npx tsc ..."` |
| MSBuild `/p:` 被误解析为路径 | Git Bash 路径扩展 | 必须通过 `pwsh -NoProfile -Command` 调用 |
| `warning MSB3277` 版本冲突 | 已知 DLL 版本冲突，无害 | 忽略，只关注 error |

## 安装已打包扩展

```powershell
pwsh -NoProfile -Command "code --install-extension D:\vscode-unity-debug\cgame-unity-debug-X.X.X.vsix --force"
```
