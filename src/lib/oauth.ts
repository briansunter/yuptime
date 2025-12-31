/**
 * OAuth2 Client Credentials Flow
 * Fetches access tokens using the OAuth2 client credentials grant type.
 */

import { logger } from "./logger";

/**
 * OAuth2 configuration from Monitor spec
 */
export interface OAuth2Config {
  tokenUrl: string;
  scopes?: string[];
}

/**
 * OAuth2 token response
 */
interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

/**
 * Fetch an OAuth2 access token using client credentials flow.
 * Credentials are read from environment variables injected by the Job.
 *
 * Environment variables:
 * - YUPTIME_AUTH_OAUTH_CLIENT_ID: OAuth2 client ID
 * - YUPTIME_AUTH_OAUTH_CLIENT_SECRET: OAuth2 client secret
 */
export async function fetchOAuth2Token(config: OAuth2Config, timeout: number): Promise<string> {
  const clientId = process.env.YUPTIME_AUTH_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YUPTIME_AUTH_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "OAuth2 credentials not found in environment (YUPTIME_AUTH_OAUTH_CLIENT_ID, YUPTIME_AUTH_OAUTH_CLIENT_SECRET)",
    );
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        ...(config.scopes?.length ? { scope: config.scopes.join(" ") } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `OAuth2 token request failed: ${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`,
      );
    }

    const data = (await response.json()) as TokenResponse;

    if (!data.access_token) {
      throw new Error("OAuth2 response missing access_token");
    }

    logger.debug(
      {
        tokenUrl: config.tokenUrl,
        expiresIn: data.expires_in,
        tokenType: data.token_type,
      },
      "OAuth2 token fetched successfully",
    );

    return data.access_token;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OAuth2 token request timed out after ${timeout}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
