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
        if (loader) loader.style.display = "none";
        if (status) status.style.display = "none";
        if (wasmFail) wasmFail.style.display = "block";
    }, 10000);
});