import http from 'http';
import { handleApiRequest } from './api/router.js';

const PORT = process.env.PORT || 3001;

const server = http.createServer(async (req, res) => {
    // Enable CORS for frontend running on Vite or any origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    const handled = await handleApiRequest(req, res);
    if (!handled) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Endpoint not found. Use /api/health to inspect API.' }));
    }
});

server.listen(PORT, () => {
    console.log(` Pocketwise REST & Financial Intelligence API server running at: http://localhost:${PORT}/api/health`);
});
