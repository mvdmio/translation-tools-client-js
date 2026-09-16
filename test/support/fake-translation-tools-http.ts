import http from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeTranslationToolsRequest = {
  method: string;
  path: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  bodyText: string;
};

export type FakeTranslationToolsResponse = {
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  body?: string | Buffer;
};

export type FakeTranslationToolsHandler = (
  request: FakeTranslationToolsRequest,
) => FakeTranslationToolsResponse | Promise<FakeTranslationToolsResponse>;

type RouteKey = `${string} ${string}`;

export type FakeTranslationToolsHttp = {
  readonly baseUrl: string;
  readonly requests: FakeTranslationToolsRequest[];
  respond(
    method: string,
    path: string,
    response: FakeTranslationToolsResponse | FakeTranslationToolsHandler,
  ): void;
  close(): Promise<void>;
};

function routeKey(method: string, path: string): RouteKey {
  return `${method.toUpperCase()} ${path}`;
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function startFakeTranslationToolsHttp(): Promise<FakeTranslationToolsHttp> {
  const requests: FakeTranslationToolsRequest[] = [];
  const routes = new Map<RouteKey, FakeTranslationToolsResponse | FakeTranslationToolsHandler>();

  const server = http.createServer(async (req, res) => {
    try {
      const method = (req.method ?? 'GET').toUpperCase();
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const body = await readBody(req);
      const recorded: FakeTranslationToolsRequest = {
        method,
        path: url.pathname,
        url: `${url.pathname}${url.search}`,
        headers: req.headers,
        body,
        bodyText: body.toString('utf8'),
      };
      requests.push(recorded);

      const handler = routes.get(routeKey(method, url.pathname));
      const response = handler === undefined
        ? { status: 404, json: { error: 'not found' } }
        : typeof handler === 'function'
          ? await handler(recorded)
          : handler;

      const status = response.status ?? 200;
      const headers = { ...response.headers };
      let payload: Buffer;
      if (response.json !== undefined) {
        payload = Buffer.from(JSON.stringify(response.json), 'utf8');
        headers['content-type'] ??= 'application/json; charset=utf-8';
      } else if (typeof response.body === 'string') {
        payload = Buffer.from(response.body, 'utf8');
      } else if (Buffer.isBuffer(response.body)) {
        payload = response.body;
      } else {
        payload = Buffer.alloc(0);
      }

      res.writeHead(status, headers);
      res.end(payload);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    requests,
    respond(method, path, response) {
      routes.set(routeKey(method, path), response);
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
