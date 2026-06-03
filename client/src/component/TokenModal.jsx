import React, { useState } from 'react';
import './TokenModal.css';

const TokenModal = ({ isOpen, onClose, onSaveSuccess }) => {
    const [tokenInput, setTokenInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [showToken, setShowToken] = useState(false);

    if (!isOpen) return null;

    const handleSave = async (e) => {
        e.preventDefault();
        const trimmedToken = tokenInput.trim();
        if (!trimmedToken) {
            setErrorMessage('Token cannot be empty.');
            return;
        }

        setIsLoading(true);
        setErrorMessage('');

        try {
            const authToken = localStorage.getItem('token');
            const response = await fetch('http://localhost:9000/api/user/hf-token', {
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
            onClose();
        } catch (err) {
            setErrorMessage(err.message || 'An error occurred while validating the token.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="token-modal-overlay">
            <div className="token-modal-card">
                <div className="token-modal-glow"></div>
                <div className="token-modal-header">
                    <div className="token-modal-icon">🤖</div>
                    <h2>Configure Hugging Face Token</h2>
                    <p className="token-modal-subtitle">Power your integrated AI Programming Companion</p>
                </div>
                
                <div className="token-modal-body">
                    <p className="token-modal-instruction">
                        To enable AI chat code assistance (powered by <strong>Qwen 2.5 Coder 32B</strong>), please provide a Hugging Face API Token.
                    </p>

                    <div className="token-modal-steps">
                        <h4>To get a token:</h4>
                        <ol>
                            <li>Go to <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer">huggingface.co/settings/tokens</a>.</li>
                            <li>Create a <strong>Fine-grained</strong> token (or edit an existing one).</li>
                            <li>Enable the permission: <span className="highlight">Make calls to Inference Providers</span> (under the <em>Inference</em> section).</li>
                            <li>Copy and paste your token below.</li>
                        </ol>
                    </div>

                    <form onSubmit={handleSave} className="token-modal-form">
                        <label htmlFor="hf-token-input">Hugging Face API Token</label>
                        <div className="input-container-row">
                            <input
                                id="hf-token-input"
                                type={showToken ? "text" : "password"}
                                value={tokenInput}
                                onChange={(e) => setTokenInput(e.target.value)}
                                placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                disabled={isLoading}
                                autoComplete="off"
                            />
                            <button 
                                type="button" 
                                className="toggle-visibility-btn"
                                onClick={() => setShowToken(!showToken)}
                                disabled={isLoading}
                            >
                                {showToken ? "Hide" : "Show"}
                            </button>
                        </div>

                        {errorMessage && (
                            <div className="token-modal-error">
                                <span className="error-icon">⚠️</span>
                                <span className="error-text">{errorMessage}</span>
                            </div>
                        )}

                        <div className="token-modal-actions">
                            <button 
                                type="button" 
                                className="token-modal-btn cancel-btn"
                                onClick={onClose}
                                disabled={isLoading}
                            >
                                Skip for now
                            </button>
                            <button 
                                type="submit" 
                                className="token-modal-btn save-btn"
                                disabled={isLoading || !tokenInput.trim()}
                            >
                                {isLoading ? "Verifying..." : "Save & Verify"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default TokenModal;
