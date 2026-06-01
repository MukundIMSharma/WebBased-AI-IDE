import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, './data');
const DB_FILE = path.resolve(DB_DIR, 'chats.db');

let db;

export async function initDb() {
    // Ensure the data directory exists
    await fs.mkdir(DB_DIR, { recursive: true });

    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_FILE, (err) => {
            if (err) {
                console.error("Failed to connect to SQLite:", err);
                return reject(err);
            }
            console.log("Connected to SQLite database at:", DB_FILE);
            
            // Create tables
            db.serialize(() => {
                db.run(`PRAGMA foreign_keys = ON`);
                
                db.run(`
                    CREATE TABLE IF NOT EXISTS users (
                        id TEXT PRIMARY KEY,
                        githubId TEXT UNIQUE,
                        username TEXT NOT NULL,
                        email TEXT UNIQUE NOT NULL,
                        createdAt INTEGER NOT NULL
                    )
                `);

                // Check if chats table exists and has userId column
                db.all("PRAGMA table_info(chats)", (err, columns) => {
                    if (err) {
                        return reject(err);
                    }
                    
                    const hasUserId = columns && columns.some(col => col.name === 'userId');
                    
                    // If chats table exists but doesn't have a userId column, drop tables to recreate them
                    if (columns && columns.length > 0 && !hasUserId) {
                        console.log("Upgrading chats database schema (dropping old incompatible tables)...");
                        db.run("DROP TABLE IF EXISTS messages");
                        db.run("DROP TABLE IF EXISTS chats");
                    }
                    
                    db.run(`
                        CREATE TABLE IF NOT EXISTS chats (
                            id TEXT PRIMARY KEY,
                            userId TEXT NOT NULL,
                            title TEXT NOT NULL,
                            createdAt INTEGER NOT NULL,
                            updatedAt INTEGER NOT NULL,
                            FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
                        )
                    `);

                    db.run(`
                        CREATE TABLE IF NOT EXISTS messages (
                            id TEXT PRIMARY KEY,
                            chatId TEXT NOT NULL,
                            role TEXT NOT NULL,
                            content TEXT NOT NULL,
                            toolCalls TEXT, -- Serialized JSON array of tool status objects
                            createdAt INTEGER NOT NULL,
                            FOREIGN KEY (chatId) REFERENCES chats (id) ON DELETE CASCADE
                        )
                    `);

                    db.run(`CREATE INDEX IF NOT EXISTS idx_chats_userId ON chats(userId)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_chatId ON messages(chatId)`, (err) => {
                        if (err) {
                            return reject(err);
                        }
                        resolve();
                    });
                });
            });
        });
    });
}

// Get helper database operation
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function getRows(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getRow(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// Find or create user after successful GitHub OAuth login
export async function findOrCreateUserByGitHub(profile) {
    const githubId = String(profile.id);
    const username = profile.login || profile.username || 'github_user';
    const email = profile.email || `${username}@github.com`;
    
    const existingUser = await getRow(`SELECT id, githubId, username, email FROM users WHERE githubId = ?`, [githubId]);
    if (existingUser) return existingUser;
    
    // Check if user with same email exists
    const existingEmailUser = await getRow(`SELECT id, githubId, username, email FROM users WHERE email = ?`, [email]);
    if (existingEmailUser) {
        // Link githubId to this email
        await runQuery(`UPDATE users SET githubId = ? WHERE email = ?`, [githubId, email]);
        existingEmailUser.githubId = githubId;
        return existingEmailUser;
    }
    
    const id = `user_${githubId}`;
    const now = Date.now();
    await runQuery(`INSERT INTO users (id, githubId, username, email, createdAt) VALUES (?, ?, ?, ?, ?)`, [id, githubId, username, email, now]);
    return { id, githubId, username, email, createdAt: now };
}

export async function getChats(userId) {
    const sql = `SELECT id, title, createdAt, updatedAt FROM chats WHERE userId = ? ORDER BY updatedAt DESC`;
    return getRows(sql, [userId]);
}

export async function getChat(userId, id) {
    const chat = await getRow(`SELECT id, title, createdAt, updatedAt, userId FROM chats WHERE id = ? AND userId = ?`, [id, userId]);
    if (!chat) return null;

    const messages = await getRows(`SELECT id, role, content, toolCalls, createdAt FROM messages WHERE chatId = ? ORDER BY createdAt ASC`, [id]);
    
    // Parse toolCalls for each message
    chat.messages = messages.map(m => ({
        ...m,
        toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : null
    }));
    return chat;
}

export async function createChat(userId, id, title) {
    const now = Date.now();
    const sql = `INSERT INTO chats (id, userId, title, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`;
    await runQuery(sql, [id, userId, title, now, now]);
    return { id, userId, title, createdAt: now, updatedAt: now, messages: [] };
}

export async function updateChatTitle(userId, id, title) {
    const sql = `UPDATE chats SET title = ?, updatedAt = ? WHERE id = ? AND userId = ?`;
    await runQuery(sql, [title, Date.now(), id, userId]);
}

export async function updateChatTimestamp(userId, id) {
    const sql = `UPDATE chats SET updatedAt = ? WHERE id = ? AND userId = ?`;
    await runQuery(sql, [Date.now(), id, userId]);
}

export async function deleteChat(userId, id) {
    await runQuery(`PRAGMA foreign_keys = ON`);
    const sql = `DELETE FROM chats WHERE id = ? AND userId = ?`;
    await runQuery(sql, [id, userId]);
}

export async function addMessage(id, chatId, role, content, toolCalls = null) {
    const now = Date.now();
    const toolCallsStr = toolCalls ? JSON.stringify(toolCalls) : null;
    const sql = `INSERT INTO messages (id, chatId, role, content, toolCalls, createdAt) VALUES (?, ?, ?, ?, ?, ?)`;
    await runQuery(sql, [id, chatId, role, content, toolCallsStr, now]);
    
    // Update parent chat timestamp
    await runQuery(`UPDATE chats SET updatedAt = ? WHERE id = ?`, [now, chatId]);
    return { id, chatId, role, content, toolCalls, createdAt: now };
}
