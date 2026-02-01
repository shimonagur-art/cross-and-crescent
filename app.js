// -----------------------------
// Cross & Crescent — Objects Map
// -----------------------------

let OBJECTS_DATA = null;

const markersLayer = L.layerGroup();
const routesLayer = L.layerGroup();

function inspirationColor(inspiration) {
  if (inspiration === "christianity") return "#c62828"; // red
  if (inspiration === "islam") return "#2e7d32";        // green
  return "#555";
}

async function loadObjectsData() {
  const res = await fetch("data/objects.json");
  if (!res.ok) throw new Error("Failed to load data/objects.json");
  return res.json();
}

function showObjectDetails(obj, currentEvent) {
  const el = document.getElementById("details");
  if (!el) return;

  const images = (obj.images || [])
    .map(src => `<img src="${src}" alt="${escapeHtml(obj.title)}" loading="lazy" />`)
    .join("");

  const eventsList = (obj.events || [])
    .map(e => {
      const place = e.place?.name ? ` — ${escapeHtml(e.place.name)}` : "";
      const note = e.note ? `: ${escapeHtml(e.note)}` : "";
      return `<li><b>${e.year ?? ""}</b> — ${escapeHtml(e.kind)}${place}${note}</li>`;
    })
    .join("");

  el.innerHTML = `
    <div class="panel-inner">
      <h2>${escapeHtml(obj.title)}</h2>
      <div class="meta">
        <span class="pill">${escapeHtml(obj.type || "object")}</span>
        ${currentEvent?.year ? `<span class="pill">${currentEvent.year}</span>` : ""}
        ${currentEvent?.place?.name ? `<span class="pill">${escapeHtml(currentEvent.place.name)}</span>` : ""}
      </div>

      <p class="summary">${escapeHtml(obj.summary || "")}</p>
      <p class="full">${escapeHtml(obj.fullText || "")}</p>

      ${images ? `<div class="gallery">${images}</div>` : ""}

      <hr />
      <h3>Events</h3>
      <ul class="events">${eventsList}</ul>
    </div>
  `;
}

function makeThumbnailIcon(imgSrc, title) {
  const html = `
    <div class="obj-marker" title="${escapeHtml(title)}">
      <img src="${imgSrc}" alt="${escapeHtml(title)}" />
    </div>
  `;

  return L.divIcon({
    className: "obj-marker-wrap",
    html,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
}

function renderYear(year, map) {
  if (!OBJECTS_DATA) return;

  markersLayer.clearLayers();
  routesLayer.clearLayers();

  const objects = OBJECTS_DATA.objects || [];
  const byId = Object.fromEntries(objects.map(o => [o.id, o]));

  for (const obj of objects) {
    const allEvents = obj.events || [];
    const eventsUpToYear = allEvents.filter(e => typeof e.year === "number" && e.year <= year);
    if (!eventsUpToYear.length) continue;

    // Latest event determines current marker position (up to the selected year)
    const currentEvent = eventsUpToYear[eventsUpToYear.length - 1];
    const lat = currentEvent?.place?.lat;
    const lng = currentEvent?.place?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") continue;

    // Marker
    const icon = makeThumbnailIcon(obj.thumbnail, obj.title);
    const marker = L.marker([lat, lng], { icon }).addTo(markersLayer);

    // Hover tooltip (small info)
    marker.bindTooltip(
      `<b>${escapeHtml(obj.title)}</b><br>${currentEvent.year} — ${escapeHtml(currentEvent.place.name)}<br>${escapeHtml(obj.summary || "")}`,
      { direction: "top", sticky: true, opacity: 0.95 }
    );

    // Click -> side panel
    marker.on("click", () => showObjectDetails(obj, currentEvent));

    // Movement routes: connect created/moved places in chronological order up to selected year
    const placeEvents = eventsUpToYear.filter(e => ["created", "moved"].includes(e.kind) && e.place);
    for (let i = 1; i < placeEvents.length; i++) {
      const a = placeEvents[i - 1].place;
      const b = placeEvents[i].place;
      if ([a.lat, a.lng, b.lat, b.lng].some(v => typeof v !== "number")) continue;

      L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
        color: "#555",
        weight: 3,
        dashArray: "2 8",
        opacity: 0.9
      }).addTo(routesLayer);
    }

    // Inspiration routes: source (inspiredBy) -> current object position
    const inspirations = eventsUpToYear.filter(e => e.kind === "inspired_by" && e.inspiredByObjectId);
    for (const e of inspirations) {
      const sourceObj = byId[e.inspiredByObjectId];
      if (!sourceObj) continue;

      // Find source object position at the inspiration year (or latest <= that year)
      const srcEvents = (sourceObj.events || []).filter(x => typeof x.year === "number" && x.year <= e.year);
      if (!srcEvents.length) continue;

      const srcCurrent = srcEvents[srcEvents.length - 1];
      const s = srcCurrent?.place;
      if (!s || [s.lat, s.lng].some(v => typeof v !== "number")) continue;

      L.polyline([[s.lat, s.lng], [lat, lng]], {
        color: inspirationColor(e.inspiration),
        weight: 3,
        dashArray: "2 8",
        opacity: 0.95
      }).addTo(routesLayer);
    }
  }

  // Ensure layers are on map
  if (!map.hasLayer(routesLayer)) routesLayer.addTo(map);
  if (!map.hasLayer(markersLayer)) markersLayer.addTo(map);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// -----------------------------
// Boot
// -----------------------------
(async function init() {
  // Create map
  const map = L.map("map", { zoomControl: true }).setView([41.9, 12.5], 4);

  // Tile layer (OpenStreetMap)
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 8,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  routesLayer.addTo(map);
  markersLayer.addTo(map);

  // Load data
  OBJECTS_DATA = await loadObjectsData();

  // Slider hookup
  const slider = document.getElementById("yearSlider");
  const yearValue = document.getElementById("yearValue");

  const startYear = parseInt(slider?.value || "1200", 10);
  if (yearValue) yearValue.textContent = String(startYear);

  renderYear(startYear, map);

  if (slider) {
    slider.addEventListener("input", (e) => {
      const y = parseInt(e.target.value, 10);
      if (yearValue) yearValue.textContent = String(y);
      renderYear(y, map);
    });
  }
})();
