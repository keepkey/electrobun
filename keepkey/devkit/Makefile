# KeepKey release devkit for this host (see README.md). Needs Node, plus Hutch
# on PATH (~/.hutch/bin) unless HUTCH_BINARY names another runner for build.ts.
# KeepKey Desktop supports macOS 13, so that is the default floor here.
PKG := $(abspath ../../package)
export ELECTROBUN_MACOS_DEPLOYMENT_TARGET ?= 13.0

.PHONY: devkit clean
devkit:
	cd $(PKG) && npm ci
	node build-devkit.mjs
clean:
	rm -r -f out deps
