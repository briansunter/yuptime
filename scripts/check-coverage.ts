#!/usr/bin/env bun
/**
 * Coverage threshold checker for CI/CD
 *
 * Reads Bun LCov coverage output and enforces minimum thresholds.
 * Exits with code 1 if thresholds are not met.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COVERAGE_FILE = resolve("coverage", "lcov.info");

// Coverage thresholds by component
const thresholds = {
  overall: 55, // Lowered due to new components with K8s/DB dependencies
  checkers: 60, // Database checkers have connection code that requires real servers
  reconcilers: 85,
  "job-manager": 80,
  alerting: 85,
  lib: 60, // secrets.ts has K8s API dependencies
  server: 70,
  discovery: 10, // Discovery controller requires real K8s API
};

// File path patterns for component categorization
const componentPatterns = {
  checkers: /^src\/checkers\//,
  reconcilers: /^src\/controller\/reconcilers\//,
  "job-manager": /^src\/controller\/job-manager\//,
  discovery: /^src\/controller\/discovery\//,
  alerting: /^src\/alerting\//,
  lib: /^src\/lib\//,
  server: /^src\/server\//,
};

function getComponent(filePath: string): string | null {
  for (const [component, pattern] of Object.entries(componentPatterns)) {
    if (pattern.test(filePath)) {
      return component;
    }
  }
  return null;
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

interface FileCoverage {
  filePath: string;
  linesFound: number;
  linesHit: number;
}

try {
  // Read LCov file
  const lcovContent = readFileSync(COVERAGE_FILE, "utf-8");

  // Parse LCov format
  const files: FileCoverage[] = [];
  const lines = lcovContent.split("\n");

  let currentFile: FileCoverage | null = null;

  for (const line of lines) {
    if (line.startsWith("SF:")) {
      // Start of file record
      currentFile = {
        filePath: line.substring(3),
        linesFound: 0,
        linesHit: 0,
      };
    } else if (line.startsWith("LF:")) {
      // Lines Found
      if (currentFile) {
        currentFile.linesFound = parseInt(line.substring(3), 10);
      }
    } else if (line.startsWith("LH:")) {
      // Lines Hit
      if (currentFile) {
        currentFile.linesHit = parseInt(line.substring(3), 10);
      }
    } else if (line === "end_of_record") {
      // End of file record
      if (currentFile) {
        files.push(currentFile);
        currentFile = null;
      }
    }
  }

  // Calculate overall coverage
  let totalLines = 0;
  let coveredLines = 0;

  const componentStats: Record<
    string,
    { lines: number; covered: number }
  > = {};

  for (const file of files) {
    totalLines += file.linesFound;
    coveredLines += file.linesHit;

    // Track by component
    const component = getComponent(file.filePath);
    if (component) {
      if (!componentStats[component]) {
        componentStats[component] = { lines: 0, covered: 0 };
      }
      componentStats[component].lines += file.linesFound;
      componentStats[component].covered += file.linesHit;
    }
  }

  const overallPercent =
    totalLines > 0 ? (coveredLines / totalLines) * 100 : 0;
  console.log(`\n📊 Coverage Report\n`);

  // Check overall threshold
  if (overallPercent < thresholds.overall) {
    console.error(
      `❌ Overall coverage ${formatPercent(
        overallPercent
      )} is below threshold ${thresholds.overall}%`
    );
    process.exit(1);
  }
  console.log(
    `✅ Overall: ${formatPercent(overallPercent)} (threshold: ${thresholds.overall}%)`
  );

  // Check component thresholds
  let failed = false;
  for (const [component, threshold] of Object.entries(thresholds)) {
    if (component === "overall") continue;

    const stats = componentStats[component];
    if (!stats || stats.lines === 0) {
      // Skip warning for untested components - they're pending
      continue;
    }

    const percent = (stats.covered / stats.lines) * 100;
    if (percent < threshold) {
      console.error(
        `❌ ${component}: ${formatPercent(percent)} is below threshold ${threshold}%`
      );
      failed = true;
    } else {
      console.log(
        `✅ ${component}: ${formatPercent(percent)} (threshold: ${threshold}%)`
      );
    }
  }

  if (failed) {
    console.error("\n❌ Coverage thresholds not met");
    process.exit(1);
  }

  console.log("\n✅ All coverage thresholds met!");
  process.exit(0);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.error(`❌ Coverage file not found: ${COVERAGE_FILE}`);
    console.error("   Run coverage first with: bun run test:coverage:ci");
  } else {
    console.error("❌ Error checking coverage:", error);
  }
  process.exit(1);
}
