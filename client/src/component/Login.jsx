import React from 'react';
import './Login.css';
import { API_BASE_URL } from '../config';

const Login = () => {
    const handleGitHubLogin = () => {
        // Redirect browser to the backend OAuth initialization route
        window.location.href = `${API_BASE_URL}/api/auth/github`;
    };

    return (
        <div className="login-container">
            <div className="radial-glow-1"></div>
            <div className="radial-glow-2"></div>
            
            <div className="login-card">
                <div className="logo-section">
                    <div className="logo-icon">🐬</div>
                    <h1>WebCloud IDE</h1>
                    <p className="subtitle">Secure Multi-User Cloud Workspace</p>
                </div>
                
                <div className="info-box">
                    <p>Welcome to your container-isolated developer environment. Sign in to access your projects, interactive shells, and personalized AI programming companion.</p>
                </div>
                
                <button className="github-login-btn" onClick={handleGitHubLogin}>
                    <svg className="github-icon" viewBox="0 0 24 24" width="20" height="20">
                        <path fill="currentColor" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    <span>Continue with GitHub</span>
                </button>
                
                <div className="login-footer">
                    <p>Secured via JWT & Docker isolation boundaries</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
