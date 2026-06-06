// /mnt/agents/output/proxy-server.js
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Serve the browser HTML
    if (pathname === '/' || pathname === '/browser') {
        fs.readFile(path.join(__dirname, 'browser.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading browser');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // Proxy endpoint: /proxy?url=https://example.com
    if (pathname === '/proxy') {
        const targetUrl = parsedUrl.query.url;
        
        if (!targetUrl) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Missing url parameter' }));
            return;
        }

        try {
            const targetParsed = new URL(targetUrl);
            const protocol = targetParsed.protocol === 'https:' ? https : http;
            
            const options = {
                hostname: targetParsed.hostname,
                port: targetParsed.port || (targetParsed.protocol === 'https:' ? 443 : 80),
                path: targetParsed.pathname + targetParsed.search,
                method: req.method,
                headers: {
                    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
                    'Accept': req.headers['accept'] || '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'identity',
                    'Connection': 'keep-alive'
                }
            };

            // Forward request body for POST/PUT
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const proxyReq = protocol.request(options, (proxyRes) => {
                    // Forward relevant headers
                    const headers = {};
                    const forwardHeaders = ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified'];
                    forwardHeaders.forEach(h => {
                        if (proxyRes.headers[h]) headers[h] = proxyRes.headers[h];
                    });

                    res.writeHead(proxyRes.statusCode, headers);
                    proxyRes.pipe(res);
                });

                proxyReq.on('error', (err) => {
                    console.error('Proxy error:', err.message);
                    res.writeHead(502);
                    res.end(JSON.stringify({ error: 'Failed to fetch target', details: err.message }));
                });

                if (body) proxyReq.write(body);
                proxyReq.end();
            });

        } catch (err) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid URL', details: err.message }));
        }
        return;
    }

    // API info endpoint
    if (pathname === '/api/info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            name: 'Prøxy Server',
            version: '1.0.0',
            endpoints: {
                browser: '/',
                proxy: '/proxy?url=<target_url>',
                info: '/api/info'
            }
        }));
        return;
    }

    // 404 for everything else
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════╗
    ║         Prøxy Server v1.0           ║
    ╠══════════════════════════════════════╣
    ║  Server running on port ${PORT}        ║
    ║                                      ║
    ║  Endpoints:                          ║
    ║  • Browser:  http://localhost:${PORT}/   ║
    ║  • Proxy:    /proxy?url=<url>       ║
    ║  • API Info: /api/info               ║
    ╚══════════════════════════════════════╝
    `);
});
