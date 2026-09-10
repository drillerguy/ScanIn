(() => {
  "use strict";

  const APP_VERSION = "0.1.0";
  const SUPABASE_URL = "https://pkbwheryabtkmzaijguj.supabase.co";
  const SUPABASE_KEY = "sb_publishable_1vliEczimRxIRks_Mgk-uA_NthjMQ7R";
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  let currentUser = null;
  let currentProfile = null;
  let scanner = null;
  let scannerRunning = false;
  let photoScanner = null;

  const el = {
    authShell: document.getElementById("authShell"), appShell: document.getElementById("appShell"),
    showLoginBtn: document.getElementById("showLoginBtn"), showSignupBtn: document.getElementById("showSignupBtn"),
    loginForm: document.getElementById("loginForm"), signupForm: document.getElementById("signupForm"), authStatus: document.getElementById("authStatus"),
    views: { scan: document.getElementById("scanView"), feed: document.getElementById("feedView"), leaderboard: document.getElementById("leaderboardView"), friends: document.getElementById("friendsView"), profile: document.getElementById("profileView") },
    reader: document.getElementById("reader"), photoReader: document.getElementById("photoReader"), startScannerBtn: document.getElementById("startScannerBtn"), stopScannerBtn: document.getElementById("stopScannerBtn"), barcodePhotoInput: document.getElementById("barcodePhotoInput"), manualBarcodeForm: document.getElementById("manualBarcodeForm"), barcodeInput: document.getElementById("barcodeInput"), scanStatus: document.getElementById("scanStatus"), latestCheckin: document.getElementById("latestCheckin"),
    feedList: document.getElementById("feedList"), feedEmpty: document.getElementById("feedEmpty"), refreshFeedBtn: document.getElementById("refreshFeedBtn"), leaderboardList: document.getElementById("leaderboardList"),
    friendSearchForm: document.getElementById("friendSearchForm"), friendSearchInput: document.getElementById("friendSearchInput"), friendSearchResults: document.getElementById("friendSearchResults"), friendRequests: document.getElementById("friendRequests"), friendList: document.getElementById("friendList"), requestCount: document.getElementById("requestCount"), friendCount: document.getElementById("friendCount"),
    topAvatar: document.getElementById("topAvatar"), topAvatarFallback: document.getElementById("topAvatarFallback"), profileAvatar: document.getElementById("profileAvatar"), profileAvatarFallback: document.getElementById("profileAvatarFallback"), avatarInput: document.getElementById("avatarInput"), profileDisplayHeading: document.getElementById("profileDisplayHeading"), profileUsernameHeading: document.getElementById("profileUsernameHeading"), profilePoints: document.getElementById("profilePoints"), profileCheckins: document.getElementById("profileCheckins"), profileUnique: document.getElementById("profileUnique"), profileForm: document.getElementById("profileForm"), profileUsername: document.getElementById("profileUsername"), profileDisplayName: document.getElementById("profileDisplayName"), profileBio: document.getElementById("profileBio"), logoutBtn: document.getElementById("logoutBtn"), toast: document.getElementById("toast")
  };

  init();

  async function init() {
    bindAuth(); bindNavigation(); bindScanner(); bindFriends(); bindProfile();
    el.refreshFeedBtn.addEventListener("click", loadFeed);

    const { data } = await db.auth.getSession();
    await applySession(data.session);

    db.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => applySession(session), 0);
    });

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
    }
  }

  function bindAuth() {
    el.showLoginBtn.addEventListener("click", () => toggleAuthMode("login"));
    el.showSignupBtn.addEventListener("click", () => toggleAuthMode("signup"));

    el.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault(); setAuthStatus("Logging in…");
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) setAuthStatus(error.message, true);
    });

    el.signupForm.addEventListener("submit", async (event) => {
      event.preventDefault(); setAuthStatus("Creating your account…");
      const username = cleanUsername(document.getElementById("signupUsername").value);
      const displayName = document.getElementById("signupDisplayName").value.trim();
      const email = document.getElementById("signupEmail").value.trim();
      const password = document.getElementById("signupPassword").value;
      if (username.length < 3) return setAuthStatus("Username needs at least 3 letters, numbers, or underscores.", true);
      const { data, error } = await db.auth.signUp({ email, password, options: { data: { username, display_name: displayName } } });
      if (error) return setAuthStatus(error.message, true);
      if (!data.session) setAuthStatus("Account created. Check your email to confirm it, then log in.");
      else setAuthStatus("Account created!");
    });
  }

  function toggleAuthMode(mode) {
    const login = mode === "login";
    el.loginForm.classList.toggle("hidden", !login); el.signupForm.classList.toggle("hidden", login);
    el.showLoginBtn.classList.toggle("active", login); el.showSignupBtn.classList.toggle("active", !login);
    el.authStatus.classList.add("hidden");
  }

  async function applySession(session) {
    currentUser = session?.user || null;
    if (!currentUser) {
      currentProfile = null; await stopScanner();
      el.authShell.classList.remove("hidden"); el.appShell.classList.add("hidden"); return;
    }
    el.authShell.classList.add("hidden"); el.appShell.classList.remove("hidden");
    await loadProfile();
    await Promise.all([loadFeed(), loadLeaderboard(), loadFriends(), loadProfileStats()]);
  }

  function bindNavigation() {
    document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.nav)));
  }

  async function navigate(name) {
    Object.entries(el.views).forEach(([key, view]) => view.classList.toggle("active", key === name));
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.nav === name));
    if (name !== "scan") await stopScanner();
    if (name === "feed") loadFeed();
    if (name === "leaderboard") loadLeaderboard();
    if (name === "friends") loadFriends();
    if (name === "profile") { loadProfile(); loadProfileStats(); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindScanner() {
    el.startScannerBtn.addEventListener("click", startScanner);
    el.stopScannerBtn.addEventListener("click", stopScanner);
    el.manualBarcodeForm.addEventListener("submit", (event) => { event.preventDefault(); processBarcode(el.barcodeInput.value); });
    el.barcodePhotoInput.addEventListener("change", scanPhoto);
  }

  function scannerFormats() {
    if (!window.Html5QrcodeSupportedFormats) return undefined;
    return [Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E, Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.DATA_MATRIX];
  }

  async function startScanner() {
    if (scannerRunning) return;
    if (!window.Html5Qrcode) return setScanStatus("Barcode scanner did not load. You can still use a photo or type the UPC.", true);
    el.reader.innerHTML = "";
    scanner = new Html5Qrcode("reader", { verbose: false, formatsToSupport: scannerFormats() });
    try {
      await scanner.start({ facingMode: "environment" }, { fps: 15, disableFlip: true }, async (decoded) => {
        await stopScanner(); processBarcode(decoded);
      }, () => {});
      scannerRunning = true; el.startScannerBtn.classList.add("hidden"); el.stopScannerBtn.classList.remove("hidden");
      setScanStatus("Camera ready — fill the view with the barcode.");
    } catch (_) { restoreScanner(); setScanStatus("Camera was not available. Try Take / choose photo.", true); }
  }

  async function stopScanner() {
    if (!scanner) { scannerRunning = false; return; }
    try { if (scannerRunning) await scanner.stop(); await scanner.clear(); } catch (_) {}
    scanner = null; scannerRunning = false; el.startScannerBtn.classList.remove("hidden"); el.stopScannerBtn.classList.add("hidden"); restoreScanner();
  }

  function restoreScanner() {
    el.reader.innerHTML = '<div class="scanner-placeholder"><div class="scan-frame"></div><strong>Ready to scan</strong><span>Fill the frame with the barcode.</span></div>';
  }

  async function scanPhoto() {
    const file = el.barcodePhotoInput.files?.[0]; if (!file) return;
    await stopScanner(); setScanStatus("Reading barcode from photo…"); el.photoReader.innerHTML = "";
    try {
      photoScanner = new Html5Qrcode("photoReader", { verbose: false, formatsToSupport: scannerFormats() });
      const decoded = await photoScanner.scanFile(file, true);
      await photoScanner.clear().catch(() => {}); photoScanner = null; processBarcode(decoded);
    } catch (_) { setScanStatus("I couldn't read a barcode in that photo. Get closer and keep the whole barcode sharp.", true); }
    finally { el.barcodePhotoInput.value = ""; }
  }

  async function processBarcode(value) {
    if (!currentUser) return;
    const barcode = normalizeBarcode(value);
    if (!/^\d{8,14}$/.test(barcode)) return setScanStatus("That doesn't look like a UPC, EAN, or GTIN barcode.", true);
    el.barcodeInput.value = barcode; setScanStatus("Found " + barcode + " — identifying product and checking you in…");
    const product = await lookupProduct(barcode);
    const { data, error } = await db.from("checkins").insert({ user_id: currentUser.id, barcode, product_name: product.name, brand: product.brand, category: product.category, product_image_url: product.image || null }).select().single();
    if (error) return setScanStatus("Check-in failed: " + error.message, true);
    renderLatestCheckin(data);
    const pts = Number(data.points_awarded || 0);
    setScanStatus(pts > 0 ? "Checked in! +" + pts + " points for a new UPC." : "Checked in! You've found this UPC before, so no repeat points.");
    toast(pts > 0 ? "+" + pts + " points" : "Check-in posted");
    await Promise.all([loadFeed(), loadLeaderboard(), loadProfileStats()]);
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
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 4500);
      const response = await fetch("https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(barcode) + ".json?fields=product_name,product_name_en,brands,categories,image_front_small_url", { signal: controller.signal });
      clearTimeout(timer); if (response.ok) {
        const json = await response.json(); const p = json.product;
        if (json.status === 1 && p) return { name: cleanText(p.product_name_en || p.product_name) || "Unknown product", brand: cleanText(p.brands) || "Unknown brand", category: cleanText(p.categories) || "Product", image: p.image_front_small_url || "" };
      }
    } catch (_) {}
    return { name: "UPC " + barcode, brand: "Unidentified product", category: "Product", image: "" };
  }

  function renderLatestCheckin(checkin) {
    const image = checkin.product_image_url ? '<img class="product-thumb" src="' + escapeAttr(checkin.product_image_url) + '" alt="">' : avatarFallbackMarkup((checkin.brand || checkin.product_name || "S").slice(0, 1), "medium");
    el.latestCheckin.innerHTML = '<div class="latest-card">' + image + '<div class="grow"><small>JUST CHECKED IN</small><strong>' + escapeHtml(checkin.product_name) + '</strong><small>' + escapeHtml(checkin.brand || checkin.barcode) + '</small></div><span class="points-chip">+' + Number(checkin.points_awarded || 0) + '</span></div>';
    el.latestCheckin.classList.remove("hidden");
  }

  async function loadFeed() {
    if (!currentUser) return;
    const { data: checkins, error } = await db.from("checkins").select("id,user_id,barcode,product_name,brand,category,product_image_url,points_awarded,created_at").order("created_at", { ascending: false }).limit(50);
    if (error) { el.feedList.innerHTML = '<div class="empty-state"><p>' + escapeHtml(error.message) + '</p></div>'; return; }
    const rows = checkins || []; el.feedEmpty.classList.toggle("hidden", rows.length > 0); if (!rows.length) { el.feedList.innerHTML = ""; return; }
    const ids = [...new Set(rows.map((x) => x.user_id))]; const { data: profiles } = await db.from("profiles").select("id,username,display_name,avatar_url").in("id", ids);
    const map = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    el.feedList.innerHTML = rows.map((c) => {
      const p = map[c.user_id] || {}; const avatar = avatarMarkup(p, "medium"); const when = timeAgo(c.created_at);
      const product = c.product_image_url ? '<img class="product-thumb" src="' + escapeAttr(c.product_image_url) + '" alt="">' : "";
      return '<article class="feed-card">' + avatar + '<div class="grow"><strong>' + escapeHtml(p.display_name || p.username || "ScanIn player") + '</strong><small>@' + escapeHtml(p.username || "player") + ' • ' + when + '</small><div><b>' + escapeHtml(c.product_name) + '</b> <small>' + escapeHtml(c.brand || c.barcode) + '</small></div></div>' + product + '<span class="points-chip">+' + Number(c.points_awarded || 0) + '</span></article>';
    }).join("");
  }

  async function loadLeaderboard() {
    if (!currentUser) return;
    const { data, error } = await db.from("leaderboard").select("id,username,display_name,avatar_url,points,checkins,unique_products,rank").order("rank", { ascending: true }).limit(50);
    if (error) { el.leaderboardList.innerHTML = '<div class="empty-state"><p>' + escapeHtml(error.message) + '</p></div>'; return; }
    el.leaderboardList.innerHTML = (data || []).map((p) => '<div class="leader-row"><span class="rank">#' + p.rank + '</span><div class="grow">' + avatarMarkup(p, "medium") + '<div><strong>' + escapeHtml(p.display_name || p.username) + '</strong><small>@' + escapeHtml(p.username) + ' • ' + p.unique_products + ' unique</small></div></div><span class="score">' + Number(p.points || 0) + '</span></div>').join("");
  }

  function bindFriends() {
    el.friendSearchForm.addEventListener("submit", searchFriends);
    el.friendSearchResults.addEventListener("click", friendActionHandler);
    el.friendRequests.addEventListener("click", friendActionHandler);
    el.friendList.addEventListener("click", friendActionHandler);
  }

  async function searchFriends(event) {
    event.preventDefault(); const term = cleanUsername(el.friendSearchInput.value); if (term.length < 2) return;
    const { data, error } = await db.from("profiles").select("id,username,display_name,avatar_url").ilike("username", "%" + term + "%").neq("id", currentUser.id).limit(12);
    if (error) return toast(error.message);
    el.friendSearchResults.innerHTML = (data || []).map((p) => personRow(p, '<button class="mini-button" data-action="add" data-id="' + p.id + '">Add friend</button>')).join("") || '<small>No usernames found.</small>';
  }

  async function loadFriends() {
    if (!currentUser) return;
    const { data: relations, error } = await db.from("friendships").select("id,requester_id,addressee_id,status,created_at").or("requester_id.eq." + currentUser.id + ",addressee_id.eq." + currentUser.id).order("created_at", { ascending: false });
    if (error) return;
    const rels = relations || []; const otherIds = [...new Set(rels.map((r) => r.requester_id === currentUser.id ? r.addressee_id : r.requester_id))];
    let profiles = []; if (otherIds.length) { const response = await db.from("profiles").select("id,username,display_name,avatar_url").in("id", otherIds); profiles = response.data || []; }
    const map = Object.fromEntries(profiles.map((p) => [p.id, p]));
    const incoming = rels.filter((r) => r.status === "pending" && r.addressee_id === currentUser.id);
    const friends = rels.filter((r) => r.status === "accepted");
    el.requestCount.textContent = String(incoming.length); el.friendCount.textContent = String(friends.length);
    el.friendRequests.innerHTML = incoming.map((r) => personRow(map[r.requester_id] || {}, '<div class="person-actions"><button class="mini-button accept" data-action="accept" data-rel="' + r.id + '">Accept</button><button class="mini-button" data-action="decline" data-rel="' + r.id + '">Decline</button></div>')).join("") || '<small>No pending requests.</small>';
    el.friendList.innerHTML = friends.map((r) => { const id = r.requester_id === currentUser.id ? r.addressee_id : r.requester_id; return personRow(map[id] || {}, '<button class="mini-button" data-action="remove" data-rel="' + r.id + '">Remove</button>'); }).join("") || '<small>Add a friend to start a shared feed.</small>';
  }

  async function friendActionHandler(event) {
    const button = event.target.closest("[data-action]"); if (!button) return;
    const action = button.dataset.action;
    if (action === "add") {
      const { error } = await db.from("friendships").insert({ requester_id: currentUser.id, addressee_id: button.dataset.id });
      toast(error ? (error.code === "23505" ? "Friend request already exists" : error.message) : "Friend request sent");
    } else if (action === "accept") {
      const { error } = await db.from("friendships").update({ status: "accepted" }).eq("id", button.dataset.rel);
      toast(error ? error.message : "Friend added");
    } else if (action === "decline" || action === "remove") {
      const { error } = await db.from("friendships").delete().eq("id", button.dataset.rel);
      toast(error ? error.message : (action === "remove" ? "Friend removed" : "Request declined"));
    }
    await loadFriends();
  }

  function personRow(p, actions) { return '<div class="person-row">' + avatarMarkup(p, "medium") + '<div class="grow"><strong>' + escapeHtml(p.display_name || p.username || "ScanIn player") + '</strong><small>@' + escapeHtml(p.username || "player") + '</small></div>' + actions + '</div>'; }

  function bindProfile() {
    el.profileForm.addEventListener("submit", saveProfile);
    el.avatarInput.addEventListener("change", uploadAvatar);
    el.logoutBtn.addEventListener("click", () => db.auth.signOut());
  }

  async function loadProfile() {
    if (!currentUser) return;
    const { data, error } = await db.from("profiles").select("id,username,display_name,bio,avatar_url,points").eq("id", currentUser.id).single();
    if (error) return toast("Could not load profile"); currentProfile = data; renderProfile();
  }

  function renderProfile() {
    if (!currentProfile) return;
    el.profileDisplayHeading.textContent = currentProfile.display_name || currentProfile.username;
    el.profileUsernameHeading.textContent = "@" + currentProfile.username;
    el.profileUsername.value = currentProfile.username || ""; el.profileDisplayName.value = currentProfile.display_name || ""; el.profileBio.value = currentProfile.bio || "";
    const letter = (currentProfile.display_name || currentProfile.username || "S").slice(0, 1).toUpperCase();
    setAvatar(el.profileAvatar, el.profileAvatarFallback, currentProfile.avatar_url, letter);
    setAvatar(el.topAvatar, el.topAvatarFallback, currentProfile.avatar_url, letter);
  }

  async function saveProfile(event) {
    event.preventDefault(); const username = cleanUsername(el.profileUsername.value); if (username.length < 3) return toast("Username is too short");
    const updates = { username, display_name: el.profileDisplayName.value.trim(), bio: el.profileBio.value.trim() };
    const { error } = await db.from("profiles").update(updates).eq("id", currentUser.id);
    if (error) return toast(error.code === "23505" ? "That username is taken" : error.message);
    toast("Profile saved"); await loadProfile();
  }

  async function uploadAvatar() {
    const file = el.avatarInput.files?.[0]; if (!file || !currentUser) return;
    if (file.size > 5 * 1024 * 1024) { el.avatarInput.value = ""; return toast("Profile photo must be under 5 MB"); }
    toast("Uploading photo…"); const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = currentUser.id + "/avatar-" + Date.now() + "." + (ext || "jpg");
    const { error: uploadError } = await db.storage.from("scanin-avatars").upload(path, file, { cacheControl: "3600", upsert: false });
    if (uploadError) return toast(uploadError.message);
    const { data } = db.storage.from("scanin-avatars").getPublicUrl(path); const avatarUrl = data.publicUrl;
    const { error } = await db.from("profiles").update({ avatar_url: avatarUrl }).eq("id", currentUser.id);
    if (error) return toast(error.message); toast("Profile photo updated"); el.avatarInput.value = ""; await loadProfile();
  }

  async function loadProfileStats() {
    if (!currentUser) return;
    const { data } = await db.from("leaderboard").select("points,checkins,unique_products").eq("id", currentUser.id).maybeSingle();
    el.profilePoints.textContent = String(data?.points || currentProfile?.points || 0); el.profileCheckins.textContent = String(data?.checkins || 0); el.profileUnique.textContent = String(data?.unique_products || 0);
  }

  function setAvatar(img, fallback, url, letter) {
    if (url) { img.src = url; img.classList.remove("hidden"); fallback.classList.add("hidden"); }
    else { img.classList.add("hidden"); fallback.classList.remove("hidden"); fallback.textContent = letter || "S"; }
  }

  function avatarMarkup(p, size) {
    if (p?.avatar_url) return '<img class="avatar ' + size + '" src="' + escapeAttr(p.avatar_url) + '" alt="">';
    return avatarFallbackMarkup((p?.display_name || p?.username || "S").slice(0, 1).toUpperCase(), size);
  }

  function avatarFallbackMarkup(letter, size) { return '<span class="avatar ' + size + '">' + escapeHtml(letter || "S") + '</span>'; }
  function cleanUsername(value) { return String(value || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 24); }
  function cleanText(value) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160); }
  function normalizeBarcode(value) { const raw = String(value || "").trim(); const gs1 = raw.match(/\(01\)\s*(\d{14})/); if (gs1) return gs1[1]; const digits = raw.replace(/\D/g, ""); if (digits.length >= 16 && digits.startsWith("01")) return digits.slice(2, 16); return /^\d{8,14}$/.test(digits) ? digits : ""; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])); }
  function escapeAttr(value) { return escapeHtml(value); }
  function timeAgo(date) { const sec = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000)); if (sec < 60) return "now"; if (sec < 3600) return Math.floor(sec / 60) + "m"; if (sec < 86400) return Math.floor(sec / 3600) + "h"; return Math.floor(sec / 86400) + "d"; }
  function setAuthStatus(message, error) { el.authStatus.textContent = message; el.authStatus.classList.remove("hidden"); el.authStatus.style.color = error ? "#ffaaaa" : ""; }
  function setScanStatus(message, error) { el.scanStatus.textContent = message; el.scanStatus.classList.remove("hidden"); el.scanStatus.style.color = error ? "#ffaaaa" : ""; }
  function toast(message) { el.toast.textContent = message; el.toast.classList.add("show"); window.clearTimeout(toast.timer); toast.timer = window.setTimeout(() => el.toast.classList.remove("show"), 2300); }
})();
