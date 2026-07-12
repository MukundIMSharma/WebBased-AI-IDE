import React, { useState, useEffect } from 'react';
import './TokenVerificationPanel.css';
import { API_BASE_URL } from '../config';

const TokenVerificationPanel = ({ hfTokenState, onSaveSuccess }) => {
    const [tokenInput, setTokenInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [showToken, setShowToken] = useState(false);

    // Initialize input with current token if exists
    useEffect(() => {
        if (hfTokenState && hfTokenState.token) {
            setTokenInput(hfTokenState.token);
        }
    }, [hfTokenState]);

    const handleSave = async (e) => {
        e.preventDefault();
        const trimmedToken = tokenInput.trim();
        if (!trimmedToken) {
            setErrorMessage('Token cannot be empty.');
            return;
        }

        setIsLoading(true);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const authToken = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/api/user/hf-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ hfToken: trimmedToken })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to validate token.');
            }

            onSaveSuccess(trimmedToken);
            setSuccessMessage('Hugging Face token verified & saved successfully! AI Chat is now fully operational.');
        } catch (err) {
            setErrorMessage(err.message || 'An error occurred while validating the token.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClear = async () => {
        if (!window.confirm('Are you sure you want to remove your Hugging Face API token? This will disable AI chat capabilities.')) {
            return;
        }
        
        setIsLoading(true);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const authToken = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/api/user/hf-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ hfToken: "" }) // Clear token on backend
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Failed to clear token.');
            }

            setTokenInput('');
            onSaveSuccess('');
            setSuccessMessage('Hugging Face token removed successfully.');
        } catch (err) {
            setErrorMessage(err.message || 'An error occurred while clearing the token.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="token-panel-container">
            <div className="token-panel-glow"></div>
            
            <div className="token-panel-header">
                <h2>Hugging Face API Configuration</h2>
                <p className="subtitle">Configure and verify your API keys for the embedded AI programming companion.</p>
            </div>

            <div className="token-panel-grid">
                <div className="token-panel-settings">
                    <form onSubmit={handleSave} className="token-panel-form">
                        <div className="form-group">
                            <label htmlFor="hf-token-input-field">API Access Token</label>
                            <p className="field-desc">Your Fine-grained HuggingFace token is stored locally in the isolated user database.</p>
                            
                            <div className="input-row-group">
                                <input
                                    id="hf-token-input-field"
                                    type={showToken ? "text" : "password"}
                                    value={tokenInput}
                                    onChange={(e) => setTokenInput(e.target.value)}
                                    placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                    disabled={isLoading}
                                    autoComplete="off"
                                />
                                <button 
                                    type="button" 
                                    className="visibility-toggle-btn"
                                    onClick={() => setShowToken(!showToken)}
                                    disabled={isLoading}
                                >
                                    {showToken ? "Hide" : "Show"}
                                </button>
                            </div>
                        </div>

                        {errorMessage && (
                            <div className="feedback-message error-banner">
                                <span className="icon">⚠️</span>
                                <span className="message-text">{errorMessage}</span>
                            </div>
                        )}

                        {successMessage && (
                            <div className="feedback-message success-banner">
                                <span className="icon">✓</span>
                                <span className="message-text">{successMessage}</span>
                            </div>
                        )}

                        <div className="form-actions-row">
                            {hfTokenState && hfTokenState.token && (
                                <button 
                                    type="button" 
                                    className="panel-action-btn delete-btn"
                                    onClick={handleClear}
                                    disabled={isLoading}
                                >
                                    Remove Token
                                </button>
                            )}
                            <button 
                                type="submit" 
                                className="panel-action-btn save-btn"
                                disabled={isLoading || !tokenInput.trim() || tokenInput.trim() === hfTokenState.token}
                            >
                                {isLoading ? "Verifying Token..." : "Verify & Save"}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="token-panel-docs">
                    <h3>Getting Started Guide</h3>
                    <p>To enable code generation and query assistance from the AI assistant inside the IDE, follow these steps to generate a free serverless Hugging Face token:</p>
                    
                    <ol className="setup-steps-list">
                        <li>
                            <strong>Open Token Settings:</strong>
                            <br />
                            Navigate to <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer">huggingface.co/settings/tokens</a>.
                        </li>
                        <li>
                            <strong>Create Fine-Grained Token:</strong>
                            <br />
                            Click <em>"Create new token"</em> and choose the <strong>Fine-grained</strong> option.
                        </li>
                        <li>
                            <strong>Enable Inference Permissions:</strong>
                            <br />
                            Under the <em>Inference</em> permissions scope on the right, enable:
                            <span className="code-badge">Make calls to Inference Providers</span>.
                        </li>
                        <li>
                            <strong>Save and Paste:</strong>
                            <br />
                            Generate the token, copy the key (starting with `hf_`), paste it in the input panel, and click <em>Verify & Save</em>.
                        </li>
                    </ol>

                    <div className="model-info-block">
                        <h4>Active AI Model:</h4>
                        <div className="model-pill">Qwen 2.5 Coder 32B Instruct</div>
                        <p>A state-of-the-art open-source code generation model specifically optimized for engineering workflows.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TokenVerificationPanel;
