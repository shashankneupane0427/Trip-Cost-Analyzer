// BikeTripAnalyzer.jsx
// Setup:
//   npm create vite@latest bike-trip -- --template react
//   cd bike-trip && npm install leaflet react-leaflet
// index.html <head>:
//   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";

// ── Fix Leaflet default icon ──────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ── Custom SVG markers ────────────────────────────────────────────────────────
const makeMarker = (color, letter) =>
  L.divIcon({
    html: `<svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="${color}"/>
      <circle cx="16" cy="16" r="8" fill="white" fill-opacity="0.25"/>
      <text x="16" y="21" text-anchor="middle" fill="white" font-size="11" font-weight="700" font-family="system-ui,sans-serif">${letter}</text>
    </svg>`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    className: "",
  });

const startMarker = makeMarker("#2563EB", "A");
const endMarker   = makeMarker("#DC2626", "B");
const myLocMarker = makeMarker("#059669", "me");

// ── Auto-fit map bounds ───────────────────────────────────────────────────────
function FitBounds({ from, to }) {
  const map = useMap();
  useEffect(() => {
    if (from && to)   map.fitBounds([from, to], { padding: [60, 60] });
    else if (from)    map.setView(from, 15);
  }, [from, to, map]);
  return null;
}

// ── Geocode (Nominatim) ───────────────────────────────────────────────────────
async function geocode(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&accept-language=en`
  );
  return res.json();
}

// ── Reverse geocode ───────────────────────────────────────────────────────────
async function reverseGeocode(lat, lon) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=en`
  );
  return res.json();
}

// ── OSRM route ────────────────────────────────────────────────────────────────
async function fetchRoute(from, to) {
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
  );
  return res.json();
}

// ── Autocomplete field ────────────────────────────────────────────────────────
function LocationField({ label, accent, value, onChange, onSelect, action, actionLabel, actionLoading }) {
  const [suggs, setSuggs]     = useState([]);
  const [open, setOpen]       = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef(null);
  const wrap  = useRef(null);

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    clearTimeout(timer.current);
    if (v.length < 3) { setSuggs([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const r = await geocode(v);
      setSuggs(r || []);
      setOpen((r || []).length > 0);
    }, 350);
  };

  useEffect(() => {
    const fn = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <label style={css.label}>{label}</label>
      <div style={{
        ...css.fieldWrap,
        borderColor: focused ? accent : "#d1d5db",
        boxShadow: focused ? `0 0 0 3px ${accent}20` : "0 1px 3px rgba(0,0,0,0.06)",
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent, flexShrink: 0, marginLeft: 2 }} />
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => { setFocused(true); suggs.length > 0 && setOpen(true); }}
          onBlur={() => setFocused(false)}
          placeholder={`Search location…`}
          style={css.fieldInput}
          autoComplete="off"
          spellCheck="false"
        />
        {action && (
          <button
            onClick={action}
            disabled={actionLoading}
            title={actionLabel}
            style={{
              ...css.locBtn,
              background: actionLoading ? "#eff6ff" : "#f0fdf4",
              color: actionLoading ? "#2563eb" : "#059669",
              borderColor: actionLoading ? "#bfdbfe" : "#bbf7d0",
            }}
          >
            {actionLoading
              ? <span style={{ display: "inline-block", animation: "spin 0.8s linear infinite", fontSize: 13 }}>&#8635;</span>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
            }
          </button>
        )}
        {value && (
          <button onClick={() => { onChange(""); setSuggs([]); setOpen(false); }} style={css.clearBtn}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      {open && (
        <div style={css.dropdown}>
          {suggs.map((s, i) => (
            <div key={i}
              onMouseDown={() => { onChange(s.display_name); onSelect([parseFloat(s.lat), parseFloat(s.lon)]); setOpen(false); setSuggs([]); }}
              style={css.dropItem}
              onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
              onMouseLeave={e => e.currentTarget.style.background = "#fff"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span style={{ fontSize: 12, color: "#374151", lineHeight: 1.4 }}>{s.display_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Number Stepper ────────────────────────────────────────────────────────────
function Stepper({ label, value, onChange, unit, min, max, step }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={css.label}>{label}</label>
      <div style={{
        ...css.stepWrap,
        borderColor: focused ? "#2563eb" : "#d1d5db",
        boxShadow: focused ? "0 0 0 3px rgba(37,99,235,0.12)" : "0 1px 3px rgba(0,0,0,0.06)",
      }}>
        <button
          onClick={() => onChange(Math.max(min || 1, value - (step || 1)))}
          style={css.stepBtn}
          onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
          onMouseLeave={e => e.currentTarget.style.background = "#f8fafc"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <input
            type="number"
            value={value}
            min={min} max={max} step={step || 1}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={css.stepInput}
          />
          <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>{unit}</span>
        </div>
        <button
          onClick={() => onChange(Math.min(max || 999, value + (step || 1)))}
          style={css.stepBtn}
          onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
          onMouseLeave={e => e.currentTarget.style.background = "#f8fafc"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, delay }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: "14px 16px",
      borderTop: `3px solid ${accent}`,
      animation: `slideUp 0.4s cubic-bezier(0.22,1,0.36,1) ${delay}s both`,
    }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.7px", color: "#9ca3af", marginBottom: 5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: "#111827", fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Location permission banner ────────────────────────────────────────────────
function LocationBanner({ status, onRequest }) {
  if (status === "granted" || status === "checking") return null;
  return (
    <div style={{
      background: status === "denied" ? "#fef2f2" : "#eff6ff",
      border: `1px solid ${status === "denied" ? "#fecaca" : "#bfdbfe"}`,
      borderRadius: 10,
      padding: "12px 14px",
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={status === "denied" ? "#dc2626" : "#2563eb"} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: status === "denied" ? "#dc2626" : "#1d4ed8", marginBottom: 2 }}>
          {status === "denied" ? "Location access denied" : "Use your current location"}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>
          {status === "denied"
            ? "Please enable location in your browser settings to auto-fill your position."
            : "Allow location access to automatically fill your starting point."}
        </div>
        {status !== "denied" && (
          <button onClick={onRequest} style={{ marginTop: 8, padding: "5px 12px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Allow location
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function BikeTripAnalyzer() {
  const [mileage, setMileage]       = useState(45);
  const [petrol, setPetrol]         = useState(175);
  const [fromText, setFromText]     = useState("");
  const [toText, setToText]         = useState("");
  const [fromCoord, setFromCoord]   = useState(null);
  const [toCoord, setToCoord]       = useState(null);
  const [myCoord, setMyCoord]       = useState(null);
  const [routeGeo, setRouteGeo]     = useState(null);
  const [result, setResult]         = useState(null);
  const [status, setStatus]         = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [locStatus, setLocStatus]   = useState("unknown"); // unknown | checking | granted | denied
  const [locLoading, setLocLoading] = useState(false);
  const [routeKey, setRouteKey]     = useState(0);

  // ── Request geolocation ────────────────────────────────────────────────────
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocStatus("denied"); return; }
    setLocLoading(true);
    setLocStatus("checking");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setMyCoord([lat, lon]);
        setLocStatus("granted");
        setLocLoading(false);
        try {
          const rev = await reverseGeocode(lat, lon);
          const name = rev?.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
          setFromText(name);
          setFromCoord([lat, lon]);
        } catch {
          setFromText(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
          setFromCoord([lat, lon]);
        }
      },
      (err) => {
        setLocStatus(err.code === 1 ? "denied" : "unknown");
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Auto-request on mount
  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: "geolocation" }).then((r) => {
        if (r.state === "granted") requestLocation();
        else if (r.state === "denied") setLocStatus("denied");
        else setLocStatus("unknown");
      });
    }
  }, [requestLocation]);

  const canCalc = fromText.trim() && toText.trim() && mileage > 0 && petrol > 0;

  const handleCalc = useCallback(async () => {
    setError(""); setResult(null); setRouteGeo(null);
    if (!canCalc) { setError("Please fill in all fields."); return; }
    setLoading(true);

    try {
      let fC = fromCoord, tC = toCoord;
      setStatus("Finding locations…");

      if (!fC) {
        const r = await geocode(fromText);
        if (!r?.length) { setError(`Could not find "${fromText}". Try adding a city or country.`); setLoading(false); return; }
        fC = [parseFloat(r[0].lat), parseFloat(r[0].lon)];
        setFromCoord(fC);
      }
      if (!tC) {
        const r = await geocode(toText);
        if (!r?.length) { setError(`Could not find "${toText}". Try adding a city or country.`); setLoading(false); return; }
        tC = [parseFloat(r[0].lat), parseFloat(r[0].lon)];
        setToCoord(tC);
      }

      setStatus("Drawing route…");
      const data = await fetchRoute(fC, tC);
      if (!data?.routes?.length) { setError("No drivable route found between these points."); setLoading(false); return; }

      const route = data.routes[0];
      const distKm     = route.distance / 1000;
      const durationMin = Math.round(route.duration / 60);
      const fuelLtr    = distKm / mileage;
      const cost       = fuelLtr * petrol;

      setRouteGeo(route.geometry);
      setRouteKey(k => k + 1);
      setResult({ distKm, durationMin, fuelLtr, cost });
      setStatus("");
    } catch {
      setError("Network error. Please check your internet connection.");
    }
    setLoading(false);
  }, [fromText, toText, fromCoord, toCoord, mileage, petrol, canCalc]);

  const handleReset = () => {
    setFromText(""); setToText("");
    setFromCoord(null); setToCoord(null);
    setRouteGeo(null); setResult(null);
    setError(""); setStatus("");
    if (myCoord) {
      reverseGeocode(myCoord[0], myCoord[1]).then(r => {
        setFromText(r?.display_name || "");
        setFromCoord(myCoord);
      }).catch(() => {});
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; overflow: hidden; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .leaflet-tile-pane { filter: none !important; }
        .leaflet-control-zoom a {
          background: #fff !important; color: #374151 !important;
          border-color: #e5e7eb !important; font-weight: 600 !important;
        }
        .leaflet-control-zoom a:hover { background: #f9fafb !important; }
        .leaflet-popup-content-wrapper {
          border-radius: 10px !important; box-shadow: 0 4px 16px rgba(0,0,0,0.12) !important;
          font-family: 'DM Sans', sans-serif !important;
        }
        .leaflet-popup-content { font-size: 13px !important; color: #374151 !important; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", background: "#f8fafc", fontFamily: "'DM Sans', sans-serif", color: "#111827" }}>

        {/* ─── SIDEBAR ─────────────────────────────────────────────── */}
        <aside style={{
          width: 360,
          minWidth: 340,
          background: "#fff",
          borderRight: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "2px 0 16px rgba(0,0,0,0.04)",
        }}>

          {/* Header */}
          <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #1d4ed8, #2563eb)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5M14 17H9"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
              </div>
              <div>
                <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.4px" }}>TripFuel</h1>
                <p style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400 }}>Bike trip cost calculator</p>
              </div>
            </div>
          </div>

          {/* Scroll body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px 32px", display: "flex", flexDirection: "column", gap: 22 }}>

            {/* Location Banner */}
            <LocationBanner status={locStatus} onRequest={requestLocation} />

            {/* Bike settings */}
            <section>
              <div style={css.sectionTitle}>Bike settings</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Stepper label="Your bike mileage" value={mileage} onChange={setMileage} unit="km / litre" min={1} max={200} step={1} />
                <Stepper label="Petrol price" value={petrol} onChange={setPetrol} unit="Rs / litre" min={1} max={500} step={5} />
              </div>
            </section>

            <div style={css.divider} />

            {/* Route */}
            <section>
              <div style={css.sectionTitle}>Route</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <LocationField
                  label="From — starting point"
                  accent="#2563eb"
                  value={fromText}
                  onChange={v => { setFromText(v); setFromCoord(null); }}
                  onSelect={c => setFromCoord(c)}
                  action={requestLocation}
                  actionLabel="Use my current location"
                  actionLoading={locLoading}
                />

                {/* Arrow connector */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px" }}>
                  <div style={{ flex: 1, height: 1, background: "#f3f4f6" }} />
                  <div style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid #e5e7eb", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                  </div>
                  <div style={{ flex: 1, height: 1, background: "#f3f4f6" }} />
                </div>

                <LocationField
                  label="To — destination"
                  accent="#dc2626"
                  value={toText}
                  onChange={v => { setToText(v); setToCoord(null); }}
                  onSelect={c => setToCoord(c)}
                />
              </div>
            </section>

            {/* Calculate button */}
            <button
              onClick={handleCalc}
              disabled={loading || !canCalc}
              style={{
                padding: "14px 20px",
                background: canCalc && !loading ? "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)" : "#f3f4f6",
                color: canCalc && !loading ? "#fff" : "#9ca3af",
                border: "none",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'Syne', sans-serif",
                cursor: (!canCalc || loading) ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                letterSpacing: "0.1px",
                boxShadow: canCalc && !loading ? "0 4px 14px rgba(37,99,235,0.3)" : "none",
              }}
            >
              {loading ? (
                <><span style={{ display: "inline-block", animation: "spin 0.8s linear infinite" }}>&#8635;</span> {status || "Calculating…"}</>
              ) : (
                <>
                  Calculate trip cost
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </>
              )}
            </button>

            {/* Error */}
            {error && (
              <div style={{ padding: "11px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, fontSize: 12, color: "#dc2626", display: "flex", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}

            {/* Results */}
            {result && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeIn 0.3s ease" }}>
                <div style={css.sectionTitle}>Trip summary</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <StatCard label="Distance"    value={`${result.distKm.toFixed(1)} km`}           accent="#2563eb" delay={0}    />
                  <StatCard label="Est. time"   value={`${result.durationMin} min`}                  accent="#7c3aed" delay={0.06} />
                  <StatCard label="Fuel needed" value={`${result.fuelLtr.toFixed(2)} L`}            accent="#d97706" delay={0.12} />
                  <StatCard label="Rate"        value={`Rs ${petrol}`} sub="per litre"               accent="#059669" delay={0.18} />
                </div>

                {/* Total */}
                <div style={{
                  background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
                  border: "1px solid #bfdbfe",
                  borderRadius: 14,
                  padding: "20px 22px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  animation: `slideUp 0.4s cubic-bezier(0.22,1,0.36,1) 0.24s both`,
                }}>
                  <div>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.7px", color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>Total trip cost</div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 36, fontWeight: 800, color: "#1d4ed8", lineHeight: 1 }}>
                      Rs {Math.ceil(result.cost).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 5 }}>
                      {result.fuelLtr.toFixed(2)} L &times; Rs {petrol} / L
                    </div>
                  </div>
                  <div style={{ width: 52, height: 52, background: "#dbeafe", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>
                  </div>
                </div>

                <button onClick={handleReset}
                  style={{ padding: "11px", background: "transparent", border: "1px solid #e5e7eb", color: "#6b7280", borderRadius: 10, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 500, transition: "all 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f9fafb"; e.currentTarget.style.color = "#374151"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6b7280"; }}
                >
                  Plan another trip
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ─── MAP ─────────────────────────────────────────────────── */}
        <main style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <MapContainer center={[27.7172, 85.3240]} zoom={12} style={{ width: "100%", height: "100%" }} zoomControl>
            {/* Standard OpenStreetMap — no dark filter */}
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={19}
            />
            {myCoord && !fromCoord && (
              <Marker position={myCoord} icon={myLocMarker}>
                <Popup>Your current location</Popup>
              </Marker>
            )}
            {fromCoord && (
              <Marker position={fromCoord} icon={startMarker}>
                <Popup><b>Start</b><br />{fromText.split(",").slice(0, 2).join(",")}</Popup>
              </Marker>
            )}
            {toCoord && (
              <Marker position={toCoord} icon={endMarker}>
                <Popup><b>Destination</b><br />{toText.split(",").slice(0, 2).join(",")}</Popup>
              </Marker>
            )}
            {routeGeo && (
              <GeoJSON
                key={routeKey}
                data={routeGeo}
                style={{ color: "#2563eb", weight: 5, opacity: 0.85, lineCap: "round", lineJoin: "round" }}
              />
            )}
            <FitBounds from={fromCoord} to={toCoord} />
          </MapContainer>

          {/* Empty state */}
          {!fromCoord && !toCoord && (
            <div style={{
              position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)",
              background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)",
              border: "1px solid #e5e7eb", borderRadius: 50,
              padding: "11px 22px", display: "flex", alignItems: "center", gap: 10,
              zIndex: 1000, pointerEvents: "none", whiteSpace: "nowrap",
              boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span style={{ fontSize: 13, color: "#6b7280" }}>Enter locations to see your route</span>
            </div>
          )}

          {/* Route result chip */}
          {result && (
            <div style={{
              position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
              background: "rgba(255,255,255,0.97)", backdropFilter: "blur(10px)",
              border: "1px solid #e5e7eb", borderRadius: 50,
              padding: "10px 22px", display: "flex", alignItems: "center", gap: 14,
              zIndex: 1000, pointerEvents: "none",
              boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
              animation: "slideUp 0.35s ease",
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#2563eb", fontFamily: "'Syne', sans-serif" }}>{result.distKm.toFixed(1)} km</span>
              <div style={{ width: 1, height: 16, background: "#e5e7eb" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#059669", fontFamily: "'Syne', sans-serif" }}>Rs {Math.ceil(result.cost).toLocaleString()}</span>
              <div style={{ width: 1, height: 16, background: "#e5e7eb" }} />
              <span style={{ fontSize: 12, color: "#6b7280" }}>{result.durationMin} min</span>
            </div>
          )}

          {/* My location pulse (when located) */}
          {myCoord && locStatus === "granted" && !result && (
            <div style={{
              position: "absolute", bottom: 24, right: 16,
              background: "#fff", border: "1px solid #bbf7d0",
              borderRadius: 10, padding: "8px 14px",
              display: "flex", alignItems: "center", gap: 8,
              zIndex: 1000, boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
              fontSize: 12, color: "#059669", fontWeight: 500,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", display: "inline-block", boxShadow: "0 0 0 3px rgba(5,150,105,0.2)" }} />
              Location detected
            </div>
          )}
        </main>
      </div>
    </>
  );
}

// ── Shared CSS tokens ─────────────────────────────────────────────────────────
const css = {
  label: {
    fontSize: 12,
    fontWeight: 500,
    color: "#6b7280",
    marginBottom: 6,
    display: "block",
    letterSpacing: "0.1px",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    color: "#9ca3af",
    marginBottom: 12,
  },
  divider: {
    height: 1,
    background: "#f3f4f6",
  },
  fieldWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#fff",
    border: "1px solid #d1d5db",
    borderRadius: 10,
    padding: "10px 12px",
    transition: "all 0.18s",
  },
  fieldInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#111827",
    fontSize: 13,
    fontFamily: "inherit",
    padding: 0,
    minWidth: 0,
  },
  locBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    border: "1px solid",
    borderRadius: 7,
    cursor: "pointer",
    flexShrink: 0,
    transition: "all 0.15s",
  },
  clearBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    color: "#9ca3af",
    cursor: "pointer",
    padding: 2,
    flexShrink: 0,
  },
  dropdown: {
    position: "absolute",
    top: "calc(100% + 5px)",
    left: 0,
    right: 0,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    zIndex: 9999,
    maxHeight: 200,
    overflowY: "auto",
    boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
  },
  dropItem: {
    padding: "9px 12px",
    cursor: "pointer",
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    background: "#fff",
    borderBottom: "1px solid #f9fafb",
    transition: "background 0.1s",
  },
  stepWrap: {
    display: "flex",
    alignItems: "center",
    background: "#fff",
    border: "1px solid #d1d5db",
    borderRadius: 10,
    overflow: "hidden",
    transition: "all 0.18s",
  },
  stepBtn: {
    padding: "12px 14px",
    background: "#f8fafc",
    border: "none",
    color: "#6b7280",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.12s",
  },
  stepInput: {
    width: 56,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#1d4ed8",
    fontSize: 18,
    fontWeight: 700,
    fontFamily: "'Syne', sans-serif",
    textAlign: "center",
    padding: "8px 0",
  },
};