import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'webcloud_ide_fallback_secret_key_12345';

// Sign a JWT token for a user session
export function generateToken(user) {
    return jwt.sign(
        { 
            id: user.id, 
            username: user.username, 
            email: user.email 
        }, 
        JWT_SECRET, 
        { expiresIn: '7d' }
    );
}

// Express route middleware to authenticate API requests
export function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error("JWT verification failed:", err.message);
            return res.status(403).json({ error: 'Invalid or expired access token' });
        }
        req.user = decoded;
        next();
    });
}

// Socket.IO middleware to authenticate WebSocket connection requests
export function authenticateSocketToken(socket, next) {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
        return next(new Error('Authentication token required'));
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error("Socket.IO JWT verification failed:", err.message);
            return next(new Error('Invalid or expired authentication token'));
        }
        socket.user = decoded;
        next();
    });
}
