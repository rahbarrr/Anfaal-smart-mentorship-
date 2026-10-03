import process from 'node:process';

const baseUrl = (process.env.RELEASE_CHECK_BASE_URL || 'http://127.0.0.1:10000').replace(/\/+$/, '');

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
}

async function main(): Promise<void> {
  const health = await request('/health');
  if (!health.ok) throw new Error(`/health returned HTTP ${health.status}`);

  const readiness = await request('/health/ready');
  const readinessBody = await readiness.json().catch(() => ({})) as {
    status?: string;
    database?: string;
    queue?: string;
  };
  if (!readiness.ok || readinessBody.status !== 'ready') {
    throw new Error(`Readiness failed: HTTP ${readiness.status} ${JSON.stringify(readinessBody)}`);
  }

  const protectedRoute = await request('/api/calls/presign-upload', { method: 'POST' });
  if (protectedRoute.status !== 401) {
    throw new Error(`Protected route expected HTTP 401 without credentials, received ${protectedRoute.status}`);
  }

  console.log(JSON.stringify({
    baseUrl,
    health: 'ok',
    readiness: readinessBody,
    authenticationBoundary: 'ok',
  }));
}

main().catch((error) => {
  console.error(`[RELEASE_CHECK_FAILED] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
