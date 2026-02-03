// ==============================
// Cross & Crescent - app.js (DATA-DRIVEN)
// Loads:
//   - data/objects.json  (array of objects)
//   - data/periods.json  ({ periods: [...] })
// Renders:
//   - markers per object location
//   - hover tooltips with thumbnails (clamped text via CSS)
//   - click opens right panel with full details
//   - routes (influence) from each location -> target, colored by influence
// ==============================

const periodRange = document.getElementById("periodRange");
const periodValue = document.getElementById("periodValue");
const panelTitle = document.getElementById("panelTitle");
const panelBody = document.getElementById("panelBody");

let map = null;
let markersLayer = null;
let routesLayer = null;

let PERIODS = [];              // from data/periods.json
let OBJECTS_BY_ID = new Map(); // from data/objects.json

// Track the currently selected marker so we can keep it darker
let selectedMarker = null;

function setPanel(title, html) {
  panelTitle.textContent = title;
  panelBody.innerHTML = html;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initMap() {
  map = L.map("map", { scrollWheelZoom: false }).setView([41.5, 18], 4);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: ""
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  routesLayer = L.layerGroup().addTo(map);
}

function clearLayers() {
  markersLayer.clearLayers();
  routesLayer.clearLayers();
  selectedMarker = null;
}

function updateActiveBand(index) {
  document.querySelectorAll(".bands span").forEach(el => {
    el.classList.toggle("active", Number(el.dataset.index) === index);
  });
}

function updatePeriodUI(index) {
  const p = PERIODS[index];
  if (!p) return;
  const start = p.yearStart ?? "";
  const end = p.yearEnd ?? "";
  periodValue.textContent = `${p.label} (${start}–${end})`;
}

// --- Color / style helpers ---
function routeColor(influence) {
  const v = String(influence || "").trim().toLowerCase();
  if (v === "christianity") return "#d32f2f"; // red
  if (v === "islam") return "#2e7d32";        // green
  return "#5e35b1";                           // purple default
}

function categoryColor(category) {
  const v = String(category || "").trim().toLowerCase();
  if (v === "cultural") return "#2b6cb0";     // blue
  if (v === "commercial") return "#2f855a";   // green
  if (v === "conquer") return "#c53030";      // red-ish
  return "#0b4f6c";                           // fallback teal
}

// Marker visual states (bigger + brighter, then darker on hover/click)
function markerStyleBase(color) {
  return {
    radius: 12,         // ✅ bigger
    weight: 2,
    color: color,
    fillColor: color,
    fillOpacity: 0.45  // ✅ brighter
  };
}

function markerStyleHover(color) {
  return {
    radius: 14,        // slightly bigger on hover
    weight: 3,
    color: color,
    fillColor: color,
    fillOpacity: 0.95
  };
}

function markerStyleSelected(color) {
  return {
    radius: 14,
    weight: 4,
    color: color,
    fillColor: color,
    fillOpacity: 1
  };
}

// --- Hover tooltip HTML ---
function buildHoverHTML(obj) {
  const title = escapeHtml(obj?.title || obj?.id || "Object");
  const text = escapeHtml(obj?.hover?.text || "");
  const thumb = String(obj?.hover?.thumb || "").trim();

  const imgHtml = thumb
    ? `<img class="hover-thumb" src="${escapeHtml(thumb)}" alt="${title}" />`
    : "";

  return `
    <div class="hover-card">
      ${imgHtml}
      <div class="hover-meta">
        <div class="hover-title">${title}</div>
        ${text ? `<div class="hover-text">${text}</div>` : ""}
      </div>
    </div>
  `;
}

// --- Right panel HTML ---
function buildPanelHTML(obj, period) {
  const title = escapeHtml(obj?.title || obj?.id || "Object");
  const subtitle = escapeHtml(obj?.panel?.subtitle || "");
  const body = escapeHtml(obj?.panel?.body || "");

  const tags = Array.isArray(obj?.tags) ? obj.tags : [];
  const tagHtml = tags.length
    ? `<p><strong>Tags:</strong> ${tags.map(t => escapeHtml(t)).join(", ")}</p>`
    : "";

  const locs = Array.isArray(obj?.locations) ? obj.locations : [];
  const locHtml = locs.length
    ? `<p><strong>Locations:</strong> ${locs.map(l => escapeHtml(l.label || "")).filter(Boolean).join(", ")}</p>`
    : "";

  const pLabel = escapeHtml(period?.label || "");
  const pStart = escapeHtml(period?.yearStart ?? "");
  const pEnd = escapeHtml(period?.yearEnd ?? "");

  const images = Array.isArray(obj?.panel?.images) ? obj.panel.images : [];
  const imagesHtml = images.length
    ? `
      <div class="panel-images">
        ${images
          .filter(Boolean)
          .map(src => `<img class="panel-img" src="${escapeHtml(src)}" alt="${title}" />`)
          .join("")}
      </div>
    `
    : "";

  return `
    <p><strong>Selected period:</strong> ${pLabel} (${pStart}–${pEnd})</p>
    ${subtitle ? `<h3>${subtitle}</h3>` : ""}
    ${tagHtml}
    ${locHtml}
    ${body ? `<p>${body}</p>` : ""}
    ${imagesHtml}
  `;
}

// --- Data loading ---
async function loadData() {
  const [objectsRes, periodsRes] = await Promise.all([
    fetch("data/objects.json", { cache: "no-store" }),
    fetch("data/periods.json", { cache: "no-store" })
  ]);

  if (!objectsRes.ok) throw new Error("Failed to load data/objects.json");
  if (!periodsRes.ok) throw new Error("Failed to load data/periods.json");

  const objectsArr = await objectsRes.json();
  const periodsObj = await periodsRes.json();

  if (!Array.isArray(objectsArr)) {
    throw new Error("objects.json must be an array of objects");
  }
  if (!periodsObj || !Array.isArray(periodsObj.periods)) {
    throw new Error('periods.json must be an object like: { "periods": [ ... ] }');
  }

  OBJECTS_BY_ID = new Map(objectsArr.map(o => [o.id, o]));
  PERIODS = periodsObj.periods;

  // Keep slider in sync
  periodRange.min = "0";
  periodRange.max = String(Math.max(0, PERIODS.length - 1));
  if (!periodRange.value) periodRange.value = "0";

  const v = Number(periodRange.value);
  if (v > PERIODS.length - 1) periodRange.value = String(PERIODS.length - 1);
}

// --- Render for a period index ---
function drawForPeriod(periodIndex) {
  const period = PERIODS[periodIndex];
  clearLayers();

  if (!period) {
    setPanel("No period", "<p>Period not found.</p>");
    return;
  }

  const objectIds = Array.isArray(period.objects) ? period.objects : [];

  if (objectIds.length === 0) {
    setPanel("No objects", `<p>No objects configured for ${escapeHtml(period.label)}.</p>`);
    return;
  }

  for (const id of objectIds) {
    const obj = OBJECTS_BY_ID.get(id);
    if (!obj) continue;

    const col = categoryColor(obj.category);
    const baseStyle = markerStyleBase(col);
    const hoverStyle = markerStyleHover(col);
    const selectedStyle = markerStyleSelected(col);

    const locations = Array.isArray(obj.locations) ? obj.locations : [];
    const routes = Array.isArray(obj.routes) ? obj.routes : [];

    if (locations.length === 0) continue;

    for (const loc of locations) {
      if (loc?.lat == null || loc?.lng == null) continue;

      const marker = L.circleMarker([Number(loc.lat), Number(loc.lng)], baseStyle);

      // Store styles on marker for easy toggling
      marker.__baseStyle = baseStyle;
      marker.__hoverStyle = hoverStyle;
      marker.__selectedStyle = selectedStyle;

      marker.bindTooltip(buildHoverHTML(obj), {
        direction: "top",
        offset: [0, -10],
        opacity: 1,
        className: "hover-tooltip",
        sticky: true
      });

      // Hover: darker/stronger
      marker.on("mouseover", () => {
        if (selectedMarker === marker) return; // selected stays selected style
        marker.setStyle(marker.__hoverStyle);
      });

      marker.on("mouseout", () => {
        if (selectedMarker === marker) return;
        marker.setStyle(marker.__baseStyle);
      });

      // Click: select marker (stay circular, just darker/stronger)
      marker.on("click", () => {
        // Unselect previous
        if (selectedMarker && selectedMarker !== marker) {
          selectedMarker.setStyle(selectedMarker.__baseStyle);
        }
        selectedMarker = marker;
        marker.setStyle(marker.__selectedStyle);

        setPanel(obj.title || obj.id || "Object", buildPanelHTML(obj, period));
      });

      marker.addTo(markersLayer);

      // Routes from this location to each target
      for (const r of routes) {
        if (r?.toLat == null || r?.toLng == null) continue;

        L.polyline(
          [[Number(loc.lat), Number(loc.lng)], [Number(r.toLat), Number(r.toLng)]],
          {
            color: routeColor(r.influence),
            weight: 3,
            opacity: 0.9,
            dashArray: "6 8"
          }
        ).addTo(routesLayer);
      }
    }
  }

  setPanel(
    "Select an object",
    `<p>Hover markers to preview. Click a marker to see full details.</p>`
  );
}

function applyPeriod(index) {
  const idx = Math.max(0, Math.min(index, PERIODS.length - 1));
  periodRange.value = String(idx);
  updatePeriodUI(idx);
  updateActiveBand(idx);
  drawForPeriod(idx);
}

// --- Controls wiring ---
function wireControls() {
  periodRange.addEventListener("input", (e) => {
    applyPeriod(Number(e.target.value));
  });
}

function wireBands() {
  document.querySelectorAll(".bands span").forEach((el) => {
    const activate = () => {
      const idx = Number(el.dataset.index);
      if (Number.isFinite(idx) && idx >= 0 && idx < PERIODS.length) {
        applyPeriod(idx);
      }
    };

    el.addEventListener("click", activate);

    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        activate();
      }
    });
  });
}

// --- Main ---
(async function main() {
  initMap();
  wireControls();
  wireBands();

  try {
    await loadData();
    applyPeriod(Number(periodRange.value));
  } catch (err) {
    setPanel("Error", `<p>${escapeHtml(err.message)}</p>`);
    console.error(err);
  }
})();
