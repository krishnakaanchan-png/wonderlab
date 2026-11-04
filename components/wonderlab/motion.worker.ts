import { estimateMotion } from "../../lib/wonderlab/motion";
const worker = self as unknown as {
  onmessage: (e: MessageEvent) => void;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};
worker.onmessage = (event) => {
  try {
    const { images, width, height } = event.data as {
      images: Uint8Array[];
      width: number;
      height: number;
    };
    const pairs = images.map((next, i) => {
      const prev = images[(i + images.length - 1) % images.length];
      return {
        forward: estimateMotion(prev, next, width, height),
        backward: estimateMotion(next, prev, width, height),
      };
    });
    worker.postMessage(
      { pairs },
      pairs.flatMap((p) => [p.forward.data.buffer, p.backward.data.buffer]),
    );
  } catch (e) {
    worker.postMessage(
      {
        error:
          e instanceof Error
            ? e.message
            : "Component motion could not be prepared.",
      },
      [],
    );
  }
};
