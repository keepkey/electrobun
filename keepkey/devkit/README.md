# KeepKey Electrobun devkit

The devkit is the native half of Electrobun that Hutch packs into an app
(launcher, extractor, core and native-wrapper libraries, helpers, preloads,
SDKs). KeepKey Desktop builds against our fork's devkit, version
`2.0.6-keepkey.1`, not upstream's.

## Build one (this host only)

```sh
make -C keepkey/devkit devkit       # needs Node and Hutch (~/.hutch/bin) on PATH
```

Output, in `keepkey/devkit/out/`:

- `electrobun-devkit-<version>-<os>-<arch>.tar.gz`, where os is `macos`, `linux` or `win` and arch is `arm64` or `x64`
- the same name plus `.sha256`, in `shasum -a 256 -c` format

The Makefile sets `ELECTROBUN_MACOS_DEPLOYMENT_TARGET=13.0` by default (KeepKey
Desktop supports macOS 13); override it on the command line if needed.
`build-devkit.mjs` does what `package/scripts/package-release.js` does: a
release build (`build.ts --release --core-only`), the same verifiers, and the
same archive contents with `cef/` left out. It adds two things:

- **macOS floor below 14.0.** Upstream downloads zig-asar, zig-zstd and
  zig-bsdiff prebuilt at 14.0, so the script rebuilds them first from their
  pinned upstream tags (commit-checked) at the requested floor and places them in
  `package/vendors/`. Every Mach-O is then checked against the floor.
- **One known exception: `libwebgpu_dawn.dylib` stays at 14.0.** It is a prebuilt
  Dawn and only ships in apps with `bundleWGPU: true`. KeepKey Desktop does not
  set it (its bundle has no Dawn), so Dawn is checked against 14.0 instead.

There is no cross-compiling: each devkit is built on its own platform.
`HUTCH_BINARY=bun` runs `build.ts` on plain Bun where Hutch cannot run (Ubuntu
22.04: Cottontail needs glibc 2.38).

## Use one

Unpack into an empty directory and point Hutch at it:

```sh
shasum -a 256 -c electrobun-devkit-2.0.6-keepkey.1-macos-arm64.tar.gz.sha256
mkdir devkit && tar -xzf electrobun-devkit-2.0.6-keepkey.1-macos-arm64.tar.gz -C devkit
export HUTCH_ELECTROBUN_DEVKIT_ROOT="$PWD/devkit"
```

`native-devkit.json` in the archive root names the version and target. Check
both before use.

## CI: `.github/workflows/keepkey-devkit.yml`

Manual (`workflow_dispatch`) only. It builds four devkits and keeps them as
**workflow artifacts only**: no release, no tag, no secrets, no signing.

| Artifact | Runner | Floor |
|---|---|---|
| `electrobun-devkit-macos-arm64` | macos-14 | macOS 13.0 (Dawn 14.0) |
| `electrobun-devkit-macos-x64` | macos-15-intel | macOS 13.0 (Dawn 14.0) |
| `electrobun-devkit-linux-x64` | ubuntu-22.04 | glibc of 22.04 (prebuilt Dawn is higher) |
| `electrobun-devkit-win-x64` | windows-latest | n/a |

Intel runs on `macos-15-intel` because Electrobun 2.x needs a macOS 14+ host and
`macos-13` runners are retired (the demo workflow's macos-13 job never started).

## Publishing (owner-approved, manual, later)

Devkits are build inputs, so they go on **keepkey/electrobun**, never on
keepkey/keepkey-vault. Do not use a `v*` tag: `release.yml` runs on `v*` tags
and holds upstream's signing and npm steps. After the owner approves a
specific workflow run:

```sh
RUN_ID=<run id of the approved keepkey-devkit run>
TAG=devkit-2.0.6-keepkey.1
mkdir devkit-release
gh run download "$RUN_ID" --repo keepkey/electrobun --dir devkit-release
cd devkit-release && mv */* . && rmdir */ 2>/dev/null
shasum -a 256 -c *.sha256
gh release create "$TAG" --repo keepkey/electrobun --target keepkey/2.x \
  --prerelease --title "KeepKey Electrobun devkit 2.0.6-keepkey.1" \
  --notes "Devkits for KeepKey Desktop builds. From keepkey-devkit run $RUN_ID." \
  electrobun-devkit-2.0.6-keepkey.1-*.tar.gz electrobun-devkit-2.0.6-keepkey.1-*.tar.gz.sha256
```

Consumers pin each archive's sha256 in their own repo, not the `.sha256` file
that sits next to it in the release.

## Evidence: macOS arm64, built locally 2026-11-13

Built from `keepkey/2.x` (d033ce2c plus this tooling) on an Apple Silicon Mac
with `make -C keepkey/devkit devkit` (Hutch 0.29.0, Xcode SDK 26.4).

```
electrobun-devkit-2.0.6-keepkey.1-macos-arm64.tar.gz  6,806,377 bytes
sha256 f5cfc5fee6f857ff69e47080f6b7fac512e7a3d104f09e1e909418a896163998
```

`otool -l` on every Mach-O in the unpacked archive (LC_BUILD_VERSION):

```
bsdiff                   arm64  minos 13.0
bspatch                  arm64  minos 13.0
extractor                arm64  minos 13.0
launcher                 arm64  minos 13.0   257,224 bytes (release; the debug build is ~2.5 MB)
libasar.dylib            arm64  minos 13.0   @rpath/libasar.dylib, no ___dso_handle export
libElectrobunCore.dylib  arm64  minos 13.0
libElectrobunUI.dylib    arm64  minos 13.0
libNativeWrapper.dylib   arm64  minos 13.0
process_helper           arm64  minos 13.0
zig-asar                 arm64  minos 13.0
zig-zstd                 arm64  minos 13.0
libwebgpu_dawn.dylib     arm64  minos 14.0   known exception (bundleWGPU only)
```

`native-devkit.json`: product electrobun `2.0.6-keepkey.1`, target macos/arm64.

The floor shows what the binaries declare. It does not prove they run on macOS
13: no 13.0 devkit build has been launched on a macOS 13 machine yet.
