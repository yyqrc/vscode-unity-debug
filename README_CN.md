# Unity Legacy Debugger

VS Code 的 Unity 4.x / 5.x 调试插件，通过 Mono Soft Debugger 协议直接在 VS Code 中调试 Unity Editor 和 Players 的 C# 代码。

> **注意**：对于 Unity 2018 及以上版本，请使用官方的 [Unity extension for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=visualstudiotoolsforunity.vstuc)。

## 功能特性

- 为 Unity Editor 和 Players（Windows、macOS、Linux、iOS、Android、Xbox One、PS4、Switch）附加 C# 调试器
- 条件断点和日志断点
- 变量检查和运行时值修改
- 异常断点配置（始终 / 从不 / 仅未处理）
- 通过 `EditorInstance.json` 支持多 Unity Editor 实例

## 系统要求

- VS Code 1.47+
- [C# 扩展](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp)
- .NET / Mono 运行时（macOS / Linux 仅限 — Windows 上以原生方式运行适配器）

## 使用方法

1. 安装本扩展。
2. 打开命令面板（`Ctrl+Shift+P`）并运行 **Unity Attach Debugger**。
3. 从 QuickPick 列表中选择要附加到的 Unity 进程。
4. 断点、单步执行和变量检查就可在 VS Code 中使用了。

或者，在 `launch.json` 中手动添加调试配置：

```json
{
    "name": "Unity Editor",
    "type": "unity-legacy",
    "request": "launch",
    "path": "${workspaceFolder}/Library/EditorInstance.json"
}
```

## 支持的目标平台

| 目标平台 | 配置名称 |
|---------|---------|
| Unity Editor | `Unity Editor` |
| Windows Player | `Windows Player` |
| macOS Player | `OSX Player` |
| Linux Player | `Linux Player` |
| iOS Player | `iOS Player` |
| Android Player | `Android Player` |
| Xbox One | `Xbox One Player` |
| PS4 | `PS4 Player` |
| Nintendo Switch | `SwitchPlayer` |

## 已知限制

- 专为 Unity 4.x 和 5.x（Mono 协议版本 2.1）设计。未在 Unity 2017+ 上测试。
- 不支持热重载 / 编辑时继续（Edit and Continue）。

## 致谢

基于 Unity Technologies 的 [unity-debug](https://github.com/Unity-Technologies/vscode-unity-debug) 扩展（MIT License）。

## 许可证

MIT
