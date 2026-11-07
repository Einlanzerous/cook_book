/** True for https URLs whose host is hellofresh.com or a subdomain of it. */
export function isHelloFreshUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    return host === 'hellofresh.com' || host.endsWith('.hellofresh.com');
  } catch {
    return false;
  }
}
