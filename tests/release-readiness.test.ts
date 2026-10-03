import test from "node:test";
import assert from "node:assert/strict";
import { assessReleaseReadiness } from "../scripts/release-readiness.mjs";
import { PROJECTMIND_VERSION } from "../packages/core/src/index.ts";
import packageManifest from "../package.json" with { type: "json" };

const readyManifest = {
  name: "@example/projectmind",
  version: "0.1.0",
  private: false,
  description: "Local-first evidence verification for coding agents.",
  keywords: ["verification", "agents", "evidence"],
  homepage: "https://github.com/CayraAgent/ProjectMind#readme",
  bugs: { url: "https://github.com/CayraAgent/ProjectMind/issues" },
  license: "Apache-2.0",
  bin: { projectmind: "dist/apps/cli/src/index.js" },
  files: ["dist/apps", "dist/packages"],
  publishConfig: { access: "public", provenance: true, tag: "latest" },
};

test("release readiness accepts a confirmed, publishable stable manifest", () => {
  assert.deepEqual(assessReleaseReadiness(readyManifest, "@example/projectmind"), { ready: true, blockers: [] });
});

test("runtime and package versions cannot drift", () => {
  assert.equal(PROJECTMIND_VERSION, packageManifest.version);
});

test("development manifest cannot accidentally pass the stable release gate", () => {
  const report = assessReleaseReadiness({ ...readyManifest, version: "0.1.0-dev", private: true }, undefined);
  assert.equal(report.ready, false);
  assert.deepEqual(report.blockers.map((blocker) => blocker.code), ["EXPECTED_NAME_REQUIRED", "VERSION_NOT_STABLE", "PACKAGE_PRIVATE"]);
});

test("preview readiness requires an explicit dev sequence and next tag", () => {
  const preview = { ...readyManifest, name: "@callabens/projectmind", version: "0.1.0-dev.1", publishConfig: { ...readyManifest.publishConfig, tag: "next" } };
  assert.deepEqual(assessReleaseReadiness(preview, "@callabens/projectmind", "preview"), { ready: true, blockers: [] });
  const blocked = assessReleaseReadiness({ ...preview, version: "0.1.0-beta.1", publishConfig: { ...preview.publishConfig, tag: "latest" } }, "@callabens/projectmind", "preview");
  assert.deepEqual(blocked.blockers.map((item) => item.code), ["VERSION_NOT_PREVIEW", "PREVIEW_TAG_REQUIRED"]);
});

test("confirmed distribution name must match package metadata", () => {
  const report = assessReleaseReadiness(readyManifest, "projectmind-cli");
  assert.equal(report.ready, false);
  assert.equal(report.blockers[0]?.code, "NAME_MISMATCH");
});

test("release metadata and provenance are required", () => {
  const manifest = { ...readyManifest, description: "", keywords: [], homepage: "", bugs: {}, publishConfig: {} };
  const report = assessReleaseReadiness(manifest, manifest.name);
  assert.equal(report.ready, false);
  assert.deepEqual(report.blockers.map((blocker) => blocker.code), [
    "DESCRIPTION_MISSING",
    "KEYWORDS_MISSING",
    "HOMEPAGE_MISSING",
    "BUGS_URL_MISSING",
    "PROVENANCE_DISABLED",
    "PUBLIC_ACCESS_REQUIRED",
  ]);
});
