(() => {
  "use strict";

  const APP_VERSION = "0.2.4";
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
      if (sessionStorage.getItem(key)) {
        pendingReload = false;
        return;
      }

      sessionStorage.setItem(key, "1");
      window.location.reload();
    };

    reloadTimer = window.setTimeout(tryReload, 1400);
  }

  function strengthenIOSFocus() {
    const auth = document.getElementById("authShell");
    if (!auth) return;

    auth.addEventListener("pointerup", (event) => {
      const field = event.target.closest?.("input:not([type='file']), textarea");
      if (!field || field.disabled || field.readOnly) return;
      if (document.activeElement !== field) {
        try { field.focus({ preventScroll: false }); } catch (_) { field.focus(); }
      }
    }, true);

    auth.addEventListener("click", (event) => {
      const label = event.target.closest?.("label");
      const field = label?.querySelector?.("input:not([type='file']), textarea");
      if (!field || field.disabled || field.readOnly || document.activeElement === field) return;
      try { field.focus({ preventScroll: false }); } catch (_) { field.focus(); }
    }, true);
  }

  async function checkForUpdate() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    } catch (_) {}
  }

  strengthenIOSFocus();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SCANIN_UPDATE_READY" && event.data.version !== APP_VERSION) {
        scheduleSafeReload();
      }
    });

    navigator.serviceWorker.addEventListener("controllerchange", scheduleSafeReload);

    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdate();
    });
  }

  window.addEventListener("pagehide", () => {
    if (reloadTimer) window.clearTimeout(reloadTimer);
  });
})();
