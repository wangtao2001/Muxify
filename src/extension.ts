import * as vscode from 'vscode';
import { ConnectionManager } from './services/connectionManager';
import { TmuxService } from './services/tmuxService';
import { TmuxTreeProvider } from './providers/tmuxTreeProvider';
import { registerCommands } from './commands';

let connectionManager: ConnectionManager;
let tmuxService: TmuxService;
let treeProvider: TmuxTreeProvider;

/**
 * 插件激活时调用
 */
export function activate(context: vscode.ExtensionContext): void {
    // 初始化连接管理器
    connectionManager = new ConnectionManager(context);

    // 初始化 Tmux 服务
    tmuxService = new TmuxService(connectionManager);

    // 初始化树数据提供者
    treeProvider = new TmuxTreeProvider(connectionManager, tmuxService);

    // 注册树视图
    const treeView = vscode.window.createTreeView('muxify.sessions', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });

    context.subscriptions.push(treeView);

    // 注册所有命令
    registerCommands(context, connectionManager, tmuxService, treeProvider);

    // 监听视图可见性变化，只在可见时才启动自动刷新
    treeView.onDidChangeVisibility(e => {
        if (e.visible) {
            treeProvider.startAutoRefresh();
        } else {
            treeProvider.stopAutoRefresh();
        }
    });

    // 注册清理
    context.subscriptions.push({
        dispose: () => {
            treeProvider.dispose();
            connectionManager.dispose();
        }
    });
}

/**
 * 插件停用时调用
 */
export function deactivate(): void {
    if (treeProvider) {
        treeProvider.dispose();
    }
    
    if (connectionManager) {
        connectionManager.dispose();
    }
}

