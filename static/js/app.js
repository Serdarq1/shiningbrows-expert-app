const sections = [
  "portal",
  "hizli-bilgiler",
  "profil",
  "urun-bilgileri",
  "urunler",
  "uzman-akisi",
  "kampanyalar",
  "yaklasan-workshoplar",
  "canli-workshop",
  "uzmanlar",
  "medya",
  "destek",
  "shining-world",
];
const FEED_REACTIONS = [
  { id: "like", label: "👍" },
  { id: "love", label: "❤️" },
  { id: "wow", label: "🤩" },
  { id: "clap", label: "👏" },
];
let quickTips = [];
let currentUserRole = "student";
let studentHasPassword = false;
let feedPhotos = [];
let showWinnerOnly = false;
let pinWinner = false;
let bookUrl = "";
let currentUserPhone = "";
let currentUserName = "";
let isGuestUser = false;
const orderCart = {};
let pendingAddProductId = null;
let orderHistoryPage = 1;
let orderHistoryHasMore = false;
const CART_STORAGE_KEY = "sb_order_cart_v1";
let pendingOpenCart = false;
let activeDeletePopover = null;
let liveWorkshopRoom = null;
let liveWorkshopScreenTrack = null;
let liveWorkshopRefreshTimer = null;
let latestWorkshops = [];
let liveWorkshopCurrent = null;
let liveParticipantsCollapsed = false;
let liveViewerMode = false;
const twilioKrispAssetsPath = window.SHINING_BROWS_CONFIG?.twilioKrispAssetsPath || "";

document.addEventListener("DOMContentLoaded", () => {
  const searchParams = new URLSearchParams(window.location.search);
  pendingAddProductId = searchParams.get("add_product");
  pendingOpenCart = searchParams.get("open_cart") === "1";
  restoreCart();
  setupButtonHoverEffects();
  setupNavigation();
  setupSidebar();
  setupFeedControls();
  setupFeedPhotosToggle();
  setupPanelShortcuts();
  setupNotificationButton();
  loadStudent();
  loadProducts();
  loadOrderProducts();
  loadRules();
  loadQuickTips();
  loadEducation();
  loadCampaigns();
  loadWorkshop();
  loadBook();
  loadFaqs();
  loadPhotos();
  loadVideos();
  loadExperts();
  setupSupportForm();
  setupPhotoForm();
  setupProfileForm();
  setupAvatarForm();
  setupPasswordForm();
  setupClerkAccount();
  setupWorkshopAdmin();
  setupBookForm();
  setupVideoForm();
  setupCampaignAdmin();
  setupOrderActions();
  loadOrderHistory();
  setupWorkshopSignup();
  setupLiveWorkshopUI();
});

function saveCart() {
  const payload = Object.values(orderCart).map((item) => ({
    product: item.product,
    qty: item.qty,
  }));
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("Cart save failed", err);
  }
}

function restoreCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    parsed.forEach((item) => {
      if (!item || !item.product || !item.product.id) return;
      orderCart[item.product.id] = {
        product: item.product,
        qty: Number(item.qty) || 0,
      };
    });
  } catch (err) {
    console.warn("Cart restore failed", err);
  }
}

function setupButtonHoverEffects() {
  const buttons = document.querySelectorAll("button");
  buttons.forEach((btn) => {
    btn.classList.add("transition", "duration-200", "ease-out", "hover:opacity-90");
  });
}

function setupNotificationButton() {
  const button = document.getElementById("notification-btn");
  const popover = document.getElementById("notification-popover");
  if (!button) return;
  button.addEventListener("click", () => {
    const unread = Number(button.dataset.unread || 0);
    if (unread === 0) {
      if (!popover) return;
      popover.classList.toggle("hidden");
    }
  });
  document.addEventListener("click", (event) => {
    if (!popover || popover.classList.contains("hidden")) return;
    if (event.target === button || button.contains(event.target)) return;
    popover.classList.add("hidden");
  });
}

function applyRoleVisibility(role) {
  const allowed = role === "guest"
    ? new Set(["portal", "urun-bilgileri", "yaklasan-workshoplar", "uzman-akisi", "uzmanlar", "shining-world"])
    : null;
  if (!allowed) return;
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const target = btn.dataset.target;
    btn.classList.toggle("hidden", !allowed.has(target));
  });
  document.querySelectorAll(".panel-shortcut").forEach((btn) => {
    const target = btn.dataset.target;
    btn.classList.toggle("hidden", !allowed.has(target));
  });
  goToSection("portal", { replace: true });
}

function setupFeedPhotosToggle() {
  const openBtn = document.getElementById("open-photos");
  const backBtn = document.getElementById("back-to-feed");
  if (openBtn) {
    openBtn.addEventListener("click", () => setFeedView("photos"));
  }
  if (backBtn) {
    backBtn.addEventListener("click", () => setFeedView("main"));
  }
}

function setFeedView(view) {
  const main = document.getElementById("feed-main");
  const photos = document.getElementById("feed-photos");
  if (!main || !photos) return;
  const showPhotos = view === "photos";
  main.classList.toggle("hidden", showPhotos);
  photos.classList.toggle("hidden", !showPhotos);
}

function setupNavigation() {
  const buttons = document.querySelectorAll(".nav-btn");
  buttons.forEach((btn) => {
    btn.classList.add(
      "px-3",
      "py-3",
      "rounded-lg",
      "bg-gray-50",
      "border",
      "border-gray-200",
      "text-zinc-700",
      "font-semibold",
      "flex",
      "items-center",
      "gap-3",
      "justify-center",
      "md:justify-start",
      "w-full",
      "transition",
      "duration-200",
      "hover:-translate-y-0.5",
      "shadow-sm"
    );
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      goToSection(target);
      if (typeof window.closeSidebar === "function") {
        window.closeSidebar();
      }
    });
  });
  if (buttons.length) {
    const initial = getInitialSection(buttons[0].dataset.target);
    goToSection(initial, { replace: true });
  }
}

function setupPanelShortcuts() {
  const shortcuts = document.querySelectorAll(".panel-shortcut");
  if (!shortcuts.length) return;
  shortcuts.forEach((shortcut) => {
    shortcut.addEventListener("click", () => {
      const target = shortcut.dataset.target;
      if (!target) return;
      goToSection(target);
      if (typeof window.closeSidebar === "function") {
        window.closeSidebar();
      }
    });
  });
}

function getInitialSection(fallback) {
  const hash = window.location.hash.replace("#", "");
  if (sections.includes(hash)) return hash;
  return fallback || "portal";
}

function goToSection(targetId, options = {}) {
  if (!targetId) return;
  switchSection(targetId);
  setActiveNav(targetId);
  const url = `#${targetId}`;
  if (options.replace) {
    window.history.replaceState({ section: targetId }, "", url);
  } else {
    window.history.pushState({ section: targetId }, "", url);
  }
}

window.addEventListener("popstate", (event) => {
  const targetId = (event.state && event.state.section) || window.location.hash.replace("#", "");
  if (targetId && sections.includes(targetId)) {
    switchSection(targetId);
    setActiveNav(targetId);
  }
});

function setActiveNav(targetId) {
  const buttons = document.querySelectorAll(".nav-btn");
  buttons.forEach((btn) => {
    btn.classList.remove("bg-zinc-900", "text-white");
    btn.classList.add("text-zinc-700");
    const label = btn.querySelector("span");
    if (label) {
      label.classList.remove("text-white");
      label.classList.add("text-zinc-700");
    }
  });
  buttons.forEach((btn) => {
    if (btn.dataset.target !== targetId) return;
    btn.classList.add("bg-zinc-900", "text-white");
    btn.classList.remove("text-zinc-700");
    const label = btn.querySelector("span");
    if (label) {
      label.classList.add("text-white");
      label.classList.remove("text-zinc-700");
    }
  });
}

function setupSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const toggle = document.getElementById("sidebar-toggle");
  if (!sidebar || !overlay || !toggle) return;

  const openSidebar = () => {
    sidebar.classList.remove("-translate-x-full");
    overlay.classList.remove("pointer-events-none", "opacity-0");
    overlay.classList.add("opacity-100");
  };

  const toggleSidebar = () => {
    if (sidebar.classList.contains("-translate-x-full")) {
      openSidebar();
    } else {
      window.closeSidebar();
    }
  };

  window.closeSidebar = () => {
    sidebar.classList.add("-translate-x-full");
    overlay.classList.add("pointer-events-none", "opacity-0");
    overlay.classList.remove("opacity-100");
  };

  toggle.addEventListener("click", toggleSidebar);
  overlay.addEventListener("click", window.closeSidebar);
}

function switchSection(targetId) {
  sections.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const isTarget = id === targetId;
    el.classList.toggle("hidden", !isTarget);
    el.classList.toggle("md:hidden", !isTarget);
  });
  setFeedView("main");
}

function setupFeedControls() {
  const filterBtn = document.getElementById("filter-winner-btn");
  const pinBtn = document.getElementById("pin-winner-btn");
  const updateStates = () => {
    if (filterBtn) {
      filterBtn.classList.toggle("bg-zinc-900", showWinnerOnly);
      filterBtn.classList.toggle("text-white", showWinnerOnly);
    }
    if (pinBtn) {
      pinBtn.classList.toggle("bg-zinc-900", pinWinner);
      pinBtn.classList.toggle("text-white", pinWinner);
    }
  };
  if (filterBtn) {
    filterBtn.addEventListener("click", () => {
      showWinnerOnly = !showWinnerOnly;
      renderFeed();
      updateStates();
    });
  }
  if (pinBtn) {
    pinBtn.addEventListener("click", () => {
      pinWinner = !pinWinner;
      renderFeed();
      updateStates();
    });
  }
  updateStates();
}

async function fetchJSON(url, options = {}) {
  const opts = { ...options };
  const method = (opts.method || "GET").toUpperCase();
  if (method === "GET" && !opts.cache) {
    opts.cache = "no-store";
  }
  const response = await fetch(url, opts);
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      const message = data.error || data.message || "İstek başarısız";
      throw new Error(message);
    }
    const text = await response.text();
    throw new Error(text || "İstek başarısız");
  }
  return response.json();
}

function showToast(message, { type = "info", duration = 2200 } = {}) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  let background = "#0f172a";
  if (type === "success") background = "#16a34a";
  if (type === "error") background = "#dc2626";
  toast.textContent = message;
  toast.style.background = background;
  toast.style.opacity = "1";
  toast.style.pointerEvents = "auto";
  toast.style.transform = "translate(-50%, 0)";
  window.clearTimeout(toast.dataset.timerId);
  const timerId = window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.pointerEvents = "none";
    toast.style.transform = "translate(-50%, 12px)";
  }, duration);
  toast.dataset.timerId = String(timerId);
}

function closeDeletePopover() {
  if (!activeDeletePopover) return;
  const { popover, overlay } = activeDeletePopover;
  if (overlay) overlay.remove();
  popover.remove();
  activeDeletePopover = null;
}

function attachDeletePopover(button, { message, onConfirm, onError, confirmLabel = "Sil", position = "inline" } = {}) {
  if (!button || typeof onConfirm !== "function") return;
  const host = button.parentElement || button;
  if (position === "inline") {
    host.classList.add("relative");
  }
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (activeDeletePopover?.button === button) {
      closeDeletePopover();
      return;
    }
    closeDeletePopover();
    const popover = document.createElement("div");
    const isCentered = position === "center";
    let overlay = null;
    if (isCentered) {
      overlay = document.createElement("div");
      overlay.className = "fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]";
      document.body.appendChild(overlay);
      popover.className = "fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl";
    } else {
      popover.className = "absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-gray-200 bg-white p-3 shadow-xl";
    }
    popover.innerHTML = `
      <p class="text-xs leading-5 text-zinc-700">${escapeHTML(message || "Bu kayit silinsin mi?")}</p>
      <div class="mt-3 flex items-center justify-end gap-2">
        <button type="button" class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-zinc-600" data-delete-cancel>Vazgeç</button>
        <button type="button" class="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600" data-delete-confirm>${escapeHTML(confirmLabel)}</button>
      </div>
    `;
    if (isCentered) {
      document.body.appendChild(popover);
    } else {
      host.appendChild(popover);
    }
    activeDeletePopover = { button, popover, overlay };

    const cancelBtn = popover.querySelector("[data-delete-cancel]");
    const confirmBtn = popover.querySelector("[data-delete-confirm]");

    cancelBtn?.addEventListener("click", (cancelEvent) => {
      cancelEvent.preventDefault();
      cancelEvent.stopPropagation();
      closeDeletePopover();
    });

    confirmBtn?.addEventListener("click", async (confirmEvent) => {
      confirmEvent.preventDefault();
      confirmEvent.stopPropagation();
      if (confirmBtn.disabled) return;
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      button.disabled = true;
      confirmBtn.textContent = "Siliniyor...";
      try {
        await onConfirm();
        button.disabled = false;
        closeDeletePopover();
      } catch (err) {
        if (typeof onError === "function") {
          onError(err);
        }
        confirmBtn.disabled = false;
        cancelBtn.disabled = false;
        button.disabled = false;
        confirmBtn.textContent = confirmLabel;
      }
    });
  });
}

document.addEventListener("click", (event) => {
  if (!activeDeletePopover) return;
  const { button, popover } = activeDeletePopover;
  if (popover.contains(event.target) || button.contains(event.target)) return;
  closeDeletePopover();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDeletePopover();
  }
});

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isElevatedRole() {
  return currentUserRole === "admin" || currentUserRole === "master";
}

function formatExpertStatus(status) {
  if (!status) return "-";
  const normalized = String(status).toLowerCase().trim();
  if (normalized === "student") return "Shining Expert";
  if (normalized === "shining expert") return "Shining Expert";
  if (normalized === "master assistant") return "Master Assistant";
  if (normalized === "master trainer" || normalized === "founder") return "Founder";
  return status;
}

function normalizeExpertStatusForInput(status) {
  const normalized = String(status || "").toLowerCase().trim();
  if (normalized === "founder") return "master trainer";
  if (normalized === "student") return "shining expert";
  return normalized;
}

function buildExpertStatusOptions(selectedStatus) {
  const normalized = normalizeExpertStatusForInput(selectedStatus);
  const options = [
    { value: "shining expert", label: "Shining Expert" },
    { value: "master assistant", label: "Master Assistant" },
    { value: "master trainer", label: "Founder" },
  ];
  return options
    .map((option) => `<option value="${option.value}"${option.value === normalized ? " selected" : ""}>${option.label}</option>`)
    .join("");
}

function parsePhoneNumber(rawPhone = "") {
  const normalized = String(rawPhone).trim();
  if (!normalized) {
    return { countryCode: "+90", localNumber: "" };
  }
  if (normalized.startsWith("+")) {
    if (normalized.startsWith("+90")) {
      return { countryCode: "+90", localNumber: normalized.slice(3).replace(/\s+/g, "") };
    }
    const match = normalized.match(/^\+(\d{1,3})(.*)$/);
    if (match) {
      const country = `+${match[1]}`;
      const local = match[2].replace(/\s+/g, "");
      return { countryCode: country, localNumber: local };
    }
  }
  return { countryCode: "+90", localNumber: normalized.replace(/\s+/g, "") };
}

function buildFullPhone(countryCode, localNumber) {
  const code = String(countryCode || "").trim() || "+90";
  const local = String(localNumber || "").trim().replace(/[^\d+]/g, "");
  if (!local) return "";
  if (local.startsWith("+")) return local;
  const normalizedCode = code.startsWith("+") ? code : `+${code}`;
  return `${normalizedCode}${local}`;
}

function formatWorkshopDate(rawDate) {
  if (!rawDate) return "";
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return String(rawDate);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function toTitleCase(value) {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function loadStudent() {
  try {
    const student = await fetchJSON("/api/student");
    document.getElementById("student-name").textContent = toTitleCase(student.name);
    document.getElementById("expert-id").textContent = `Uzman ID: ${student.id}`;
    document.getElementById("workshop-name").textContent = student.workshop_name || "-";
    document.getElementById("certificate-date").textContent = student.date || "-";
    document.getElementById("certificate-status").textContent = student.status || "Aktif";
    currentUserRole = student.role || "student";
    isGuestUser = currentUserRole === "guest";
    currentUserName = student.name || "";
    studentHasPassword = !!student.has_password;
    const phoneInput = document.getElementById("profile-phone");
    const countryInput = document.getElementById("profile-country");
    if (phoneInput) {
      const parsed = parsePhoneNumber(student.phone || "");
      phoneInput.value = parsed.localNumber;
      if (countryInput) countryInput.value = parsed.countryCode;
    }
    currentUserPhone = student.phone || "";
    const avatar = document.getElementById("profile-avatar");
    if (avatar) {
      avatar.src = student.avatar_url || "../static/img/logo-transparent.png";
    }
    const profileLogo = document.getElementById("profile-logo");
    if (profileLogo) {
      profileLogo.src = student.avatar_url || "../static/img/logo-transparent.png";
    }
    const sidebarLogo = document.getElementById("sidebar-profile-logo");
    if (sidebarLogo) {
      sidebarLogo.src = student.avatar_url || "../static/img/logo-transparent.png";
    }
    const sidebarName = document.getElementById("sidebar-student-name");
    if (sidebarName) {
      sidebarName.textContent = toTitleCase(student.name);
    }
    const sidebarId = document.getElementById("sidebar-expert-id");
    if (sidebarId) {
      sidebarId.textContent = `Uzman ID: ${student.id}`;
    }
    const sidebarDate = document.getElementById("sidebar-certificate-date");
    if (sidebarDate) {
      sidebarDate.textContent = student.date || "-";
    }
    const expertId = document.getElementById("expert-id");
    if (expertId) expertId.closest("p")?.classList.toggle("hidden", isGuestUser);
    if (sidebarId) sidebarId.classList.toggle("hidden", isGuestUser);
    if (sidebarDate) sidebarDate.closest("p")?.classList.toggle("hidden", isGuestUser);
    document.querySelectorAll("#certificate-date").forEach((el) => {
      const parent = el.closest("p");
      if (parent) parent.classList.toggle("hidden", isGuestUser);
    });
    const statusText = document.getElementById("expert-status");
    if (statusText) {
      statusText.textContent = formatExpertStatus(student.expert_status);
    }
    const openPhotosBtn = document.getElementById("open-photos");
    if (openPhotosBtn) {
      openPhotosBtn.classList.toggle("hidden", isGuestUser);
    }
    const photoForm = document.getElementById("photo-form");
    if (photoForm) {
      photoForm.classList.toggle("hidden", isGuestUser);
    }
    if (isGuestUser) {
      setFeedView("main");
    }
    refreshPasswordUI();
    refreshWorkshopAdminVisibility();
    applyRoleVisibility(currentUserRole);
    loadWorkshop();
    loadExperts();
    loadFeed();
  } catch (err) {
    console.error(err);
    if (!isGuestUser) {
      window.location.href = "/login";
    }
  }
}

function refreshPasswordUI() {
  const card = document.getElementById("password-card");
  const form = document.getElementById("password-form");
  const hint = document.getElementById("password-hint");
  const success = document.getElementById("password-success");
  if (!form) return;
  if (card) card.classList.remove("hidden");
  form.classList.remove("hidden");
  if (hint) hint.classList.remove("hidden");
  if (success) success.classList.add("hidden");
}

function refreshWorkshopAdminVisibility() {
  const card = document.getElementById("workshop-admin-card");
  if (!card) return;
  const canEdit = isElevatedRole();
  card.classList.toggle("hidden", !canEdit);
  const bookCard = document.getElementById("book-admin-card");
  if (bookCard) bookCard.classList.toggle("hidden", !canEdit);
  const videoCard = document.getElementById("video-admin-card");
  if (videoCard) videoCard.classList.toggle("hidden", !canEdit);
  const campaignCard = document.getElementById("campaign-admin-card");
  if (campaignCard) campaignCard.classList.toggle("hidden", !canEdit);
}


function formatTextWithLineBreaks(text) {
  if (!text) return "";
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

function toBulletItems(input) {
  if (!input) return [];
  const rawItems = Array.isArray(input) ? input : [input];
  const items = [];
  rawItems.forEach((entry) => {
    if (!entry) return;
    const normalized = String(entry).replace(/\r\n/g, "\n");
    const byLine = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
    if (byLine.length === 1 && byLine[0].includes("•")) {
      byLine[0]
        .split("•")
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => items.push(item));
    } else {
      byLine.forEach((line) => {
        const cleaned = line.replace(/^•\s*/, "").trim();
        if (cleaned) items.push(cleaned);
      });
    }
  });
  return items;
}

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  const formatted = new Intl.NumberFormat("tr-TR", {
    style: "decimal",
    maximumFractionDigits: 2,
  }).format(number);
  return `${formatted} ₺`;
}

async function loadProducts() {
  const container = document.getElementById("product-list");
  if (!container) return;
  container.innerHTML = "";
  const products = await fetchJSON("/api/products");
  products.forEach((product) => {
    const steps = toBulletItems(product.steps);
    const card = document.createElement("div");
    card.className = "rounded-lg bg-gray-50 p-2 space-y-2";
    card.innerHTML = `
      <div class="product-img cursor-pointer">
        <button class="flex items-center justify-center w-full" type="button">
          <img src="./static/img/product-images/${product.name}.svg" width="150" alt="${product.name}" />
        </button>
        <div class="flex items-center justify-between">
          <h4 class="font-semibold">${product.name}</h4>
        </div>
        <div class="product-details hidden">
          <div class="flex items-center justify-between">
            <span class="text-xs text-zinc-500">${product.short_description || ""}</span>
          </div>
          <div class="space-y-1 text-sm">
            ${
              steps.length
                ? `<p class="text-zinc-600">${steps.map((step) => `• ${step}`).join("<br>")}</p>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
    card.querySelector(".product-img").addEventListener("click", () => {
      const details = card.querySelector(".product-details");
      const isHidden = details.classList.toggle("hidden");
      const img = card.querySelector("img");
      if (isHidden && img) {
        const imgHeight = img.getBoundingClientRect().height || 0;
        card.style.height = `${Math.ceil(imgHeight + 49)}px`;
      } else {
        card.style.height = "";
      }
      card.classList.toggle("overflow-hidden", isHidden);
      card.classList.toggle("p-3", !isHidden);
      card.classList.toggle("p-2", isHidden);
      card.classList.toggle("space-y-2", !isHidden);
      card.classList.toggle("space-y-0", isHidden);
    });
    container.appendChild(card);
  });
}

async function loadOrderProducts() {
  const container = document.getElementById("order-product-list");
  if (!container) return;
  container.innerHTML = "";
  const products = await fetchJSON("/api/products");
  products.forEach((product) => {
    const priceText = formatPrice(product.price);
    const card = document.createElement("div");
    card.className = "rounded-lg border border-gray-200 bg-white p-3 space-y-2 cursor-pointer";
    card.innerHTML = `
      <div class="flex items-center justify-center">
        <img src="./static/img/product-images/${product.name}.svg" width="200" alt="${product.name}" />
      </div>
      <div class="">
        <div class="flex items-center justify-between">
          <h4 class="font-semibold">${product.name}</h4>
          ${priceText ? `<span class="text-xs font-semibold">${priceText}</span>` : ""}
        </div>
        <p class="text-[11px] text-zinc-500">${product.short_description || ""}</p>
        <button type="button" class="mt-2 px-5 py-2 rounded-full text-[11px] font-semibold text-white bg-zinc-800 hover:bg-zinc-700 transition rounded-md" data-action="add">
          Ekle
        </button>
      </div>
    `;
    const addBtn = card.querySelector('[data-action="add"]');
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        addToCart(product);
      });
    }
    card.addEventListener("click", (event) => {
      if (event.target && event.target.closest('[data-action="add"]')) return;
      window.location.href = `/product/${product.id}`;
    });
    container.appendChild(card);
  });
  if (pendingAddProductId) {
    const match = products.find((product) => String(product.id) === String(pendingAddProductId));
    if (match) {
      addToCart(match);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("add_product");
    url.searchParams.delete("open_cart");
    window.history.replaceState({}, "", url.pathname + url.hash);
    pendingAddProductId = null;
  }
  if (pendingOpenCart) {
    openCartPanel();
    pendingOpenCart = false;
  }
}

function addToCart(product) {
  if (!product || !product.id) return;
  if (!orderCart[product.id]) {
    orderCart[product.id] = { product, qty: 0 };
  }
  orderCart[product.id].qty += 1;
  renderCart();
  openCartPanel();
  saveCart();
}

function updateCartQty(productId, delta) {
  const item = orderCart[productId];
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    delete orderCart[productId];
  }
  renderCart();
  saveCart();
}

function renderCart() {
  const cart = document.getElementById("order-cart");
  const count = document.getElementById("order-count");
  if (!cart || !count) return;
  cart.innerHTML = "";
  const items = Object.values(orderCart);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const totalAmount = items.reduce((sum, item) => {
    const price = Number(item.product.price);
    if (Number.isNaN(price)) return sum;
    return sum + price * item.qty;
  }, 0);
  count.textContent = `${totalQty} ürün`;
  const totalEl = document.getElementById("order-total-amount");
  const bonusEl = document.getElementById("order-bonus-info");
  const badgeEl = document.getElementById("order-cart-badge");
  if (totalEl) {
    totalEl.textContent = totalAmount ? formatPrice(totalAmount) : "0 ₺";
  }
  if (badgeEl) {
    badgeEl.textContent = String(totalQty);
    badgeEl.classList.toggle("hidden", totalQty === 0);
  }
  if (bonusEl) {
    const messages = [];
    items.forEach((item) => {
      const usage = item.product.usage;
      if (usage === "professional") {
        const freeCount = Math.floor(item.qty / 3);
        if (freeCount > 0) {
          messages.push(`${freeCount} adet ücretsiz ${item.product.name} gönderilecektir.`);
        }
      } else if (usage === "home") {
        const freeCount = Math.floor(item.qty / 5);
        if (freeCount > 0) {
          messages.push(`${freeCount} adet ücretsiz ${item.product.name} gönderilecektir.`);
        }
      }
    });
    bonusEl.innerHTML = messages.length ? messages.map((m) => `<div>${m}</div>`).join("") : "";
  }
  if (!items.length) {
    cart.innerHTML = '<p class="text-sm text-zinc-500">Sepetiniz boş.</p>';
    return;
  }
  items.forEach((item) => {
    const priceText = formatPrice(item.product.price);
    const row = document.createElement("div");
    row.className = "flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm";
    row.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-md bg-white flex items-center justify-center overflow-hidden">
          <img src="./static/img/product-images/${item.product.name}.svg" alt="${item.product.name}" class="h-full w-full object-contain">
        </div>
        <div>
          <p class="font-semibold">${item.product.name}</p>
          ${priceText ? `<p class="text-[11px]">${priceText}</p>` : ""}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="h-7 w-7 rounded-full bg-white text-zinc-600 shadow-sm" data-action="dec">-</button>
        <span class="min-w-[24px] text-center font-semibold">${item.qty}</span>
        <button type="button" class="h-7 w-7 rounded-full bg-white text-zinc-600 shadow-sm" data-action="inc">+</button>
      </div>
    `;
    const decBtn = row.querySelector('[data-action="dec"]');
    const incBtn = row.querySelector('[data-action="inc"]');
    if (decBtn) decBtn.addEventListener("click", () => updateCartQty(item.product.id, -1));
    if (incBtn) incBtn.addEventListener("click", () => updateCartQty(item.product.id, 1));
    cart.appendChild(row);
  });
}

function buildOrderSummary() {
  return Object.values(orderCart)
    .map((item) => `${item.product.name} x${item.qty}`)
    .join(", ");
}

function buildOrderItems() {
  return Object.values(orderCart).map((item) => ({
    product_id: item.product.id,
    name: item.product.name,
    qty: item.qty,
  }));
}

function getTotalQty() {
  return Object.values(orderCart).reduce((sum, item) => sum + item.qty, 0);
}

function openCartPanel() {
  const panel = document.getElementById("cart-panel");
  const overlay = document.getElementById("cart-overlay");
  if (panel) panel.classList.remove("translate-x-full");
  if (overlay) {
    overlay.classList.remove("pointer-events-none", "opacity-0");
    overlay.classList.add("opacity-100");
  }
}

function closeCartPanel() {
  const panel = document.getElementById("cart-panel");
  const overlay = document.getElementById("cart-overlay");
  if (panel) panel.classList.add("translate-x-full");
  if (overlay) {
    overlay.classList.add("pointer-events-none", "opacity-0");
    overlay.classList.remove("opacity-100");
  }
}

function setupOrderActions() {
  const placeOrderBtn = document.getElementById("place-order");
  const openCartBtn = document.getElementById("open-cart");
  const closeCartBtn = document.getElementById("close-cart");
  const overlay = document.getElementById("cart-overlay");
  const confirmOverlay = document.getElementById("order-confirm-overlay");
  const confirmPanel = document.getElementById("order-confirm-panel");
  const confirmText = document.getElementById("order-confirm-text");
  const confirmYes = document.getElementById("order-confirm-yes");
  const confirmNo = document.getElementById("order-confirm-no");
  const confirmClose = document.getElementById("order-confirm-close");
  let confirmBusy = false;
  if (!placeOrderBtn) return;
  renderCart();
  if (openCartBtn) openCartBtn.addEventListener("click", openCartPanel);
  if (closeCartBtn) closeCartBtn.addEventListener("click", closeCartPanel);
  if (overlay) overlay.addEventListener("click", closeCartPanel);

  function openOrderConfirm(message) {
    if (confirmText) confirmText.textContent = message;
    if (confirmOverlay) {
      confirmOverlay.classList.remove("pointer-events-none", "opacity-0");
      confirmOverlay.classList.add("opacity-100");
    }
    if (confirmPanel) {
      confirmPanel.classList.remove("pointer-events-none", "opacity-0");
      confirmPanel.classList.add("opacity-100");
    }
  }

  function closeOrderConfirm() {
    if (confirmOverlay) {
      confirmOverlay.classList.add("pointer-events-none", "opacity-0");
      confirmOverlay.classList.remove("opacity-100");
    }
    if (confirmPanel) {
      confirmPanel.classList.add("pointer-events-none", "opacity-0");
      confirmPanel.classList.remove("opacity-100");
    }
  }

  async function submitOrder() {
    if (confirmBusy) return;
    confirmBusy = true;
    placeOrderBtn.disabled = true;
    try {
      const order = buildOrderSummary();
      const payloadItems = buildOrderItems();
      const totalQty = getTotalQty();
      await fetchJSON("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, items: payloadItems, total_qty: totalQty }),
      });
      showToast("Siparişiniz alındı.", { type: "success" });
      Object.keys(orderCart).forEach((key) => delete orderCart[key]);
      saveCart();
      renderCart();
      closeCartPanel();
      closeOrderConfirm();
    } catch (err) {
      const message = err && err.message ? err.message : "Sipariş gönderilemedi.";
      if (message === "missing_phone") {
        showToast("Profil kısmından telefon numaranızı doldurunuz.", { type: "error" });
      } else {
        showToast(message, { type: "error" });
      }
    } finally {
      placeOrderBtn.disabled = false;
      confirmBusy = false;
    }
  }

  if (confirmOverlay) confirmOverlay.addEventListener("click", closeOrderConfirm);
  if (confirmNo) confirmNo.addEventListener("click", closeOrderConfirm);
  if (confirmClose) confirmClose.addEventListener("click", closeOrderConfirm);
  if (confirmYes) confirmYes.addEventListener("click", submitOrder);

  placeOrderBtn.addEventListener("click", () => {
    const items = Object.values(orderCart);
    if (!items.length) {
      showToast("Sepetiniz boş.", { type: "error" });
      return;
    }
    if (!currentUserPhone) {
      showToast("Profil kısmından telefon numaranızı doldurunuz.", { type: "error" });
      return;
    }
    const totalAmount = items.reduce((sum, item) => {
      const price = Number(item.product.price);
      if (Number.isNaN(price)) return sum;
      return sum + price * item.qty;
    }, 0);
    const formattedTotal = Number.isFinite(totalAmount)
      ? totalAmount.toLocaleString("tr-TR")
      : "0";
    const message = items
      .map((item) => `${item.qty} adet ${item.product.name}`)
      .join(", ")
      .concat(`. Toplam: ${formattedTotal} ₺. Siparişiniz onaylansın mı? Not: Sipariş onayından sonra size Whatsapp üzerinden Mail-order linki gönderilecektir.`);
    openOrderConfirm(message);
  });
}

function openWorkshopSignup(workshop) {
  const overlay = document.getElementById("workshop-signup-overlay");
  const panel = document.getElementById("workshop-signup-panel");
  const nameInput = document.getElementById("signup-name");
  const phoneInput = document.getElementById("signup-phone");
  const titleInput = document.getElementById("signup-title");
  const dateInput = document.getElementById("signup-date");
  const locationInput = document.getElementById("signup-location");
  if (!overlay || !panel) return;
  if (nameInput) nameInput.value = "";
  if (phoneInput) phoneInput.value = "";
  if (titleInput) titleInput.value = workshop.title || workshop.workshop || "";
  if (dateInput) dateInput.value = formatWorkshopDate(workshop.date || "");
  if (locationInput) locationInput.value = workshop.location || "";
  overlay.classList.remove("pointer-events-none", "opacity-0");
  overlay.classList.add("opacity-100");
  panel.classList.remove("pointer-events-none", "opacity-0");
  panel.classList.add("opacity-100");
}

function closeWorkshopSignup() {
  const overlay = document.getElementById("workshop-signup-overlay");
  const panel = document.getElementById("workshop-signup-panel");
  if (!overlay || !panel) return;
  overlay.classList.add("pointer-events-none", "opacity-0");
  overlay.classList.remove("opacity-100");
  panel.classList.add("pointer-events-none", "opacity-0");
  panel.classList.remove("opacity-100");
}

async function copyTextValue(value) {
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      showToast("Panoya kaydedildi.", { type: "success" });
      return;
    }
  } catch (err) {
    console.warn("Clipboard copy failed", err);
  }
}

function setupWorkshopSignup() {
  const form = document.getElementById("workshop-signup-form");
  const closeBtn = document.getElementById("workshop-signup-close");
  const overlay = document.getElementById("workshop-signup-overlay");
  if (closeBtn) closeBtn.addEventListener("click", closeWorkshopSignup);
  if (overlay) overlay.addEventListener("click", closeWorkshopSignup);
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = form.signup_name.value.trim();
    const phoneRaw = form.signup_phone.value.trim();
    const title = form.signup_title.value.trim();
    const date = form.signup_date.value.trim();
    const location = form.signup_location.value.trim();
    const phone = buildFullPhone("+90", phoneRaw);
    if (!name || !phone || !title) {
      showToast("Lütfen ad, telefon ve workshop bilgilerini doldurun.", { type: "error" });
      return;
    }
    try {
      await fetchJSON("/api/workshops/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, title, date, location }),
      });
      showToast("Workshop başvurunuz alındı.", { type: "success" });
      closeWorkshopSignup();
    } catch (err) {
      const message = err && err.message ? err.message : "Başvuru gönderilemedi.";
      showToast(message, { type: "error" });
    }
  });
}

function getLiveWorkshopHeroTarget() {
  if (!latestWorkshops.length) return null;
  return latestWorkshops.find((workshop) => workshop.live_status === "live") || latestWorkshops[0];
}

function renderLiveWorkshopHero() {
  const statusEl = document.getElementById("live-workshop-hero-status");
  const actionsEl = document.getElementById("live-workshop-hero-actions");
  if (!statusEl || !actionsEl) return;
  actionsEl.innerHTML = "";
  const target = getLiveWorkshopHeroTarget();
  if (!target) {
    statusEl.textContent = "Henüz aktif yayın yok.";
    return;
  }
  if (target.live_status === "live") {
    statusEl.textContent = `${target.title || "Workshop"} şu anda yayında.`;
    if (!isGuestUser) {
      const joinBtn = document.createElement("button");
      joinBtn.type = "button";
      joinBtn.className = "rounded-sm px-4 py-2 border border-gray-200 bg-white text-zinc-700 text-sm font-semibold hover:bg-gray-100";
      joinBtn.textContent = "Yayına Katıl";
      joinBtn.addEventListener("click", () => joinWorkshopLive(target));
      actionsEl.appendChild(joinBtn);
    }
    if (isElevatedRole()) {
      const endBtn = document.createElement("button");
      endBtn.type = "button";
      endBtn.className = "rounded-sm px-4 py-2 border border-red-200 bg-white text-sm font-semibold text-red-600 hover:bg-red-600 hover:text-white";
      endBtn.textContent = "Yayını Bitir";
      endBtn.addEventListener("click", () => endWorkshopLive(target));
      actionsEl.appendChild(endBtn);
    }
    return;
  }
  statusEl.textContent = `${target.title || "Workshop"} için yayın henüz başlamadı.`;
  if (isElevatedRole()) {
    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "rounded-sm px-4 py-2 border border-gray-200 bg-white text-zinc-700 text-sm font-semibold cursor-pointer hover:bg-gray-100 transition";
    startBtn.textContent = "Yayın Oluştur";
    startBtn.addEventListener("click", () => startWorkshopLive(target));
    actionsEl.appendChild(startBtn);
  }
}

async function enrichWorkshopLiveStates(workshops) {
  const items = Array.isArray(workshops) ? workshops.filter(Boolean) : [];
  if (!items.length) return [];
  const liveAware = await Promise.all(
    items.map(async (workshop) => {
      try {
        const live = await fetchJSON(`/api/workshops/${workshop.id}/live`);
        return { ...workshop, ...live };
      } catch (err) {
        return {
          ...workshop,
          live_status: "idle",
          can_join: false,
        };
      }
    })
  );
  return liveAware;
}

function createWorkshopLiveActions(workshop) {
  const isLive = workshop.live_status === "live";
  const buttons = [];
  if (isLive) {
    if (!isGuestUser) {
      buttons.push(`
        <button type="button" class="rounded-sm px-3 py-2 border border-gray-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-gray-100" data-live-action="join">
          Yayına Katıl
        </button>
      `);
    }
    if (isElevatedRole()) {
      buttons.push(`
        <button type="button" class="rounded-sm px-3 py-2 border border-red-200 bg-white text-red-600 text-xs font-semibold hover:bg-red-600 hover:text-white" data-live-action="end">
          Yayını Bitir
        </button>
      `);
    }
  } else if (isElevatedRole()) {
    buttons.push(`
      <button type="button" class="rounded-sm cursor-pointer px-3 py-2 border border-gray-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-gray-100 transition" data-live-action="start">
        Yayın Oluştur
      </button>
    `);
  }
  return buttons.join("");
}

function createParticipantCard(identity, label) {
  const card = document.createElement("div");
  card.className = "rounded-sm border border-gray-200 bg-white overflow-hidden relative";
  card.dataset.identity = identity;
  card.innerHTML = `
    <div class="absolute left-3 top-3 z-10 rounded-sm border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700">${escapeHTML(label)}</div>
    <div class="participant-media h-full w-full bg-gray-50 flex items-center justify-center text-sm text-zinc-500">Bağlantı bekleniyor...</div>
    <div class="participant-audio"></div>
  `;
  return card;
}

function attachTrackToCard(track, card) {
  if (!track || !card) return;
  const element = track.attach();
  const isScreenTrack = track.kind === "video" && String(track.name || "").toLowerCase() === "screen";
  if (track.kind === "audio") {
    const audioHost = card.querySelector(".participant-audio");
    const media = card.querySelector(".participant-media");
    if (!audioHost || !media) return;
    Array.from(audioHost.children).forEach((child) => child.remove());
    element.autoplay = true;
    element.playsInline = true;
    if (card.dataset.identity === liveWorkshopRoom?.localParticipant?.identity) {
      element.muted = true;
      return;
    }
    audioHost.appendChild(element);
    if (!card.querySelector("[data-audio-badge='true']")) {
      const badge = document.createElement("div");
      badge.dataset.audioBadge = "true";
      badge.className = "absolute right-3 bottom-3 z-10 rounded-sm border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700";
      badge.textContent = "Ses açık";
      card.appendChild(badge);
    }
    if (!media.querySelector("video")) {
      media.className = "participant-media h-full w-full bg-gray-50 flex items-center justify-center text-sm text-zinc-600";
      media.innerHTML = `<div class="rounded-sm border border-gray-200 bg-white px-4 py-2">Ses bağlı</div>`;
    }
    return;
  }
  const media = card.querySelector(".participant-media");
  if (!media) return;
  media.innerHTML = "";
  element.className = `h-full w-full ${isScreenTrack || liveViewerMode ? "object-contain bg-black" : "object-cover"}`;
  if (track.kind === "video") {
    element.setAttribute("playsinline", "true");
    media.className = `participant-media h-full w-full ${isScreenTrack || liveViewerMode ? "bg-black" : "bg-gray-50"} flex items-center justify-center text-sm text-zinc-500`;
    media.appendChild(element);
  } else {
    media.className = "participant-media h-full w-full bg-gray-50 flex items-center justify-center text-sm text-zinc-600";
    media.innerHTML = `<div class="rounded-sm border border-gray-200 bg-white px-4 py-2">Ses bağlı</div>`;
    media.appendChild(element);
  }
}

function getPrimaryVideoTrack(participant) {
  const tracks = Array.from(participant.tracks.values())
    .map((publication) => publication.track)
    .filter((track) => track?.kind === "video");
  const screenTrack = tracks.find((track) => track.kind === "video" && String(track.name || "").toLowerCase() === "screen");
  if (screenTrack) return screenTrack;
  return tracks[0] || null;
}

function getParticipantAudioTracks(participant) {
  return Array.from(participant.audioTracks?.values?.() || [])
    .map((publication) => publication.track)
    .filter(Boolean);
}

function getParticipantDisplayName(identity) {
  if (!identity) return "Katılımcı";
  if (identity.startsWith("student:")) {
    const parts = identity.split(":");
    if (parts[2]) {
      try {
        return toTitleCase(decodeURIComponent(parts.slice(2).join(":")));
      } catch (err) {
        return toTitleCase(parts.slice(2).join(":").replace(/-/g, " "));
      }
    }
    if (parts[1]) return `Uzman ${parts[1]}`.trim();
    return "Katılımcı";
  }
  if (identity.startsWith("user:")) {
    try {
      return toTitleCase(decodeURIComponent(identity.split("user:")[1]));
    } catch (err) {
      return toTitleCase(identity.split("user:")[1].replace(/-/g, " "));
    }
  }
  return toTitleCase(identity);
}

function detachParticipantTracks(participant) {
  if (!participant?.tracks) return;
  Array.from(participant.tracks.values())
    .map((publication) => publication.track)
    .filter(Boolean)
    .forEach((track) => {
      track.detach().forEach((element) => element.remove());
    });
}

async function createLiveAudioTrack() {
  const baseOptions = {
    echoCancellation: true,
    autoGainControl: true,
  };
  if (twilioKrispAssetsPath) {
    try {
      return await window.Twilio.Video.createLocalAudioTrack({
        ...baseOptions,
        noiseSuppression: false,
        noiseCancellationOptions: {
          sdkAssetsPath: twilioKrispAssetsPath,
          vendor: "krisp",
        },
      });
    } catch (err) {
      console.warn("Krisp audio track creation failed, falling back to browser suppression", err);
    }
  }
  return window.Twilio.Video.createLocalAudioTrack({
    ...baseOptions,
    noiseSuppression: true,
  });
}

function stopLocalParticipantTracks(room) {
  if (!room?.localParticipant?.tracks) return;
  Array.from(room.localParticipant.tracks.values())
    .map((publication) => publication.track)
    .filter(Boolean)
    .forEach((track) => {
      try {
        track.stop();
      } catch (err) {
        console.warn("Track stop failed", err);
      }
      track.detach().forEach((element) => element.remove());
    });
}

async function ensureLiveAudioPublished() {
  if (!liveWorkshopRoom) return null;
  const currentTrack = Array.from(liveWorkshopRoom.localParticipant.audioTracks.values())
    .map((publication) => publication.track)
    .find(Boolean);
  if (currentTrack) {
    if (!currentTrack.isEnabled) currentTrack.enable();
    return currentTrack;
  }
  const newTrack = await createLiveAudioTrack();
  await liveWorkshopRoom.localParticipant.publishTrack(newTrack);
  return newTrack;
}

function getFeaturedParticipantIdentity(participants) {
  const shared = participants.find((participant) => {
    const track = getPrimaryVideoTrack(participant);
    return track?.kind === "video" && String(track.name || "").toLowerCase() === "screen";
  });
  const fallback = shared || participants[0] || null;
  return fallback?.identity || null;
}

function renderRoomParticipants() {
  const stage = document.getElementById("live-workshop-stage-page");
  const list = document.getElementById("live-participant-list-page");
  const summary = document.getElementById("live-participant-summary-page");
  if (!stage || !list) return;
  stage.innerHTML = "";
  list.innerHTML = "";
  if (!liveWorkshopRoom) {
    stage.innerHTML = '<div class="md:col-span-2 rounded-sm border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-zinc-500">Canlı oda açık değil.</div>';
    if (summary) summary.textContent = "Henüz kimse bağlanmadı.";
    return;
  }
  const participants = [
    liveWorkshopRoom.localParticipant,
    ...Array.from(liveWorkshopRoom.participants.values()).filter((participant) => participant.state !== "disconnected"),
  ];
  const featuredIdentity = getFeaturedParticipantIdentity(participants);
  participants.forEach((participant, index) => {
    if (liveViewerMode && featuredIdentity && participant.identity !== featuredIdentity) {
      return;
    }
    const identity = participant.identity || `participant-${index}`;
    const isLocal = participant === liveWorkshopRoom.localParticipant;
    const label = isLocal ? "Sen" : getParticipantDisplayName(identity);
    const card = createParticipantCard(identity, label);
    stage.appendChild(card);
    const preferredTrack = getPrimaryVideoTrack(participant);
    if (preferredTrack) attachTrackToCard(preferredTrack, card);
    getParticipantAudioTracks(participant).forEach((track) => attachTrackToCard(track, card));
    const row = document.createElement("div");
    row.className = "rounded-sm border border-gray-200 bg-white px-3 py-2";
    row.innerHTML = `
      <p class="text-sm font-semibold text-zinc-800">${escapeHTML(label)}</p>
      <p class="text-xs text-zinc-500">${isLocal ? "Yerel yayın" : "Canlı bağlı"}</p>
    `;
    list.appendChild(row);
  });
  if (summary) {
    summary.textContent = `${participants.length} katılımcı odada.`;
  }
}

function bindParticipantEvents(participant) {
  if (!participant) return;
  participant.on("trackSubscribed", () => renderRoomParticipants());
  participant.on("trackUnsubscribed", () => renderRoomParticipants());
  participant.on("trackPublished", () => renderRoomParticipants());
  participant.on("trackUnpublished", () => renderRoomParticipants());
}

function updateLiveControlLabels() {
  const audioBtn = document.getElementById("live-toggle-audio-page");
  const videoBtn = document.getElementById("live-toggle-video-page");
  const screenBtn = document.getElementById("live-toggle-screen-page");
  const endBtn = document.getElementById("live-end-session-page");
  const roomStatus = document.getElementById("live-room-status-page");
  if (!liveWorkshopRoom) return;
  const localParticipant = liveWorkshopRoom.localParticipant;
  const audioTrack = Array.from(localParticipant.audioTracks.values()).map((pub) => pub.track).find(Boolean);
  const videoTrack = Array.from(localParticipant.videoTracks.values()).map((pub) => pub.track).find((track) => track !== liveWorkshopScreenTrack) || null;
  if (audioBtn) audioBtn.textContent = audioTrack?.isEnabled ? "Mikrofonu Kapat" : "Mikrofonu Aç";
  if (videoBtn) videoBtn.textContent = videoTrack?.isEnabled ? "Kamerayı Kapat" : "Kamerayı Aç";
  if (screenBtn) {
    screenBtn.textContent = liveWorkshopScreenTrack ? "Paylaşımı Durdur" : "Ekran Paylaş";
    screenBtn.classList.toggle("hidden", !isElevatedRole());
  }
  if (endBtn) endBtn.classList.toggle("hidden", !isElevatedRole());
  if (roomStatus) {
    roomStatus.textContent = "";
  }
}

function syncLiveParticipantsPanel() {
  const panel = document.getElementById("live-participants-panel");
  const shell = document.getElementById("live-workshop-shell");
  const toggle = document.getElementById("live-participants-toggle");
  if (!panel || !shell || !toggle) return;
  panel.classList.toggle("hidden", liveParticipantsCollapsed);
  if (liveParticipantsCollapsed) {
    shell.classList.remove("md:grid-cols-[minmax(0,1fr)_20rem]");
    shell.classList.add("md:grid-cols-1");
  } else {
    shell.classList.add("md:grid-cols-[minmax(0,1fr)_20rem]");
    shell.classList.remove("md:grid-cols-1");
  }
  toggle.textContent = liveParticipantsCollapsed ? "Katılımcıları Aç" : "Katılımcıları Kapat";
}

function applyLiveViewerMode() {
  const root = document.getElementById("canli-workshop");
  const header = document.getElementById("live-workshop-header-page");
  const controls = document.getElementById("live-workshop-controls-page");
  const panel = document.getElementById("live-participants-panel");
  const shell = document.getElementById("live-workshop-shell");
  const stage = document.getElementById("live-workshop-stage-page");
  const button = document.getElementById("live-fullscreen-toggle");
  const viewerBar = document.getElementById("live-viewer-exit-bar");
  if (!root || !header || !controls || !panel || !shell || !stage || !button) return;
  header.classList.toggle("hidden", liveViewerMode);
  controls.classList.toggle("hidden", liveViewerMode);
  panel.classList.toggle("hidden", liveViewerMode || liveParticipantsCollapsed);
  if (viewerBar) viewerBar.classList.toggle("hidden", !liveViewerMode);
  shell.classList.toggle("p-0", liveViewerMode);
  shell.classList.toggle("p-4", !liveViewerMode);
  shell.classList.toggle("md:p-6", !liveViewerMode);
  shell.classList.toggle("pb-28", !liveViewerMode);
  stage.classList.toggle("min-h-screen", liveViewerMode);
  stage.classList.toggle("min-h-[calc(100vh-14rem)]", !liveViewerMode);
  button.textContent = liveViewerMode || document.fullscreenElement ? "Tam Ekrandan Çık" : "Tam Ekran";
  renderRoomParticipants();
}

async function closeLiveWorkshopPanel({ keepRoomState = false } = {}) {
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch (err) {
      console.warn("Fullscreen exit failed", err);
    }
  }
  if (liveWorkshopRefreshTimer) {
    window.clearInterval(liveWorkshopRefreshTimer);
    liveWorkshopRefreshTimer = null;
  }
  if (!keepRoomState && liveWorkshopRoom) {
    detachParticipantTracks(liveWorkshopRoom.localParticipant);
    liveWorkshopRoom.participants.forEach((participant) => detachParticipantTracks(participant));
    stopLocalParticipantTracks(liveWorkshopRoom);
    liveWorkshopRoom.disconnect();
    liveWorkshopRoom = null;
  }
  if (liveWorkshopScreenTrack) {
    liveWorkshopScreenTrack.stop();
    liveWorkshopScreenTrack = null;
  }
  liveWorkshopCurrent = null;
  liveViewerMode = false;
  renderRoomParticipants();
  applyLiveViewerMode();
  goToSection("yaklasan-workshoplar", { replace: true });
}

function openLiveWorkshopPanel(workshop, subtitle = "") {
  const title = document.getElementById("live-workshop-title-page");
  const subtitleEl = document.getElementById("live-workshop-subtitle-page");
  liveWorkshopCurrent = workshop;
  liveParticipantsCollapsed = false;
  liveViewerMode = false;
  syncLiveParticipantsPanel();
  applyLiveViewerMode();
  if (title) title.textContent = workshop?.title || "Workshop yayını";
  if (subtitleEl) subtitleEl.textContent = subtitle || [formatWorkshopDate(workshop?.date || ""), workshop?.location || ""].filter(Boolean).join(" • ");
  goToSection("canli-workshop");
}

function setLiveWorkshopSubtitle(text = "") {
  const subtitleEl = document.getElementById("live-workshop-subtitle-page");
  if (!subtitleEl) return;
  subtitleEl.textContent = text || "";
}

async function connectToWorkshopRoom(workshop, endpoint) {
  if (!window.Twilio?.Video) {
    showToast("Twilio Video SDK yüklenemedi.", { type: "error" });
    return;
  }
  const payload = await fetchJSON(endpoint, { method: "POST" });
  openLiveWorkshopPanel(workshop, "Kamera ve mikrofon hazırlanıyor...");
  let audioTrack = null;
  let videoTrack = null;
  let localTracks = [];
  try {
    try {
      audioTrack = await createLiveAudioTrack();
    } catch (audioErr) {
      console.warn("Audio track creation failed", audioErr);
    }
    try {
      videoTrack = await window.Twilio.Video.createLocalVideoTrack({
        width: 1280,
        facingMode: "user",
      });
    } catch (videoErr) {
      console.warn("Video track creation failed", videoErr);
    }
    localTracks = [audioTrack, videoTrack].filter(Boolean);
    if (!localTracks.length) {
      throw new Error("Kamera veya mikrofon açılamadı.");
    }
    liveWorkshopRoom = await window.Twilio.Video.connect(payload.token, {
      name: payload.room_name,
      tracks: localTracks,
      dominantSpeaker: true,
      networkQuality: { local: 1, remote: 1 },
    });
    await ensureLiveAudioPublished();
  } catch (err) {
    [audioTrack, videoTrack].filter(Boolean).forEach((track) => {
      try {
        track.stop();
      } catch (stopErr) {
        console.warn("Local track stop failed", stopErr);
      }
    });
    await closeLiveWorkshopPanel();
    throw err;
  }
  liveWorkshopRoom.participants.forEach((participant) => bindParticipantEvents(participant));
  liveWorkshopRoom.on("participantConnected", (participant) => {
    bindParticipantEvents(participant);
    renderRoomParticipants();
  });
  liveWorkshopRoom.on("participantDisconnected", (participant) => {
    detachParticipantTracks(participant);
    renderRoomParticipants();
    window.setTimeout(() => renderRoomParticipants(), 0);
  });
  liveWorkshopRoom.on("disconnected", () => {
    liveWorkshopRoom = null;
    renderRoomParticipants();
    loadWorkshop();
    if (window.location.hash.replace("#", "") === "canli-workshop") {
      goToSection("yaklasan-workshoplar", { replace: true });
    }
  });
  renderRoomParticipants();
  setLiveWorkshopSubtitle([formatWorkshopDate(workshop?.date || ""), workshop?.location || ""].filter(Boolean).join(" • ") || "Canlı workshop");
  updateLiveControlLabels();
  liveWorkshopRefreshTimer = window.setInterval(() => loadWorkshop(), 15000);
}

async function startWorkshopLive(workshop) {
  try {
    await connectToWorkshopRoom(workshop, `/api/workshops/${workshop.id}/start-room`);
    showToast("Canlı yayın başlatıldı.", { type: "success" });
    await loadWorkshop();
  } catch (err) {
    showToast(err.message || "Canlı yayın başlatılamadı.", { type: "error" });
  }
}

async function joinWorkshopLive(workshop) {
  try {
    await connectToWorkshopRoom(workshop, `/api/workshops/${workshop.id}/join-token`);
    showToast("Canlı odaya katıldın.", { type: "success" });
  } catch (err) {
    showToast(err.message || "Canlı odaya katılamadın.", { type: "error" });
  }
}

async function endWorkshopLive(workshop) {
  try {
    await fetchJSON(`/api/workshops/${workshop.id}/end-room`, { method: "POST" });
    await closeLiveWorkshopPanel();
    showToast("Canlı yayın kapatıldı.", { type: "success" });
    await loadWorkshop();
  } catch (err) {
    showToast(err.message || "Yayın kapatılamadı.", { type: "error" });
  }
}

function setupLiveWorkshopUI() {
  const closeBtn = document.getElementById("live-workshop-close-page");
  const leaveBtn = document.getElementById("live-leave-session-page");
  const endBtn = document.getElementById("live-end-session-page");
  const audioBtn = document.getElementById("live-toggle-audio-page");
  const videoBtn = document.getElementById("live-toggle-video-page");
  const screenBtn = document.getElementById("live-toggle-screen-page");
  const fullscreenBtn = document.getElementById("live-fullscreen-toggle");
  const participantsBtn = document.getElementById("live-participants-toggle");
  const liveRoot = document.getElementById("canli-workshop");
  const viewerCloseBtn = document.getElementById("live-viewer-close");
  const viewerFullscreenExitBtn = document.getElementById("live-viewer-fullscreen-exit");
  closeBtn?.addEventListener("click", () => closeLiveWorkshopPanel());
  leaveBtn?.addEventListener("click", () => closeLiveWorkshopPanel());
  viewerCloseBtn?.addEventListener("click", () => closeLiveWorkshopPanel());
  viewerFullscreenExitBtn?.addEventListener("click", async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (err) {
        console.warn("Fullscreen exit failed", err);
      }
    }
    liveViewerMode = false;
    applyLiveViewerMode();
  });
  endBtn?.addEventListener("click", async () => {
    const workshop = liveWorkshopCurrent || getLiveWorkshopHeroTarget();
    if (!workshop) return;
    await endWorkshopLive(workshop);
  });
  participantsBtn?.addEventListener("click", () => {
    liveParticipantsCollapsed = !liveParticipantsCollapsed;
    syncLiveParticipantsPanel();
    applyLiveViewerMode();
  });
  fullscreenBtn?.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement && !liveViewerMode) {
        if (liveRoot?.requestFullscreen) {
          await liveRoot.requestFullscreen();
        } else {
          liveViewerMode = true;
          applyLiveViewerMode();
        }
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        liveViewerMode = false;
        applyLiveViewerMode();
      }
      if (!document.fullscreenElement && !liveViewerMode && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "")) {
        liveViewerMode = true;
        applyLiveViewerMode();
      }
    } catch (err) {
      liveViewerMode = !liveViewerMode;
      applyLiveViewerMode();
      if (!liveViewerMode) {
        showToast("Tam ekran açılamadı.", { type: "error" });
      } else {
        showToast("Tam ekran görünümü açıldı.", { type: "success" });
      }
    }
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && liveViewerMode) return;
    applyLiveViewerMode();
  });
  audioBtn?.addEventListener("click", () => {
    (async () => {
      try {
        const track = await ensureLiveAudioPublished();
        if (!track) return;
        if (track.isEnabled) track.disable();
        else track.enable();
        updateLiveControlLabels();
      } catch (err) {
        showToast("Mikrofon açılamadı.", { type: "error" });
      }
    })();
  });
  videoBtn?.addEventListener("click", () => {
    const track = liveWorkshopRoom
      ? Array.from(liveWorkshopRoom.localParticipant.videoTracks.values()).map((pub) => pub.track).find((item) => item !== liveWorkshopScreenTrack) || null
      : null;
    if (!track) return;
    if (track.isEnabled) track.disable();
    else track.enable();
    updateLiveControlLabels();
    renderRoomParticipants();
  });
  screenBtn?.addEventListener("click", async () => {
    if (!liveWorkshopRoom || !isElevatedRole()) return;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) {
        showToast("Ekran paylaşımı için güvenli bağlantı (HTTPS/ngrok) gerekli.", { type: "error" });
        return;
      }
      if (liveWorkshopScreenTrack) {
        liveWorkshopRoom.localParticipant.unpublishTrack(liveWorkshopScreenTrack);
        liveWorkshopScreenTrack.stop();
        liveWorkshopScreenTrack = null;
      } else {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const [screenMediaTrack] = stream.getVideoTracks();
        if (!screenMediaTrack) return;
        liveWorkshopScreenTrack = new window.Twilio.Video.LocalVideoTrack(screenMediaTrack, { name: "screen" });
        await liveWorkshopRoom.localParticipant.publishTrack(liveWorkshopScreenTrack);
        screenMediaTrack.addEventListener("ended", () => {
          if (!liveWorkshopScreenTrack || !liveWorkshopRoom) return;
          liveWorkshopRoom.localParticipant.unpublishTrack(liveWorkshopScreenTrack);
          liveWorkshopScreenTrack.stop();
          liveWorkshopScreenTrack = null;
          updateLiveControlLabels();
          renderRoomParticipants();
        }, { once: true });
      }
      updateLiveControlLabels();
      renderRoomParticipants();
    } catch (err) {
      const message = err?.name === "NotAllowedError"
        ? "Ekran paylaşımı izni verilmedi."
        : "Ekran paylaşımı başlatılamadı.";
      showToast(message, { type: "error" });
    }
  });
}

async function loadRules() {
  const container = document.getElementById("rule-list");
  if (!container) return;
  container.innerHTML = "";
  const rules = await fetchJSON("/api/rules");
  rules.forEach((rule) => {
    const item = document.createElement("div");
    const description = rule.description || "";
    const formattedDescription = description.includes("•") ? description.split("•").map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => `• ${chunk}`).join("<br>") : description;
    item.className = "p-3 border border-gray-200 rounded-lg";
    item.innerHTML = `
      <div class="flex items-center justify-between">
        <h4 class="font-semibold"> ${rule.title} </h4>
      </div>
      <p class="text-sm text-zinc-600">${formattedDescription}</p>
    `;
    container.appendChild(item);
  });
}

async function loadQuickTips() {
  const container = document.getElementById("quick-list");
  const search = document.getElementById("quick-search");
  if (!container || !search) return;
  quickTips = await fetchJSON("/api/quick-tips");
  const render = () => {
    container.innerHTML = "";
    const term = search.value.toLowerCase().trim();
    if (!term) return; // do not show tips until there is input
    quickTips
      .filter((tip) => {
        const text = (tip.tip || tip.problem || "").toLowerCase();
        const solution = (tip.solution || "").toLowerCase();
        return text.includes(term) || solution.includes(term);
      })
      .forEach((tip) => {
        const text = tip.tip || tip.problem || "";
        const dashIndex = text.indexOf("—");
        const question = dashIndex >= 0 ? text.slice(0, dashIndex).trim() : text.trim();
        const answer = dashIndex >= 0 ? text.slice(dashIndex + 1).trim() : (tip.solution || "").trim();
        const row = document.createElement("div");
        row.className = "p-3 rounded-xl bg-white border border-gray-200 text-sm space-y-1";
        row.innerHTML = `
          <p class="font-semibold">Sorun: ${question}</p>
          <p class="text-zinc-600">Cevap: ${answer}</p>
        `;
        container.appendChild(row);
      });
  };
  search.addEventListener("input", render);
  render();
}

async function loadEducation() {
  const data = await fetchJSON("/api/education");
  const grouped = {
    kullanim: [],
    uyari: [],
    aftercare: [],
    kontrendikasyon: [],
  };
  const normalizeEducationCategory = (value) => {
    if (!value) return "";
    const raw = String(value).toLowerCase().trim();
    const normalized = raw
      .replace(/[ı]/g, "i")
      .replace(/[ş]/g, "s")
      .replace(/[ğ]/g, "g")
      .replace(/[ü]/g, "u")
      .replace(/[ö]/g, "o")
      .replace(/[ç]/g, "c")
      .replace(/[^a-z0-9]+/g, " ");
    if (normalized.includes("uyari") || normalized.includes("warning")) return "uyari";
    if (normalized.includes("aftercare") || normalized.includes("bakim") || normalized.includes("sonrasi")) return "aftercare";
    if (normalized.includes("kontrendikasyon") || normalized.includes("kontra")) return "kontrendikasyon";
    if (normalized.includes("kullanim") || normalized.includes("kullan")) return "kullanim";
    return normalized.replace(/\s+/g, "");
  };
  if (Array.isArray(data)) {
    data.forEach((item) => {
      const cat = normalizeEducationCategory(item.category);
      if (grouped[cat]) {
        grouped[cat].push(item);
      } else {
        grouped.uyari.push(item);
      }
    });
  } else if (data && typeof data === "object") {
    grouped.kullanim = data.kullanim || [];
    grouped.uyari = data.uyari || [];
    grouped.aftercare = data.aftercare || [];
    grouped.kontrendikasyon = data.kontrendikasyon || [];
  }
  // Clear and render all categories
  ["education-kullanim", "education-uyari", "education-aftercare", "education-kontrendikasyon"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });
  renderEducationGroup("education-kullanim", grouped.kullanim, );
  renderEducationGroup("education-uyari", grouped.uyari);
  renderEducationGroup("education-aftercare", grouped.aftercare);
  renderEducationGroup("education-kontrendikasyon", grouped.kontrendikasyon);
}

function renderEducationGroup(containerId, items = [], title) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  const header = document.createElement("p");
  header.className = "text-xs uppercase tracking-wide text-zinc-400";
  header.textContent = title;
  container.appendChild(header);
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "p-3 rounded-xl bg-white border border-gray-200 text-sm space-y-1";
    row.innerHTML = `
      <p class="font-semibold">${item.title}</p>
      <p class="text-zinc-600">${formatTextWithLineBreaks(item.content)}</p>
    `;
    container.appendChild(row);
  });
}

async function loadCampaigns() {
  const container = document.getElementById("campaign-list");
  if (!container) return;
  container.innerHTML = "";
  const campaigns = await fetchJSON("/api/campaigns");
  const adminList = document.getElementById("campaign-admin-list");
  if (adminList) adminList.innerHTML = "";
  const list = Array.isArray(campaigns) ? campaigns : [];
  if (!list.length) {
    container.innerHTML = '<p class="text-sm text-zinc-600">Henüz kampanya yok.</p>';
    if (adminList) {
      adminList.innerHTML = '<p class="text-sm text-zinc-500">Kampanya bulunamadı.</p>';
    }
    return;
  }
  const now = new Date();
  list.forEach((c) => {
    const start = new Date(c.starts_at);
    const end = new Date(c.ends_at);
    const isActive = start <= now && end >= now;
    const badge = "Kampanya";
    const card = document.createElement("div");
    card.className = "rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm";
    card.innerHTML = `
      <div class="h-36 w-full bg-gray-100 overflow-hidden relative">
        <img src="../static/img/logo-transparent.png" alt="${c.name}" class="w-full h-full object-cover">
        <span class="absolute top-3 right-3 text-xs px-2 py-1 rounded-lg ${isActive ? "bg-zinc-900 text-white" : "bg-gray-50 text-zinc-700"}">
          ${badge}
        </span>
      </div>
      <div class="p-3 space-y-1">
        <p class="font-semibold">${c.name}</p>
        <p class="text-sm text-zinc-600">${c.description}</p>
        <p class="text-xs text-zinc-500">Başlangıç: ${c.starts_at.slice(0,9)} <br /> Bitiş: ${c.ends_at.slice(0,9)}</p>
      </div>
    `;
    container.appendChild(card);
    if (adminList && isElevatedRole()) {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm";
      row.innerHTML = `
        <div>
          <p class="font-semibold">${c.name}</p>
          <p class="text-xs text-zinc-500">${c.starts_at} - ${c.ends_at}</p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="px-3 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-zinc-600" data-action="edit">Düzenle</button>
          <button type="button" class="px-3 py-1 rounded-lg border border-red-200 text-xs font-semibold text-red-600" data-action="delete">Sil</button>
        </div>
      `;
      const editBtn = row.querySelector('[data-action="edit"]');
      const deleteBtn = row.querySelector('[data-action="delete"]');
      if (editBtn) {
        editBtn.addEventListener("click", () => setCampaignFormEditing(c));
      }
      if (deleteBtn) {
        attachDeletePopover(deleteBtn, {
          message: "Kampanya silinsin mi?",
          onConfirm: async () => {
            await fetchJSON(`/api/campaigns/${c.id}`, { method: "DELETE" });
            showToast("Kampanya silindi.", { type: "success" });
            await loadCampaigns();
          },
          onError: () => {
            showToast("Kampanya silinemedi.", { type: "error" });
          },
        });
      }
      adminList.appendChild(row);
    }
  });
}

async function loadWorkshop() {
  const container = document.getElementById("next-workshop");
  if (!container) return;
  container.innerHTML = "";
  let list = [];
  try {
    const workshops = await fetchJSON("/api/workshops");
    list = await enrichWorkshopLiveStates(Array.isArray(workshops) ? workshops : []);
  } catch (err) {
    latestWorkshops = [];
    renderLiveWorkshopHero();
    container.innerHTML = '<p class="text-sm text-zinc-500">Workshoplar yüklenemedi.</p>';
    const adminList = document.getElementById("workshop-admin-list");
    if (adminList) adminList.innerHTML = "";
    console.error("Workshop load failed", err);
    return;
  }
  latestWorkshops = list;
  renderLiveWorkshopHero();
  const adminList = document.getElementById("workshop-admin-list");
  if (adminList) adminList.innerHTML = "";
  if (!list.length) {
    container.textContent = "Yakında paylaşılacak.";
    if (adminList) {
      adminList.innerHTML = '<p class="text-sm text-zinc-500">Workshop bulunamadı.</p>';
    }
    renderLiveWorkshopHero();
    return;
  }

  list
    .filter(Boolean)
    .forEach((workshop) => {
      const title = workshop.title || workshop.workshop || "Workshop";
      const dateVal = typeof workshop.date === "string" ? workshop.date.slice(0, 10) : "";
      const dateLocation = [dateVal, workshop.location || ""].filter(Boolean).join(" • ");
      const imageUrl = workshop.image_url || "../static/img/logo-transparent.png";
      const liveStatus = workshop.live_status === "live"
        ? '<span class="inline-flex items-center gap-2 rounded-sm border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700"><span class="h-2 w-2 rounded-full bg-emerald-500"></span>Workshop Başladı</span>'
        : '<span class="inline-flex items-center gap-2 rounded-sm border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-500"><span class="h-2 w-2 rounded-full bg-zinc-300"></span>Workshop henüz başlamadı</span>';
      const card = document.createElement("div");
      card.className = "rounded-sm border border-gray-200 bg-white overflow-hidden";
      card.innerHTML = `
        <div class="h-66 w-full bg-gray-100 overflow-hidden transition cursor-pointer relative group" data-action="signup">
          <img src="${imageUrl}" alt="${title}" class="w-full h-full object-cover">
          <button type="button" class="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
            <span class="rounded-sm py-3 px-5 bg-white border border-gray-200 text-zinc-700 text-sm font-semibold hover:bg-gray-100">Kayıt ol</span>
          </button>
        </div>
        <div class="p-3 space-y-3">
          <div class="flex items-start justify-between gap-2">
            <p class="font-semibold">${title}</p>
            ${liveStatus}
          </div>
          <p class="text-zinc-600">${dateLocation || "Tarih paylaşılacak"}</p>
          <p class="text-sm text-zinc-500">${workshop.instructor || ""}</p>
          <div class="flex flex-wrap items-center gap-2 pt-1">
            ${createWorkshopLiveActions(workshop)}
          </div>
        </div>
      `;
      container.appendChild(card);
      const signupArea = card.querySelector('[data-action="signup"]');
      if (signupArea) {
        signupArea.addEventListener("click", () => openWorkshopSignup(workshop));
      }
      card.querySelector('[data-live-action="start"]')?.addEventListener("click", () => startWorkshopLive(workshop));
      card.querySelector('[data-live-action="join"]')?.addEventListener("click", () => joinWorkshopLive(workshop));
      card.querySelector('[data-live-action="end"]')?.addEventListener("click", () => endWorkshopLive(workshop));
      if (adminList && isElevatedRole()) {
        const row = document.createElement("div");
        row.className = "flex items-center justify-between rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm";
        row.innerHTML = `
          <div>
            <p class="font-semibold">${title}</p>
            <p class="text-xs text-zinc-500">${dateLocation || "-"}</p>
            <p class="text-[11px] text-zinc-400">${workshop.live_status === "live" ? "Canlı yayın açık" : "Canlı yayın kapalı"}</p>
          </div>
          <div class="flex items-center gap-2">
            ${workshop.live_status === "live"
              ? '<button type="button" class="rounded-sm px-3 py-1 border border-gray-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-gray-100" data-action="join-live">Katıl</button><button type="button" class="rounded-sm px-3 py-1 border border-red-200 bg-white text-xs font-semibold text-red-600 hover:bg-red-600 hover:text-white" data-action="end-live">Bitir</button>'
              : '<button type="button" class="rounded-sm px-3 py-1 border border-gray-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-gray-100" data-action="start-live">Yayın Oluştur</button>'
            }
            <button type="button" class="rounded-sm px-3 py-1 border border-gray-200 bg-white text-xs font-semibold text-zinc-600 hover:bg-gray-100" data-action="edit">Düzenle</button>
            <button type="button" class="rounded-sm px-3 py-1 border border-red-200 bg-white text-xs font-semibold text-red-600 hover:bg-red-600 hover:text-white" data-action="delete">Sil</button>
          </div>
        `;
        const editBtn = row.querySelector('[data-action="edit"]');
        const deleteBtn = row.querySelector('[data-action="delete"]');
        const startLiveBtn = row.querySelector('[data-action="start-live"]');
        const joinLiveBtn = row.querySelector('[data-action="join-live"]');
        const endLiveBtn = row.querySelector('[data-action="end-live"]');
        if (editBtn) {
          editBtn.addEventListener("click", () => setWorkshopFormEditing(workshop));
        }
        if (startLiveBtn) {
          startLiveBtn.addEventListener("click", () => startWorkshopLive(workshop));
        }
        if (joinLiveBtn) {
          joinLiveBtn.addEventListener("click", () => joinWorkshopLive(workshop));
        }
        if (endLiveBtn) {
          endLiveBtn.addEventListener("click", () => endWorkshopLive(workshop));
        }
        if (deleteBtn) {
          attachDeletePopover(deleteBtn, {
            message: "Workshop silinsin mi?",
            onConfirm: async () => {
              await fetchJSON(`/api/workshops/${workshop.id}`, { method: "DELETE" });
              showToast("Workshop silindi.", { type: "success" });
              await loadWorkshop();
            },
            onError: () => {
              showToast("Workshop silinemedi.", { type: "error" });
            },
          });
        }
        adminList.appendChild(row);
      }
    });
}

async function loadFaqs() {
  const container = document.getElementById("faq-list");
  if (!container) return;
  container.innerHTML = "";
  const faqs = await fetchJSON("/api/faqs");
  faqs.forEach((faq) => {
    const row = document.createElement("details");
    row.className = "rounded-md bg-stone-50 border border-gray-50 p-3 ";
    row.innerHTML = `
      <summary class="font-semibold cursor-pointer">${faq.question}</summary>
      <div class="faq-body" style="max-height:0; overflow:hidden; transition:max-height 240ms ease;">
        <p class="text-sm text-zinc-600 mt-2">${faq.answer}</p>
      </div>
    `;
    const body = row.querySelector(".faq-body");
    row.addEventListener("toggle", () => {
      if (!body) return;
      if (row.open) {
        body.style.maxHeight = `${body.scrollHeight}px`;
      } else {
        body.style.maxHeight = `${body.scrollHeight}px`;
        requestAnimationFrame(() => {
          body.style.maxHeight = "0";
        });
      }
    });
    container.appendChild(row);
  });
}

async function loadBook() {
  const viewer = document.getElementById("book-viewer");
  const downloadLink = document.getElementById("book-download");
  const openLink = document.getElementById("book-open");
  if (!viewer) return;
  viewer.innerHTML = "Yükleniyor...";
  try {
    const books = await fetchJSON("/api/books");
    const list = Array.isArray(books) ? books : [];
    if (!list.length) {
      viewer.textContent = "PDF yüklenmedi.";
      if (downloadLink) downloadLink.classList.add("hidden");
      if (openLink) openLink.classList.add("hidden");
      return;
    }
    const book = list[0];
    bookUrl = book.url || book.pdf_path;
    viewer.innerHTML = `<iframe src="${bookUrl}#toolbar=0&navpanes=0" class="absolute inset-0 w-full h-full"></iframe>`;
    if (downloadLink) {
      downloadLink.href = bookUrl;
      downloadLink.classList.remove("hidden");
    }
    if (openLink) {
      openLink.href = bookUrl;
      openLink.classList.remove("hidden");
    }
  } catch (err) {
    viewer.textContent = "PDF yüklenemedi.";
    if (downloadLink) downloadLink.classList.add("hidden");
    if (openLink) openLink.classList.add("hidden");
  }
}

async function loadVideos() {
  const container = document.getElementById("video-list");
  if (!container) return;
  container.innerHTML = spinner({ size: 28 });
  try {
    const videos = await fetchJSON("/api/videos");
    if (!videos.length) {
      container.innerHTML = '<p class="text-sm text-zinc-600">Henüz video yok.</p>';
      return;
    }
    container.innerHTML = "";
    videos.forEach((video) => {
      const card = document.createElement("div");
      const title = video.title || "Video";
      const date = video.created_at ? new Date(video.created_at).toLocaleDateString("tr-TR") : "";
      const playbackMarkup = `<video controls preload="metadata" playsinline webkit-playsinline class="w-full h-full object-cover" src="${escapeHTML(video.video_url || "")}"></video>`;
      const meta = [];
      if (video.resolution) meta.push(`Kalite: ${video.resolution}`);
      card.className = "rounded-lg border border-gray-200 bg-white p-4 space-y-3";
      const actions = isElevatedRole()
        ? `
          <div class="flex items-center justify-end gap-2">
            <button type="button" class="px-3 py-1 rounded-lg border border-red-200 text-xs font-semibold text-red-600" data-action="delete">Sil</button>
          </div>
        `
        : "";
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <h4 class="font-semibold">${title}</h4>
          <span class="text-xs text-zinc-500">${date}</span>
        </div>
        <div class="w-full aspect-video rounded-lg overflow-hidden bg-black">
          ${playbackMarkup}
        </div>
        ${meta.length ? `<p class="text-xs text-zinc-500">${escapeHTML(meta.join(" · "))}</p>` : ""}
        ${actions}
      `;
      if (isElevatedRole()) {
        const editBtn = card.querySelector('[data-action="edit"]');
        const deleteBtn = card.querySelector('[data-action="delete"]');
        if (editBtn) {
          editBtn.addEventListener("click", () => setVideoFormEditing(video));
        }
        if (deleteBtn) {
          attachDeletePopover(deleteBtn, {
            message: "Video silinsin mi?",
            position: "center",
            onConfirm: async () => {
              await fetchJSON(`/api/videos/${video.id}`, { method: "DELETE" });
              showToast("Video silindi.", { type: "success" });
              await loadVideos();
            },
            onError: () => {
              showToast("Video silinemedi.", { type: "error" });
            },
          });
        }
      }
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = '<p class="text-sm text-red-500">Videolar yüklenemedi.</p>';
  }
}

async function loadExperts() {
  const table = document.getElementById("experts-table");
  if (!table) return;
  table.innerHTML = '<tr><td class="py-3 text-sm text-zinc-500" colspan="5">Yükleniyor...</td></tr>';
  try {
    const experts = await fetchJSON("/api/experts");
    if (!experts.length) {
      table.innerHTML = '<tr><td class="py-3 text-sm text-zinc-500" colspan="5">Henüz uzman yok.</td></tr>';
      return;
    }
    table.innerHTML = "";
    experts.forEach((expert) => {
      const row = document.createElement("tr");
      row.className = "border-b border-gray-50";
      const avatarUrl = expert.avatar_url || "../static/img/user-logo.png";
      const statusLabel = formatExpertStatus(expert.expert_status);
      const phoneLabel = expert.phone || "-";
      const cityLabel = expert.city || "-";
      const statusCell = currentUserRole === "admin"
        ? `
          <select class="expert-status-input rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-zinc-800" data-expert-id="${expert.id}">
            ${buildExpertStatusOptions(expert.expert_status)}
          </select>
        `
        : statusLabel;
      row.innerHTML = `
        <td class="py-2 pr-4">
          <div class="w-9 h-9 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
            <img src="${avatarUrl}" alt="${toTitleCase(expert.name) || "Uzman"}" class="w-full h-full object-cover">
          </div>
        </td>
        <td class="py-2 pr-4 font-semibold">${toTitleCase(expert.name) || "-"}</td>
        <td class="py-2 pr-4">${statusCell}</td>
        <td class="py-2 pr-4">${phoneLabel}</td>
        <td class="py-2 pr-4">${cityLabel}</td>
      `;
      table.appendChild(row);
    });
    if (currentUserRole === "admin") {
      table.querySelectorAll(".expert-status-input").forEach((input) => {
        input.dataset.previousStatus = normalizeExpertStatusForInput(input.value);
        input.addEventListener("change", async (event) => {
          const select = event.currentTarget;
          const previousStatus = select.dataset.previousStatus || normalizeExpertStatusForInput(select.value);
          const nextStatus = select.value;
          const expertId = select.dataset.expertId;
          select.disabled = true;
          try {
            await fetchJSON(`/api/experts/${expertId}/status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ expert_status: nextStatus }),
            });
            select.dataset.previousStatus = nextStatus;
            showToast("Uzmanlık güncellendi.", { type: "success" });
            loadExperts();
          } catch (err) {
            select.value = previousStatus;
            showToast("Uzmanlık güncellenemedi.", { type: "error" });
          } finally {
            select.disabled = false;
          }
        });
      });
    }
  } catch (err) {
    table.innerHTML = '<tr><td class="py-3 text-sm text-red-500" colspan="5">Uzmanlar yüklenemedi.</td></tr>';
  }
}

function resetWorkshopForm() {
  const form = document.getElementById("workshop-form");
  const cancelBtn = document.getElementById("workshop-cancel");
  if (!form) return;
  form.reset();
  if (form.workshop_id) form.workshop_id.value = "";
  if (form.workshop_image) form.workshop_image.value = "";
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Kaydet";
  if (cancelBtn) cancelBtn.classList.add("hidden");
}

function setWorkshopFormEditing(workshop) {
  const form = document.getElementById("workshop-form");
  const cancelBtn = document.getElementById("workshop-cancel");
  if (!form || !workshop) return;
  if (form.workshop_id) form.workshop_id.value = workshop.id || "";
  form.workshop_title.value = workshop.title || workshop.workshop || "";
  form.workshop_date.value = workshop.date ? String(workshop.date).slice(0, 10) : "";
  form.workshop_location.value = workshop.location || "";
  form.workshop_instructor.value = workshop.instructor || "";
  if (form.workshop_image) form.workshop_image.value = "";
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Güncelle";
  if (cancelBtn) cancelBtn.classList.remove("hidden");
}

function resetVideoForm() {
  const form = document.getElementById("video-form");
  const cancelBtn = document.getElementById("video-cancel");
  if (!form) return;
  form.reset();
  if (form.video_id) form.video_id.value = "";
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Video Ekle";
  const urlInput = form.querySelector('input[name="video_url"]');
  if (urlInput) {
    urlInput.disabled = false;
    urlInput.placeholder = "Supabase public video linki";
  }
  if (cancelBtn) cancelBtn.classList.add("hidden");
}

function setVideoFormEditing(video) {
  const form = document.getElementById("video-form");
  const cancelBtn = document.getElementById("video-cancel");
  if (!form || !video) return;
  if (form.video_id) form.video_id.value = video.id || "";
  form.video_title.value = video.title || "";
  const urlInput = form.querySelector('input[name="video_url"]');
  if (urlInput) {
    urlInput.disabled = true;
    urlInput.value = "";
    urlInput.placeholder = "Video linki düzenlenemez";
  }
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Güncelle";
  if (cancelBtn) cancelBtn.classList.remove("hidden");
}

function resetCampaignForm() {
  const form = document.getElementById("campaign-form");
  const cancelBtn = document.getElementById("campaign-cancel");
  if (!form) return;
  form.reset();
  if (form.campaign_id) form.campaign_id.value = "";
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Kampanya Kaydet";
  if (cancelBtn) cancelBtn.classList.add("hidden");
}

function setCampaignFormEditing(campaign) {
  const form = document.getElementById("campaign-form");
  const cancelBtn = document.getElementById("campaign-cancel");
  if (!form || !campaign) return;
  if (form.campaign_id) form.campaign_id.value = campaign.id || "";
  form.campaign_title.value = campaign.name || "";
  form.campaign_description.value = campaign.description || "";
  form.campaign_valid_from.value = campaign.starts_at ? String(campaign.starts_at).slice(0, 10) : "";
  form.campaign_valid_to.value = campaign.ends_at ? String(campaign.ends_at).slice(0, 10) : "";
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Güncelle";
  if (cancelBtn) cancelBtn.classList.remove("hidden");
}

function setupWorkshopAdmin() {
  const form = document.getElementById("workshop-form");
  const success = document.getElementById("workshop-success");
  if (!form) return;
  const toggle = () => refreshWorkshopAdminVisibility();
  const cancelBtn = document.getElementById("workshop-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => resetWorkshopForm());
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      title: form.workshop_title.value.trim(),
      date: form.workshop_date.value,
      location: form.workshop_location.value.trim(),
      instructor: form.workshop_instructor.value.trim(),
    };
    if (!payload.title || !payload.date) {
      alert("Başlık ve tarih zorunludur.");
      return;
    }
    try {
      const workshopId = form.workshop_id ? form.workshop_id.value.trim() : "";
      const url = workshopId ? `/api/workshops/${workshopId}` : "/api/workshops";
      const method = workshopId ? "PUT" : "POST";
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => formData.append(key, value));
      const imageFile = form.workshop_image ? form.workshop_image.files[0] : null;
      if (!workshopId && !imageFile) {
        alert("Lütfen workshop görseli yükleyin.");
        return;
      }
      if (imageFile) formData.append("image", imageFile);
      await fetchJSON(url, {
        method,
        body: formData,
      });
      if (success) {
        success.classList.remove("hidden");
        setTimeout(() => success.classList.add("hidden"), 2000);
      }
      resetWorkshopForm();
      loadWorkshop();
    } catch (err) {
      alert("Workshop eklenemedi. Lütfen tekrar deneyin.");
    }
  });
  toggle();
}

function setupPasswordForm() {
  const form = document.getElementById("password-form");
  const input = document.getElementById("new-password");
  const toggleBtn = document.getElementById("password-toggle");
  const success = document.getElementById("password-success");
  if (!form || !input) return;
  const toggle = () => refreshPasswordUI();
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      toggleBtn.textContent = isPassword ? "🙈" : "👁️";
    });
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = (input.value || "").trim();
    if (password.length < 6) {
      alert("Şifre en az 6 karakter olmalı.");
      return;
    }
    try {
      await fetchJSON("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      studentHasPassword = true;
      if (success) {
        success.classList.remove("hidden");
        setTimeout(() => success.classList.add("hidden"), 2000);
      }
      input.value = "";
      toggle();
    } catch (err) {
      alert("Şifre kaydedilemedi. Lütfen tekrar deneyin.");
    }
  });
  toggle();
}

async function setupClerkAccount() {
  const profileContainer = document.getElementById("clerk-account");
  const sidebarContainer = document.getElementById("clerk-sidebar-button");
  const container = sidebarContainer || profileContainer;
  if (!container) return;
  const waitForClerk = (maxTries = 40, delayMs = 150) => new Promise((resolve) => {
    let tries = 0;
    const tick = () => {
      if (typeof Clerk !== "undefined") return resolve(true);
      tries += 1;
      if (tries >= maxTries) return resolve(false);
      setTimeout(tick, delayMs);
    };
    tick();
  });
  const ready = await waitForClerk();
  if (!ready) {
    container.innerHTML = '<p class="text-sm text-zinc-500">Clerk yüklenemedi.</p>';
    return;
  }
  const appearance = {
    variables: {
      borderRadius: "8px",
      fontFamily: "Manrope, ui-sans-serif, system-ui",
      colorBackground: "#ffffff",
    },
    elements: {
      card: "shadow-none border border-gray-200 rounded-xl",
      formFieldInput: "rounded-lg",
      dividerLine: "bg-gray-200",
    },
  };
  const loadOptions = { appearance };
  if (window.trTR) {
    loadOptions.localization = window.trTR;
  }
  try {
    await Clerk.load(loadOptions);
    if (!Clerk.isSignedIn) {
      container.innerHTML = '<p class="text-sm text-zinc-500">Clerk oturumu bulunamadı.</p>';
      return;
    }
    container.innerHTML = '<div id="clerk-user-button"></div>';
    const userButtonDiv = document.getElementById("clerk-user-button");
    if (userButtonDiv) Clerk.mountUserButton(userButtonDiv);
  } catch (err) {
    console.error("Clerk load failed", err);
  }
}

function setupProfileForm() {
  const form = document.getElementById("profile-form");
  const success = document.getElementById("profile-success");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const phone = form.phone.value.trim();
    const countryCode = form.country_code ? form.country_code.value.trim() : "+90";
    const fullPhone = buildFullPhone(countryCode, phone);
    if (!fullPhone) {
      showToast("Lütfen telefon numarası girin.", { type: "error" });
      return;
    }
    try {
      await fetchJSON("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      currentUserPhone = fullPhone;
      if (success) {
        success.classList.remove("hidden");
        setTimeout(() => success.classList.add("hidden"), 2000);
      }
      showToast("Profil güncellendi.", { type: "success" });
      loadExperts();
    } catch (err) {
      showToast("Profil güncellenemedi.", { type: "error" });
    }
  });
}

function setupAvatarForm() {
  const form = document.getElementById("avatar-form");
  const avatar = document.getElementById("profile-avatar");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = form.avatar.files[0];
    if (!file) {
      showToast("Lütfen fotoğraf seçin.", { type: "error" });
      return;
    }
    const formData = new FormData();
    formData.append("avatar", file);
    try {
      const result = await fetchJSON("/api/account/avatar", { method: "POST", body: formData });
      if (avatar && result.avatar_url) {
        avatar.src = result.avatar_url;
      }
      form.reset();
      showToast("Profil fotoğrafı güncellendi.", { type: "success" });
      loadExperts();
    } catch (err) {
      showToast("Profil fotoğrafı yüklenemedi.", { type: "error" });
    }
  });
}

async function loadOrderHistory(page = 1) {
  const list = document.getElementById("order-history-list");
  const pageEl = document.getElementById("order-history-page");
  const totalEl = document.getElementById("order-history-total");
  const prevBtn = document.getElementById("order-history-prev");
  const nextBtn = document.getElementById("order-history-next");
  if (!list || !pageEl || !totalEl || !prevBtn || !nextBtn) return;
  try {
    const result = await fetchJSON(`/api/orders?page=${page}&page_size=10`);
    const items = result.items || [];
    const isAdminView = Boolean(result.admin) || isElevatedRole();
    orderHistoryPage = result.page || page;
    orderHistoryHasMore = Boolean(result.has_more);
    pageEl.textContent = String(orderHistoryPage);
    totalEl.textContent = orderHistoryHasMore ? "?" : String(orderHistoryPage);
    list.innerHTML = "";
    if (!items.length) {
      list.innerHTML = '<p class="text-sm text-zinc-500">Henüz sipariş yok.</p>';
    } else {
      items.forEach((item) => {
        const createdAt = item.created_at ? new Date(item.created_at) : null;
        const dateLabel = createdAt && !Number.isNaN(createdAt.getTime())
          ? createdAt.toLocaleDateString("tr-TR")
          : "-";
        const customerName = item.student_name ? toTitleCase(item.student_name) : "";
        const customerPhone = item.student_phone || item.phone || "";
        const customerEmail = item.student_email || "";
        const customerDetails = [customerName, customerPhone, customerEmail].filter(Boolean).join(" · ");
        const row = document.createElement("div");
        row.className = "p-3 rounded-lg border border-gray-200 bg-white text-sm space-y-1";
        row.innerHTML = `
          <div class="flex items-center justify-between">
            <p class="font-semibold">Sipariş</p>
            <span class="text-xs text-zinc-500">${dateLabel}</span>
          </div>
          ${isAdminView && customerDetails ? `<div class="text-xs text-zinc-500">${customerDetails}</div>` : ""}
          <p class="text-zinc-700">${item.order_text || "-"}</p>
          <div class="text-xs text-zinc-500">Toplam adet: ${item.total_qty ?? "-"}</div>
        `;
        list.appendChild(row);
      });
    }
    prevBtn.disabled = orderHistoryPage <= 1;
    nextBtn.disabled = !orderHistoryHasMore;
  } catch (err) {
    list.innerHTML = '<p class="text-sm text-zinc-500">Siparişler yüklenemedi.</p>';
  }
  prevBtn.onclick = () => loadOrderHistory(Math.max(1, orderHistoryPage - 1));
  nextBtn.onclick = () => loadOrderHistory(orderHistoryPage + 1);
}

function setupBookForm() {
  const form = document.getElementById("book-form");
  const success = document.getElementById("book-success");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = form.book_file.files[0];
    if (!file) {
      alert("Lütfen PDF seçin.");
      return;
    }
    const formData = new FormData();
    formData.append("book", file);
    formData.append("title", form.book_title.value);
    try {
      await fetchJSON("/api/books/upload", { method: "POST", body: formData });
      if (success) {
        success.classList.remove("hidden");
        setTimeout(() => success.classList.add("hidden"), 2000);
      }
      form.reset();
      loadBook();
    } catch (err) {
      alert("PDF yüklenemedi.");
    }
  });
}

function setupVideoForm() {
  const form = document.getElementById("video-form");
  if (!form) return;
  const cancelBtn = document.getElementById("video-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => resetVideoForm());
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const success = document.getElementById("video-success");
    const urlInput = form.querySelector('input[name="video_url"]');
    const titleInput = form.querySelector('input[name="video_title"]');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    const url = urlInput ? urlInput.value.trim() : "";
    const title = titleInput ? titleInput.value.trim() : "";
    const videoId = form.video_id ? form.video_id.value.trim() : "";
    
    if (!videoId && !url) {
      showToast("Lütfen video linki girin.", { type: "error" });
      return;
    }
    if (videoId && !title) {
      showToast("Lütfen video başlığı girin.", { type: "error" });
      return;
    }
    
    if (submitBtn) submitBtn.disabled = true;
    showToast("Video yükleniyor...", { type: "info" });
    
    try {
      if (videoId) {
        await fetchJSON(`/api/videos/${videoId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
      } else {
        await fetchJSON("/api/videos/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, title }),
        });
      }
      
      if (success) {
        success.classList.remove("hidden");
        setTimeout(() => success.classList.add("hidden"), 2000);
      }
      
      resetVideoForm();
      showToast(videoId ? "Video güncellendi." : "Video yüklendi.", { type: "success" });
      loadVideos();
    } catch (err) {
      const message = err && err.message ? err.message : "Video yüklenemedi.";
      showToast(message, { type: "error" });
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function setupCampaignAdmin() {
  const form = document.getElementById("campaign-form");
  if (!form) return;
  const success = document.getElementById("campaign-success");
  const cancelBtn = document.getElementById("campaign-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => resetCampaignForm());
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      name: form.campaign_title.value.trim(),
      description: form.campaign_description.value.trim(),
      starts_at: form.campaign_valid_from.value,
      ends_at: form.campaign_valid_to.value,
    };
    if (!payload.name || !payload.description || !payload.starts_at || !payload.ends_at) {
      showToast("Tüm kampanya alanlarını doldurun.", { type: "error" });
      return;
    }
    try {
      const campaignId = form.campaign_id ? form.campaign_id.value.trim() : "";
      const url = campaignId ? `/api/campaigns/${campaignId}` : "/api/campaigns";
      const method = campaignId ? "PUT" : "POST";
      await fetchJSON(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (success) {
        success.classList.remove("hidden");
        setTimeout(() => success.classList.add("hidden"), 2000);
      }
      resetCampaignForm();
      showToast(campaignId ? "Kampanya güncellendi." : "Kampanya kaydedildi.", { type: "success" });
      loadCampaigns();
    } catch (err) {
      showToast("Kampanya kaydedilemedi.", { type: "error" });
    }
  });
}

function setupSupportForm() {
  const form = document.getElementById("support-form");
  const success = document.getElementById("support-success");
  if (!form || !success) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const subject = form.subject.value;
    const message = form.message.value;
    try {
      await fetchJSON("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message }),
      });
      success.classList.remove("hidden");
      form.reset();
    } catch (err) {
      alert("Gönderilemedi. Lütfen tekrar deneyin.");
    }
  });
}

function spinner({ size = 32 } = {}) {
  const stroke = Math.max(2, Math.floor(size / 8));
  return `
    <div class="flex justify-center py-8" aria-live="polite" aria-busy="true">
      <div
        class="rounded-full border-solid border-gray-200 border-t-zinc-900 animate-spin"
        style="width:${size}px;height:${size}px;border-width:${stroke}px"
      ></div>
    </div>
  `;
}

function setupPhotoForm() {
  const form = document.getElementById("photo-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const gallery = document.getElementById("photo-gallery");
    if (gallery) gallery.innerHTML = spinner();
    try {
      await fetchJSON("/api/photos", { method: "POST", body: formData });
      form.reset();
      loadPhotos();
    } catch (err) {
      alert("Fotoğraf yüklenemedi.");
      loadPhotos();
    }
  });
}

async function loadPhotos() {
  const gallery = document.getElementById("photo-gallery");
  if (!gallery) return;
  if (isGuestUser) return;
  gallery.innerHTML = spinner();
  try {
    const photos = await fetchJSON("/api/photos");
    if (!photos.length) {
      gallery.innerHTML = '<p class="text-sm text-zinc-600 text-center py-4">Henüz fotoğraf yok.</p>';
      return;
    }
    gallery.innerHTML = "";
    photos.forEach((photo) => {
      const card = document.createElement("div");
      card.className = "relative rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white";
      card.innerHTML = `
        <img src="${photo.image_url}" alt="İşlem fotoğrafı" class="w-full h-32 object-cover">
        <button type="button" data-photo-delete class="absolute top-2 right-2 z-10 px-2.5 py-1.5 rounded-lg bg-red-500 text-xs font-semibold text-white border border-red-600 shadow">
          Sil
        </button>
        ${
          photo.is_monthly_winner
            ? '<span class="absolute top-2 left-2 px-2 py-1 rounded-lg bg-amber-400 text-amber-900 text-xs font-bold">Bu Ayın En Güzel İşlemi</span>'
            : ""
        }
        ${
          photo.feedback
            ? `<div class="p-2 text-xs bg-gray-50 text-zinc-700">Feedback: ${photo.feedback}</div>`
            : ""
        }
      `;
      const deleteBtn = card.querySelector("[data-photo-delete]");
      if (deleteBtn) {
        attachDeletePopover(deleteBtn, {
          message: "Fotoğraf silinsin mi?",
          onConfirm: async () => {
            await fetchJSON(`/api/photos/${photo.id}`, { method: "DELETE" });
            card.remove();
            if (!gallery.querySelector("div")) {
              gallery.innerHTML = '<p class="text-sm text-zinc-600 text-center py-4">Henüz fotoğraf yok.</p>';
            }
            showToast("Fotoğraf silindi.", { type: "success" });
            await loadPhotos();
            await loadFeed();
          },
          onError: () => {
            showToast("Fotoğraf silinemedi.", { type: "error" });
          },
        });
      }
      gallery.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    gallery.innerHTML = '<p class="text-sm text-red-500 text-center py-4">Fotoğraflar yüklenemedi.</p>';
  }
}

async function loadFeed() {
  const feed = document.getElementById("feed-gallery");
  if (feed) feed.innerHTML = spinner({ size: 40 });
  try {
    feedPhotos = await fetchJSON("/api/photos/feed");
    renderFeed();
  } catch (err) {
    console.error(err);
    if (feed) {
      feed.innerHTML = '<p class="text-sm text-red-500">Akış yüklenemedi.</p>';
    }
  }
}

function renderFeed() {
  const feed = document.getElementById("feed-gallery");
  if (!feed) return;
  feed.innerHTML = "";

  let photos = Array.isArray(feedPhotos) ? [...feedPhotos] : [];
  if (showWinnerOnly) {
    photos = photos.filter((p) => p.is_monthly_winner);
  }
  if (pinWinner) {
    const winners = photos.filter((p) => p.is_monthly_winner);
    const others = photos.filter((p) => !p.is_monthly_winner);
    photos = [...winners, ...others];
  }

  if (!photos.length) {
    feed.innerHTML = '<p class="text-sm text-zinc-600">Henüz paylaşım yok.</p>';
    return;
  }

  photos.forEach((photo) => {
    const card = document.createElement("div");
    card.className = "rounded-lg border border-gray-200 shadow-sm bg-white overflow-hidden";
    const date = photo.created_at ? new Date(photo.created_at).toLocaleDateString("tr-TR") : "";
      const displayName = toTitleCase(photo.student_name || "Uzman");
      const initials = displayName.slice(0, 2).toUpperCase();
      const avatarUrl = photo.student_avatar_url || photo.avatar_url || "../static/img/user-logo.png";
    const winnerBadge =
      photo.is_monthly_winner
        ? '<span class="px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold border border-green-200">Bu Ayın Kazananı</span>'
        : "";
    card.innerHTML = `
      <div class="flex items-center justify-between gap-3 p-3">
          <div class="flex items-center gap-3">
            <div class="h-10 w-10 rounded-full overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center text-sm font-semibold text-zinc-900">
              <img src="${avatarUrl}" alt="${displayName}" class="h-full w-full object-cover" onerror="this.style.display='none'; this.parentElement.textContent='${initials}';" />
            </div>
            <div>
              <p class="font-semibold text-sm text-zinc-800">${displayName}</p>
              <p class="text-xs text-zinc-500">${date}</p>
            </div>
          </div>
        ${winnerBadge}
      </div>
      <div class="bg-gray-100 relative">
        ${
          photo.is_monthly_winner
            ? '<span class="absolute top-3 left-3 px-3 py-1 rounded-full bg-green-500 shadow text-white text-xs font-semibold shadow">Kazanan</span>'
            : ""
        }
        <img src="${photo.image_url}" alt="Uzman paylaşımı" class="w-full max-h-[520px] md:max-h-[620px] object-cover">
      </div>
      <div class="p-3 space-y-3">
        <div class="flex items-center gap-2 flex-wrap" data-reaction-row></div>
        <div class="space-y-2" data-feedback-list></div>
        <div class="space-y-2" data-moderation-block></div>
      </div>
    `;
    const reactionRow = card.querySelector("[data-reaction-row]");
    const feedbackList = card.querySelector("[data-feedback-list]");
    const moderationBlock = card.querySelector("[data-moderation-block]");
    const counts = photo.reactions || {};
    FEED_REACTIONS.forEach((reaction) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const isActive = photo.my_reaction === reaction.id;
      const count = counts[reaction.id] || 0;
      btn.className = [
        "flex",
        "items-center",
        "gap-2",
        "px-3",
        "py-1.5",
        "rounded-full",
        "border",
        "text-sm",
        "transition",
        "duration-150",
        isActive ? "bg-gray-100 border-gray-300 text-zinc-900" : "bg-white border-gray-200 text-zinc-700 hover:border-gray-300",
      ].join(" ");
      btn.innerHTML = `
        <span>${reaction.label}</span>
        <span class="text-xs text-zinc-500">${count}</span>
      `;
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await sendReaction(photo.id, reaction.id);
          await loadFeed();
        } catch (err) {
          alert("Reaksiyon gönderilemedi.");
        } finally {
          btn.disabled = false;
        }
      });
      reactionRow.appendChild(btn);
    });
    const feedbacks = Array.isArray(photo.feedbacks) ? photo.feedbacks : [];
    if (feedbacks.length) {
      const header = document.createElement("p");
      header.className = "text-xs uppercase tracking-wide text-zinc-400";
      header.textContent = "Feedbackler";
      feedbackList.appendChild(header);
      feedbacks.forEach((fb) => {
        const row = document.createElement("div");
        const fbDate = fb.created_at ? new Date(fb.created_at).toLocaleDateString("tr-TR") : "";
        row.className = "p-2 rounded-lg bg-gray-50 border border-gray-200";
        const feedbackName = toTitleCase(fb.student_name || "Uzman");
        row.innerHTML = `
          <p class="text-xs font-semibold text-zinc-700">${feedbackName} <span class="text-[11px] text-zinc-400">${fbDate}</span></p>
          <p class="text-sm text-zinc-700">${fb.feedback}</p>
        `;
        feedbackList.appendChild(row);
      });
    }
    if (!isGuestUser) {
      const feedbackWrapper = document.createElement("div");
      feedbackWrapper.className = "space-y-2";
      const feedbackInputId = `feedback-${photo.id}`;
      feedbackWrapper.innerHTML = `
        <label for="${feedbackInputId}" class="text-xs text-zinc-500">Feedback bırak</label>
        <div class="flex gap-2">
          <input id="${feedbackInputId}" type="text" maxlength="280" value=""
            class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400" placeholder="Gözlemini yaz">
          <button type="button" class="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800">Gönder</button>
        </div>
      `;
      const sendBtn = feedbackWrapper.querySelector("button");
      const input = feedbackWrapper.querySelector("input");
      sendBtn.addEventListener("click", async () => {
        const feedback = input.value.trim();
        if (!feedback) return;
        sendBtn.disabled = true;
        try {
          await sendFeedback(photo.id, feedback);
          await loadFeed();
        } catch (err) {
          alert("Feedback kaydedilemedi.");
        } finally {
          sendBtn.disabled = false;
        }
      });
      moderationBlock.appendChild(feedbackWrapper);
    }
    if (currentUserRole === "admin") {
      const winnerBtn = document.createElement("button");
      winnerBtn.type = "button";
      winnerBtn.className = [
        "w-full",
        "px-3",
        "py-2",
        "rounded-lg",
        photo.is_monthly_winner ? "bg-zinc-900 text-white border border-zinc-900" : "bg-white border border-gray-200 text-zinc-700 hover:border-gray-300",
        "text-sm",
        "font-semibold",
        "transition",
        "duration-150",
      ].join(" ");
      winnerBtn.textContent = photo.is_monthly_winner ? "Bu Ayın Kazananı" : "Aylık Kazanan Yap";
      winnerBtn.addEventListener("click", async () => {
        winnerBtn.disabled = true;
        try {
          await setMonthlyWinner(photo.id);
          await loadFeed();
        } catch (err) {
          alert("Kazanan seçilemedi.");
        } finally {
          winnerBtn.disabled = false;
        }
      });
      moderationBlock.appendChild(winnerBtn);
    }
    feed.appendChild(card);
  });
}

async function sendReaction(photoId, reaction) {
  if (!photoId || !reaction) return;
  await fetchJSON("/api/photos/reaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo_id: photoId, reaction }),
  });
}

async function sendFeedback(photoId, feedback) {
  await fetchJSON("/api/photos/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo_id: photoId, feedback }),
  });
}

async function setMonthlyWinner(photoId) {
  await fetchJSON("/api/photos/monthly_winner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo_id: photoId }),
  });
}
