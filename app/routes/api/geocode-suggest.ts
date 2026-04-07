import { suggest } from "~/lib/geocode.server";
import type { Route } from "./+types/geocode-suggest";

export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.length < 2) return Response.json([]);
  const results = await suggest(q);
  return Response.json(results);
}
