import React, { useState, useEffect, useRef } from 'react';
import './AIChat.css';

const AIChat = ({ selectedFile, selectedFileContent }) => {
    const [chats, setChats] = useState([]);
    const [activeChatId, setActiveChatId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [view, setView] = useState('list'); // 'list' or 'chat'
    const messagesEndRef = useRef(null);

    const fetchChats = async () => {
        try {
            const res = await fetch('http://localhost:9000/ai/chats');
            const data = await res.json();
            setChats(data);
        } catch (err) {
            console.error("Failed to load chats", err);
        }
    };

    useEffect(() => {
        fetchChats();
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (view === 'chat') {
            scrollToBottom();
        }
    }, [messages, view]);

    const loadChat = async (id) => {
        try {
            const res = await fetch(`http://localhost:9000/ai/chats/${id}`);
            const data = await res.json();
            setActiveChatId(data.id);
            setMessages(data.messages || []);
            setView('chat');
        } catch (err) {
            console.error("Failed to load chat messages", err);
        }
    };

    const createNewChat = async () => {
        try {
            const res = await fetch('http://localhost:9000/ai/chats', { method: 'POST' });
            const data = await res.json();
            setActiveChatId(data.id);
            setMessages([]);
            setView('chat');
            fetchChats(); // Refresh list to show new chat
        } catch (err) {
            console.error("Failed to create new chat", err);
        }
    };

    const deleteChat = async (e, id) => {
        e.stopPropagation();
        try {
            await fetch(`http://localhost:9000/ai/chats/${id}`, { method: 'DELETE' });
            if (activeChatId === id) {
                setActiveChatId(null);
                setView('list');
            }
            fetchChats();
        } catch (err) {
            console.error("Failed to delete chat", err);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || !activeChatId) return;

        const userMessage = input.trim();
        setInput("");
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);

        try {
            const res = await fetch(`http://localhost:9000/ai/chats/${activeChatId}/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: userMessage,
                    context: {
                        selectedFile,
                        selectedFileContent
                    }
                })
            });
            const data = await res.json();
            
            // Assume the response returns the updated chat object
            if (data && data.messages) {
                setMessages(data.messages);
            }
            fetchChats(); // Refresh list to update title
        } catch (err) {
            console.error("Failed to send message", err);
            setMessages(prev => [...prev, { role: 'assistant', content: "Error: Failed to fetch response." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    if (view === 'list') {
        return (
            <div className="ai-chat-wrapper list-view">
                <div className="ai-chat-header">
                    <h2>AI Chats</h2>
                    <button className="new-chat-btn" onClick={createNewChat}>+ New Chat</button>
                </div>
                <div className="chat-list">
                    {chats.map(chat => (
                        <div key={chat.id} className="chat-list-item" onClick={() => loadChat(chat.id)}>
                            <div className="chat-item-title">{chat.title}</div>
                            <button className="delete-chat-btn" onClick={(e) => deleteChat(e, chat.id)}>×</button>
                        </div>
                    ))}
                    {chats.length === 0 && <div className="no-chats">No previous chats. Start a new one!</div>}
                </div>
            </div>
        );
    }

    return (
        <div className="ai-chat-wrapper chat-view">
            <div className="ai-chat-header">
                <button className="back-btn" onClick={() => setView('list')}>← Back</button>
                <h2>Current Chat</h2>
            </div>
            
            <div className="messages-container">
                {messages.length === 0 ? (
                    <div className="welcome-message">
                        Hello! Ask me anything about your code.
                        {selectedFile && <div className="context-indicator">Currently observing: {selectedFile.split('/').pop()}</div>}
                    </div>
                ) : (
                    messages.map((msg, i) => (
                        <div key={i} className={`message ${msg.role}`}>
                            <div className="message-role">{msg.role === 'user' ? 'You' : 'Claude'}</div>
                            <div className="message-content">{msg.content}</div>
                        </div>
                    ))
                )}
                {isLoading && (
                    <div className="message assistant">
                        <div className="message-role">Claude</div>
                        <div className="message-content loading">Generating...</div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="input-container">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Claude... (Shift+Enter for new line)"
                    rows="3"
                />
                <button disabled={isLoading || !input.trim()} onClick={sendMessage}>Send</button>
            </div>
        </div>
    );
};

export default AIChat;
