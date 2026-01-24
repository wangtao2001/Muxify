import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * SSH 配置主机信息
 */
export interface SSHConfigHost {
    host: string;           // 别名
    hostname?: string;      // 实际主机地址
    user?: string;          // 用户名
    port?: number;          // 端口
    identityFile?: string;  // 私钥文件路径
}

/**
 * 解析 SSH config 文件
 */
export class SSHConfigParser {
    private configPath: string;

    constructor(configPath?: string) {
        this.configPath = configPath || path.join(os.homedir(), '.ssh', 'config');
    }

    /**
     * 解析 SSH config 文件，返回主机列表
     */
    async parse(): Promise<SSHConfigHost[]> {
        try {
            if (!fs.existsSync(this.configPath)) {
                return [];
            }

            const content = await fs.promises.readFile(this.configPath, 'utf-8');
            return this.parseContent(content);
        } catch (error) {
            console.error('Failed to parse SSH config:', error);
            return [];
        }
    }

    /**
     * 解析配置文件内容
     */
    private parseContent(content: string): SSHConfigHost[] {
        const hosts: SSHConfigHost[] = [];
        const lines = content.split('\n');
        
        let currentHost: SSHConfigHost | null = null;

        for (const line of lines) {
            const trimmed = line.trim();
            
            // 跳过空行和注释
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            // 解析键值对
            const match = trimmed.match(/^(\S+)\s+(.+)$/);
            if (!match) {
                continue;
            }

            const [, key, value] = match;
            const keyLower = key.toLowerCase();

            if (keyLower === 'host') {
                // 保存上一个主机配置
                if (currentHost && currentHost.host !== '*') {
                    hosts.push(currentHost);
                }
                
                // 开始新的主机配置（跳过通配符）
                if (value !== '*' && !value.includes('*')) {
                    currentHost = { host: value };
                } else {
                    currentHost = null;
                }
            } else if (currentHost) {
                switch (keyLower) {
                    case 'hostname':
                        currentHost.hostname = value;
                        break;
                    case 'user':
                        currentHost.user = value;
                        break;
                    case 'port':
                        currentHost.port = parseInt(value, 10);
                        break;
                    case 'identityfile':
                        // 展开 ~ 路径
                        currentHost.identityFile = value.replace(/^~/, os.homedir());
                        break;
                }
            }
        }

        // 保存最后一个主机配置
        if (currentHost && currentHost.host !== '*') {
            hosts.push(currentHost);
        }

        return hosts;
    }
}

