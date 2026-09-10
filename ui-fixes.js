(() => {
  "use strict";

  const APP_VERSION = "0.2.7";
  let pendingReload = false;
  let reloadTimer = null;

  function isEditing() {
    const active = document.activeElement;
    if (!active) return false;
    return active.matches?.("input, textarea, select, [contenteditable='true']") || false;
  }

  function scheduleSafeReload() {
    if (pendingReload) return;
    pendingReload = true;
    const tryReload = () => {
      if (document.visibilityState !== "visible" || isEditing()) {
        reloadTimer = window.setTimeout(tryReload, 1200);
        return;
      }
      const key = "scanin-reload-" + APP_VERSION;
      if (sessionStorage.getItem(key)) { pendingReload = false; return; }
      sessionStorage.setItem(key, "1");
      window.location.reload();
    };
    reloadTimer = window.setTimeout(tryReload, 1400);
  }

  async function checkForUpdate() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    } catch (_) {}
  }

  function expandUPCE(digits) {
    if (!/^\d{8}$/.test(digits) || !/^[01]/.test(digits)) return digits;
    const ns=digits[0], d1=digits[1], d2=digits[2], d3=digits[3], d4=digits[4], d5=digits[5], d6=digits[6], check=digits[7];
    let body;
    if (["0","1","2"].includes(d6)) body = ns+d1+d2+d6+"00"+"00"+d3+d4+d5;
    else if (d6 === "3") body = ns+d1+d2+d3+"00"+"000"+d4+d5;
    else if (d6 === "4") body = ns+d1+d2+d3+d4+"0"+"0000"+d5;
    else body = ns+d1+d2+d3+d4+d5+"0000"+d6;
    return body + check;
  }

  function normalizeDecodedBarcode(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 8 && /^[01]/.test(digits)) return expandUPCE(digits);
    return digits || value;
  }

  function cleanupPhotoReader() {
    const helper = document.getElementById("photoReader");
    if (!helper) return;
    helper.querySelectorAll("img,canvas,video").forEach((node) => node.remove());
  }

  function rotatedFile(file, degrees) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          const radians = degrees * Math.PI / 180;
          const swap = Math.abs(degrees % 180) === 90;
          const canvas = document.createElement("canvas");
          canvas.width = swap ? image.naturalHeight : image.naturalWidth;
          canvas.height = swap ? image.naturalWidth : image.naturalHeight;
          const ctx = canvas.getContext("2d", { alpha: false });
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(radians);
          ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) return reject(new Error("Could not rotate image"));
            resolve(new File([blob], "scanin-rotated.jpg", { type: "image/jpeg" }));
          }, "image/jpeg", 0.96);
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          reject(error);
        }
      };
      image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Could not load image")); };
      image.src = objectUrl;
    });
  }

  function improveBarcodeScanner() {
    const Qr = window.Html5Qrcode;
    if (!Qr?.prototype || Qr.prototype.__scaninImproved) return;
    Qr.prototype.__scaninImproved = true;

    const originalScanFile = Qr.prototype.scanFile;
    if (typeof originalScanFile === "function") {
      Qr.prototype.scanFile = async function(file) {
        let firstError = null;
        try {
          const decoded = await originalScanFile.call(this, file, false);
          cleanupPhotoReader();
          return normalizeDecodedBarcode(decoded);
        } catch (error) { firstError = error; }
        for (const degrees of [90, 270, 180]) {
          try {
            const alternate = await rotatedFile(file, degrees);
            const decoded = await originalScanFile.call(this, alternate, false);
            cleanupPhotoReader();
            return normalizeDecodedBarcode(decoded);
          } catch (_) {}
        }
        cleanupPhotoReader();
        throw firstError || new Error("Barcode not found");
      };
    }

    const originalStart = Qr.prototype.start;
    if (typeof originalStart === "function") {
      Qr.prototype.start = function(cameraIdOrConfig, configuration, successCallback, errorCallback) {
        const wrappedSuccess = (decodedText, decodedResult) => successCallback?.(normalizeDecodedBarcode(decodedText), decodedResult);
        return originalStart.call(this, cameraIdOrConfig, configuration, wrappedSuccess, errorCallback);
      };
    }
  }

  improveBarcodeScanner();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SCANIN_UPDATE_READY" && event.data.version !== APP_VERSION) scheduleSafeReload();
    });
    navigator.serviceWorker.addEventListener("controllerchange", scheduleSafeReload);
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
  }

  window.addEventListener("pagehide", () => { if (reloadTimer) window.clearTimeout(reloadTimer); });
})();
