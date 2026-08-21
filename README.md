# ME Piston Component Running Hours Record System

A Streamlit application for tracking Main Engine piston component running hours across vessels.

## Features
- Multi-vessel management with setup wizard
- Real-time RH calculation: Component RH = Current ME RH − Fitted-at ME RH
- Component movement log with automatic RH crediting
- Alerts for overhaul due / warning thresholds
- Dashboard, reports, Excel export

## Demo
Runs on Streamlit Community Cloud with seeded demo data (MT. BOCHEM MARENGO).
Data resets on each redeploy — suitable for demonstration purposes.

## Run locally
```bash
pip install -r requirements.txt
streamlit run app.py
```
