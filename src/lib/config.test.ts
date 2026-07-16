import { afterEach, describe, expect, test } from "bun:test";
import { config, parseJobTTLSeconds, parsePort, validateConfig } from "./config";

function withConfig(overrides: Partial<typeof config>, fn: () => void) {
  const original = {
    port: config.port,
    kubeNamespace: config.kubeNamespace,
    jobTTLSeconds: config.jobTTLSeconds,
  };
  Object.assign(config, overrides);
  try {
    fn();
  } finally {
    Object.assign(config, original);
  }
}

describe("parsePort", () => {
  test("returns default 3000 for undefined", () => {
    expect(parsePort(undefined)).toBe(3000);
  });

  test("returns default 3000 for empty string", () => {
    expect(parsePort("")).toBe(3000);
  });

  test("parses valid custom port", () => {
    expect(parsePort("8080")).toBe(8080);
  });

  test("parses port 1 (minimum boundary)", () => {
    expect(parsePort("1")).toBe(1);
  });

  test("parses port 65535 (maximum boundary)", () => {
    expect(parsePort("65535")).toBe(65535);
  });

  test("rejects non-integer string", () => {
    expect(() => parsePort("foo")).toThrow(/Invalid PORT/);
  });

  test("rejects NaN-producing input", () => {
    expect(() => parsePort("abc")).toThrow(/Invalid PORT/);
  });

  test("rejects port 0", () => {
    expect(() => parsePort("0")).toThrow(/Invalid PORT/);
  });

  test("rejects port above 65535", () => {
    expect(() => parsePort("70000")).toThrow(/Invalid PORT/);
  });

  test("rejects fractional port", () => {
    expect(() => parsePort("80.5")).toThrow(/Invalid PORT/);
  });
});

describe("parseJobTTLSeconds", () => {
  test("defaults to ten minutes", () => expect(parseJobTTLSeconds(undefined)).toBe(600));
  test("accepts a bounded custom TTL", () => expect(parseJobTTLSeconds("900")).toBe(900));
  test("rejects too-short retention", () =>
    expect(() => parseJobTTLSeconds("59")).toThrow(/JOB_TTL_SECONDS/));
  test("rejects non-integers", () =>
    expect(() => parseJobTTLSeconds("600.5")).toThrow(/JOB_TTL_SECONDS/));
});

describe("validateConfig", () => {
  afterEach(() => {
    // Restore sane defaults
    config.port = 3000;
    config.kubeNamespace = "monitoring";
    config.jobTTLSeconds = 600;
  });

  test("succeeds with valid config", () => {
    withConfig({ port: 3000, kubeNamespace: "monitoring" }, () => {
      expect(() => validateConfig()).not.toThrow();
    });
  });

  test("throws on invalid port", () => {
    withConfig({ port: Number.NaN, kubeNamespace: "monitoring" }, () => {
      expect(() => validateConfig()).toThrow(/port must be an integer/);
    });
  });

  test("throws on port out of range", () => {
    withConfig({ port: 99999, kubeNamespace: "monitoring" }, () => {
      expect(() => validateConfig()).toThrow(/port must be an integer/);
    });
  });

  test("throws on empty namespace", () => {
    withConfig({ port: 3000, kubeNamespace: "" }, () => {
      expect(() => validateConfig()).toThrow(/KUBE_NAMESPACE/);
    });
  });

  test("throws on whitespace-only namespace", () => {
    withConfig({ port: 3000, kubeNamespace: "   " }, () => {
      expect(() => validateConfig()).toThrow(/KUBE_NAMESPACE/);
    });
  });

  test("accepts custom namespace", () => {
    withConfig({ port: 3000, kubeNamespace: "yuptime" }, () => {
      expect(() => validateConfig()).not.toThrow();
    });
  });
});
