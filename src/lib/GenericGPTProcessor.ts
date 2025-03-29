import { container } from '@sapphire/framework';
import { ForumChannel, Message, ThreadChannel } from 'discord.js';
import OpenAI from 'openai';
import { ChannelConfig, ConfigService } from './ConfigService';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// General function for processing messages with GPT based on configuration
export async function processWithGPT(
    content: string,
    config: ChannelConfig,
    channelId: string
): Promise<string | undefined> {
    try {
        container.logger.debug(`Processing message with GPT for config "${config.name}"`);
        
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "system" as const, content: config.systemPrompt },
            { role: "user" as const, content: content }
        ];

        console.log(messages);
        
        const chatCompletion = await openai.chat.completions.create({
            messages: messages,
            model: config.model,
        });
        
        const answer = chatCompletion.choices[0].message.content;
        
        if (!answer) {
            container.logger.debug(`GPT returned no answer for config "${config.name}"`);
            return undefined;
        }
        
        // Check if this is an "OK" response that should be ignored
        if (config.responseSettings.okResponse && answer === config.responseSettings.okResponse) {
            container.logger.debug(`GPT returned OK response for config "${config.name}", no action needed`);
            return undefined;
        }
        
        return answer;
    } catch (error) {
        container.logger.error(`Error processing message with GPT for config "${config.name}":`, error);
        return undefined;
    }
}

// Process a thread in a forum channel
export async function processForumThread(thread: ThreadChannel): Promise<string | undefined> {
    try {
        // Get channel configuration
        const config = ConfigService.getInstance().getChannelConfig(thread.parent?.id || '');
        if (!config) {
            container.logger.debug(`No configuration found for channel ID ${thread.parent?.id}`);
            return undefined;
        }
        
        // Fetch the first message in the thread
        const message = (await thread.messages.fetch({ limit: 1 })).last();
        if (!message) {
            container.logger.debug(`No messages found in thread ${thread.id} for config "${config.name}"`);
            return undefined;
        }
        
        // Format the message content with thread name and tags
        const tags: string[] = [];
        
        if (thread.parent?.type === ChannelType.GuildForum) {
            const forum = thread.parent as ForumChannel;
            thread.appliedTags.forEach(tag => {
                const tagObject = forum.availableTags.find(t => t.id === tag);
                if (tagObject) tags.push(`[${tagObject.name}]`);
            });
        }
        
        const userMessage = `Title: ${thread.name}
Tags: ${tags.join(" ")}
Post: ${message.content}`;
        
        // Process with GPT
        const answer = await processWithGPT(userMessage, config, thread.parent?.id || '');
        if (!answer) return undefined;
        
        // Reply to the message if needed
        if (config.responseSettings.responseType === 'reply') {
            await message.reply(answer);
        } else if (config.responseSettings.responseType === 'send') {
            await thread.send(answer);
        }
        
        return answer;
    } catch (error) {
        container.logger.error('Error processing forum thread:', error);
        return undefined;
    }
}

// Process a message in a text channel
export async function processTextMessage(message: Message): Promise<string | undefined> {
    try {
        // Get channel configuration
        const config = ConfigService.getInstance().getChannelConfig(message.channel.id);
        if (!config) return undefined;
        
        // Check if we need to be mentioned and if we are
        if (config.requireMention && !message.mentions.has(message.client.user?.id || '')) {
            return undefined;
        }
        
        // Ignore messages from bots (including self)
        if (message.author.bot) {
            return undefined;
        }
        
        // Format user message
        const userMessage = `[User:${message.author.displayName}:${message.author.id}] ${message.cleanContent}`;
        
        // Process with GPT
        const answer = await processWithGPT(userMessage, config, message.channel.id);
        if (!answer) return undefined;
        
        // Reply to the message if needed
        if (config.responseSettings.responseType === 'reply') {
            await message.reply(answer);
        } else if (config.responseSettings.responseType === 'send') {
            if (message.channel.isSendable()) await message.channel.send(answer);
        }
        
        return answer;
    } catch (error) {
        container.logger.error('Error processing text message:', error);
        return undefined;
    }
}

// Helper enum for channel types
enum ChannelType {
    GuildForum = 15
}