import jsfeat from "jsfeat";

export function estimateMotion(
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  height: number,
) {
  if (a.length !== width * height || b.length !== a.length)
    throw new Error("Invalid motion image dimensions.");
  const first = new jsfeat.pyramid_t(3),
    second = new jsfeat.pyramid_t(3);
  first.allocate(width, height, jsfeat.U8_t | jsfeat.C1_t);
  second.allocate(width, height, jsfeat.U8_t | jsfeat.C1_t);
  first.data[0].data.set(a);
  second.data[0].data.set(b);
  first.build(first.data[0], true);
  second.build(second.data[0], true);
  const cols = 48,
    rows = Math.round((cols * height) / width),
    count = cols * rows;
  const from = new Float32Array(count * 2),
    to = new Float32Array(count * 2),
    status = new Uint8Array(count);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      from[i * 2] = (x / (cols - 1)) * (width - 1);
      from[i * 2 + 1] = (y / (rows - 1)) * (height - 1);
    }
  jsfeat.optical_flow_lk.track(
    first,
    second,
    from,
    to,
    count,
    11,
    20,
    status,
    0.01,
    0.0001,
  );
  const raw = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const dx = (to[i * 2] - from[i * 2]) / width,
      dy = (to[i * 2 + 1] - from[i * 2 + 1]) / height;
    if (status[i] && Math.hypot(dx, dy) < 0.12) {
      raw[i * 2] = dx;
      raw[i * 2 + 1] = dy;
    } else status[i] = 0;
  }
  const data = new Float32Array(count * 4);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      let sx = 0,
        sy = 0,
        total = 0;
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          const xx = x + k,
            yy = y + j;
          if (xx < 0 || xx >= cols || yy < 0 || yy >= rows) continue;
          const i = yy * cols + xx;
          if (!status[i]) continue;
          const w = j === 0 && k === 0 ? 4 : 1;
          sx += raw[i * 2] * w;
          sy += raw[i * 2 + 1] * w;
          total += w;
        }
      const at = (y * cols + x) * 4;
      data[at] = total ? sx / total : 0;
      data[at + 1] = total ? sy / total : 0;
      data[at + 3] = 1;
    }
  return { data, width: cols, height: rows };
}
