import * as vscode from 'vscode';
import { TmuxService } from '../services/tmuxService';
import { ConnectionManager } from '../services/connectionManager';

/**
 * 状态栏提供者
 * 显示当前活动的 tmux 会话信息
 */
export class StatusBarProvider {
    private statusBarItem: vscode.StatusBarItem;
    private tmuxService: TmuxService;
    private connectionManager: ConnectionManager;
    private updateInterval: NodeJS.Timeout | null = null;

    constructor(
        tmuxService: TmuxService,
        connectionManager: ConnectionManager
    ) {
        this.tmuxService = tmuxService;
        this.connectionManager = connectionManager;

        // 创建状态栏项
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'muxify.quickAttach';
        this.statusBarItem.tooltip = vscode.l10n.t('Click to attach session to terminal');
    }

    /**
     * 显示状态栏
     */
    show(): void {
        this.statusBarItem.show();
        this.startAutoUpdate();
    }

    /**
     * 隐藏状态栏
     */
    hide(): void {
        this.statusBarItem.hide();
        this.stopAutoUpdate();
    }

    /**
     * 启动自动更新
     */
    startAutoUpdate(): void {
        this.update();
        this.updateInterval = setInterval(() => this.update(), 5000);
    }

    /**
     * 停止自动更新
     */
    stopAutoUpdate(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * 更新状态栏内容
     */
    async update(): Promise<void> {
        try {
            // 获取本地 tmux 会话
            const sessions = await this.tmuxService.listSessions('local');
            
            if (sessions.length === 0) {
                this.statusBarItem.text = '$(terminal) tmux: -';
                this.statusBarItem.tooltip = vscode.l10n.t('No active tmux sessions');
                return;
            }

            // 统计会话信息
            const attachedSessions = sessions.filter(s => s.attached);
            const totalWindows = sessions.reduce((sum, s) => sum + s.windowCount, 0);

            if (attachedSessions.length > 0) {
                // 显示附加的会话
                const session = attachedSessions[0];
                this.statusBarItem.text = `$(terminal) ${session.name}`;
                this.statusBarItem.tooltip = vscode.l10n.t(
                    '{0} sessions, {1} windows (attached: {2})',
                    sessions.length,
                    totalWindows,
                    session.name
                );
            } else {
                // 显示会话总数
                this.statusBarItem.text = `$(terminal) tmux: ${sessions.length}`;
                this.statusBarItem.tooltip = vscode.l10n.t(
                    '{0} sessions, {1} windows',
                    sessions.length,
                    totalWindows
                );
            }
        } catch (error) {
            this.statusBarItem.text = '$(terminal) tmux';
            this.statusBarItem.tooltip = vscode.l10n.t('Click to open Muxify sidebar');
        }
    }

    /**
     * 清理资源
     */
    dispose(): void {
        this.stopAutoUpdate();
        this.statusBarItem.dispose();
    }
}

