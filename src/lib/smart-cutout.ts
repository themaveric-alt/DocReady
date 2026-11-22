// Border-connected color flood fill. It preserves disconnected foreground
// regions and makes no claim of semantic portrait segmentation.
export function smartCutout(data: Uint8ClampedArray, width: number, height: number, tolerance = 36) {
  const visited = new Uint8Array(width * height)
  const queue = new Uint32Array(width * height)
  let read = 0, written = 0
  const samples: number[][] = []
  for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) {
    const i = (y * width + x) * 4
    samples.push([data[i], data[i + 1], data[i + 2]])
  }
  function add(index: number) {
    if (visited[index]) return
    visited[index] = 1
    const i = index * 4
    const difference = Math.min(...samples.map(color => Math.hypot(data[i] - color[0], data[i + 1] - color[1], data[i + 2] - color[2])))
    if (difference <= tolerance) queue[written++] = index
  }
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x) }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1) }
  while (read < written) {
    const index = queue[read++]
    data[index * 4 + 3] = 0
    const x = index % width, y = Math.floor(index / width)
    if (x > 0) add(index - 1)
    if (x + 1 < width) add(index + 1)
    if (y > 0) add(index - width)
    if (y + 1 < height) add(index + width)
  }
  return written
}
