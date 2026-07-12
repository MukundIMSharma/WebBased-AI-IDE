const isProd = import.meta.env.PROD;

// In production, default to the current domain (relative path routing).
// In development, default to local port 9000.
export const API_BASE_URL = import.meta.env.VITE_API_URL || (isProd ? window.location.origin : 'http://localhost:9000');

// WebSocket base URL routes to wss:// or ws:// depending on the current protocol.
export const WS_BASE_URL = import.meta.env.VITE_WS_URL || (isProd 
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}` 
    : 'ws://localhost:9000');
