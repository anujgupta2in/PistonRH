"""
import_excel.py - Import historical records from Excel files.
Handles both the original BMG format and a generic column-mapped import.
"""

import pandas as pd
import sqlite3
from datetime import datetime
from database import get_connection, DB_PATH


# ─── BMG Format Parser ────────────────────────────────────────────────────────

def parse_bmg_excel(file_path_or_buffer) -> dict:
    """
    Parse the BMG 'Piston' sheet format (from the uploaded reference file).
    Returns a dict with extracted data ready for import.
    """
    try:
        df = pd.read_excel(file_path_or_buffer, sheet_name=0, header=None, engine="xlrd")
    except Exception:
        try:
            df = pd.read_excel(file_path_or_buffer, sheet_name=0, header=None, engine="openpyxl")
        except Exception as e:
            return {"error": str(e)}

    result = {
        "vessel_name": None,
        "me_total_rh": None,
        "cylinders": [],
        "spare": [],
        "raw_df": df,
    }

    # Extract vessel name (row 3, col 1)
    try:
        result["vessel_name"] = str(df.iloc[3, 1]).strip()
    except Exception:
        pass

    # Extract ME total RH (row 10, col 6)
    try:
        result["me_total_rh"] = float(df.iloc[10, 6])
    except Exception:
        pass

    # Headers: row 13 → Cyl 1..6, SPARE
    # Data rows: 14-18
    try:
        col_map = {}
        for col_idx, cell in enumerate(df.iloc[13]):
            val = str(cell).strip()
            if val.startswith("Cyl"):
                col_map[val] = col_idx
            elif val == "SPARE":
                col_map["SPARE"] = col_idx

        # Row 14: Hours since last overhaul
        # Row 15: Piston Crown Identification
        # Row 16: Crown Total Running Hours
        # Row 17: RH since last dismantling
        # Row 18: Crown Condition

        for loc, col_idx in col_map.items():
            try:
                oh_rh   = float(df.iloc[14, col_idx]) if pd.notna(df.iloc[14, col_idx]) else 0
                comp_id = str(df.iloc[15, col_idx]).strip()
                total_rh = float(df.iloc[16, col_idx]) if pd.notna(df.iloc[16, col_idx]) else 0
                dm_rh   = float(df.iloc[17, col_idx]) if pd.notna(df.iloc[17, col_idx]) else 0
                condition = str(df.iloc[18, col_idx]).strip()

                entry = {
                    "location": loc,
                    "component_id": comp_id,
                    "total_rh": total_rh,
                    "rh_since_overhaul": oh_rh,
                    "rh_since_dismantling": dm_rh,
                    "condition": condition,
                }
                if loc == "SPARE":
                    result["spare"].append(entry)
                else:
                    result["cylinders"].append(entry)
            except Exception:
                continue
    except Exception as e:
        result["error"] = str(e)

    return result


def import_bmg_data(parsed: dict) -> tuple[bool, str]:
    """
    Import parsed BMG data into the SQLite database.
    Only inserts if tables are empty (safe initial import).
    """
    if "error" in parsed:
        return False, parsed["error"]

    conn = get_connection()
    try:
        # Update vessel name
        if parsed.get("vessel_name"):
            conn.execute(
                "UPDATE vessel_settings SET vessel_name=? WHERE id=1",
                (parsed["vessel_name"],)
            )

        me_rh = parsed.get("me_total_rh") or 0.0

        # Insert monthly RH if no entries
        count = conn.execute("SELECT COUNT(*) FROM monthly_rh_log").fetchone()[0]
        if count == 0 and me_rh > 0:
            conn.execute("""
                INSERT INTO monthly_rh_log (year, month, me_total_rh, monthly_rh, remarks)
                VALUES (?, ?, ?, ?, ?)
            """, (datetime.now().year, datetime.now().month, me_rh, 0, "Imported from Excel"))

        def norm_condition(c):
            c = str(c).strip().lower()
            if "recon" in c:
                return "Reconditioned"
            elif "new" in c:
                return "New"
            return "Original"

        # Import cylinder data
        comp_count = conn.execute("SELECT COUNT(*) FROM components").fetchone()[0]
        if comp_count == 0:
            for entry in parsed["cylinders"]:
                cid = entry["component_id"]
                if cid and cid not in ("nan", "NaN", "None"):
                    total_rh = entry["total_rh"]
                    dm_rh    = entry["rh_since_dismantling"]
                    fitted_at = max(0, me_rh - dm_rh)
                    cyl_num  = int(entry["location"].split(" ")[1])
                    condition = norm_condition(entry["condition"])

                    # Upsert component
                    conn.execute("""
                        INSERT OR REPLACE INTO components
                        (component_id, component_type, initial_rh, condition,
                         current_status, current_location, total_accumulated_rh, fitted_at_me_rh)
                        VALUES (?, 'Piston Crown', 0, ?, 'In Service', ?, ?, ?)
                    """, (cid, condition, entry["location"], total_rh, fitted_at))

                    # Update cylinder
                    oh_rh = me_rh - entry.get("rh_since_overhaul", 0)
                    conn.execute("""
                        INSERT OR REPLACE INTO cylinder_setup
                        (cylinder_number, fitted_component_id, fitted_at_me_rh,
                         last_overhaul_rh, last_dismantling_rh)
                        VALUES (?, ?, ?, ?, ?)
                    """, (cyl_num, cid, fitted_at, oh_rh, fitted_at))

            # Import spare data
            for entry in parsed["spare"]:
                cid = entry["component_id"]
                if cid and cid not in ("nan", "NaN", "None"):
                    condition = norm_condition(entry["condition"])
                    conn.execute("""
                        INSERT OR REPLACE INTO components
                        (component_id, component_type, initial_rh, condition,
                         current_status, current_location, total_accumulated_rh)
                        VALUES (?, 'Piston Crown', 0, ?, 'Onboard Spare', 'Onboard Spare', ?)
                    """, (cid, condition, entry["total_rh"]))

        conn.commit()
        conn.close()
        return True, f"Imported {len(parsed['cylinders'])} cylinder records and {len(parsed['spare'])} spare records."
    except Exception as e:
        conn.close()
        return False, str(e)


# ─── Generic Column-mapped Import ─────────────────────────────────────────────

def load_excel_preview(file_buffer) -> tuple:
    """
    Load an Excel/CSV file and return (dataframe, sheet_names, error).
    Used to show a preview before mapping columns.
    """
    try:
        try:
            xl = pd.ExcelFile(file_buffer, engine="openpyxl")
        except Exception:
            xl = pd.ExcelFile(file_buffer, engine="xlrd")
        sheets = xl.sheet_names
        df = xl.parse(sheets[0], nrows=50)
        return df, sheets, None
    except Exception as e:
        return None, [], str(e)


def import_movement_log_from_df(df: pd.DataFrame, col_map: dict) -> tuple[bool, str]:
    """
    Import a movement log DataFrame with column mapping.
    col_map keys: date, me_rh, component_id, from_location, to_location, action, remarks
    """
    required = ["date", "me_rh", "component_id", "from_location", "to_location", "action"]
    missing = [k for k in required if k not in col_map or col_map[k] not in df.columns]
    if missing:
        return False, f"Missing column mappings: {missing}"

    conn = get_connection()
    success = 0
    errors = []
    for _, row in df.iterrows():
        try:
            date_val = str(row[col_map["date"]])[:10]
            me_rh    = float(row[col_map["me_rh"]])
            comp_id  = str(row[col_map["component_id"]]).strip()
            from_loc = str(row[col_map["from_location"]]).strip()
            to_loc   = str(row[col_map["to_location"]]).strip()
            action   = str(row[col_map["action"]]).strip()
            remarks  = str(row.get(col_map.get("remarks", ""), ""))

            conn.execute("""
                INSERT OR IGNORE INTO movement_log
                (movement_date, me_rh, component_id, from_location,
                 to_location, action, rh_added, remarks)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?)
            """, (date_val, me_rh, comp_id, from_loc, to_loc, action, remarks))
            success += 1
        except Exception as e:
            errors.append(str(e))

    conn.commit()
    conn.close()
    msg = f"Imported {success} movement records."
    if errors:
        msg += f" {len(errors)} rows had errors."
    return True, msg
