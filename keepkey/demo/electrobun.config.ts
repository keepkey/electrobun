import type { ElectrobunConfig } from "electrobun";

// DEMO_VERSION lets CI build 0.0.1 and 0.0.2 from one tree for the updater check.
// DEMO_UPDATE_URL points the updater at a local file server.
const version = process.env.DEMO_VERSION || "0.0.1";

export default {
	app: {
		name: "keepkey-electrobun-demo",
		identifier: "com.keepkey.electrobun-demo",
		version,
		urlSchemes: ["keepkey-demo"],
	},
	build: {
		mainProcess: "bun",
		bun: {
			entrypoint: "src/bun/index.ts",
			// Native addons stay external, as in KeepKey Desktop.
			external: ["node-hid", "usb"],
		},
		views: {
			mainview: { entrypoint: "src/mainview/index.ts" },
		},
		copy: {
			"src/mainview/index.html": "views/mainview/index.html",
			"node_modules/usb": "node_modules/usb",
			"node_modules/node-hid": "node_modules/node-hid",
			"node_modules/node-gyp-build": "node_modules/node-gyp-build",
			"node_modules/pkg-prebuilds": "node_modules/pkg-prebuilds",
			"node_modules/node-addon-api": "node_modules/node-addon-api",
		},
		mac: {
			bundleCEF: false,
			// Same entitlements as KeepKey Desktop (camera = QR scanning).
			entitlements: {
				"com.apple.security.cs.allow-jit": true,
				"com.apple.security.cs.allow-unsigned-executable-memory": true,
				"com.apple.security.cs.disable-library-validation": true,
				"com.apple.security.cs.allow-dyld-environment-variables": true,
				"com.apple.security.device.camera": true,
			},
		},
		linux: { bundleCEF: false },
		win: { bundleCEF: false },
	},
	release: {
		baseUrl: process.env.DEMO_UPDATE_URL || "http://127.0.0.1:18647",
	},
} satisfies ElectrobunConfig;
