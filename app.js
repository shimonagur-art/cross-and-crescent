const periodRange = document.getElementById("periodRange");
const periodValue = document.getElementById("periodValue");
const panelTitle = document.getElementById("panelTitle");
const panelBody = document.getElementById("panelBody");

// 9 discrete periods
const periods = [
  { label: "1st Crusade", start: 1096, end: 1099 },
  { label: "2nd Crusade", start: 1147, end: 1149 },
  { label: "3rd Crusade", start: 1189, end: 1192 },
  { label: "4th Crusade", start: 1202, end: 1204 },
  { label: "5th Crusade", start: 1217, end: 1221 },
  { label: "6th Crusade", start: 1228, end: 1229 },
  { label: "7th Crusade", start: 1248, end: 1254 },
  { label: "8th Crusade", start: 1270, end: 1270 },
  { label: "Post-Crusades", start: 1270, end: 1350 }
];

let dataset = null;
let objectsById = new Map();

let map = null;
let markersLayer = null;
let routesLayer = null;

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
}

function updateActiveBand(index) {
  document.querySelectorAll(".bands span").forEach(el => {
    el.classList.toggle("active", Number(el.dataset.index) === index);
  });
}

async function loadData() {
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load data.json");
  dataset = await res.json();

  if (!dataset.objects || !dataset.events) {
    throw new Error("data.json must contain { objects: [...], events: [...] }");
  }

  objectsById = new Map(dataset.objects.map(o => [o.object_id, o]));
}

function updatePeriodUI(index) {
  const p = periods[index];
  periodValue.textContent = `${p.label} (${p.start}–${p.end})`;
}

// --- Styling helpers ---
function inspirationColor(inspiration) {
  const v = String(inspiration || "").trim().toLowerCase();
  if (v === "christianity") return "#d32f2f"; // red
  if (v === "islam") return "#2e7d32";        // green
  return "#5e35b1";                           // purple default
}

function markerStyleForEvent(ev) {
  const kind = String(ev.kind || "").toLowerCase();
  if (kind === "created") {
    return { radius: 8, color: "#111", fillColor: "#111" };
  }
  if (kind === "inspired_by") {
    const c = inspirationColor(ev.inspiration);
    return { radius: 7, color: c, fillColor: c };
  }
  // fallback
  return { radius: 6, color: "#0b4f6c", fillColor: "#0b4f6c" };
}

function buildPanelHtml(obj, ev, p, visibleEventsForThisObject) {
  const title = escapeHtml(obj?.title || obj?.object_id || "Unknown object");

  const thumbPath = obj?.thumbnail ? String(obj.thumbnail).trim() : "";
  // IMPORTANT: show the path if the image fails to load (helps spot typo/case mismatch)
  const thumbHtml = thumbPath
    ? `
      <img class="panelThumb"
           src="${escapeHtml(thumbPath)}"
           alt="${title} thumbnail"
           onerror="this.style.display='none'; document.getElementById('thumbPath').style.display='block';" />
      <p id="thumbPath" style="display:none;font-size:12px;color:#666;">
        Thumbnail not found: <code>${escapeHtml(thumbPath)}</code>
      </p>
    `
    : "";

  const kind = escapeHtml(ev?.kind || "");
  const place = escapeHtml(ev?.place_name || "");
  const year = escapeHtml(ev?.year || "");
  const note = escapeHtml(ev?.note || "");

  const inspiredById = String(ev?.inspired_by_object_id || "").trim();
  let inspiredHtml = "";
  if (inspiredById) {
    const srcObj = objectsById.get(inspiredById);
    inspiredHtml = `<p><strong>Inspired by:</strong> ${escapeHtml(srcObj?.title || inspiredById)} (${escapeHtml(inspiredById)})</p>`;
  }

  const inspirationHtml = ev?.inspiration
    ? `<p><strong>Inspiration:</strong> ${escapeHtml(ev.inspiration)}</p>`
    : "";

  const timelineHtml = visibleEventsForThisObject?.length
    ? `
      <p><strong>Visible events up to ${escapeHtml(p.end)}:</strong></p>
      <ul>
        ${visibleEventsForThisObject
          .map(x => `<li>${escapeHtml(x.year)}: ${escapeHtml(x.place_name)} (${escapeHtml(x.kind)})</li>`)
          .join("")}
      </ul>
    `
    : "";

  return `
    <p><strong>Selected period:</strong> ${escapeHtml(p.label)} (${p.start}–${p.end})</p>
    ${thumbHtml}
    <p><strong>Event:</strong> ${kind} — <strong>${place}</strong> (${year})</p>
    ${note ? `<p>${note}</p>` : ""}
    ${inspiredHtml}
    ${inspirationHtml}
    <hr />
    ${obj?.summary ? `<p><strong>Object summary</strong><br>${escapeHtml(obj.summary)}</p>` : ""}
    ${timelineHtml}
  `;
}

// Find a good "source" location for an inspired_by line:
// pick the earliest available event (prefer created) for the inspired_by_object_id
function findSourceLatLng(sourceObjectId, maxYear) {
  const srcEvents = dataset.events
    .filter(e => e.object_id === sourceObjectId)
    .filter(e => e.lat != null && e.lng != null)
    .filter(e => Number(e.year) <= Number(maxYear));

  if (srcEvents.length === 0) return null;

  // Prefer created if exists, otherwise earliest
  const created = srcEvents
    .filter(e => String(e.kind || "").toLowerCase() === "created")
    .sort((a, b) => Number(a.year) - Number(b.year))[0];

  const best = created || srcEvents.sort((a, b) => Number(a.year) - Number(b.year))[0];
  return [Number(best.lat), Number(best.lng)];
}

function drawForPeriod(periodIndex) {
  if (!dataset) return;

  const p = periods[periodIndex];
  clearLayers();

  // Keep "cumulative" behaviour (like your original demo)
  const visibleEvents = dataset.events
    .filter(e => Number(e.year) <= p.end)
    .filter(e => e.lat != null && e.lng != null);

  if (visibleEvents.length === 0) {
    setPanel("No events yet", `<p>No mapped events found up to ${escapeHtml(p.end)}.</p>`);
    return;
  }

  // Group by object_id (for panel timelines)
  const byObject = new Map();
  for (const ev of visibleEvents) {
    if (!byObject.has(ev.object_id)) byObject.set(ev.object_id, []);
    byObject.get(ev.object_id).push(ev);
  }

  // Sort each object's events once
  for (const evs of byObject.values()) {
    evs.sort((a, b) => Number(a.year) - Number(b.year));
  }

  // Draw markers and inspired_by dotted lines
  for (const ev of visibleEvents) {
    const obj = objectsById.get(ev.object_id) || { object_id: ev.object_id, title: ev.object_id };
    const objEvents = byObject.get(ev.object_id) || [];

    const style = markerStyleForEvent(ev);
    const marker = L.circleMarker([Number(ev.lat), Number(ev.lng)], {
      radius: style.radius,
      weight: 2,
      color: style.color,
      fillColor: style.fillColor,
      fillOpacity: 0.35
    });

    marker.on("click", () => {
      setPanel(obj.title || obj.object_id || "Object", buildPanelHtml(obj, ev, p, objEvents));
    });

    marker.addTo(markersLayer);

    // Inspired-by dotted route
    if (String(ev.kind || "").toLowerCase() === "inspired_by" && ev.inspired_by_object_id) {
      const src = findSourceLatLng(String(ev.inspired_by_object_id).trim(), ev.year);
      if (src) {
        const c = inspirationColor(ev.inspiration);
        L.polyline([src, [Number(ev.lat), Number(ev.lng)]], {
          color: c,
          weight: 3,
          opacity: 0.9,
          dashArray: "6 6" // dotted/dashed
        }).addTo(routesLayer);
      }
    }
  }
}

function applyPeriod(index) {
  updatePeriodUI(index);
  updateActiveBand(index);
  drawForPeriod(index);
}

function wireControls() {
  periodRange.addEventListener("input", (e) => {
    applyPeriod(Number(e.target.value));
  });
}

function wireBands() {
  document.querySelectorAll(".bands span").forEach((el) => {
    const activate = () => {
      const idx = Number(el.dataset.index);
      periodRange.value = String(idx);
      applyPeriod(idx);
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
