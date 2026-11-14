#!/usr/bin/env node
// Builds a release devkit for this host and packs it as
//   out/electrobun-devkit-<version>-<os>-<arch>.tar.gz (+ .sha256)
// Unpack it into an empty directory and point HUTCH_ELECTROBUN_DEVKIT_ROOT at
// that directory. See README.md.
//
// This mirrors package/scripts/package-release.js (release build, core only,
// same verifiers, cef/ left out) with two KeepKey differences:
// - On macOS, ELECTROBUN_MACOS_DEPLOYMENT_TARGET below 14.0 also lowers the
//   prebuilt helpers (zig-asar, zig-zstd, zig-bsdiff). Upstream downloads those
//   at 14.0, so they are rebuilt from their pinned upstream tags first.
// - libwebgpu_dawn.dylib stays a 14.0 prebuilt. It only ships in apps with
//   bundleWGPU, so it is checked against 14.0 instead of the lowered floor.
//
// No cross-compiling: the devkit targets the arch of the Node running this.
// HUTCH_BINARY overrides the program that runs build.ts (CI on Ubuntu 22.04
// uses plain `bun`, because Hutch's Cottontail needs glibc 2.38).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "../../package");
const outDir = resolve(process.env.DEVKIT_OUT_DIR || join(here, "out"));
const hutch = process.env.HUTCH_BINARY || "hutch";

const os = { darwin: "macos", linux: "linux", win32: "win" }[process.platform];
const arch = process.arch;
if (!os || !["x64", "arm64"].includes(arch)) {
	throw new Error(`unsupported host ${process.platform}-${arch}`);
}
const version = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).version;
const archiveName = `electrobun-devkit-${version}-${os}-${arch}.tar.gz`;

const run = (cmd, args, options = {}) => {
	console.log(`$ ${cmd} ${args.join(" ")}`);
	execFileSync(cmd, args, { stdio: "inherit", ...options });
};

const { resolveMacosDeploymentTarget } = await import(join(pkg, "scripts/macos-release.js"));
const macosTarget = resolveMacosDeploymentTarget();
const UPSTREAM_MACOS_FLOOR = "14.0";
const versionBelow = (a, b) => {
	const [am, an] = a.split(".").map(Number);
	const [bm, bn] = b.split(".").map(Number);
	return am < bm || (am === bm && an < bn);
};

// Pinned to the versions in package/src/shared/build-dependencies.ts. Tags are
// mutable, so each clone is also checked against the commit it pointed at.
const MACOS_HELPERS = [
	{
		name: "zig-asar",
		version: "0.2.8",
		commit: "3b80a870c4353b8b69fb574f4a58038b5a7f304c",
		outputs: { "zig-out/bin/zig-asar": "zig-asar", "zig-out/lib/libasar.dylib": "libasar.dylib" },
	},
	{
		name: "zig-zstd",
		version: "0.1.9",
		commit: "bc11c276480737d7d9d6be328c78af9a78d7f06a",
		outputs: { "zig-out/bin/zig-zstd": "zig-zstd" },
	},
	{
		name: "zig-bsdiff",
		version: "0.1.26",
		commit: "f8b30fa6a696da7a1886a3a23d38df2ee9323f76",
		outputs: { "zig-out/bin/bsdiff": "bsdiff", "zig-out/bin/bspatch": "bspatch" },
	},
];

function buildMacosHelpers() {
	const pins = readFileSync(join(pkg, "src/shared/build-dependencies.ts"), "utf8");
	const zigTarget = `${arch === "arm64" ? "aarch64" : "x86_64"}-macos.${macosTarget}`;
	const stamp = `${arch}-${macosTarget}`;
	let sharedZig = existsSync(join(pkg, "vendors/zig/zig")) ? join(pkg, "vendors/zig") : null;

	for (const helper of MACOS_HELPERS) {
		if (!pins.includes(`"${helper.name}": "${helper.version}"`)) {
			throw new Error(`${helper.name} ${helper.version} is no longer the pinned version in build-dependencies.ts; update MACOS_HELPERS`);
		}
		const vendorDir = join(pkg, "vendors", helper.name);
		const stampFile = join(vendorDir, ".keepkey-macos-target");
		const buildKey = `${helper.version}-macos-${arch}`;
		const current =
			existsSync(stampFile) &&
			readFileSync(stampFile, "utf8").trim() === stamp &&
			existsSync(join(vendorDir, ".version")) &&
			readFileSync(join(vendorDir, ".version"), "utf8").trim() === buildKey &&
			Object.values(helper.outputs).every((file) => existsSync(join(vendorDir, file)));
		if (current) {
			console.log(`${helper.name} ${helper.version} already built for macOS ${stamp}`);
			continue;
		}

		const src = join(here, "deps", helper.name);
		rmSync(src, { recursive: true, force: true });
		run("git", [
			"clone", "--quiet", "--depth", "1", "--branch", `v${helper.version}`,
			"--recurse-submodules", "--shallow-submodules",
			`https://github.com/blackboardsh/${helper.name}.git`, src,
		]);
		const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: src, encoding: "utf8" }).trim();
		if (head !== helper.commit) {
			throw new Error(`${helper.name} v${helper.version} is ${head}, expected ${helper.commit}`);
		}

		// All three pin Zig 0.17.0; their setup.js keeps an existing vendored copy.
		if (sharedZig) {
			mkdirSync(join(src, "vendors"), { recursive: true });
			symlinkSync(sharedZig, join(src, "vendors/zig"));
		}
		run("node", ["scripts/setup.js", `--target=${zigTarget}`], { cwd: src });
		sharedZig ??= join(src, "vendors/zig");
		run(join(src, "vendors/zig/zig"), [
			"build", "-Doptimize=ReleaseFast", "-Dcpu=baseline", `-Dtarget=${zigTarget}`,
		], { cwd: src });

		if (helper.name === "zig-asar") {
			// Same re-link as upstream's release: Zig's Mach-O linker exports
			// ___dso_handle, which breaks Apple-ld links against libasar.dylib.
			run("xcrun", [
				"clang", "-dynamiclib", "-arch", arch === "arm64" ? "arm64" : "x86_64",
				`-mmacosx-version-min=${macosTarget}`,
				"-o", "zig-out/lib/libasar.dylib",
				"-Wl,-force_load,zig-out/lib/libasar-static.a",
				"-exported_symbols_list", "scripts/asar-exported-symbols.txt",
				"-Wl,-headerpad,0x1000",
				"-install_name", "@rpath/libasar.dylib",
			], { cwd: src });
		}

		rmSync(vendorDir, { recursive: true, force: true });
		mkdirSync(vendorDir, { recursive: true });
		for (const [from, to] of Object.entries(helper.outputs)) {
			copyFileSync(join(src, from), join(vendorDir, to));
			chmodSync(join(vendorDir, to), 0o755);
		}
		// build.ts reuses vendors whose .version matches instead of downloading.
		writeFileSync(join(vendorDir, ".version"), buildKey);
		writeFileSync(stampFile, `${stamp}\n`);
	}
}

if (os === "macos" && versionBelow(macosTarget, UPSTREAM_MACOS_FLOOR)) buildMacosHelpers();

run(hutch, ["build.ts", "--release", "--core-only", `--arch=${arch}`], { cwd: pkg });

const dist = join(pkg, "dist");
const entries = readdirSync(dist).filter((entry) => entry !== "cef").sort();

if (os === "macos") {
	const { verifyMachORelease } = await import(join(pkg, "scripts/verify-macho-deployment-target.js"));
	const { verifyMachOCodeSigningCapacity } = await import(join(pkg, "scripts/verify-macho-code-signing.js"));
	const dawn = "libwebgpu_dawn.dylib";
	const report = (verified) => {
		for (const { path, inspections } of verified) {
			const slices = inspections.map((s) => `${s.architecture} ${s.deploymentTarget.major}.${s.deploymentTarget.minor}`);
			console.log(`  ${path.slice(dist.length + 1)}: ${slices.join(", ")}`);
		}
	};
	console.log(`Mach-O floor ${macosTarget}:`);
	report(verifyMachORelease(entries.filter((e) => e !== dawn).map((e) => join(dist, e)), macosTarget, arch));
	if (entries.includes(dawn)) {
		console.log(`Known exception, prebuilt Dawn (bundleWGPU apps only), floor ${UPSTREAM_MACOS_FLOOR}:`);
		report(verifyMachORelease([join(dist, dawn)], UPSTREAM_MACOS_FLOOR, arch));
	}
	for (const file of ["launcher", "extractor", "libasar.dylib", "libElectrobunCore.dylib"]) {
		verifyMachOCodeSigningCapacity(join(dist, file));
	}
}
if (os === "linux") {
	run(process.execPath, [join(pkg, "scripts/verify-linux-elf-abi.js"), dist]);
}
if (os === "win") {
	const { validateWindowsReleaseArchitecture } = await import(join(pkg, "scripts/windows-binary-architecture.mjs"));
	if (validateWindowsReleaseArchitecture(dist, arch) === 0) throw new Error("devkit contains no PE binaries");
}

const { validateNativeDevkitManifest } = await import(join(pkg, "scripts/validate-native-devkit.mjs"));
const { parseAppCottontailVersion } = await import(join(pkg, "scripts/verify-release-toolchain.mjs"));
validateNativeDevkitManifest({
	coreRoot: dist,
	expectedVersion: version,
	expectedTarget: { os, arch },
	expectedAppCottontailVersion: parseAppCottontailVersion(
		readFileSync(join(pkg, "src/shared/cottontail-version.ts"), "utf8"),
	),
});

mkdirSync(outDir, { recursive: true });
const archive = join(outDir, archiveName);
rmSync(archive, { force: true });
rmSync(`${archive}.sha256`, { force: true });
const { systemTarBinary } = await import(join(pkg, "scripts/windows-tar.mjs"));
// COPYFILE_DISABLE keeps macOS tar from adding ._ AppleDouble entries.
run(systemTarBinary(), ["-czf", archive, ...entries], {
	cwd: dist,
	env: { ...process.env, COPYFILE_DISABLE: "1" },
});
const sha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
writeFileSync(`${archive}.sha256`, `${sha256}  ${archiveName}\n`);
console.log(`\n${archive}\nsha256 ${sha256}`);
