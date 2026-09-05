"""
Database Layer (SQLite)
==========================
Lightweight persistence so telemetry, alerts, anomalies, What-If runs and
equipment-health snapshots survive an API restart. Uses the stdlib sqlite3
module directly (no heavy ORM needed for this scope) with a thin
connection-per-call pattern suitable for a single-process demo backend.
"""
from __future__ import annotations
import json
import sqlite3
import os
from contextlib import contextmanager
from datetime import datetime

DB_PATH = os.getenv("POLAR_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "polar_ai.db"))
DB_PATH = os.path.abspath(DB_PATH)


@contextmanager
def get_conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("""CREATE TABLE IF NOT EXISTS telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            station TEXT NOT NULL,
            tick INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            data TEXT NOT NULL
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_station_tick ON telemetry(station, tick)")

        c.execute("""CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            station TEXT NOT NULL,
            severity TEXT NOT NULL,
            source TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            recommended_action TEXT,
            status TEXT NOT NULL DEFAULT 'OPEN',
            created_at TEXT NOT NULL,
            acknowledged_at TEXT,
            resolved_at TEXT
        )""")

        c.execute("""CREATE TABLE IF NOT EXISTS anomalies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            station TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            metric TEXT NOT NULL,
            severity TEXT NOT NULL,
            value REAL,
            anomaly_score REAL,
            possible_cause TEXT,
            recommendation TEXT
        )""")

        c.execute("""CREATE TABLE IF NOT EXISTS equipment_health (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            station TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            name TEXT NOT NULL,
            score INTEGER NOT NULL,
            status TEXT NOT NULL,
            metrics TEXT,
            recommendation TEXT
        )""")

        c.execute("""CREATE TABLE IF NOT EXISTS whatif_scenarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            station TEXT NOT NULL,
            created_at TEXT NOT NULL,
            input_json TEXT NOT NULL,
            output_json TEXT NOT NULL
        )""")

        c.execute("""CREATE TABLE IF NOT EXISTS optimization_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            station TEXT NOT NULL,
            tick INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            decision_json TEXT NOT NULL
        )""")

        c.execute("""CREATE TABLE IF NOT EXISTS advisor_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            station TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            source TEXT NOT NULL
        )""")

        c.execute("""CREATE TABLE IF NOT EXISTS scenario_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            station TEXT NOT NULL,
            created_at TEXT NOT NULL,
            event_type TEXT NOT NULL,
            details TEXT
        )""")


# ---------------------------------------------------------------- telemetry
def insert_telemetry(station: str, tick_data: dict):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO telemetry (station, tick, timestamp, data) VALUES (?, ?, ?, ?)",
            (station, tick_data["tick"], tick_data["timestamp"], json.dumps(tick_data)),
        )


def get_recent_telemetry(station: str, limit: int = 1000) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT data FROM telemetry WHERE station=? ORDER BY tick DESC LIMIT ?",
            (station, limit),
        ).fetchall()
    return [json.loads(r["data"]) for r in reversed(rows)]


def count_telemetry(station: str) -> int:
    with get_conn() as conn:
        row = conn.execute("SELECT COUNT(*) as n FROM telemetry WHERE station=?", (station,)).fetchone()
    return row["n"] if row else 0


# ------------------------------------------------------------------ alerts
def create_alert(station: str, severity: str, source: str, title: str, description: str,
                  recommended_action: str = "") -> int:
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO alerts (station, severity, source, title, description, recommended_action,
               status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)""",
            (station, severity, source, title, description, recommended_action, datetime.utcnow().isoformat()),
        )
        return cur.lastrowid


def list_alerts(station: str, status: str | None = None) -> list[dict]:
    with get_conn() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM alerts WHERE station=? AND status=? ORDER BY created_at DESC",
                (station, status),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM alerts WHERE station=? ORDER BY created_at DESC LIMIT 200", (station,)
            ).fetchall()
    return [dict(r) for r in rows]


def update_alert_status(alert_id: int, status: str) -> bool:
    field = {"ACKNOWLEDGED": "acknowledged_at", "RESOLVED": "resolved_at"}.get(status)
    with get_conn() as conn:
        if field:
            conn.execute(f"UPDATE alerts SET status=?, {field}=? WHERE id=?",
                         (status, datetime.utcnow().isoformat(), alert_id))
        else:
            conn.execute("UPDATE alerts SET status=? WHERE id=?", (status, alert_id))
        return conn.total_changes > 0


def alert_exists_open(station: str, title: str) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM alerts WHERE station=? AND title=? AND status='OPEN'", (station, title)
        ).fetchone()
    return row is not None


# --------------------------------------------------------------- anomalies
def insert_anomalies(station: str, anomalies: list[dict]):
    if not anomalies:
        return
    with get_conn() as conn:
        conn.executemany(
            """INSERT INTO anomalies (station, timestamp, metric, severity, value, anomaly_score,
               possible_cause, recommendation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            [(station, a["timestamp"], a["metric"], a["severity"], a["value"], a["anomaly_score"],
              a["possible_cause"], a["recommendation"]) for a in anomalies],
        )


def list_anomalies(station: str, limit: int = 50) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM anomalies WHERE station=? ORDER BY timestamp DESC LIMIT ?", (station, limit)
        ).fetchall()
    return [dict(r) for r in rows]


# --------------------------------------------------------- equipment health
def insert_equipment_health(station: str, items: list[dict]):
    ts = datetime.utcnow().isoformat()
    with get_conn() as conn:
        conn.executemany(
            """INSERT INTO equipment_health (station, timestamp, name, score, status, metrics, recommendation)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            [(station, ts, i["name"], i["score"], i["status"], json.dumps(i["metrics"]), i["recommendation"])
             for i in items],
        )


def latest_equipment_health(station: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT * FROM equipment_health WHERE station=? AND timestamp = (
                 SELECT MAX(timestamp) FROM equipment_health WHERE station=?)""",
            (station, station),
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------- what-if
def save_whatif(station: str, input_data: dict, output_data: dict) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO whatif_scenarios (station, created_at, input_json, output_json) VALUES (?, ?, ?, ?)",
            (station, datetime.utcnow().isoformat(), json.dumps(input_data), json.dumps(output_data)),
        )
        return cur.lastrowid


def list_whatif(station: str, limit: int = 20) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM whatif_scenarios WHERE station=? ORDER BY created_at DESC LIMIT ?",
            (station, limit),
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------- optimizer log
def insert_optimization_result(station: str, tick: int, timestamp: str, decision: dict):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO optimization_results (station, tick, timestamp, decision_json) VALUES (?, ?, ?, ?)",
            (station, tick, timestamp, json.dumps(decision)),
        )


# ------------------------------------------------------------------ advisor
def insert_advisor_conversation(station: str, question: str, answer: str, source: str):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO advisor_conversations (station, timestamp, question, answer, source) VALUES (?, ?, ?, ?, ?)",
            (station, datetime.utcnow().isoformat(), question, answer, source),
        )


def list_advisor_conversations(station: str, limit: int = 50) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM advisor_conversations WHERE station=? ORDER BY timestamp DESC LIMIT ?",
            (station, limit),
        ).fetchall()
    return [dict(r) for r in reversed(rows)]


# ------------------------------------------------------------------ events
def insert_scenario_event(station: str, event_type: str, details: dict):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO scenario_events (station, created_at, event_type, details) VALUES (?, ?, ?, ?)",
            (station, datetime.utcnow().isoformat(), event_type, json.dumps(details)),
        )

# Initialize database tables before any service accesses the database.
init_db()