import { createServer, Server } from 'node:http';

export function createWorkerHealthServer(): Server {
  return createServer((request, response) => {
    if (request.method === 'GET' && request.url?.split('?')[0] === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
  });
}