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
  { label: "Post-Crusades", start: 1270, end: 1360 } // “a bit past 1350”
];

let dataset = null;
let map = null;
let markersLayer = null;
let routesLayer = null;

function setPanel(title, html) {
  panelTitle.textContent = title;
  panelBody.innerHTML = html;
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

// unchanged core logic, but we’ll pass it the selected period end year
function drawForYear(year, periodLabel = null, periodStart = null, periodEnd = null) {
  if (!dataset) return;

  clearLayers();

  dataset.artifacts.forEach((artifact) => {
    const events = artifact.events
      .filter(e => e.year <= year)
      .sort((a, b) => a.year - b.year);

    if (events.length === 0) return;

    events.forEach((e) => {
      const marker = L.circleMarker([e.lat, e.lng], {
        radius: e.type === "origin" ? 8 : 6,
        weight: 2
      });

      marker.on("click", () => {
        const heading = periodLabel
          ? `${periodLabel} (${periodStart}–${periodEnd})`
          : `Up to ${year}`;

        setPanel(
          artifact.title,
          `
            <p><strong>Selected period:</strong> ${heading}</p>
            <p><strong>Event:</strong> ${e.type} — <strong>${e.place}</strong> (${e.year})</p>
            <p>${e.note}</p>
            <hr />
            <p><strong>Artefact summary</strong><br>${artifact.summary}</p>
            <p><strong>Visible events up to ${year}:</strong></p>
            <ul>
              ${events.map(ev => `<li>${ev.year}: ${ev.place} (${ev.type})</li>`).join("")}
            </ul>
          `
        );
      });

      marker.addTo(markersLayer);
    });

    if (events.length >= 2) {
      const latlngs = events.map(e => [e.lat, e.lng]);
      const line = L.polyline(latlngs, { weight: 3, opacity: 0.8 });
      line.addTo(routesLayer);
    }
  });
}

async function loadData() {
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load data.json");
  dataset = await res.json();
}

function updatePeriodUI(index) {
  const p = periods[index];
  periodValue.textContent = `${p.label} (${p.start}–${p.end})`;
}

// Convert slider index -> period end year and redraw
function applyPeriod(index) {
  const p = periods[index];
  updatePeriodUI(index);
  drawForYear(p.end, p.label, p.start, p.end);
}

function wireControls() {
  periodRange.addEventListener("input", (e) => {
    const idx = Number(e.target.value);
    applyPeriod(idx);
  });
}

(async function main() {
  initMap();
  wireControls();

  try {
    await loadData();
    const initialIdx = Number(periodRange.value);
    applyPeriod(initialIdx);
  } catch (err) {
    setPanel("Error", `<p>${err.message}</p>`);
    console.error(err);
  }
})();
