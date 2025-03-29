import { container } from '@sapphire/framework';
import { readFileSync } from 'fs';
import path from 'path';
import { srcDir } from './constants';

export interface ResponseSettings {
    okResponse?: string;
    responseType: 'reply' | 'send' | 'none';
}

export interface ChannelConfig {
    id: string;
    name: string;
    enabled: boolean;
    type: 'forum' | 'text' | 'other';
    event: 'threadCreate' | 'messageCreate' | 'threadUpdate';
    requireMention?: boolean;
    model: string;
    systemPrompt: string;
    responseSettings: ResponseSettings;
}

export interface BotConfig {
    channels: ChannelConfig[];
}

export class ConfigService {
    private static instance: ConfigService;
    private config: BotConfig;

    private constructor() {
        try {
            const configPath = path.join(srcDir, 'config', 'botConfig.json');
            const configFile = readFileSync(configPath, 'utf8');
            this.config = JSON.parse(configFile) as BotConfig;
            
            // Set default enabled value for channels that don't specify it
            this.config.channels.forEach(channel => {
                if (channel.enabled === undefined) {
                    channel.enabled = false;
                }
            });
            
            container.logger.info('Bot configuration loaded successfully');
        } catch (error) {
            container.logger.error('Failed to load bot configuration', error);
            // Initialize with empty configuration if file can't be loaded
            this.config = { channels: [] };
        }
    }

    public static getInstance(): ConfigService {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService();
        }
        return ConfigService.instance;
    }

    public getConfig(): BotConfig {
        return this.config;
    }

    public getChannelConfig(channelId: string): ChannelConfig | undefined {
        return this.config.channels.find(channel => 
            channel.id === channelId && 
            channel.enabled !== false
        );
    }

    public getChannelsByEventType(eventType: string): ChannelConfig[] {
        return this.config.channels.filter(channel => 
            channel.event === eventType && 
            channel.enabled !== false
        );
    }
}