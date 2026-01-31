const yearRange = document.getElementById("yearRange");
const yearValue = document.getElementById("yearValue");
const panelTitle = document.getElementById("panelTitle");
const panelBody = document.getElementById("panelBody");

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

function drawForYear(year) {
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
        setPanel(
          artifact.title,
          `
            <p><strong>Selected year:</strong> ${year}</p>
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

function updateYearUI(year) {
  yearValue.textContent = String(year);
}

function wireControls() {
  yearRange.addEventListener("input", (e) => {
    const year = Number(e.target.value);
    updateYearUI(year);
    drawForYear(year);
  });
}

(async function main() {
  initMap();
  wireControls();

  try {
    await loadData();
    const initialYear = Number(yearRange.value);
    updateYearUI(initialYear);
    drawForYear(initialYear);
  } catch (err) {
    setPanel("Error", `<p>${err.message}</p>`);
    console.error(err);
  }
})();
