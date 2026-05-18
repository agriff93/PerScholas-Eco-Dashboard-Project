import { useState } from 'react';
import './App.css';
import MapView from './MapView';

function App() {
  const [searchInput, setSearchInput] = useState('');
  const [message, setMessage] = useState('');
  const [propertyResult, setPropertyResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const samplePropertyData = {
    id: 'PARCEL-4821-AZ',
    address: '1458 Green Valley Rd, Cedar Hill, TX',
    updatedAt: 'May 13, 2026',
    riskSummary: [
      { label: 'Flood Zone',          level: 'Moderate', status: 'warning' },
      { label: 'Wetlands',            level: 'Low',      status: 'good'    },
      { label: 'Protected Habitat',   level: 'High',     status: 'danger'  },
      { label: 'Endangered Species',  level: 'Moderate', status: 'warning' },
    ],
    complianceStatus: 'Conditional Approval',
    recommendations: [
      'Schedule an ecological impact review before site clearing.',
      'Add stormwater runoff controls to lower flood-related risk.',
      'Request a protected habitat buffer assessment from environmental consultants.',
      'Maintain monitoring records for local compliance reporting.',
    ],
    awsPlan: [
      { service: 'Amazon API Gateway',            purpose: 'Secure endpoint for frontend property analysis requests.' },
      { service: 'AWS Lambda',                    purpose: 'Serverless function to process risk logic and combine data sources.' },
      { service: 'Amazon DynamoDB / Amazon RDS',  purpose: 'Store parcel records, risk results, and geospatial compliance metadata.' },
      { service: 'Amazon S3',                     purpose: 'Store map layers, uploaded reports, and compliance documents.' },
      { service: 'Amazon CloudWatch',             purpose: 'Track logs, metrics, and alerting for the analysis workflow.' },
      { service: 'Amazon Location Service / Mapbox', purpose: 'Interactive map rendering and geocoding in future releases.' },
    ],
  };

  const handleAnalyzeProperty = (event) => {
    event.preventDefault();
    const trimmedInput = searchInput.trim();

    if (!trimmedInput) {
      setPropertyResult(null);
      setMessage('Please enter a property address or parcel ID to run an analysis.');
      return;
    }

    setPropertyResult(null);
    setMessage('');
    setIsLoading(true);

    setTimeout(() => {
      setPropertyResult({ ...samplePropertyData, query: trimmedInput });
      setMessage(`Showing sample analysis results for: "${trimmedInput}"`);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="hero-section">
        <p className="hero-badge">AWS re/Start Portfolio Project</p>
        <h1>Environmental Compliance Dashboard</h1>
        <p className="hero-subtitle">
          Evaluate property-level environmental risk indicators and compliance readiness for
          development planning.
        </p>
      </header>

      {/* Search */}
      <section className="search-section card">
        <label htmlFor="propertySearch" className="search-label">
          Property Address or Parcel ID
        </label>
        <form className="search-row" onSubmit={handleAnalyzeProperty}>
          <input
            id="propertySearch"
            type="text"
            placeholder="Example: 1458 Green Valley Rd or PARCEL-4821-AZ"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" disabled={isLoading}>Analyze Property</button>
        </form>
        {message   && <p className="search-message">{message}</p>}
        {isLoading && <p className="loading-message">Fetching sample AWS-ready data...</p>}
      </section>

      {/* ── Map is always visible, not gated behind a search ── */}
      <section className="card map-section">
        <h2>NC Ecological Compliance Map</h2>
        <p className="map-section-subtitle">
          Click a compliance zone or zoom in to explore parcels. Search above to fly to an address.
        </p>
        <MapView propertyQuery={propertyResult?.query} />
      </section>

      {/* Dashboard — shown after search */}
      {propertyResult && (
        <main className="dashboard-grid">
          <section className="card property-overview">
            <h2>Property Overview</h2>
            <p><strong>Search Query:</strong> {propertyResult.query}</p>
            <p><strong>Sample Address:</strong> {propertyResult.address}</p>
            <p><strong>Parcel ID:</strong> {propertyResult.id}</p>
            <p><strong>Last Updated:</strong> {propertyResult.updatedAt}</p>
            <p className="compliance-pill">
              Overall Compliance Status: <span>{propertyResult.complianceStatus}</span>
            </p>
          </section>

          <section className="card risk-section">
            <h2>Risk Summary</h2>
            <div className="risk-grid">
              {propertyResult.riskSummary.map((item) => (
                <article key={item.label} className={`risk-card risk-${item.status}`}>
                  <p className="risk-label">{item.label}</p>
                  <p className="risk-level">{item.level}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="card recommendations-section">
            <h2>Compliance Recommendations</h2>
            <ul>
              {propertyResult.recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="card aws-plan-section">
            <h2>AWS Services Planned</h2>
            <div className="aws-service-list">
              {propertyResult.awsPlan.map((s) => (
                <article key={s.service} className="aws-service-item">
                  <h3>{s.service}</h3>
                  <p>{s.purpose}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="card integration-note">
            <h2>Future AWS Integration</h2>
            <p>
              This frontend currently uses sample data for demonstration. In a production AWS
              architecture, search requests will flow through API Gateway to Lambda, then retrieve
              property intelligence from DynamoDB or RDS/PostGIS, with assets in S3 and
              observability through CloudWatch.
            </p>
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
