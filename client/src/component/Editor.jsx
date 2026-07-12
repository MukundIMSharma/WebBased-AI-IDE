import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as monaco from 'monaco-editor';
import { createLanguageClient } from '../lsp-client';
import TokenVerificationPanel from './TokenVerificationPanel';
import { API_BASE_URL, WS_BASE_URL } from '../config';

const Editor = forwardRef(({ selectedFile, content, onContentChange, onOpenAIChat, onContextChange, hfTokenState, onSaveSuccess, onCloseSettings }, ref) => {
    const editorRef = useRef(null);
    const monacoInstance = useRef(null);
    const languageClientRef = useRef(null);
    const timeoutRef = useRef(null);
    const lastSavedContent = useRef(content);

    useImperativeHandle(ref, () => ({
        applyReplaceBlock: (startLine, endLine, newContent) => {
            if (monacoInstance.current) {
                const model = monacoInstance.current.getModel();
                if (model) {
                    const range = new monaco.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine));
                    monacoInstance.current.executeEdits("ai-replace", [{
                        range: range,
                        text: newContent,
                        forceMoveMarkers: true
                    }]);
                }
            }
        }
    }));

    const getLanguage = (filename) => {
        if (!filename) return 'python';
        const ext = filename.split('.').pop().toLowerCase();
        const map = {
            'js': 'javascript',
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'py': 'python',
            'cpp': 'cpp',
            'h': 'cpp',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'md': 'markdown'
        };
        return map[ext] || 'python';
    };

    useEffect(() => {
        if (!editorRef.current) return;

        monacoInstance.current = monaco.editor.create(editorRef.current, {
            value: content || "",
            language: getLanguage(selectedFile),
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 14,
            minimap: { enabled: false },
        });

        monacoInstance.current.onDidChangeModelContent(() => {
            const value = monacoInstance.current.getValue();
            onContentChange(value);
        });

        monacoInstance.current.addAction({
            id: 'claude-explain',
            label: 'Explain with Claude',
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 1.5,
            run: (ed) => {
                const selection = ed.getModel().getValueInRange(ed.getSelection());
                if(onOpenAIChat) onOpenAIChat("Explain this:\n" + selection);
            }
        });

        monacoInstance.current.addAction({
            id: 'claude-fix',
            label: 'Fix with Claude',
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 1.6,
            run: (ed) => {
                const selection = ed.getModel().getValueInRange(ed.getSelection());
                if(onOpenAIChat) onOpenAIChat("Fix this:\n" + selection);
            }
        });

        monacoInstance.current.addAction({
            id: 'claude-refactor',
            label: 'Refactor with Claude',
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 1.7,
            run: (ed) => {
                const selection = ed.getModel().getValueInRange(ed.getSelection());
                if(onOpenAIChat) onOpenAIChat("Refactor this:\n" + selection);
            }
        });

        monacoInstance.current.onDidChangeCursorPosition((e) => {
            if (onContextChange) {
                onContextChange(prev => ({ ...prev, cursorLine: e.position.lineNumber }));
            }
        });

        monacoInstance.current.onDidChangeCursorSelection((e) => {
            if (onContextChange && monacoInstance.current) {
                const selection = monacoInstance.current.getModel().getValueInRange(e.selection);
                onContextChange(prev => ({ ...prev, selectedText: selection || "" }));
            }
        });

        const handleSave = async (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                const currentContent = monacoInstance.current.getValue();
                try {
                    const token = localStorage.getItem('token');
                    const response = await fetch(`${API_BASE_URL}/files/content`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ path: selectedFile, content: currentContent })
                    });
                    const result = await response.json();
                    if (response.ok) {
                        console.log("File saved!");
                    } else {
                        console.error("Save failed:", result.error);
                    }
                } catch (err) {
                    console.error("Save error:", err);
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                if (onOpenAIChat) onOpenAIChat();
            }
        };

        window.addEventListener('keydown', handleSave);

        return () => {
            if (monacoInstance.current) monacoInstance.current.dispose();
            if (languageClientRef.current) languageClientRef.current.stop();
            window.removeEventListener('keydown', handleSave);
        };
    }, []);

    useEffect(() => {
        if (monacoInstance.current && selectedFile) {
            if (selectedFile === 'settings') return;
            const language = getLanguage(selectedFile);
            const uri = monaco.Uri.file(selectedFile);

            let model = monaco.editor.getModel(uri);
            if (!model) {
                model = monaco.editor.createModel(content || "", language, uri);
            } else {
                if (model.getValue() !== content) {
                    model.setValue(content || "");
                }
                monaco.editor.setModelLanguage(model, language);
            }

            monacoInstance.current.setModel(model);

            // Handle dynamic LSP language switching
            const supportedLSP = ['python', 'javascript', 'typescript'];
            if (supportedLSP.includes(language)) {
                if (languageClientRef.current && languageClientRef.current.language !== language) {
                    languageClientRef.current.stop();
                    languageClientRef.current = null;
                }
                
                if (!languageClientRef.current) {
                    createLanguageClient(language, `${WS_BASE_URL}/lsp`)
                        .then(client => {
                            client.language = language;
                            languageClientRef.current = client;
                        }).catch(console.error);
                }
            } else if (languageClientRef.current) {
                // Stop LSP if opening an unsupported file
                languageClientRef.current.stop();
                languageClientRef.current = null;
            }
        }
    }, [selectedFile, content]);

    useEffect(() => {
        lastSavedContent.current = content;
    }, [selectedFile]);

    useEffect(() => {
        if (!selectedFile || selectedFile === 'settings') return;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(async () => {
            if (content !== lastSavedContent.current && monacoInstance.current) {
                const currentContent = monacoInstance.current.getValue();
                try {
                    const token = localStorage.getItem('token');
                    const response = await fetch(`${API_BASE_URL}/files/content`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ path: selectedFile, content: currentContent })
                    });
                    if (response.ok) {
                        console.log("File auto-saved!");
                        lastSavedContent.current = currentContent;
                    } else {
                        const result = await response.json();
                        console.error("Auto-save failed:", result.error);
                    }
                } catch (err) {
                    console.error("Auto-save error:", err);
                }
            }
        }, 3000);

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [content, selectedFile]);

    // Re-layout Monaco when switching tabs back from settings
    useEffect(() => {
        if (monacoInstance.current && selectedFile !== 'settings') {
            setTimeout(() => {
                monacoInstance.current.layout();
            }, 0);
        }
    }, [selectedFile]);

    return (
        <div className="editor-panel">
            <div className="editor-tabs">
                <div className="tab active" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {selectedFile === 'settings' ? (
                        <>
                            <span>Settings</span>
                            <span 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onCloseSettings) onCloseSettings();
                                }}
                                style={{ 
                                    cursor: 'pointer', 
                                    opacity: 0.6, 
                                    fontSize: '11px',
                                    padding: '2px 4px',
                                    borderRadius: '3px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                className="tab-close-icon"
                                title="Close tab"
                            >
                                ✕
                            </span>
                        </>
                    ) : (
                        <span>{selectedFile ? selectedFile.split('/').pop() : 'Welcome'}</span>
                    )}
                </div>
            </div>
            <div className="editor-content" style={{ height: 'calc(100% - 35px)', position: 'relative' }}>
                {selectedFile === 'settings' ? (
                    <TokenVerificationPanel 
                        hfTokenState={hfTokenState} 
                        onSaveSuccess={onSaveSuccess} 
                    />
                ) : null}
                <div 
                    ref={editorRef} 
                    style={{ 
                        height: '100%', 
                        width: '100%', 
                        display: selectedFile === 'settings' ? 'none' : 'block' 
                    }} 
                />
            </div>
        </div>
    );
});

export default Editor;
