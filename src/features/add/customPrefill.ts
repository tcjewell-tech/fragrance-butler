/** Splits a search query into custom-entry fields: the first word is the house, the rest the name. */
export function prefillFromQuery(query: string): { house: string; name: string } {
  const q = query.trim().replace(/\s+/g, ' ');
  const space = q.indexOf(' ');
  if (space === -1) return { house: '', name: q };
  return { house: q.slice(0, space), name: q.slice(space + 1) };
}
