export function register() {}
export function onRequestError(error: unknown) {
  console.error('WonderLab render error:', error instanceof Error ? error.stack : String(error));
}
