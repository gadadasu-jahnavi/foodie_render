@echo off
cd /d "%~dp0backend"
if not exist venv python -m venv venv
call venv\Scripts\activate
pip install -q -r requirements.txt
echo Foodie running on http://localhost:5000   (admin: /admin/)
python app.py
