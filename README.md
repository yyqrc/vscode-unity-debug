# Unity Legacy Debugger

A VS Code extension for debugging Unity 4.x / 5.x projects via the Mono Soft Debugger protocol. Attach a C# debugger to Unity Editor and Players directly from VS Code.

> **Note:** For Unity 2018+ projects, use the official [Unity extension for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=visualstudiotoolsforunity.vstuc) instead.

## Features

- Attach C# debugger to Unity Editor and Players (Windows, macOS, Linux, iOS, Android, Xbox One, PS4, Switch)
- Conditional breakpoints and log points
- Variable inspection and runtime value editing
- Exception breakpoint configuration (always / never / unhandled)
- Multi-instance Unity Editor support via `EditorInstance.json`

## Requirements

- VS Code 1.47+
- [C# extension](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp)
- .NET / Mono runtime (macOS / Linux only — Windows runs the adapter natively)

## Usage

1. Install the extension.
2. Open the Command Palette (`Ctrl+Shift+P`) and run **Unity Attach Debugger**.
3. Select the Unity process to attach to from the QuickPick list.
4. Breakpoints, stepping, and variable inspection are now available in VS Code.

Alternatively, add a debug configuration manually in `launch.json`:

```json
{
    "name": "Unity Editor",
    "type": "unity-legacy",
    "request": "launch",
    "path": "${workspaceFolder}/Library/EditorInstance.json"
}
```

## Supported Targets

| Target | Config name |
|--------|-------------|
| Unity Editor | `Unity Editor` |
| Windows Player | `Windows Player` |
| macOS Player | `OSX Player` |
| Linux Player | `Linux Player` |
| iOS Player | `iOS Player` |
| Android Player | `Android Player` |
| Xbox One | `Xbox One Player` |
| PS4 | `PS4 Player` |
| Nintendo Switch | `SwitchPlayer` |

## Known Limitations

- Designed for Unity 4.x and 5.x (Mono protocol version 2.1). Not tested with Unity 2017+.
- Hot reload / Edit and Continue is not supported.

## Credits

Based on the archived [unity-debug](https://github.com/Unity-Technologies/vscode-unity-debug) extension by Unity Technologies (MIT License).

## License

MIT
