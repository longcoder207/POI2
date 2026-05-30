// ------------------------------------------------------------
// Grundeinstellungen
// ------------------------------------------------------------

// POIs werden nur angezeigt, wenn sie innerhalb dieses Radius liegen.
// Für Tests kannst du den Wert z. B. auf 100000 setzen.
const MAX_DISTANCE_METERS = 1500;

// Direkte Darstellungsgrößen.
// Wenn Kugel/Text zu klein sind, diese Werte erhöhen.
const MARKER_RADIUS = 8;
const LABEL_HEIGHT_ABOVE_MARKER = 18;
const LABEL_BACKGROUND_WIDTH = 55;
const LABEL_BACKGROUND_HEIGHT = 14;
const LABEL_TEXT_WIDTH = 50;

let userPosition = null;
let lastGpsPosition = null;
let pois = [];
let isLocateRequested = false;

// DOM-Elemente
const scene = document.querySelector("a-scene");
const statusEl = document.querySelector("#status");
const permissionButton = document.querySelector("#permissionButton");
const locateButton = document.querySelector("#locateButton");

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

  setupPoiPanel();
  setupLocateButton();

  try {
    pois = await loadPois();

    const sensorPermissionNeeded = setupMotionPermissionButton();

    if (sensorPermissionNeeded) {
      setStatus("POIs geladen. Bitte zuerst „Sensoren erlauben“ tippen.");
    } else {
      showLocateButton();
      setStatus("POIs geladen. Tippe auf „Standort bestimmen“.");
    }
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
// Button-Management
// ------------------------------------------------------------

function showPermissionButton() {
  permissionButton.style.display = "block";
  locateButton.style.display = "none";
}

function showLocateButton() {
  permissionButton.style.display = "none";
  locateButton.style.display = "block";
}

function hideActionButtons() {
  permissionButton.style.display = "none";
  locateButton.style.display = "none";
}


// ------------------------------------------------------------
// iOS: Bewegungssensoren erlauben
// ------------------------------------------------------------

function setupMotionPermissionButton() {
  const needsPermission =
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function";

  if (!needsPermission) {
    permissionButton.style.display = "none";
    return false;
  }

  showPermissionButton();

  permissionButton.addEventListener("click", async () => {
    try {
      setStatus("Frage Sensorfreigabe an...");

      const response = await DeviceOrientationEvent.requestPermission();

      if (response === "granted") {
        showLocateButton();
        setStatus("Sensoren erlaubt. Tippe jetzt auf „Standort bestimmen“.");
      } else {
        showLocateButton();
        setStatus(
          "Sensoren wurden nicht erlaubt. Du kannst den Standort trotzdem bestimmen, aber die Richtung der POIs kann ungenau sein."
        );
      }
    } catch (error) {
      console.error(error);

      showLocateButton();
      setStatus(
        "Sensorfreigabe konnte nicht angefragt werden. Tippe trotzdem auf „Standort bestimmen“."
      );
    }
  });

  return true;
}


// ------------------------------------------------------------
// Button: Standort manuell bestimmen
// ------------------------------------------------------------

function setupLocateButton() {
  locateButton.addEventListener("click", () => {
    isLocateRequested = true;

    clearPoiEntities();
    hidePoiPanel();

    setStatus("Bestimme Standort... Bitte Handy kurz ruhig halten.");
  });
}


// ------------------------------------------------------------
// GPS-Events von AR.js
// ------------------------------------------------------------

window.addEventListener("gps-camera-update-position", (event) => {
  const latitude = event.detail.position.latitude;
  const longitude = event.detail.position.longitude;
  const accuracy = event.detail.position.accuracy;

  lastGpsPosition = {
    latitude,
    longitude,
    accuracy
  };

  console.log("AR.js GPS Update:", lastGpsPosition);

  if (!isLocateRequested) {
    return;
  }

  usePosition(lastGpsPosition);
});

window.addEventListener("gps-camera-error", (event) => {
  console.error("AR.js GPS Error:", event);

  showLocateButton();

  setStatus(
    "Standort konnte nicht gelesen werden. Bitte GPS und Browser-Berechtigungen prüfen."
  );
});


// ------------------------------------------------------------
// Standort verwenden
// ------------------------------------------------------------

function usePosition(position) {
  isLocateRequested = false;

  userPosition = {
    latitude: position.latitude,
    longitude: position.longitude,
    accuracy: position.accuracy
  };

  clearPoiEntities();
  hidePoiPanel();

  const accuracyText = userPosition.accuracy
    ? `<br>Genauigkeit: ca. ${Math.round(userPosition.accuracy)} m`
    : "";

  setStatus(
    `Standort bestimmt: ${userPosition.latitude.toFixed(5)}, ${userPosition.longitude.toFixed(5)}` +
      accuracyText +
      `<br>Suche POIs im Umkreis von ${MAX_DISTANCE_METERS} m...`
  );

  renderNearbyPois();
}


// ------------------------------------------------------------
// Alte POIs entfernen
// ------------------------------------------------------------

function clearPoiEntities() {
  const oldPois = document.querySelectorAll(".poi-entity");

  oldPois.forEach((entity) => {
    entity.remove();
  });
}


// ------------------------------------------------------------
// POIs filtern und anzeigen
// ------------------------------------------------------------

function renderNearbyPois() {
  if (!userPosition) {
    setStatus("Noch kein Standort verfügbar. Tippe auf „Standort bestimmen“.");
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

      const bearing = bearingToPoi(
        userPosition.latitude,
        userPosition.longitude,
        poi.latitude,
        poi.longitude
      );

      console.log(
        `POI: ${poi.name}`,
        {
          distance: Math.round(distance),
          bearing: Math.round(bearing),
          latitude: poi.latitude,
          longitude: poi.longitude
        }
      );

      return {
        ...poi,
        distance: Math.round(distance),
        bearing: Math.round(bearing)
      };
    })
    .filter((poi) => poi.distance <= MAX_DISTANCE_METERS)
    .sort((a, b) => a.distance - b.distance);

  if (nearbyPois.length === 0) {
    setStatus(
      `Standort bestimmt, aber keine POIs im Umkreis von ${MAX_DISTANCE_METERS} m gefunden.`
    );
    return;
  }

  nearbyPois.forEach((poi) => {
    const entity = createPoiEntity(poi);
    scene.appendChild(entity);
  });

  setStatus(
    `${nearbyPois.length} POI(s) gefunden. Tippe erneut auf „Standort bestimmen“, um zu aktualisieren.`
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

  wrapper.setAttribute("data-poi-id", poi.id);

  wrapper.classList.add("poi-entity");
  wrapper.classList.add("clickable");

  // Wichtig:
  // Keine wrapper.setAttribute("scale", "...").
  // Wir setzen stattdessen echte Größen auf Kugel/Text/Hintergrund.

  // Gelber POI-Punkt
  const marker = document.createElement("a-sphere");
  marker.setAttribute("radius", String(MARKER_RADIUS));
  marker.setAttribute("color", "#ffcc00");
  marker.setAttribute("position", "0 0 0");

  // Gruppe für Text + Hintergrund
  const labelGroup = document.createElement("a-entity");
  labelGroup.setAttribute("position", `0 ${LABEL_HEIGHT_ABOVE_MARKER} 0`);
  labelGroup.setAttribute("look-at", "[gps-camera]");

  // Hintergrund hinter dem Namen
  const labelBackground = document.createElement("a-plane");
  labelBackground.setAttribute("width", String(LABEL_BACKGROUND_WIDTH));
  labelBackground.setAttribute("height", String(LABEL_BACKGROUND_HEIGHT));
  labelBackground.setAttribute("color", "#000000");
  labelBackground.setAttribute("opacity", "0.85");
  labelBackground.setAttribute("side", "double");
  labelBackground.setAttribute("position", "0 0 -0.2");

  // Name aus pois.json
  const label = document.createElement("a-text");
  label.setAttribute("value", poi.name || "POI");
  label.setAttribute("align", "center");
  label.setAttribute("anchor", "center");
  label.setAttribute("baseline", "center");
  label.setAttribute("color", "#ffffff");
  label.setAttribute("width", String(LABEL_TEXT_WIDTH));
  label.setAttribute("side", "double");
  label.setAttribute("position", "0 0 0.2");

  labelGroup.appendChild(labelBackground);
  labelGroup.appendChild(label);

  wrapper.appendChild(marker);
  wrapper.appendChild(labelGroup);

  wrapper.addEventListener("click", () => {
    showPoiPanel(poi);
  });

  console.log("POI erstellt:", {
    name: poi.name,
    distance: poi.distance,
    markerRadius: MARKER_RADIUS,
    labelTextWidth: LABEL_TEXT_WIDTH
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
  poiDescription.textContent =
    poi.description || "Keine Beschreibung hinterlegt.";
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

function bearingToPoi(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const toDeg = (value) => (value * 180) / Math.PI;

  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);
  const deltaLonRad = toRad(lon2 - lon1);

  const y = Math.sin(deltaLonRad) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLonRad);

  const bearingRad = Math.atan2(y, x);

  return (toDeg(bearingRad) + 360) % 360;
}
