import express from "express";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import {
    getChats as dbGetChats,
    getChat as dbGetChat,
    createChat as dbCreateChat,
    deleteChat as dbDeleteChat,
    addMessage as dbAddMessage,
    updateChatTitle as dbUpdateChatTitle
} from './db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// Get all chats
router.get("/chats", authenticateToken, async (req, res) => {
    try {
        const chats = await dbGetChats(req.user.id);
        res.json(chats);
    } catch (err) {
        console.error("Fetch chats error:", err);
        res.status(500).json({ error: "Failed to fetch chats" });
    }
});

// Get a specific chat
router.get("/chats/:id", authenticateToken, async (req, res) => {
    try {
        const chat = await dbGetChat(req.user.id, req.params.id);
        if (!chat) return res.status(404).json({ error: "Chat not found" });
        res.json(chat);
    } catch (err) {
        console.error("Fetch chat error:", err);
        res.status(500).json({ error: "Failed to fetch chat" });
    }
});

// Create a new chat
router.post("/chats", authenticateToken, async (req, res) => {
    try {
        const id = uuidv4();
        const chat = await dbCreateChat(req.user.id, id, "New Chat");
        res.json(chat);
    } catch (err) {
        console.error("Create chat error:", err);
        res.status(500).json({ error: "Failed to create chat" });
    }
});

// Delete a chat
router.delete("/chats/:id", authenticateToken, async (req, res) => {
    try {
        await dbDeleteChat(req.user.id, req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error("Delete chat error:", err);
        res.status(500).json({ error: "Failed to delete chat" });
    }
});

// Send message to a chat (NDJSON Streaming)
router.post("/chats/:id/message", authenticateToken, express.json(), async (req, res) => {
    const { id } = req.params;
    const { prompt, context } = req.body;

    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    try {
        const chat = await dbGetChat(req.user.id, id);
        if (!chat) return res.status(404).json({ error: "Chat not found" });

        // Setup OpenAI client
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY || "", 
        });

        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: "Missing OPENAI_API_KEY in server/.env" });
        }

        // Generate message IDs and save User message to database
        const userMsgId = uuidv4();
        await dbAddMessage(userMsgId, id, "user", prompt);

        // Update title if it was the default "New Chat"
        if (chat.title === "New Chat") {
            const newTitle = prompt.substring(0, 30) + (prompt.length > 30 ? "..." : "");
            await dbUpdateChatTitle(req.user.id, id, newTitle);
        }

        // Build system prompt with editor context
        let systemPrompt = "You are an expert AI coding assistant embedded inside a web-based IDE, similar to Cursor.\n";
        if (context) {
            if (context.selectedFile) {
                systemPrompt += `The user is currently working on: ${context.selectedFile}\n\n`;
            }
            if (context.selectedFileContent) {
                systemPrompt += `Full file content:\n\`\`\`\n${context.selectedFileContent}\n\`\`\`\n\n`;
            }
            if (context.editorContext) {
                if (context.editorContext.selectedText) {
                    systemPrompt += `Selected text (lines around cursor):\n\`\`\`\n${context.editorContext.selectedText}\n\`\`\`\n\n`;
                }
                systemPrompt += `Cursor is at line ${context.editorContext.cursorLine}.\n`;
            }
            systemPrompt += "When suggesting code changes, reference specific start and end line numbers.\n";
            systemPrompt += "When you produce a code block intended to replace existing code, wrap it EXPLICITLY in XML-like tags, exactly like this format:\n";
            systemPrompt += "<replace_block file=\"filename\" start_line=\"N\" end_line=\"N\">\nCODE GOES HERE\n</replace_block>\n";
            systemPrompt += "The IDE will parse these tags to automate updating the code visually, so ensure the replacement precisely covers what you wish to replace!";
        }

        // Get past messages for completion
        const gptMessages = chat.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        // Setup NDJSON Stream headers
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Call OpenAI with stream
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 1500,
            stream: true,
            messages: [
                { role: "system", content: systemPrompt },
                ...gptMessages,
                { role: "user", content: prompt }
            ]
        });

        let fullReply = "";

        for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
                fullReply += content;
                // Emit chunk as structured JSON followed by a newline
                res.write(JSON.stringify({ type: "text", delta: content }) + "\n");
            }
        }
        res.end();

        // Save assistant reply to SQLite
        const assistantMsgId = uuidv4();
        await dbAddMessage(assistantMsgId, id, "assistant", fullReply);

    } catch (err) {
        console.error("AI Chat Error:", err);
        // If headers are already sent, we write the error event inline to avoid breaking the stream
        if (res.headersSent) {
            res.write(JSON.stringify({ type: "error", message: "Failed to complete AI response." }) + "\n");
            res.end();
        } else {
            res.status(500).json({ error: "Failed to process chat message" });
        }
    }
});

export default router;
