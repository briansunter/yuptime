/**
 * Query Parser E2E Tests
 *
 * Tests for JSONPath, XPath, and CSS selector query monitors.
 * These tests verify the full Kubernetes Job execution flow.
 */

import { afterEach, describe, test } from "bun:test";
import {
  assertCheckResult,
  createHtmlQueryMonitor,
  createJsonQueryMonitor,
  createMonitor,
  createXmlQueryMonitor,
  deleteMonitor,
  E2E_NAMESPACE,
  htmlQueryFixtures,
  jsonQueryFixtures,
  uniqueTestName,
  waitForMonitorStatus,
  xmlQueryFixtures,
} from "../lib";

describe("JSON Query Monitor E2E", () => {
  const createdMonitors: string[] = [];

  afterEach(async () => {
    for (const name of createdMonitors) {
      await deleteMonitor(name, E2E_NAMESPACE);
    }
    createdMonitors.length = 0;
  });

  async function createAndTrack(monitor: ReturnType<typeof createJsonQueryMonitor>) {
    const name = uniqueTestName(monitor.metadata.name);
    monitor.metadata.name = name;
    createdMonitors.push(name);
    await createMonitor(monitor);
    return name;
  }

  describe("Success Cases", () => {
    test("returns UP when JSONPath equals expected value", async () => {
      const name = await createAndTrack(jsonQueryFixtures.statusEquals());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("returns UP when JSONPath count matches", async () => {
      const name = await createAndTrack(jsonQueryFixtures.servicesCount());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("returns UP when JSONPath nested value matches", async () => {
      const name = await createAndTrack(jsonQueryFixtures.nestedValue());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("returns UP when JSONPath exists check passes", async () => {
      const name = await createAndTrack(jsonQueryFixtures.valueExists());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("returns UP when JSONPath not-exists check passes", async () => {
      const name = await createAndTrack(jsonQueryFixtures.valueNotExists());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("returns UP when JSONPath numeric comparison passes", async () => {
      const name = await createAndTrack(jsonQueryFixtures.numericGreater());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });
  });

  describe("Failure Cases", () => {
    test("returns DOWN when JSONPath value doesn't match", async () => {
      const name = await createAndTrack(jsonQueryFixtures.statusWrong());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "down",
        reason: "JSON_VALIDATION_FAILED",
      });
    });

    test("returns DOWN when JSONPath count doesn't match", async () => {
      const monitor = createJsonQueryMonitor({
        name: "json-count-wrong",
        path: "$.services[*]",
        count: 10, // Wrong count
      });
      const name = await createAndTrack(monitor);

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "down",
        reason: "JSON_VALIDATION_FAILED",
      });
    });
  });
});

describe("XML Query Monitor E2E", () => {
  const createdMonitors: string[] = [];

  afterEach(async () => {
    for (const name of createdMonitors) {
      await deleteMonitor(name, E2E_NAMESPACE);
    }
    createdMonitors.length = 0;
  });

  async function createAndTrack(monitor: ReturnType<typeof createXmlQueryMonitor>) {
    const name = uniqueTestName(monitor.metadata.name);
    monitor.metadata.name = name;
    createdMonitors.push(name);
    await createMonitor(monitor);
    return name;
  }

  describe("Success Cases", () => {
    test("returns UP when XPath equals expected value", async () => {
      const name = await createAndTrack(xmlQueryFixtures.statusEquals());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("returns UP when XPath attribute matches", async () => {
      const name = await createAndTrack(xmlQueryFixtures.attributeEquals());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("returns UP when XPath element exists", async () => {
      const name = await createAndTrack(xmlQueryFixtures.elementExists());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("returns UP when XPath count matches", async () => {
      const name = await createAndTrack(xmlQueryFixtures.serviceCount());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });
  });

  describe("Failure Cases", () => {
    test("returns DOWN when XPath value doesn't match", async () => {
      const name = await createAndTrack(xmlQueryFixtures.statusWrong());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "down",
        reason: "XML_VALIDATION_FAILED",
      });
    });

    test("returns DOWN when XPath element not found", async () => {
      const monitor = createXmlQueryMonitor({
        name: "xml-not-found",
        path: "/response/nonexistent/text()",
        exists: true,
      });
      const name = await createAndTrack(monitor);

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "down",
        reason: "XML_VALIDATION_FAILED",
      });
    });
  });
});

describe("HTML Query Monitor E2E", () => {
  const createdMonitors: string[] = [];

  afterEach(async () => {
    for (const name of createdMonitors) {
      await deleteMonitor(name, E2E_NAMESPACE);
    }
    createdMonitors.length = 0;
  });

  async function createAndTrack(monitor: ReturnType<typeof createHtmlQueryMonitor>) {
    const name = uniqueTestName(monitor.metadata.name);
    monitor.metadata.name = name;
    createdMonitors.push(name);
    await createMonitor(monitor);
    return name;
  }

  describe("Success Cases", () => {
    test("returns UP when CSS selector text contains expected", async () => {
      const name = await createAndTrack(htmlQueryFixtures.statusText());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("returns UP when CSS selector element exists", async () => {
      const name = await createAndTrack(htmlQueryFixtures.elementExists());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("returns UP when CSS selector count matches", async () => {
      const name = await createAndTrack(htmlQueryFixtures.serviceCount());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("returns UP when CSS selector attribute contains expected", async () => {
      const name = await createAndTrack(htmlQueryFixtures.attributeEquals());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("returns UP when CSS class selector matches", async () => {
      const name = await createAndTrack(htmlQueryFixtures.classSelector());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });
  });

  describe("Failure Cases", () => {
    test("returns DOWN when CSS selector text doesn't match", async () => {
      const name = await createAndTrack(htmlQueryFixtures.statusTextWrong());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "down",
        reason: "HTML_VALIDATION_FAILED",
      });
    });

    test("returns DOWN when CSS selector element not found", async () => {
      const monitor = createHtmlQueryMonitor({
        name: "html-not-found",
        selector: "#nonexistent",
        exists: true,
      });
      const name = await createAndTrack(monitor);

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "down",
        reason: "HTML_VALIDATION_FAILED",
      });
    });

    test("returns DOWN when CSS selector count doesn't match", async () => {
      const monitor = createHtmlQueryMonitor({
        name: "html-count-wrong",
        selector: ".service",
        count: 10, // Wrong count
      });
      const name = await createAndTrack(monitor);

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "down",
        reason: "HTML_VALIDATION_FAILED",
      });
    });
  });
});
