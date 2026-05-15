import { useState } from 'react';
import './App.css';

function App() {
  // Tracks what user types in the search field.
  const [searchInput, setSearchInput] = useState('');

  // Holds validation/help messages for the user.
  const [message, setMessage] = useState('');

  // Stores the selected property result after user clicks Analyze Property.
  const [propertyResult, setPropertyResult] = useState(null);

  // Fake property data we can later replace with a real API response from AWS.
  const samplePropertyData = {
    id: 'PARCEL-4821-AZ',
    address: '1458 Green Valley Rd, Cedar Hill, TX',
    updatedAt: 'May 13, 2026',
    riskSummary: [
      { label: 'Flood Zone', level: 'Moderate', status: 'warning' },
      { label: 'Wetlands', level: 'Low', status: 'good' },
      { label: 'Protected Habitat', level: 'High', status: 'danger' },
      { label: 'Endangered Species', level: 'Moderate', status: 'warning' },
    ],
    complianceStatus: 'Conditional Approval',
    recommendations: [
      'Schedule an ecological impact review before site clearing.',
      'Add stormwater runoff controls to lower flood-related risk.',
      'Request a protected habitat buffer assessment from environmental consultants.',
      'Maintain monitoring records for local compliance reporting.',
    ],
    awsPlan: [
      {
        service: 'Amazon API Gateway',
        purpose: 'Secure endpoint for frontend property analysis requests.',
      },
      {
        service: 'AWS Lambda',
        purpose: 'Serverless function to process risk logic and combine data sources.',
      },
      {
        service: 'Amazon DynamoDB / Amazon RDS (PostGIS)',
        purpose: 'Store parcel records, risk results, and geospatial compliance metadata.',
      },
      {
        service: 'Amazon S3',
        purpose: 'Store map layers, uploaded reports, and compliance documents.',
      },
      {
        service: 'Amazon CloudWatch',
        purpose: 'Track logs, metrics, and alerting for the analysis workflow.',
      },
      {
        service: 'Amazon Location Service / Mapbox (optional)',
        purpose: 'Interactive map rendering and geocoding in future releases.',
      },
    ],
  };

  // Handles click behavior for the Analyze Property button.
  const handleAnalyzeProperty = () => {
    const trimmedInput = searchInput.trim();

    if (!trimmedInput) {
      setPropertyResult(null);
      setMessage('Please enter a property address or parcel ID to run an analysis.');
      return;
    }

    // For now we always return sample data to simulate a successful search result.
    setPropertyResult({ ...samplePropertyData, query: trimmedInput });
    setMessage(`Showing sample analysis results for: "${trimmedInput}"`);
  };

  return (
    <div className="app-shell">
      {/* Header / Hero Section */}
      <header className="hero-section">
        <p className="hero-badge">AWS re/Start Portfolio Project</p>
        <h1>Environmental Compliance Dashboard</h1>
        <p className="hero-subtitle">
          Evaluate property-level environmental risk indicators and compliance readiness for
          development planning.
        </p>
      </header>

      {/* Search Controls */}
      <section className="search-section card">
        <label htmlFor="propertySearch" className="search-label">
          Property Address or Parcel ID
        </label>
        <div className="search-row">
          <input
            id="propertySearch"
            type="text"
            placeholder="Example: 1458 Green Valley Rd or PARCEL-4821-AZ"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button onClick={handleAnalyzeProperty}>Analyze Property</button>
        </div>
        {message && <p className="search-message">{message}</p>}
      </section>

      {/* Results Section - displayed only after user runs an analysis */}
      {propertyResult && (
        <main className="dashboard-grid">
          <section className="card property-overview">
            <h2>Property Overview</h2>
            <p>
              <strong>Search Query:</strong> {propertyResult.query}
            </p>
            <p>
              <strong>Sample Address:</strong> {propertyResult.address}
            </p>
            <p>
              <strong>Parcel ID:</strong> {propertyResult.id}
            </p>
            <p>
              <strong>Last Updated:</strong> {propertyResult.updatedAt}
            </p>
            <p className="compliance-pill">
              Overall Compliance Status: <span>{propertyResult.complianceStatus}</span>
            </p>
          </section>

          <section className="card risk-section">
            <h2>Risk Summary</h2>
            <div className="risk-grid">
              {propertyResult.riskSummary.map((riskItem) => (
                <article
                  key={riskItem.label}
                  className={`risk-card risk-${riskItem.status}`}
                >
                  <p className="risk-label">{riskItem.label}</p>
                  <p className="risk-level">{riskItem.level}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="card map-section">
            <h2>Map Preview (Placeholder)</h2>
            <div className="map-placeholder">
              <p>Interactive map will appear here.</p>
              <p>Future integration: Amazon Location Service or Mapbox.</p>
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
              {propertyResult.awsPlan.map((serviceItem) => (
                <article key={serviceItem.service} className="aws-service-item">
                  <h3>{serviceItem.service}</h3>
                  <p>{serviceItem.purpose}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="card integration-note">
            <h2>Future AWS Integration</h2>
            <p>
              This frontend currently uses sample data for demonstration. In a production AWS
              architecture, search requests will flow through API Gateway to Lambda, then retrieve
              property intelligence from DynamoDB or RDS/PostGIS, with assets in S3 and observability
              through CloudWatch.
            </p>
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
