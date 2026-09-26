import { NextResponse, type NextRequest } from "next/server";

/**
 * Garde légère côté edge : redirige vers /login si aucun cookie de session n'est présent.
 * La vérification réelle (validité, rôle, boutique) est faite côté serveur dans chaque page et action.
 */
const PUBLIC_PREFIXES = ["/login", "/t/", "/api/public", "/api/jobs", "/api/webhooks", "/manifest.webmanifest", "/sw.js", "/icon", "/apple-icon", "/offline", "/_next", "/favicon", "/robots.txt"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("rf_session")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|svg|ico|webp|woff2)$).*)"] };
