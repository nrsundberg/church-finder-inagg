import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from "react-router";
import styles from "./app.css?url";
import type { Route } from "./+types/root";
import { Footer } from "~/components/footer";

const SITE_URL = "https://basedchurchfinder.com";
const SITE_TITLE = "Church Finder — SBC · Founders · 9Marks";
const SITE_DESCRIPTION =
  "Find reformed, healthy Southern Baptist churches near you. Cross-references SBC, Founders Ministries, and 9Marks directories on one map.";

const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Church Finder",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
});

export async function loader({ context }: Route.LoaderArgs) {
  return { turnstileSiteKey: context.cloudflare.env.CF_TURNSTILE_SITE_KEY ?? "" };
}

export const meta: Route.MetaFunction = () => [
  { title: SITE_TITLE },
  { name: "description", content: SITE_DESCRIPTION },
  {
    name: "keywords",
    content:
      "reformed SBC churches, 9Marks church finder, Founders Ministries churches, healthy church search, southern baptist reformed, church directory",
  },
  // Open Graph
  { property: "og:type", content: "website" },
  { property: "og:url", content: SITE_URL },
  { property: "og:title", content: SITE_TITLE },
  { property: "og:description", content: SITE_DESCRIPTION },
  { property: "og:image", content: `${SITE_URL}/cross.svg` },
  // Twitter
  { name: "twitter:card", content: "summary" },
  { name: "twitter:title", content: SITE_TITLE },
  { name: "twitter:description", content: SITE_DESCRIPTION },
  // Theme / PWA
  { name: "theme-color", content: "#09090b" },
  { name: "msapplication-TileColor", content: "#09090b" },
  { name: "mobile-web-app-capable", content: "yes" },
  { name: "apple-mobile-web-app-capable", content: "yes" },
  { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
  { name: "apple-mobile-web-app-title", content: "Church Finder" },
];

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: styles },
  // Favicon cascade: SVG (modern), PNG fallbacks, ICO (legacy)
  { rel: "icon", href: "/cross.svg", type: "image/svg+xml" },
  { rel: "icon", href: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
  { rel: "icon", href: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
  { rel: "shortcut icon", href: "/favicon.ico" },
  // Apple Touch Icons — light and dark
  { rel: "apple-touch-icon", href: "/icons/apple-touch-icon-light.png", media: "(prefers-color-scheme: light)" },
  { rel: "apple-touch-icon", href: "/icons/apple-touch-icon-dark.png", media: "(prefers-color-scheme: dark)" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
  // PWA manifest
  { rel: "manifest", href: "/site.webmanifest" },
  { rel: "canonical", href: SITE_URL },
];

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Something went wrong";
  let message = "An unexpected error occurred. Please try again.";
  let statusCode: number | null = null;

  if (isRouteErrorResponse(error)) {
    statusCode = error.status;
    if (error.status === 404) {
      title = "Page Not Found";
      message = "The page you're looking for doesn't exist.";
    } else {
      message = error.statusText || message;
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Error — Church Finder</title>
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4">
        {statusCode && (
          <p className="text-6xl font-bold mb-2 text-red-500">{statusCode}</p>
        )}
        <h1 className="text-2xl font-semibold mb-3">{title}</h1>
        <p className="text-white/60 mb-6 text-center max-w-sm">{message}</p>
        <a
          href="/"
          className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go Home
        </a>
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      </head>
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <Outlet />
        <Footer siteKey={loaderData.turnstileSiteKey} />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
