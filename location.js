(() => {
  "use strict";

  const SUPABASE_URL = "https://pkbwheryabtkmzaijguj.supabase.co";
  const SUPABASE_KEY = "sb_publishable_1vliEczimRxIRks_Mgk-uA_NthjMQ7R";
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  let pendingProduct = null;
  let currentCoords = null;
  let scanner = null;
  let scannerRunning = false;
  let photoScanner = null;
  let feedObserver = null;
  let decorateTimer = null;

  const $ = (id) => document.getElementById(id);
  const reader = $("reader");
  const photoReader = $("photoReader");
  const startBtn = $("startScannerBtn");
  const stopBtn = $("stopScannerBtn");
  const photoInput = $("barcodePhotoInput");
  const manualForm = $("manualBarcodeForm");
  const barcodeInput = $("barcodeInput");
  const scanStatus = $("scanStatus");
  const latestCheckin = $("latestCheckin");
  const feedList = $("feedList");
  const scanView = $("scanView");

  installComposer();
  updateScanCopy();
  bindCaptureHandlers();
  observeFeed();
  decorateFeedLocations();

  function updateScanCopy() {
    const hero = scanView?.querySelector(".hero");
    if (hero) {
      const eyebrow = hero.querySelector(".eyebrow");
      const heading = hero.querySelector("h1");
      const copy = hero.querySelector("p");
      if (eyebrow) eyebrow.textContent = "SCAN + CHECK IN";
      if (heading) heading.textContent = "What are you drinking?";
      if (copy) copy.textContent = "First scan the UPC to identify your drink. Then check in at your current location so friends can see what you're drinking and where.";
    }
    if (startBtn) startBtn.textContent = "Scan beverage";
    const manualButton = manualForm?.querySelector("button[type='submit']");
    if (manualButton) manualButton.textContent = "Scan";
  }

  function installComposer() {
    if (!scanView || $("checkinComposer")) return;
    const composer = document.createElement("section");
    composer.id = "checkinComposer";
    composer.className = "panel checkin-composer hidden";
    composer.innerHTML = `
      <div class="composer-kicker">READY TO CHECK IN</div>
      <div id="pendingProductCard" class="pending-product"></div>
      <div class="location-heading">
        <div>
          <strong>Where are you drinking it?</strong>
          <small>Share a venue such as Applebee's, a bar, a friend's place, or Home.</small>
        </div>
      </div>
      <button id="useLocationBtn" class="location-button" type="button"><span>⌖</span><span><b>Use my current location</b><small id="locationAreaText">Tap to detect your area</small></span></button>
      <label class="venue-label">Place name
        <input id="placeNameInput" maxlength="80" autocomplete="off" placeholder="Applebee's, Joe's Bar, Home..." />
      </label>
      <div class="privacy-note">Your feed shows the place name and general city/area to accepted friends. ScanIn does not display a home street address.</div>
      <div class="composer-actions">
        <button id="cancelCheckinBtn" class="secondary-button" type="button">Scan another</button>
        <button id="postCheckinBtn" class="primary-button" type="button">Check in here</button>
      </div>`;
    latestCheckin?.before(composer);
    $("useLocationBtn").addEventListener("click", useCurrentLocation);
    $("cancelCheckinBtn").addEventListener("click", resetPending);
    $("postCheckinBtn").addEventListener("click", postCheckin);
  }

  function bindCaptureHandlers() {
    document.addEventListener("click", (event) => {
      const target = event.target.closest("button,[data-nav]");
      if (!target) return;
      if (target === startBtn) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        startOurScanner();
      } else if (target === stopBtn) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        stopOurScanner();
      } else if (target.matches("[data-nav]") && target.dataset.nav !== "scan") {
        stopOurScanner();
      }
    }, true);

    document.addEventListener("submit", (event) => {
      if (event.target !== manualForm) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      identifyBarcode(barcodeInput.value);
    }, true);

    document.addEventListener("change", (event) => {
      if (event.target !== photoInput) return;
      event.stopPropagation(); event.stopImmediatePropagation();
      scanPhotoOnly();
    }, true);
  }

  function scannerFormats() {
    if (!window.Html5QrcodeSupportedFormats) return undefined;
    return [
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.DATA_MATRIX
    ];
  }

  async function startOurScanner() {
    if (scannerRunning) return;
    if (!window.Html5Qrcode) return setStatus("Barcode scanner did not load. Use a photo or type the UPC instead.", true);
    reader.innerHTML = "";
    scanner = new Html5Qrcode("reader", { verbose: false, formatsToSupport: scannerFormats() });
    try {
      await scanner.start({ facingMode: "environment" }, { fps: 15, disableFlip: true }, async (decoded) => {
        await stopOurScanner();
        identifyBarcode(decoded);
      }, () => {});
      scannerRunning = true;
      startBtn.classList.add("hidden");
      stopBtn.classList.remove("hidden");
      setStatus("Camera ready — scan the beverage UPC.");
    } catch (_) {
      restoreReader();
      setStatus("Camera was not available. Try Take / choose photo.", true);
    }
  }

  async function stopOurScanner() {
    if (!scanner) { scannerRunning = false; return; }
    try { if (scannerRunning) await scanner.stop(); await scanner.clear(); } catch (_) {}
    scanner = null;
    scannerRunning = false;
    startBtn?.classList.remove("hidden");
    stopBtn?.classList.add("hidden");
    restoreReader();
  }

  function restoreReader() {
    if (!reader) return;
    reader.innerHTML = '<div class="scanner-placeholder"><div class="scan-frame"></div><strong>Ready to scan</strong><span>Fill the frame with the barcode.</span></div>';
  }

  async function scanPhotoOnly() {
    const file = photoInput.files?.[0];
    if (!file) return;
    await stopOurScanner();
    setStatus("Reading barcode from photo…");
    if (photoReader) photoReader.innerHTML = "";
    try {
      photoScanner = new Html5Qrcode("photoReader", { verbose: false, formatsToSupport: scannerFormats() });
      const decoded = await photoScanner.scanFile(file, true);
      await photoScanner.clear().catch(() => {});
      photoScanner = null;
      await identifyBarcode(decoded);
    } catch (_) {
      setStatus("I couldn't read a barcode in that photo. Get closer and keep the whole barcode sharp.", true);
    } finally {
      photoInput.value = "";
    }
  }

  async function identifyBarcode(value) {
    const barcode = normalizeBarcode(value);
    if (!/^\d{8,14}$/.test(barcode)) return setStatus("That doesn't look like a UPC, EAN, or GTIN barcode.", true);
    if (barcodeInput) barcodeInput.value = barcode;
    setStatus("UPC found — identifying the beverage…");
    const product = await lookupProduct(barcode);
    pendingProduct = { barcode, ...product };
    currentCoords = null;
    renderPendingProduct();
    $("placeNameInput").value = "";
    $("locationAreaText").textContent = "Tap to detect your area";
    $("checkinComposer").classList.remove("hidden");
    setStatus("Drink identified. Now choose your location and check in.");
    $("checkinComposer").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderPendingProduct() {
    const target = $("pendingProductCard");
    if (!target || !pendingProduct) return;
    const image = pendingProduct.image
      ? `<img class="product-thumb pending-thumb" src="${escapeAttr(pendingProduct.image)}" alt="">`
      : `<span class="pending-icon">▥</span>`;
    target.innerHTML = `${image}<div><small>SCANNED DRINK</small><strong>${escapeHtml(pendingProduct.name)}</strong><span>${escapeHtml(pendingProduct.brand || pendingProduct.barcode)}</span></div><b class="scan-done">✓</b>`;
  }

  async function useCurrentLocation() {
    const button = $("useLocationBtn");
    const areaText = $("locationAreaText");
    if (!navigator.geolocation) {
      areaText.textContent = "Location isn't available on this device";
      return;
    }
    button.classList.add("locating");
    areaText.textContent = "Finding your location…";
    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = Math.round(position.coords.latitude * 1000) / 1000;
      const lon = Math.round(position.coords.longitude * 1000) / 1000;
      currentCoords = { latitude: lat, longitude: lon, source: "gps", area: "Current area" };
      const reverse = await reverseGeocode(lat, lon);
      if (reverse.area) currentCoords.area = reverse.area;
      areaText.textContent = currentCoords.area;
      const placeInput = $("placeNameInput");
      if (!placeInput.value && reverse.venue) placeInput.value = reverse.venue;
      button.classList.remove("locating");
    }, (error) => {
      button.classList.remove("locating");
      areaText.textContent = error.code === 1 ? "Location permission was not allowed" : "Couldn't get your current location";
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
  }

  async function reverseGeocode(lat, lon) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1&namedetails=1&accept-language=en`;
      const response = await fetch(url, { signal: controller.signal, headers: { "Accept": "application/json" } });
      clearTimeout(timer);
      if (!response.ok) return {};
      const json = await response.json();
      const a = json.address || {};
      const city = a.city || a.town || a.village || a.municipality || a.county || "";
      const state = a.state_code || a.state || "";
      const area = [city, state].filter(Boolean).join(", ");
      let venue = cleanText(json.name || "");
      const residential = a.house_number || a.road;
      if (residential && !a.amenity && !a.shop && !a.tourism && !a.leisure && !a.office && !a.craft) venue = "";
      return { area, venue };
    } catch (_) {
      return {};
    }
  }

  async function postCheckin() {
    if (!pendingProduct) return setStatus("Scan a beverage first.", true);
    const { data: sessionData } = await db.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return setStatus("Please log in again before checking in.", true);

    const placeName = cleanText($("placeNameInput").value).slice(0, 80);
    if (!placeName) {
      $("placeNameInput").focus();
      return setStatus("Add the place name — for example Applebee's, a bar name, or Home.", true);
    }

    const button = $("postCheckinBtn");
    button.disabled = true;
    button.textContent = "Checking in…";

    const payload = {
      user_id: user.id,
      barcode: pendingProduct.barcode,
      product_name: pendingProduct.name,
      brand: pendingProduct.brand,
      category: pendingProduct.category,
      product_image_url: pendingProduct.image || null,
      place_name: placeName,
      location_area: currentCoords?.area || "",
      latitude: currentCoords?.latitude ?? null,
      longitude: currentCoords?.longitude ?? null,
      location_source: currentCoords ? "gps" : "manual"
    };

    const { data, error } = await db.from("checkins").insert(payload).select().single();
    button.disabled = false;
    button.textContent = "Check in here";
    if (error) return setStatus("Check-in failed: " + error.message, true);

    renderLatest(data);
    const pts = Number(data.points_awarded || 0);
    const where = [data.place_name, data.location_area].filter(Boolean).join(" · ");
    setStatus(pts > 0 ? `Checked in at ${where}! +${pts} points for a new UPC.` : `Checked in at ${where}!`);
    toast(pts > 0 ? `+${pts} points • ${data.place_name}` : `Checked in • ${data.place_name}`);
    resetPending(false);
    window.setTimeout(() => decorateFeedLocations(), 500);
  }

  function renderLatest(checkin) {
    if (!latestCheckin) return;
    const image = checkin.product_image_url
      ? `<img class="product-thumb" src="${escapeAttr(checkin.product_image_url)}" alt="">`
      : `<span class="pending-icon small">▥</span>`;
    const location = [checkin.place_name, checkin.location_area].filter(Boolean).join(" · ");
    latestCheckin.innerHTML = `<div class="latest-card">${image}<div class="grow"><small>JUST CHECKED IN</small><strong>${escapeHtml(checkin.product_name)}</strong><small>${escapeHtml(checkin.brand || checkin.barcode)}</small><div class="checkin-location">⌖ ${escapeHtml(location)}</div></div><span class="points-chip">+${Number(checkin.points_awarded || 0)}</span></div>`;
    latestCheckin.classList.remove("hidden");
  }

  function resetPending(hideLatest = true) {
    pendingProduct = null;
    currentCoords = null;
    $("checkinComposer")?.classList.add("hidden");
    if (hideLatest) latestCheckin?.classList.add("hidden");
    if (barcodeInput) barcodeInput.value = "";
    restoreReader();
  }

  function observeFeed() {
    if (!feedList || feedObserver) return;
    feedObserver = new MutationObserver(() => {
      window.clearTimeout(decorateTimer);
      decorateTimer = window.setTimeout(decorateFeedLocations, 120);
    });
    feedObserver.observe(feedList, { childList: true, subtree: true });
  }

  async function decorateFeedLocations() {
    if (!feedList) return;
    const { data: sessionData } = await db.auth.getSession();
    if (!sessionData?.session) return;
    const { data, error } = await db.from("checkins").select("id,place_name,location_area,created_at").order("created_at", { ascending: false }).limit(50);
    if (error || !data) return;
    const cards = [...feedList.querySelectorAll(".feed-card")];
    if (!cards.length) return;
    feedObserver?.disconnect();
    cards.forEach((card, index) => {
      card.querySelector(".checkin-location")?.remove();
      const row = data[index];
      if (!row || (!row.place_name && !row.location_area)) return;
      const grow = card.querySelector(".grow");
      if (!grow) return;
      const line = document.createElement("div");
      line.className = "checkin-location";
      line.textContent = "⌖ " + [row.place_name, row.location_area].filter(Boolean).join(" · ");
      grow.appendChild(line);
    });
    feedObserver?.observe(feedList, { childList: true, subtree: true });
  }

  async function lookupProduct(barcode) {
    const catalog = {
      "049000003710": { name: "Powerade Fruit Punch", brand: "Powerade", category: "Sports Drink" },
      "0049000003710": { name: "Powerade Fruit Punch", brand: "Powerade", category: "Sports Drink" },
      "01231003": { name: "Pepsi", brand: "Pepsi", category: "Soda" },
      "012000003103": { name: "Pepsi", brand: "Pepsi", category: "Soda" },
      "049000006346": { name: "Coca-Cola Classic", brand: "Coca-Cola", category: "Soda" },
      "070847811169": { name: "Monster Energy Original", brand: "Monster Energy", category: "Energy Drink" }
    };
    if (catalog[barcode]) return { ...catalog[barcode], image: "" };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const response = await fetch("https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(barcode) + ".json?fields=product_name,product_name_en,brands,categories,image_front_small_url", { signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) {
        const json = await response.json();
        const p = json.product;
        if (json.status === 1 && p) {
          return {
            name: cleanText(p.product_name_en || p.product_name) || "Unknown product",
            brand: cleanText(p.brands) || "Unknown brand",
            category: cleanText(p.categories) || "Product",
            image: p.image_front_small_url || ""
          };
        }
      }
    } catch (_) {}
    return { name: "UPC " + barcode, brand: "Unidentified product", category: "Product", image: "" };
  }

  function normalizeBarcode(value) {
    const raw = String(value || "").trim();
    const gs1 = raw.match(/\(01\)\s*(\d{14})/);
    if (gs1) return gs1[1];
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 16 && digits.startsWith("01")) return digits.slice(2, 16);
    return /^\d{8,14}$/.test(digits) ? digits : "";
  }

  function cleanText(value) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])); }
  function escapeAttr(value) { return escapeHtml(value); }
  function setStatus(message, error) { if (!scanStatus) return; scanStatus.textContent = message; scanStatus.classList.remove("hidden"); scanStatus.style.color = error ? "#ffaaaa" : ""; }
  function toast(message) { const el = $("toast"); if (!el) return; el.textContent = message; el.classList.add("show"); window.clearTimeout(toast.timer); toast.timer = window.setTimeout(() => el.classList.remove("show"), 2400); }
})();
