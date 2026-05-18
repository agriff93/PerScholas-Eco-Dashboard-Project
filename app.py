from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import requests
import json
from shapely.geometry import shape, box

app = Flask(__name__)
CORS(app)

PARCEL_FILE = "parcels.geojson" # To be done, still need to grab the info

try:
    with open(PARCEL_FILE) as f:
        ALL_PARCELS = json.load(f)
    print(f"[PARCELS] Loaded {len(ALL_PARCELS['features'])} parcels")
except FileNotFoundError:
    print(f"[PARCELS] Warning: {PARCEL_FILE} not found — parcel layer will be empty")
    ALL_PARCELS = {"type": "FeatureCollection", "features": []}

COMPLIANCE_REGIONS = [
    {
        "name": "Coastal Plain Buffer Zone",
        "coordinates": [[-78.5,34.0],[-76.5,34.0],[-76.5,36.0],[-78.5,36.0],[-78.5,34.0]],
        "compliance_rules": ["NCDEQ 15A NCAC 02B .0233 — 50ft riparian buffer required","Wetland disturbance permit needed under §404","CAMA permit required within 75ft of coastal waters"],
        "severity": "high", "agency": "NCDEQ / Army Corps", "color": "#e63946"
    },
    {
        "name": "Piedmont Triad — Water Supply Watershed",
        "coordinates": [[-80.5,35.5],[-79.0,35.5],[-79.0,36.5],[-80.5,36.5],[-80.5,35.5]],
        "compliance_rules": ["WS-II/WS-III watershed classification restrictions","Impervious surface limits: 12% low-density, 30% high-density","Stormwater management plan required > 1 acre disturbed"],
        "severity": "medium", "agency": "NCDEQ Division of Water Resources", "color": "#f4a261"
    },
    {
        "name": "Mountain Headwaters — Trout Buffer",
        "coordinates": [[-84.0,35.0],[-81.5,35.0],[-81.5,36.6],[-84.0,36.6],[-84.0,35.0]],
        "compliance_rules": ["ORW / HQW designation — no new NPDES discharges","25ft undisturbed buffer for trout waters","Sedimentation & Erosion Control Act — land-disturbing > 1 acre"],
        "severity": "high", "agency": "NCDEQ / Wildlife Resources Commission", "color": "#2a9d8f"
    },
    {
        "name": "Sandhills — Longleaf Pine Habitat",
        "coordinates": [[-79.8,34.8],[-78.5,34.8],[-78.5,35.5],[-79.8,35.5],[-79.8,34.8]],
        "compliance_rules": ["Red-cockaded Woodpecker ESA Section 7 consultation required","Longleaf pine ecosystem mitigation banking may apply","USFWS coordination needed for any clearing > 5 acres"],
        "severity": "critical", "agency": "USFWS / NC Wildlife Resources Commission", "color": "#6d28d9"
    },
]

def build_geojson(severity=None):
    features = []
    for r in COMPLIANCE_REGIONS:
        if severity and r["severity"] != severity:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [r["coordinates"]]},
            "properties": {
                "name": r["name"], "severity": r["severity"],
                "agency": r["agency"], "color": r["color"],
                "compliance_rules": r["compliance_rules"],
            }
        })
    return {"type": "FeatureCollection", "features": features}

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/api/compliance-regions")
def get_regions():
    severity = request.args.get("severity")
    return jsonify(build_geojson(severity))

@app.route("/api/point-check")
def check_point():
    from shapely.geometry import Point
    lat = float(request.args.get("lat"))
    lng = float(request.args.get("lng"))
    pt  = Point(lng, lat)
    matches = []
    for feature in build_geojson()["features"]:
        if shape(feature["geometry"]).contains(pt):
            matches.append(feature["properties"])
    return jsonify({"point": [lat, lng], "applicable_regions": matches})

@app.route("/api/parcels")
def get_parcels():
    bbox = request.args.get("bbox")
    if not bbox:
        return jsonify({"error": "bbox required"}), 400

    try:
        xmin, ymin, xmax, ymax = [float(v) for v in bbox.split(",")]
    except ValueError:
        return jsonify({"error": "invalid bbox"}), 400

    if (xmax - xmin) > 0.5:
        return jsonify({"error": "zoom_required"}), 400

    query_box = box(xmin, ymin, xmax, ymax)
    matched = []

    for i, feature in enumerate(ALL_PARCELS["features"]):
        try:
            if shape(feature["geometry"]).intersects(query_box):
                props = feature["properties"]
                props["PARCEL_ID"] = props.get("PIN") or props.get("PARCEL_ID") or f"p_{i}"
                matched.append(feature)
        except Exception:
            continue

    print(f"[PARCELS] {len(matched)} matched")
    return jsonify({"type": "FeatureCollection", "features": matched})

if __name__ == "__main__":
    app.run(debug=True, port=5000)