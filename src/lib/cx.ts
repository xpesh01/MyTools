/** Склеивает классы, отбрасывая false/undefined — удобно для условных модификаторов. */
export function cx(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ')
}
