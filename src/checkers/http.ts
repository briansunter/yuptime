import { getDnsConfigFromEnv, resolveHostname } from "../lib/dns";
import { logger } from "../lib/logger";
import { fetchOAuth2Token } from "../lib/oauth";
import {
  queryCssSelector,
  queryJsonPath,
  queryXPath,
  validateCssSelectorResult,
  validateJsonPathResult,
  validateXPathResult,
} from "../lib/parsers";
import { resolveSecretCached } from "../lib/secrets";
import type { Monitor } from "../types/crd";
import type { HttpAuth, HttpTarget } from "../types/crd/monitor";

export interface CheckResult {
  state: "up" | "down";
  latencyMs: number;
  reason: string;
  message: string;
  certExpiresAt?: Date;
  certDaysRemaining?: number;
}

type KeywordCriteria = NonNullable<NonNullable<Monitor["spec"]["successCriteria"]>["keyword"]>;
type JsonQueryCriteria = NonNullable<NonNullable<Monitor["spec"]["successCriteria"]>["jsonQuery"]>;
type XmlQueryCriteria = NonNullable<NonNullable<Monitor["spec"]["successCriteria"]>["xmlQuery"]>;
type HtmlQueryCriteria = NonNullable<NonNullable<Monitor["spec"]["successCriteria"]>["htmlQuery"]>;

interface HttpRequestParts {
  headers: Headers;
  method: string;
  body?: string;
}

interface PreparedFetchTarget {
  url: string;
  tls?: Bun.TLSOptions;
}

interface HttpExecutionResult {
  result: CheckResult;
  body?: string;
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 10;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function downResult(latencyMs: number, reason: string, message: string): CheckResult {
  return {
    state: "down",
    latencyMs,
    reason,
    message,
  };
}

function monitorNamespace(monitor: Monitor): string {
  return monitor.metadata.namespace || "default";
}

/**
 * Build authentication headers based on auth configuration.
 * Credentials are read from environment variables injected by the Job builder.
 */
async function buildAuthHeaders(
  auth: HttpAuth | undefined,
  timeout: number,
): Promise<{ headers: Headers; error?: string }> {
  const headers = new Headers();

  if (!auth) {
    return { headers };
  }

  if (auth.basic) {
    const username = process.env.YUPTIME_AUTH_BASIC_USERNAME;
    const password = process.env.YUPTIME_AUTH_BASIC_PASSWORD;

    if (!username || !password) {
      return {
        headers,
        error: "Basic auth credentials not found in environment",
      };
    }

    const encoded = Buffer.from(`${username}:${password}`).toString("base64");
    headers.set("Authorization", `Basic ${encoded}`);
  }

  if (auth.bearer) {
    const token = process.env.YUPTIME_AUTH_BEARER_TOKEN;

    if (!token) {
      return {
        headers,
        error: "Bearer token not found in environment",
      };
    }

    headers.set("Authorization", `Bearer ${token}`);
  }

  if (auth.oauth2) {
    try {
      const token = await fetchOAuth2Token(
        {
          tokenUrl: auth.oauth2.tokenUrl,
          scopes: auth.oauth2.scopes,
        },
        timeout,
      );
      headers.set("Authorization", `Bearer ${token}`);
    } catch (error) {
      return {
        headers,
        error: `OAuth2 token fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  return { headers };
}

async function buildBaseHeaders(
  monitor: Monitor,
  target: HttpTarget,
  timeout: number,
): Promise<{ headers: Headers } | { error: string }> {
  const headers = new Headers();
  headers.set("User-Agent", "Yuptime/1.0");

  const authResult = await buildAuthHeaders(target.auth, timeout);
  if (authResult.error) {
    return { error: authResult.error };
  }

  authResult.headers.forEach((value, key) => {
    headers.set(key, value);
  });

  for (const header of target.headers ?? []) {
    let value = header.value || "";

    if (header.valueFromSecretRef) {
      try {
        value = await resolveSecretCached(
          header.valueFromSecretRef.namespace ?? monitorNamespace(monitor),
          header.valueFromSecretRef.name,
          header.valueFromSecretRef.key,
        );
      } catch (error) {
        logger.warn(
          { monitor: monitor.metadata.name, header: header.name, error },
          "Failed to resolve header secret",
        );
        return { error: `Failed to resolve secret-backed header: ${header.name}` };
      }
    }

    headers.set(header.name, value);
  }

  return { headers };
}

function buildRequestBody(target: HttpTarget, headers: Headers): string | undefined {
  if (!target.body || target.body.type === "none") {
    return undefined;
  }

  if (target.body.type === "json") {
    headers.set("Content-Type", "application/json");
    return JSON.stringify(target.body.json || {});
  }

  return target.body.text;
}

async function buildTlsOptions(
  monitor: Monitor,
  target: HttpTarget,
  hostname: string,
  isHttps: boolean,
): Promise<{ tls?: Bun.TLSOptions } | { error: string }> {
  if (!isHttps && !target.tls) {
    return {};
  }

  const tls: Bun.TLSOptions = {};

  if (target.tls?.verify === false) {
    tls.rejectUnauthorized = false;
  }

  const serverName = target.tls?.sni ?? (isHttps ? hostname : undefined);
  if (serverName) {
    tls.serverName = serverName;
  }

  const caRef = target.tls?.caBundleSecretRef;
  if (caRef) {
    try {
      tls.ca = await resolveSecretCached(
        caRef.namespace ?? monitorNamespace(monitor),
        caRef.name,
        caRef.key,
      );
    } catch (error) {
      logger.warn({ monitor: monitor.metadata.name, caRef, error }, "Failed to resolve TLS CA");
      return { error: "Failed to resolve TLS CA bundle secret" };
    }
  }

  return Object.keys(tls).length > 0 ? { tls } : {};
}

async function prepareFetchTarget(
  requestUrl: string,
  target: HttpTarget,
  monitor: Monitor,
  timeout: number,
  headers: Headers,
): Promise<PreparedFetchTarget | { error: string }> {
  const originalUrl = new URL(requestUrl);
  const originalHostname = originalUrl.hostname;
  const dnsConfig = target.dns ?? getDnsConfigFromEnv();
  const resolvedIp = await resolveHostname(originalHostname, {
    config: dnsConfig,
    defaultToExternal: true,
    timeoutMs: timeout * 1000,
  });

  let fetchUrl = requestUrl;
  if (resolvedIp !== originalHostname) {
    const resolvedUrl = new URL(requestUrl);
    resolvedUrl.hostname = resolvedIp;
    fetchUrl = resolvedUrl.toString();

    if (!headers.has("Host")) {
      headers.set(
        "Host",
        originalUrl.port ? `${originalHostname}:${originalUrl.port}` : originalHostname,
      );
    }

    logger.debug(
      { monitor: monitor.metadata.name, originalHostname, resolvedIp },
      "Using resolved IP for HTTP request",
    );
  }

  const tlsResult = await buildTlsOptions(
    monitor,
    target,
    originalHostname,
    originalUrl.protocol === "https:",
  );

  if ("error" in tlsResult) {
    return { error: tlsResult.error };
  }

  return { url: fetchUrl, tls: tlsResult.tls };
}

function requestBodyForMethod(method: string, body: string | undefined): string | undefined {
  return method === "GET" || method === "HEAD" ? undefined : body;
}

function nextRedirectMethod(status: number, method: string): string {
  if (status === 303) {
    return "GET";
  }

  if ((status === 301 || status === 302) && method !== "GET" && method !== "HEAD") {
    return "GET";
  }

  return method;
}

async function fetchWithRedirects(
  monitor: Monitor,
  target: HttpTarget,
  parts: HttpRequestParts,
  timeout: number,
  signal: AbortSignal,
): Promise<{ response: Response } | { error: string }> {
  let currentUrl = target.url;
  let method = parts.method;
  let body = parts.body;
  let redirectCount = 0;
  const followRedirects = target.followRedirects ?? true;
  const maxRedirects = target.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  while (true) {
    const headers = new Headers(parts.headers);
    const requestBody = requestBodyForMethod(method, body);
    if (!requestBody) {
      headers.delete("Content-Length");
    }

    const prepared = await prepareFetchTarget(currentUrl, target, monitor, timeout, headers);
    if ("error" in prepared) {
      return { error: prepared.error };
    }

    const response = await fetch(prepared.url, {
      method,
      headers,
      body: requestBody,
      redirect: "manual",
      signal,
      ...(prepared.tls ? { tls: prepared.tls } : {}),
    });

    if (!followRedirects || !REDIRECT_STATUSES.has(response.status)) {
      return { response };
    }

    const location = response.headers.get("location");
    if (!location) {
      return { response };
    }

    if (redirectCount >= maxRedirects) {
      return { error: `Exceeded maximum redirects (${maxRedirects})` };
    }

    currentUrl = new URL(location, currentUrl).toString();
    method = nextRedirectMethod(response.status, method);
    if (method === "GET" || method === "HEAD") {
      body = undefined;
    }
    redirectCount++;
  }
}

async function readBodyText(
  response: Response,
  maxBodyBytes: number,
): Promise<{ body: string } | { error: string }> {
  if (!response.body) {
    return { body: "" };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBodyBytes) {
      await reader.cancel();
      return { error: `Response body exceeds maxBodyBytes (${maxBodyBytes})` };
    }

    chunks.push(value);
  }

  return {
    body: Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      totalBytes,
    ).toString(),
  };
}

function classifyHttpError(error: unknown, latencyMs: number, timeout: number): CheckResult {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return downResult(timeout * 1000, "TIMEOUT", `Request timeout after ${timeout}s`);
    }

    if (error.message.includes("ECONNREFUSED")) {
      return downResult(latencyMs, "CONNECTION_REFUSED", "Connection refused");
    }

    if (error.message.includes("ENOTFOUND")) {
      return downResult(latencyMs, "DNS_NXDOMAIN", "DNS resolution failed");
    }

    if (error.message.toLowerCase().includes("certificate")) {
      return downResult(latencyMs, "TLS_ERROR", error.message);
    }
  }

  return downResult(latencyMs, "ERROR", error instanceof Error ? error.message : "Unknown error");
}

async function executeHttpRequest(
  monitor: Monitor,
  timeout: number,
  options: { readBody?: boolean } = {},
): Promise<HttpExecutionResult> {
  const target = monitor.spec.target.http;

  if (!target) {
    return {
      result: downResult(0, "INVALID_CONFIG", "No HTTP target configured"),
    };
  }

  const startTime = Date.now();
  const latency = () => Date.now() - startTime;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    const headersResult = await buildBaseHeaders(monitor, target, timeout);
    if ("error" in headersResult) {
      return {
        result: downResult(latency(), "AUTH_ERROR", headersResult.error),
      };
    }

    const headers = headersResult.headers;
    const parts = {
      headers,
      method: target.method || "GET",
      body: buildRequestBody(target, headers),
    };

    const fetchResult = await fetchWithRedirects(
      monitor,
      target,
      parts,
      timeout,
      controller.signal,
    );

    if ("error" in fetchResult) {
      return {
        result: downResult(latency(), "REQUEST_ERROR", fetchResult.error),
      };
    }

    const { response } = fetchResult;
    let latencyMs = latency();
    const successCriteria = monitor.spec.successCriteria?.http;
    const acceptedCodes = successCriteria?.acceptedStatusCodes || [200];

    if (!acceptedCodes.includes(response.status)) {
      return {
        result: downResult(
          latencyMs,
          `HTTP_${response.status}`,
          `HTTP ${response.status} received`,
        ),
      };
    }

    if (target.expectedContentType) {
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes(target.expectedContentType)) {
        return {
          result: downResult(
            latencyMs,
            "INVALID_CONTENT_TYPE",
            `Expected ${target.expectedContentType}, got ${contentType}`,
          ),
        };
      }
    }

    let body: string | undefined;
    if (options.readBody) {
      const bodyResult = await readBodyText(
        response,
        target.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
      );
      latencyMs = latency();
      if ("error" in bodyResult) {
        return {
          result: downResult(latencyMs, "BODY_TOO_LARGE", bodyResult.error),
        };
      }
      body = bodyResult.body;
    }

    if (successCriteria?.latencyMsUnder && latencyMs > successCriteria.latencyMsUnder) {
      return {
        result: downResult(
          latencyMs,
          "LATENCY_EXCEEDED",
          `Latency ${latencyMs}ms exceeds threshold ${successCriteria.latencyMsUnder}ms`,
        ),
      };
    }

    return {
      result: {
        state: "up",
        latencyMs,
        reason: "HTTP_OK",
        message: `HTTP ${response.status} OK`,
      },
      body,
    };
  } catch (error) {
    const result = classifyHttpError(error, latency(), timeout);
    logger.warn({ monitor: monitor.metadata.name, error }, "HTTP check failed with error");
    return { result };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * HTTP/HTTPS monitor checker
 */
export async function checkHttp(monitor: Monitor, timeout: number): Promise<CheckResult> {
  const execution = await executeHttpRequest(monitor, timeout);
  return execution.result;
}

function validateKeywordBody(
  body: string,
  criteria: KeywordCriteria,
): { reason: string; message: string } | null {
  for (const keyword of criteria.contains ?? []) {
    if (!body.includes(keyword)) {
      return {
        reason: "KEYWORD_MISSING",
        message: `Expected keyword "${keyword}" not found`,
      };
    }
  }

  for (const keyword of criteria.notContains ?? []) {
    if (body.includes(keyword)) {
      return {
        reason: "KEYWORD_PRESENT",
        message: `Unexpected keyword "${keyword}" found`,
      };
    }
  }

  for (const pattern of criteria.regex ?? []) {
    try {
      const regex = new RegExp(pattern);
      if (!regex.test(body)) {
        return {
          reason: "REGEX_NO_MATCH",
          message: `Regex pattern "${pattern}" did not match`,
        };
      }
    } catch {
      return {
        reason: "INVALID_REGEX",
        message: `Invalid regex pattern: ${pattern}`,
      };
    }
  }

  return null;
}

/**
 * Execute HTTP check with keyword matching
 */
export async function checkKeyword(monitor: Monitor, timeout: number): Promise<CheckResult> {
  const execution = await executeHttpRequest(monitor, timeout, { readBody: true });
  if (execution.result.state === "down") {
    return execution.result;
  }

  const criteria = monitor.spec.successCriteria?.keyword;
  if (!criteria) {
    return execution.result;
  }

  const validationError = validateKeywordBody(execution.body ?? "", criteria);
  if (validationError) {
    return downResult(execution.result.latencyMs, validationError.reason, validationError.message);
  }

  return execution.result;
}

function validateJsonBody(
  body: string,
  criteria: JsonQueryCriteria,
): { reason: string; message: string } | null {
  const data = JSON.parse(body);
  const result = queryJsonPath(data, criteria.path);
  const validation = validateJsonPathResult(result, {
    equals: criteria.equals,
    contains: criteria.contains,
    exists: criteria.exists,
    count: criteria.count,
    greaterThan: criteria.greaterThan,
    lessThan: criteria.lessThan,
  });

  return validation.valid
    ? null
    : {
        reason: "JSON_VALIDATION_FAILED",
        message: validation.message,
      };
}

/**
 * Execute HTTP check with JSON path validation (enhanced with full JSONPath support)
 */
export async function checkJsonQuery(monitor: Monitor, timeout: number): Promise<CheckResult> {
  const execution = await executeHttpRequest(monitor, timeout, { readBody: true });
  if (execution.result.state === "down") {
    return execution.result;
  }

  const criteria = monitor.spec.successCriteria?.jsonQuery;
  if (!criteria) {
    return execution.result;
  }

  try {
    const validationError = validateJsonBody(execution.body ?? "", criteria);
    return validationError
      ? downResult(execution.result.latencyMs, validationError.reason, validationError.message)
      : execution.result;
  } catch (error) {
    logger.warn({ monitor: monitor.metadata.name, error }, "JSON query failed");
    return downResult(
      execution.result.latencyMs,
      "JSON_ERROR",
      error instanceof Error ? error.message : "Invalid JSON response",
    );
  }
}

function validateXmlBody(
  body: string,
  criteria: XmlQueryCriteria,
): { reason: string; message: string } | null {
  const result = queryXPath(body, criteria.path, {
    ignoreNamespace: criteria.ignoreNamespace,
  });
  const validation = validateXPathResult(result, {
    equals: criteria.equals,
    contains: criteria.contains,
    exists: criteria.exists,
    count: criteria.count,
  });

  return validation.valid
    ? null
    : {
        reason: "XML_VALIDATION_FAILED",
        message: validation.message,
      };
}

/**
 * Execute HTTP check with XML/XPath validation
 */
export async function checkXmlQuery(monitor: Monitor, timeout: number): Promise<CheckResult> {
  const execution = await executeHttpRequest(monitor, timeout, { readBody: true });
  if (execution.result.state === "down") {
    return execution.result;
  }

  const criteria = monitor.spec.successCriteria?.xmlQuery;
  if (!criteria) {
    return execution.result;
  }

  try {
    const validationError = validateXmlBody(execution.body ?? "", criteria);
    return validationError
      ? downResult(execution.result.latencyMs, validationError.reason, validationError.message)
      : execution.result;
  } catch (error) {
    logger.warn({ monitor: monitor.metadata.name, error }, "XML query failed");
    return downResult(
      execution.result.latencyMs,
      "XML_ERROR",
      error instanceof Error ? error.message : "Invalid XML response",
    );
  }
}

function validateHtmlBody(
  body: string,
  criteria: HtmlQueryCriteria,
): { reason: string; message: string } | null {
  const result = queryCssSelector(body, criteria.selector);
  const validation = validateCssSelectorResult(result, {
    exists: criteria.exists,
    count: criteria.count,
    text: criteria.text,
    attribute: criteria.attribute,
  });

  return validation.valid
    ? null
    : {
        reason: "HTML_VALIDATION_FAILED",
        message: validation.message,
      };
}

/**
 * Execute HTTP check with HTML/CSS selector validation
 */
export async function checkHtmlQuery(monitor: Monitor, timeout: number): Promise<CheckResult> {
  const execution = await executeHttpRequest(monitor, timeout, { readBody: true });
  if (execution.result.state === "down") {
    return execution.result;
  }

  const criteria = monitor.spec.successCriteria?.htmlQuery;
  if (!criteria) {
    return execution.result;
  }

  try {
    const validationError = validateHtmlBody(execution.body ?? "", criteria);
    return validationError
      ? downResult(execution.result.latencyMs, validationError.reason, validationError.message)
      : execution.result;
  } catch (error) {
    logger.warn({ monitor: monitor.metadata.name, error }, "HTML query failed");
    return downResult(
      execution.result.latencyMs,
      "HTML_ERROR",
      error instanceof Error ? error.message : "Invalid HTML response",
    );
  }
}
