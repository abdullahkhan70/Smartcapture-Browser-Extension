const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

export function verifyAdmin(request: Request): boolean {
  const authHeader = request.headers.get('x-admin-password');
  if (authHeader === ADMIN_PASSWORD) return true;

  // Also support query param for easier testing
  const url = new URL(request.url);
  const queryPassword = url.searchParams.get('password');
  if (queryPassword === ADMIN_PASSWORD) return true;

  return false;
}
