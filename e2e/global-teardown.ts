export default async function globalTeardown() {
  const e2e = (globalThis as any).__E2E__;
  if (!e2e) return;

  // Kill servers
  if (e2e.backend) {
    e2e.backend.kill("SIGTERM");
  }
  if (e2e.frontend) {
    e2e.frontend.kill("SIGTERM");
  }

  // Stop MongoDB
  if (e2e.mongoServer) {
    await e2e.mongoServer.stop();
  }
}
