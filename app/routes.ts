import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin", "routes/admin.tsx"),
  route("about", "routes/about.tsx"),
  route("sitemap.xml", "routes/sitemap[.]xml.ts"),
  route("api/scrape", "routes/api/scrape.ts"),
  route("api/geocode-suggest", "routes/api/geocode-suggest.ts"),
  route("api/live-search", "routes/api/live-search.ts"),
] satisfies RouteConfig;
