import { NextResponse, type NextRequest } from 'next/server';

/**
 * Transport and content security headers (blueprint §15.3).
 *
 * The Concierge renders a client's own policy data and quotes text the client typed.
 * Everything is escaped by React and there is no `dangerouslySetInnerHTML` anywhere,
 * but "we escape everything" is a claim about today's code, and a content security
 * policy is a control that survives tomorrow's.
 *
 * The policy is nonce-based: a fresh nonce per request, which Next.js applies to its
 * own scripts when it finds one in the CSP header. Combined with `strict-dynamic`
 * that leaves no room for an injected `<script>` — it would carry no nonce, and a
 * host allow-list is not what is granting trust.
 *
 * This runs in the Edge runtime, so it imports nothing from the workspace packages:
 * they use `node:crypto` and would not load here.
 */

export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const production = process.env.NODE_ENV === 'production';

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Next.js inlines critical CSS without a nonce. Style injection cannot execute,
    // so this is the one relaxation worth taking rather than dropping CSP entirely.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    // No third-party endpoint is ever contacted from the browser. Provider calls
    // happen server-side, which is what keeps keys out of the bundle.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(production ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  // The nonce travels on the request so Next.js can stamp it onto its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set('content-security-policy', csp);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  // A client's policy data must not leak into a referrer, not even the path.
  response.headers.set('referrer-policy', 'no-referrer');
  response.headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  response.headers.set('cross-origin-resource-policy', 'same-origin');
  if (production) {
    response.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
}

export const config = {
  // Everything except Next's own static output, which is immutable and needs no
  // per-request policy.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
