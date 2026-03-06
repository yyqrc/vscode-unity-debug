# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## Project Overview

VS Code debug adapter extension for Unity, forked from the archived `unity-debug` (Unity Technologies). Rebranded as **cgame-unity-debug** v3.1.0, publisher `cgame`, debugger type `cgame-unity`. The extension enables attaching a C# debugger to Unity Editor and various platform Players.

## Build & Development Commands

### Build C# Debug Adapter
```
xbuild /p:Configuration=Release
```
Compiles the C# solution and outputs `bin/UnityDebug.exe`. On Windows, use MSBuild or Visual Studio with the `VSCode-UnityDebug.sln` solution file. Requires .NET 4.7.2 / Mono toolchain.

Windows 具体命令:
```powershell
& "C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe" UnityDebug\UnityDebug.csproj /p:Configuration=Release
```
注意: Git Bash 中 `/p:` 前缀会被误解析为路径，需通过 `pwsh -NoProfile -Command "..."` 包装调用。

### Build TypeScript Extension
```
tsc -p ./typescript
```
Compiles TypeScript files from `typescript/` to `out/`. Output is CommonJS targeting ES5.

### Clean Build Artifacts
```
make clean
```
Removes `bin/` directory and runs xbuild Clean target.

### Package VSIX
```
make vsix
```
Cleans, rebuilds, then runs `vsce package` to produce a `.vsix` file for VS Code Marketplace distribution.

### Run Tests
Tests use NUnit 3. The test projects are in `Tests/UnityDebug.Tests/` and `Tests/PlayerConnectionTests/`. Build the solution first, then run with NUnit console runner or your IDE's test runner against the compiled test assemblies.

## Architecture

### Two-Layer Design

The extension follows the VS Code Debug Adapter Protocol (DAP) with two layers:

1. **TypeScript Frontend** (`typescript/`) — VS Code extension activation, debug configuration provider, and exception breakpoint UI. Entry point: `attach.ts` → compiled to `out/attach.js`.
2. **C# Debug Adapter** (`UnityDebug/`) — Standalone executable (`bin/UnityDebug.exe`) that implements DAP over stdin/stdout, using the Mono Soft Debugger to connect to Unity processes.

VS Code launches the C# adapter as a child process. On macOS/Linux it runs via `mono`; on Windows it runs directly as an exe.

### TypeScript Layer (`typescript/`)

**`attach.ts`** — Extension entry point registered via `package.json` `main: "./out/attach.js"`:
- Registers `UnityDebugConfigurationProvider` for debug type `"cgame-unity"`
- `provideDebugConfigurations()` returns 9 preset launch configs (Unity Editor + 8 platform Players)
- `resolveDebugConfiguration()` injects exception breakpoint settings before session start
- `startSession()` command shells out to `UnityDebug.exe list` to enumerate attachable Unity processes, presents a QuickPick, then starts a debug session with the selected process name
- Registers commands for the exception breakpoint tree view

**`exceptions.ts`** — Manages exception breakpoint state:
- `Exceptions` class implements `TreeDataProvider` for a sidebar tree view
- Tracks exception names with states: `always`, `never`, `unhandled`
- Sends `setExceptionBreakpoints` custom request to the debug adapter when state changes
- Default config: 12 System exception types, all set to `never`

### C# Debug Adapter (`UnityDebug/`)

**`Program.cs`** — Entry point with two modes:
- `list` argument: enumerates Unity processes via `UnityProcessDiscovery` and prints to stdout (consumed by TypeScript layer)
- No arguments: creates `UnityDebugSession`, starts DAP communication over stdin/stdout

**`UnityDebugSession.cs`** (1027 lines) — Core DAP implementation, the most critical file:
- Extends `DebugSession` base class (from linked `MonoDebug/src/` sources)
- **Initialize**: declares capabilities — conditional breakpoints, hover evaluation, exception options, set-variable support
- **Attach**: parses launch config `name` field → `UnityAttach.GetPID()` to find Unity process → creates `SoftDebuggerStartInfo` with IP/port → connects `SoftDebuggerSession`
- **Breakpoint management**: `SetBreakpoints()` handles conditional breakpoints, log points (converting `logMessage` to `TraceExpression`), hit count conditions
- **Execution control**: Continue, Next (StepOver), StepIn, StepOut, Pause — all delegated to the underlying `SoftDebuggerSession`
- **Data inspection**: Scopes/Variables/Evaluate/StackTrace/Threads — uses `ObjectValue` from Mono.Debugging, manages variable handles via `ObjectValueHandles` and `FrameHandles`
- **SetVariable**: supports runtime modification of variable values
- **Event handling**: wires `SoftDebuggerSession` events (TargetStopped, TargetHitBreakpoint, TargetExceptionThrown, TargetThreadStarted/Stopped) to DAP `StoppedEvent` and `ThreadEvent`
- **Exception handling**: `ExceptionStopped()` reports exception details; configurable via `SetExceptionBreakpoints` and `setExceptionBreakpoints` custom request
- Multi-instance support: when multiple Unity Editors run, reads `EditorInstance.json` from project `Library/` folder to match by `process_id`

**`UnityAttach.cs`** — Unity process discovery:
- Maps debug target names (e.g., "Unity Editor", "Windows Player") to process names
- `GetPID(name)`: resolves process by name or by `(processId)` suffix format
- Uses `UnityProcessDiscovery.GetAttachableProcesses()` from linked MonoDevelop sources

**`Platform.cs`** — OS detection utilities (`IsWindows`, `IsMac`, `IsLinux`, `IsLocal`)

**`Log.cs`** — File-based logging to `UnityDebug-log.txt` with debug/normal modes

**`Util.cs`** — Helper for Unity install location paths

### Linked Source Dependencies

The `UnityDebug.csproj` links source files from two external directories (not checked into this repo as full projects):

- **`MonoDebug/src/`**: DAP protocol implementation — `DebugSession.cs`, `Protocol.cs`, `Handles.cs`, `Utilities.cs`. These provide the base class for `UnityDebugSession` and the DAP message serialization.
- **`MonoDevelop.Debugger.Soft.Unity/`**: Unity-specific debugger integration — `UnityDebuggerSession.cs`, `UnitySoftDebuggerSession.cs`, `UnityProcessDiscovery.cs`, `PlayerConnection.cs`. These handle Unity process enumeration and the Mono Soft Debugger connection.

### External Libraries (`External/`)

32 DLLs including Mono.Cecil (IL manipulation), Mono.Debugging/Mono.Debugger.Soft (core debugger), Newtonsoft.Json, SyntaxTree.VisualStudio.Unity.Messaging (Unity Editor communication), GTK#/Cairo/Pango, ICSharpCode.NRefactory, Mono.Addins.

### Solution Structure (`VSCode-UnityDebug.sln`)

15 projects organized as:
- **UnityDebug**: Main debug adapter (outputs to `bin/`)
- **Tests/UnityDebug.Tests**: NUnit tests for debugger features (evaluation, breakpoints, stepping)
- **Tests/PlayerConnectionTests**: Tests for Unity player connection logic
- **Tests/UnityDebug.Tests.TestApp**: Test target application with classes for evaluation, breakpoints, and stepping scenarios
- **Tests/AppDomainClient**: AppDomain isolation test helper
- **Tests/NonUserCodeTestLib**: Library marked as non-user-code for step-through testing
- **debugger-libs/\***: Mono.Debugging, Mono.Debugger.Soft, Mono.Debugging.Soft (submodule/external)
- **External/cecil/\***: Mono.Cecil and Mono.Cecil.Mdb

### Data Flow

1. User triggers "Unity Attach Debugger" command in VS Code
2. TypeScript runs `UnityDebug.exe list` → parses stdout for available Unity processes
3. User picks a process from QuickPick
4. VS Code launches `UnityDebug.exe` as DAP child process (stdin/stdout)
5. `UnityDebugSession.Attach()` resolves target → connects `SoftDebuggerSession` to Unity's Mono runtime
6. DAP messages flow between VS Code ↔ `UnityDebugSession` for breakpoints, stepping, variable inspection
7. Exception breakpoint config flows from TypeScript `Exceptions` class → custom DAP request → C# adapter

## Known Issues & Fixes

**debugger-libs 子模块使用 master HEAD (`632350d5`)**, 比 p1gd0g 版本 (`945b9a37`) 新 ~399 commits。新版引入了 Source Link 功能，在低版本 Mono 协议 (如 Unity 5.x 的 Mono 2.1) 上会触发 `NotSupportedException`，导致 VM 卡在 Suspended 状态。

**已修复**: `SoftDebuggerSession.cs` 的 `GetPdbData()` 方法添加了 `AtLeast(2, 47)` 版本检查。

**如果未来再遇到类似 Unity 卡死/NotSupportedException**: 搜索 `CheckProtocolVersion` 和 `AtLeast` 调用，确认高版本 API 调用前有版本守卫。

详见 `docs/dev-guide.md`。
