// openEHR CDS 2.0.1 — GDL2-aligned rule-authoring model.
//
// Per ADR-0021 we model OUR rule-authoring shape (the form-based authoring UI
// in M9), GDL2-aligned but NOT raw GDL2: a CdsRule binds variables to
// archetype/AQL paths, evaluates a condition tree over them (when), and fires
// actions (then) — typically a severity-graded alert. This never crosses the
// EHRbase wire (it is our governance data), so CDS is the one openehr-* package
// free to track the newest stable spec (CDS 2.0.1 / GDL2).

import { z } from "zod";

/** Alert severity → UI treatment (ADR-0021): info banner, dismissible warning, blocking critical. */
export const CdsSeverity = z.enum(["info", "warning", "critical"]);
export type CdsSeverity = z.infer<typeof CdsSeverity>;

export const CdsRuleStatus = z.enum(["draft", "active", "inactive"]);
export type CdsRuleStatus = z.infer<typeof CdsRuleStatus>;

// Bind a variable name to the archetype/AQL path it reads.
export const CdsBinding = z.object({
  id: z.string(),
  path: z.string(),
  archetypeId: z.string().optional(),
});
export type CdsBinding = z.infer<typeof CdsBinding>;

export const CdsComparisonOp = z.enum(["=", "!=", ">", ">=", "<", "<=", "in", "exists", "not_exists"]);
export type CdsComparisonOp = z.infer<typeof CdsComparisonOp>;

const CdsScalar = z.union([z.string(), z.number(), z.boolean()]);

// Condition tree: a comparison over a bound variable, or a logical combination.
export const CdsComparison = z.object({
  kind: z.literal("compare"),
  variable: z.string(),
  op: CdsComparisonOp,
  value: z.union([CdsScalar, z.array(CdsScalar)]).optional(),
});
export const CdsAnd = z.object({
  kind: z.literal("and"),
  get operands() {
    return z.array(CdsCondition);
  },
});
export const CdsOr = z.object({
  kind: z.literal("or"),
  get operands() {
    return z.array(CdsCondition);
  },
});
export const CdsNot = z.object({
  kind: z.literal("not"),
  get operand() {
    return CdsCondition;
  },
});
export const CdsCondition = z.union([CdsComparison, CdsAnd, CdsOr, CdsNot]);
export type CdsCondition = z.infer<typeof CdsCondition>;

// Actions fired when the condition holds.
export const CdsAlertAction = z.object({
  kind: z.literal("alert"),
  severity: CdsSeverity,
  message: z.string(),
});
export const CdsSetAction = z.object({
  kind: z.literal("set"),
  target: z.string(),
  value: CdsScalar,
});
export const CdsAction = z.discriminatedUnion("kind", [CdsAlertAction, CdsSetAction]);
export type CdsAction = z.infer<typeof CdsAction>;

// A complete decision rule.
export const CdsRule = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  gdlVersion: z.literal("GDL2").optional(),
  status: CdsRuleStatus,
  bindings: z.array(CdsBinding),
  when: CdsCondition,
  then: z.array(CdsAction).min(1),
});
export type CdsRule = z.infer<typeof CdsRule>;
