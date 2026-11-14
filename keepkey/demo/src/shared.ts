import type { RPCSchema } from "electrobun/main";

export type DemoRPC = {
	bun: RPCSchema<{
		requests: {
			ping: { params: { value: string }; response: string };
			throwPlain: { params: {}; response: never };
			serverPort: { params: {}; response: number };
		};
		messages: {
			viewResult: { name: string; ok: boolean; detail: string };
		};
	}>;
	webview: RPCSchema<{
		requests: {
			echo: { params: { value: string }; response: string };
		};
		messages: {
			result: { name: string; ok: boolean; detail: string };
		};
	}>;
};
