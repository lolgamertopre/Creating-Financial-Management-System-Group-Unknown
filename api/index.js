import { handleApiRequest } from './router.js';

/**
 * Vercel Serverless Function entry point for all /api routes
 */
export default async function handler(req, res) {
    try {
        const handled = await handleApiRequest(req, res);
        if (!handled && !res.writableEnded && !res.headersSent) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Endpoint not found. Use /api/health to inspect API.' }));
        }
    } catch (err) {
        console.error('API Serverless Error:', err);
        if (!res.writableEnded && !res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
        }
    }
}
