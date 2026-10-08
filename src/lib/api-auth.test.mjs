import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCaller } from "./api-auth.ts";

test("session user is accepted", () => {
  assert.deepEqual(resolveCaller("u1", null, "s3cret"), { kind: "user", userId: "u1" });
});

test("no session and no bearer is rejected", () => {
  assert.equal(resolveCaller(null, null, "s3cret"), null);
  assert.equal(resolveCaller(undefined, undefined, undefined), null);
});

test("valid cron bearer is accepted", () => {
  assert.deepEqual(resolveCaller(null, "Bearer s3cret", "s3cret"), { kind: "cron" });
});

test("wrong or malformed bearer is rejected", () => {
  assert.equal(resolveCaller(null, "Bearer nope", "s3cret"), null);
  assert.equal(resolveCaller(null, "s3cret", "s3cret"), null);
  assert.equal(resolveCaller(null, "Bearer s3cret ", "s3cret"), null);
});

test("unset or empty secret never matches", () => {
  assert.equal(resolveCaller(null, "Bearer undefined", undefined), null);
  assert.equal(resolveCaller(null, "Bearer ", ""), null);
});

test("bearer is ignored when cron is not allowed", () => {
  assert.equal(resolveCaller(null, "Bearer s3cret", "s3cret", false), null);
  assert.deepEqual(resolveCaller("u1", null, "s3cret", false), { kind: "user", userId: "u1" });
});
