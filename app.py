"""
app.py - Main Streamlit application for ME Piston Component Running Hours Record.
Supports multiple vessels with a full new-vessel setup wizard.

Run with:  streamlit run app.py
"""

import streamlit as st
import pandas as pd
from datetime import datetime, date

import database as db
import calculations as calc
import reports
import import_excel as imp_xl

# ─── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="ME Piston RH Record",
    page_icon="⚙️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Custom CSS ───────────────────────────────────────────────────────────────
st.markdown("""
<style>
    [data-testid="stSidebar"] { background: #111827 !important; }
    [data-testid="stSidebar"] * { color: #d1d5db !important; }
    [data-testid="stSidebar"] .stRadio label { color: #d1d5db !important; font-size:14px; }
    [data-testid="stSidebar"] h1,
    [data-testid="stSidebar"] h2,
    [data-testid="stSidebar"] h3 { color: #f9fafb !important; }
    [data-testid="stSidebar"] .stMarkdown p { color: #9ca3af !important; font-size:12px; }
    [data-testid="stSidebar"] hr { border-color: #1f2937 !important; }

    .metric-card { background:white; border-radius:10px; padding:16px 20px;
                   border:0.5px solid #e5e7eb; border-left:4px solid #3b82f6; margin-bottom:10px; }
    .metric-card h3 { color:#6b7280; font-size:12px; margin:0 0 4px 0;
                      text-transform:uppercase; letter-spacing:.5px; }
    .metric-card p  { color:#111827; font-size:28px; font-weight:700; margin:0; }
    .metric-card.danger  { border-left-color:#ef4444; }
    .metric-card.success { border-left-color:#22c55e; }
    .metric-card.warning { border-left-color:#eab308; }

    .badge-ok      { background:#dcfce7; color:#166534; padding:3px 10px;
                     border-radius:12px; font-size:12px; display:inline-block; }
    .badge-warning { background:#fef9c3; color:#854d0e; padding:3px 10px;
                     border-radius:12px; font-size:12px; display:inline-block; }
    .badge-due     { background:#fee2e2; color:#991b1b; padding:3px 10px;
                     border-radius:12px; font-size:12px; display:inline-block; }
    .badge-overdue { background:#ede9fe; color:#5b21b6; padding:3px 10px;
                     border-radius:12px; font-size:12px; display:inline-block; }

    .section-header { color:#374151; font-size:13px; font-weight:600;
                      text-transform:uppercase; letter-spacing:.6px;
                      border-bottom:1px solid #e5e7eb; padding-bottom:6px;
                      margin:20px 0 14px 0; }

    .cyl-card { background:white; border:0.5px solid #e5e7eb; border-radius:10px;
                padding:14px; text-align:center; }
    .cyl-num  { font-size:10px; color:#9ca3af; text-transform:uppercase;
                letter-spacing:.4px; margin-bottom:4px; }
    .cyl-comp { font-size:13px; font-weight:600; color:#111827; margin-bottom:2px; }
    .cyl-cond { font-size:11px; color:#6b7280; margin-bottom:6px; }
    .cyl-rh   { font-size:18px; font-weight:700; color:#111827; }
    .cyl-sub  { font-size:10px; color:#9ca3af; margin-top:2px; }

    .rh-bar-wrap { background:#f3f4f6; border-radius:4px; height:5px;
                   overflow:hidden; margin:6px 0 4px; }
    .rh-bar      { height:100%; border-radius:4px; }

    .wizard-step { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;
                   padding:24px; margin-bottom:16px; }
    .wizard-step h3 { color:#1e293b; margin-bottom:16px; }
    .step-badge { background:#3b82f6; color:white; border-radius:50%;
                  width:28px; height:28px; display:inline-flex;
                  align-items:center; justify-content:center;
                  font-size:13px; font-weight:700; margin-right:8px; }
    .vessel-card { background:white; border:1px solid #e2e8f0; border-radius:10px;
                   padding:16px 20px; margin-bottom:10px; cursor:pointer; }
    .vessel-card:hover { border-color:#3b82f6; background:#f0f7ff; }
    .vessel-card.active { border-color:#3b82f6; border-width:2px;
                          background:#eff6ff; }
    footer { visibility:hidden; }
</style>
""", unsafe_allow_html=True)

# ─── Init DB ──────────────────────────────────────────────────────────────────
db.initialize_database()
# Always seed demo vessel if none exist — ensures demo data on Community Cloud
db.seed_demo_vessel()
# Auto-repair: recalculate component RH from movement log on every startup
_state = db.get_app_state()
if _state.get("active_vessel_id"):
    db.recalculate_all_component_rh(_state["active_vessel_id"])

# ─── Constants ────────────────────────────────────────────────────────────────
ALERT_BADGE = {
    "OK":      '<span class="badge-ok">OK</span>',
    "Warning": '<span class="badge-warning">⚠ Warning</span>',
    "Due":     '<span class="badge-due">🔴 Due</span>',
    "Overdue": '<span class="badge-overdue">🟣 Overdue</span>',
}
# Component type hierarchy — grouped for clarity
# Piston Assembly
#   └─ Piston Crown, Piston Ring No.1–4, Piston Rod
# Fuel Valve Assembly
#   └─ Fuel Valve, Fuel Valve Nozzle, Fuel Valve Spindle, Fuel Valve Spring
# Exhaust Valve Assembly
#   └─ Exhaust Valve, Exhaust Valve Spindle, Exhaust Valve Seat,
#      Exhaust Valve Bottom Piece, Exhaust Valve Spring
# Cylinder Assembly
#   └─ Cylinder Liner, Cylinder Cover, Cylinder Head
# Bearings
#   └─ Crosshead Bearing, Con Rod Bearing, Main Bearing, Thrust Bearing
# Other
#   └─ Starting Air Valve, Safety Valve, Turbocharger Rotor, Other

COMPONENT_TYPES = [
    # ── Piston Assembly ───────────────────────────────────────────────────────
    "Piston Crown",
    "Piston Ring No.1",
    "Piston Ring No.2",
    "Piston Ring No.3",
    "Piston Ring No.4",
    "Piston Rod",
    # ── Fuel Valve Assembly ───────────────────────────────────────────────────
    "Fuel Valve",
    "Fuel Valve Nozzle",
    "Fuel Valve Spindle",
    "Fuel Valve Spring",
    "Fuel Valve Seat",
    # ── Exhaust Valve Assembly ────────────────────────────────────────────────
    "Exhaust Valve",
    "Exhaust Valve Spindle",
    "Exhaust Valve Seat",
    "Exhaust Valve Bottom Piece",
    "Exhaust Valve Spring",
    "Exhaust Valve O-Ring Set",
    # ── Cylinder Assembly ─────────────────────────────────────────────────────
    "Cylinder Liner",
    "Cylinder Cover",
    "Cylinder Head",
    # ── Bearings ──────────────────────────────────────────────────────────────
    "Crosshead Bearing",
    "Con Rod Bearing",
    "Main Bearing",
    "Thrust Bearing",
    # ── Air / Safety Valves ───────────────────────────────────────────────────
    "Starting Air Valve",
    "Safety Valve",
    "Indicator Valve",
    # ── Turbocharger ─────────────────────────────────────────────────────────
    "Turbocharger Rotor",
    "Turbocharger Bearing",
    "Turbocharger Nozzle Ring",
    # ── Other ─────────────────────────────────────────────────────────────────
    "Other",
]

# Type-to-group mapping for display grouping in reports
COMPONENT_GROUPS = {
    "Piston Crown":               "Piston Assembly",
    "Piston Ring No.1":           "Piston Assembly",
    "Piston Ring No.2":           "Piston Assembly",
    "Piston Ring No.3":           "Piston Assembly",
    "Piston Ring No.4":           "Piston Assembly",
    "Piston Rod":                 "Piston Assembly",
    "Fuel Valve":                 "Fuel Valve Assembly",
    "Fuel Valve Nozzle":          "Fuel Valve Assembly",
    "Fuel Valve Spindle":         "Fuel Valve Assembly",
    "Fuel Valve Spring":          "Fuel Valve Assembly",
    "Fuel Valve Seat":            "Fuel Valve Assembly",
    "Exhaust Valve":              "Exhaust Valve Assembly",
    "Exhaust Valve Spindle":      "Exhaust Valve Assembly",
    "Exhaust Valve Seat":         "Exhaust Valve Assembly",
    "Exhaust Valve Bottom Piece": "Exhaust Valve Assembly",
    "Exhaust Valve Spring":       "Exhaust Valve Assembly",
    "Exhaust Valve O-Ring Set":   "Exhaust Valve Assembly",
    "Cylinder Liner":             "Cylinder Assembly",
    "Cylinder Cover":             "Cylinder Assembly",
    "Cylinder Head":              "Cylinder Assembly",
    "Crosshead Bearing":          "Bearings",
    "Con Rod Bearing":            "Bearings",
    "Main Bearing":               "Bearings",
    "Thrust Bearing":             "Bearings",
    "Starting Air Valve":         "Air & Safety Valves",
    "Safety Valve":               "Air & Safety Valves",
    "Indicator Valve":            "Air & Safety Valves",
    "Turbocharger Rotor":         "Turbocharger",
    "Turbocharger Bearing":       "Turbocharger",
    "Turbocharger Nozzle Ring":   "Turbocharger",
    "Other":                      "Other",
}
CONDITIONS = ["New","Original","Reconditioned"]
STATUSES   = ["In Service","Onboard Spare","Landed Ashore",
              "Under Reconditioning","Scrapped"]
ACTIONS    = db.VALID_ACTIONS

def fmt(v):
    try:
        return f"{int(v):,}"
    except Exception:
        return str(v)

def get_locations():
    return db.get_cylinder_locations()


# ═══════════════════════════════════════════════════════════════════════════════
# VESSEL SETUP WIZARD
# ═══════════════════════════════════════════════════════════════════════════════

def show_setup_wizard():
    """Full-screen wizard shown when no vessel is configured."""

    st.markdown("""
    <div style="text-align:center;padding:32px 0 16px">
      <div style="font-size:48px">⚙️</div>
      <h1 style="font-size:28px;font-weight:700;color:#111827;margin:8px 0 4px">
        ME Piston Running Hours Record
      </h1>
      <p style="color:#6b7280;font-size:15px">
        No vessel configured yet. Set up your first vessel to get started.
      </p>
    </div>
    """, unsafe_allow_html=True)

    all_vessels = db.get_all_vessels()

    col_left, col_right = st.columns([1, 1], gap="large")

    # ── Left: existing vessels ────────────────────────────────────────────────
    with col_left:
        if all_vessels:
            st.markdown("### 🚢 Existing Vessels")
            st.caption("Select a vessel to make it active.")
            for v in all_vessels:
                if st.button(
                    f"**{v['vessel_name']}**  \n"
                    f"IMO: {v.get('imo_number','—')} &nbsp;|&nbsp; "
                    f"{v.get('num_cylinders',6)} cylinders &nbsp;|&nbsp; "
                    f"{v.get('engine_make','—')}",
                    key=f"sel_vessel_{v['id']}",
                    use_container_width=True,
                ):
                    db.set_active_vessel(v["id"])
                    st.rerun()
        else:
            st.info("No vessels yet. Create one on the right →")

        st.divider()
        st.markdown("### 🎯 Load Demo Data")
        st.caption("Loads MT. BOCHEM MARENGO with seeded component and RH data.")
        if st.button("Load Demo Vessel", use_container_width=True):
            db.seed_demo_vessel()
            st.success("Demo vessel loaded!")
            st.rerun()

    # ── Right: create new vessel ──────────────────────────────────────────────
    with col_right:
        st.markdown("### ➕ Create New Vessel")
        with st.form("create_vessel_form", clear_on_submit=True):
            st.markdown("**Vessel Information**")
            c1, c2 = st.columns(2)
            with c1:
                v_name  = st.text_input("Vessel Name *", placeholder="MT. EXAMPLE")
                v_imo   = st.text_input("IMO Number",    placeholder="9876543")
                v_type  = st.text_input("Vessel Type",   placeholder="Chemical Tanker")
            with c2:
                v_make  = st.text_input("Engine Make",   placeholder="MAN B&W")
                v_model = st.text_input("Engine Model",  placeholder="6S50MC-C")
                v_cyls  = st.number_input("No. of Cylinders *", value=6,
                                          min_value=1, max_value=12, step=1)

            st.markdown("**Alert Thresholds**")
            t1, t2, t3 = st.columns(3)
            with t1:
                t_oh = st.number_input("Overhaul Due (RH)",   value=24000, step=500)
            with t2:
                t_wn = st.number_input("Warning At (RH)",     value=20000, step=500)
            with t3:
                t_dm = st.number_input("Dismantling Warn (RH)", value=16000, step=500)

            submitted = st.form_submit_button("✅ Create Vessel & Continue",
                                              type="primary", use_container_width=True)
            if submitted:
                if not v_name.strip():
                    st.error("Vessel name is required.")
                else:
                    vid = db.create_vessel(
                        v_name.strip(), v_imo, v_type, v_make, v_model,
                        int(v_cyls), int(t_oh), int(t_wn), int(t_dm)
                    )
                    db.set_active_vessel(vid)
                    st.success(f"Vessel '{v_name}' created! Proceeding to setup…")
                    st.rerun()


# ═══════════════════════════════════════════════════════════════════════════════
# VESSEL SETUP PAGE  (post-creation guided setup)
# ═══════════════════════════════════════════════════════════════════════════════

def show_vessel_setup_page(vessel):
    """Step-by-step setup: initial ME RH → add components → configure cylinders."""

    vid  = vessel["id"]
    ncyl = vessel.get("num_cylinders", 6)

    st.title(f"🛠️ Vessel Setup — {vessel['vessel_name']}")
    st.caption("Complete all steps to finish initial setup. You can return here any time via Settings.")

    step = st.session_state.get("setup_step", 1)

    # ── Step progress bar ─────────────────────────────────────────────────────
    steps = ["ME Running Hours", "Components", "Cylinder Assignment", "Done"]
    prog_cols = st.columns(len(steps))
    for i, (col, label) in enumerate(zip(prog_cols, steps)):
        num = i + 1
        active = num == step
        done   = num < step
        color  = "#3b82f6" if active else ("#22c55e" if done else "#d1d5db")
        col.markdown(
            f'<div style="text-align:center">'
            f'<div style="width:32px;height:32px;border-radius:50%;background:{color};'
            f'color:white;display:inline-flex;align-items:center;justify-content:center;'
            f'font-weight:700;font-size:13px">{num}</div>'
            f'<div style="font-size:11px;margin-top:4px;color:{"#111827" if active else "#9ca3af"}">'
            f'{label}</div></div>',
            unsafe_allow_html=True,
        )
    st.markdown("")

    # ── STEP 1: Initial ME Running Hours ──────────────────────────────────────
    if step == 1:
        with st.container():
            st.markdown('<div class="wizard-step">', unsafe_allow_html=True)
            st.markdown("### <span class='step-badge'>1</span> Set Initial ME Running Hours",
                        unsafe_allow_html=True)
            st.caption("Enter the ME total running hours at the start of record-keeping.")

            existing = db.get_monthly_rh_log(limit=1, vessel_id=vid)
            if existing:
                st.info(f"ME RH already set: **{fmt(existing[0]['me_total_rh'])}** "
                        f"({reports.MONTH_NAMES[existing[0]['month']]} {existing[0]['year']})")
                if st.button("Next →", type="primary"):
                    st.session_state["setup_step"] = 2
                    st.rerun()
            else:
                with st.form("setup_initial_rh"):
                    c1, c2 = st.columns(2)
                    with c1:
                        s_year  = st.number_input("Year",  value=datetime.now().year,
                                                  min_value=2000, max_value=2100)
                        s_month = st.selectbox("Month", list(range(1, 13)),
                                               format_func=lambda m:
                                               f"{m:02d} – {reports.MONTH_NAMES[m]}",
                                               index=datetime.now().month - 1)
                    with c2:
                        s_rh      = st.number_input("ME Total Running Hours",
                                                    value=0.0, min_value=0.0, step=100.0)
                        s_remarks = st.text_input("Remarks", value="Initial setup entry")
                    if st.form_submit_button("Save & Next →", type="primary"):
                        ok, msg = db.insert_monthly_rh(
                            int(s_year), int(s_month), float(s_rh), s_remarks, vessel_id=vid
                        )
                        if ok:
                            st.success(msg)
                            st.session_state["setup_step"] = 2
                            st.rerun()
                        else:
                            st.error(msg)
            st.markdown('</div>', unsafe_allow_html=True)

    # ── STEP 2: Add Components ────────────────────────────────────────────────
    elif step == 2:
        with st.container():
            st.markdown('<div class="wizard-step">', unsafe_allow_html=True)
            st.markdown("### <span class='step-badge'>2</span> Add Components",
                        unsafe_allow_html=True)
            st.caption("Register all piston crowns and rings — those in service and spares.")

            existing_comps = db.get_all_components(vessel_id=vid)
            if existing_comps:
                st.markdown(f"**{len(existing_comps)} component(s) registered:**")
                comp_df = pd.DataFrame([{
                    "ID": c["component_id"], "Type": c["component_type"],
                    "Condition": c["condition"], "Status": c["current_status"],
                    "Total RH": fmt(c["total_accumulated_rh"]),
                } for c in existing_comps])
                st.dataframe(comp_df, use_container_width=True, hide_index=True)

                # Delete component option
                del_id = st.selectbox("Remove component (optional)",
                                      ["—"] + [c["component_id"] for c in existing_comps])
                if del_id != "—":
                    if st.button(f"🗑️ Delete {del_id}", type="secondary"):
                        db.delete_component(del_id, vessel_id=vid)
                        st.success(f"Deleted {del_id}.")
                        st.rerun()

            st.divider()
            with st.form("setup_add_component", clear_on_submit=True):
                st.markdown("**Add a component:**")
                a1, a2, a3 = st.columns(3)
                with a1:
                    nc_id   = st.text_input("Component ID", placeholder="6033-1")
                    nc_type = st.selectbox("Type", COMPONENT_TYPES)
                with a2:
                    nc_rh   = st.number_input("Total Accumulated RH", value=0.0, min_value=0.0)
                    nc_cond = st.selectbox("Condition", CONDITIONS)
                with a3:
                    nc_stat = st.selectbox("Status", STATUSES, index=1)
                    nc_rem  = st.text_input("Remarks")
                if st.form_submit_button("➕ Add Component", type="primary"):
                    if not nc_id.strip():
                        st.error("Component ID required.")
                    else:
                        if auto_mode and nc_stat == "In Service":
                            fat_val = locals().get("nc_fat", 0.0)
                            # Base RH = 0; live RH is calculated as (current_me - fitted_at)
                            ok, msg = db.insert_component(
                                nc_id.strip(), nc_type, 0.0, nc_cond,
                                "In Service", "Onboard Spare", nc_rem, vessel_id=vid
                            )
                            if ok:
                                db.update_component_fitted_at(nc_id.strip(), fat_val, vessel_id=vid)
                                live_show = max(0.0, initial_me_rh - fat_val)
                                st.success(f"Added. Live RH = {fmt(live_show)}")
                                st.rerun()
                            else:
                                st.error(msg)
                        else:
                            rh_val = float(locals().get("nc_rh", 0.0))
                            ok, msg = db.insert_component(
                                nc_id.strip(), nc_type, rh_val, nc_cond,
                                nc_stat, "Onboard Spare", nc_rem, vessel_id=vid
                            )
                            if ok:
                                st.success(msg)
                                st.rerun()
                            else:
                                st.error(msg)
            st.markdown('</div>', unsafe_allow_html=True)

        col_back, _ = st.columns([1, 4])
        if col_back.button("← Back"):
            st.session_state["setup_step"] = 1
            st.rerun()

    # ── STEP 3: Cylinder Assignment ───────────────────────────────────────────
    elif step == 3:
        st.markdown('<div class="wizard-step">', unsafe_allow_html=True)
        st.markdown("### <span class='step-badge'>3</span> Cylinder Assignment",
                    unsafe_allow_html=True)
        st.caption("For each cylinder, select the fitted component and enter RH records.")

        components = db.get_all_components(vessel_id=vid)
        comp_ids   = [c["component_id"] for c in components]
        me_rh      = db.get_latest_me_rh(vessel_id=vid)
        cylinders  = db.get_all_cylinders(vessel_id=vid)

        st.info(
            "Current ME Total RH = " + fmt(me_rh) + ". "
            "Enter the ME RH when each component was last fitted. "
            "Component RH = Current ME RH minus Fitted-at ME RH. "
            "Example: fitted at ME 10000, current ME 12500 = component has 2500 RH."
        )

        for cyl in cylinders:
            cyl_num     = cyl["cylinder_number"]
            current_fit = cyl.get("fitted_component_id") or ""
            current_fat = float(cyl.get("fitted_at_me_rh") or 0)
            live_preview = max(0.0, me_rh - current_fat) if current_fit else 0.0

            with st.expander(
                f"Cylinder {cyl_num}  —  "
                f"{'✅ ' + current_fit + f' ({fmt(live_preview)} RH)' if current_fit else '⚠️ Empty'}",
                expanded=not bool(current_fit),
            ):
                with st.form(f"cyl_setup_{cyl_num}"):
                    col1, col2 = st.columns(2)
                    with col1:
                        sel_comp = st.selectbox(
                            "Fitted Component",
                            ["— None —"] + comp_ids,
                            index=(comp_ids.index(current_fit) + 1)
                            if current_fit in comp_ids else 0,
                            key=f"cs_comp_{cyl_num}",
                        )
                        fitted_at = st.number_input(
                            "ME RH when component was fitted (start of accumulation)",
                            value=current_fat,
                            min_value=0.0, key=f"cs_fat_{cyl_num}",
                            help="Enter the ME running hours at the time this component was fitted. "
                                 "Component RH = Current ME RH − this value.",
                        )
                        if me_rh > 0:
                            st.caption(f"→ Component will show **{fmt(max(0, me_rh - fitted_at))} RH** accumulated")
                    with col2:
                        last_oh = st.number_input(
                            "Last Overhaul ME RH",
                            value=float(cyl.get("last_overhaul_rh") or 0),
                            min_value=0.0, key=f"cs_oh_{cyl_num}",
                            help="ME RH at last piston overhaul on this cylinder.",
                        )
                        last_dm = st.number_input(
                            "Last Dismantling ME RH",
                            value=float(cyl.get("last_dismantling_rh") or 0),
                            min_value=0.0, key=f"cs_dm_{cyl_num}",
                            help="ME RH at last crown dismantling on this cylinder.",
                        )
                    if st.form_submit_button(f"💾 Save Cylinder {cyl_num}"):
                        fid = sel_comp if sel_comp != "— None —" else None
                        db.update_cylinder(
                            cyl_num, fid, fitted_at, last_oh, last_dm, vessel_id=vid
                        )
                        st.success(f"Cylinder {cyl_num} saved. Component RH = {fmt(max(0, me_rh - fitted_at))}")
                        st.rerun()

        st.markdown('</div>', unsafe_allow_html=True)
        col_back, _, col_finish = st.columns([1, 3, 1])
        if col_back.button("← Back"):
            st.session_state["setup_step"] = 2
            st.rerun()
        if col_finish.button("✅ Finish Setup →", type="primary"):
            st.session_state["setup_step"] = 4
            st.rerun()

    # ── STEP 4: Done ──────────────────────────────────────────────────────────
    elif step == 4:
        st.success("## 🎉 Setup Complete!")
        components = db.get_all_components(vessel_id=vid)
        cylinders  = db.get_all_cylinders(vessel_id=vid)
        fitted     = sum(1 for c in cylinders if c.get("fitted_component_id"))
        me_rh      = db.get_latest_me_rh(vessel_id=vid)

        c1, c2, c3 = st.columns(3)
        c1.metric("Components Registered", len(components))
        c2.metric("Cylinders Fitted", f"{fitted}/{len(cylinders)}")
        c3.metric("Initial ME RH", fmt(me_rh))

        if st.button("🚀 Go to Dashboard", type="primary", use_container_width=True):
            st.session_state.pop("setup_step", None)
            st.rerun()


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN APP (vessel selected, fully set up)
# ═══════════════════════════════════════════════════════════════════════════════

def show_main_app(vessel):
    # Always re-fetch from DB so we never display stale vessel data
    vid     = vessel["id"]
    vessel  = db.get_vessel(vid)          # fresh read every rerun
    ncyl    = vessel.get("num_cylinders", 6)
    LOCATIONS = db.get_cylinder_locations(vid)

    # ── Sidebar ───────────────────────────────────────────────────────────────
    with st.sidebar:
        st.markdown(
            '<div style="font-size:18px;font-weight:700;color:#f9fafb;'
            'display:flex;align-items:center;gap:8px;margin-bottom:4px">'
            '⚙️ ME Piston RH</div>',
            unsafe_allow_html=True,
        )
        st.markdown(
            f'<div style="font-size:13px;font-weight:600;color:#93c5fd;margin-bottom:2px">'
            f'{vessel["vessel_name"]}</div>',
            unsafe_allow_html=True,
        )
        st.markdown(
            f'<div style="font-size:11px;color:#6b7280;margin-bottom:12px">'
            f'ME RH: {fmt(db.get_latest_me_rh(vid))}</div>',
            unsafe_allow_html=True,
        )

        # Vessel switcher
        all_vessels = db.get_all_vessels()
        if len(all_vessels) > 1:
            vessel_names = [v["vessel_name"] for v in all_vessels]
            cur_idx = next((i for i, v in enumerate(all_vessels) if v["id"] == vid), 0)
            chosen = st.selectbox("Switch vessel", vessel_names, index=cur_idx,
                                  label_visibility="collapsed")
            chosen_vessel = next(v for v in all_vessels if v["vessel_name"] == chosen)
            if chosen_vessel["id"] != vid:
                db.set_active_vessel(chosen_vessel["id"])
                st.rerun()

        st.divider()
        page = st.radio(
            "Navigation",
            ["📊 Dashboard", "🗓️ Monthly RH Entry", "🔩 Component Master",
             "🔧 Cylinder Setup", "🔄 Component Movement", "🚨 Alerts",
             "📋 Reports", "📥 Import Excel", "⚙️ Settings"],
            label_visibility="collapsed",
        )
        st.divider()
        if st.button("➕ New Vessel", use_container_width=True):
            st.session_state["force_new_vessel"] = True
            st.rerun()

    # ═════════════════════════════════════════════════════════════════════════
    # PAGES
    # ═════════════════════════════════════════════════════════════════════════

    # ── DASHBOARD ─────────────────────────────────────────────────────────────
    if page == "📊 Dashboard":
        st.title("📊 Dashboard")
        data  = calc.build_dashboard_data(vid)
        cfg   = vessel

        c1, c2, c3, c4 = st.columns(4)
        latest_monthly  = db.get_monthly_rh_log(limit=1, vessel_id=vid)
        mrh             = latest_monthly[0]["monthly_rh"] if latest_monthly else 0
        alert_count     = len(data["alerts"])

        with c1:
            st.markdown(f'<div class="metric-card"><h3>ME Total Running Hours</h3>'
                        f'<p>{fmt(data["current_me_rh"])}</p></div>',
                        unsafe_allow_html=True)
        with c2:
            st.markdown(f'<div class="metric-card"><h3>Last Month RH</h3>'
                        f'<p>{fmt(mrh)}</p></div>',
                        unsafe_allow_html=True)
        with c3:
            cls = "danger" if alert_count else "success"
            st.markdown(f'<div class="metric-card {cls}"><h3>Active Alerts</h3>'
                        f'<p>{alert_count}</p></div>',
                        unsafe_allow_html=True)
        with c4:
            spares = len(data["spare_components"])
            st.markdown(f'<div class="metric-card"><h3>Spare Crowns Onboard</h3>'
                        f'<p>{spares}</p></div>',
                        unsafe_allow_html=True)

        st.markdown("")
        st.markdown('<div class="section-header">Cylinder-wise Fitted Component Status</div>',
                    unsafe_allow_html=True)

        cols = st.columns(ncyl or 6)
        for idx, cyl in enumerate(data["cylinder_status"]):
            if idx >= len(cols):
                break
            badge     = ALERT_BADGE.get(cyl["alert_status"], "")
            overhaul  = data["alert_config"]["crown_overhaul_rh"]
            bar_pct   = min(100, int(cyl["total_rh"] / overhaul * 100)) if overhaul else 0
            bar_color = ("#22c55e" if cyl["alert_status"] == "OK"
                         else "#eab308" if cyl["alert_status"] == "Warning"
                         else "#ef4444")
            with cols[idx]:
                st.markdown(f"""
                <div class="cyl-card">
                  <div class="cyl-num">Cylinder {cyl['cylinder']}</div>
                  <div class="cyl-comp">{cyl['component_id']}</div>
                  <div class="cyl-cond">{cyl['condition']}</div>
                  <div class="cyl-rh">{fmt(cyl['total_rh'])}</div>
                  <div class="cyl-sub">Since OH: {fmt(cyl['rh_since_overhaul'])}</div>
                  <div class="cyl-sub">Since DM: {fmt(cyl['rh_since_dismantling'])}</div>
                  <div class="rh-bar-wrap">
                    <div class="rh-bar" style="width:{bar_pct}%;background:{bar_color}"></div>
                  </div>
                  {badge}
                </div>""", unsafe_allow_html=True)

        if data["alerts"]:
            st.markdown('<div class="section-header">🚨 Active Alerts</div>',
                        unsafe_allow_html=True)
            adf = pd.DataFrame(data["alerts"])
            adf.columns = ["Cylinder","Component","Alert Type","Status","Current RH","Limit RH"]
            st.dataframe(adf, use_container_width=True, hide_index=True)

        st.markdown('<div class="section-header">🗄️ Onboard Spare Components</div>',
                    unsafe_allow_html=True)
        if data["spare_components"]:
            spare_rows = []
            for c in data["spare_components"]:
                spare_rows.append({
                    "Component ID": c["component_id"],
                    "Type":         c["component_type"],
                    "Condition":    c["condition"],
                    "Status":       c["current_status"],
                    "Total RH":     int(round(c["live_total_rh"])),
                })
            st.dataframe(pd.DataFrame(spare_rows), use_container_width=True, hide_index=True)
        else:
            st.info("No spare components onboard.")

        if data["ashore_components"]:
            st.markdown('<div class="section-header">🏭 Components Ashore / Under Reconditioning</div>',
                        unsafe_allow_html=True)
            st.dataframe(pd.DataFrame([{
                "Component ID": c["component_id"], "Type": c["component_type"],
                "Status": c["current_status"], "Location": c["current_location"],
                "Total RH": fmt(c["live_total_rh"]),
            } for c in data["ashore_components"]]), use_container_width=True, hide_index=True)

    # ── MONTHLY RH ─────────────────────────────────────────────────────────────
    elif page == "🗓️ Monthly RH Entry":
        st.title("🗓️ Monthly Running Hour Entry")
        latest_rh = db.get_latest_me_rh(vid)
        st.info(f"Current ME Total Running Hours: **{fmt(latest_rh)}**")

        with st.form("monthly_rh_form", clear_on_submit=True):
            st.subheader("Add New Monthly Entry")
            col1, col2 = st.columns(2)
            with col1:
                year  = st.number_input("Year", value=datetime.now().year,
                                        min_value=2000, max_value=2100, step=1)
                month = st.selectbox("Month", list(range(1, 13)),
                                     format_func=lambda m:
                                     f"{m:02d} – {reports.MONTH_NAMES[m]}",
                                     index=datetime.now().month - 1)
            with col2:
                me_total_rh = st.number_input(
                    "ME Total Running Hours (cumulative)",
                    value=float(latest_rh), min_value=0.0, step=10.0)
                remarks = st.text_input("Remarks (optional)")
            projected = max(0.0, me_total_rh - latest_rh)
            st.markdown(f"**Projected Monthly RH:** `{projected:.0f}` hours")
            if st.form_submit_button("✅ Save Entry", type="primary"):
                ok, msg = db.insert_monthly_rh(int(year), int(month),
                                               float(me_total_rh), remarks,
                                               vessel_id=vid)
                if ok:
                    st.success(msg); st.rerun()
                else:
                    st.error(msg)

        st.divider()
        st.subheader("📜 Running Hour Log (last 24 months)")
        log = pd.DataFrame(db.get_monthly_rh_log(vessel_id=vid))
        if not log.empty:
            log["Period"] = log.apply(
                lambda r: f"{reports.MONTH_NAMES[int(r['month'])]} {int(r['year'])}", axis=1
            )
            show = log[["Period","me_total_rh","monthly_rh","remarks"]].copy()
            show.columns = ["Period","ME Total RH","Monthly RH","Remarks"]
            st.dataframe(show, use_container_width=True, hide_index=True)

    # ── COMPONENT MASTER ───────────────────────────────────────────────────────
    elif page == "🔩 Component Master":
        st.title("🔩 Component Master")
        current_me_rh_cm = db.get_latest_me_rh(vid)

        tab_list, tab_add, tab_edit, tab_del = st.tabs(
            ["📋 All Components", "➕ Add Component", "✏️ Edit / Adjust RH", "🗑️ Delete"]
        )

        # ── All Components ────────────────────────────────────────────────────
        with tab_list:
            comp_df = reports.full_component_df()
            if not comp_df.empty:
                # Add group column
                comp_df.insert(1, "Group",
                    comp_df["Type"].map(COMPONENT_GROUPS).fillna("Other"))

                # Group filter
                all_groups = ["All Groups"] + sorted(comp_df["Group"].unique().tolist())
                filter_group = st.selectbox("Filter by Assembly Group", all_groups,
                                            key="comp_group_filter")
                if filter_group != "All Groups":
                    comp_df = comp_df[comp_df["Group"] == filter_group]

                st.caption(
                    f"Showing {len(comp_df)} component(s) | "
                    f"Current ME RH = {fmt(current_me_rh_cm)}"
                )

                def hl(val):
                    m = {"OK":      "background-color:#dcfce7;color:#166534",
                         "Warning": "background-color:#fef9c3;color:#854d0e",
                         "Due":     "background-color:#fee2e2;color:#991b1b",
                         "Overdue": "background-color:#ede9fe;color:#5b21b6"}
                    return m.get(val, "")
                try:
                    styled = comp_df.style.map(hl, subset=["Alert"])
                except AttributeError:
                    styled = comp_df.style.applymap(hl, subset=["Alert"])
                st.dataframe(styled, use_container_width=True, hide_index=True)
            else:
                st.info("No components found. Use 'Add Component' to register components.")

        # ── Add Component ─────────────────────────────────────────────────────
        with tab_add:
            st.subheader("Add New Component")
            rh_mode_add = st.radio(
                "How to set Running Hours:",
                ["🔄 Auto — calculate from ME RH (for In Service)",
                 "✏️ Manual — enter total RH directly"],
                horizontal=True, key="add_rh_mode",
            )
            auto_add = rh_mode_add.startswith("🔄")
            if auto_add:
                st.info(
                    f"Current ME Total RH = **{fmt(current_me_rh_cm)}**.  "
                    "For In Service components, enter the ME RH when the crown was fitted.  "
                    "Component RH = Current ME RH minus Fitted-at ME RH."
                )

            with st.form("add_comp_form", clear_on_submit=True):
                col1, col2, col3 = st.columns(3)
                with col1:
                    nc_id   = st.text_input("Component ID *", placeholder="6033-1")
                    nc_type = st.selectbox("Component Type", COMPONENT_TYPES,
                                           help="Select the component type. "
                                                "Fuel Valve / Exhaust Valve assemblies are listed below Piston types.")
                    nc_cond = st.selectbox("Condition", CONDITIONS)
                with col2:
                    nc_stat = st.selectbox("Status", STATUSES, index=1)
                    nc_loc  = st.selectbox("Location", LOCATIONS,
                                           index=LOCATIONS.index("Onboard Spare")
                                           if "Onboard Spare" in LOCATIONS else 0)
                    if auto_add:
                        nc_fat_add = st.number_input(
                            "ME RH when component was fitted",
                            value=0.0, min_value=0.0,
                            help=f"Component RH = {fmt(current_me_rh_cm)} minus this value",
                        )
                    else:
                        nc_rh_add = st.number_input(
                            "Total Accumulated RH",
                            value=0.0, min_value=0.0,
                        )
                with col3:
                    nc_rem = st.text_area("Remarks", height=100)
                    if auto_add:
                        fat_prev = nc_fat_add if "nc_fat_add" in dir() else 0.0
                        st.metric("Calculated RH", fmt(max(0.0, current_me_rh_cm - fat_prev)))

                if st.form_submit_button("➕ Add Component", type="primary"):
                    if not nc_id.strip():
                        st.error("Component ID is required.")
                    else:
                        if auto_add and nc_stat == "In Service":
                            fat_v = locals().get("nc_fat_add", 0.0)
                            # Base RH = 0; live = current_me - fitted_at (no double count)
                            ok, msg = db.insert_component(
                                nc_id.strip(), nc_type, 0.0, nc_cond,
                                nc_stat, nc_loc, nc_rem, vessel_id=vid,
                            )
                            if ok:
                                db.update_component_fitted_at(nc_id.strip(), fat_v, vessel_id=vid)
                                live_show = max(0.0, current_me_rh_cm - fat_v)
                                st.success(f"Added. Live RH = {fmt(live_show)}")
                                st.rerun()
                            else:
                                st.error(msg)
                        else:
                            rh_val = float(locals().get("nc_rh_add", 0.0))
                            ok, msg = db.insert_component(
                                nc_id.strip(), nc_type, rh_val, nc_cond,
                                nc_stat, nc_loc, nc_rem, vessel_id=vid,
                            )
                            if ok:
                                st.success(f"{msg}  Total RH = {fmt(rh_val)}")
                                st.rerun()
                            else:
                                st.error(msg)

        # ── Edit / Adjust RH ──────────────────────────────────────────────────
        with tab_edit:
            st.subheader("Edit Component Details & Running Hours")
            all_comps_e = db.get_all_components(vessel_id=vid)
            ids_e = [c["component_id"] for c in all_comps_e]
            if not ids_e:
                st.info("No components found.")
            else:
                sel_id = st.selectbox("Select Component", ids_e)
                comp   = db.get_component(sel_id, vessel_id=vid)
                if comp:
                    # Live RH
                    fat = comp.get("fitted_at_me_rh")
                    if comp["current_status"] == "In Service" and fat is not None:
                        live_rh = comp["total_accumulated_rh"] + max(0, current_me_rh_cm - fat)
                    else:
                        live_rh = comp["total_accumulated_rh"]

                    # Info card
                    c_info1, c_info2, c_info3, c_info4 = st.columns(4)
                    c_info1.metric("Status", comp["current_status"])
                    c_info2.metric("Location", comp["current_location"])
                    c_info3.metric("Live Total RH", fmt(live_rh))
                    c_info4.metric("Fitted at ME RH", fmt(fat) if fat is not None else "—")

                    with st.form("edit_comp_form"):
                        st.markdown("**Component Details**")
                        d1, d2 = st.columns(2)
                        with d1:
                            e_type = st.selectbox("Component Type", COMPONENT_TYPES,
                                                  index=COMPONENT_TYPES.index(comp["component_type"])
                                                  if comp["component_type"] in COMPONENT_TYPES else 0)
                            e_cond = st.selectbox("Condition", CONDITIONS,
                                                  index=CONDITIONS.index(comp["condition"])
                                                  if comp["condition"] in CONDITIONS else 0)
                        with d2:
                            e_rem = st.text_area("Remarks", value=comp.get("remarks", ""), height=80)

                        st.divider()
                        st.markdown("**Running Hours Adjustment**")
                        rh_edit_mode = st.radio(
                            "RH edit method",
                            ["🔄 Recalculate from fitted-at ME RH",
                             "✏️ Set total RH manually (direct override)"],
                            horizontal=True, key="edit_rh_mode",
                        )
                        rh1, rh2 = st.columns(2)
                        if rh_edit_mode.startswith("🔄"):
                            with rh1:
                                e_fat = st.number_input(
                                    "ME RH when this component was fitted",
                                    value=float(fat or 0),
                                    min_value=0.0,
                                    help="Live RH = Current ME RH minus this value",
                                )
                            with rh2:
                                st.metric("Live RH after save",
                                          fmt(max(0.0, current_me_rh_cm - e_fat)))
                                st.caption(f"= {fmt(current_me_rh_cm)} (current ME) "
                                           f"minus {fmt(e_fat)} (fitted at)")
                        else:
                            with rh1:
                                e_rh_manual = st.number_input(
                                    "Set Total Accumulated RH (stored base)",
                                    value=float(comp["total_accumulated_rh"]),
                                    min_value=0.0,
                                    help="Directly overrides the stored RH. "
                                         "If In Service, live display adds current service hours on top.",
                                )
                            with rh2:
                                if comp["current_status"] == "In Service" and fat:
                                    preview_manual = e_rh_manual + max(0, current_me_rh_cm - fat)
                                else:
                                    preview_manual = e_rh_manual
                                st.metric("Live RH after save", fmt(preview_manual))
                                st.caption("Stored base + current service hours (if in service)")

                        if st.form_submit_button("💾 Save All Changes", type="primary"):
                            db.update_component(sel_id, e_type, e_cond, e_rem, vessel_id=vid)
                            if rh_edit_mode.startswith("🔄"):
                                fat_save = locals().get("e_fat", float(fat or 0))
                                db.update_component_fitted_at(sel_id, fat_save, vessel_id=vid)
                            else:
                                rh_save = locals().get("e_rh_manual", comp["total_accumulated_rh"])
                                db.update_component_rh(sel_id, float(rh_save), vessel_id=vid)
                            st.success("Component updated successfully.")
                            st.rerun()

        # ── Delete ────────────────────────────────────────────────────────────
        with tab_del:
            st.warning("⚠️ Deleting a component also removes it from any fitted cylinder.")
            all_comps_d = db.get_all_components(vessel_id=vid)
            ids_d = [c["component_id"] for c in all_comps_d]
            if ids_d:
                del_id  = st.selectbox("Select Component to Delete", ids_d)
                comp_d  = db.get_component(del_id, vessel_id=vid)
                if comp_d:
                    st.info(f"Status: **{comp_d['current_status']}** | "
                            f"Location: **{comp_d['current_location']}** | "
                            f"Total RH: **{fmt(comp_d['total_accumulated_rh'])}**")
                confirm = st.checkbox(f"I confirm I want to permanently delete **{del_id}**")
                if confirm:
                    if st.button("🗑️ Delete Component", type="primary"):
                        db.delete_component(del_id, vessel_id=vid)
                        st.success(f"Component {del_id} deleted.")
                        st.rerun()
            else:
                st.info("No components found.")

    # ── CYLINDER SETUP ─────────────────────────────────────────────────────────
    elif page == "🔧 Cylinder Setup":
        st.title("🔧 Cylinder Setup")
        st.info("Assign components to cylinders and update overhaul / dismantling records.")

        cylinders  = db.get_all_cylinders(vessel_id=vid)
        components = db.get_all_components(vessel_id=vid)
        comp_ids   = [c["component_id"] for c in components]
        current_me_rh = db.get_latest_me_rh(vid)

        tab_assign, tab_rh = st.tabs(["🔩 Component Assignment","🔧 OH & DM Records"])

        with tab_assign:
            st.info(
                "Current ME Total RH = " + fmt(current_me_rh) + ". "
                "ME RH when fitted = ME running hours when component was last fitted. "
                "Component accumulated RH = Current ME RH minus ME RH when fitted."
            )
            for cyl in cylinders:
                cyl_num     = cyl["cylinder_number"]
                current_fit = cyl.get("fitted_component_id") or ""
                current_fat = float(cyl.get("fitted_at_me_rh") or 0)
                live_preview = max(0.0, current_me_rh - current_fat) if current_fit else 0.0
                with st.expander(
                    f"Cylinder {cyl_num}  —  "
                    f"{'✅ ' + current_fit + f'  ({fmt(live_preview)} RH)' if current_fit else '⚠️ Empty'}",
                ):
                    with st.form(f"cyl_assign_{cyl_num}"):
                        col1, col2 = st.columns(2)
                        with col1:
                            sel_comp = st.selectbox(
                                "Fitted Component",
                                ["— None —"] + comp_ids,
                                index=(comp_ids.index(current_fit) + 1)
                                if current_fit in comp_ids else 0,
                            )
                            fitted_at = st.number_input(
                                "ME RH when component was fitted",
                                value=current_fat,
                                min_value=0.0,
                                help="ME RH at the time this component was fitted. "
                                     "Component RH = Current ME RH − this value.",
                            )
                            st.caption(f"→ Component will show **{fmt(max(0, current_me_rh - fitted_at))} RH**")
                        with col2:
                            last_oh = st.number_input(
                                "Last Overhaul ME RH",
                                value=float(cyl.get("last_overhaul_rh") or 0),
                                min_value=0.0,
                            )
                            last_dm = st.number_input(
                                "Last Dismantling ME RH",
                                value=float(cyl.get("last_dismantling_rh") or 0),
                                min_value=0.0,
                            )
                        if st.form_submit_button(f"💾 Save Cylinder {cyl_num}"):
                            fid = sel_comp if sel_comp != "— None —" else None
                            db.update_cylinder(cyl_num, fid, fitted_at,
                                               last_oh, last_dm, vessel_id=vid)
                            st.success(f"Cylinder {cyl_num} updated. Component RH = {fmt(max(0, current_me_rh - fitted_at))}.")
                            st.rerun()

        with tab_rh:
            for cyl in cylinders:
                cyl_num = cyl["cylinder_number"]
                with st.expander(f"Cylinder {cyl_num} — {cyl.get('fitted_component_id') or 'Empty'}"):
                    col1, col2, col3 = st.columns(3)
                    col1.metric("Fitted", cyl.get("fitted_component_id") or "—")
                    col2.metric("Last OH RH",  fmt(cyl.get("last_overhaul_rh") or 0))
                    col3.metric("Last DM RH",  fmt(cyl.get("last_dismantling_rh") or 0))
                    rh_oh = calc.compute_rh_since_last_overhaul(cyl, current_me_rh)
                    rh_dm = calc.compute_rh_since_last_dismantling(cyl, current_me_rh)
                    col2.caption(f"Since: {fmt(rh_oh)}")
                    col3.caption(f"Since: {fmt(rh_dm)}")
                    ca, cb = st.columns(2)
                    with ca:
                        with st.form(f"oh_f_{cyl_num}"):
                            new_oh = st.number_input("Set Last Overhaul ME RH",
                                                     value=float(cyl.get("last_overhaul_rh") or 0),
                                                     min_value=0.0, key=f"oh_{cyl_num}")
                            if st.form_submit_button("Update OH RH"):
                                db.update_cylinder_overhaul(cyl_num, new_oh, vessel_id=vid)
                                st.success("Updated."); st.rerun()
                    with cb:
                        with st.form(f"dm_f_{cyl_num}"):
                            new_dm = st.number_input("Set Last Dismantling ME RH",
                                                     value=float(cyl.get("last_dismantling_rh") or 0),
                                                     min_value=0.0, key=f"dm_{cyl_num}")
                            if st.form_submit_button("Update DM RH"):
                                db.update_cylinder_dismantling(cyl_num, new_dm, vessel_id=vid)
                                st.success("Updated."); st.rerun()

    # ── COMPONENT MOVEMENT ─────────────────────────────────────────────────────
    elif page == "🔄 Component Movement":
        st.title("🔄 Component Movement Log")
        tab_new, tab_log = st.tabs(["📝 Record Movement","📜 Movement History"])

        with tab_new:
            latest_rh = db.get_latest_me_rh(vid)
            all_comps = db.get_all_components(vessel_id=vid)
            with st.form("movement_form", clear_on_submit=True):
                col1, col2 = st.columns(2)
                with col1:
                    mv_date   = st.date_input("Date", value=date.today())
                    mv_me_rh  = st.number_input("ME RH at Movement",
                                                value=float(latest_rh),
                                                min_value=0.0, step=1.0)
                    mv_action = st.selectbox("Action", ACTIONS)
                with col2:
                    comp_ids   = [c["component_id"] for c in all_comps]
                    mv_comp    = st.selectbox("Component", comp_ids if comp_ids else ["—"])
                    comp_detail = next(
                        (c for c in all_comps if c["component_id"] == mv_comp), None
                    )
                    if comp_detail:
                        st.caption(
                            f"Status: **{comp_detail['current_status']}** | "
                            f"Location: **{comp_detail['current_location']}** | "
                            f"Total RH: **{fmt(comp_detail['total_accumulated_rh'])}**"
                        )
                    mv_from = st.selectbox(
                        "From Location", LOCATIONS,
                        index=LOCATIONS.index(comp_detail["current_location"])
                        if comp_detail and comp_detail["current_location"] in LOCATIONS else 0,
                    )
                    mv_to = st.selectbox("To Location", LOCATIONS)
                mv_remarks = st.text_input("Remarks (optional)")
                st.markdown("---")
                if mv_action == "Fit":
                    st.info("💡 Component will be marked In Service and begin accumulating RH.")
                elif mv_action in ("Remove","Land Ashore","Scrap") and comp_detail:
                    if comp_detail.get("fitted_at_me_rh"):
                        gain = max(0, float(mv_me_rh) - float(comp_detail["fitted_at_me_rh"]))
                        st.info(f"💡 Estimated RH to be credited: **{fmt(gain)}**")
                if st.form_submit_button("✅ Record Movement", type="primary"):
                    ok, msg = db.record_movement(
                        mv_date.strftime("%Y-%m-%d"), float(mv_me_rh),
                        mv_comp, mv_from, mv_to, mv_action, mv_remarks,
                        vessel_id=vid,
                    )
                    if ok:
                        st.success(msg); st.rerun()
                    else:
                        st.error(msg)

        with tab_log:
            all_comps2  = db.get_all_components(vessel_id=vid)
            filter_opts = ["All"] + [c["component_id"] for c in all_comps2]
            filter_comp = st.selectbox("Filter by Component", filter_opts)
            hist = pd.DataFrame(db.get_movement_log(
                component_id=filter_comp if filter_comp != "All" else None,
                vessel_id=vid,
            ))
            if not hist.empty:
                cols_show = ["movement_date","component_id","action",
                             "from_location","to_location","me_rh","rh_added","remarks"]
                hist = hist[[c for c in cols_show if c in hist.columns]]
                hist.columns = ["Date","Component","Action","From","To",
                                "ME RH","RH Added","Remarks"]
                st.dataframe(hist, use_container_width=True, hide_index=True)
            else:
                st.info("No movement records found.")

    # ── ALERTS ─────────────────────────────────────────────────────────────────
    elif page == "🚨 Alerts":
        st.title("🚨 Alerts & Due Items")
        cfg = db.get_alert_config(vid)
        with st.expander("⚙️ Configure Thresholds"):
            with st.form("alert_cfg_form"):
                col1, col2, col3 = st.columns(3)
                with col1:
                    new_oh = st.number_input("Crown Overhaul Due (RH)",
                                             value=int(cfg["crown_overhaul_rh"]), step=500)
                with col2:
                    new_wn = st.number_input("Crown Warning At (RH)",
                                             value=int(cfg["crown_warning_rh"]), step=500)
                with col3:
                    new_dm = st.number_input("Dismantling Warning (RH)",
                                             value=int(cfg["dismantling_warning_rh"]), step=500)
                if st.form_submit_button("💾 Save"):
                    db.update_alert_config(new_oh, new_wn, new_dm, vessel_id=vid)
                    st.success("Thresholds saved."); st.rerun()

        st.divider()
        data = calc.build_dashboard_data(vid)
        if not data["alerts"]:
            st.success("✅ All components within acceptable running hour limits.")
        else:
            for status in ["Overdue","Due","Warning"]:
                subset = [a for a in data["alerts"] if a["status"] == status]
                if not subset:
                    continue
                st.markdown(f"### {ALERT_BADGE[status]} {status} — {len(subset)} item(s)",
                            unsafe_allow_html=True)
                for a in subset:
                    rem = a["limit"] - a["total_rh"]
                    st.markdown(
                        f"> **Cyl {a['cylinder']}** | `{a['component_id']}`  \n"
                        f"> {a['type']} | RH: **{fmt(a['total_rh'])}** / Limit: **{fmt(a['limit'])}** | "
                        + ("Overrun: " + fmt(abs(rem)) if rem < 0 else "Left: " + fmt(rem))
                    )
                st.divider()

    # ── REPORTS ────────────────────────────────────────────────────────────────
    elif page == "📋 Reports":
        st.title("📋 Reports")
        rtype = st.selectbox("Select Report", [
            "Monthly Running Hour Report","Cylinder-wise Status Report",
            "Component History Report","Spare Inventory Report",
            "Due / Overdue Alert Report","Full Component List",
        ])
        st.divider()

        if rtype == "Monthly Running Hour Report":
            st.subheader("📅 Monthly Running Hour Report")
            df = reports.monthly_report_df()
            st.dataframe(df, use_container_width=True, hide_index=True) if not df.empty \
                else st.info("No records.")
        elif rtype == "Cylinder-wise Status Report":
            st.subheader("🔧 Cylinder-wise Status")
            st.dataframe(reports.cylinder_report_df(), use_container_width=True, hide_index=True)
        elif rtype == "Component History Report":
            st.subheader("🔄 Movement History")
            opts = ["All"] + [c["component_id"] for c in db.get_all_components(vessel_id=vid)]
            sel  = st.selectbox("Filter by Component", opts)
            df   = reports.component_history_df(sel if sel != "All" else None)
            if not df.empty:
                st.dataframe(df, use_container_width=True, hide_index=True)
                if sel != "All":
                    st.download_button(f"⬇️ Download {sel} History",
                                       reports.export_component_history_excel(sel),
                                       file_name=f"history_{sel}.xlsx",
                                       mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            else:
                st.info("No records.")
        elif rtype == "Spare Inventory Report":
            df = reports.spare_inventory_df()
            st.dataframe(df, use_container_width=True, hide_index=True) if not df.empty \
                else st.info("No spare components.")
        elif rtype == "Due / Overdue Alert Report":
            df = reports.due_overdue_df()
            st.dataframe(df, use_container_width=True, hide_index=True) if not df.empty \
                else st.success("✅ No due or overdue items.")
        elif rtype == "Full Component List":
            df = reports.full_component_df()
            st.dataframe(df, use_container_width=True, hide_index=True) if not df.empty \
                else st.info("No components.")

        st.divider()
        st.subheader("📥 Export to Excel")
        if st.button("🗂️ Generate Excel Export", type="primary"):
            with st.spinner("Generating..."):
                xl = reports.export_all_to_excel()
            vname = vessel["vessel_name"].replace(" ", "_")
            st.download_button(
                "⬇️ Download Excel Workbook", xl,
                file_name=f"ME_Piston_RH_{vname}_{datetime.now().strftime('%Y%m%d')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )

    # ── IMPORT EXCEL ───────────────────────────────────────────────────────────
    elif page == "📥 Import Excel":
        st.title("📥 Import from Excel")
        tab_bmg, tab_generic = st.tabs(["📄 BMG Format","🗂️ Generic Column Mapping"])

        with tab_bmg:
            st.subheader("Import BMG Piston RH Record Format")
            uploaded = st.file_uploader("Upload .xls / .xlsx", type=["xls","xlsx"],
                                        key="bmg_upload")
            if uploaded:
                parsed = imp_xl.parse_bmg_excel(uploaded)
                if "error" in parsed:
                    st.error(f"Parse error: {parsed['error']}")
                else:
                    st.success("Parsed successfully.")
                    col1, col2 = st.columns(2)
                    col1.metric("Vessel Name", parsed.get("vessel_name") or "—")
                    col2.metric("ME Total RH", fmt(parsed.get("me_total_rh") or 0))
                    if parsed["cylinders"]:
                        st.dataframe(pd.DataFrame(parsed["cylinders"]),
                                     use_container_width=True, hide_index=True)
                    st.warning("⚠️ Import only populates if component tables are empty.")
                    if st.button("✅ Confirm Import", type="primary"):
                        ok, msg = imp_xl.import_bmg_data(parsed)
                        st.success(msg) if ok else st.error(msg)
                        if ok:
                            st.rerun()

        with tab_generic:
            st.subheader("Generic Column-Mapped Import")
            uploaded2 = st.file_uploader("Upload Excel / CSV",
                                         type=["xls","xlsx","csv"], key="generic_upload")
            if uploaded2:
                df_prev, _, err = imp_xl.load_excel_preview(uploaded2)
                if err:
                    st.error(err)
                elif df_prev is not None:
                    st.dataframe(df_prev.head(5), use_container_width=True)
                    columns = list(df_prev.columns)
                    c1, c2, c3 = st.columns(3)
                    col_date    = c1.selectbox("Date column",          ["—"] + columns)
                    col_me_rh   = c1.selectbox("ME RH column",         ["—"] + columns)
                    col_comp    = c2.selectbox("Component ID column",  ["—"] + columns)
                    col_from    = c2.selectbox("From Location column", ["—"] + columns)
                    col_to      = c3.selectbox("To Location column",   ["—"] + columns)
                    col_action  = c3.selectbox("Action column",        ["—"] + columns)
                    col_remarks = c3.selectbox("Remarks (opt.)",       ["—"] + columns)
                    if st.button("📥 Import", type="primary"):
                        col_map = {"date":col_date,"me_rh":col_me_rh,
                                   "component_id":col_comp,"from_location":col_from,
                                   "to_location":col_to,"action":col_action}
                        if col_remarks != "—":
                            col_map["remarks"] = col_remarks
                        ok, msg = imp_xl.import_movement_log_from_df(df_prev, col_map)
                        st.success(msg) if ok else st.error(msg)

    # ── SETTINGS ───────────────────────────────────────────────────────────────
    elif page == "⚙️ Settings":
        st.title("⚙️ Settings")

        # ── Current vessel ────────────────────────────────────────────────────
        st.subheader("🚢 Vessel Details")
        with st.form("vessel_edit_form"):
            col1, col2 = st.columns(2)
            with col1:
                s_name  = st.text_input("Vessel Name *", value=vessel.get("vessel_name",""))
                s_imo   = st.text_input("IMO Number",    value=vessel.get("imo_number",""))
                s_type  = st.text_input("Vessel Type",   value=vessel.get("vessel_type",""))
            with col2:
                s_make  = st.text_input("Engine Make",   value=vessel.get("engine_make",""))
                s_model = st.text_input("Engine Model",  value=vessel.get("engine_model",""))
                s_cyls  = st.number_input("No. of Cylinders", value=int(vessel.get("num_cylinders",6)),
                                          min_value=1, max_value=12)
            st.markdown("**Alert Thresholds**")
            t1, t2, t3 = st.columns(3)
            with t1:
                t_oh = st.number_input("Overhaul Due (RH)",    value=int(vessel.get("crown_overhaul_rh",24000)), step=500)
            with t2:
                t_wn = st.number_input("Warning At (RH)",      value=int(vessel.get("crown_warning_rh",20000)), step=500)
            with t3:
                t_dm = st.number_input("Dismantling Warn (RH)",value=int(vessel.get("dismantling_warning_rh",16000)), step=500)
            if st.form_submit_button("💾 Save Vessel Settings", type="primary"):
                if not s_name.strip():
                    st.error("Vessel name is required.")
                else:
                    db.update_vessel(vid, s_name.strip(), s_imo, s_type, s_make, s_model,
                                     int(s_cyls), int(t_oh), int(t_wn), int(t_dm))
                    st.success("Vessel settings updated.")
                    st.rerun()

        st.divider()

        # ── Setup wizard shortcut ─────────────────────────────────────────────
        st.subheader("🛠️ Re-run Setup Wizard")
        st.caption("Add more components and update cylinder assignments.")
        if st.button("Open Setup Wizard", use_container_width=True):
            st.session_state["run_setup"] = vid
            st.rerun()

        st.divider()

        # ── All vessels ───────────────────────────────────────────────────────
        st.subheader("🚢 All Vessels")
        all_vessels = db.get_all_vessels()
        for v in all_vessels:
            is_active = v["id"] == vid
            col1, col2, col3 = st.columns([3, 1, 1])
            col1.markdown(
                f"**{v['vessel_name']}**"
                f"{' ✅ *(active)*' if is_active else ''}  \n"
                f"IMO: {v.get('imo_number','—')} | {v.get('num_cylinders',6)} cyl | "
                f"{v.get('engine_make','—')}"
            )
            if not is_active:
                if col2.button("Switch", key=f"sw_{v['id']}"):
                    db.set_active_vessel(v["id"])
                    st.rerun()
            if col3.button("🗑️ Delete", key=f"del_{v['id']}"):
                st.session_state[f"confirm_del_{v['id']}"] = True
            if st.session_state.get(f"confirm_del_{v['id']}"):
                st.error(f"⚠️ Delete **{v['vessel_name']}** and ALL its data?")
                ca, cb = st.columns(2)
                if ca.button("Yes, delete", key=f"yes_del_{v['id']}", type="primary"):
                    ok, msg = db.delete_vessel(v["id"])
                    if ok:
                        st.session_state.pop(f"confirm_del_{v['id']}", None)
                        st.rerun()
                    else:
                        st.error(msg)
                if cb.button("Cancel", key=f"no_del_{v['id']}"):
                    st.session_state.pop(f"confirm_del_{v['id']}", None)
                    st.rerun()

        st.divider()

        # ── Reset data ────────────────────────────────────────────────────────
        st.subheader("🔄 Reset Vessel Data")
        st.warning("Clears all components, movements, and RH logs for this vessel. "
                   "The vessel record itself is kept.")
        confirm_reset = st.checkbox("I confirm I want to reset all operational data")
        if confirm_reset:
            if st.button("🔄 Reset Data", type="primary"):
                ok, msg = db.reset_vessel_data(vid)
                if ok:
                    st.success(msg)
                    st.rerun()
                else:
                    st.error(msg)

        st.divider()
        st.subheader("🔧 Repair Running Hours")
        st.caption(
            "Use this if component Total RH looks incorrect — recalculates "
            "every component's accumulated RH directly from the movement log."
        )
        if st.button("🔧 Recalculate All Component RH", use_container_width=True):
            count, detail = db.recalculate_all_component_rh(vid)
            if count:
                st.success(f"Fixed {count} component(s):")
                for d in detail:
                    st.write(f"  • `{d['component_id']}`: {fmt(d['old_rh'])} → {fmt(d['new_rh'])} RH")
            else:
                st.info("All component RH values are already consistent with the movement log.")
            st.rerun()

        st.divider()
        st.subheader("Database")
        st.info("Database: `me_piston_records.db` in the application directory.")


# ═══════════════════════════════════════════════════════════════════════════════
# ROUTER  — always re-reads active vessel fresh on every Streamlit rerun
# ═══════════════════════════════════════════════════════════════════════════════

def _get_active_vessel():
    """Re-read active vessel from DB on every call — never stale."""
    state  = db.get_app_state()
    vid    = state.get("active_vessel_id")
    vessel = db.get_vessel(vid) if vid else {}
    return vid, vessel


# Force new-vessel creation (➕ New Vessel button)
if st.session_state.get("force_new_vessel"):
    st.session_state.pop("force_new_vessel")
    show_setup_wizard()
    st.stop()

# Setup wizard launched from Settings page
if st.session_state.get("run_setup"):
    target_vid    = st.session_state["run_setup"]
    target_vessel = db.get_vessel(target_vid)
    db.set_active_vessel(target_vid)
    if "setup_step" not in st.session_state:
        st.session_state["setup_step"] = 1
    show_vessel_setup_page(target_vessel)
    if st.sidebar.button("✖ Exit Setup"):
        st.session_state.pop("run_setup", None)
        st.session_state.pop("setup_step", None)
        st.rerun()
    st.stop()

# Read active vessel NOW (after any wizard state changes above)
_vid, _vessel = _get_active_vessel()

# No vessel configured → show setup / vessel picker
if not _vid or not _vessel:
    show_setup_wizard()
    st.stop()

# Vessel exists but step-through wizard is active
if "setup_step" in st.session_state:
    show_vessel_setup_page(_vessel)
    if st.sidebar.button("✖ Exit Setup"):
        st.session_state.pop("setup_step", None)
        st.rerun()
    st.stop()

# Normal app — pass fresh vessel dict
show_main_app(_vessel)
