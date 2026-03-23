function killTree(proc: { pid?: number; kill: (sig: string) => void }) {
  if (!proc.pid) return;
  try {
    // Kill the entire process group (shell + children)
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    // Fallback if process group kill fails
    proc.kill("SIGTERM");
  }
}

export default async function globalTeardown() {
  const e2e = (globalThis as any).__E2E__;
  if (!e2e) return;

  // Kill servers (process group to catch shell children)
  if (e2e.backend) killTree(e2e.backend);
  if (e2e.frontend) killTree(e2e.frontend);

  // Stop MongoDB
  if (e2e.mongoServer) {
    await e2e.mongoServer.stop();
  }
}
