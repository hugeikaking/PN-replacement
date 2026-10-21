/** Text delta offsets are UTF-16 positions, matching JavaScript and .NET strings. */
export function buildTextDelta(oldText, newText) {
  const anchorLength = 24
  const index = new Map()
  for (let offset = 0; offset + anchorLength <= oldText.length; offset++) {
    const anchor = oldText.slice(offset, offset + anchorLength)
    const entries = index.get(anchor) ?? []
    if (entries.length < 64) entries.push(offset)
    index.set(anchor, entries)
  }
  const operations = []
  let position = 0
  let pending = 0
  while (position < newText.length) {
    let bestOffset = -1
    let bestLength = 0
    const entries = index.get(newText.slice(position, position + anchorLength)) ?? []
    for (const offset of entries) {
      let length = anchorLength
      while (offset + length < oldText.length && position + length < newText.length &&
             oldText.charCodeAt(offset + length) === newText.charCodeAt(position + length)) length++
      if (length > bestLength) { bestOffset = offset; bestLength = length }
    }
    if (bestLength >= anchorLength) {
      if (pending < position) operations.push({ insert: newText.slice(pending, position) })
      operations.push({ copy: [bestOffset, bestLength] })
      position += bestLength
      pending = position
    } else position++
  }
  if (pending < newText.length) operations.push({ insert: newText.slice(pending) })
  return operations
}
