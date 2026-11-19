/**
 * Connect screen status (COOK-15): is the MCP listener running, and how many
 * tools does the read bundle expose. Probed server side, because the browser
 * cannot reach the internal listener. It proves the Commonplace MCP server is
 * up; it says nothing about heitan or Cloudflare Access.
 */
import { TOOL_DEFS } from './server.js';

const PROBE_TIMEOUT_MS = 1500;

/** Tools in the commonplace.read bundle: the registered read-only ones. */
export const readToolCount = () =>
  Object.values(TOOL_DEFS).filter((d) => d.annotations?.readOnlyHint === true).length;

/**
 * @param {{ getListener: () => ({ port: number } | null | undefined), timeoutMs?: number, fetchImpl?: typeof fetch }} deps
 * @returns {() => Promise<{ enabled: boolean, tools?: number }>} never throws
 */
export function createMcpStatus({ getListener, timeoutMs = PROBE_TIMEOUT_MS, fetchImpl = fetch }) {
  return async () => {
    const listener = getListener();
    if (!listener) return { enabled: false };
    try {
      const res = await fetchImpl(`http://127.0.0.1:${listener.port}/healthz`, {
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) return { enabled: false };
      return { enabled: true, tools: readToolCount() };
    } catch {
      return { enabled: false };
    }
  };
}
