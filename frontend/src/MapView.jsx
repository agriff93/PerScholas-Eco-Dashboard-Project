import { useEffect, useRef, useState } from 'react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const API_BASE     = 'http://localhost:5000';

// Check if the token is valid (not undefined, empty, or a generic placeholder)
const hasValidToken = MAPBOX_TOKEN && MAPBOX_TOKEN.trim() !== '' && !MAPBOX_TOKEN.includes('placeholder') && !MAPBOX_TOKEN.includes('YOUR_MAPBOX_TOKEN');
const PARCEL_MIN_ZOOM = 13;

const COMPLIANCE_REGIONS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-78.5,34.0],[-76.5,34.0],[-76.5,36.0],[-78.5,36.0],[-78.5,34.0]]] },
      properties: { name: 'Coastal Plain Buffer Zone', severity: 'high', color: '#e63946', agency: 'NCDEQ / Army Corps', compliance_rules: ['NCDEQ 15A NCAC 02B .0233 — 50ft riparian buffer required','Wetland disturbance permit needed under §404','CAMA permit required within 75ft of coastal waters'] }
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-80.5,35.5],[-79.0,35.5],[-79.0,36.5],[-80.5,36.5],[-80.5,35.5]]] },
      properties: { name: 'Piedmont Triad — Water Supply Watershed', severity: 'medium', color: '#f4a261', agency: 'NCDEQ Division of Water Resources', compliance_rules: ['WS-II/WS-III watershed classification restrictions','Impervious surface limits: 12% low-density, 30% high-density','Stormwater management plan required > 1 acre disturbed'] }
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-84.0,35.0],[-81.5,35.0],[-81.5,36.6],[-84.0,36.6],[-84.0,35.0]]] },
      properties: { name: 'Mountain Headwaters — Trout Buffer', severity: 'high', color: '#2a9d8f', agency: 'NCDEQ / Wildlife Resources Commission', compliance_rules: ['ORW / HQW designation — no new NPDES discharges','25ft undisturbed buffer for trout waters','Sedimentation & Erosion Control Act — land-disturbing > 1 acre'] }
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-79.8,34.8],[-78.5,34.8],[-78.5,35.5],[-79.8,35.5],[-79.8,34.8]]] },
      properties: { name: 'Sandhills — Longleaf Pine Habitat', severity: 'critical', color: '#6d28d9', agency: 'USFWS / NC Wildlife Resources Commission', compliance_rules: ['Red-cockaded Woodpecker ESA Section 7 consultation required','Longleaf pine ecosystem mitigation banking may apply','USFWS coordination needed for any clearing > 5 acres'] }
    },
  ]
};

const SEV_COLORS = { critical: '#6d28d9', high: '#e63946', medium: '#f4a261', low: '#2a9d8f' };

export default function MapView({ propertyQuery }) {
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const fetchTimerRef   = useRef(null);

  const [status, setStatus]               = useState(hasValidToken ? 'Initializing map…' : 'Mapbox token missing');
  const [parcelCount, setParcelCount]     = useState(0);
  const [showZoomHint, setShowZoomHint]   = useState(false);
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [selectedZone, setSelectedZone]   = useState(null);
  const [activeFilter, setActiveFilter]   = useState('all');
  const [complianceData, setComplianceData] = useState(COMPLIANCE_REGIONS);

  useEffect(() => {
    if (!hasValidToken) {
      setStatus('Mapbox token missing');
      return;
    }
    if (mapRef.current || !window.mapboxgl) return;

    window.mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new window.mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-79.5, 35.5],
      zoom: 6.5,
    });

    map.addControl(new window.mapboxgl.NavigationControl(), 'bottom-right');
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('compliance', { type: 'geojson', data: COMPLIANCE_REGIONS });

      map.addLayer({ id: 'compliance-fill', type: 'fill', source: 'compliance',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 } });

      map.addLayer({ id: 'compliance-outline', type: 'line', source: 'compliance',
        paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-dasharray': [3, 2] } });

      map.addLayer({ id: 'compliance-hover', type: 'fill', source: 'compliance',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.45 },
        filter: ['==', 'name', ''] });

      map.addLayer({ id: 'compliance-labels', type: 'symbol', source: 'compliance',
        layout: { 'text-field': ['get', 'name'], 'text-size': 10,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-anchor': 'center', 'text-max-width': 10 },
        paint: { 'text-color': '#e6edf3', 'text-halo-color': '#0d1117', 'text-halo-width': 1.5 } });

      // ── Parcel layers ──
      map.addSource('parcels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'PARCEL_ID',
      });

      map.addLayer({ id: 'parcels-fill', type: 'fill', source: 'parcels',
        paint: {
          'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#00e5a0', '#0095ff'],
          'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.5, 0.15],
        }
      }, 'compliance-fill');

      map.addLayer({ id: 'parcels-outline', type: 'line', source: 'parcels',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#00e5a0', 'rgba(0,149,255,0.6)'],
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, 0.7],
        }
      });

      setStatus('Ready — zoom in to load parcels');

      map.on('mousemove', 'compliance-fill', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        map.setFilter('compliance-hover', ['==', 'name', e.features[0].properties.name]);
      });
      map.on('mouseleave', 'compliance-fill', () => {
        map.getCanvas().style.cursor = '';
        map.setFilter('compliance-hover', ['==', 'name', '']);
      });

      map.on('click', 'compliance-fill', (e) => {
        const p = e.features[0].properties;
        const rules = typeof p.compliance_rules === 'string'
          ? JSON.parse(p.compliance_rules) : p.compliance_rules;
        setSelectedZone({ ...p, compliance_rules: rules });
        setSelectedParcel(null);
      });

      map.on('mouseenter', 'parcels-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'parcels-fill', () => { map.getCanvas().style.cursor = ''; });

      let lastSelectedId = null;
      map.on('click', 'parcels-fill', (e) => {
        e.stopPropagation();
        const props = e.features[0].properties;
        const fid   = props.PARCEL_ID;
        if (lastSelectedId !== null) {
          map.setFeatureState({ source: 'parcels', id: lastSelectedId }, { selected: false });
        }
        lastSelectedId = fid;
        map.setFeatureState({ source: 'parcels', id: fid }, { selected: true });
        setSelectedParcel(props);
        setSelectedZone(null);
      });

      map.on('click', (e) => {
        const pf = map.queryRenderedFeatures(e.point, { layers: ['parcels-fill', 'compliance-fill'] });
        if (pf.length === 0) {
          if (lastSelectedId !== null) {
            map.setFeatureState({ source: 'parcels', id: lastSelectedId }, { selected: false });
            lastSelectedId = null;
          }
          setSelectedParcel(null);
          setSelectedZone(null);
        }
      });

      map.on('zoom', () => {
        setShowZoomHint(map.getZoom() < PARCEL_MIN_ZOOM);
      });

      map.on('moveend', () => {
        clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = setTimeout(() => fetchParcels(map, setStatus, setParcelCount, setShowZoomHint), 400);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!propertyQuery) return;

    /*
     * 📘 STUDENT EDUCATION NOTE — WHAT IS GEOCODING?
     * Geocoding is the process of converting human-readable address descriptions 
     * (like "1458 Green Valley Rd") into geographic coordinates (longitude and latitude).
     * 
     * 🗺️ WHY COORDINATES ARE NEEDED:
     * Maps use geographic coordinates to know exactly where to render markers or fly the camera. 
     * Additionally, in professional environmental setups, coordinates are required by spatial 
     * databases (like PostgreSQL with PostGIS extensions) to check if a parcel overlaps with any 
     * ecologically restricted zones (wetlands, flood hazards, or protected habitats).
     * 
     * 🔑 WHAT VITE_MAPBOX_TOKEN DOES:
     * Mapbox is a third-party mapping platform. It handles rendering vector tiles and geocoding addresses.
     * The Mapbox API is protected, so you must pass a valid token ('VITE_MAPBOX_TOKEN') to authenticate 
     * your frontend application. This is read securely from your local environment configuration (.env).
     * 
     * 🚀 FUTURE AWS INTEGRATION OPPORTUNITY:
     * In a complete production setup, the frontend would not fetch directly from Mapbox. Instead, 
     * the search request would be sent to an AWS API Gateway endpoint, which triggers an AWS Lambda 
     * serverless function. This Lambda function would call the spatial database (RDS PostgreSQL/PostGIS 
     * or DynamoDB) to run environmental risk check logic and return both coordinates and real risk statistics.
     */

    if (!hasValidToken) {
      setStatus('Mapbox token missing');
      return;
    }

    if (!mapRef.current) return;

    setStatus('Searching address...');

    // Convert search address to URL-safe characters for the Mapbox API request
    const encoded = encodeURIComponent(`${propertyQuery}, North Carolina`);
    
    fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1`)
      .then(r => {
        if (!r.ok) {
          throw new Error(`Geocoding request failed with status: ${r.status}`);
        }
        return r.json();
      })
      .then(data => {
        const feature = data.features?.[0];
        if (feature) {
          // Found matching coordinates, move map camera there
          mapRef.current.flyTo({ center: feature.center, zoom: 15, duration: 1800 });
          setStatus(`Found: ${feature.place_name}`);
        } else {
          // Request succeeded, but Mapbox could not find any matches for the query
          setStatus('No address found');
        }
      })
      .catch(err => {
        console.error('[MapView] geocoding error:', err);
        setStatus('Geocoding failed');
      });
  }, [propertyQuery]);

  const handleFilter = (sev) => {
    setActiveFilter(sev);
    if (!mapRef.current) return;
    const filtered = sev === 'all' ? COMPLIANCE_REGIONS : {
      ...COMPLIANCE_REGIONS,
      features: COMPLIANCE_REGIONS.features.filter(f => f.properties.severity === sev)
    };
    setComplianceData(filtered);
    mapRef.current.getSource('compliance')?.setData(filtered);
  };

  if (!hasValidToken) {
    return (
      <div className="mapview-wrapper">
        {/* Filter bar (disabled and styled appropriately for offline state) */}
        <div className="mapview-toolbar">
          <span className="mapview-toolbar-label">Compliance Filter:</span>
          {['all','critical','high','medium'].map(sev => (
            <button
              key={sev}
              className={`mapview-filter-btn sev-${sev}`}
              disabled
              style={{ cursor: 'not-allowed', opacity: 0.5 }}
            >
              {sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          ))}
          <span className="mapview-status">{status}</span>
        </div>

        {/* Custom premium placeholder banner for missing Mapbox access token */}
        <div className="mapview-placeholder">
          <div className="mapview-placeholder-icon">🗺️</div>
          <div className="mapview-placeholder-title">Interactive Map Offline</div>
          <p className="mapview-placeholder-text">
            To enable the real-time ecological compliance map and property geocoding, please configure a valid Mapbox public access token.
          </p>
          <div className="mapview-placeholder-code">
            VITE_MAPBOX_TOKEN=your_mapbox_token_here
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mapview-wrapper">

      {/* Filter bar */}
      <div className="mapview-toolbar">
        <span className="mapview-toolbar-label">Compliance Filter:</span>
        {['all','critical','high','medium'].map(sev => (
          <button
            key={sev}
            className={`mapview-filter-btn ${activeFilter === sev ? 'active' : ''} sev-${sev}`}
            onClick={() => handleFilter(sev)}
          >
            {sev.charAt(0).toUpperCase() + sev.slice(1)}
          </button>
        ))}
        <span className="mapview-status">{status}</span>
        {parcelCount > 0 && <span className="mapview-count">{parcelCount} parcels</span>}
      </div>

      {/* Map container */}
      <div className="mapview-container" ref={mapContainerRef} />

      {/* Zoom hint overlay */}
      {showZoomHint && (
        <div className="mapview-zoom-hint">🔍 Zoom in to level 13+ to load parcels</div>
      )}

      {/* Info panel — selected parcel */}
      {selectedParcel && (
        <div className="mapview-info-panel">
          <div className="mapview-info-label">📦 Selected Parcel</div>
          <div className="mapview-info-title">{selectedParcel.SITE_ADDRESS || 'No address on record'}</div>
          <div className="mapview-data-grid">
            <div className="mapview-data-cell"><div className="key">Owner</div><div className="val">{selectedParcel.OWNER || '—'}</div></div>
            <div className="mapview-data-cell"><div className="key">County</div><div className="val">{selectedParcel.COUNTY_NAME || '—'}</div></div>
            <div className="mapview-data-cell"><div className="key">Acres</div><div className="val">{selectedParcel.DEED_ACRES ? `${Number(selectedParcel.DEED_ACRES).toFixed(2)} ac` : '—'}</div></div>
            <div className="mapview-data-cell"><div className="key">Land Value</div><div className="val">{selectedParcel.LAND_VALUE ? `$${Number(selectedParcel.LAND_VALUE).toLocaleString()}` : '—'}</div></div>
            <div className="mapview-data-cell"><div className="key">Zoning</div><div className="val">{selectedParcel.ZONING || '—'}</div></div>
            <div className="mapview-data-cell"><div className="key">PIN</div><div className="val">{selectedParcel.PIN || selectedParcel.PARCEL_ID || '—'}</div></div>
          </div>
          <button className="mapview-close-btn" onClick={() => setSelectedParcel(null)}>✕ Deselect</button>
        </div>
      )}

      {/* Info panel — selected compliance zone */}
      {selectedZone && (
        <div className="mapview-info-panel">
          <div className="mapview-info-label">⚠ Compliance Zone</div>
          <div className="mapview-info-title">{selectedZone.name}</div>
          <span className="mapview-sev-pill" style={{ background: SEV_COLORS[selectedZone.severity] + '22', color: SEV_COLORS[selectedZone.severity], border: `1px solid ${SEV_COLORS[selectedZone.severity]}` }}>
            {selectedZone.severity?.toUpperCase()}
          </span>
          <div className="mapview-agency">{selectedZone.agency}</div>
          <div className="mapview-rules-label">Applicable Regulations</div>
          {selectedZone.compliance_rules?.map((rule, i) => (
            <div key={i} className="mapview-rule-item">{rule}</div>
          ))}
          <button className="mapview-close-btn" onClick={() => setSelectedZone(null)}>✕ Close</button>
        </div>
      )}
    </div>
  );
}

async function fetchParcels(map, setStatus, setParcelCount, setShowZoomHint) {
  if (map.getZoom() < PARCEL_MIN_ZOOM) {
    map.getSource('parcels')?.setData({ type: 'FeatureCollection', features: [] });
    setParcelCount(0);
    setShowZoomHint(true);
    return;
  }

  setShowZoomHint(false);
  setStatus('Loading parcels…');

  const b    = map.getBounds();
  const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;

  try {
    const res  = await fetch(`${API_BASE}/api/parcels?bbox=${bbox}`);
    const text = await res.text();
    const data = JSON.parse(text);

    if (data.error === 'zoom_required') { setStatus('Zoom in further'); return; }
    if (data.error) { setStatus(`Error: ${JSON.stringify(data.error)}`); return; }

    if (data.features) {
      data.features.forEach((f, i) => {
        if (!f.properties.PARCEL_ID) f.properties.PARCEL_ID = `p_${i}`;
      });
      map.getSource('parcels')?.setData(data);
      setParcelCount(data.features.length);
      setStatus(`${data.features.length} parcels loaded`);
    }
  } catch (err) {
    setStatus(`Fetch failed: ${err.message}`);
    console.error('[MapView] parcel fetch error:', err);
  }
}
