import { Listener } from '@sapphire/framework';
import { type ThreadChannel } from 'discord.js';
import { ConfigService } from '../lib/ConfigService';
import { processForumThread } from '../lib/GenericGPTProcessor';

export class ConfigThreadListener extends Listener {
    public constructor(context: Listener.Context, options: Listener.Options) {
        super(context, {
            ...options,
            event: 'threadCreate',
            enabled: true,
        });
    }

    override async run(thread: ThreadChannel): Promise<unknown> {
        // Check if this thread's channel is configured in our system
        const channelConfigs = ConfigService.getInstance().getChannelsByEventType('threadCreate');
        
        // If there's no config for this event type, exit early
        if (!channelConfigs || channelConfigs.length === 0) {
            this.container.logger.debug('No channel configurations found for threadCreate event');
            return;
        }

        // Find config for this specific channel
        const config = ConfigService.getInstance().getChannelConfig(thread.parent?.id || '');
        
        // If we don't have a configuration for this channel or it's disabled, ignore it
        if (!config) {
            return;
        }

        // Log that we're processing this thread
        this.container.logger.debug(`Processing new thread in configuration "${config.name}"`);
        
        // Process the thread based on configuration
        await processForumThread(thread);

        return;
    }
}