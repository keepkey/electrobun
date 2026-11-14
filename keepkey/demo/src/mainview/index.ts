import Electrobun, { Electroview } from "electrobun/view";
import type { DemoRPC } from "../shared";

const list = document.getElementById("results")!;
function show(name: string, ok: boolean, detail: string) {
	const li = document.createElement("li");
	li.className = ok ? "PASS" : "FAIL";
	li.textContent = `${ok ? "PASS" : "FAIL"} ${name}: ${detail}`;
	list.appendChild(li);
}

const rpc = Electroview.defineRPC<DemoRPC>({
	maxRequestTime: 10_000,
	handlers: {
		requests: {
			echo: ({ value }) => `echo:${value}`,
		},
		messages: {
			result: ({ name, ok, detail }) => show(name, ok, detail),
		},
	},
});
const electrobun = new Electrobun.Electroview({ rpc });

async function check(name: string, fn: () => Promise<string>) {
	let ok = true;
	let detail: string;
	try {
		detail = await fn();
	} catch (e: any) {
		ok = false;
		detail = String(e?.message ?? e);
	}
	electrobun.rpc!.send.viewResult({ name, ok, detail });
}

await check("encryption-ready", async () => {
	if (typeof (window as any).__electrobun_encrypt !== "function") throw new Error("encrypt hook missing");
	return "encrypt/decrypt hooks installed";
});

await check("rpc-view-to-bun", async () => {
	const r = await electrobun.rpc!.request.ping({ value: "kk" });
	if (r !== "pong:kk") throw new Error(`got ${r}`);
	return r;
});

// The P4 bug: a non-Error throw used to send no response (request hung to timeout).
await check("rpc-non-error-throw", async () => {
	const started = performance.now();
	try {
		await electrobun.rpc!.request.throwPlain({});
	} catch (e: any) {
		const ms = Math.round(performance.now() - started);
		if (!String(e?.message).includes("PIN invalid")) throw new Error(`wrong text after ${ms}ms: ${e?.message}`);
		return `rejected with "${e.message}" in ${ms}ms`;
	}
	throw new Error("resolved instead of rejecting");
});

await check("fetch-local-server", async () => {
	const port = await electrobun.rpc!.request.serverPort({});
	const body = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
	if (!body.ok) throw new Error(JSON.stringify(body));
	return `webview fetched 127.0.0.1:${port}`;
});

// Camera: only the API surface. getUserMedia would prompt; the entitlement and
// usage string are verified on the built bundle by scripts/verify-bundle.sh.
await check("camera-api", async () => {
	if (typeof navigator.mediaDevices?.getUserMedia !== "function") throw new Error("getUserMedia missing");
	return "navigator.mediaDevices.getUserMedia present";
});
