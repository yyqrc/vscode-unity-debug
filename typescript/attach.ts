'use strict';

import {debug, workspace, commands, window, ExtensionContext, QuickPickItem, QuickPickOptions, DebugConfiguration, DebugConfigurationProvider, WorkspaceFolder, CancellationToken, ProviderResult, ProgressLocation} from 'vscode';
import {DebugProtocol} from 'vscode-debugprotocol';
import * as nls from 'vscode-nls';
import {exec} from 'child_process';
import { Exceptions, ExceptionConfigurations } from './exceptions';

const localize = nls.config({locale: process.env.VSCODE_NLS_CONFIG})();
var exceptions;

const DEFAULT_EXCEPTIONS: ExceptionConfigurations = {
    "System.Exception": "never",
    "System.SystemException": "never",
    "System.ArithmeticException": "never",
    "System.ArrayTypeMismatchException": "never",
    "System.DivideByZeroException": "never",
    "System.IndexOutOfRangeException": "never",
    "System.InvalidCastException": "never",
    "System.NullReferenceException": "never",
    "System.OutOfMemoryException": "never",
    "System.OverflowException": "never",
    "System.StackOverflowException": "never",
    "System.TypeInitializationException": "never"
};

export function activate(context: ExtensionContext) {
    extensionPath = context.extensionPath;
    context.subscriptions.push(debug.registerDebugConfigurationProvider("unity", new UnityDebugConfigurationProvider()));

    exceptions = new Exceptions(DEFAULT_EXCEPTIONS);
    window.registerTreeDataProvider("exceptions", exceptions);
    context.subscriptions.push(commands.registerCommand('exceptions.always', exception => exceptions.always(exception)));
    context.subscriptions.push(commands.registerCommand('exceptions.never', exception => exceptions.never(exception)));
    context.subscriptions.push(commands.registerCommand('exceptions.addEntry', t => exceptions.addEntry(t)));
	context.subscriptions.push(commands.registerCommand('attach.attachToDebugger', config => startSession(context, config)));
}

export function deactivate() {
}

class UnityDebugConfigurationProvider implements DebugConfigurationProvider {
	provideDebugConfigurations(folder: WorkspaceFolder | undefined, token?: CancellationToken): ProviderResult<DebugConfiguration[]> {
		const config = [
			{
				name: "Unity Editor",
				type: "unity",
				path: "${workspaceFolder}/Library/EditorInstance.json",
				request: "launch"
			},
			{
				name: "Windows Player",
				type: "unity",
				request: "launch"
			},
			{
				name: "OSX Player",
				type: "unity",
				request: "launch"
			},
			{
				name: "Linux Player",
				type: "unity",
				request: "launch"
			},
			{
				name: "iOS Player",
				type: "unity",
				request: "launch"
			},
			{
				name: "Android Player",
				type: "unity",
				request: "launch"
            },
            {
                name: "Xbox One Player",
                type: "unity",
                request: "launch"
            },
            {
                name: "PS4 Player",
                type: "unity",
                request: "launch"
            },
            {
                name: "SwitchPlayer",
                type: "unity",
                request: "launch"
            }
		];
		return config;
	}

	async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, token?: CancellationToken): Promise<DebugConfiguration | undefined> {
        if (debugConfiguration && !debugConfiguration.__exceptionOptions) {
            debugConfiguration.__exceptionOptions = exceptions.convertToExceptionOptionsDefault();
        }

        // 仅对 "Unity Editor" 类型且名称不含 PID 时才做进程选择
        if (debugConfiguration && debugConfiguration.name === 'Unity Editor' && !/ \(\d+\)/.test(debugConfiguration.name)) {
            const selected = await pickUnityEditorProcess();
            if (!selected) {
                return undefined; // 用户取消
            }
            debugConfiguration.name = selected;
        }

		return debugConfiguration;
	}
}

let extensionPath: string = "";

function listUnityProcesses(): Promise<string[]> {
    const execCommand = process.platform !== 'win32' ? "mono " : "";
    return new Promise((resolve) => {
        exec(execCommand + extensionPath + "/bin/UnityDebug.exe list", function (error, stdout) {
            const processes = stdout.split("\n").filter(l => l.trim().length > 0);
            resolve(processes);
        });
    });
}

async function pickUnityEditorProcess(): Promise<string | undefined> {
    const processes = await window.withProgress(
        { location: ProgressLocation.Notification, title: "Searching for Unity Editor processes...", cancellable: false },
        () => listUnityProcesses()
    );
    const editorProcesses = processes.filter(p => p.includes('Unity Editor'));
    if (editorProcesses.length === 0) {
        window.showErrorMessage("No Unity Editor process found.");
        return undefined;
    }
    if (editorProcesses.length === 1) {
        return editorProcesses[0];
    }
    return window.showQuickPick(editorProcesses, { placeHolder: "Select Unity Editor process to attach", ignoreFocusOut: true });
}

async function startSession(context: ExtensionContext, config: any) {
    const processes = await listUnityProcesses();
    if (processes.length === 0) {
        window.showErrorMessage("No Unity Process Found.");
        return;
    }
    const chosen = await window.showQuickPick(processes, { ignoreFocusOut: true });
    if (!chosen) {
        return;
    }
    const sessionConfig = {
        "name": chosen,
        "request": "launch",
        "type": "unity",
        "__exceptionOptions": exceptions.convertToExceptionOptionsDefault()
    };
    const response = await debug.startDebugging(undefined, sessionConfig);
    console.log("debug ended: " + response);
}