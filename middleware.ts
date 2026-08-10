import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * MURNI MEM-BYPASS /auth/callback DAN /login AGAR VERCEL TIDAK MENCEGATNYA
     */
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|login|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
