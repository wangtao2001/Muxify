import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { Client, ConnectConfig } from 'ssh2';
import { Connection, SSHConnectionConfig, CommandResult } from '../types/tmux';

const execAsync = promisify(exec);

/**
 * 命令执行器接口
 */
export interface CommandExecutor {
    execute(command: string): Promise<CommandResult>;
    dispose(): void;
}

/**
 * 本地命令执行器
 */
export class LocalExecutor implements CommandExecutor {
    async execute(command: string): Promise<CommandResult> {
        try {
            const { stdout, stderr } = await execAsync(command);
            return {
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: 0
            };
        } catch (error: unknown) {
            const err = error as { stdout?: string; stderr?: string; code?: number };
            return {
                stdout: err.stdout?.trim() || '',
                stderr: err.stderr?.trim() || String(error),
                exitCode: err.code || 1
            };
        }
    }

    dispose(): void {
        // 本地执行器无需清理
    }
}

/**
 * SSH 命令执行器
 */
export class SSHExecutor implements CommandExecutor {
    private client: Client | null = null;
    private connected = false;
    private config: SSHConnectionConfig;

    constructor(config: SSHConnectionConfig) {
        this.config = config;
    }

    async connect(): Promise<void> {
        if (this.connected && this.client) {
            return;
        }

        return new Promise((resolve, reject) => {
            this.client = new Client();

            const connectConfig: ConnectConfig = {
                host: this.config.host,
                port: this.config.port,
                username: this.config.username,
            };

            if (this.config.authType === 'password') {
                connectConfig.password = this.config.password;
            } else if (this.config.authType === 'privateKey') {
                // 读取私钥文件
                const fs = require('fs');
                try {
                    connectConfig.privateKey = fs.readFileSync(this.config.privateKeyPath!);
                    if (this.config.passphrase) {
                        connectConfig.passphrase = this.config.passphrase;
                    }
                } catch (err) {
                    reject(new Error(`无法读取私钥文件: ${this.config.privateKeyPath}`));
                    return;
                }
            }

            this.client.on('ready', () => {
                this.connected = true;
                resolve();
            });

            this.client.on('error', (err) => {
                this.connected = false;
                reject(err);
            });

            this.client.on('close', () => {
                this.connected = false;
            });

            this.client.connect(connectConfig);
        });
    }

    async execute(command: string): Promise<CommandResult> {
        if (!this.connected || !this.client) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            this.client!.exec(command, (err, stream) => {
                if (err) {
                    reject(err);
                    return;
                }

                let stdout = '';
                let stderr = '';

                stream.on('data', (data: Buffer) => {
                    stdout += data.toString();
                });

                stream.stderr.on('data', (data: Buffer) => {
                    stderr += data.toString();
                });

                stream.on('close', (code: number) => {
                    resolve({
                        stdout: stdout.trim(),
                        stderr: stderr.trim(),
                        exitCode: code || 0
                    });
                });
            });
        });
    }

    dispose(): void {
        if (this.client) {
            this.client.end();
            this.client = null;
            this.connected = false;
        }
    }
}

/**
 * 连接管理器
 * 管理本地和 SSH 连接
 */
export class ConnectionManager {
    private connections: Map<string, Connection> = new Map();
    private executors: Map<string, CommandExecutor> = new Map();
    private context: vscode.ExtensionContext;
    private secrets: vscode.SecretStorage;

    private static readonly LOCAL_CONNECTION_ID = 'local';
    private static readonly CONNECTIONS_STORAGE_KEY = 'muxify.connections';
    private static readonly PASSWORD_PREFIX = 'muxify.ssh.password.';
    private static readonly PASSPHRASE_PREFIX = 'muxify.ssh.passphrase.';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.secrets = context.secrets;
        this.initializeLocalConnection();
        this.loadConnections();
    }

    private initializeLocalConnection(): void {
        const localConnection: Connection = {
            id: ConnectionManager.LOCAL_CONNECTION_ID,
            type: 'local',
            name: '本地'
        };
        this.connections.set(localConnection.id, localConnection);
        this.executors.set(localConnection.id, new LocalExecutor());
    }

    private loadConnections(): void {
        const savedConnections = this.context.globalState.get<Connection[]>(
            ConnectionManager.CONNECTIONS_STORAGE_KEY,
            []
        );

        for (const conn of savedConnections) {
            if (conn.type === 'ssh' && conn.config) {
                this.connections.set(conn.id, conn);
                // SSH 执行器延迟创建，在需要时才创建
            }
        }
    }

    private saveConnections(): void {
        const sshConnections = Array.from(this.connections.values())
            .filter(c => c.type === 'ssh');
        
        // 不保存密码，只保存非敏感信息
        const safeConnections = sshConnections.map(c => ({
            ...c,
            config: c.config ? {
                ...c.config,
                password: undefined,  // 不保存密码
                passphrase: undefined // 不保存密钥密码
            } : undefined
        }));

        this.context.globalState.update(
            ConnectionManager.CONNECTIONS_STORAGE_KEY,
            safeConnections
        );
    }

    /**
     * 获取所有连接
     */
    getAllConnections(): Connection[] {
        return Array.from(this.connections.values());
    }

    /**
     * 获取连接
     */
    getConnection(id: string): Connection | undefined {
        return this.connections.get(id);
    }

    /**
     * 添加 SSH 连接
     */
    async addSSHConnection(config: SSHConnectionConfig): Promise<Connection> {
        // 安全存储密码
        if (config.password) {
            await this.secrets.store(
                ConnectionManager.PASSWORD_PREFIX + config.id,
                config.password
            );
        }

        // 安全存储私钥密码
        if (config.passphrase) {
            await this.secrets.store(
                ConnectionManager.PASSPHRASE_PREFIX + config.id,
                config.passphrase
            );
        }

        const connection: Connection = {
            id: config.id,
            type: 'ssh',
            name: config.name || `${config.username}@${config.host}`,
            config
        };

        this.connections.set(connection.id, connection);
        this.saveConnections();

        return connection;
    }

    /**
     * 获取存储的密码
     */
    async getStoredPassword(connectionId: string): Promise<string | undefined> {
        return this.secrets.get(ConnectionManager.PASSWORD_PREFIX + connectionId);
    }

    /**
     * 获取存储的私钥密码
     */
    async getStoredPassphrase(connectionId: string): Promise<string | undefined> {
        return this.secrets.get(ConnectionManager.PASSPHRASE_PREFIX + connectionId);
    }

    /**
     * 更新 SSH 连接
     */
    async updateSSHConnection(config: SSHConnectionConfig): Promise<void> {
        const existing = this.connections.get(config.id);
        if (!existing || existing.type !== 'ssh') {
            throw new Error('连接不存在');
        }

        // 断开旧连接
        const oldExecutor = this.executors.get(config.id);
        if (oldExecutor) {
            oldExecutor.dispose();
            this.executors.delete(config.id);
        }

        const connection: Connection = {
            id: config.id,
            type: 'ssh',
            name: config.name || `${config.username}@${config.host}`,
            config
        };

        this.connections.set(connection.id, connection);
        this.saveConnections();
    }

    /**
     * 移除连接
     */
    async removeConnection(id: string): Promise<void> {
        if (id === ConnectionManager.LOCAL_CONNECTION_ID) {
            throw new Error('不能移除本地连接');
        }

        const executor = this.executors.get(id);
        if (executor) {
            executor.dispose();
            this.executors.delete(id);
        }

        // 清除存储的密码
        await this.secrets.delete(ConnectionManager.PASSWORD_PREFIX + id);
        await this.secrets.delete(ConnectionManager.PASSPHRASE_PREFIX + id);

        this.connections.delete(id);
        this.saveConnections();
    }

    /**
     * 获取执行器
     */
    async getExecutor(connectionId: string): Promise<CommandExecutor> {
        // 如果已有执行器，直接返回
        const existing = this.executors.get(connectionId);
        if (existing) {
            return existing;
        }

        // 创建新的执行器
        const connection = this.connections.get(connectionId);
        if (!connection) {
            throw new Error(`连接不存在: ${connectionId}`);
        }

        if (connection.type === 'local') {
            const executor = new LocalExecutor();
            this.executors.set(connectionId, executor);
            return executor;
        }

        if (connection.type === 'ssh' && connection.config) {
            // 从 SecretStorage 获取密码
            const config = { ...connection.config };
            
            if (config.authType === 'password' && !config.password) {
                const storedPassword = await this.getStoredPassword(connectionId);
                if (storedPassword) {
                    config.password = storedPassword;
                }
            }

            if (config.authType === 'privateKey' && !config.passphrase) {
                const storedPassphrase = await this.getStoredPassphrase(connectionId);
                if (storedPassphrase) {
                    config.passphrase = storedPassphrase;
                }
            }

            const executor = new SSHExecutor(config);
            await executor.connect();
            this.executors.set(connectionId, executor);
            return executor;
        }

        throw new Error(`无法创建执行器: ${connectionId}`);
    }

    /**
     * 执行命令
     */
    async execute(connectionId: string, command: string): Promise<CommandResult> {
        const executor = await this.getExecutor(connectionId);
        return executor.execute(command);
    }

    /**
     * 测试连接
     */
    async testConnection(connectionId: string): Promise<boolean> {
        try {
            const result = await this.execute(connectionId, 'echo "test"');
            return result.exitCode === 0;
        } catch {
            return false;
        }
    }

    /**
     * 清理资源
     */
    dispose(): void {
        for (const executor of this.executors.values()) {
            executor.dispose();
        }
        this.executors.clear();
    }
}

