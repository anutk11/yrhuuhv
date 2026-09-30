import { describe, expect, it } from "vitest";
import { isPhoneUserId, normalizePhone, phoneFromUserId } from "./phoneRoster";

describe("phone identity helpers", () => {
  const id = "00000000-0000-0000-0000-000050123456";
  it("recognizes synthetic phone ids", () => {
    expect(isPhoneUserId(id)).toBe(true);
  });
  it("normalizes Israeli phone formats", () => {
    expect(normalizePhone("050-123-4567")).toBe("501234567");
    expect(normalizePhone("0501234567")).toBe("501234567");
  });
  it("extracts phone digits", () => {
    expect(phoneFromUserId(id)).toBe("50123456");
  });
});
