-- ============================================================
-- Eco Dashboard - PostGIS Schema
-- North Carolina Environmental Compliance Platform
-- ============================================================

-- Enable PostGIS extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS postgis_raster;

-- ============================================================
-- SCHEMA SETUP
-- ============================================================

CREATE SCHEMA IF NOT EXISTS "Environmental_Layers";
CREATE SCHEMA IF NOT EXISTS "Parcels";

-- ============================================================
-- PARCELS SCHEMA
-- Core property/parcel data that users search against
-- ============================================================

CREATE TABLE "Parcels".parcels (
    id                  SERIAL PRIMARY KEY,
    parcel_id           VARCHAR(50) UNIQUE NOT NULL,         -- e.g. PARCEL-4821-AZ
    address             TEXT,
    county              VARCHAR(100),                        -- NC county name
    state               CHAR(2) DEFAULT 'NC',
    owner_name          TEXT,
    land_use_code       VARCHAR(20),
    acreage             NUMERIC(10, 4),
    geom                GEOMETRY(MultiPolygon, 4326),        -- parcel boundary
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_parcels_geom ON "Parcels".parcels USING GIST (geom);
CREATE INDEX idx_parcels_county ON "Parcels".parcels (county);
CREATE INDEX idx_parcels_parcel_id ON "Parcels".parcels (parcel_id);

-- ============================================================
-- ENVIRONMENTAL LAYERS SCHEMA
-- All the environmental risk layers overlaid against parcels
-- ============================================================

-- ----------------------------
-- 1. FLOOD ZONES (FEMA)
-- ----------------------------
CREATE TABLE "Environmental_Layers".flood_zones (
    id              SERIAL PRIMARY KEY,
    fema_zone       VARCHAR(20),                -- e.g. AE, X, VE
    flood_risk      VARCHAR(20),                -- Low, Moderate, High
    description     TEXT,
    geom            GEOMETRY(MultiPolygon, 4326),
    source          VARCHAR(100) DEFAULT 'FEMA National Flood Hazard Layer',
    last_updated    DATE
);

CREATE INDEX idx_flood_zones_geom ON "Environmental_Layers".flood_zones USING GIST (geom);

-- ----------------------------
-- 2. WETLANDS (USFWS NWI)
-- ----------------------------
CREATE TABLE "Environmental_Layers".wetlands (
    id              SERIAL PRIMARY KEY,
    wetland_type    VARCHAR(100),               -- e.g. Freshwater Emergent, Estuarine
    nwi_code        VARCHAR(20),                -- National Wetlands Inventory code
    description     TEXT,
    geom            GEOMETRY(MultiPolygon, 4326),
    source          VARCHAR(100) DEFAULT 'USFWS National Wetlands Inventory',
    last_updated    DATE
);

CREATE INDEX idx_wetlands_geom ON "Environmental_Layers".wetlands USING GIST (geom);

-- ----------------------------
-- 3. PROTECTED HABITAT
-- ----------------------------
CREATE TABLE "Environmental_Layers".protected_habitat (
    id              SERIAL PRIMARY KEY,
    habitat_name    VARCHAR(200),
    protection_level VARCHAR(50),              -- Federal, State, Local
    managing_agency VARCHAR(100),
    geom            GEOMETRY(MultiPolygon, 4326),
    source          VARCHAR(100) DEFAULT 'NC Natural Heritage Program',
    last_updated    DATE
);

CREATE INDEX idx_protected_habitat_geom ON "Environmental_Layers".protected_habitat USING GIST (geom);

-- ----------------------------
-- 4. ENDANGERED SPECIES
-- ----------------------------
CREATE TABLE "Environmental_Layers".endangered_species (
    id              SERIAL PRIMARY KEY,
    species_name    VARCHAR(200),
    common_name     VARCHAR(200),
    status          VARCHAR(50),               -- Endangered, Threatened, Candidate
    category        VARCHAR(50),               -- Plant, Animal, Bird, Fish, etc.
    critical_habitat BOOLEAN DEFAULT FALSE,
    geom            GEOMETRY(MultiPolygon, 4326),  -- critical habitat boundary
    source          VARCHAR(100) DEFAULT 'USFWS IPaC',
    last_updated    DATE
);

CREATE INDEX idx_endangered_species_geom ON "Environmental_Layers".endangered_species USING GIST (geom);

-- ----------------------------
-- 5. NC COUNTIES (reference layer)
-- ----------------------------
CREATE TABLE "Environmental_Layers".nc_counties (
    id              SERIAL PRIMARY KEY,
    county_name     VARCHAR(100) UNIQUE NOT NULL,
    fips_code       CHAR(5),
    region          VARCHAR(50),               -- e.g. Piedmont, Coastal Plain, Mountains
    geom            GEOMETRY(MultiPolygon, 4326),
    population      INTEGER,
    area_sq_miles   NUMERIC(10, 2)
);

CREATE INDEX idx_nc_counties_geom ON "Environmental_Layers".nc_counties USING GIST (geom);

-- ============================================================
-- RISK ANALYSIS RESULTS
-- Stores computed risk scores per parcel (cached results)
-- ============================================================

CREATE TABLE public.risk_analysis (
    id                      SERIAL PRIMARY KEY,
    parcel_id               VARCHAR(50) REFERENCES "Parcels".parcels(parcel_id),
    flood_risk_level        VARCHAR(20),       -- Low, Moderate, High
    flood_zone_designation  VARCHAR(20),
    wetland_risk_level      VARCHAR(20),
    wetland_overlap_acres   NUMERIC(10, 4),
    habitat_risk_level      VARCHAR(20),
    habitat_overlap_acres   NUMERIC(10, 4),
    species_risk_level      VARCHAR(20),
    species_count           INTEGER DEFAULT 0,
    overall_compliance      VARCHAR(50),       -- Approved, Conditional Approval, Restricted, Denied
    risk_score              NUMERIC(5, 2),     -- 0.00 - 100.00
    recommendations         TEXT[],            -- array of recommendation strings
    analyzed_at             TIMESTAMP DEFAULT NOW(),
    expires_at              TIMESTAMP DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX idx_risk_analysis_parcel ON public.risk_analysis (parcel_id);
CREATE INDEX idx_risk_analysis_analyzed ON public.risk_analysis (analyzed_at);

-- ============================================================
-- AUDIT / SEARCH LOG
-- Track what parcels users are searching (useful for analytics)
-- ============================================================

CREATE TABLE public.search_log (
    id          SERIAL PRIMARY KEY,
    query       TEXT NOT NULL,
    parcel_id   VARCHAR(50),
    ip_address  INET,
    searched_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- HELPER FUNCTION: Get risk level from FEMA zone code
-- ============================================================

CREATE OR REPLACE FUNCTION public.fema_zone_to_risk(zone_code VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    RETURN CASE
        WHEN zone_code IN ('A', 'AE', 'AH', 'AO', 'AR', 'A99', 'V', 'VE') THEN 'High'
        WHEN zone_code IN ('B', 'X500') THEN 'Moderate'
        WHEN zone_code IN ('C', 'X') THEN 'Low'
        ELSE 'Unknown'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- HELPER FUNCTION: Compute overall compliance status
-- ============================================================

CREATE OR REPLACE FUNCTION public.compute_compliance_status(
    p_flood_risk VARCHAR,
    p_wetland_risk VARCHAR,
    p_habitat_risk VARCHAR,
    p_species_risk VARCHAR
)
RETURNS VARCHAR AS $$
DECLARE
    high_count INTEGER := 0;
    moderate_count INTEGER := 0;
BEGIN
    -- Count high risk flags
    IF p_flood_risk = 'High' THEN high_count := high_count + 1; END IF;
    IF p_wetland_risk = 'High' THEN high_count := high_count + 1; END IF;
    IF p_habitat_risk = 'High' THEN high_count := high_count + 1; END IF;
    IF p_species_risk = 'High' THEN high_count := high_count + 1; END IF;

    -- Count moderate risk flags
    IF p_flood_risk = 'Moderate' THEN moderate_count := moderate_count + 1; END IF;
    IF p_wetland_risk = 'Moderate' THEN moderate_count := moderate_count + 1; END IF;
    IF p_habitat_risk = 'Moderate' THEN moderate_count := moderate_count + 1; END IF;
    IF p_species_risk = 'Moderate' THEN moderate_count := moderate_count + 1; END IF;

    RETURN CASE
        WHEN high_count >= 2 THEN 'Restricted'
        WHEN high_count = 1 THEN 'Conditional Approval'
        WHEN moderate_count >= 2 THEN 'Conditional Approval'
        ELSE 'Approved'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- SEED: NC Counties (all 100)
-- ============================================================

INSERT INTO "Environmental_Layers".nc_counties (county_name, fips_code, region) VALUES
('Alamance', '37001', 'Piedmont'),
('Alexander', '37003', 'Piedmont'),
('Alleghany', '37005', 'Mountains'),
('Anson', '37007', 'Piedmont'),
('Ashe', '37009', 'Mountains'),
('Avery', '37011', 'Mountains'),
('Beaufort', '37013', 'Coastal Plain'),
('Bertie', '37015', 'Coastal Plain'),
('Bladen', '37017', 'Coastal Plain'),
('Brunswick', '37019', 'Coastal Plain'),
('Buncombe', '37021', 'Mountains'),
('Burke', '37023', 'Mountains'),
('Cabarrus', '37025', 'Piedmont'),
('Caldwell', '37027', 'Mountains'),
('Camden', '37029', 'Coastal Plain'),
('Carteret', '37031', 'Coastal Plain'),
('Caswell', '37033', 'Piedmont'),
('Catawba', '37035', 'Piedmont'),
('Chatham', '37037', 'Piedmont'),
('Cherokee', '37039', 'Mountains'),
('Chowan', '37041', 'Coastal Plain'),
('Clay', '37043', 'Mountains'),
('Cleveland', '37045', 'Piedmont'),
('Columbus', '37047', 'Coastal Plain'),
('Craven', '37049', 'Coastal Plain'),
('Cumberland', '37051', 'Coastal Plain'),
('Currituck', '37053', 'Coastal Plain'),
('Dare', '37055', 'Coastal Plain'),
('Davidson', '37057', 'Piedmont'),
('Davie', '37059', 'Piedmont'),
('Duplin', '37061', 'Coastal Plain'),
('Durham', '37063', 'Piedmont'),
('Edgecombe', '37065', 'Coastal Plain'),
('Forsyth', '37067', 'Piedmont'),
('Franklin', '37069', 'Piedmont'),
('Gaston', '37071', 'Piedmont'),
('Gates', '37073', 'Coastal Plain'),
('Graham', '37075', 'Mountains'),
('Granville', '37077', 'Piedmont'),
('Greene', '37079', 'Coastal Plain'),
('Guilford', '37081', 'Piedmont'),
('Halifax', '37083', 'Coastal Plain'),
('Harnett', '37085', 'Coastal Plain'),
('Haywood', '37087', 'Mountains'),
('Henderson', '37089', 'Mountains'),
('Hertford', '37091', 'Coastal Plain'),
('Hoke', '37093', 'Coastal Plain'),
('Hyde', '37095', 'Coastal Plain'),
('Iredell', '37097', 'Piedmont'),
('Jackson', '37099', 'Mountains'),
('Johnston', '37101', 'Coastal Plain'),
('Jones', '37103', 'Coastal Plain'),
('Lee', '37105', 'Piedmont'),
('Lenoir', '37107', 'Coastal Plain'),
('Lincoln', '37109', 'Piedmont'),
('McDowell', '37111', 'Mountains'),
('Macon', '37113', 'Mountains'),
('Madison', '37115', 'Mountains'),
('Martin', '37117', 'Coastal Plain'),
('Mecklenburg', '37119', 'Piedmont'),
('Mitchell', '37121', 'Mountains'),
('Montgomery', '37123', 'Piedmont'),
('Moore', '37125', 'Piedmont'),
('Nash', '37127', 'Coastal Plain'),
('New Hanover', '37129', 'Coastal Plain'),
('Northampton', '37131', 'Coastal Plain'),
('Onslow', '37133', 'Coastal Plain'),
('Orange', '37135', 'Piedmont'),
('Pamlico', '37137', 'Coastal Plain'),
('Pasquotank', '37139', 'Coastal Plain'),
('Pender', '37141', 'Coastal Plain'),
('Perquimans', '37143', 'Coastal Plain'),
('Person', '37145', 'Piedmont'),
('Pitt', '37147', 'Coastal Plain'),
('Polk', '37149', 'Mountains'),
('Randolph', '37151', 'Piedmont'),
('Richmond', '37153', 'Piedmont'),
('Robeson', '37155', 'Coastal Plain'),
('Rockingham', '37157', 'Piedmont'),
('Rowan', '37159', 'Piedmont'),
('Rutherford', '37161', 'Mountains'),
('Sampson', '37163', 'Coastal Plain'),
('Scotland', '37165', 'Piedmont'),
('Stanly', '37167', 'Piedmont'),
('Stokes', '37169', 'Piedmont'),
('Surry', '37171', 'Piedmont'),
('Swain', '37173', 'Mountains'),
('Transylvania', '37175', 'Mountains'),
('Tyrrell', '37177', 'Coastal Plain'),
('Union', '37179', 'Piedmont'),
('Vance', '37181', 'Piedmont'),
('Wake', '37183', 'Piedmont'),
('Warren', '37185', 'Piedmont'),
('Washington', '37187', 'Coastal Plain'),
('Watauga', '37189', 'Mountains'),
('Wayne', '37191', 'Coastal Plain'),
('Wilkes', '37193', 'Mountains'),
('Wilson', '37195', 'Coastal Plain'),
('Yadkin', '37197', 'Piedmont'),
('Yancey', '37199', 'Mountains');

-- ============================================================
-- SEED: Sample Parcels (mock NC data for dev/testing)
-- ============================================================

INSERT INTO "Parcels".parcels (parcel_id, address, county, owner_name, land_use_code, acreage) VALUES
('PARCEL-0001-NC', '1234 Loblolly Pine Rd, Raleigh, NC 27601', 'Wake', 'John Developer LLC', 'RES', 2.45),
('PARCEL-0002-NC', '889 Cape Fear Blvd, Wilmington, NC 28401', 'New Hanover', 'Coastal Dev Group', 'COM', 5.10),
('PARCEL-0003-NC', '210 Blue Ridge Pkwy, Asheville, NC 28801', 'Buncombe', 'Mountain Properties Inc', 'AGR', 12.00),
('PARCEL-0004-NC', '55 Outer Banks Way, Nags Head, NC 27959', 'Dare', 'OBX Holdings', 'RES', 0.75),
('PARCEL-0005-NC', '3300 Research Triangle Dr, Durham, NC 27701', 'Durham', 'RTP Ventures', 'IND', 8.30);

-- ============================================================
-- SEED: Sample Risk Analysis Results
-- ============================================================

INSERT INTO public.risk_analysis (
    parcel_id, flood_risk_level, flood_zone_designation,
    wetland_risk_level, wetland_overlap_acres,
    habitat_risk_level, habitat_overlap_acres,
    species_risk_level, species_count,
    overall_compliance, risk_score, recommendations
) VALUES
(
    'PARCEL-0001-NC', 'Low', 'X', 'Low', 0.00, 'Low', 0.00, 'Low', 0,
    'Approved', 12.50,
    ARRAY['Standard stormwater management plan required.', 'No critical environmental constraints identified.']
),
(
    'PARCEL-0002-NC', 'High', 'AE', 'Moderate', 1.20, 'Low', 0.00, 'Moderate', 2,
    'Conditional Approval', 68.00,
    ARRAY['Flood elevation certificate required before construction.', 'Wetland delineation study recommended.', 'Species impact assessment required for 2 at-risk species.']
),
(
    'PARCEL-0003-NC', 'Low', 'X', 'Low', 0.00, 'High', 4.50, 'High', 4,
    'Restricted', 82.00,
    ARRAY['Protected habitat buffer assessment required.', 'Biological survey required for 4 endangered species.', 'Coordinate with NC Wildlife Resources Commission before any clearing.']
),
(
    'PARCEL-0004-NC', 'High', 'VE', 'High', 0.60, 'Moderate', 0.30, 'Moderate', 1,
    'Restricted', 91.00,
    ARRAY['Coastal construction setback rules apply.', 'CAMA permit required.', 'Wetland fill permit from Army Corps of Engineers required.', 'Sea level rise vulnerability assessment recommended.']
),
(
    'PARCEL-0005-NC', 'Low', 'X', 'Low', 0.00, 'Low', 0.00, 'Low', 0,
    'Approved', 8.00,
    ARRAY['Standard environmental review sufficient.', 'No significant constraints identified.']
);
