/**
 * Sample HTTP checker configurations for testing
 */

export const basicHTTPGet = {
  url: "https://api.example.com/health",
  method: "GET",
  expectedStatus: [200],
  timeout: 10000,
};

export const httpPostWithBody = {
  url: "https://api.example.com/webhook",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: '{"test": true}',
  expectedStatus: [200, 201],
  timeout: 10000,
};

export const httpsWithTLSVerification = {
  url: "https://secure.example.com",
  method: "GET",
  expectedStatus: [200],
  timeout: 5000,
  tlsSkipVerify: false,
};

export const httpsSkipTLSVerification = {
  url: "https://self-signed.example.com",
  method: "GET",
  expectedStatus: [200],
  timeout: 5000,
  tlsSkipVerify: true,
};

export const httpWithExpectedContent = {
  url: "https://example.com",
  method: "GET",
  expectedStatus: [200],
  expectedContent: "Welcome",
  timeout: 10000,
};

export const httpWithBasicAuth = {
  url: "https://api.example.com/protected",
  method: "GET",
  expectedStatus: [200],
  timeout: 10000,
  headers: {
    Authorization: "Basic dXNlcjpwYXNz",
  },
};

export const httpWithBearerToken = {
  url: "https://api.example.com/api/v1/resource",
  method: "GET",
  expectedStatus: [200],
  timeout: 10000,
  headers: {
    Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  },
};
