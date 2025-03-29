import { container } from '@sapphire/framework';
import { ForumChannel, Message, ThreadChannel } from 'discord.js';
import OpenAI from 'openai';
import ollama from 'ollama'

import { ChannelConfig, ConfigService } from './ConfigService';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

interface InputMessage {
    role: "system" | "user";
    content: string;
}

const MAX_MESSAGE_LENGTH = 1950;
/**
 * Split the original message into several messages that are under the MAX length
 * @param message The message to split */
function splitMessage(message: string): string[] {
    const messages: string[] = [];

    let rest = message;
    do {
        messages.push(rest.slice(0, MAX_MESSAGE_LENGTH));
        rest = rest.slice(messages[messages.length - 1].length);
    } while (rest.length > 0)
    return messages;
}


export async function processWithOllama(
    model: string,
    messages: InputMessage[]
): Promise<string | undefined> {
    try {
        const response = await ollama.chat({
            model: model,
            messages: messages,
        });

        return response.message.content;
    } catch (error) {
        container.logger.error(`Error processing message with Ollama:`, error);
        return undefined;
    }
}

export async function processWithGPT(
    model: string,
    messages: InputMessage[]
): Promise<string | undefined> {
    try {
        const chatCompletion = await openai.chat.completions.create({
            model: model,
            messages: messages,
        });

        return chatCompletion.choices[0].message.content || undefined;
    } catch (error) {
        container.logger.error(`Error processing message with GPT:`, error);
        return undefined;
    }
}

// General function for processing messages with GPT based on configuration
export async function prepareMessage(
    content: string,
    config: ChannelConfig,
    channelId: string
): Promise<string | undefined> {
    try {
        container.logger.debug(`Preparing message with ${config.modelType} for config "${config.name}"`);

        console.log(config.systemPrompt);
        const messages: InputMessage[] = [
            { role: "system" as const, content: config.systemPrompt },
            { role: "user" as const, content: content }
        ];

        let answer: string | undefined;
        
        // Use the correct API based on the modelType property
        if (config.modelType === 'ollama') {
            answer = await processWithOllama(config.model, messages);
        } else {
            // Default to OpenAI
            answer = await processWithGPT(config.model, messages);
        }

        if (!answer) {
            container.logger.debug(`Model returned no answer for config "${config.name}"`);
            return undefined;
        }

        // Check if this is an "OK" response that should be ignored
        if (config.responseSettings.okResponse && answer === config.responseSettings.okResponse) {
            container.logger.debug(`Model returned OK response for config "${config.name}", no action needed`);
            return undefined;
        }

        return answer;
    } catch (error) {
        container.logger.error(`Error processing message for config "${config.name}":`, error);
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

        // Show typing indicator while generating response
        await thread.sendTyping();

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
        const answer = await prepareMessage(userMessage, config, thread.parent?.id || '');
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

        // Show typing indicator while generating response
        if (message.channel.isSendable()) {
            await message.channel.sendTyping();
        }

        // Process with GPT
        const answer = await prepareMessage(message.cleanContent, config, message.channel.id);
        if (!answer) return undefined;

        // If the message is longer than 2000 characters, split it in multiples messages.
        const splitMessages = splitMessage(answer);

        splitMessages.forEach(async answer => {
            // Reply to the message if needed
            if (config.responseSettings.responseType === 'reply') {
                await message.reply(answer);
            } else if (config.responseSettings.responseType === 'send') {
                if (message.channel.isSendable()) await message.channel.send(answer);
            }
        })

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