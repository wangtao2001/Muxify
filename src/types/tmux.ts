/**
 * SSH 连接配置
 */
export interface SSHConnectionConfig {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    authType: 'password' | 'privateKey';
    password?: string;
    privateKeyPath?: string;
    passphrase?: string;
}

/**
 * 连接类型
 */
export type ConnectionType = 'local' | 'ssh';

/**
 * 连接信息
 */
export interface Connection {
    id: string;
    type: ConnectionType;
    name: string;
    config?: SSHConnectionConfig;
}

/**
 * Tmux 面板
 */
export interface TmuxPane {
    id: string;           // 面板 ID, 如 %0
    index: number;        // 面板索引
    active: boolean;      // 是否活动面板
    currentPath: string;  // 当前工作目录
    currentCommand: string; // 当前运行的命令
    width: number;
    height: number;
    // 父级信息
    windowId: string;
    sessionName: string;
    connectionId: string;
}

/**
 * Tmux 窗口
 */
export interface TmuxWindow {
    id: string;           // 窗口 ID, 如 @0
    index: number;        // 窗口索引
    name: string;         // 窗口名称
    active: boolean;      // 是否活动窗口
    panes: TmuxPane[];    // 面板列表
    // 父级信息
    sessionName: string;
    connectionId: string;
}

/**
 * Tmux 会话
 */
export interface TmuxSession {
    id: string;           // 会话 ID, 如 $0
    name: string;         // 会话名称
    attached: boolean;    // 是否已附加
    windows: TmuxWindow[]; // 窗口列表
    windowCount: number;
    createdAt?: Date;
    // 父级信息
    connectionId: string;
}

/**
 * 命令执行结果
 */
export interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

/**
 * 树节点类型
 */
export type TreeItemType = 'connection' | 'session' | 'window' | 'pane' | 'info';

/**
 * 树节点数据
 */
export interface TreeNodeData {
    type: TreeItemType;
    connectionId: string;
    session?: TmuxSession;
    window?: TmuxWindow;
    pane?: TmuxPane;
}

