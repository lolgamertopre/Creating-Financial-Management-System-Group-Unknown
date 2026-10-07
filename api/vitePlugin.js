import { handleApiRequest } from './router.js';

/**
 * Vite plugin that serves our REST API during `npm run dev` and `npm run preview`.
 * Zero additional processes required!
 */
export function financialApiPlugin() {
    return {
        name: 'vite-plugin-financial-api',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (req.url && req.url.startsWith('/api')) {
                    const handled = await handleApiRequest(req, res);
                    if (handled) return;
                }
                next();
            });
        },
        configurePreviewServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (req.url && req.url.startsWith('/api')) {
                    const handled = await handleApiRequest(req, res);
                    if (handled) return;
                }
                next();
            });
        },
    };
}
