import { NextResponse, type NextRequest } from 'next/server';

/**
 * Transport and content security headers for the internal surface.
 *
 * Same policy as the Concierge, and the reasoning matters more here: this workspace
 * renders the verbatim text a client typed, next to the verified facts an adviser is
 * about to act on. That text is untrusted content displayed to a privileged user,
 * which is the exact shape of a stored-XSS target. React escapes it and nothing here
 * uses `dangerouslySetInnerHTML`; the policy is what keeps that true after the next
 * change.
 *
 * Edge runtime — imports nothing from the workspace packages.
 */

export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const production = process.env.NODE_ENV === 'production';

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(production ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set('content-security-policy', csp);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('referrer-policy', 'no-referrer');
  response.headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  response.headers.set('cross-origin-resource-policy', 'same-origin');
  // The internal workspace is never indexed or cached by an intermediary.
  response.headers.set('x-robots-tag', 'noindex, nofollow');
  if (production) {
    response.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
