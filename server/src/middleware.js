import { NextResponse } from 'next/server';

export function middleware() {
  return NextResponse.json(
    { error: 'This Chronexa admin surface has been retired. Use Brand Macros OS.' },
    { status: 410 },
  );
}

export const config = {
  matcher: [
    '/api/agent/admin/employees/:path*',
    '/api/agent/admin/overview/:path*',
    '/api/agent/admin/recordings/:path*',
    '/api/agent/admin/screenshots/:path*',
    '/api/agent/admin/tasks/:path*',
  ],
};
