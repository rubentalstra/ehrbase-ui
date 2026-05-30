// @ehrbase-ui/openehr-proc — openEHR PROC 1.7.0 (Task Planning)
//
// Care-plan / order-set model: WORK_PLAN → TASK_PLAN → TASK_GROUP → PLAN_ITEM
// (TASK_GROUP | TASK), recursively. Zod schemas hand-typed against the Task
// Planning BMM; RM-typed fields come from @ehrbase-ui/openehr-rm / -base.
//
// Core subset for M13 (orders) + M14 (care plan). Task Planning carries an
// upstream "RETIRED" maturity label — re-verify against the BMM at consumption.
//
// Source: https://specifications.openehr.org/releases/PROC/Release-1.7.0

export * from "./task-planning.ts";
export { SPEC_COMPONENT, SPEC_VERSION } from "./spec.ts";
