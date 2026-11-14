// Apps that still support older macOS can lower the floor for their own
// devkit build, e.g. ELECTROBUN_MACOS_DEPLOYMENT_TARGET=13.0. Native code
// guards newer APIs with @available, and verify-macho-deployment-target
// checks every shipped binary against this value.
export function resolveMacosDeploymentTarget(value = process.env.ELECTROBUN_MACOS_DEPLOYMENT_TARGET) {
	if (value === undefined || value === "") return "14.0";
	if (!/^1[1-9]\.[0-9]$/.test(value)) {
		throw new Error(`ELECTROBUN_MACOS_DEPLOYMENT_TARGET must look like 13.0, got ${JSON.stringify(value)}`);
	}
	return value;
}

export const MACOS_DEPLOYMENT_TARGET = resolveMacosDeploymentTarget();

export function macosNativeArchitecture(arch) {
	if (arch === "arm64") return "arm64";
	if (arch === "x64") return "x86_64";
	throw new Error(`Unsupported macOS architecture: ${arch}`);
}

export function macosZigTarget(arch) {
	if (arch === "arm64") return `aarch64-macos.${MACOS_DEPLOYMENT_TARGET}`;
	if (arch === "x64") return `x86_64-macos.${MACOS_DEPLOYMENT_TARGET}`;
	throw new Error(`Unsupported macOS architecture: ${arch}`);
}
