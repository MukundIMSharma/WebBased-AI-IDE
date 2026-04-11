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


const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

const ptyProcess = pty.spawn('powershell.exe', [], {
    name: 'xterm-color',
    cols: 120,
    rows: 12,
    cwd: path.resolve('./__user'),
    env: process.env
});

const app = express()
const server = http.createServer(app);
const io = new SocketServer({
    cors: {
        origin: "*"
    }
});
app.use(cors());

// attacking socket server to http serverS
io.attach(server);

// mount AI routes
app.use("/ai", aiRouter);

chokidar.watch('./__user').on('all', (event, path) => {
    io.emit('file:refresh', path)
});


//data on terminal to be shown
ptyProcess.onData((data) => {
    // const cleanData = stripAnsi(data);
    // console.log("PTY Output (Clean):", cleanData);
    io.emit('terminal:data', data);
});

//only one socket connected becoz only one user / container to be connected
io.on("connection", (socket) => {
    console.log("a user connected", socket.id);
    socket.on('terminal:write', (data) => {
        // console.log("PTY Write:", data); // DEBUG LOG
        ptyProcess.write(data);
    })
    return
})



app.get("/files", async (req, res) => {
    const fileTree = await generateFileTree('./__user');
    return res.json({ tree: fileTree });
})

app.get("/files/content", async (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: "Path is required" });

    try {
        const safePath = path.resolve('./__user', filePath);
        const content = await fs.readFile(safePath, 'utf-8');
        return res.json({ content });
    } catch (err) {
        return res.status(500).json({ error: "Failed to read file" });
    }
})

app.post("/files/content", express.json(), async (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: "Path is required" });

    try {
        const safePath = path.resolve('./__user', filePath);
        await fs.writeFile(safePath, content, 'utf-8');
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