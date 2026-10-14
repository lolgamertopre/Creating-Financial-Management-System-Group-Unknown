import { handleApiRequest } from './router.js';

function isApiRoute(url) {
    if (!url) return false;
    // Strictly match /api or /api/... or /api?... but NEVER /apiService.js or frontend source files!
    return url === '/api' || url.startsWith('/api/') || url.startsWith('/api?');
}

/**
 * Vite plugin that serves our REST API during `npm run dev` and `npm run preview`.
 * Zero additional processes required!
 */
export function financialApiPlugin() {
    return {
        name: 'vite-plugin-financial-api',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (isApiRoute(req.url)) {
                    const handled = await handleApiRequest(req, res);
                    if (handled) return;
                }
                next();
            });
        },
        configurePreviewServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (isApiRoute(req.url)) {
                    const handled = await handleApiRequest(req, res);
                    if (handled) return;
                }
                next();
            });
        },
    };
}
