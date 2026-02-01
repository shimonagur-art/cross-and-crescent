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
  { label: "Post-Crusades", start: 1270, end: 1360 } // slightly past 1350
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

function markerRadiusForKind(kind) {
  const k = String(kind || "").toLowerCase();
  if (k === "created") return 8;
  return 6; // inspired_by, moved, influence, etc.
}

function buildPanelHtml(obj, ev, p, visibleEventsForThisObject) {
  const title = escapeHtml(obj?.title || obj?.object_id || "Unknown object");
  const type = escapeHtml(obj?.type || "");
  const summary = escapeHtml(obj?.summary || "");
  const note = escapeHtml(ev?.note || "");
  const place = escapeHtml(ev?.place_name || "");
  const kind = escapeHtml(ev?.kind || "");
  const year = escapeHtml(ev?.year || "");

  const thumb = obj?.thumbnail
    ? `<img class="panelThumb" src="${escapeHtml(obj.thumbnail)}" alt="${title} thumbnail">`
    : "";

  // Inspired-by link (optional)
  let inspiredHtml = "";
  if (ev?.inspired_by_object_id) {
    const srcObj = objectsById.get(ev.inspired_by_object_id);
    const srcTitle = srcObj ? srcObj.title : ev.inspired_by_object_id;
    inspiredHtml = `<p><strong>Inspired by:</strong> ${escapeHtml(srcTitle)} (${escapeHtml(ev.inspired_by_object_id)})</p>`;
  }

  const inspirationHtml = ev?.inspiration
    ? `<p><strong>Inspiration:</strong> ${escapeHtml(ev.inspiration)}</p>`
    : "";

  const tags = Array.isArray(obj?.tags) ? obj.tags : [];
  const tagsHtml = tags.length
    ? `<p><strong>Tags:</strong> ${tags.map(t => escapeHtml(String(t).trim())).filter(Boolean).join(", ")}</p>`
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
    ${thumb}
    ${type ? `<p><strong>Type:</strong> ${type}</p>` : ""}
    <p><strong>Event:</strong> ${kind} — <strong>${place}</strong> (${year})</p>
    ${note ? `<p>${note}</p>` : ""}
    ${inspiredHtml}
    ${inspirationHtml}
    <hr />
    ${summary ? `<p><strong>Object summary</strong><br>${summary}</p>` : ""}
    ${tagsHtml}
    ${timelineHtml}
  `;
}

function drawForPeriod(periodIndex) {
  if (!dataset) return;

  const p = periods[periodIndex];
  clearLayers();

  // Keep same behaviour as your demo:
  // show all events up to the period end year (cumulative)
  const visibleEvents = dataset.events
    .filter(e => Number(e.year) <= p.end)
    .filter(e => e.lat != null && e.lng != null);

  if (visibleEvents.length === 0) {
    setPanel("No events yet", `<p>No mapped events found up to ${escapeHtml(p.end)}.</p>`);
    return;
  }

  // Group by object_id
  const byObject = new Map();
  for (const ev of visibleEvents) {
    const id = ev.object_id;
    if (!byObject.has(id)) byObject.set(id, []);
    byObject.get(id).push(ev);
  }

  for (const [objectId, evs] of byObject.entries()) {
    const obj = objectsById.get(objectId) || { object_id: objectId, title: objectId };

    // Sort by year for routes and timeline
    evs.sort((a, b) => Number(a.year) - Number(b.year));

    // Markers
    for (const ev of evs) {
      const marker = L.circleMarker([Number(ev.lat), Number(ev.lng)], {
        radius: markerRadiusForKind(ev.kind),
        weight: 2
      });

      marker.on("click", () => {
        setPanel(obj.title || obj.object_id || "Object", buildPanelHtml(obj, ev, p, evs));
      });

      marker.addTo(markersLayer);
    }

    // Route line if 2+ visible events for this object
    if (evs.length >= 2) {
      const latlngs = evs.map(e => [Number(e.lat), Number(e.lng)]);
      L.polyline(latlngs, { weight: 3, opacity: 0.8 }).addTo(routesLayer);
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
