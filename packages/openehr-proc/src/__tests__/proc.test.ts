import { describe, expect, it } from "vitest";

import { PLAN_ITEM, SPEC_COMPONENT, SPEC_VERSION, TASK_GROUP, TASK_PLAN, WORK_PLAN } from "../index.ts";

describe("spec coordinates", () => {
  it("pins PROC 1.7.0", () => {
    expect(SPEC_COMPONENT).toBe("PROC");
    expect(SPEC_VERSION).toBe("1.7.0");
  });
});

const task = (text: string) => ({ description: { value: text }, _type: "TASK" });

describe("Task Planning model", () => {
  it("parses a WORK_PLAN → TASK_PLAN → nested TASK_GROUP / TASK (recursion)", () => {
    const workPlan = {
      name: { value: "Sepsis bundle" },
      indications: [{ value: "suspected sepsis" }],
      top_level_plans: [
        {
          description: { value: "1-hour bundle" },
          definition: {
            description: { value: "root" },
            execution_type: 0,
            members: [
              task("measure lactate"),
              {
                description: { value: "antibiotics group" },
                members: [task("blood cultures"), task("broad-spectrum antibiotics")],
                _type: "TASK_GROUP",
              },
            ],
            _type: "TASK_GROUP",
          },
          _type: "TASK_PLAN",
        },
      ],
      _type: "WORK_PLAN",
    };
    const parsed = WORK_PLAN.safeParse(workPlan);
    expect(parsed.success, parsed.success ? "ok" : JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("PLAN_ITEM accepts both a TASK_GROUP and a TASK", () => {
    expect(PLAN_ITEM.safeParse(task("x")).success).toBe(true);
    expect(PLAN_ITEM.safeParse({ description: { value: "g" }, members: [], _type: "TASK_GROUP" }).success).toBe(true);
  });

  it("requires the mandatory description on a TASK_PLAN / TASK_GROUP", () => {
    expect(TASK_PLAN.safeParse({ definition: { description: { value: "r" } } }).success).toBe(false);
    expect(TASK_GROUP.safeParse({ members: [] }).success).toBe(false);
  });
});
