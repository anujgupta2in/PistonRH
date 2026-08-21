"""
reports.py - Report generation for the ME Piston Component Running Hours system.
"""

import io
import pandas as pd
from datetime import datetime

from database import (
    get_all_components, get_all_cylinders, get_movement_log,
    get_monthly_rh_log, get_alert_config, get_vessel_settings,
    get_latest_me_rh, get_app_state,
)
from calculations import (
    build_dashboard_data, compute_component_rh_in_service,
    get_alert_status, compute_rh_since_last_dismantling,
    compute_rh_since_last_overhaul,
)

MONTH_NAMES = {
    1:"Jan",2:"Feb",3:"Mar",4:"Apr",5:"May",6:"Jun",
    7:"Jul",8:"Aug",9:"Sep",10:"Oct",11:"Nov",12:"Dec"
}


def _vid():
    return get_app_state().get("active_vessel_id")


def monthly_report_df():
    rows = get_monthly_rh_log(limit=120)
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    df["Period"] = df.apply(lambda r: f"{MONTH_NAMES[int(r['month'])]} {int(r['year'])}", axis=1)
    df = df[["Period","me_total_rh","monthly_rh","remarks"]].copy()
    df.columns = ["Period","ME Total RH","Monthly RH","Remarks"]
    return df.reset_index(drop=True)


def cylinder_report_df():
    data = build_dashboard_data()
    rows = []
    for c in data["cylinder_status"]:
        rows.append({
            "Cylinder":             f"Cyl {c['cylinder']}",
            "Component ID":         c["component_id"],
            "Type":                 c["component_type"],
            "Condition":            c["condition"],
            "Total RH":             c["total_rh"],
            "RH Since Overhaul":    c["rh_since_overhaul"],
            "RH Since Dismantling": c["rh_since_dismantling"],
            "Overhaul Alert":       c["alert_status"],
            "Dismantling Alert":    c["dismantling_alert"],
        })
    return pd.DataFrame(rows)


def component_history_df(component_id=None):
    rows = get_movement_log(component_id=component_id, limit=500)
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    cols = ["movement_date","component_id","action","from_location",
            "to_location","me_rh","rh_added","remarks"]
    df = df[[c for c in cols if c in df.columns]].copy()
    df.columns = ["Date","Component","Action","From","To","ME RH","RH Added","Remarks"]
    return df.reset_index(drop=True)


def spare_inventory_df():
    current_me_rh = get_latest_me_rh()
    components    = get_all_components()
    cfg           = get_alert_config()
    rows = []
    for c in components:
        if c["current_status"] != "In Service":
            live_rh = compute_component_rh_in_service(c, current_me_rh)
            rows.append({
                "Component ID": c["component_id"],
                "Type":         c["component_type"],
                "Condition":    c["condition"],
                "Status":       c["current_status"],
                "Location":     c["current_location"],
                "Total RH":     round(live_rh, 0),
                "Alert":        get_alert_status(live_rh, cfg),
                "Remarks":      c.get("remarks",""),
            })
    return pd.DataFrame(rows)


def due_overdue_df():
    data   = build_dashboard_data()
    alerts = data["alerts"]
    if not alerts:
        return pd.DataFrame(columns=["Cylinder","Component ID","Alert Type","Status","Current RH","Limit"])
    df = pd.DataFrame(alerts)
    df.columns = ["Cylinder","Component ID","Alert Type","Status","Current RH","Limit"]
    return df


def full_component_df():
    current_me_rh = get_latest_me_rh()
    components    = get_all_components()
    cfg           = get_alert_config()
    rows = []
    for c in components:
        live_rh = compute_component_rh_in_service(c, current_me_rh)
        rows.append({
            "Component ID": c["component_id"],
            "Type":         c["component_type"],
            "Condition":    c["condition"],
            "Status":       c["current_status"],
            "Location":     c["current_location"],
            "Total RH":     round(live_rh, 0),
            "Alert":        get_alert_status(live_rh, cfg),
            "Remarks":      c.get("remarks",""),
        })
    return pd.DataFrame(rows)


def export_all_to_excel():
    vessel      = get_vessel_settings()
    vessel_name = vessel.get("vessel_name","Vessel")
    generated   = datetime.now().strftime("%Y-%m-%d %H:%M")
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        pd.DataFrame({
            "Report":    ["ME Piston Component Running Hours Record"],
            "Vessel":    [vessel_name],
            "Generated": [generated],
        }).to_excel(writer, sheet_name="Cover", index=False)
        mdf = monthly_report_df()
        if not mdf.empty:
            mdf.to_excel(writer, sheet_name="Monthly RH", index=False)
        cylinder_report_df().to_excel(writer, sheet_name="Cylinder Status", index=False)
        full_component_df().to_excel(writer, sheet_name="Component Master", index=False)
        sdf = spare_inventory_df()
        if not sdf.empty:
            sdf.to_excel(writer, sheet_name="Spare Inventory", index=False)
        hdf = component_history_df()
        if not hdf.empty:
            hdf.to_excel(writer, sheet_name="Movement Log", index=False)
        adf = due_overdue_df()
        if not adf.empty:
            adf.to_excel(writer, sheet_name="Alerts", index=False)
    return output.getvalue()


def export_component_history_excel(component_id):
    output = io.BytesIO()
    df = component_history_df(component_id)
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name=f"History_{component_id}", index=False)
    return output.getvalue()
