// ADL 1.4 node identifiers.
//
// Archetype nodes are identified by "at-codes" (at0000, at0001, …); value-set
// constraints use "ac-codes" (ac0001, …). Specialised archetypes extend a code
// with dotted segments (at0001.1, at0001.0.2). These match the `nodeId` /
// `archetype_node_id` values carried in compositions and web templates.

const AT_CODE_RE = /^at\d+(\.\d+)*$/;
const AC_CODE_RE = /^ac\d+(\.\d+)*$/;

/** Whether a string is an ADL 1.4 at-code (archetype node id). */
export function isAtCode(code: string): boolean {
  return AT_CODE_RE.test(code);
}

/** Whether a string is an ADL 1.4 ac-code (value-set constraint code). */
export function isAcCode(code: string): boolean {
  return AC_CODE_RE.test(code);
}

/**
 * Specialisation depth of an at/ac code: 0 for a top-level code (at0001),
 * 1 for a once-specialised code (at0001.1), etc. Returns -1 if not a node code.
 */
export function specialisationDepth(code: string): number {
  if (!isAtCode(code) && !isAcCode(code)) return -1;
  return code.split(".").length - 1;
}
