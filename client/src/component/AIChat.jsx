import React, { useState, useEffect, useRef } from 'react';
import './AIChat.css';

const AIChat = ({ selectedFile, selectedFileContent, editorContext, aiPrefill, setAiPrefill, hfTokenState, onOpenTokenModal, onApplyToEditor }) => {
    const [chats, setChats] = useState([]);
    const [activeChatId, setActiveChatId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [view, setView] = useState('list'); // 'list' or 'chat'
    const [hasPermissionError, setHasPermissionError] = useState(false);

    useEffect(() => {
        setHasPermissionError(false);
    }, [hfTokenState]);
    const messagesEndRef = useRef(null);

    const fetchChats = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:9000/ai/chats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
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
            const token = localStorage.getItem('token');
            const res = await fetch(`http://localhost:9000/ai/chats/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
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
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:9000/ai/chats', { 
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
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
            const token = localStorage.getItem('token');
            await fetch(`http://localhost:9000/ai/chats/${id}`, { 
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (activeChatId === id) {
                setActiveChatId(null);
                setView('list');
            }
            fetchChats();
        } catch (err) {
            console.error("Failed to delete chat", err);
        }
    };

    useEffect(() => {
        if (aiPrefill && activeChatId) {
            submitMessage(aiPrefill);
            setAiPrefill("");
        }
    }, [aiPrefill, activeChatId]);

    const submitMessage = async (msgText) => {
        if (!msgText.trim() || !activeChatId) return;

        const userMessage = msgText.trim();
        setInput("");
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`http://localhost:9000/ai/chats/${activeChatId}/message`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    prompt: userMessage,
                    context: {
                        selectedFile,
                        selectedFileContent,
                        editorContext
                    }
                })
            });

            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                const errMsg = errBody.error || "Failed to process chat message.";
                if (errBody.isTokenError) {
                    setHasPermissionError(true);
                }
                setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errMsg}` }]);
                setIsLoading(false);
                return;
            }

            if (!res.body) throw new Error("No body Stream");

            setMessages(prev => [...prev, { role: 'assistant', content: "" }]);
            setIsLoading(false);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = "";
            let streamBuffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    if (streamBuffer.trim()) {
                        try {
                            const parsed = JSON.parse(streamBuffer);
                            if (parsed.type === 'text') {
                                accumulatedText += parsed.delta;
                            }
                        } catch (e) {}
                    }
                    break;
                }
                
                streamBuffer += decoder.decode(value, { stream: true });
                const lines = streamBuffer.split('\n');
                streamBuffer = lines.pop(); // save the partial line
                
                let hasUpdates = false;
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.type === 'text') {
                            accumulatedText += parsed.delta;
                            hasUpdates = true;
                        } else if (parsed.type === 'error') {
                            accumulatedText += `\n[Error: ${parsed.message}]`;
                            if (parsed.isTokenError) {
                                setHasPermissionError(true);
                            }
                            hasUpdates = true;
                        }
                    } catch (err) {
                        console.warn("Failed to parse JSON stream line:", line, err);
                    }
                }

                if (hasUpdates) {
                    setMessages(prev => {
                        const next = [...prev];
                        next[next.length - 1].content = accumulatedText;
                        return next;
                    });
                }
            }
            fetchChats();
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
            submitMessage(input);
        }
    };

    const renderMessageContent = (text) => {
        const regex = /<replace_block\s+file="([^"]+)"\s+start_line="(\d+)"\s+end_line="(\d+)">([\s\S]*?)<\/replace_block>/g;
        const parts = [];
        let lastIndex = 0;
        
        text.replace(regex, (match, file, startLine, endLine, codeContent, offset) => {
            if (offset > lastIndex) {
                parts.push(<span key={lastIndex}>{text.substring(lastIndex, offset)}</span>);
            }
            parts.push(
                <div key={offset} className="replace-block-container" style={{background: '#1e1e1e', padding: '10px', marginTop: '10px', borderRadius: '4px', border: '1px solid #444'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '6px'}}>
                        <span style={{fontSize: '12px', color: '#9cdcfe', fontFamily: 'monospace'}}>{file} L{startLine}-{endLine}</span>
                        <button 
                            className="apply-btn"
                            style={{fontSize: '11px', background: '#0e639c', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', padding: '2px 8px'}}
                            onClick={() => onApplyToEditor(parseInt(startLine), parseInt(endLine), codeContent.replace(/^\n+/, ''))}>
                            Apply to Editor
                        </button>
                    </div>
                    <pre style={{margin: 0, overflowX: 'auto', fontSize: '13px', fontFamily: 'monospace'}}>{codeContent.replace(/^\n+/, '')}</pre>
                </div>
            );
            lastIndex = offset + match.length;
        });
        
        if (lastIndex < text.length) {
            parts.push(<span key={lastIndex}>{text.substring(lastIndex)}</span>);
        }

        return parts.length > 0 ? parts : text;
    };

    if (view === 'list') {
        return (
            <div className="ai-chat-wrapper list-view">
                <div className="ai-chat-header">
                    <h2>AI Chats</h2>
                    <button className="new-chat-btn" onClick={createNewChat}>+ New Chat</button>
                </div>
                {(!hfTokenState || !hfTokenState.hasToken) && (
                    <div className="token-warning-banner">
                        <span className="warning-icon">⚠️</span>
                        <div className="warning-content">
                            <strong>Token Required:</strong> AI Chat is disabled.
                        </div>
                        <button className="configure-token-btn" onClick={onOpenTokenModal}>Configure</button>
                    </div>
                )}
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
            {(!hfTokenState || !hfTokenState.hasToken) && (
                <div className="token-warning-banner">
                    <span className="warning-icon">⚠️</span>
                    <div className="warning-content">
                        <strong>Token Required:</strong> AI Chat is disabled.
                    </div>
                    <button className="configure-token-btn" onClick={onOpenTokenModal}>Configure</button>
                </div>
            )}
            {hfTokenState && hfTokenState.hasToken && hasPermissionError && (
                <div className="token-warning-banner error">
                    <span className="warning-icon">⚠️</span>
                    <div className="warning-content">
                        <strong>Inference Error:</strong> Token permission issue or model unsupported.
                    </div>
                    <button className="configure-token-btn" onClick={onOpenTokenModal}>Update</button>
                </div>
            )}
            
            <div className="messages-container">
                {messages.length === 0 ? (
                    <div className="welcome-message">
                        Hello! Ask me anything about your code.
                        {selectedFile && <div className="context-indicator">Currently observing: {selectedFile.split('/').pop()}</div>}
                    </div>
                ) : (
                    messages.map((msg, i) => (
                        <div key={i} className={`message ${msg.role}`}>
                            <div className="message-role">{msg.role === 'user' ? 'You' : 'AI Assistant'}</div>
                            <div className="message-content">{renderMessageContent(msg.content)}</div>
                        </div>
                    ))
                )}
                {isLoading && (
                    <div className="message assistant">
                        <div className="message-role">AI Assistant</div>
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
                    placeholder={(!hfTokenState || !hfTokenState.hasToken) ? "Configure token to start chatting..." : "Ask AI Assistant... (Shift+Enter for new line)"}
                    rows="3"
                    disabled={isLoading || (!hfTokenState || !hfTokenState.hasToken)}
                />
                <button disabled={isLoading || !input.trim() || (!hfTokenState || !hfTokenState.hasToken)} onClick={() => submitMessage(input)}>Send</button>
            </div>
        </div>
    );
};

export default AIChat;
