import { env } from "cloudflare:workers";
import { isPublicDemo } from "@/lib/wonderlab/demo-access";
export function GET() {
  const vars = env as unknown as Record<string, string>;
  const demoMode = isPublicDemo(vars);
  return Response.json({
    configured: Boolean(vars.MODEL_API_KEY) && !demoMode,
    model: "muse-wonder-1.0",
    demoMode,
  });
}
