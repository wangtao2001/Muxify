import * as vscode from 'vscode';
import { ConnectionManager } from '../services/connectionManager';
import { TmuxService } from '../services/tmuxService';
import { TmuxTreeProvider, TmuxTreeItem } from '../providers/tmuxTreeProvider';
import { SSHConnectionConfig } from '../types/tmux';

/**
 * 注册所有命令
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    tmuxService: TmuxService,
    treeProvider: TmuxTreeProvider
): void {
    // 刷新命令
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.refresh', () => {
            treeProvider.refresh();
        })
    );

    // 创建会话
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.createSession', async (item?: TmuxTreeItem) => {
            const connectionId = item?.data.connectionId || 'local';
            
            const name = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter session name'),
                placeHolder: vscode.l10n.t('Session name (leave empty for auto-generated)')
            });

            if (name === undefined) {
                return;
            }

            try {
                await tmuxService.createSession(connectionId, name || undefined);
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Session "{0}" created', name || vscode.l10n.t('new session'))
                );
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to create session: {0}', String(error))
                );
            }
        })
    );

    // 删除会话
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.deleteSession', async (item: TmuxTreeItem) => {
            if (!item.data.session) {
                return;
            }

            const deleteBtn = vscode.l10n.t('Delete');
            const confirm = await vscode.window.showWarningMessage(
                vscode.l10n.t('Are you sure you want to delete session "{0}"?', item.data.session.name),
                { modal: true },
                deleteBtn
            );

            if (confirm !== deleteBtn) {
                return;
            }

            try {
                await tmuxService.killSession(item.data.connectionId, item.data.session.name);
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Session "{0}" deleted', item.data.session.name)
                );
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to delete session: {0}', String(error))
                );
            }
        })
    );

    // 重命名会话
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.renameSession', async (item: TmuxTreeItem) => {
            if (!item.data.session) {
                return;
            }

            const newName = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter new session name'),
                value: item.data.session.name
            });

            if (!newName || newName === item.data.session.name) {
                return;
            }

            try {
                await tmuxService.renameSession(item.data.connectionId, item.data.session.name, newName);
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Session renamed to "{0}"', newName)
                );
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to rename session: {0}', String(error))
                );
            }
        })
    );

    // 附加到会话
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.attachSession', async (item: TmuxTreeItem) => {
            if (!item.data.session) {
                return;
            }

            const connection = connectionManager.getConnection(item.data.connectionId);
            const attachCmd = tmuxService.getAttachCommand(item.data.session.name);

            let terminal: vscode.Terminal;
            
            if (connection?.type === 'ssh' && connection.config) {
                const sshCmd = `ssh -t ${connection.config.username}@${connection.config.host} -p ${connection.config.port} "${attachCmd}"`;
                terminal = vscode.window.createTerminal({
                    name: `tmux: ${item.data.session.name}`,
                    shellPath: '/bin/bash',
                    shellArgs: ['-c', sshCmd]
                });
            } else {
                terminal = vscode.window.createTerminal({
                    name: `tmux: ${item.data.session.name}`
                });
                terminal.sendText(attachCmd);
            }

            terminal.show();
        })
    );

    // 创建窗口
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.createWindow', async (item: TmuxTreeItem) => {
            if (!item.data.session) {
                return;
            }

            const name = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter window name'),
                placeHolder: vscode.l10n.t('Window name (leave empty for auto-generated)')
            });

            if (name === undefined) {
                return;
            }

            try {
                await tmuxService.createWindow(item.data.connectionId, item.data.session.name, name || undefined);
                vscode.window.showInformationMessage(vscode.l10n.t('Window created'));
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to create window: {0}', String(error))
                );
            }
        })
    );

    // 删除窗口
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.deleteWindow', async (item: TmuxTreeItem) => {
            if (!item.data.window || !item.data.session) {
                return;
            }

            const deleteBtn = vscode.l10n.t('Delete');
            const confirm = await vscode.window.showWarningMessage(
                vscode.l10n.t('Are you sure you want to delete window "{0}"?', item.data.window.name),
                { modal: true },
                deleteBtn
            );

            if (confirm !== deleteBtn) {
                return;
            }

            try {
                await tmuxService.killWindow(
                    item.data.connectionId,
                    item.data.session.name,
                    item.data.window.index
                );
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Window "{0}" deleted', item.data.window.name)
                );
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to delete window: {0}', String(error))
                );
            }
        })
    );

    // 重命名窗口
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.renameWindow', async (item: TmuxTreeItem) => {
            if (!item.data.window || !item.data.session) {
                return;
            }

            const newName = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter new window name'),
                value: item.data.window.name
            });

            if (!newName || newName === item.data.window.name) {
                return;
            }

            try {
                await tmuxService.renameWindow(
                    item.data.connectionId,
                    item.data.session.name,
                    item.data.window.index,
                    newName
                );
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Window renamed to "{0}"', newName)
                );
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to rename window: {0}', String(error))
                );
            }
        })
    );

    // 切换到窗口
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.selectWindow', async (item: TmuxTreeItem) => {
            if (!item.data.window || !item.data.session) {
                return;
            }

            try {
                await tmuxService.selectWindow(
                    item.data.connectionId,
                    item.data.session.name,
                    item.data.window.index
                );
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to switch window: {0}', String(error))
                );
            }
        })
    );

    // 水平分割面板
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.splitPaneHorizontal', async (item: TmuxTreeItem) => {
            let target: string;
            
            if (item.data.pane) {
                target = item.data.pane.id;
            } else if (item.data.window && item.data.session) {
                target = `${item.data.session.name}:${item.data.window.index}`;
            } else {
                return;
            }

            try {
                await tmuxService.splitPaneHorizontal(item.data.connectionId, target);
                vscode.window.showInformationMessage(vscode.l10n.t('Pane split horizontally'));
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to split pane: {0}', String(error))
                );
            }
        })
    );

    // 垂直分割面板
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.splitPaneVertical', async (item: TmuxTreeItem) => {
            let target: string;
            
            if (item.data.pane) {
                target = item.data.pane.id;
            } else if (item.data.window && item.data.session) {
                target = `${item.data.session.name}:${item.data.window.index}`;
            } else {
                return;
            }

            try {
                await tmuxService.splitPaneVertical(item.data.connectionId, target);
                vscode.window.showInformationMessage(vscode.l10n.t('Pane split vertically'));
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to split pane: {0}', String(error))
                );
            }
        })
    );

    // 切换到面板
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.selectPane', async (item: TmuxTreeItem) => {
            if (!item.data.pane) {
                return;
            }

            try {
                await tmuxService.selectPane(item.data.connectionId, item.data.pane.id);
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to switch pane: {0}', String(error))
                );
            }
        })
    );

    // 关闭面板
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.killPane', async (item: TmuxTreeItem) => {
            if (!item.data.pane) {
                return;
            }

            const closeBtn = vscode.l10n.t('Close');
            const confirm = await vscode.window.showWarningMessage(
                vscode.l10n.t('Are you sure you want to close pane {0}?', item.data.pane.index),
                { modal: true },
                closeBtn
            );

            if (confirm !== closeBtn) {
                return;
            }

            try {
                await tmuxService.killPane(item.data.connectionId, item.data.pane.id);
                vscode.window.showInformationMessage(vscode.l10n.t('Pane closed'));
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to close pane: {0}', String(error))
                );
            }
        })
    );

    // 启用鼠标滚动
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.enableMouseMode', async (item?: TmuxTreeItem) => {
            const connectionId = item?.data.connectionId || 'local';

            try {
                await tmuxService.enableMouseMode(connectionId);
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Mouse mode enabled. You can now use mouse wheel to scroll.')
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to enable mouse mode: {0}', String(error))
                );
            }
        })
    );

    // 禁用鼠标滚动
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.disableMouseMode', async (item?: TmuxTreeItem) => {
            const connectionId = item?.data.connectionId || 'local';

            try {
                await tmuxService.disableMouseMode(connectionId);
                vscode.window.showInformationMessage(vscode.l10n.t('Mouse mode disabled'));
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to disable mouse mode: {0}', String(error))
                );
            }
        })
    );

    // 添加 SSH 连接
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.addConnection', async () => {
            const host = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter SSH host address'),
                placeHolder: vscode.l10n.t('example.com or 192.168.1.1')
            });

            if (!host) {
                return;
            }

            const portStr = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter SSH port'),
                value: '22'
            });

            if (!portStr) {
                return;
            }

            const port = parseInt(portStr, 10);
            if (isNaN(port)) {
                vscode.window.showErrorMessage(vscode.l10n.t('Port must be a number'));
                return;
            }

            const username = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter username'),
                placeHolder: 'username'
            });

            if (!username) {
                return;
            }

            const authType = await vscode.window.showQuickPick(
                [
                    { label: vscode.l10n.t('Password authentication'), value: 'password' as const },
                    { label: vscode.l10n.t('Private key authentication'), value: 'privateKey' as const }
                ],
                { placeHolder: vscode.l10n.t('Select authentication type') }
            );

            if (!authType) {
                return;
            }

            const config: SSHConnectionConfig = {
                id: `ssh-${Date.now()}`,
                name: `${username}@${host}`,
                host,
                port,
                username,
                authType: authType.value
            };

            if (authType.value === 'password') {
                const password = await vscode.window.showInputBox({
                    prompt: vscode.l10n.t('Enter password'),
                    password: true
                });

                if (!password) {
                    return;
                }

                config.password = password;
            } else {
                const privateKeyPath = await vscode.window.showInputBox({
                    prompt: vscode.l10n.t('Enter private key path'),
                    value: `${process.env.HOME}/.ssh/id_rsa`
                });

                if (!privateKeyPath) {
                    return;
                }

                config.privateKeyPath = privateKeyPath;

                const passphrase = await vscode.window.showInputBox({
                    prompt: vscode.l10n.t('Enter passphrase (if any)'),
                    password: true
                });

                if (passphrase) {
                    config.passphrase = passphrase;
                }
            }

            const name = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter connection name'),
                value: config.name
            });

            if (name) {
                config.name = name;
            }

            try {
                await connectionManager.addSSHConnection(config);
                vscode.window.showInformationMessage(
                    vscode.l10n.t('SSH connection "{0}" added', config.name)
                );
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to add SSH connection: {0}', String(error))
                );
            }
        })
    );

    // 移除连接
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.removeConnection', async (item: TmuxTreeItem) => {
            const connection = connectionManager.getConnection(item.data.connectionId);
            if (!connection || connection.type === 'local') {
                vscode.window.showErrorMessage(vscode.l10n.t('Cannot remove local connection'));
                return;
            }

            const removeBtn = vscode.l10n.t('Remove');
            const confirm = await vscode.window.showWarningMessage(
                vscode.l10n.t('Are you sure you want to remove connection "{0}"?', connection.name),
                { modal: true },
                removeBtn
            );

            if (confirm !== removeBtn) {
                return;
            }

            try {
                connectionManager.removeConnection(item.data.connectionId);
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Connection "{0}" removed', connection.name)
                );
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to remove connection: {0}', String(error))
                );
            }
        })
    );

    // 编辑连接
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.editConnection', async (item: TmuxTreeItem) => {
            const connection = connectionManager.getConnection(item.data.connectionId);
            if (!connection || connection.type !== 'ssh' || !connection.config) {
                return;
            }

            const config = { ...connection.config };

            const host = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter SSH host address'),
                value: config.host
            });

            if (!host) {
                return;
            }
            config.host = host;

            const portStr = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter SSH port'),
                value: String(config.port)
            });

            if (!portStr) {
                return;
            }
            config.port = parseInt(portStr, 10);

            const username = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter username'),
                value: config.username
            });

            if (!username) {
                return;
            }
            config.username = username;

            const name = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter connection name'),
                value: config.name
            });

            if (name) {
                config.name = name;
            }

            try {
                await connectionManager.updateSSHConnection(config);
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Connection "{0}" updated', config.name)
                );
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to update connection: {0}', String(error))
                );
            }
        })
    );
}
