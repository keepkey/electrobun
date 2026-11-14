import { afterEach, describe, expect, test } from "bun:test";
import { initEncryption } from "./encryption";

const realWindow = (globalThis as any).window;

function installWindow(subtle: SubtleCrypto | undefined) {
	const cryptoStub = {
		subtle,
		getRandomValues: (array: Uint8Array) => crypto.getRandomValues(array),
	};
	const target: any = {
		__electrobunSecretKeyBytes: Array.from(crypto.getRandomValues(new Uint8Array(32))),
		crypto: cryptoStub,
	};
	(globalThis as any).window = target;
	return { target, cryptoStub };
}

afterEach(() => {
	(globalThis as any).window = realWindow;
});

describe("initEncryption", () => {
	test("waits for crypto.subtle when the preload runs before it exists", async () => {
		const { target, cryptoStub } = installWindow(undefined);
		setTimeout(() => {
			cryptoStub.subtle = crypto.subtle;
		}, 5);

		await initEncryption({ retryDelayMs: 1 });

		const sealed = await target.__electrobun_encrypt("hello");
		expect(
			await target.__electrobun_decrypt(sealed.encryptedData, sealed.iv, sealed.tag),
		).toBe("hello");
	});

	test("gives up with a clear error when crypto.subtle never appears", async () => {
		const { target } = installWindow(undefined);
		await expect(
			initEncryption({ retryDelayMs: 1, maxAttempts: 3 }),
		).rejects.toThrow("crypto.subtle unavailable after 3 attempts");
		expect(target.__electrobun_encrypt).toBeUndefined();
	});
});
