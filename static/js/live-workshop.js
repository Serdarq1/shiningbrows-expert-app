async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : "İşlem başarısız oldu.";
    throw new Error(message);
  }
  return data;
}

function setStatus(message) {
  const el = document.getElementById("live-workshop-status");
  if (el) el.textContent = message;
}

function setMeta(workshop) {
  const title = document.getElementById("live-workshop-title");
  const meta = document.getElementById("live-workshop-meta");
  if (title) title.textContent = workshop.title || "Workshop";
  if (meta) {
    meta.textContent = [workshop.date || "", workshop.location || "", workshop.instructor || ""].filter(Boolean).join(" • ");
  }
}

async function loadWorkshopDetails() {
  const slug = window.liveWorkshopSlug;
  if (!slug) return;
  const workshop = await fetchJSON(`/api/live-workshops/${slug}`);
  setMeta(workshop);
  setStatus(`Yayın durumu: ${workshop.live_status || "hazırlanıyor"}`);
  if (workshop.unlocked) {
    const form = document.getElementById("live-workshop-unlock-form");
    if (form) form.classList.add("hidden");
    await loadPlayback();
  }
}

async function loadPlayback() {
  const slug = window.liveWorkshopSlug;
  if (!slug) return;
  const payload = await fetchJSON(`/api/live-workshops/${slug}/watch`);
  const wrap = document.getElementById("live-workshop-player-wrap");
  const player = document.getElementById("live-workshop-player");
  if (!wrap || !player) return;
  player.setAttribute("playback-id", payload.playback_id || "");
  player.setAttribute("playback-token", payload.playback_token || "");
  player.setAttribute("metadata-video-title", payload.title || "Workshop");
  wrap.classList.remove("hidden");
  setStatus(`Yayın durumu: ${payload.live_status || "canlı"}`);
}

function setupUnlockForm() {
  const form = document.getElementById("live-workshop-unlock-form");
  const input = document.getElementById("live-workshop-password");
  if (!form || !input) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = input.value.trim();
    if (!password) {
      setStatus("Şifre gerekli.");
      return;
    }
    setStatus("Şifre doğrulanıyor...");
    try {
      await fetchJSON(`/api/live-workshops/${window.liveWorkshopSlug}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      form.classList.add("hidden");
      await loadPlayback();
    } catch (error) {
      setStatus(error.message || "Yayın erişimi açılamadı.");
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupUnlockForm();
  try {
    await loadWorkshopDetails();
  } catch (error) {
    setStatus(error.message || "Workshop yüklenemedi.");
  }
});
