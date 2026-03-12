# Unity Legacy Debugger — 开发与调试指南

本文档记录了从原版 `unity-debug` 插件 fork 后的改造过程、遇到的核心问题及解决方案，供后续开发调试参考。

---

## 1. 项目背景

| 项 | 值 |
|---|---|
| 原版仓库 | Unity Technologies / vscode-unity-debug（已归档） |
| Fork 目的 | 维护一个适用于 Unity 4.x/5.x 的 VS Code 调试插件 |
| 包名 | `unity-legacy-debug` |
| Debugger Type | `unity-legacy`（避免与其他 Unity 调试插件冲突） |
| 版本 | 3.3.1 |
| Publisher | ashiqi |

### 改动概要

- `package.json`: name / displayName / publisher / debugger type 全部重命名
- `typescript/attach.ts`: 所有 `type: "unity"` → `type: "unity-legacy"`
- `debugger-libs/` 子模块使用 master HEAD（`632350d5`），相比 p1gd0g 版本（`945b9a37`）多约 399 个 commit

---

## 2. 编译环境

### 前置条件

| 工具 | 版本/路径 |
|---|---|
| MSBuild | `C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe` |
| Node.js | 需要 npm / npx |
| vsce | `npx @vscode/vsce` |
| PowerShell | 7.x（`pwsh`），不使用 Windows PowerShell 5.x |

### 编译步骤

```powershell
# 1. 编译 C# Debug Adapter
& "C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe" `
    D:\vscode-unity-debug\UnityDebug\UnityDebug.csproj /p:Configuration=Release

# 2. 编译 TypeScript
cd D:\vscode-unity-debug
npx tsc -p ./typescript

# 3. 打包 VSIX
npx @vscode/vsce package
# 产出: unity-legacy-debug-3.3.1.vsix
```

### 常见编译问题

| 症状 | 原因 | 解决 |
|---|---|---|
| `bin/UnityDebug.exe` 被锁无法覆盖 | 上次调试会话未退出，UnityDebug.exe 进程残留 | `Stop-Process -Name UnityDebug -Force` |
| Git Bash 中 `/p:Configuration=Release` 被解析为路径 | Bash 将 `/p:` 当作绝对路径前缀 | 用 `pwsh -NoProfile -Command "..."` 包装 MSBuild 调用 |
| 旧版 debugger-libs (`945b9a37`) 编译失败 | 旧项目使用 `packages.config` + `.NET 4.7.1`，与当前 csproj 格式不兼容 | 不要回退子模块版本，在源码层面修复兼容性问题 |

---

## 3. 架构速览

```
VS Code
  │
  ├─ TypeScript Frontend (typescript/attach.ts)
  │    ├─ 注册 debugger type "unity-legacy"
  │    ├─ 运行 UnityDebug.exe list → QuickPick 选择进程
  │    └─ 管理 Exception Breakpoint 状态 (exceptions.ts)
  │
  └─ C# Debug Adapter (bin/UnityDebug.exe)  ← DAP over stdin/stdout
       ├─ UnityDebugSession.cs          ← 核心 DAP 实现
       ├─ MonoDebug/src/Protocol.cs     ← DAP 消息序列化
       ├─ SoftDebuggerSession.cs        ← Mono VM 事件处理
       └─ UnityProcessDiscovery.cs      ← Unity 进程枚举
```

### 关键数据流

1. 用户触发 "Unity Attach Debugger" → TypeScript 运行 `UnityDebug.exe list`
2. 用户选择进程 → VS Code 以子进程启动 `UnityDebug.exe`（DAP stdin/stdout）
3. `UnityDebugSession.Attach()` → `SoftDebuggerSession` 连接 Unity Mono 运行时
4. 断点命中 → `HandleBreakEventSet` → 构建 `Backtrace` → 发送 DAP `StoppedEvent`
5. VS Code 请求 StackTrace/Variables → `UnityDebugSession` 返回帧和变量数据

---

## 4. 已知关键问题：Unity 卡死（断点命中时）

### 4.1 现象

- 附加调试器后，断点显示已解析（红色实心圆）
- 代码执行到断点时，Unity Editor UI 完全无响应（按钮点击无效）
- CPU 0%、内存约 200MB（非死循环，是主线程被 VM 挂起）
- 断开调试器连接后 Unity 恢复正常
- **同一编译产物在 Zed 编辑器中能正常命中断点**，问题仅出现在 VS Code

### 4.2 根因分析

新版 `debugger-libs` (master HEAD) 引入了 **Source Link** 功能。当断点命中时，调用链如下：

```
HandleBreakEventSet (SoftDebuggerSession.cs:2198)
 → GetThreadBacktrace (SoftDebuggerSession.cs:1004)
   → new Backtrace() 构造函数 (SoftDebuggerBacktrace.cs:26)
     → GetFrame(0) (SoftDebuggerBacktrace.cs:61)
       → GetStackFrames (SoftDebuggerBacktrace.cs:85)
         → CreateStackFrame (SoftDebuggerBacktrace.cs:191)
           → GetSourceLink (SoftDebuggerSession.cs:969)
             → GetSourceLinkMaps (SoftDebuggerSession.cs:943)
               → GetPdbData (SoftDebuggerSession.cs:918)
                 → AssemblyMirror.GetPdbBlob() (AssemblyMirror.cs:192)
                   → VirtualMachine.CheckProtocolVersion(2, 47)
                     → 💥 NotSupportedException
```

**核心矛盾**：

- Unity 5.6.4 的 Mono 运行时只支持协议版本 **2.1**
- `GetPdbBlob()` 需要协议版本 **2.47+**
- `GetSourceLinkMaps` 中的版本分支逻辑（第 939-943 行）：

```csharp
if (asm.VirtualMachine.Version.AtLeast(2, 48)) {
    jsonString = asm.ManifestModule.SourceLink;  // 快速路径（2.48+）
} else {
    jsonString = GetPdbData(asm)?.GetSourceLinkBlob();  // ← 走这条路！
}
```

Mono 2.1 < 2.48，进入 else 分支调用 `GetPdbData(asm)` → 内部调用 `asm.GetPdbBlob()` → `CheckProtocolVersion(2, 47)` → 抛 `NotSupportedException`。

异常未被捕获，导致 `HandleBreakEventSet` 中断，**VM 永远停留在 Suspended 状态**，Unity 主线程无法恢复。

### 4.3 为什么 Zed 能工作？

Zed 和 VS Code 都通过同一个 `UnityDebug.exe` 通信，但断点命中后的 DAP 交互流程不同。VS Code 触发了 `HandleBreakEventSet` → `GetThreadBacktrace` → `CreateStackFrame` 的完整调用链，而 Zed 的 DAP 实现可能在帧构建路径上有差异，未触发 Source Link 的 PDB 获取逻辑。

### 4.4 修复方案

在 `SoftDebuggerSession.cs` 的 `GetPdbData` 方法开头添加协议版本检查：

```csharp
// 文件: debugger-libs/Mono.Debugging.Soft/SoftDebuggerSession.cs
// 方法: GetPdbData(AssemblyMirror asm)

internal PortablePdbData GetPdbData (AssemblyMirror asm)
{
    // GetPdbBlob() requires protocol version 2.47+; bail out early for older runtimes
    // to avoid NotSupportedException on e.g. Unity 5.x Mono 2.1
    if (!asm.VirtualMachine.Version.AtLeast (2, 47))
        return null;

    // ... 原有逻辑不变
}
```

**原因**：这是最精确的修复点 —— 直接在调用 `GetPdbBlob()` 的上层方法中进行版本守卫，而非在外层大范围 catch。

### 4.5 防御性修复（安全 Resume）

在 `HandleEventSet` 方法中为 `HandleBreakEventSet` 添加了 try-catch，确保即使未来出现其他异常，VM 也能被 Resume：

```csharp
// 文件: debugger-libs/Mono.Debugging.Soft/SoftDebuggerSession.cs
// 方法: HandleEventSet(EventSet es) 中调用 HandleBreakEventSet 的位置

try {
    HandleBreakEventSet (es.Events, false);
} catch (Exception ex) {
    DiagLog($"[DIAG] HandleBreakEventSet FAILED: {ex.GetType().Name}: {ex.Message}");
    try {
        current_thread = null;
        vm.Resume ();
        DiagLog("[DIAG] Safety vm.Resume() after HandleBreakEventSet failure");
    } catch (VMNotSuspendedException) { }
    catch (Exception resumeEx) {
        DiagLog($"[DIAG] Safety vm.Resume() also failed: {resumeEx.Message}");
    }
    throw;
}
```

> 注意：如果只有安全 Resume 而没有 `GetPdbData` 版本检查，断点会进入"命中→异常→Resume→立即再命中"的循环，Unity 看起来仍然卡死。两个修复必须同时存在。

---

## 5. 诊断日志系统

### 5.1 日志文件

调试过程中添加了多层诊断日志，**建议在确认稳定后可选择性移除或通过开关控制**：

| 日志文件 | 位置 | 内容 |
|---|---|---|
| `UnityDebug-log.txt` | 插件运行目录 | 原有日志 + DAP 请求计时 |
| `SoftDebugger-diag.txt` | 插件运行目录 | VM 事件循环、Suspend/Resume、异常堆栈 |

### 5.2 Protocol.cs 中的诊断

`MonoDebug/src/Protocol.cs` 的 `Dispatch` 方法中添加了请求耗时日志：

```csharp
// [DIAG] 请求开始/完成/异常的计时
[DIAG] >>> Request seq=1 command=initialize
[DIAG] <<< Request seq=1 command=initialize completed in 37ms
```

### 5.3 UnityDebugSession.cs 中的诊断

添加了所有 `Target*` 事件回调的日志，以及 Connect/SetBreakpoints/Continue/Disconnect 的详细日志。

### 5.4 SoftDebuggerSession.cs 中的诊断

- `DiagLog` 静态方法写入独立文件 `SoftDebugger-diag.txt`
- EventHandler 主循环：记录每个 `vm.GetNextEventSet()` 返回的事件
- `HandleEventSet`：记录事件类型、SuspendPolicy、vm.Resume() 调用
- `HandleBreakEventSet`：记录断点命中、异常时的完整堆栈

---

## 6. debugger-libs 子模块说明

### 版本对比

| 版本 | Commit | 说明 |
|---|---|---|
| p1gd0g 使用 | `945b9a37` | 较旧，无 Source Link 功能，与 Unity 5.x Mono 2.1 兼容 |
| 当前使用 | `632350d5` (master HEAD) | 399 commits newer，有 Source Link 等新功能 |

### 为什么不回退到旧版

1. 旧版项目使用 `packages.config` + `.NET 4.7.1` 项目格式
2. 当前 `UnityDebug.csproj` 使用新格式，两者不兼容
3. 直接替换编译好的 DLL 也不行 —— API 签名已变化，`UnityDebug.exe` 无法加载旧版 DLL
4. 正确做法是**在源码层面修复兼容性问题**（如上述 `GetPdbData` 版本检查）

### 399 个 commit 的内容分布

| 数量 | 类别 | 说明 |
|---:|---|---|
| 46 | BugFix | 各类 bug 修复（NRE、crash、hang） |
| 38 | Tests | 单元测试新增/修复 |
| 31 | Breakpoints/Stepping | 断点解析、单步执行改进 |
| 29 | Evaluation/Variables | 表达式求值、变量检查增强 |
| **21** | **SourceLink/PDB** | **Source Link 支持、Portable PDB 读取 ← 导致卡死的功能** |
| **15** | **Protocol/Compat** | **协议版本升级、旧运行时兼容** |
| 15 | Build/Infra | Cecil 切 NuGet、签名、项目结构 |
| 12 | Exceptions | 异常断点、Catchpoint 功能 |
| 6 | TypeSupport | Tuple、Nullable、Enum、Lambda 支持 |
| 6 | Threading | 多线程调试、子进程调试 |
| 2 | Process/Attach | 附加流程改进 |
| 1 | Performance | 性能优化/缓存 |

### 协议版本兼容性全面审查（已完成）

对 `debugger-libs` 中所有 `CheckProtocolVersion` 和 `AtLeast` 调用进行了逐项排查，确认高版本 API 在上层调用时的守卫情况：

| API | 需要版本 | 调用位置 | 守卫情况 |
|---|---|---|---|
| `AssemblyMirror.GetPdbBlob()` | 2.47 | `SoftDebuggerSession.GetPdbData()` | **已修复** — 添加了 `AtLeast(2,47)` |
| `AssemblyMirror.Domain` | 2.45 | `SoftDebuggerSession.RegisterAssembly()` | 有守卫，fallback 到 `GetAssemblyObject().Domain` |
| `AssemblyMirror.IsDynamic` | 2.47 | Mono.Debugging.Soft 未调用 | 不涉及 |
| `AssemblyMirror.HasDebugInfo` | 2.51 | Mono.Debugging.Soft 未调用 | 不涉及 |
| `AssemblyMirror.GetMetadataBlob()` | 2.47 | Mono.Debugging.Soft 未调用 | 不涉及 |
| `ModuleMirror.SourceLink` | 2.48 | `GetSourceLinkMaps()` | 有守卫 `AtLeast(2,48)` |
| `StackFrame.Domain` | 2.38 | `SoftEvaluationContext` 构造函数 | 自带 fallback `AtLeast(2,38)` |
| `ThreadMirror.ElapsedTime()` | 2.50 | `OnGetElapsedTime()` | **无守卫，但 DAP 层未调用** |
| `MethodMirror.GetScopes()` | 2.43 | `SoftDebuggerAdaptor:917` | 在 `AtLeast(2,43)` 条件内 |
| `MethodMirror.GetGenericMethodDefinition()` | 2.12 | `SoftDebuggerBacktrace:109` | 在 `AtLeast(2,12)` 条件内 |
| `MethodMirror.GetGenericArguments()` | 2.15 | `SoftDebuggerBacktrace:114` | 在 `AtLeast(2,15)` 条件内 |
| `MethodMirror.MakeGenericMethod()` | 2.24 | `SoftDebuggerAdaptor:2470` | 在 `AtLeast(2,24)` 条件内 |
| `AppDomainMirror.CreateByteArray()` | 2.52 | `SoftDebuggerAdaptor:566` | 在 `AtLeast(2,52)` 条件内 |
| `ExceptionEventRequest.IncludeSubclasses` | 2.25 | `SoftDebuggerSession:1393` | 有守卫 `AtLeast(2,25)` |
| `ObjectMirror.Domain` | 2.5 | 多处 | 自带 fallback `AtLeast(2,5)` |

**结论**：在断点命中路径上，唯一存在版本守卫缺失的就是 `GetPdbData` → `GetPdbBlob()` —— 已修复。其余高版本 API 调用均有正确的前置版本检查或 fallback 逻辑。`ElapsedTime()` (2.50) 虽然无守卫，但我们的 DAP 层不调用它，无风险。

### 后续排查方法

如果未来再遇到 `NotSupportedException` 或 `CheckProtocolVersion` 失败：

1. 在 `debugger-libs/Mono.Debugger.Soft/` 中搜索 `CheckProtocolVersion`
2. 在 `debugger-libs/Mono.Debugging.Soft/` 中搜索 `AtLeast` 调用
3. 确认每个高版本 API 调用前都有对应的版本检查

```powershell
# 搜索所有协议版本检查点
rg "CheckProtocolVersion|\.AtLeast\s*\(" debugger-libs/ --type cs
```

---

## 7. 关键文件速查表

| 文件 | 作用 | 修改频率 |
|---|---|---|
| `package.json` | 插件清单、debugger type 定义 | 低 |
| `typescript/attach.ts` | VS Code 前端入口 | 低 |
| `UnityDebug/UnityDebugSession.cs` | DAP 会话核心实现 | 中 |
| `MonoDebug/src/Protocol.cs` | DAP 消息分发 | 低 |
| `debugger-libs/Mono.Debugging.Soft/SoftDebuggerSession.cs` | **VM 事件处理、断点、Source Link** | 高（兼容性修复集中在这里） |
| `debugger-libs/Mono.Debugging.Soft/SoftDebuggerBacktrace.cs` | 堆栈帧构建 | 低 |
| `debugger-libs/Mono.Debugger.Soft/Mono.Debugger.Soft/AssemblyMirror.cs` | Assembly 镜像（含 `GetPdbBlob`） | 低 |
| `debugger-libs/Mono.Debugger.Soft/Mono.Debugger.Soft/VirtualMachine.cs` | VM 连接、协议版本检查 | 低 |

---

## 8. 调试技巧

### 快速复现流程

1. 编译: MSBuild → Release
2. 打包: `npx @vscode/vsce package`
3. 安装: VS Code → Extensions → Install from VSIX
4. 在 Unity 项目中设置断点
5. VS Code → Run → Attach Unity Debugger → 选择 Unity Editor
6. 在 Unity 中触发断点代码

### 查看诊断日志

日志文件在插件安装目录下（即 `bin/UnityDebug.exe` 同级目录）：

```powershell
# 查找插件安装位置
Get-ChildItem "$env:USERPROFILE\.vscode\extensions\ashiqi.unity-legacy-debug-*\bin\"

# 查看日志
Get-Content "...\bin\SoftDebugger-diag.txt" -Tail 50
Get-Content "...\bin\UnityDebug-log.txt" -Tail 50
```

### "No Unity Process Found" 排查

`UnityDebug.exe list` 通过 `UnityProcessDiscovery.GetAttachableProcesses()` 枚举进程，
包含三个来源：Editor 进程、Player 广播、iOS USB。

**Editor 进程匹配逻辑** (`UnityProcessDiscovery.cs:157`)：

硬编码匹配 `"Unity"` 和 `"Unity Editor"` 两个进程名（大小写不敏感，精确匹配）。
如果实际进程名不同（如 Hub 启动的特殊名称），则匹配不到。

排查命令：

```powershell
# 检查当前系统中 Unity 相关进程的实际名称
Get-Process | Where-Object { $_.ProcessName -like "*Unity*" } | Select-Object Id, ProcessName, MainWindowTitle
```

**常见原因**：

| 原因 | 说明 |
|---|---|
| Unity 尚未完全启动 | 进程存在但名称还不是 `Unity`，枚举时错过 |
| 进程名不匹配 | 实际进程名不是 `"Unity"` 或 `"Unity Editor"` |
| Player 连接超时 | 远程 Player 通过 UDP 广播发现，最多等待 3 秒（12×250ms） |
| `UnityDebug.exe list` 崩溃 | exe 抛异常 → stdout 为空 → 显示 "No Unity Process Found" |

### p1gd0g 版本参考

仓库地址: https://github.com/p1gd0g/vscode-unity-debug-301

该版本使用旧版 debugger-libs (`945b9a37`)，无 Source Link 问题，但项目格式不兼容。可作为行为对比的参考基准。
