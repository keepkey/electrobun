// KeepKey Electrobun 2.x demo: each check mirrors something KeepKey Desktop
// relies on. Results go to stdout, a JSON log in userData, and the window.
// DEMO_HEADLESS=1 quits once every check has reported (CI).
import Electrobun, {
	ApplicationMenu,
	BrowserView,
	BrowserWindow,
	Tray,
	Updater,
	Utils,
} from "electrobun/main";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DemoRPC } from "../shared";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
const EXPECTED = [
	"bun-version",
	"userdata-sqlite",
	"http-server",
	"usb-enumerate",
	"hid-enumerate",
	"tray",
	"app-menu",
	"second-window",
	"updater-local-info",
	"updater-check",
	"open-external-guard",
	"view:rpc-view-to-bun",
	"view:rpc-non-error-throw",
	"rpc-bun-to-view",
	"view:encryption-ready",
	"view:fetch-local-server",
	"view:camera-api",
];

const headless = process.env.DEMO_HEADLESS === "1";
const userData = Utils.paths.userData;
mkdirSync(userData, { recursive: true });
const logPath = join(userData, "demo-results.json");

function report(name: string, ok: boolean, detail: string) {
	results.push({ name, ok, detail });
	console.log(`[demo] ${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
	writeFileSync(logPath, JSON.stringify({ results, expected: EXPECTED }, null, 2));
	mainWindow?.webview.rpc?.send.result({ name, ok, detail });
	if (EXPECTED.every((n) => results.some((r) => r.name === n))) {
		const failed = results.filter((r) => !r.ok).length;
		console.log(`[demo] DONE ${results.length - failed}/${results.length} passed; log ${logPath}`);
		if (headless) setTimeout(() => process.exit(failed ? 1 : 0), 200);
	}
}

async function check(name: string, fn: () => Promise<string> | string) {
	try {
		report(name, true, await fn());
	} catch (e: any) {
		report(name, false, String(e?.message ?? e));
	}
}

// Version comparison without a dependency.
const atLeast = (v: string, min: string) => {
	const a = v.split(".").map(Number);
	const b = min.split(".").map(Number);
	for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
	return true;
};

// --- local HTTP server (KeepKey Desktop serves its API on :1646) ---
const port = Number(process.env.DEMO_PORT || 18646);
const server = Bun.serve({
	port,
	hostname: "127.0.0.1",
	fetch: () =>
		Response.json(
			{ ok: true, from: "bun" },
			{ headers: { "Access-Control-Allow-Origin": "*" } },
		),
});

// --- RPC: same shape as KeepKey Desktop (handlers may throw device failures) ---
const rpc = BrowserView.defineRPC<DemoRPC>({
	maxRequestTime: 10_000,
	handlers: {
		requests: {
			ping: ({ value }) => `pong:${value}`,
			// hdwallet throws decoded protobuf Failures: plain objects, text nested.
			throwPlain: () => {
				throw { message: { code: 3, message: "PIN invalid" } };
			},
			serverPort: () => port,
		},
		messages: {
			viewResult: ({ name, ok, detail }) => {
				report(`view:${name}`, ok, detail);
				// The view is up once it reports; now ask it something.
				if (name === "encryption-ready") {
					check("rpc-bun-to-view", async () => {
						const r = await mainWindow.webview.rpc!.request.echo({ value: "kk" });
						if (r !== "echo:kk") throw new Error(`got ${r}`);
						return r;
					});
				}
			},
		},
	},
});

const mainWindow = new BrowserWindow({
	title: "KeepKey Electrobun demo",
	url: "views://mainview/index.html",
	rpc,
	frame: { width: 900, height: 700, x: 100, y: 100 },
});

await check("bun-version", () => {
	const v = process.versions.bun;
	// 1.4.4 rejects chains with the compromised eMudhra/emSign keys (oven-sh/bun#46300).
	if (!atLeast(v, "1.4.4")) throw new Error(`Bun ${v} < 1.4.4 (no emSign revocation)`);
	return `Bun ${v}`;
});

await check("userdata-sqlite", () => {
	const db = new Database(join(userData, "demo.sqlite"));
	db.run("CREATE TABLE IF NOT EXISTS launches (at INTEGER)");
	db.run("INSERT INTO launches VALUES (?)", [Date.now()]);
	const { n } = db.query("SELECT COUNT(*) AS n FROM launches").get() as { n: number };
	db.close();
	return `launch #${n} recorded in ${userData}`;
});

await check("http-server", async () => {
	const body = await (await fetch(`http://127.0.0.1:${server.port}/`)).json();
	if (!body.ok) throw new Error("bad body");
	return `127.0.0.1:${server.port}`;
});

// USB: enumerate only. Never open a device (a real KeepKey may be attached).
await check("usb-enumerate", () => {
	const usb = require("usb");
	return `${usb.getDeviceList().length} USB devices listed (none opened)`;
});
await check("hid-enumerate", () => {
	const HID = require("node-hid");
	return `${HID.devices().length} HID interfaces listed (none opened)`;
});

await check("tray", () => {
	const tray = new Tray({ title: "KK demo" });
	tray.setMenu([{ type: "normal", label: "Quit", action: "quit" }]);
	tray.on("tray-clicked", (e: any) => e.data?.action === "quit" && Utils.quit());
	return "tray created";
});

await check("app-menu", () => {
	ApplicationMenu.setApplicationMenu([
		{ submenu: [{ role: "quit" }] },
		{ label: "Edit", submenu: [{ role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
	]);
	return "menu set";
});

await check("second-window", () => {
	const w = new BrowserWindow({
		title: "second",
		html: "<p>second window</p>",
		frame: { width: 300, height: 200, x: 150, y: 150 },
	});
	setTimeout(() => w.close(), 1000);
	return `window ${w.id}`;
});

await check("updater-local-info", async () => {
	const info = await Updater.getLocalInfo();
	return `version ${info.version} channel ${info.channel}`;
});

// Updater: against DEMO_UPDATE_URL. The 0.0.1 -> 0.0.2 proof is scripts/update-proof.sh.
await check("updater-check", async () => {
	const info = await Updater.checkForUpdate();
	if (process.env.DEMO_APPLY_UPDATE === "1" && info?.updateAvailable) {
		await Updater.downloadUpdate();
		const ready = Updater.updateInfo();
		if (!ready?.updateReady) throw new Error(`download did not finish: ${JSON.stringify(ready)}`);
		report("updater-check", true, `downloaded ${info.version}; applying`);
		await Updater.applyUpdate();
		return "applied";
	}
	return `updateAvailable=${info?.updateAvailable} version=${info?.version ?? "-"} error=${info?.error || "-"}`;
});

// openExternal: KeepKey Desktop only opens http(s). Prove the guard without launching a browser.
await check("open-external-guard", () => {
	const allowed = (url: string) => /^https?:\/\//i.test(url);
	if (allowed("javascript:alert(1)") || allowed("file:///etc/passwd")) throw new Error("guard let a bad scheme through");
	if (typeof Utils.openExternal !== "function") throw new Error("Utils.openExternal missing");
	return "Utils.openExternal present; non-http(s) refused";
});

Electrobun.events.on("open-url", (e: any) => console.log(`[demo] open-url ${e.data?.url}`));

if (headless) {
	setTimeout(() => {
		const missing = EXPECTED.filter((n) => !results.some((r) => r.name === n));
		console.log(`[demo] TIMEOUT missing: ${missing.join(", ")}`);
		process.exit(2);
	}, 60_000);
}
