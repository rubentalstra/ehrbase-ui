// openEHR PROC 1.7.0 Task Planning — core model.
//
// Care plans / order sets: WORK_PLAN → TASK_PLAN → TASK_GROUP → PLAN_ITEM
// (TASK_GROUP | TASK), recursively. Field names + cardinality taken from the
// authoritative Task Planning BMM (openehr_proc_task_planning_1.1.0). This is
// the CORE subset the care-plan surfaces (M13/M14) consume; the full model
// (calendars, timelines, choice/decision/event groups, context expressions) is
// out of scope until those milestones, and Task Planning carries an upstream
// "RETIRED" maturity label, so re-verify against the BMM at consumption.
//
// RM-typed fields reference @ehrbase-ui/openehr-rm / -base. Recursion uses the
// Zod-4 getter pattern (z.lazy is removed in v4).

import { z } from "zod";
import { LOCATABLE_REF } from "@ehrbase-ui/openehr-base";
import { DV_IDENTIFIER, DV_TEXT, ITEM_STRUCTURE, PARTY_PROXY } from "@ehrbase-ui/openehr-rm";

// TASK — a leaf plan item (abstract TASK in the spec; concrete DISPATCHABLE_TASK
// / PERFORMABLE_TASK). Modelled as the common PLAN_ITEM leaf shape.
export const TASK = z.object({
  name: DV_TEXT.optional(),
  description: DV_TEXT,
  get other_details() {
    return ITEM_STRUCTURE.optional();
  },
  _type: z.literal("TASK").optional(),
});
export type TASK = z.infer<typeof TASK>;

// TASK_GROUP — an ordered/parallel grouping of PLAN_ITEMs (recursive).
// execution_type is the EXECUTION_TYPE integer enum.
export const TASK_GROUP = z.object({
  name: DV_TEXT.optional(),
  description: DV_TEXT,
  execution_type: z.number().int().optional(),
  training_level: z.number().int().optional(),
  get members() {
    return z.array(PLAN_ITEM).optional();
  },
  _type: z.literal("TASK_GROUP").optional(),
});
export type TASK_GROUP = z.infer<typeof TASK_GROUP>;

// PLAN_ITEM — abstract: a group or a task. Stable named union (recursion target).
export const PLAN_ITEM = z.union([TASK_GROUP, TASK]);
export type PLAN_ITEM = z.infer<typeof PLAN_ITEM>;

// TASK_PLAN — a plan with a single root TASK_GROUP definition.
export const TASK_PLAN = z.object({
  subject: PARTY_PROXY.optional(),
  description: DV_TEXT,
  guideline: DV_IDENTIFIER.optional(),
  order_set_id: DV_IDENTIFIER.optional(),
  // ISO-8601 durations
  due_time: z.string().optional(),
  expiry_time: z.string().optional(),
  indications: z.array(DV_TEXT).optional(),
  get definition() {
    return TASK_GROUP;
  },
  _type: z.literal("TASK_PLAN").optional(),
});
export type TASK_PLAN = z.infer<typeof TASK_PLAN>;

// WORK_PLAN — the top-level care plan; carries one or more TASK_PLANs.
export const WORK_PLAN = z.object({
  name: DV_TEXT.optional(),
  care_plan: LOCATABLE_REF.optional(),
  care_pathway: DV_IDENTIFIER.optional(),
  order_list: z.array(LOCATABLE_REF).optional(),
  indications: z.array(DV_TEXT).optional(),
  top_level_plans: z.array(TASK_PLAN).optional(),
  _type: z.literal("WORK_PLAN").optional(),
});
export type WORK_PLAN = z.infer<typeof WORK_PLAN>;
