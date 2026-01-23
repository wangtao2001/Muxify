import { ConnectionManager } from './connectionManager';
import { TmuxSession, TmuxWindow, TmuxPane } from '../types/tmux';

/**
 * Tmux 服务
 * 封装所有 tmux 相关操作
 */
export class TmuxService {
    private connectionManager: ConnectionManager;

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
    }

    /**
     * 检查 tmux 是否可用
     */
    async isTmuxAvailable(connectionId: string): Promise<boolean> {
        try {
            const result = await this.connectionManager.execute(connectionId, 'which tmux');
            return result.exitCode === 0 && result.stdout.length > 0;
        } catch {
            return false;
        }
    }

    /**
     * 获取所有会话
     */
    async listSessions(connectionId: string): Promise<TmuxSession[]> {
        const format = '#{session_id}:#{session_name}:#{session_attached}:#{session_windows}:#{session_created}';
        const result = await this.connectionManager.execute(
            connectionId,
            `tmux list-sessions -F "${format}" 2>/dev/null`
        );

        if (result.exitCode !== 0 || !result.stdout) {
            return [];
        }

        const sessions: TmuxSession[] = [];
        const lines = result.stdout.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const parts = line.split(':');
            if (parts.length >= 4) {
                const session: TmuxSession = {
                    id: parts[0],
                    name: parts[1],
                    attached: parts[2] === '1',
                    windowCount: parseInt(parts[3], 10) || 0,
                    windows: [],
                    connectionId
                };

                if (parts[4]) {
                    session.createdAt = new Date(parseInt(parts[4], 10) * 1000);
                }

                sessions.push(session);
            }
        }

        return sessions;
    }

    /**
     * 获取会话的所有窗口
     */
    async listWindows(connectionId: string, sessionName: string): Promise<TmuxWindow[]> {
        const format = '#{window_id}:#{window_index}:#{window_name}:#{window_active}';
        const result = await this.connectionManager.execute(
            connectionId,
            `tmux list-windows -t "${sessionName}" -F "${format}" 2>/dev/null`
        );

        if (result.exitCode !== 0 || !result.stdout) {
            return [];
        }

        const windows: TmuxWindow[] = [];
        const lines = result.stdout.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const parts = line.split(':');
            if (parts.length >= 4) {
                windows.push({
                    id: parts[0],
                    index: parseInt(parts[1], 10) || 0,
                    name: parts[2],
                    active: parts[3] === '1',
                    panes: [],
                    sessionName,
                    connectionId
                });
            }
        }

        return windows;
    }

    /**
     * 获取窗口的所有面板
     */
    async listPanes(connectionId: string, sessionName: string, windowId: string): Promise<TmuxPane[]> {
        const format = '#{pane_id}:#{pane_index}:#{pane_active}:#{pane_current_path}:#{pane_current_command}:#{pane_width}:#{pane_height}';
        const result = await this.connectionManager.execute(
            connectionId,
            `tmux list-panes -t "${sessionName}:${windowId}" -F "${format}" 2>/dev/null`
        );

        if (result.exitCode !== 0 || !result.stdout) {
            return [];
        }

        const panes: TmuxPane[] = [];
        const lines = result.stdout.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const parts = line.split(':');
            if (parts.length >= 7) {
                panes.push({
                    id: parts[0],
                    index: parseInt(parts[1], 10) || 0,
                    active: parts[2] === '1',
                    currentPath: parts[3] || '~',
                    currentCommand: parts[4] || '',
                    width: parseInt(parts[5], 10) || 0,
                    height: parseInt(parts[6], 10) || 0,
                    windowId,
                    sessionName,
                    connectionId
                });
            }
        }

        return panes;
    }

    /**
     * 获取完整的会话树（包含窗口和面板）
     */
    async getSessionTree(connectionId: string): Promise<TmuxSession[]> {
        const sessions = await this.listSessions(connectionId);

        for (const session of sessions) {
            session.windows = await this.listWindows(connectionId, session.name);
            
            for (const window of session.windows) {
                // 使用窗口索引来获取面板
                window.panes = await this.listPanes(connectionId, session.name, String(window.index));
            }
        }

        return sessions;
    }

    /**
     * 创建新会话
     */
    async createSession(connectionId: string, name?: string): Promise<TmuxSession | null> {
        let command = 'tmux new-session -d';
        if (name) {
            command += ` -s "${name}"`;
        }

        const result = await this.connectionManager.execute(connectionId, command);
        
        if (result.exitCode !== 0) {
            throw new Error(result.stderr || '创建会话失败');
        }

        // 获取新创建的会话
        const sessions = await this.listSessions(connectionId);
        if (name) {
            return sessions.find(s => s.name === name) || null;
        }
        // 返回最新的会话
        return sessions[sessions.length - 1] || null;
    }

    /**
     * 删除会话
     */
    async killSession(connectionId: string, sessionName: string): Promise<void> {
        const result = await this.connectionManager.execute(
            connectionId,
            `tmux kill-session -t "${sessionName}"`
        );

        if (result.exitCode !== 0) {
            throw new Error(result.stderr || '删除会话失败');
        }
    }

    /**
     * 重命名会话
     */
    async renameSession(connectionId: string, oldName: string, newName: string): Promise<void> {
        const result = await this.connectionManager.execute(
            connectionId,
            `tmux rename-session -t "${oldName}" "${newName}"`
        );

        if (result.exitCode !== 0) {
            throw new Error(result.stderr || '重命名会话失败');
        }
    }

    /**
     * 创建新窗口
     */
    async createWindow(connectionId: string, sessionName: string, windowName?: string): Promise<void> {
        let command = `tmux new-window -t "${sessionName}"`;
        if (windowName) {
            command += ` -n "${windowName}"`;
        }

        const result = await this.connectionManager.execute(connectionId, command);

        if (result.exitCode !== 0) {
            throw new Error(result.stderr || '创建窗口失败');
        }
    }

    /**
     * 删除窗口
     */
    async killWindow(connectionId: string, sessionName: string, windowIndex: number): Promise<void> {
        const result = await this.connectionManager.execute(
            connectionId,
            `tmux kill-window -t "${sessionName}:${windowIndex}"`
        );

        if (result.exitCode !== 0) {
            throw new Error(result.stderr || '删除窗口失败');
        }
    }

    /**
     * 重命名窗口
     */
    async renameWindow(
        connectionId: string, 
        sessionName: string, 
        windowIndex: number, 
        newName: string
    ): Promise<void> {
        const result = await this.connectionManager.execute(
            connectionId,
            `tmux rename-window -t "${sessionName}:${windowIndex}" "${newName}"`
        );

        if (result.exitCode !== 0) {
            throw new Error(result.stderr || '重命名窗口失败');
        }
    }

    /**
     * 切换到窗口
     */
    async selectWindow(connectionId: string, sessionName: string, windowIndex: number): Promise<void> {
        const result = await this.connectionManager.execute(
            connectionId,
            `tmux select-window -t "${sessionName}:${windowIndex}"`
        );

        if (result.exitCode !== 0) {
            throw new Error(result.stderr || '切换窗口失败');
        }
    }

    /**
     * 水平分割面板
     */
    async splitPaneHorizontal(connectionId: string, target: string): Promise<void> {
        const result = await this.connectionManager.execute(
            connectionId,
            `tmux split-window -h -t "${target}"`
        );

        if (result.exitCode !== 0) {
            throw new Error(result.stderr || '水平分割面板失败');
        }
    }

    /**
     * 垂直分割面板
     */
    async splitPaneVertical(connectionId: string, target: string): Promise<void> {
        const result = await this.connectionManager.execute(
            connectionId,
            `tmux split-window -v -t "${target}"`
        );

        if (result.exitCode !== 0) {
            throw new Error(result.stderr || '垂直分割面板失败');
        }
    }

    /**
     * 关闭面板
     */
    async killPane(connectionId: string, paneId: string): Promise<void> {
        const result = await this.connectionManager.execute(
            connectionId,
            `tmux kill-pane -t "${paneId}"`
        );

        if (result.exitCode !== 0) {
            throw new Error(result.stderr || '关闭面板失败');
        }
    }

    /**
     * 切换到指定面板
     */
    async selectPane(connectionId: string, paneId: string): Promise<void> {
        const result = await this.connectionManager.execute(
            connectionId,
            `tmux select-pane -t "${paneId}"`
        );

        if (result.exitCode !== 0) {
            throw new Error(result.stderr || '切换面板失败');
        }
    }

    /**
     * 附加到会话（生成 tmux attach 命令）
     */
    getAttachCommand(sessionName: string): string {
        return `tmux attach-session -t "${sessionName}"`;
    }

    /**
     * 检查鼠标模式是否已启用
     */
    async isMouseModeEnabled(connectionId: string): Promise<boolean> {
        const result = await this.connectionManager.execute(
            connectionId,
            `tmux show-options -g mouse 2>/dev/null | grep -q "on" && echo "enabled" || echo "disabled"`
        );
        return result.stdout.trim() === 'enabled';
    }

    /**
     * 启用鼠标模式
     * 会修改 ~/.tmux.conf 并重新加载配置
     */
    async enableMouseMode(connectionId: string): Promise<void> {
        // 检查配置文件是否存在 "set -g mouse on"
        const checkResult = await this.connectionManager.execute(
            connectionId,
            `grep -q "^set.*-g.*mouse.*on" ~/.tmux.conf 2>/dev/null && echo "exists" || echo "not_exists"`
        );

        // 如果配置不存在，添加到文件
        if (checkResult.stdout.trim() === 'not_exists') {
            const addResult = await this.connectionManager.execute(
                connectionId,
                `echo "set -g mouse on" >> ~/.tmux.conf`
            );

            if (addResult.exitCode !== 0) {
                throw new Error(addResult.stderr || '添加配置失败');
            }
        }

        // 重新加载 tmux 配置
        const reloadResult = await this.connectionManager.execute(
            connectionId,
            `tmux source-file ~/.tmux.conf 2>/dev/null || true`
        );

        // 立即设置当前 tmux 会话的鼠标模式
        await this.connectionManager.execute(
            connectionId,
            `tmux set-option -g mouse on 2>/dev/null || true`
        );
    }

    /**
     * 禁用鼠标模式
     */
    async disableMouseMode(connectionId: string): Promise<void> {
        // 从配置文件中移除 mouse on 设置
        await this.connectionManager.execute(
            connectionId,
            `sed -i '/^set.*-g.*mouse.*on/d' ~/.tmux.conf 2>/dev/null || true`
        );

        // 立即禁用当前 tmux 会话的鼠标模式
        await this.connectionManager.execute(
            connectionId,
            `tmux set-option -g mouse off 2>/dev/null || true`
        );
    }
}

