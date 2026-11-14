# KeepKey Electrobun 2.x demo. Needs Hutch on PATH (~/.hutch/bin).
# LOCAL_DEVKIT=1 builds against ../../package/dist (our fork's patched devkit).
PKG := $(abspath ../../package)
ifeq ($(LOCAL_DEVKIT),1)
export HUTCH_ELECTROBUN_DEVKIT_ROOT := $(PKG)/dist
export HUTCH_DEFAULT_ELECTROBUN := $(shell sed -n 's/.*"version": "\(.*\)".*/\1/p' $(PKG)/package.json | head -1)
endif

.PHONY: devkit fresh install build run headless verify-bundle update-proof
# Our devkit and upstream's share a version number, and Hutch keeps an existing
# projection as valid, so a stale one silently wins. Drop it before every build.
fresh:
	rm -r -f .hutch/devkit .hutch/devkit.lock
devkit:
	cd $(PKG) && hutch run install && hutch run build:dev
install: fresh
	hutch run install
build: install
	hutch electrobun build --env=stable
run: install
	hutch electrobun dev
headless: install
	DEMO_HEADLESS=1 hutch electrobun dev
verify-bundle:
	scripts/verify-bundle.sh "$$(find build -maxdepth 3 -name '*.app' | head -1)"
update-proof:
	scripts/update-proof.sh
