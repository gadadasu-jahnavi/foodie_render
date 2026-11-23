#!/usr/bin/env bash
cd "$(dirname "$0")/backend" || exit 1
[ -d venv ] || python3 -m venv venv
. venv/bin/activate
pip install -q -r requirements.txt
echo "Foodie running on http://localhost:${PORT:-5000}   (admin: /admin/)"
python app.py
