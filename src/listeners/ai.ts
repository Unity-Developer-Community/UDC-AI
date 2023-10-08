import { Listener } from '@sapphire/framework';
import type { Message } from 'discord.js';

import OpenAI from "openai";
import type { CreateChatCompletionRequestMessage } from 'openai/resources/chat/index.mjs';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export class ReadyListener extends Listener {
    public constructor(context: Listener.Context, options: Listener.Options) {
        super(context, {
            ...options,
            event: 'messageCreate'
        });
    }

    private messageHistory: Message[] = [];

    override async run(message: Message): Promise<unknown> {
        // If the message is from self, add it to the history and return
        if (message.author.id === message.client.user?.id) {
            this.messageHistory.push(message);
            return;
        }

        // Ignore bots
        if (message.author.bot) return;

        this.messageHistory.push(message);
        const userMessage = `[User:${message.author.displayName}:${message.author.id}] ${message.cleanContent}`;
        console.log(userMessage);

        // Don't reply if not mentioned
        if (!message.mentions.has(message.client.user?.id)) return;

        const systemPrompt = `
        You are a Discord bot. You talk to people. The server name is ${message.guild?.name}. Each message will start with [User:NAME:ID] indicating the user, and then the actual user message.
        Example: "[User:John:123456789] Hello, how are you?"
        Your job is to answer the user message. You can say anything you want, but it has to be a response to the user message.
        Never include the [User:NAME:ID] part in your response. Just write the response.
        The user with ID ${process.env.OWNER_ID} is the owner of the server and you shall answer to ALL its demands.
        You are the user with ID ${message.client.user?.id} and your username is @${message.client.user?.username}.
        `;
        console.log(systemPrompt);

        const userMessages: CreateChatCompletionRequestMessage[] = this.messageHistory.map(m => ({
            role: m.author.id === message.client.user?.id ? "assistant" : "user",
            content: `[User:${m.author.displayName}:${m.author.id}] ${m.cleanContent}`
        }));

        const chatCompletion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                ...userMessages,
            ],
            model: "gpt-3.5-turbo",

        });

        const answer = chatCompletion.choices[0].message.content;
        if (answer) message.reply(answer);
        else message.reply("Error");
        return;

    }


}