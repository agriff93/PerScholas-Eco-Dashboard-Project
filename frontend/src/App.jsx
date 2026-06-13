import { useState } from 'react';
import './App.css';

// Point this at your API. Locally it's the Express server on port 3001.
// For the AWS deploy, set VITE_API_URL in a .env file (e.g. your Beanstalk URL).
const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// --- helpers ---------------------------------------------------------------

// "NON_COMPLIANT" -> "Non Compliant"
function prettyStatus(s) {
  if (!s) return 'Unknown';
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Show a clean dash for null / empty / shapefile junk values.
function val(v) {
  return v === null || v === undefined || v === '' || v === 'nan' || v === 'NaT' ? '—' : v;
}

// Map a FEMA flood zone to a risk level + status color for the cards.
function floodInfo(inFlood, zone) {
  if (!inFlood || !zone) return { level: 'Not in mapped flood zone', status: 'good' };
  const z = String(zone).toUpperCase();
  if (z === 'VE' || z === 'V') return { level: `High — ${zone}`, status: 'danger' };
  if (z === 'AE' || z === 'A') return { level: `High — ${zone}`, status: 'danger' };
  if (z === 'AO' || z === 'AH') return { level: `Moderate — ${zone}`, status: 'warning' };
  if (z.includes('0.2')) return { level: 'Moderate — 500-yr', status: 'warning' };
  if (z === 'X') return { level: 'Minimal — Zone X', status: 'good' };
  return { level: zone, status: 'warning' };
}

// Build recommendations from the parcel's actual risk flags.
function buildRecommendations(p) {
  const recs = [];
  const z = String(p.fema_zone || '').toUpperCase();
  if (p.in_flood_zone && z && z !== 'X' && !z.includes('0.2'))
    recs.push('Verify base flood elevation and add stormwater runoff controls before site work.');
  if (p.in_habitat)
    recs.push('Request a protected-habitat buffer assessment from an environmental consultant.');
  if (p.in_wetland)
    recs.push('Obtain a wetland delineation and review Section 404 permitting requirements.');
  if (p.compliance_status === 'NON_COMPLIANT')
    recs.push('Schedule a full environmental compliance review before site clearing or permitting.');
  if (recs.length === 0)
    recs.push('No major environmental constraints flagged — standard due diligence applies.');
  recs.push('Maintain monitoring and documentation records for local compliance reporting.');
  return recs;
}

// Draw the parcel's real GeoJSON geometry as an SVG (no map library required).
function ParcelShape({ geometry }) {
  if (!geometry || !geometry.coordinates) {
    return <div className="map-placeholder"><p>No geometry available for this parcel.</p></div>;
  }
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  polys.forEach((poly) =>
    poly.forEach((ring) =>
      ring.forEach(([x, y]) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      })
    )
  );
  const w = maxX - minX || 1e-6;
  const h = maxY - minY || 1e-6;
  const VW = 360, VH = 300, pad = 16;
  const scale = Math.min((VW - pad * 2) / w, (VH - pad * 2) / h);
  const offX = (VW - w * scale) / 2;
  const offY = (VH - h * scale) / 2;
  // Flip Y so north points up (latitude grows upward, SVG y grows downward).
  const project = ([x, y]) => [offX + (x - minX) * scale, VH - (offY + (y - minY) * scale)];
  const paths = polys.map((poly) =>
    poly
      .map((ring) => 'M' + ring.map((pt) => project(pt).map((n) => n.toFixed(1)).join(',')).join(' L') + ' Z')
      .join(' ')
  );
  const cLat = ((minY + maxY) / 2).toFixed(5);
  const cLng = ((minX + maxX) / 2).toFixed(5);
  return (
    <div>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', maxWidth: VW, background: 'rgba(0,0,0,0.05)', borderRadius: 8 }}
      >
        {paths.map((d, i) => (
          <path key={i} d={d} fill="rgba(56,142,60,0.35)" stroke="#2e7d32" strokeWidth="1.5" />
        ))}
      </svg>
      <p style={{ fontSize: '0.85rem', opacity: 0.75, marginTop: 8 }}>
        Actual parcel outline · center ≈ {cLat}, {cLng}
      </p>
    </div>
  );
}

const TABS = [
  ['overview', 'Overview'],
  ['risks', 'Risks'],
  ['map', 'Map'],
  ['recommendations', 'Recommendations'],
  ['aws', 'AWS Plan'],
];

const AWS_PLAN = [
  { service: 'Amazon RDS (PostgreSQL + PostGIS)', purpose: 'Stores parcels, environmental layers, and the computed risk_analysis table.' },
  { service: 'Elastic Beanstalk (Node / Express)', purpose: 'Hosts the API serving parcel search, detail, and risk summaries.' },
  { service: 'Amazon S3 + CloudFront', purpose: 'Hosts and distributes the React/Vite production build.' },
  { service: 'Amazon CloudWatch', purpose: 'Logs, metrics, and alerting across the stack.' },
];

function App() {
  const [searchInput, setSearchInput] = useState('');
  const [message, setMessage] = useState('');
  const [propertyResult, setPropertyResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const handleAnalyzeProperty = async (event) => {
    event.preventDefault();
    const q = searchInput.trim();
    if (!q) {
      setPropertyResult(null);
      setMessage('Please enter a parcel number, address, or owner name to run an analysis.');
      return;
    }
    setPropertyResult(null);
    setMessage('');
    setIsLoading(true);
    try {
      // 1) find a matching parcel
      const sRes = await fetch(`${API}/api/parcels/search?q=${encodeURIComponent(q)}&limit=1`);
      if (!sRes.ok) throw new Error(`search ${sRes.status}`);
      const sData = await sRes.json();
      const list = Array.isArray(sData)
        ? sData
        : sData.parcels || sData.results || sData.rows || sData.data || [];
      if (!list.length) {
        setMessage(`No parcel found matching "${q}".`);
        setIsLoading(false);
        return;
      }
      const pid = list[0].id ?? list[0].parcel_id ?? list[0].parcel_no;
      // 2) pull full detail (attributes + geometry + risk)
      const dRes = await fetch(`${API}/api/parcels/${encodeURIComponent(pid)}`);
      if (!dRes.ok) throw new Error(`detail ${dRes.status}`);
      const detail = await dRes.json();
      setPropertyResult({ ...detail, query: q });
      setActiveTab('overview');
      setMessage(`Showing results for "${q}".`);
    } catch (err) {
      setMessage(`Couldn't reach the API (${err.message}). Is the server running on ${API}?`);
    } finally {
      setIsLoading(false);
    }
  };

  const p = propertyResult;
  const attrs = (p && p.attributes) || {};
  const riskCards = p
    ? [
        { label: 'Flood Zone', ...floodInfo(p.in_flood_zone, p.fema_zone) },
        { label: 'Wetlands', level: p.in_wetland ? 'Present' : 'None detected', status: p.in_wetland ? 'danger' : 'good' },
        { label: 'Protected Habitat', level: p.in_habitat ? 'Present' : 'None detected', status: p.in_habitat ? 'danger' : 'good' },
        { label: 'Risk Score', level: String(p.risk_score), status: p.risk_score >= 60 ? 'danger' : p.risk_score >= 30 ? 'warning' : 'good' },
      ]
    : [];

  return (
    <div className="app-shell">
      <header className="hero-section">
        <p className="hero-badge">AWS re/Start Portfolio Project</p>
        <h1>Environmental Compliance Dashboard</h1>
        <p className="hero-subtitle">
          Evaluate parcel-level environmental risk and compliance readiness across the NC Research Triangle.
        </p>
      </header>

      <section className="search-section card">
        <label htmlFor="propertySearch" className="search-label">
          Parcel Number, Address, or Owner
        </label>
        <form className="search-row" onSubmit={handleAnalyzeProperty}>
          <input
            id="propertySearch"
            type="text"
            placeholder="Example: 0844248583 or HAMLIN RD"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" disabled={isLoading}>Analyze Property</button>
        </form>
        {message && <p className="search-message">{message}</p>}
        {isLoading && <p className="loading-message">Querying the risk database…</p>}
      </section>

      {p && (
        <main className="dashboard-grid">
          <div className="tabs">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                className={activeTab === key ? 'active' : ''}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <section className="card property-overview">
              <h2>Property Overview</h2>
              <p><strong>Parcel #:</strong> {val(p.parcel_no)}</p>
              <p><strong>Address:</strong> {val(attrs.SITEADD)}{attrs.SCITY ? `, ${attrs.SCITY}` : ''} {val(attrs.SZIP)}</p>
              <p><strong>Owner:</strong> {val(attrs.OWNNAME)}</p>
              <p><strong>County:</strong> {val(p.county_name)}</p>
              <p><strong>Acreage:</strong> {val(attrs.GISACRES)}</p>
              <p><strong>Land Use:</strong> {val(attrs.PARUSEDESC)}</p>
              <p><strong>Assessed Value:</strong> {attrs.PARVAL && attrs.PARVAL !== 'nan' ? `$${Number(attrs.PARVAL).toLocaleString()}` : '—'}</p>
              <p className="compliance-pill">
                Compliance Status: <span>{prettyStatus(p.compliance_status)}</span>
              </p>
            </section>
          )}

          {activeTab === 'risks' && (
            <section className="card risk-section">
              <h2>Risk Summary</h2>
              <div className="risk-grid">
                {riskCards.map((r) => (
                  <article key={r.label} className={`risk-card risk-${r.status}`}>
                    <p className="risk-label">{r.label}</p>
                    <p className="risk-level">{r.level}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'map' && (
            <section className="card map-section">
              <h2>Parcel Map</h2>
              <ParcelShape geometry={p.geometry} />
            </section>
          )}

          {activeTab === 'recommendations' && (
            <section className="card recommendations-section">
              <h2>Compliance Recommendations</h2>
              <ul>
                {buildRecommendations(p).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {activeTab === 'aws' && (
            <section className="card aws-plan-section">
              <h2>AWS Architecture</h2>
              <div className="aws-service-list">
                {AWS_PLAN.map((s) => (
                  <article key={s.service} className="aws-service-item">
                    <h3>{s.service}</h3>
                    <p>{s.purpose}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}

export default App;
