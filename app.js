// ------------------------------------------------------------
// Grundeinstellungen
// ------------------------------------------------------------

// POIs werden nur angezeigt, wenn sie innerhalb dieses Radius liegen.
// Für Tests kannst du den Wert z. B. auf 100000 setzen.
const MAX_DISTANCE_METERS = 1500;

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

  setupMotionPermissionButton();
  setupPoiPanel();
  setupLocateButton();

  try {
    pois = await loadPois();
    setStatus("POIs geladen. Tippe auf „Standort bestimmen“.");
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
// Button: Standort manuell bestimmen
// ------------------------------------------------------------

function setupLocateButton() {
  locateButton.addEventListener("click", () => {
    isLocateRequested = true;

    setStatus("Bestimme Standort...");

    // Falls AR.js bereits einen Standort geliefert hat,
    // nutzen wir diesen sofort.
    if (lastGpsPosition) {
      usePosition(lastGpsPosition);
      return;
    }

    // Fallback: Browser-Geolocation aktiv anfragen.
    if (!navigator.geolocation) {
      setStatus("Geolocation wird von diesem Browser nicht unterstützt.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const manualPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };

        usePosition(manualPosition);
      },
      (error) => {
        console.error(error);
        setStatus(
          "Standort konnte nicht bestimmt werden. Bitte Standortfreigabe prüfen."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
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
        setStatus("Bewegungssensoren erlaubt. Tippe auf „Standort bestimmen“.");
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
  const accuracy = event.detail.position.accuracy;

  lastGpsPosition = {
    latitude,
    longitude,
    accuracy
  };

  // Wichtig:
  // Es wird NICHT automatisch neu gerendert.
  // Die App reagiert nur, wenn der Button gedrückt wurde.
  if (!isLocateRequested) {
    return;
  }

  usePosition(lastGpsPosition);
});

window.addEventListener("gps-camera-error", (event) => {
  console.error(event);

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

      return {
        ...poi,
        distance: Math.round(distance)
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

  wrapper.setAttribute("gps-new-entity-place", {
    latitude: poi.latitude,
    longitude: poi.longitude
  });

  wrapper.setAttribute("look-at", "[gps-new-camera]");
  wrapper.setAttribute("scale", "18 18 18");
  wrapper.setAttribute("data-poi-id", poi.id);

  wrapper.classList.add("poi-entity");
  wrapper.classList.add("clickable");

  // Das eigentliche POI-Element
  const marker = document.createElement("a-sphere");
  marker.setAttribute("radius", "0.35");
  marker.setAttribute("color", "#ffcc00");
  marker.setAttribute("position", "0 0.35 0");

  // Hintergrund hinter dem Namen
  const labelBackground = document.createElement("a-plane");
  labelBackground.setAttribute("width", "3.8");
  labelBackground.setAttribute("height", "0.7");
  labelBackground.setAttribute("color", "#000000");
  labelBackground.setAttribute("opacity", "0.65");
  labelBackground.setAttribute("position", "0 1.2 -0.02");

  // Nur der Name aus pois.json über dem POI-Element
  const label = document.createElement("a-text");
  label.setAttribute("value", poi.name);
  label.setAttribute("align", "center");
  label.setAttribute("color", "#ffffff");
  label.setAttribute("width", "6");
  label.setAttribute("position", "0 1.2 0");

  wrapper.appendChild(marker);
  wrapper.appendChild(labelBackground);
  wrapper.appendChild(label);

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
