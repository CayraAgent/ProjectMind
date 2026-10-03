import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const stableVersion = /^\d+\.\d+\.\d+$/;
const previewVersion = /^\d+\.\d+\.\d+-dev\.\d+$/;
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

export function assessReleaseReadiness(manifest, expectedName, channel = "stable") {
  const blockers = [];
  const requireValue = (condition, code, message) => {
    if (!condition) blockers.push({ code, message });
  };

  requireValue(typeof expectedName === "string" && packageName.test(expectedName), "EXPECTED_NAME_REQUIRED", "Pass a confirmed npm distribution name with --name or PROJECTMIND_NPM_NAME.");
  if (typeof expectedName === "string" && packageName.test(expectedName)) {
    requireValue(manifest.name === expectedName, "NAME_MISMATCH", `package.json name '${manifest.name ?? ""}' does not match confirmed name '${expectedName}'.`);
  }
  requireValue(channel === "stable" || channel === "preview", "CHANNEL_INVALID", "Release channel must be stable or preview.");
  if (channel === "preview") {
    requireValue(previewVersion.test(manifest.version ?? ""), "VERSION_NOT_PREVIEW", "Preview version must use x.y.z-dev.N.");
    requireValue(manifest.publishConfig?.tag === "next", "PREVIEW_TAG_REQUIRED", "Preview publication must use the next dist-tag.");
  } else {
    requireValue(stableVersion.test(manifest.version ?? ""), "VERSION_NOT_STABLE", "package.json version must be a stable x.y.z version.");
  }
  requireValue(manifest.private === false, "PACKAGE_PRIVATE", "package.json private must be false before publication.");
  requireValue(typeof manifest.description === "string" && manifest.description.trim().length >= 20, "DESCRIPTION_MISSING", "Package description must be present.");
  requireValue(Array.isArray(manifest.keywords) && manifest.keywords.length >= 3, "KEYWORDS_MISSING", "At least three package keywords are required.");
  requireValue(typeof manifest.homepage === "string" && manifest.homepage.startsWith("https://"), "HOMEPAGE_MISSING", "An HTTPS homepage is required.");
  requireValue(typeof manifest.bugs?.url === "string" && manifest.bugs.url.startsWith("https://"), "BUGS_URL_MISSING", "An HTTPS issue tracker URL is required.");
  requireValue(manifest.license === "Apache-2.0", "LICENSE_MISMATCH", "The npm manifest license must remain Apache-2.0.");
  requireValue(typeof manifest.bin?.projectmind === "string", "CLI_MISSING", "The projectmind executable must be exported.");
  requireValue(Array.isArray(manifest.files) && manifest.files.includes("dist/apps") && manifest.files.includes("dist/packages"), "FILES_INCOMPLETE", "Published files must include built apps and packages.");
  requireValue(manifest.publishConfig?.provenance === true, "PROVENANCE_DISABLED", "npm provenance must be enabled for publication.");
  requireValue(manifest.publishConfig?.access === "public", "PUBLIC_ACCESS_REQUIRED", "Publication must explicitly use public access.");

  return { ready: blockers.length === 0, blockers };
}

async function main() {
  const args = process.argv.slice(2);
  const nameIndex = args.indexOf("--name");
  const channelIndex = args.indexOf("--channel");
  const expectedName = nameIndex >= 0 ? args[nameIndex + 1] : process.env.PROJECTMIND_NPM_NAME;
  const channel = channelIndex >= 0 ? args[channelIndex + 1] : "stable";
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const report = assessReleaseReadiness(manifest, expectedName, channel);

  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else if (report.ready) console.log(`READY: ${manifest.name}@${manifest.version} can enter the ${channel} publication workflow.`);
  else {
    console.error(`NOT_READY: ${channel} npm publication remains blocked.`);
    for (const blocker of report.blockers) console.error(`- ${blocker.code}: ${blocker.message}`);
  }
  process.exitCode = report.ready ? 0 : 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
