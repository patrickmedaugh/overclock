/**
 * Origin allowlist (pure). `allowed` is a comma-separated list of origins; `*` stands
 * for one run of letters, digits and dashes (a port, or a host label prefix), e.g.
 * `http://localhost:*` or `https://*--overcloc.netlify.app`.
 */
export function originAllowed(origin: string | null, allowed: string): boolean {
  if (!origin) return false;
  return allowed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .some((pattern) => toRegExp(pattern).test(origin));
}

function toRegExp(pattern: string): RegExp {
  const body = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
    .join('[A-Za-z0-9-]+');
  return new RegExp(`^${body}$`);
}
