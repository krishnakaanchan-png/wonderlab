import { PublicError } from "./meta";
export function isPublicDemo(environment: Record<string, unknown>) {
  return ["true", "1"].includes(
    String(environment.PUBLIC_DEMO_MODE || "")
      .trim()
      .toLowerCase(),
  );
}
export function requireLiveGeneration(environment: Record<string, unknown>) {
  if (isPublicDemo(environment))
    throw new PublicError(
      "This public preview plays saved projects. New generation and AI chat are available when you run WonderLab with your own Meta API key.",
      403,
    );
}
