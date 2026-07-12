// const http = require("http");
// const express = require("express")
// const { Server: SocketServer } = require("socket.io")
import http from "http";
import express from "express";
import { Server as SocketServer } from "socket.io";
import * as pty from "node-pty"
import * as os from "os"
import stripAnsi from "strip-ansi";
import fs from "fs/promises";
import path from "path";
import cors from "cors";
import chokidar from 'chokidar';
import { setupLsp } from './lsp.js';
import "dotenv/config";
import aiRouter from './ai.js';
import { ensureContainer, containerExec } from './containerManager.js';
import { initDb, findOrCreateUserByGitHub, getUserHfToken, updateUserHfToken } from './db.js';
import { generateToken, authenticateToken, authenticateSocketToken } from './auth.js';

await initDb();

const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

const app = express()
const server = http.createServer(app);
const io = new SocketServer({
    cors: {
        origin: "*"
    }
});
app.use(cors());

// Mount OAuth Routes
app.get("/api/auth/github", (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const backendUrl = process.env.BACKEND_URL || "http://localhost:9000";
    const redirectUri = `${backendUrl}/api/auth/github/callback`;
    const scope = "user:email";
    
    if (!clientId) {
        return res.status(500).json({ error: "GITHUB_CLIENT_ID is not configured in server/.env" });
    }
    
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
    res.redirect(githubAuthUrl);
});

app.get("/api/auth/github/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).json({ error: "Missing authorization code" });
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    try {
        const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code
            })
        });

        const tokenData = await tokenResponse.json();
        if (tokenData.error) {
            console.error("GitHub OAuth Error:", tokenData);
            return res.status(400).json({ error: tokenData.error_description || "Failed to authenticate with GitHub" });
        }

        const accessToken = tokenData.access_token;

        const userResponse = await fetch("https://api.github.com/user", {
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "User-Agent": "WebCloud-IDE-AI-Assistant"
            }
        });
        const userProfile = await userResponse.json();

        if (!userProfile.email) {
            const emailsResponse = await fetch("https://api.github.com/user/emails", {
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "User-Agent": "WebCloud-IDE-AI-Assistant"
                }
            });
            const emails = await emailsResponse.json();
            if (Array.isArray(emails)) {
                const primaryEmail = emails.find(e => e.primary && e.verified) || emails[0];
                if (primaryEmail) {
                    userProfile.email = primaryEmail.email;
                }
            }
        }

        const user = await findOrCreateUserByGitHub(userProfile);
        const jwtToken = generateToken(user);
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        res.redirect(`${frontendUrl}/?token=${jwtToken}`);
    } catch (err) {
        console.error("OAuth callback processing failed:", err);
        res.status(500).json({ error: "Internal Authentication Error" });
    }
});

// attacking socket server to http serverS
io.attach(server);

// mount AI routes
app.use("/ai", aiRouter);

const activeTerminals = new Map();

io.use(authenticateSocketToken);

setInterval(async () => {
    for (const userId of activeTerminals.keys()) {
        try {
            const out = await containerExec(userId, ['sh', '-c', 'touch /tmp/lastcheck_tmp && find /home/user/workspace -newer /tmp/lastcheck 2>/dev/null || true; mv /tmp/lastcheck_tmp /tmp/lastcheck']);
            if (out && out.trim()) {
                const files = out.trim().split('\n').filter(f => f && typeof f === 'string' && f.includes('/workspace/'));
                if (files.length > 0) {
                    io.to(userId).emit('file:refresh', files[0]);
                }
            }
        } catch(err) {
            // ignore periodic poll errors
        }
    }
}, 2000);

io.on("connection", async (socket) => {
    const userId = socket.user.id;
    console.log(`User connected to terminal socket: ${userId} (${socket.id})`);
    
    socket.join(userId);
    
    try {
        await ensureContainer(userId);
        
        let userPty = activeTerminals.get(userId);
        if (!userPty) {
            userPty = pty.spawn('docker', ['exec', '-it', `ide_user_${userId}`, '/bin/bash'], {
                name: 'xterm-color',
                cols: 120,
                rows: 12,
                env: process.env
            });
            activeTerminals.set(userId, userPty);
            
            userPty.onData((data) => {
                io.to(userId).emit('terminal:data', data);
            });
        }
        
        socket.on('terminal:write', (data) => {
            userPty.write(data);
        });
        
        socket.on('disconnect', () => {
            console.log(`Socket disconnected for user: ${userId} (${socket.id})`);
            setTimeout(async () => {
                const sockets = await io.in(userId).fetchSockets();
                if (sockets.length === 0) {
                    const process = activeTerminals.get(userId);
                    if (process) {
                        console.log(`Cleaning up idle terminal process for user: ${userId}`);
                        process.kill();
                        activeTerminals.delete(userId);
                    }
                }
            }, 60000); // 60s grace period
        });
        
    } catch (err) {
        console.error(`Failed to initialize terminal container for user ${userId}:`, err);
        socket.emit('terminal:error', 'Failed to boot terminal environment.');
    }
});



app.get("/api/user/hf-token", authenticateToken, async (req, res) => {
    try {
        const token = await getUserHfToken(req.user.id);
        res.json({ hasToken: !!token, hfToken: token || "" });
    } catch (err) {
        console.error("Failed to get HF token:", err);
        res.status(500).json({ error: "Failed to query Hugging Face token." });
    }
});

app.post("/api/user/hf-token", authenticateToken, express.json(), async (req, res) => {
    const { hfToken } = req.body;
    if (hfToken === undefined) {
        return res.status(400).json({ error: "hfToken field is required." });
    }

    try {
        if (hfToken) {
            // Validate the token against HuggingFace WHOAMI endpoint
            const hfRes = await fetch("https://huggingface.co/api/whoami-v2", {
                headers: {
                    "Authorization": `Bearer ${hfToken}`
                }
            });

            if (!hfRes.ok) {
                const errBody = await hfRes.json().catch(() => ({}));
                const errMessage = errBody.error || "Authentication failed. Check your token.";
                return res.status(400).json({ error: `HuggingFace API: ${errMessage}` });
            }
        }

        await updateUserHfToken(req.user.id, hfToken);
        res.json({ success: true, hasToken: !!hfToken });
    } catch (err) {
        console.error("Failed to validate or save HF token:", err);
        res.status(500).json({ error: "Server error during token validation." });
    }
});

app.get("/files", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        await ensureContainer(userId);

        const payload = `
            const fs = require('fs/promises');
            const path = require('path');
            async function generateFileTree(directory) {
                const tree = {}
                async function buildTree(curr_dir, curr_tree) {
                    const ObjectKeys = await fs.readdir(curr_dir);
                    for (const file of ObjectKeys) {
                        const filePath = path.join(curr_dir, file);
                        const stats = await fs.stat(filePath);
                        if (stats.isDirectory()) {
                            curr_tree[file] = {};
                            await buildTree(filePath, curr_tree[file]);
                        } else {
                            curr_tree[file] = "file";
                        }
                    }
                }
                await buildTree(directory, tree)
                console.log(JSON.stringify(tree));
            }
            generateFileTree('/home/user/workspace').catch(err => { console.error(err); });
        `;
        const out = await containerExec(userId, ['node', '-e', payload]);
        if (!out) return res.json({ tree: {} });
        const lines = out.split('\n').filter(l => l.trim().startsWith('{'));
        const fileTree = lines.length ? JSON.parse(lines[lines.length - 1]) : {};
        return res.json({ tree: fileTree });
    } catch(err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to generate file tree" });
    }
})

app.get("/files/content", authenticateToken, async (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: "Path is required" });

    try {
        const userId = req.user.id;
        await ensureContainer(userId);

        const relPath = filePath.replace(/^[\\\/\\\\]+/, '');
        const content = await containerExec(userId, ['cat', `/home/user/workspace/${relPath}`]);
        return res.json({ content });
    } catch (err) {
        return res.status(500).json({ error: "Failed to read file" });
    }
})

app.post("/files/content", authenticateToken, express.json(), async (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: "Path is required" });

    try {
        const userId = req.user.id;
        await ensureContainer(userId);

        const relPath = filePath.replace(/^[\\\/\\\\]+/, '');
        const safePath = `/home/user/workspace/${relPath}`;
        await containerExec(userId, ['sh', '-c', 'cat > "$1"', '--', safePath], content);
        return res.json({ message: "File saved successfully" });
    } catch (err) {
        return res.status(500).json({ error: "Failed to save file" });
    }
})



server.listen(9000, () => {
    console.log("🐬  Docker connected and listening on port 9000...");
})

setupLsp(server);



// -------- File Tere generation!!!!.....

async function generateFileTree(directory) {
    const tree = {}

    async function buildTree(curr_dir, curr_tree) {
        const files = await fs.readdir(curr_dir);
        for (const file of files) {
            const filePath = path.join(curr_dir, file);
            const stats = await fs.stat(filePath);
            if (stats.isDirectory()) {
                curr_tree[file] = {};
                await buildTree(filePath, curr_tree[file]);
            } else {
                curr_tree[file] = "file";
            }
        }
    }
    await buildTree(directory, tree)
    return tree;
}