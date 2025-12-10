const sections = ["dashboard-section", "products-section", "photos-section", "feed-section", "campaigns-section", "books-section", "support-section"];
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

document.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  setupSidebar();
  setupFeedControls();
  loadStudent();
  loadProducts();
  loadRules();
  loadQuickTips();
  loadEducation();
  loadCampaigns();
  loadWorkshop();
  loadBook();
  loadFaqs();
  loadPhotos();
  setupSupportForm();
  setupPhotoForm();
  setupPasswordForm();
  setupWorkshopAdmin();
  setupBookForm();
});

function setupNavigation() {
  const buttons = document.querySelectorAll(".nav-btn");
  buttons.forEach((btn) => {
    btn.classList.add(
      "px-3",
      "py-3",
      "rounded-2xl",
      "bg-brand-50",
      "border",
      "border-brand-100",
      "text-slate-700",
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
      switchSection(target);
      buttons.forEach((b) => b.classList.remove("bg-brand-600", "text-white", "border-brand-500"));
      btn.classList.add("bg-brand-600", "text-white", "border-brand-500");
      if (typeof window.closeSidebar === "function") {
        window.closeSidebar();
      }
    });
  });
  if (buttons.length) {
    const first = buttons[0];
    first.classList.add("bg-brand-600", "text-white", "border-brand-500");
    switchSection(first.dataset.target);
  }
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

  window.closeSidebar = () => {
    sidebar.classList.add("-translate-x-full");
    overlay.classList.add("pointer-events-none", "opacity-0");
    overlay.classList.remove("opacity-100");
  };

  toggle.addEventListener("click", openSidebar);
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
}

function setupFeedControls() {
  const filterBtn = document.getElementById("filter-winner-btn");
  const pinBtn = document.getElementById("pin-winner-btn");
  const updateStates = () => {
    if (filterBtn) {
      filterBtn.classList.toggle("bg-brand-600", showWinnerOnly);
      filterBtn.classList.toggle("text-white", showWinnerOnly);
      filterBtn.classList.toggle("border-brand-500", showWinnerOnly);
    }
    if (pinBtn) {
      pinBtn.classList.toggle("bg-brand-600", pinWinner);
      pinBtn.classList.toggle("text-white", pinWinner);
      pinBtn.classList.toggle("border-brand-500", pinWinner);
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
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "İstek başarısız");
  }
  return response.json();
}

async function loadStudent() {
  try {
    const student = await fetchJSON("/api/student");
    document.getElementById("student-name").textContent = student.name;
    document.getElementById("expert-id").textContent = `Uzman ID: ${student.id}`;
    document.getElementById("workshop-name").textContent = student.workshop_name || "-";
    document.getElementById("certificate-date").textContent = student.date || "-";
    document.getElementById("certificate-status").textContent = student.status || "Aktif";
    currentUserRole = student.role || "student";
    studentHasPassword = !!student.has_password;
    refreshPasswordUI();
    refreshWorkshopAdminVisibility();
    loadFeed();
  } catch (err) {
    console.error(err);
    window.location.href = "/login";
  }
}

function refreshPasswordUI() {
  const card = document.getElementById("password-card");
  const form = document.getElementById("password-form");
  const hint = document.getElementById("password-hint");
  const success = document.getElementById("password-success");
  if (!form) return;
  if (card) card.classList.toggle("hidden", studentHasPassword);
  form.classList.toggle("hidden", studentHasPassword);
  if (hint) hint.classList.toggle("hidden", studentHasPassword);
  if (success) success.classList.add("hidden");
}

function refreshWorkshopAdminVisibility() {
  const card = document.getElementById("workshop-admin-card");
  if (!card) return;
  const canEdit = currentUserRole === "admin" || currentUserRole === "master";
  card.classList.toggle("hidden", !canEdit);
  const bookCard = document.getElementById("book-admin-card");
  if (bookCard) bookCard.classList.toggle("hidden", !canEdit);
}

async function loadProducts() {
  const container = document.getElementById("product-list");
  if (!container) return;
  container.innerHTML = "";
  const products = await fetchJSON("/api/products");
  products.forEach((product) => {
    const steps = Array.isArray(product.steps)
      ? product.steps
      : typeof product.steps === "string"
        ? product.steps.split("\n").filter(Boolean)
        : [];
    const card = document.createElement("div");
    card.className = "rounded-xl border border-brand-100 bg-white p-3 space-y-2 shadow-sm";
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <h4 class="font-semibold">${product.name}</h4>
        <span class="text-xs text-slate-500">${product.short_description || ""}</span>
      </div>
      <div class="space-y-1 text-sm">
        ${steps.map((step) => `<p class="text-slate-600">${step}</p>`).join("")}
      </div>
    `;
    container.appendChild(card);
  });
}

async function loadRules() {
  const container = document.getElementById("rule-list");
  if (!container) return;
  container.innerHTML = "";
  const rules = await fetchJSON("/api/rules");
  rules.forEach((rule) => {
    const item = document.createElement("div");
    item.className = "p-3 rounded-xl bg-white border border-brand-100 shadow-sm";
    item.innerHTML = `
      <div class="flex items-center justify-between">
        <h4 class="font-semibold"><span class="font-medium text-gray-500">Kural Türü:</span> ${rule.title} </h4>
      </div>
      <p class="text-sm text-slate-600">${rule.description}</p>
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
        row.className = "p-3 rounded-xl bg-white border border-brand-100 text-sm space-y-1 shadow-sm";
        row.innerHTML = `
          <p class="font-semibold">Sorun: ${question}</p>
          <p class="text-slate-600">Cevap: ${answer}</p>
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
  if (Array.isArray(data)) {
    data.forEach((item) => {
      const cat = (item.category || "").toLowerCase();
      if (grouped[cat]) grouped[cat].push(item);
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
  renderEducationGroup("education-kullanim", grouped.kullanim, "Ürün Kullanımı");
  renderEducationGroup("education-uyari", grouped.uyari, "Uyarılar");
  renderEducationGroup("education-aftercare", grouped.aftercare, "Aftercare");
  renderEducationGroup("education-kontrendikasyon", grouped.kontrendikasyon, "Kontrendikasyonlar");
}

function renderEducationGroup(containerId, items = [], title) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  const header = document.createElement("p");
  header.className = "text-xs uppercase tracking-wide text-slate-400";
  header.textContent = title;
  container.appendChild(header);
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "p-3 rounded-xl bg-white border border-brand-100 text-sm space-y-1 shadow-sm";
    row.innerHTML = `
      <p class="font-semibold">${item.title}</p>
      <p class="text-slate-600">${item.content}</p>
    `;
    container.appendChild(row);
  });
}

async function loadCampaigns() {
  const container = document.getElementById("campaign-list");
  if (!container) return;
  container.innerHTML = "";
  const campaigns = await fetchJSON("/api/campaigns");
  const now = new Date();
  campaigns.forEach((c) => {
    const start = new Date(c.valid_from);
    const end = new Date(c.valid_to);
    const isActive = start <= now && end >= now;
    const badge = c.type.replace("_", " ");
    const card = document.createElement("div");
    card.className = "p-3 rounded-xl bg-white border border-brand-100 space-y-1 shadow-sm";
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <h4 class="font-semibold">${c.title}</h4>
        <span class="text-xs px-2 py-1 rounded-lg ${isActive ? "bg-emerald-100 text-emerald-800" : "bg-brand-50 text-slate-700"}">
          ${badge}
        </span>
      </div>
      <p class="text-sm text-slate-600">${c.description}</p>
      <p class="text-xs text-slate-500">${c.valid_from} - ${c.valid_to}</p>
    `;
    container.appendChild(card);
  });
}

async function loadWorkshop() {
  const container = document.getElementById("next-workshop");
  if (!container) return;
  container.innerHTML = "";
  const workshops = await fetchJSON("/api/workshops");
  const list = Array.isArray(workshops) ? workshops : [];
  if (!list.length) {
    container.textContent = "Yakında paylaşılacak.";
    return;
  }

  list
    .filter(Boolean)
    .forEach((workshop) => {
      const title = workshop.title || workshop.workshop || "Workshop";
      const dateVal = typeof workshop.date === "string" ? workshop.date.slice(0, 10) : "";
      const dateLocation = [dateVal, workshop.location || ""].filter(Boolean).join(" • ");
      const card = document.createElement("div");
      card.className = "p-3 rounded-xl bg-white border border-brand-100 space-y-1 shadow-sm";
      card.innerHTML = `
        <p class="font-semibold">${title}</p>
        <p class="text-slate-600">${dateLocation || "Tarih paylaşılacak"}</p>
        <p class="text-sm text-slate-500">${workshop.instructor || ""}</p>
      `;
      container.appendChild(card);
    });
}

async function loadFaqs() {
  const container = document.getElementById("faq-list");
  if (!container) return;
  container.innerHTML = "";
  const faqs = await fetchJSON("/api/faqs");
  faqs.forEach((faq) => {
    const row = document.createElement("details");
    row.className = "rounded-xl bg-white border border-brand-100 p-3 shadow-sm";
    row.innerHTML = `
      <summary class="font-semibold cursor-pointer">${faq.question}</summary>
      <p class="text-sm text-slate-600 mt-2">${faq.answer}</p>
    `;
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

function setupWorkshopAdmin() {
  const form = document.getElementById("workshop-form");
  const success = document.getElementById("workshop-success");
  if (!form) return;
  const toggle = () => refreshWorkshopAdminVisibility();
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
      await fetchJSON("/api/workshops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (success) {
        success.classList.remove("hidden");
        setTimeout(() => success.classList.add("hidden"), 2000);
      }
      form.reset();
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

function setupPhotoForm() {
  const form = document.getElementById("photo-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    try {
      await fetchJSON("/api/photos", { method: "POST", body: formData });
      form.reset();
      loadPhotos();
    } catch (err) {
      alert("Fotoğraf yüklenemedi.");
    }
  });
}

async function loadPhotos() {
  const gallery = document.getElementById("photo-gallery");
  if (!gallery) return;
  gallery.innerHTML = "";
  try {
    const photos = await fetchJSON("/api/photos");
    photos.forEach((photo) => {
      const card = document.createElement("div");
      card.className = "relative rounded-xl overflow-hidden border border-brand-100 shadow-sm bg-white";
      card.innerHTML = `
        <img src="${photo.image_url}" alt="İşlem fotoğrafı" class="w-full h-32 object-cover">
        ${
          photo.is_monthly_winner
            ? '<span class="absolute top-2 left-2 px-2 py-1 rounded-lg bg-amber-400 text-amber-900 text-xs font-bold">Bu Ayın En Güzel İşlemi</span>'
            : ""
        }
        ${
          photo.feedback
            ? `<div class="p-2 text-xs bg-brand-50 text-slate-700">Feedback: ${photo.feedback}</div>`
            : ""
        }
      `;
      gallery.appendChild(card);
    });
  } catch (err) {
    console.error(err);
  }
}

async function loadFeed() {
  try {
    feedPhotos = await fetchJSON("/api/photos/feed");
    renderFeed();
  } catch (err) {
    console.error(err);
    const feed = document.getElementById("feed-gallery");
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
    feed.innerHTML = '<p class="text-sm text-slate-600">Henüz paylaşım yok.</p>';
    return;
  }

  photos.forEach((photo) => {
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-brand-100 shadow-sm bg-white overflow-hidden";
    const date = photo.created_at ? new Date(photo.created_at).toLocaleDateString("tr-TR") : "";
    const initials = (photo.student_name || "Uzman").slice(0, 2).toUpperCase();
    const winnerBadge =
      photo.is_monthly_winner
        ? '<span class="px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold border border-green-200">Bu Ayın Kazananı</span>'
        : "";
    card.innerHTML = `
      <div class="flex items-center justify-between gap-3 p-3">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700">${initials}</div>
          <div>
            <p class="font-semibold text-sm text-slate-800">${photo.student_name || "Uzman"}</p>
            <p class="text-xs text-slate-500">${date}</p>
          </div>
        </div>
        ${winnerBadge}
      </div>
      <div class="bg-slate-100 relative">
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
        isActive ? "bg-brand-100 border-brand-200 text-brand-700" : "bg-white border-brand-100 text-slate-700 hover:border-brand-200",
      ].join(" ");
      btn.innerHTML = `
        <span>${reaction.label}</span>
        <span class="text-xs text-slate-500">${count}</span>
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
      header.className = "text-xs uppercase tracking-wide text-slate-400";
      header.textContent = "Feedbackler";
      feedbackList.appendChild(header);
      feedbacks.forEach((fb) => {
        const row = document.createElement("div");
        const fbDate = fb.created_at ? new Date(fb.created_at).toLocaleDateString("tr-TR") : "";
        row.className = "p-2 rounded-lg bg-brand-50 border border-brand-100";
        row.innerHTML = `
          <p class="text-xs font-semibold text-slate-700">${fb.student_name || "Uzman"} <span class="text-[11px] text-slate-400">${fbDate}</span></p>
          <p class="text-sm text-slate-700">${fb.feedback}</p>
        `;
        feedbackList.appendChild(row);
      });
    }
    if (currentUserRole === "master" || currentUserRole === "admin") {
      const feedbackWrapper = document.createElement("div");
      feedbackWrapper.className = "space-y-2";
      const feedbackInputId = `feedback-${photo.id}`;
      feedbackWrapper.innerHTML = `
        <label for="${feedbackInputId}" class="text-xs text-slate-500">Feedback bırak</label>
        <div class="flex gap-2">
          <input id="${feedbackInputId}" type="text" maxlength="280" value=""
            class="flex-1 rounded-lg border border-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" placeholder="Gözlemini yaz">
          <button type="button" class="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700">Gönder</button>
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
        photo.is_monthly_winner ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-white border border-brand-100 text-slate-700 hover:border-brand-200",
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
