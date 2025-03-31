import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ChannelType, Message, ThreadChannel } from 'discord.js';
import { ChannelConfig, ConfigService } from '../lib/ConfigService';
import { processForumThread, processTextMessage } from '../lib/GenericGPTProcessor';

@ApplyOptions<Command.Options>({
    description: 'Manually check an existing post or message with the configured AI',
    requiredUserPermissions: ['ManageMessages'],
    enabled: true
})
export class UserCommand extends Command {
    // Register Chat Input command
    public override registerApplicationCommands(registry: Command.Registry) {
        // Slash command for use in threads
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
        );

        // Context menu command for both messages in text channels and threads
        registry.registerContextMenuCommand((builder) =>
            builder
                .setName('Check with AI')
                .setType(3) // MESSAGE type (3)
        );
    }

    // Chat Input (slash) command - only works in threads
    public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if the command was used in a thread
            if (!interaction.channel || interaction.channel.type !== ChannelType.PublicThread) {
                return interaction.editReply({
                    content: 'This command can only be used in forum post threads.',
                });
            }

            const thread = interaction.channel as ThreadChannel;

            // First check if there's a configuration for this thread's parent channel
            const config = ConfigService.getInstance().getChannelConfig(thread.parentId || '');

            if (!config) {
                return interaction.editReply({
                    content: `No AI configuration found for the parent channel of this thread.`,
                });
            }

            // Then check the configuration type and process accordingly
            if (config.type === 'forum') {
                return await this.processThread(thread, config, interaction);
            } else {
                return interaction.editReply({
                    content: `The configuration for this channel is of type "${config.type}", but needs to be "forum" to process threads.`,
                });
            }

        } catch (error) {
            this.container.logger.error(error);
            return interaction.editReply({
                content: `An error occurred while processing: ${error}`,
            });
        }
    }

    // Context Menu command handler - works for messages in both threads and text channels
    public override async contextMenuRun(interaction: Command.ContextMenuCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const targetMessage = await interaction.channel?.messages.fetch(interaction.targetId);

            if (!targetMessage) {
                return interaction.editReply({
                    content: 'Could not find the target message.',
                });
            }

            // Process differently based on channel type
            if (interaction.channel?.type === ChannelType.PublicThread) {
                const thread = interaction.channel as ThreadChannel;

                // First check if there's a configuration for this thread's parent channel
                let config = ConfigService.getInstance().getChannelConfig(thread.parentId || '');
                if (!config) config = ConfigService.getInstance().getChannelConfig(thread.id || '');

                if (!config) {
                    return interaction.editReply({
                        content: `No AI configuration found for the parent channel of this thread.`,
                    });
                }

                // Then check the configuration type and process accordingly
                if (config.type === 'forum') return await this.processThread(thread, config, interaction);
                else return await this.processMessage(targetMessage, config, interaction);

            } else {
                // For a regular text channel, first check if there's a configuration
                const config = ConfigService.getInstance().getChannelConfig(interaction.channelId);

                if (!config) {
                    return interaction.editReply({
                        content: `No AI configuration found for this channel.`,
                    });
                }

                // Then check if the configuration is for text channels
                if (config.type === 'text') {
                    return await this.processMessage(targetMessage, config, interaction);
                } else {
                    return interaction.editReply({
                        content: `The configuration for this channel is of type "${config.type}", but needs to be "text" to process messages.`,
                    });
                }
            }

        } catch (error) {
            this.container.logger.error(error);
            return interaction.editReply({
                content: `An error occurred while processing: ${error}`,
            });
        }
    }

    // Process a thread with the given configuration
    private async processThread(
        thread: ThreadChannel,
        config: ChannelConfig,
        interaction: Command.ChatInputCommandInteraction | Command.ContextMenuCommandInteraction
    ) {
        this.container.logger.debug(`Processing thread in configuration "${config.name}"`);

        const response = await processForumThread(thread);

        if (!response) {
            return interaction.editReply({
                content: `The thread was processed but no response was generated. This may be because the AI determined no action was needed.`,
            });
        }

        return interaction.editReply({
            content: `✅ Successfully processed the thread with configuration "${config.name}".`,
        });
    }

    // Process a message with the given configuration
    private async processMessage(
        message: Message,
        config: ChannelConfig,
        interaction: Command.ContextMenuCommandInteraction
    ) {
        this.container.logger.debug(`Processing message in configuration "${config.name}"`);

        const response = await processTextMessage(message, true);

        if (!response) {
            return interaction.editReply({
                content: `The message was processed but no response was generated. This may be because the AI determined no action was needed.`,
            });
        }

        return interaction.editReply({
            content: `✅ Successfully processed the message with configuration "${config.name}".`,
        });
    }
}