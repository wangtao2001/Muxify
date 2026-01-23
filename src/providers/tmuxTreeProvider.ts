import * as vscode from 'vscode';
import { ConnectionManager } from '../services/connectionManager';
import { TmuxService } from '../services/tmuxService';
import { Connection, TmuxSession, TmuxWindow, TmuxPane, TreeNodeData } from '../types/tmux';

/**
 * Tmux 树节点
 */
export class TmuxTreeItem extends vscode.TreeItem {
    public readonly data: TreeNodeData;

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        data: TreeNodeData
    ) {
        super(label, collapsibleState);
        this.data = data;

        // 设置上下文值，用于右键菜单
        this.contextValue = data.type;

        // 设置图标和描述
        this.setAppearance();
    }

    private setAppearance(): void {
        switch (this.data.type) {
            case 'connection':
                this.iconPath = new vscode.ThemeIcon('plug');
                const conn = this.getConnection();
                if (conn?.type === 'local') {
                    this.iconPath = new vscode.ThemeIcon('home');
                } else {
                    this.iconPath = new vscode.ThemeIcon('remote');
                }
                break;

            case 'session':
                this.iconPath = new vscode.ThemeIcon('folder');
                if (this.data.session?.attached) {
                    this.description = vscode.l10n.t('(attached)');
                    this.iconPath = new vscode.ThemeIcon('folder-active');
                }
                break;

            case 'window':
                this.iconPath = new vscode.ThemeIcon('window');
                if (this.data.window?.active) {
                    this.description = vscode.l10n.t('(active)');
                    this.iconPath = new vscode.ThemeIcon('symbol-event');
                }
                break;

            case 'pane':
                this.iconPath = new vscode.ThemeIcon('terminal');
                const pane = this.data.pane;
                if (pane) {
                    this.description = pane.currentPath;
                    if (pane.currentCommand) {
                        this.tooltip = vscode.l10n.t('Command: {0}\nPath: {1}\nSize: {2}x{3}', pane.currentCommand, pane.currentPath, pane.width, pane.height);
                    }
                    if (pane.active) {
                        this.iconPath = new vscode.ThemeIcon('terminal-view-icon');
                    }
                }
                break;

            case 'info':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
        }
    }

    private getConnection(): Connection | undefined {
        return undefined;
    }
}

/**
 * Tmux 树数据提供者
 */
export class TmuxTreeProvider implements vscode.TreeDataProvider<TmuxTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TmuxTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private connectionManager: ConnectionManager;
    private tmuxService: TmuxService;
    private refreshTimer: NodeJS.Timeout | undefined;
    private autoRefreshInterval = 5000;

    constructor(connectionManager: ConnectionManager, tmuxService: TmuxService) {
        this.connectionManager = connectionManager;
        this.tmuxService = tmuxService;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    startAutoRefresh(): void {
        this.stopAutoRefresh();
        this.refreshTimer = setInterval(() => {
            this.refresh();
        }, this.autoRefreshInterval);
    }

    stopAutoRefresh(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }
    }

    getTreeItem(element: TmuxTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TmuxTreeItem): Promise<TmuxTreeItem[]> {
        if (!element) {
            return this.getConnectionNodes();
        }

        switch (element.data.type) {
            case 'connection':
                return this.getSessionNodes(element.data.connectionId);

            case 'session':
                if (element.data.session) {
                    return this.getWindowNodes(element.data.session);
                }
                return [];

            case 'window':
                if (element.data.window) {
                    return this.getPaneNodes(element.data.window);
                }
                return [];

            default:
                return [];
        }
    }

    private getConnectionNodes(): TmuxTreeItem[] {
        const connections = this.connectionManager.getAllConnections();
        const nodes: TmuxTreeItem[] = [];

        for (const conn of connections) {
            const node = new TmuxTreeItem(
                conn.name,
                vscode.TreeItemCollapsibleState.Collapsed,
                {
                    type: 'connection',
                    connectionId: conn.id
                }
            );
            node.contextValue = conn.type === 'local' ? 'localConnection' : 'sshConnection';

            if (conn.type === 'local') {
                node.iconPath = new vscode.ThemeIcon('home');
            } else {
                node.iconPath = new vscode.ThemeIcon('remote');
                node.description = conn.config?.host || '';
            }

            nodes.push(node);
        }

        return nodes;
    }

    private async getSessionNodes(connectionId: string): Promise<TmuxTreeItem[]> {
        try {
            const available = await this.tmuxService.isTmuxAvailable(connectionId);
            if (!available) {
                const node = new TmuxTreeItem(
                    vscode.l10n.t('tmux is not installed or not available'),
                    vscode.TreeItemCollapsibleState.None,
                    {
                        type: 'info',
                        connectionId
                    }
                );
                node.iconPath = new vscode.ThemeIcon('warning');
                return [node];
            }

            const sessions = await this.tmuxService.listSessions(connectionId);

            if (sessions.length === 0) {
                const node = new TmuxTreeItem(
                    vscode.l10n.t('No active sessions'),
                    vscode.TreeItemCollapsibleState.None,
                    {
                        type: 'info',
                        connectionId
                    }
                );
                node.iconPath = new vscode.ThemeIcon('info');
                return [node];
            }

            return sessions.map(session => {
                const node = new TmuxTreeItem(
                    session.name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    {
                        type: 'session',
                        connectionId,
                        session
                    }
                );

                node.iconPath = session.attached 
                    ? new vscode.ThemeIcon('folder-active')
                    : new vscode.ThemeIcon('folder');
                
                node.description = vscode.l10n.t('{0} windows', session.windowCount);
                if (session.attached) {
                    node.description += ' ' + vscode.l10n.t('(attached)');
                }

                node.tooltip = vscode.l10n.t('Session: {0}\nWindows: {1}\nStatus: {2}', 
                    session.name, 
                    session.windowCount, 
                    session.attached ? vscode.l10n.t('attached') : vscode.l10n.t('detached')
                );

                return node;
            });
        } catch (error) {
            const node = new TmuxTreeItem(
                vscode.l10n.t('Error: {0}', String(error)),
                vscode.TreeItemCollapsibleState.None,
                {
                    type: 'info',
                    connectionId
                }
            );
            node.iconPath = new vscode.ThemeIcon('error');
            return [node];
        }
    }

    private async getWindowNodes(session: TmuxSession): Promise<TmuxTreeItem[]> {
        try {
            const windows = await this.tmuxService.listWindows(session.connectionId, session.name);

            return windows.map(window => {
                const label = `${window.index}: ${window.name}`;
                const node = new TmuxTreeItem(
                    label,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    {
                        type: 'window',
                        connectionId: session.connectionId,
                        session,
                        window
                    }
                );

                node.iconPath = window.active
                    ? new vscode.ThemeIcon('symbol-event')
                    : new vscode.ThemeIcon('window');

                node.contextValue = window.active ? 'activeWindow' : 'window';

                if (window.active) {
                    node.description = vscode.l10n.t('(active)');
                }

                node.tooltip = vscode.l10n.t('Window: {0}\nIndex: {1}\nStatus: {2}', 
                    window.name, 
                    window.index, 
                    window.active ? vscode.l10n.t('active') : vscode.l10n.t('inactive')
                );

                return node;
            });
        } catch (error) {
            const node = new TmuxTreeItem(
                vscode.l10n.t('Error: {0}', String(error)),
                vscode.TreeItemCollapsibleState.None,
                {
                    type: 'info',
                    connectionId: session.connectionId
                }
            );
            node.iconPath = new vscode.ThemeIcon('error');
            return [node];
        }
    }

    private async getPaneNodes(window: TmuxWindow): Promise<TmuxTreeItem[]> {
        try {
            const panes = await this.tmuxService.listPanes(
                window.connectionId,
                window.sessionName,
                String(window.index)
            );

            return panes.map(pane => {
                const label = vscode.l10n.t('Pane {0}', pane.index);
                const node = new TmuxTreeItem(
                    label,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        type: 'pane',
                        connectionId: window.connectionId,
                        window,
                        pane
                    }
                );

                node.iconPath = pane.active
                    ? new vscode.ThemeIcon('terminal-view-icon')
                    : new vscode.ThemeIcon('terminal');

                node.contextValue = pane.active ? 'activePane' : 'pane';

                const pathParts = pane.currentPath.split('/');
                const shortPath = pathParts.length > 2 
                    ? `.../${pathParts.slice(-2).join('/')}`
                    : pane.currentPath;
                
                node.description = shortPath;
                
                if (pane.currentCommand) {
                    node.description = `${pane.currentCommand} (${shortPath})`;
                }

                const tooltipLines = [
                    vscode.l10n.t('Pane: {0}', pane.id),
                    vscode.l10n.t('Path: {0}', pane.currentPath),
                    pane.currentCommand ? vscode.l10n.t('Command: {0}', pane.currentCommand) : null,
                    vscode.l10n.t('Size: {0}x{1}', pane.width, pane.height),
                    vscode.l10n.t('Status: {0}', pane.active ? vscode.l10n.t('active') : vscode.l10n.t('inactive'))
                ];

                if (!pane.active) {
                    tooltipLines.push('', vscode.l10n.t('Double-click to switch to this pane'));
                    node.command = {
                        command: 'muxify.selectPane',
                        title: vscode.l10n.t('Switch to Pane'),
                        arguments: [node]
                    };
                }

                node.tooltip = tooltipLines.filter(v => v !== null).join('\n');

                return node;
            });
        } catch (error) {
            const node = new TmuxTreeItem(
                vscode.l10n.t('Error: {0}', String(error)),
                vscode.TreeItemCollapsibleState.None,
                {
                    type: 'info',
                    connectionId: window.connectionId
                }
            );
            node.iconPath = new vscode.ThemeIcon('error');
            return [node];
        }
    }

    dispose(): void {
        this.stopAutoRefresh();
        this._onDidChangeTreeData.dispose();
    }
}
