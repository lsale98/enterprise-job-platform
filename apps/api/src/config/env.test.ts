import assert from "node:assert/strict";
import { test } from "node:test";

import { loadConfig } from "./env.js";

const testDatabaseUrl = "postgresql://test:test@localhost:5432/test";

const validEnv = {
  DATABASE_URL: testDatabaseUrl,
  AUTH_KEYCLOAK_ISSUER: "https://auth.example.test/realms/test",
  AUTH_API_AUDIENCE: "enterprise-job-platform-api",
};

test("loads default application configuration", () => {
  const config = loadConfig(validEnv);

  assert.equal(config.APP_ENV, "development");
  assert.equal(config.NODE_ENV, "development");
  assert.equal(config.HOST, "127.0.0.1");
  assert.equal(config.PORT, 3001);
  assert.equal(config.LOG_LEVEL, "info");
  assert.equal(config.DATABASE_URL, testDatabaseUrl);
  assert.equal(config.AUTH_KEYCLOAK_ISSUER, validEnv.AUTH_KEYCLOAK_ISSUER);
  assert.equal(config.AUTH_API_AUDIENCE, validEnv.AUTH_API_AUDIENCE);
});

test("accepts staging configuration", () => {
  const config = loadConfig({
    ...validEnv,
    APP_ENV: "staging",
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: "8080",
    LOG_LEVEL: "warn",
  });

  assert.equal(config.APP_ENV, "staging");
  assert.equal(config.NODE_ENV, "production");
  assert.equal(config.HOST, "0.0.0.0");
  assert.equal(config.PORT, 8080);
  assert.equal(config.LOG_LEVEL, "warn");
});

test("rejects unsupported application environments", () => {
  assert.throws(() =>
    loadConfig({
      ...validEnv,
      APP_ENV: "testing",
    }),
  );
});

test("rejects invalid ports", () => {
  assert.throws(() =>
    loadConfig({
      ...validEnv,
      PORT: "0",
    }),
  );

  assert.throws(() =>
    loadConfig({
      ...validEnv,
      PORT: "70000",
    }),
  );

  assert.throws(() =>
    loadConfig({
      ...validEnv,
      PORT: "invalid",
    }),
  );
});

test("rejects unsupported log levels", () => {
  assert.throws(() =>
    loadConfig({
      ...validEnv,
      LOG_LEVEL: "verbose",
    }),
  );
});

test("rejects missing database configuration", () => {
  const env = {
    AUTH_KEYCLOAK_ISSUER: validEnv.AUTH_KEYCLOAK_ISSUER,
    AUTH_API_AUDIENCE: validEnv.AUTH_API_AUDIENCE,
  };

  assert.throws(() => loadConfig(env));
});

test("rejects missing Keycloak issuer", () => {
  const env = {
    DATABASE_URL: validEnv.DATABASE_URL,
    AUTH_API_AUDIENCE: validEnv.AUTH_API_AUDIENCE,
  };

  assert.throws(() => loadConfig(env));
});

test("rejects missing Keycloak audience", () => {
  const env = {
    DATABASE_URL: validEnv.DATABASE_URL,
    AUTH_KEYCLOAK_ISSUER: validEnv.AUTH_KEYCLOAK_ISSUER,
  };

  assert.throws(() => loadConfig(env));
});

test("rejects invalid Keycloak issuer URL", () => {
  assert.throws(() =>
    loadConfig({
      ...validEnv,
      AUTH_KEYCLOAK_ISSUER: "invalid-url",
    }),
  );
});
