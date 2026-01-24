import * as vscode from 'vscode';
import { ConnectionManager } from '../services/connectionManager';
import { TmuxService } from '../services/tmuxService';
import { TmuxTreeProvider, TmuxTreeItem } from '../providers/tmuxTreeProvider';
import { SSHConnectionConfig } from '../types/tmux';
import { SSHConfigParser } from '../services/sshConfigParser';

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
        vscode.commands.registerCommand('muxify.selectPane', async (arg: TmuxTreeItem | { connectionId: string; paneId: string }) => {
            let connectionId: string;
            let paneId: string;

            // 支持两种调用方式：双击传递简单对象，右键菜单传递 TmuxTreeItem
            if ('data' in arg && arg.data.pane) {
                connectionId = arg.data.connectionId;
                paneId = arg.data.pane.id;
            } else if ('connectionId' in arg && 'paneId' in arg) {
                connectionId = arg.connectionId;
                paneId = arg.paneId;
            } else {
                return;
            }

            try {
                await tmuxService.selectPane(connectionId, paneId);
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

    // 交换面板位置
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.swapPane', async (item: TmuxTreeItem) => {
            if (!item.data.pane) {
                return;
            }

            const directions = [
                { label: vscode.l10n.t('$(arrow-up) Swap with previous pane'), value: 'U' as const },
                { label: vscode.l10n.t('$(arrow-down) Swap with next pane'), value: 'D' as const }
            ];

            const selected = await vscode.window.showQuickPick(directions, {
                placeHolder: vscode.l10n.t('Select swap direction')
            });

            if (!selected) {
                return;
            }

            try {
                await tmuxService.swapPane(item.data.connectionId, item.data.pane.id, selected.value);
                vscode.window.showInformationMessage(vscode.l10n.t('Pane swapped'));
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to swap pane: {0}', String(error))
                );
            }
        })
    );

    // 调整面板大小
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.resizePane', async (item: TmuxTreeItem) => {
            if (!item.data.pane) {
                return;
            }

            const directions = [
                { label: vscode.l10n.t('$(arrow-up) Shrink from bottom'), value: 'U' as const },
                { label: vscode.l10n.t('$(arrow-down) Expand to bottom'), value: 'D' as const },
                { label: vscode.l10n.t('$(arrow-left) Shrink from right'), value: 'L' as const },
                { label: vscode.l10n.t('$(arrow-right) Expand to right'), value: 'R' as const }
            ];

            const selected = await vscode.window.showQuickPick(directions, {
                placeHolder: vscode.l10n.t('Select resize direction')
            });

            if (!selected) {
                return;
            }

            const amountStr = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter resize amount (lines/columns)'),
                value: '5'
            });

            if (!amountStr) {
                return;
            }

            const amount = parseInt(amountStr, 10);
            if (isNaN(amount) || amount <= 0) {
                vscode.window.showErrorMessage(vscode.l10n.t('Amount must be a positive number'));
                return;
            }

            try {
                await tmuxService.resizePane(item.data.connectionId, item.data.pane.id, selected.value, amount);
                vscode.window.showInformationMessage(vscode.l10n.t('Pane resized'));
                treeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to resize pane: {0}', String(error))
                );
            }
        })
    );

    // 切换鼠标模式（智能切换）
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.toggleMouseMode', async (item?: TmuxTreeItem) => {
            const connectionId = item?.data.connectionId || 'local';

            try {
                const isNowEnabled = await tmuxService.toggleMouseMode(connectionId);
                if (isNowEnabled) {
                    vscode.window.showInformationMessage(
                        vscode.l10n.t('Mouse mode enabled. You can now use mouse wheel to scroll.')
                    );
                } else {
                    vscode.window.showInformationMessage(vscode.l10n.t('Mouse mode disabled'));
                }
            } catch (error) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Failed to toggle mouse mode: {0}', String(error))
                );
            }
        })
    );

    // 添加 SSH 连接
    context.subscriptions.push(
        vscode.commands.registerCommand('muxify.addConnection', async () => {
            // 尝试从 SSH config 读取主机
            const sshConfigParser = new SSHConfigParser();
            const sshHosts = await sshConfigParser.parse();

            let host: string | undefined;
            let port = 22;
            let username: string | undefined;
            let privateKeyPath: string | undefined;

            // 如果有 SSH config 主机，提供快速选择
            if (sshHosts.length > 0) {
                const items: vscode.QuickPickItem[] = [
                    {
                        label: vscode.l10n.t('$(edit) Enter manually'),
                        description: vscode.l10n.t('Manually enter host information')
                    },
                    { label: '', kind: vscode.QuickPickItemKind.Separator },
                    ...sshHosts.map(h => ({
                        label: h.host,
                        description: h.hostname ? `${h.user || ''}@${h.hostname}:${h.port || 22}` : undefined,
                        detail: h.identityFile ? `Key: ${h.identityFile}` : undefined
                    }))
                ];

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: vscode.l10n.t('Select from SSH config or enter manually'),
                    title: vscode.l10n.t('Add SSH Connection')
                });

                if (!selected) {
                    return;
                }

                // 如果选择了 SSH config 中的主机
                if (selected.label !== vscode.l10n.t('$(edit) Enter manually')) {
                    const selectedHost = sshHosts.find(h => h.host === selected.label);
                    if (selectedHost) {
                        host = selectedHost.hostname || selectedHost.host;
                        port = selectedHost.port || 22;
                        username = selectedHost.user;
                        privateKeyPath = selectedHost.identityFile;
                    }
                }
            }

            // 手动输入或补充信息
            if (!host) {
                host = await vscode.window.showInputBox({
                    prompt: vscode.l10n.t('Enter SSH host address'),
                    placeHolder: vscode.l10n.t('example.com or 192.168.1.1')
                });

                if (!host) {
                    return;
                }
            }

            const portStr = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter SSH port'),
                value: String(port)
            });

            if (!portStr) {
                return;
            }

            port = parseInt(portStr, 10);
            if (isNaN(port)) {
                vscode.window.showErrorMessage(vscode.l10n.t('Port must be a number'));
                return;
            }

            if (!username) {
                username = await vscode.window.showInputBox({
                    prompt: vscode.l10n.t('Enter username'),
                    placeHolder: 'username'
                });

                if (!username) {
                    return;
                }
            }

            // 如果有私钥路径，默认使用私钥认证
            const defaultAuthType = privateKeyPath ? 'privateKey' : 'password';
            const authType = await vscode.window.showQuickPick(
                [
                    { label: vscode.l10n.t('Password authentication'), value: 'password' as const },
                    { label: vscode.l10n.t('Private key authentication'), value: 'privateKey' as const }
                ],
                { 
                    placeHolder: vscode.l10n.t('Select authentication type')
                }
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
                const keyPath = await vscode.window.showInputBox({
                    prompt: vscode.l10n.t('Enter private key path'),
                    value: privateKeyPath || `${process.env.HOME}/.ssh/id_rsa`
                });

                if (!keyPath) {
                    return;
                }

                config.privateKeyPath = keyPath;

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
                await connectionManager.removeConnection(item.data.connectionId);
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
