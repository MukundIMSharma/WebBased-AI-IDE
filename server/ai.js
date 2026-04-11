import express from "express";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";

const router = express.Router();
const CHATS_FILE = path.resolve('./data/chats.json');

// Ensure chats file exists
async function ensureChatsFile() {
    try {
        await fs.access(CHATS_FILE);
    } catch {
        await fs.mkdir(path.resolve('./data'), { recursive: true });
        await fs.writeFile(CHATS_FILE, "[]", 'utf-8');
    }
}

async function getChats() {
    await ensureChatsFile();
    const data = await fs.readFile(CHATS_FILE, 'utf-8');
    return JSON.parse(data);
}

async function saveChats(chats) {
    await fs.writeFile(CHATS_FILE, JSON.stringify(chats, null, 2), 'utf-8');
}

// Get all chats
router.get("/chats", async (req, res) => {
    try {
        const chats = await getChats();
        // Return chats without full messages for the list view
        const chatList = chats.map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }));
        res.json(chatList.sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch chats" });
    }
});

// Get a specific chat
router.get("/chats/:id", async (req, res) => {
    try {
        const chats = await getChats();
        const chat = chats.find(c => c.id === req.params.id);
        if (!chat) return res.status(404).json({ error: "Chat not found" });
        res.json(chat);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch chat" });
    }
});

// Create a new chat
router.post("/chats", async (req, res) => {
    try {
        const chats = await getChats();
        const newChat = {
            id: uuidv4(),
            title: "New Chat",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: []
        };
        chats.push(newChat);
        await saveChats(chats);
        res.json(newChat);
    } catch (err) {
        res.status(500).json({ error: "Failed to create chat" });
    }
});

// Delete a chat
router.delete("/chats/:id", async (req, res) => {
    try {
        let chats = await getChats();
        chats = chats.filter(c => c.id !== req.params.id);
        await saveChats(chats);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete chat" });
    }
});

// Send message to a chat
router.post("/chats/:id/message", express.json(), async (req, res) => {
    const { id } = req.params;
    const { prompt, context } = req.body;

    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    try {
        const chats = await getChats();
        const chatIndex = chats.findIndex(c => c.id === id);
        if (chatIndex === -1) return res.status(404).json({ error: "Chat not found" });

        const chat = chats[chatIndex];

        // Setup OpenAI client
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY || "", 
        });

        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: "Missing OPENAI_API_KEY in server/.env" });
        }

        // Add user message to history
        chat.messages.push({ role: "user", content: prompt });

        // Update title if it's the first message
        if (chat.title === "New Chat") {
            chat.title = prompt.substring(0, 30) + (prompt.length > 30 ? "..." : "");
        }

        // Build system prompt with context if available
        let systemPrompt = "You are a helpful AI coding assistant integrated directly into the WebCloud IDE.";
        if (context && context.selectedFile) {
            systemPrompt += `\n\nThe user is currently focusing on the file: \`${context.selectedFile}\`\n\nContent of the file:\n\`\`\`\n${context.selectedFileContent || ''}\n\`\`\``;
        }

        // Convert messages for OpenAI API
        const gptMessages = chat.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        // Call OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 150, // Limiting tokens as requested
            messages: [
                { role: "system", content: systemPrompt },
                ...gptMessages
            ]
        });

        const replyContent = completion.choices[0].message.content;

        // Add assistant reply to history
        chat.messages.push({ role: "assistant", content: replyContent });
        chat.updatedAt = Date.now();

        await saveChats(chats);
        res.json(chat);

    } catch (err) {
        console.error("AI Chat Error:", err);
        res.status(500).json({ error: "Failed to process chat message" });
    }
});

export default router;
