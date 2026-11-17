// Workaround for a WebKit (Safari 27.x) WebAssembly bug.
//
// The Kotlin/Wasm module imports Skiko's wasm exports directly (wasm -> wasm calls through the
// "./skiko.mjs" import module). In Safari, f32 arguments of such direct cross-module calls arrive
// corrupted on https origins: font sizes/line heights and rectangle coordinates become 0, so the
// Skia canvas stays white although composition, layout and GL context work fine.
// Routing those imports through plain JavaScript functions (wasm -> JS -> wasm) makes WebKit
// convert the arguments correctly. Chromium/Firefox are unaffected, so the shim only runs on WebKit.
//
// This script must be loaded (deferred) before app.js so the patch is in place when the Kotlin
// loader instantiates the modules.
(function () {
    var SKIKO_IMPORT_MODULE_PREFIX = "./skiko";

    function isWebKitBrowser() {
        var ua = navigator.userAgent;
        return /AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);
    }

    function wrapSkikoImports(imports) {
        if (!imports || typeof imports !== "object") return imports;
        var patched = {};
        Object.keys(imports).forEach(function (moduleName) {
            var module = imports[moduleName];
            if (!module || typeof module !== "object" || moduleName.indexOf(SKIKO_IMPORT_MODULE_PREFIX) !== 0) {
                patched[moduleName] = module;
                return;
            }
            var wrappedModule = {};
            Object.keys(module).forEach(function (name) {
                var value = module[name];
                wrappedModule[name] = typeof value === "function"
                    ? function () { return value.apply(this, arguments); }
                    : value;
            });
            patched[moduleName] = wrappedModule;
        });
        return patched;
    }

    if (typeof WebAssembly === "object" && isWebKitBrowser()) {
        var originalInstantiate = WebAssembly.instantiate;
        var originalInstantiateStreaming = WebAssembly.instantiateStreaming;
        WebAssembly.instantiate = function (source, imports, options) {
            return originalInstantiate.call(WebAssembly, source, wrapSkikoImports(imports), options);
        };
        if (typeof originalInstantiateStreaming === "function") {
            WebAssembly.instantiateStreaming = function (source, imports, options) {
                return originalInstantiateStreaming.call(WebAssembly, source, wrapSkikoImports(imports), options);
            };
        }
    }
})();

(function () {
    var APP_CRASHED_CLASS = "app-crashed";

    // Technical error detail shown below the localized failure message (not translated on purpose).
    function describeError(event) {
        if (!event) return "";
        var err = event.reason !== undefined ? event.reason : event.error;
        var text = "";
        if (err && (err.name || err.message)) {
            text = (err.name ? err.name + ": " : "") + (err.message || "");
        } else if (err !== undefined && err !== null) {
            text = String(err);
        } else if (event.message) {
            text = event.message;
        }
        if (event.filename) text += " (" + event.filename + ":" + (event.lineno || 0) + ")";
        return text;
    }

    function showCrash(event) {
        if (!document.body) {
            document.addEventListener("DOMContentLoaded", function () { showCrash(event); });
            return;
        }
        var reasonEl = document.getElementById("wasm-fail-reason");
        var reason = describeError(event);
        if (reasonEl && reason && !reasonEl.textContent) reasonEl.textContent = reason;
        document.body.classList.add(APP_CRASHED_CLASS);
        var loader = document.querySelector(".loader");
        var status = document.querySelector(".status");
        var wasmFail = document.getElementById("wasm-fail");
        if (loader) loader.style.display = "none";
        if (status) status.style.display = "none";
        if (wasmFail) wasmFail.style.display = "block";
    }

    // "Script error." without filename/error object is a muted cross-origin error, e.g. from scripts
    // injected by the browser (Brave iOS regular windows). It is not caused by the app, so ignore it.
    function isMutedCrossOriginError(event) {
        return !!event && !event.error && !event.filename;
    }

    // Browser-injected inline scripts (e.g. Brave's wallet shim setting window.ethereum) report the
    // page itself as filename. Only errors from our own script/wasm files count as an app crash.
    function isFromAppScript(event) {
        var file = event && event.filename;
        if (!file) return true;
        try {
            var url = new URL(file, window.location.href);
            if (url.origin !== window.location.origin) return false;
            return /\.(m?js|wasm)$/.test(url.pathname);
        } catch (e) {
            return false;
        }
    }

    window.addEventListener("error", function (event) {
        if (isMutedCrossOriginError(event)) return;
        if (!isFromAppScript(event)) return;
        if (document.body && document.body.classList.contains("app-loaded")) return;
        showCrash(event);
    });
    window.addEventListener("unhandledrejection", showCrash);
})();

document.addEventListener("DOMContentLoaded", function () {
    const loader = document.querySelector(".loader");
    const status = document.querySelector(".status");
    const noWasm = document.getElementById("no-wasm");
    const wasmFail = document.getElementById("wasm-fail");

    if (typeof WebAssembly !== "object") {
        if (loader) loader.style.display = "none";
        if (status) status.style.display = "none";
        if (noWasm) noWasm.style.display = "block";
        return;
    }

    setTimeout(() => {
        if (document.body.classList.contains("app-loaded")) return;
        if (loader) loader.style.display = "none";
        if (status) status.style.display = "none";
        if (wasmFail) wasmFail.style.display = "block";
    }, 10000);
});
