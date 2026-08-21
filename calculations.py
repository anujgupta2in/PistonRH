"""
calculations.py - Running hour computations and alert logic.
"""

from database import (
    get_all_cylinders, get_all_components, get_alert_config,
    get_vessel_settings, get_latest_me_rh, get_app_state
)


def compute_rh_since_last_overhaul(cyl, current_me_rh):
    last_oh = cyl.get("last_overhaul_rh") or 0.0
    return max(0.0, current_me_rh - last_oh)


def compute_rh_since_last_dismantling(cyl, current_me_rh):
    last_dm = cyl.get("last_dismantling_rh") or 0.0
    return max(0.0, current_me_rh - last_dm)


def compute_component_rh_in_service(comp, current_me_rh):
    base = comp.get("total_accumulated_rh") or 0.0
    if comp.get("current_status") == "In Service":
        fitted_at = comp.get("fitted_at_me_rh")
        if fitted_at is not None:
            base += max(0.0, current_me_rh - fitted_at)
    return base


def get_alert_status(total_rh, cfg):
    overhaul = cfg.get("crown_overhaul_rh", 24000)
    warning  = cfg.get("crown_warning_rh",  20000)
    if total_rh >= overhaul:
        return "Overdue"
    elif total_rh >= overhaul * 0.9:
        return "Due"
    elif total_rh >= warning:
        return "Warning"
    return "OK"


def get_dismantling_alert(rh_since_dismantling, cfg):
    limit = cfg.get("dismantling_warning_rh", 16000)
    if rh_since_dismantling >= limit:
        return "Due"
    elif rh_since_dismantling >= limit * 0.85:
        return "Warning"
    return "OK"


def build_dashboard_data(vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")

    current_me_rh = get_latest_me_rh(vessel_id)
    cfg           = get_alert_config(vessel_id)
    cylinders     = get_all_cylinders(vessel_id)
    components    = get_all_components(vessel_id)

    cyl_status = []
    alerts     = []

    for cyl in cylinders:
        comp_id  = cyl.get("fitted_component_id")
        comp_obj = next((c for c in components if c["component_id"] == comp_id), None)

        if comp_obj:
            live_total_rh = compute_component_rh_in_service(comp_obj, current_me_rh)
            rh_since_dm   = compute_rh_since_last_dismantling(cyl, current_me_rh)
            rh_since_oh   = compute_rh_since_last_overhaul(cyl, current_me_rh)
            alert_status  = get_alert_status(live_total_rh, cfg)
            dm_alert      = get_dismantling_alert(rh_since_dm, cfg)

            if alert_status in ("Due", "Overdue", "Warning"):
                alerts.append({
                    "cylinder":     cyl["cylinder_number"],
                    "component_id": comp_id,
                    "type":         "Crown RH Overhaul",
                    "status":       alert_status,
                    "total_rh":     live_total_rh,
                    "limit":        cfg["crown_overhaul_rh"],
                })
            if dm_alert in ("Due", "Warning"):
                alerts.append({
                    "cylinder":     cyl["cylinder_number"],
                    "component_id": comp_id,
                    "type":         "Dismantling Routine",
                    "status":       dm_alert,
                    "total_rh":     rh_since_dm,
                    "limit":        cfg["dismantling_warning_rh"],
                })
        else:
            live_total_rh = 0.0
            rh_since_dm   = 0.0
            rh_since_oh   = 0.0
            alert_status  = "OK"
            dm_alert      = "OK"

        cyl_status.append({
            "cylinder":               cyl["cylinder_number"],
            "component_id":           comp_id or "— Empty —",
            "condition":              comp_obj["condition"] if comp_obj else "—",
            "component_type":         comp_obj["component_type"] if comp_obj else "—",
            "total_rh":               round(live_total_rh, 0),
            "rh_since_overhaul":      round(rh_since_oh, 0),
            "rh_since_dismantling":   round(rh_since_dm, 0),
            "alert_status":           alert_status,
            "dismantling_alert":      dm_alert,
        })

    spare_components = [
        {**c, "live_total_rh": compute_component_rh_in_service(c, current_me_rh)}
        for c in components if c["current_status"] == "Onboard Spare"
    ]
    ashore_components = [
        {**c, "live_total_rh": compute_component_rh_in_service(c, current_me_rh)}
        for c in components
        if c["current_status"] in ("Landed Ashore", "Under Reconditioning")
    ]

    return {
        "current_me_rh":    current_me_rh,
        "cylinder_status":  cyl_status,
        "spare_components": spare_components,
        "ashore_components": ashore_components,
        "alerts":           alerts,
        "alert_config":     cfg,
    }
