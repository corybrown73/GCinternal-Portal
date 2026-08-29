import { describe, expect, it } from "vitest";
import {
  IMPLEMENTATION_STATUSES,
  implementationStatusInput,
  updateImplementationInput,
} from "../implementation-input";

describe("implementation status input", () => {
  it("accepts every app status value", () => {
    for (const s of IMPLEMENTATION_STATUSES) {
      expect(implementationStatusInput.parse(s)).toBe(s);
    }
  });

  it("tolerates the legacy DB default 'active' (regression: SOW/board saves failed on hub-created rows)", () => {
    expect(implementationStatusInput.parse("active")).toBe("active");
    expect(updateImplementationInput.shape.status.parse("active")).toBe("active");
  });

  it("rejects values outside the known vocabulary", () => {
    expect(() => implementationStatusInput.parse("green")).toThrow();
    expect(() => implementationStatusInput.parse("")).toThrow();
  });
});
