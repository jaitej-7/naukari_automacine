import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Bypass authentication in development mode
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }
  const password = process.env.DASHBOARD_PASSWORD;
  // If no password is configured, bypass authentication
  if (!password) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const authCookie = request.cookies.get('sb-dashboard-auth')?.value;

  const isLoginPage = pathname === '/login';
  const isAuthApi = pathname === '/api/auth/login';
  const isStaticAsset = pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico') || pathname.startsWith('/public');

  if (!authCookie && !isLoginPage && !isAuthApi && !isStaticAsset) {
    // If it is an API request, return 401
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Redirect web requests to login page
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (authCookie && isLoginPage) {
    const dashboardUrl = new URL('/', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
