"""
database.py  –  ME Piston Component Running Hours Record
Multi-vessel SQLite backend with automatic old-schema migration.

Key design: initialize_database() uses ONE connection for everything —
schema creation, detection, and migration — so SQLite never sees two
concurrent writers and the "database is locked" error cannot occur.
"""

import sqlite3
from datetime import datetime

DB_PATH = "me_piston_records.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")   # WAL prevents most lock issues
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _col_names(cur, table):
    return [r[1] for r in cur.execute(f"PRAGMA table_info({table})").fetchall()]


def _table_exists(cur, table):
    return cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def _index_exists(cur, name):
    return cur.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name=?", (name,)
    ).fetchone() is not None


# ═══════════════════════════════════════════════════════════════════════════════
# SCHEMA CREATION + MIGRATION  (single connection)
# ═══════════════════════════════════════════════════════════════════════════════

def initialize_database():
    """
    One connection handles everything — correct order:
    1. Create app_state + vessels (always safe, IF NOT EXISTS).
    2. Detect old schema (cylinder_setup missing vessel_id).
    3. If old: migrate data tables inside same connection.
    4. Create remaining tables IF NOT EXISTS.
    5. Create unique indexes.
    """
    conn = get_connection()
    cur  = conn.cursor()

    # ── Step 1: Create app_state + vessels first (migration needs vessels) ────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS app_state (
            id               INTEGER PRIMARY KEY CHECK (id = 1),
            active_vessel_id INTEGER,
            setup_complete   INTEGER NOT NULL DEFAULT 0
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS vessels (
            id                     INTEGER PRIMARY KEY AUTOINCREMENT,
            vessel_name            TEXT    NOT NULL,
            imo_number             TEXT    DEFAULT '',
            vessel_type            TEXT    DEFAULT '',
            engine_make            TEXT    DEFAULT '',
            engine_model           TEXT    DEFAULT '',
            num_cylinders          INTEGER NOT NULL DEFAULT 6,
            crown_overhaul_rh      INTEGER NOT NULL DEFAULT 24000,
            crown_warning_rh       INTEGER NOT NULL DEFAULT 20000,
            dismantling_warning_rh INTEGER NOT NULL DEFAULT 16000,
            created_at             TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at             TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # ── Step 2: Detect old schema ─────────────────────────────────────────────
    is_old = (
        _table_exists(cur, "cylinder_setup")
        and "vessel_id" not in _col_names(cur, "cylinder_setup")
    )

    # ── Step 3: Migrate if old ────────────────────────────────────────────────
    if is_old:
        _migrate_old_schema(cur)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS monthly_rh_log (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            vessel_id    INTEGER NOT NULL DEFAULT 1,
            year         INTEGER NOT NULL,
            month        INTEGER NOT NULL,
            me_total_rh  REAL    NOT NULL,
            monthly_rh   REAL    NOT NULL DEFAULT 0,
            remarks      TEXT,
            created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS components (
            component_id         TEXT    NOT NULL,
            vessel_id            INTEGER NOT NULL DEFAULT 1,
            component_type       TEXT    NOT NULL,
            initial_rh           REAL    NOT NULL DEFAULT 0,
            condition            TEXT    NOT NULL DEFAULT 'New',
            current_status       TEXT    NOT NULL DEFAULT 'Onboard Spare',
            current_location     TEXT    NOT NULL DEFAULT 'Onboard Spare',
            total_accumulated_rh REAL    NOT NULL DEFAULT 0,
            fitted_at_me_rh      REAL,
            remarks              TEXT,
            created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cylinder_setup (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            vessel_id           INTEGER NOT NULL DEFAULT 1,
            cylinder_number     INTEGER NOT NULL,
            fitted_component_id TEXT,
            fitted_at_me_rh     REAL,
            last_overhaul_rh    REAL    DEFAULT 0,
            last_dismantling_rh REAL    DEFAULT 0,
            updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS movement_log (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            vessel_id     INTEGER NOT NULL DEFAULT 1,
            movement_date TEXT    NOT NULL,
            me_rh         REAL    NOT NULL,
            component_id  TEXT    NOT NULL,
            from_location TEXT    NOT NULL,
            to_location   TEXT    NOT NULL,
            action        TEXT    NOT NULL,
            rh_added      REAL    DEFAULT 0,
            remarks       TEXT,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # ── Unique indexes (only after all tables/migrations are done) ────────────
    if not _index_exists(cur, "uq_monthly"):
        cur.execute(
            "CREATE UNIQUE INDEX uq_monthly ON monthly_rh_log(vessel_id, year, month)"
        )
    if not _index_exists(cur, "uq_cylinder"):
        cur.execute(
            "CREATE UNIQUE INDEX uq_cylinder ON cylinder_setup(vessel_id, cylinder_number)"
        )
    if not _index_exists(cur, "uq_component"):
        cur.execute(
            "CREATE UNIQUE INDEX uq_component ON components(component_id, vessel_id)"
        )

    conn.commit()
    conn.close()


def _migrate_old_schema(cur):
    """
    Migrate a pre-multi-vessel database.
    Called with an already-open cursor; does NOT open its own connection.
    """
    # ── 1. Ensure vessels row 1 exists ────────────────────────────────────────
    if _table_exists(cur, "vessel_settings"):
        old = cur.execute("SELECT * FROM vessel_settings WHERE id=1").fetchone()
        if old:
            keys = old.keys()
            cur.execute("""
                INSERT OR IGNORE INTO vessels
                (id, vessel_name, num_cylinders,
                 crown_overhaul_rh, crown_warning_rh, dismantling_warning_rh)
                VALUES (1, ?, ?, ?, ?, ?)
            """, (
                old["vessel_name"],
                old["num_cylinders"],
                old["crown_overhaul_rh"]      if "crown_overhaul_rh"      in keys else 24000,
                old["crown_warning_rh"]       if "crown_warning_rh"       in keys else 20000,
                old["dismantling_warning_rh"] if "dismantling_warning_rh" in keys else 16000,
            ))
        else:
            cur.execute("INSERT OR IGNORE INTO vessels (id, vessel_name) VALUES (1, 'Migrated Vessel')")
    else:
        cur.execute("INSERT OR IGNORE INTO vessels (id, vessel_name) VALUES (1, 'Migrated Vessel')")

    # ── 2. Rebuild each table with vessel_id (rename → new → copy → drop) ─────

    # monthly_rh_log
    cur.execute("""
        CREATE TABLE _mrl_new (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            vessel_id    INTEGER NOT NULL DEFAULT 1,
            year         INTEGER NOT NULL,
            month        INTEGER NOT NULL,
            me_total_rh  REAL    NOT NULL,
            monthly_rh   REAL    NOT NULL DEFAULT 0,
            remarks      TEXT,
            created_at   TEXT
        )
    """)
    if _table_exists(cur, "monthly_rh_log"):
        old_cols = _col_names(cur, "monthly_rh_log")
        shared   = [c for c in ["id","year","month","me_total_rh","monthly_rh","remarks","created_at"]
                    if c in old_cols]
        cur.execute(f"""
            INSERT OR IGNORE INTO _mrl_new (vessel_id, {', '.join(shared)})
            SELECT 1, {', '.join(shared)} FROM monthly_rh_log
        """)
        cur.execute("DROP TABLE monthly_rh_log")
    cur.execute("ALTER TABLE _mrl_new RENAME TO monthly_rh_log")

    # cylinder_setup
    cur.execute("""
        CREATE TABLE _cs_new (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            vessel_id           INTEGER NOT NULL DEFAULT 1,
            cylinder_number     INTEGER NOT NULL,
            fitted_component_id TEXT,
            fitted_at_me_rh     REAL,
            last_overhaul_rh    REAL DEFAULT 0,
            last_dismantling_rh REAL DEFAULT 0,
            updated_at          TEXT
        )
    """)
    if _table_exists(cur, "cylinder_setup"):
        old_cols = _col_names(cur, "cylinder_setup")
        shared   = [c for c in ["id","cylinder_number","fitted_component_id",
                                 "fitted_at_me_rh","last_overhaul_rh",
                                 "last_dismantling_rh","updated_at"]
                    if c in old_cols]
        cur.execute(f"""
            INSERT OR IGNORE INTO _cs_new (vessel_id, {', '.join(shared)})
            SELECT 1, {', '.join(shared)} FROM cylinder_setup
        """)
        cur.execute("DROP TABLE cylinder_setup")
    cur.execute("ALTER TABLE _cs_new RENAME TO cylinder_setup")

    # components
    cur.execute("""
        CREATE TABLE _comp_new (
            component_id         TEXT NOT NULL,
            vessel_id            INTEGER NOT NULL DEFAULT 1,
            component_type       TEXT NOT NULL,
            initial_rh           REAL NOT NULL DEFAULT 0,
            condition            TEXT NOT NULL DEFAULT 'New',
            current_status       TEXT NOT NULL DEFAULT 'Onboard Spare',
            current_location     TEXT NOT NULL DEFAULT 'Onboard Spare',
            total_accumulated_rh REAL NOT NULL DEFAULT 0,
            fitted_at_me_rh      REAL,
            remarks              TEXT,
            created_at           TEXT
        )
    """)
    if _table_exists(cur, "components"):
        old_cols = _col_names(cur, "components")
        shared   = [c for c in ["component_id","component_type","initial_rh",
                                 "condition","current_status","current_location",
                                 "total_accumulated_rh","fitted_at_me_rh",
                                 "remarks","created_at"]
                    if c in old_cols]
        cur.execute(f"""
            INSERT OR IGNORE INTO _comp_new (vessel_id, {', '.join(shared)})
            SELECT 1, {', '.join(shared)} FROM components
        """)
        cur.execute("DROP TABLE components")
    cur.execute("ALTER TABLE _comp_new RENAME TO components")

    # movement_log
    cur.execute("""
        CREATE TABLE _ml_new (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            vessel_id     INTEGER NOT NULL DEFAULT 1,
            movement_date TEXT,
            me_rh         REAL,
            component_id  TEXT,
            from_location TEXT,
            to_location   TEXT,
            action        TEXT,
            rh_added      REAL DEFAULT 0,
            remarks       TEXT,
            created_at    TEXT
        )
    """)
    if _table_exists(cur, "movement_log"):
        old_cols = _col_names(cur, "movement_log")
        shared   = [c for c in ["id","movement_date","me_rh","component_id",
                                 "from_location","to_location","action",
                                 "rh_added","remarks","created_at"]
                    if c in old_cols]
        if shared:
            cur.execute(f"""
                INSERT OR IGNORE INTO _ml_new (vessel_id, {', '.join(shared)})
                SELECT 1, {', '.join(shared)} FROM movement_log
            """)
        cur.execute("DROP TABLE movement_log")
    cur.execute("ALTER TABLE _ml_new RENAME TO movement_log")

    # ── 3. Point app_state at vessel 1 ───────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS app_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            active_vessel_id INTEGER,
            setup_complete INTEGER NOT NULL DEFAULT 0
        )
    """)
    cur.execute("""
        INSERT INTO app_state (id, active_vessel_id, setup_complete)
        VALUES (1, 1, 1)
        ON CONFLICT(id) DO UPDATE SET active_vessel_id=1, setup_complete=1
    """)


# ═══════════════════════════════════════════════════════════════════════════════
# APP STATE
# ═══════════════════════════════════════════════════════════════════════════════

def get_app_state():
    conn = get_connection()
    row  = conn.execute("SELECT * FROM app_state WHERE id=1").fetchone()
    conn.close()
    return dict(row) if row else {"active_vessel_id": None, "setup_complete": 0}


def set_active_vessel(vessel_id):
    conn = get_connection()
    conn.execute("""
        INSERT INTO app_state (id, active_vessel_id, setup_complete)
        VALUES (1, ?, 1)
        ON CONFLICT(id) DO UPDATE SET active_vessel_id=?, setup_complete=1
    """, (vessel_id, vessel_id))
    conn.commit()
    conn.close()


def is_setup_complete():
    state = get_app_state()
    return bool(state.get("setup_complete")) and state.get("active_vessel_id") is not None


# ═══════════════════════════════════════════════════════════════════════════════
# VESSELS
# ═══════════════════════════════════════════════════════════════════════════════

def get_all_vessels():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM vessels ORDER BY vessel_name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_vessel(vessel_id):
    if not vessel_id:
        return {}
    conn = get_connection()
    row  = conn.execute("SELECT * FROM vessels WHERE id=?", (vessel_id,)).fetchone()
    conn.close()
    return dict(row) if row else {}


def create_vessel(vessel_name, imo_number, vessel_type, engine_make, engine_model,
                  num_cylinders, crown_overhaul_rh, crown_warning_rh,
                  dismantling_warning_rh):
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO vessels
        (vessel_name, imo_number, vessel_type, engine_make, engine_model,
         num_cylinders, crown_overhaul_rh, crown_warning_rh, dismantling_warning_rh)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (vessel_name, imo_number, vessel_type, engine_make, engine_model,
          num_cylinders, crown_overhaul_rh, crown_warning_rh, dismantling_warning_rh))
    vessel_id = cur.lastrowid
    for i in range(1, num_cylinders + 1):
        cur.execute("""
            INSERT OR IGNORE INTO cylinder_setup (vessel_id, cylinder_number)
            VALUES (?, ?)
        """, (vessel_id, i))
    conn.commit()
    conn.close()
    return vessel_id


def update_vessel(vessel_id, vessel_name, imo_number, vessel_type,
                  engine_make, engine_model, num_cylinders,
                  crown_overhaul_rh, crown_warning_rh, dismantling_warning_rh):
    conn = get_connection()
    conn.execute("""
        UPDATE vessels SET
            vessel_name=?, imo_number=?, vessel_type=?, engine_make=?,
            engine_model=?, num_cylinders=?, crown_overhaul_rh=?,
            crown_warning_rh=?, dismantling_warning_rh=?,
            updated_at=datetime('now')
        WHERE id=?
    """, (vessel_name, imo_number, vessel_type, engine_make, engine_model,
          num_cylinders, crown_overhaul_rh, crown_warning_rh,
          dismantling_warning_rh, vessel_id))
    conn.commit()
    conn.close()
    ensure_cylinders_exist(vessel_id, num_cylinders)


def delete_vessel(vessel_id):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM movement_log   WHERE vessel_id=?", (vessel_id,))
        conn.execute("DELETE FROM cylinder_setup WHERE vessel_id=?", (vessel_id,))
        conn.execute("DELETE FROM components     WHERE vessel_id=?", (vessel_id,))
        conn.execute("DELETE FROM monthly_rh_log WHERE vessel_id=?", (vessel_id,))
        conn.execute("DELETE FROM vessels        WHERE id=?",        (vessel_id,))
        state = conn.execute(
            "SELECT active_vessel_id FROM app_state WHERE id=1"
        ).fetchone()
        if state and state["active_vessel_id"] == vessel_id:
            conn.execute(
                "UPDATE app_state SET active_vessel_id=NULL, setup_complete=0 WHERE id=1"
            )
        conn.commit()
        conn.close()
        return True, "Vessel and all associated data deleted."
    except Exception as e:
        conn.close()
        return False, str(e)


def reset_vessel_data(vessel_id):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM movement_log   WHERE vessel_id=?", (vessel_id,))
        conn.execute("DELETE FROM components     WHERE vessel_id=?", (vessel_id,))
        conn.execute("DELETE FROM monthly_rh_log WHERE vessel_id=?", (vessel_id,))
        conn.execute("""
            UPDATE cylinder_setup SET
                fitted_component_id=NULL, fitted_at_me_rh=NULL,
                last_overhaul_rh=0, last_dismantling_rh=0
            WHERE vessel_id=?
        """, (vessel_id,))
        conn.commit()
        conn.close()
        return True, "All operational data cleared. Vessel record retained."
    except Exception as e:
        conn.close()
        return False, str(e)


# ── Compatibility shims ───────────────────────────────────────────────────────

def get_vessel_settings(vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    if not vessel_id:
        return {"vessel_name": "—", "num_cylinders": 6,
                "crown_overhaul_rh": 24000, "crown_warning_rh": 20000,
                "dismantling_warning_rh": 16000}
    return get_vessel(vessel_id)


def get_alert_config(vessel_id=None):
    v = get_vessel_settings(vessel_id)
    return {
        "crown_overhaul_rh":      v.get("crown_overhaul_rh",      24000),
        "crown_warning_rh":       v.get("crown_warning_rh",        20000),
        "dismantling_warning_rh": v.get("dismantling_warning_rh",  16000),
    }


def update_alert_config(overhaul, warning, dismantling, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    conn.execute("""
        UPDATE vessels SET crown_overhaul_rh=?, crown_warning_rh=?,
        dismantling_warning_rh=? WHERE id=?
    """, (overhaul, warning, dismantling, vessel_id))
    conn.commit()
    conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# MONTHLY RH
# ═══════════════════════════════════════════════════════════════════════════════

def get_latest_me_rh(vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    if not vessel_id:
        return 0.0
    conn = get_connection()
    row  = conn.execute("""
        SELECT me_total_rh FROM monthly_rh_log
        WHERE vessel_id=? ORDER BY year DESC, month DESC LIMIT 1
    """, (vessel_id,)).fetchone()
    conn.close()
    return row["me_total_rh"] if row else 0.0


def get_monthly_rh_log(limit=24, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    if not vessel_id:
        return []
    conn = get_connection()
    rows = conn.execute("""
        SELECT * FROM monthly_rh_log WHERE vessel_id=?
        ORDER BY year DESC, month DESC LIMIT ?
    """, (vessel_id, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def insert_monthly_rh(year, month, me_total_rh, remarks="", vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM monthly_rh_log WHERE vessel_id=? AND year=? AND month=?",
            (vessel_id, year, month)
        ).fetchone()
        if existing:
            conn.close()
            return False, f"Entry for {year}-{month:02d} already exists."
        prev = conn.execute("""
            SELECT me_total_rh FROM monthly_rh_log WHERE vessel_id=?
            ORDER BY year DESC, month DESC LIMIT 1
        """, (vessel_id,)).fetchone()
        prev_rh = prev["me_total_rh"] if prev else 0.0
        if me_total_rh < prev_rh:
            conn.close()
            return False, (f"ME total RH ({me_total_rh}) cannot be "
                           f"less than previous ({prev_rh}).")
        monthly_rh = me_total_rh - prev_rh
        conn.execute("""
            INSERT INTO monthly_rh_log
            (vessel_id, year, month, me_total_rh, monthly_rh, remarks)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (vessel_id, year, month, me_total_rh, monthly_rh, remarks))
        conn.commit()
        conn.close()
        return True, f"Entry added. Monthly RH = {monthly_rh:.0f}"
    except Exception as e:
        conn.close()
        return False, str(e)


def delete_monthly_rh(record_id, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    conn.execute(
        "DELETE FROM monthly_rh_log WHERE id=? AND vessel_id=?",
        (record_id, vessel_id)
    )
    conn.commit()
    conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# COMPONENTS
# ═══════════════════════════════════════════════════════════════════════════════

def get_all_components(vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    if not vessel_id:
        return []
    conn = get_connection()
    rows = conn.execute("""
        SELECT * FROM components WHERE vessel_id=?
        ORDER BY component_type, component_id
    """, (vessel_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_component(component_id, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    row  = conn.execute(
        "SELECT * FROM components WHERE component_id=? AND vessel_id=?",
        (component_id, vessel_id)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def insert_component(component_id, component_type, initial_rh, condition,
                     status, location, remarks, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    try:
        conn.execute("""
            INSERT INTO components
            (component_id, vessel_id, component_type, initial_rh, condition,
             current_status, current_location, total_accumulated_rh, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (component_id, vessel_id, component_type, initial_rh,
              condition, status, location, initial_rh, remarks))
        conn.commit()
        conn.close()
        return True, "Component added successfully."
    except sqlite3.IntegrityError:
        conn.close()
        return False, f"Component ID '{component_id}' already exists for this vessel."
    except Exception as e:
        conn.close()
        return False, str(e)


def update_component(component_id, component_type, condition, remarks, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    conn.execute("""
        UPDATE components SET component_type=?, condition=?, remarks=?
        WHERE component_id=? AND vessel_id=?
    """, (component_type, condition, remarks, component_id, vessel_id))
    conn.commit()
    conn.close()


def update_component_rh(component_id, new_total_rh, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    conn.execute("""
        UPDATE components SET total_accumulated_rh=?
        WHERE component_id=? AND vessel_id=?
    """, (new_total_rh, component_id, vessel_id))
    conn.commit()
    conn.close()


def update_component_fitted_at(component_id, fitted_at_me_rh, vessel_id=None):
    """
    Update the ME RH at which a component was fitted.
    This controls the live RH calculation:
        live_rh = total_accumulated_rh + (current_me_rh - fitted_at_me_rh)
    Also updates the corresponding cylinder_setup row.
    """
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    fat = float(fitted_at_me_rh) if fitted_at_me_rh is not None else None
    conn.execute("""
        UPDATE components SET fitted_at_me_rh=?
        WHERE component_id=? AND vessel_id=?
    """, (fat, component_id, vessel_id))
    # Also sync to cylinder_setup row so they stay consistent
    conn.execute("""
        UPDATE cylinder_setup SET fitted_at_me_rh=?, updated_at=datetime('now')
        WHERE vessel_id=? AND fitted_component_id=?
    """, (fat, vessel_id, component_id))
    conn.commit()
    conn.close()


def delete_component(component_id, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    conn.execute("""
        UPDATE cylinder_setup SET fitted_component_id=NULL, fitted_at_me_rh=NULL
        WHERE vessel_id=? AND fitted_component_id=?
    """, (vessel_id, component_id))
    conn.execute(
        "DELETE FROM components WHERE component_id=? AND vessel_id=?",
        (component_id, vessel_id)
    )
    conn.commit()
    conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# CYLINDER SETUP
# ═══════════════════════════════════════════════════════════════════════════════

def get_all_cylinders(vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    if not vessel_id:
        return []
    conn = get_connection()
    rows = conn.execute("""
        SELECT cs.*, c.condition, c.total_accumulated_rh, c.component_type,
               c.fitted_at_me_rh AS comp_fitted_at
        FROM cylinder_setup cs
        LEFT JOIN components c
               ON cs.fitted_component_id = c.component_id
              AND cs.vessel_id           = c.vessel_id
        WHERE cs.vessel_id=?
        ORDER BY cs.cylinder_number
    """, (vessel_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_cylinder(cylinder_number, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    row  = conn.execute(
        "SELECT * FROM cylinder_setup WHERE vessel_id=? AND cylinder_number=?",
        (vessel_id, cylinder_number)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def update_cylinder(cylinder_number, fitted_component_id, fitted_at_me_rh,
                    last_overhaul_rh, last_dismantling_rh, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    fid   = fitted_component_id if fitted_component_id else None
    fat   = float(fitted_at_me_rh) if fitted_at_me_rh is not None else None
    conn.execute("""
        UPDATE cylinder_setup SET
            fitted_component_id=?, fitted_at_me_rh=?,
            last_overhaul_rh=?, last_dismantling_rh=?,
            updated_at=datetime('now')
        WHERE vessel_id=? AND cylinder_number=?
    """, (fid, fat,
          last_overhaul_rh or 0, last_dismantling_rh or 0,
          vessel_id, cylinder_number))
    if fid:
        # Always sync fitted_at_me_rh to the component row so record_movement
        # can calculate RH correctly when the component is later removed.
        conn.execute("""
            UPDATE components
            SET current_status='In Service',
                current_location=?,
                fitted_at_me_rh=?
            WHERE component_id=? AND vessel_id=?
        """, (f"Cyl {cylinder_number}", fat, fid, vessel_id))
    conn.commit()
    conn.close()


def update_cylinder_overhaul(cylinder_number, last_overhaul_rh, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    conn.execute("""
        UPDATE cylinder_setup SET last_overhaul_rh=?, updated_at=datetime('now')
        WHERE vessel_id=? AND cylinder_number=?
    """, (last_overhaul_rh, vessel_id, cylinder_number))
    conn.commit()
    conn.close()


def update_cylinder_dismantling(cylinder_number, last_dismantling_rh, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    conn.execute("""
        UPDATE cylinder_setup SET last_dismantling_rh=?, updated_at=datetime('now')
        WHERE vessel_id=? AND cylinder_number=?
    """, (last_dismantling_rh, vessel_id, cylinder_number))
    conn.commit()
    conn.close()


def ensure_cylinders_exist(vessel_id, num_cylinders):
    conn = get_connection()
    for i in range(1, num_cylinders + 1):
        conn.execute("""
            INSERT OR IGNORE INTO cylinder_setup (vessel_id, cylinder_number)
            VALUES (?, ?)
        """, (vessel_id, i))
    conn.commit()
    conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# MOVEMENT LOG
# ═══════════════════════════════════════════════════════════════════════════════

VALID_ACTIONS   = ["Fit", "Remove", "Rotate", "Land Ashore", "Receive Onboard", "Scrap"]
VALID_LOCATIONS = (
    [f"Cyl {i}" for i in range(1, 13)]
    + ["Onboard Spare", "Landed Ashore", "Under Reconditioning", "Scrapped"]
)


def get_cylinder_locations(vessel_id=None):
    v = get_vessel_settings(vessel_id)
    n = v.get("num_cylinders", 6)
    return ([f"Cyl {i}" for i in range(1, n + 1)]
            + ["Onboard Spare", "Landed Ashore", "Under Reconditioning", "Scrapped"])


def record_movement(movement_date, me_rh, component_id, from_location,
                    to_location, action, remarks="", vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    try:
        latest_me = conn.execute("""
            SELECT me_total_rh FROM monthly_rh_log
            WHERE vessel_id=? ORDER BY year DESC, month DESC LIMIT 1
        """, (vessel_id,)).fetchone()
        if latest_me and me_rh < latest_me["me_total_rh"]:
            conn.close()
            return False, (f"ME RH at movement ({me_rh}) cannot be less than "
                           f"latest recorded ME RH ({latest_me['me_total_rh']}).")

        comp = conn.execute(
            "SELECT * FROM components WHERE component_id=? AND vessel_id=?",
            (component_id, vessel_id)
        ).fetchone()
        if not comp:
            conn.close()
            return False, f"Component '{component_id}' not found."

        comp     = dict(comp)
        rh_added = 0.0

        if action == "Fit":
            if not to_location.startswith("Cyl "):
                conn.close()
                return False, "Fit requires a cylinder as 'To Location'."
            cyl_num = int(to_location.split(" ")[1])
            if comp["current_status"] == "In Service":
                conn.close()
                return False, (f"'{component_id}' is already in service "
                               f"at {comp['current_location']}.")
            cyl_row = conn.execute(
                "SELECT * FROM cylinder_setup WHERE vessel_id=? AND cylinder_number=?",
                (vessel_id, cyl_num)
            ).fetchone()
            if cyl_row and cyl_row["fitted_component_id"]:
                existing = conn.execute(
                    "SELECT component_type FROM components "
                    "WHERE component_id=? AND vessel_id=?",
                    (cyl_row["fitted_component_id"], vessel_id)
                ).fetchone()
                if existing and existing["component_type"] == comp["component_type"]:
                    conn.close()
                    return False, (
                        f"Cyl {cyl_num} already has a {comp['component_type']} "
                        f"({cyl_row['fitted_component_id']})."
                    )
            conn.execute("""
                UPDATE components SET current_status='In Service',
                current_location=?, fitted_at_me_rh=?
                WHERE component_id=? AND vessel_id=?
            """, (to_location, me_rh, component_id, vessel_id))
            conn.execute("""
                UPDATE cylinder_setup
                SET fitted_component_id=?, fitted_at_me_rh=?, updated_at=datetime('now')
                WHERE vessel_id=? AND cylinder_number=?
            """, (component_id, me_rh, vessel_id, cyl_num))

        elif action in ("Remove", "Land Ashore", "Scrap", "Rotate"):
            if comp["current_status"] != "In Service":
                conn.close()
                return False, f"'{component_id}' is not currently in service."
            # Priority: component's own fitted_at_me_rh → cylinder's fitted_at_me_rh
            # → 0 (never fall back to me_rh which would give 0 RH added)
            comp_fitted_at = comp["fitted_at_me_rh"]
            if comp_fitted_at is None:
                # Try to recover from the cylinder row
                cyl_loc = comp.get("current_location", "")
                if cyl_loc.startswith("Cyl "):
                    cyl_n = int(cyl_loc.split(" ")[1])
                    cyl_r = conn.execute(
                        "SELECT fitted_at_me_rh FROM cylinder_setup "
                        "WHERE vessel_id=? AND cylinder_number=?",
                        (vessel_id, cyl_n)
                    ).fetchone()
                    if cyl_r and cyl_r["fitted_at_me_rh"] is not None:
                        comp_fitted_at = cyl_r["fitted_at_me_rh"]
            fitted_at = comp_fitted_at if comp_fitted_at is not None else 0.0
            rh_added  = max(0.0, me_rh - fitted_at)
            new_total = comp["total_accumulated_rh"] + rh_added
            status_map = {
                "Remove":      "Onboard Spare",
                "Land Ashore": "Landed Ashore",
                "Scrap":       "Scrapped",
                "Rotate":      "Onboard Spare",
            }
            conn.execute("""
                UPDATE components SET current_status=?, current_location=?,
                total_accumulated_rh=?, fitted_at_me_rh=NULL
                WHERE component_id=? AND vessel_id=?
            """, (status_map.get(action, "Onboard Spare"), to_location,
                  new_total, component_id, vessel_id))
            if from_location.startswith("Cyl "):
                cyl_num = int(from_location.split(" ")[1])
                conn.execute("""
                    UPDATE cylinder_setup
                    SET fitted_component_id=NULL, fitted_at_me_rh=NULL,
                    last_dismantling_rh=?, updated_at=datetime('now')
                    WHERE vessel_id=? AND cylinder_number=?
                """, (me_rh, vessel_id, cyl_num))

        elif action == "Receive Onboard":
            conn.execute("""
                UPDATE components SET current_status='Onboard Spare',
                current_location='Onboard Spare'
                WHERE component_id=? AND vessel_id=?
            """, (component_id, vessel_id))

        conn.execute("""
            INSERT INTO movement_log
            (vessel_id, movement_date, me_rh, component_id, from_location,
             to_location, action, rh_added, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (vessel_id, movement_date, me_rh, component_id,
              from_location, to_location, action, rh_added, remarks))

        conn.commit()
        conn.close()
        return True, f"Movement recorded. RH added: {rh_added:.0f}"

    except Exception as e:
        conn.close()
        return False, str(e)


def get_movement_log(component_id=None, limit=200, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    if not vessel_id:
        return []
    conn = get_connection()
    if component_id:
        rows = conn.execute("""
            SELECT * FROM movement_log
            WHERE vessel_id=? AND component_id=?
            ORDER BY movement_date DESC, id DESC LIMIT ?
        """, (vessel_id, component_id, limit)).fetchall()
    else:
        rows = conn.execute("""
            SELECT * FROM movement_log WHERE vessel_id=?
            ORDER BY movement_date DESC, id DESC LIMIT ?
        """, (vessel_id, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_movement(movement_id, vessel_id=None):
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    conn.execute(
        "DELETE FROM movement_log WHERE id=? AND vessel_id=?",
        (movement_id, vessel_id)
    )
    conn.commit()
    conn.close()



# ═══════════════════════════════════════════════════════════════════════════════
# DATA REPAIR
# ═══════════════════════════════════════════════════════════════════════════════

def recalculate_all_component_rh(vessel_id=None):
    """
    Recalculate total_accumulated_rh for every component from the movement log.

    RH accounting model:
    ─────────────────────────────────────────────────────
    total_accumulated_rh (stored) = initial_rh
                                   + SUM(rh_added) from all removal movements
    live display RH               = total_accumulated_rh
                                   + (current_me_rh - fitted_at_me_rh)  [if In Service]

    The stored total only grows when a component is REMOVED (rh credited at removal).
    Live RH is computed on-the-fly in calculations.py.
    ─────────────────────────────────────────────────────

    Also repairs fitted_at_me_rh on In-Service components where it is NULL
    (caused by old bug) by recovering from the cylinder_setup row.

    Returns (fixed_count, detail_list).
    """
    if vessel_id is None:
        vessel_id = get_app_state().get("active_vessel_id")
    conn = get_connection()
    components = conn.execute(
        "SELECT * FROM components WHERE vessel_id=?", (vessel_id,)
    ).fetchall()

    fixed = []

    # ── Step 1: Repair fitted_at_me_rh on In-Service components ──────────────
    # Must happen BEFORE recalculating totals so removal logic works correctly.
    in_service_null = conn.execute("""
        SELECT c.component_id, cs.fitted_at_me_rh AS cyl_fat
        FROM components c
        JOIN cylinder_setup cs
          ON c.current_location = ('Cyl ' || cs.cylinder_number)
         AND cs.vessel_id = c.vessel_id
        WHERE c.vessel_id=?
          AND c.current_status = 'In Service'
          AND c.fitted_at_me_rh IS NULL
          AND cs.fitted_at_me_rh IS NOT NULL
    """, (vessel_id,)).fetchall()

    for row in in_service_null:
        conn.execute("""
            UPDATE components SET fitted_at_me_rh=?
            WHERE component_id=? AND vessel_id=?
        """, (row["cyl_fat"], row["component_id"], vessel_id))

    # ── Step 2: Recalculate stored total from movement log ────────────────────
    for comp in components:
        cid = comp["component_id"]
        row = conn.execute("""
            SELECT COALESCE(SUM(rh_added), 0) AS total
            FROM movement_log
            WHERE vessel_id=? AND component_id=?
        """, (vessel_id, cid)).fetchone()
        rh_from_log = float(row["total"]) if row else 0.0
        new_total   = float(comp["initial_rh"] or 0.0) + rh_from_log

        if abs(new_total - float(comp["total_accumulated_rh"] or 0.0)) > 0.01:
            conn.execute("""
                UPDATE components SET total_accumulated_rh=?
                WHERE component_id=? AND vessel_id=?
            """, (new_total, cid, vessel_id))
            fixed.append({
                "component_id": cid,
                "old_rh": comp["total_accumulated_rh"],
                "new_rh": new_total,
            })

    conn.commit()
    conn.close()
    return len(fixed), fixed


# ═══════════════════════════════════════════════════════════════════════════════
# SEED DATA
# ═══════════════════════════════════════════════════════════════════════════════

def seed_demo_vessel():
    """Create the MT. BOCHEM MARENGO demo vessel if no vessels exist."""
    conn = get_connection()
    count = conn.execute("SELECT COUNT(*) FROM vessels").fetchone()[0]
    conn.close()
    if count > 0:
        return

    vid = create_vessel(
        vessel_name            = "MT. BOCHEM MARENGO",
        imo_number             = "9876543",
        vessel_type            = "Chemical Tanker",
        engine_make            = "MAN B&W",
        engine_model           = "6S50MC-C",
        num_cylinders          = 6,
        crown_overhaul_rh      = 24000,
        crown_warning_rh       = 20000,
        dismantling_warning_rh = 16000,
    )

    conn = get_connection()
    for c in [
        ("6033-1","Piston Crown",0,"Original","In Service","Cyl 1",43836,43836-18371),
        ("6033-2","Piston Crown",0,"Original","In Service","Cyl 2",43836,43836-8975),
        ("6033-3","Piston Crown",0,"New",     "In Service","Cyl 6",3692, 0),
        ("6033-4","Piston Crown",0,"Original","In Service","Cyl 4",43836,43836-16755),
        ("6033-5","Piston Crown",0,"Original","Onboard Spare","Onboard Spare",40223,None),
        ("6033-6","Piston Crown",0,"Original","In Service","Cyl 5",40980,40980-3504),
        ("6033-7","Piston Crown",0,"Reconditioned","In Service","Cyl 3",10296,0),
        ("R1-CYL1","Piston Ring No.1",0,"Original","In Service","Cyl 1",18371,None),
        ("R1-SPARE","Piston Ring No.1",0,"New","Onboard Spare","Onboard Spare",0,None),
    ]:
        conn.execute("""
            INSERT OR IGNORE INTO components
            (component_id,vessel_id,component_type,initial_rh,condition,
             current_status,current_location,total_accumulated_rh,fitted_at_me_rh)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, (c[0],vid,c[1],c[2],c[3],c[4],c[5],c[6],c[7]))

    for cyl in [
        (1,"6033-1",43836-18371,43836-6272, 43836-18371),
        (2,"6033-2",43836-8975, 43836-8975, 43836-8975),
        (3,"6033-7",0,          0,           0),
        (4,"6033-4",43836-16755,43836-7313, 43836-16755),
        (5,"6033-6",40980-3504, 40980-3504, 40980-3504),
        (6,"6033-3",0,          0,           0),
    ]:
        conn.execute("""
            UPDATE cylinder_setup SET
                fitted_component_id=?,fitted_at_me_rh=?,
                last_overhaul_rh=?,last_dismantling_rh=?
            WHERE vessel_id=? AND cylinder_number=?
        """, (cyl[1],cyl[2],cyl[3],cyl[4],vid,cyl[0]))

    conn.execute("""
        INSERT OR IGNORE INTO monthly_rh_log
        (vessel_id,year,month,me_total_rh,monthly_rh,remarks)
        VALUES (?,2026,5,43836,720,'Seed entry – May 2026')
    """, (vid,))
    conn.commit()
    conn.close()
    set_active_vessel(vid)
