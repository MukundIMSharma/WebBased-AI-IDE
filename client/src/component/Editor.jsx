import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { createLanguageClient } from '../lsp-client';

const Editor = ({ selectedFile, content, onContentChange, onOpenAIChat }) => {
    const editorRef = useRef(null);
    const monacoInstance = useRef(null);
    const languageClientRef = useRef(null);
    const timeoutRef = useRef(null);
    const lastSavedContent = useRef(content);

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

        const handleSave = async (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                const currentContent = monacoInstance.current.getValue();
                try {
                    const response = await fetch('http://localhost:9000/files/content', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
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

            // Start LSP for Python if not already started
            if (language === 'python' && !languageClientRef.current) {
                createLanguageClient('python', 'ws://localhost:9000/lsp')
                    .then(client => {
                        languageClientRef.current = client;
                    });
            }
        }
    }, [selectedFile, content]);

    useEffect(() => {
        lastSavedContent.current = content;
    }, [selectedFile]);

    useEffect(() => {
        if (!selectedFile) return;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(async () => {
            if (content !== lastSavedContent.current && monacoInstance.current) {
                const currentContent = monacoInstance.current.getValue();
                try {
                    const response = await fetch('http://localhost:9000/files/content', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
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

    return (
        <div className="editor-panel">
            <div className="editor-tabs">
                <div className="tab active">
                    {selectedFile ? selectedFile.split('/').pop() : 'Welcome'}
                </div>
            </div>
            <div className="editor-content" style={{ height: 'calc(100% - 35px)' }}>
                <div ref={editorRef} style={{ height: '100%', width: '100%' }} />
            </div>
        </div>
    );
};

export default Editor;
