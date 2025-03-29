import { Listener } from '@sapphire/framework';
import { type Message } from 'discord.js';
import { ConfigService } from '../lib/ConfigService';
import { processTextMessage } from '../lib/GenericGPTProcessor';

export class ConfigMessageListener extends Listener {
    public constructor(context: Listener.Context, options: Listener.Options) {
        super(context, {
            ...options,
            event: 'messageCreate',
            enabled: true,
        });
    }

    override async run(message: Message): Promise<unknown> {
        // Check if this message's channel is configured in our system
        const channelConfigs = ConfigService.getInstance().getChannelsByEventType('messageCreate');
        
        // If there's no config for this event type, exit early
        if (!channelConfigs || channelConfigs.length === 0) {
            return;
        }

        // Find config for this specific channel
        const config = ConfigService.getInstance().getChannelConfig(message.channel.id);
        
        // If we don't have a configuration for this channel or it's disabled, ignore it
        if (!config) {
            return;
        }

        // Process the message based on configuration
        await processTextMessage(message);

        return;
    }
}