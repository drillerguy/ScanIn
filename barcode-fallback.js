(() => {
  "use strict";

  const input = document.getElementById("barcodePhotoInput");
  const barcodeInput = document.getElementById("barcodeInput");
  const manualForm = document.getElementById("manualBarcodeForm");
  const status = document.getElementById("scanStatus");
  if (!input || !barcodeInput || !manualForm) return;

  function setStatus(message, isError = false) {
    if (!status) return;
    status.textContent = message;
    status.classList.remove("hidden");
    status.style.color = isError ? "#ffaaaa" : "";
  }

  function expandUPCE(code) {
    const digits = String(code || "").replace(/\D/g, "");
    if (!/^\d{8}$/.test(digits) || !/^[01]/.test(digits)) return digits;
    const ns = digits[0];
    const d1 = digits[1], d2 = digits[2], d3 = digits[3], d4 = digits[4], d5 = digits[5], d6 = digits[6];
    const check = digits[7];
    let body;
    if (d6 === "0" || d6 === "1" || d6 === "2") {
      body = ns + d1 + d2 + d6 + "00" + "00" + d3 + d4 + d5;
    } else if (d6 === "3") {
      body = ns + d1 + d2 + d3 + "00" + "000" + d4 + d5;
    } else if (d6 === "4") {
      body = ns + d1 + d2 + d3 + d4 + "0" + "0000" + d5;
    } else {
      body = ns + d1 + d2 + d3 + d4 + d5 + "0000" + d6;
    }
    return body + check;
  }

  function normalizeDecoded(code, format = "") {
    let digits = String(code || "").replace(/\D/g, "");
    const f = String(format || "").toLowerCase();
    if (digits.length === 8 && (f.includes("upc_e") || f.includes("upce") || /^[01]/.test(digits))) {
      digits = expandUPCE(digits);
    }
    return digits;
  }

  function submitDecoded(code, format) {
    const normalized = normalizeDecoded(code, format);
    if (!/^\d{8,14}$/.test(normalized)) return false;
    barcodeInput.value = normalized;
    manualForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return true;
  }

  function decodeWithQuagga(src, size, readers) {
    return new Promise((resolve) => {
      if (!window.Quagga?.decodeSingle) return resolve(null);
      try {
        window.Quagga.decodeSingle({
          src,
          numOfWorkers: 0,
          locate: true,
          inputStream: { size },
          locator: { patchSize: "medium", halfSample: false },
          decoder: { readers }
        }, (result) => {
          const code = result?.codeResult?.code;
          if (!code) return resolve(null);
          resolve({ code, format: result.codeResult.format || "" });
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function decodeWithHtml5(file) {
    if (!window.Html5Qrcode) return null;
    let holder = document.getElementById("photoDecodeWorkspace");
    if (!holder) {
      holder = document.createElement("div");
      holder.id = "photoDecodeWorkspace";
      holder.setAttribute("aria-hidden", "true");
      document.body.appendChild(holder);
    }
    holder.innerHTML = "";
    let scanner;
    try {
      scanner = new Html5Qrcode("photoDecodeWorkspace", { verbose: false });
      const code = await scanner.scanFile(file, true);
      return code ? { code, format: "" } : null;
    } catch (_) {
      return null;
    } finally {
      try { await scanner?.clear(); } catch (_) {}
      holder.innerHTML = "";
    }
  }

  async function decodePhoto(file) {
    const src = URL.createObjectURL(file);
    try {
      const readers = ["upc_e_reader", "upc_reader", "ean_reader", "ean_8_reader"];
      const attempts = [
        [0, readers],
        [1400, readers],
        [900, ["upc_e_reader", "upc_reader"]],
        [1200, ["ean_reader", "ean_8_reader"]]
      ];
      for (const [size, activeReaders] of attempts) {
        const result = await decodeWithQuagga(src, size, activeReaders);
        if (result) return result;
      }
      return await decodeWithHtml5(file);
    } finally {
      URL.revokeObjectURL(src);
    }
  }

  document.addEventListener("change", async (event) => {
    if (event.target !== input) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const file = input.files?.[0];
    if (!file) return;
    setStatus("Reading barcode from photo…");

    try {
      const result = await decodePhoto(file);
      if (!result || !submitDecoded(result.code, result.format)) {
        setStatus("I couldn't read that barcode. Move closer, keep the whole barcode sharp, and try again.", true);
      }
    } catch (_) {
      setStatus("I couldn't read that barcode. Move closer, keep the whole barcode sharp, and try again.", true);
    } finally {
      input.value = "";
    }
  }, true);
})();
