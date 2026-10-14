import process from 'node:process';

// The API and BullMQ worker expose different health surfaces. The API is the
// primary release gate; the worker can be checked separately when its health
// URL is supplied by the deployment environment.
const baseUrl = (process.env.RELEASE_CHECK_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5000}`).replace(/\/+$/, '');
const workerBaseUrl = process.env.RELEASE_CHECK_WORKER_BASE_URL?.replace(/\/+$/, '');

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

  let workerHealth: 'skipped' | 'ok' = 'skipped';
  if (workerBaseUrl) {
    const worker = await fetch(`${workerBaseUrl}/health`, { signal: AbortSignal.timeout(10_000) });
    if (!worker.ok) throw new Error(`Worker /health returned HTTP ${worker.status}`);
    workerHealth = 'ok';
  }

  console.log(JSON.stringify({
    baseUrl,
    health: 'ok',
    readiness: readinessBody,
    authenticationBoundary: 'ok',
    workerHealth,
  }));
}

main().catch((error) => {
  console.error(`[RELEASE_CHECK_FAILED] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
