import os
import urllib.request
import json

base = os.getenv("FOODIE_URL", "http://127.0.0.1:8000").rstrip("/")
print(f"Connecting to {base}...")

with urllib.request.urlopen(base + "/api/health", timeout=15) as resp:
    data = json.loads(resp.read().decode())
    assert data.get("status") == "ok", data
    print("✓ Health check passed:", data)

with urllib.request.urlopen(base + "/api/locations", timeout=15) as resp:
    loc_data = json.loads(resp.read().decode())
    assert "locations" in loc_data, loc_data
    print(f"✓ Locations check passed: {loc_data.get('locations')}")

with urllib.request.urlopen(base + "/assets/app.js", timeout=15) as resp:
    content = resp.read()
    assert len(content) > 1000
    print("✓ Static asset app.js loaded successfully")

print("All smoke tests passed!")
