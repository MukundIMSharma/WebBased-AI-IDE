import React from 'react';

const ActivityBar = ({ activeSidebar, setActiveSidebar }) => {
    return (
        <div className="activity-bar">
            {/* Simple SVG icon for Explorer */}
            <div 
                className={`activity-icon ${activeSidebar === 'explorer' ? 'active' : ''}`}
                onClick={() => setActiveSidebar('explorer')}
                title="Explorer"
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
            </div>
            {/* AI Assistant Icon */}
            <div 
                className={`activity-icon ${activeSidebar === 'ai-chat' ? 'active' : ''}`}
                onClick={() => setActiveSidebar('ai-chat')}
                title="AI Chat"
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
            </div>
            {/* Search / Other icons... */}
            <div className="activity-icon" style={{ marginTop: 'auto' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
            </div>
        </div>
    );
};

export default ActivityBar;

