// ------------------------------------------------------------
// Grundeinstellungen
// ------------------------------------------------------------

// POIs werden nur angezeigt, wenn sie innerhalb dieses Radius liegen.
const MAX_DISTANCE_METERS = 5000;

// AR-Labels werden einmalig gerendert, sobald GPS verfügbar ist.
let poisRendered = false;

// Aktueller Nutzerstandort
let userPosition = null;

// Geladene POIs aus pois.json
let pois = [];

// DOM-Elemente
const scene = document.querySelector("a-scene");
const statusEl = document.querySelector("#status");
const permissionButton = document.querySelector("#permissionButton");

const poiPanel = document.querySelector("#poiPanel");
const poiTitle = document.querySelector("#poiTitle");
const poiDescription = document.querySelector("#poiDescription");
const poiDistance = document.querySelector("#poiDistance");
const closePanel = document.querySelector("#closePanel");


// ------------------------------------------------------------
// App starten
// ------------------------------------------------------------

initApp();

async function initApp() {
  setStatus("Lade POIs...");

  setupMotionPermissionButton();
  setupPoiPanel();

  try {
    pois = await loadPois();
    setStatus("POIs geladen. Warte auf Standortfreigabe...");
  } catch (error) {
    console.error(error);
    setStatus("POIs konnten nicht geladen werden. Prüfe die Datei pois.json.");
  }
}


// ------------------------------------------------------------
// POIs aus pois.json laden
// ------------------------------------------------------------

async function loadPois() {
  const response = await fetch("./pois.json");

  if (!response.ok) {
    throw new Error(`pois.json konnte nicht geladen werden: ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("pois.json muss ein Array enthalten.");
  }

  return data;
}


// ------------------------------------------------------------
// iOS: Bewegungssensoren erlauben
// ------------------------------------------------------------

function setupMotionPermissionButton() {
  const needsPermission =
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function";

  if (!needsPermission) {
    return;
  }

  permissionButton.style.display = "block";

  permissionButton.addEventListener("click", async () => {
    try {
      const response = await DeviceOrientationEvent.requestPermission();

      if (response === "granted") {
        permissionButton.style.display = "none";
        setStatus("Bewegungssensoren erlaubt. Warte auf Standort...");
      } else {
        setStatus(
          "Bewegungssensoren wurden nicht erlaubt. Die Richtung der POIs kann ungenau sein."
        );
      }
    } catch (error) {
      console.error(error);
      setStatus("Sensorfreigabe konnte nicht angefragt werden.");
    }
  });
}


// ------------------------------------------------------------
// GPS-Events von AR.js
// ------------------------------------------------------------

window.addEventListener("gps-camera-update-position", (event) => {
  const latitude = event.detail.position.latitude;
  const longitude = event.detail.position.longitude;

  userPosition = {
    latitude,
    longitude
  };

  setStatus(
    `Standort gefunden: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}<br>` +
    `Suche POIs im Umkreis von ${MAX_DISTANCE_METERS} m...`
  );

  if (!poisRendered) {
    renderNearbyPois();
  }
});

window.addEventListener("gps-camera-error", (event) => {
  console.error(event);

  setStatus(
    "Standort konnte nicht gelesen werden. Bitte GPS und Browser-Berechtigungen prüfen."
  );
});


// ------------------------------------------------------------
// POIs filtern und anzeigen
// ------------------------------------------------------------

function renderNearbyPois() {
  if (!userPosition) {
    setStatus("Noch kein Standort verfügbar.");
    return;
  }

  if (!pois.length) {
    setStatus("Keine POIs gefunden. Prüfe deine pois.json.");
    return;
  }

  const nearbyPois = pois
    .map((poi) => {
      const distance = distanceInMeters(
        userPosition.latitude,
        userPosition.longitude,
        poi.latitude,
        poi.longitude
      );

      return {
        ...poi,
        distance: Math.round(distance)
      };
    })
    .filter((poi) => poi.distance <= MAX_DISTANCE_METERS)
    .sort((a, b) => a.distance - b.distance);

  if (nearbyPois.length === 0) {
    setStatus(
      `Standort gefunden, aber keine POIs im Umkreis von ${MAX_DISTANCE_METERS} m.`
    );

    poisRendered = true;
    return;
  }

  nearbyPois.forEach((poi) => {
    const entity = createPoiEntity(poi);
    scene.appendChild(entity);
  });

  poisRendered = true;

  setStatus(
    `${nearbyPois.length} POI(s) gefunden. Tippe auf ein Label für Details.`
  );
}


// ------------------------------------------------------------
// AR-Entity für einen POI erstellen
// ------------------------------------------------------------

function createPoiEntity(poi) {
  const wrapper = document.createElement("a-entity");

  wrapper.setAttribute("gps-entity-place", {
    latitude: poi.latitude,
    longitude: poi.longitude
  });

  wrapper.setAttribute("look-at", "[gps-camera]");
  wrapper.setAttribute("scale", "18 18 18");
  wrapper.setAttribute("data-poi-id", poi.id);

  // Schwarzer Hintergrund hinter dem Text
  const background = document.createElement("a-plane");
  background.setAttribute("width", "5.2");
  background.setAttribute("height", "1.8");
  background.setAttribute("color", "#111111");
  background.setAttribute("opacity", "0.78");
  background.setAttribute("position", "0 1.6 0");

  // Textlabel
  const label = document.createElement("a-text");
  label.setAttribute("value", `${poi.name}\n${poi.distance} m`);
  label.setAttribute("align", "center");
  label.setAttribute("color", "#ffffff");
  label.setAttribute("width", "6");
  label.setAttribute("position", "0 1.6 0.05");

  // Gelber Markerpunkt
  const marker = document.createElement("a-sphere");
  marker.setAttribute("radius", "0.35");
  marker.setAttribute("color", "#ffcc00");
  marker.setAttribute("position", "0 0.35 0");

  wrapper.appendChild(background);
  wrapper.appendChild(label);
  wrapper.appendChild(marker);

  wrapper.addEventListener("click", () => {
    showPoiPanel(poi);
  });

  return wrapper;
}


// ------------------------------------------------------------
// POI-Detailfenster
// ------------------------------------------------------------

function setupPoiPanel() {
  closePanel.addEventListener("click", () => {
    hidePoiPanel();
  });
}

function showPoiPanel(poi) {
  poiTitle.textContent = poi.name;
  poiDescription.textContent = poi.description || "Keine Beschreibung hinterlegt.";
  poiDistance.textContent = `Entfernung: ca. ${poi.distance} m`;

  poiPanel.style.display = "block";
  poiPanel.setAttribute("aria-hidden", "false");
}

function hidePoiPanel() {
  poiPanel.style.display = "none";
  poiPanel.setAttribute("aria-hidden", "true");
}


// ------------------------------------------------------------
// Hilfsfunktionen
// ------------------------------------------------------------

function setStatus(message) {
  statusEl.innerHTML = message;
}

function distanceInMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}
