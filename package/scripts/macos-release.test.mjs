import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMacosDeploymentTarget } from "./macos-release.js";

test("defaults to macOS 14.0", () => {
	assert.equal(resolveMacosDeploymentTarget(undefined), "14.0");
	assert.equal(resolveMacosDeploymentTarget(""), "14.0");
});

test("accepts a lower floor", () => {
	assert.equal(resolveMacosDeploymentTarget("13.0"), "13.0");
});

test("rejects values that are not a macOS version", () => {
	assert.throws(() => resolveMacosDeploymentTarget("13"));
	assert.throws(() => resolveMacosDeploymentTarget("13.0; rm"));
});
