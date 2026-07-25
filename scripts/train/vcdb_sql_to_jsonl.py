#!/usr/bin/env python3
"""
AutoCare VCdb MySQL dump → AI training JSONL

IMPORTANT
---------
This file is AutoCare **VCdb** (Vehicle Configuration Database):
Year / Make / Model / SubModel / Engine / Transmission / Drive / Brakes / …

It does **NOT** contain OEM part numbers, aftermarket brands, or prices.
Those live in AutoCare **PCdb / PAdb / ACES** catalogs.

This script still produces high-value Garage Genius training pairs:
  - vehicle fitment lookup
  - engine / transmission / drive options
  - DIY coaching that uses accurate vehicle configuration context
  - synthetic “parts recommendation” templates grounded in real vehicle configs
    (OEM numbers are marked as VERIFY-WITH-VIN until you add a parts dump)

Usage
-----
  python3 scripts/train/vcdb_sql_to_jsonl.py \\
    --sql "/path/to/AutoCare_VCdb_....sql" \\
    --out scripts/data/vcdb-train.jsonl \\
    --limit 20000

  # Also build a local SQLite cache for reuse:
  python3 scripts/train/vcdb_sql_to_jsonl.py --sql ... --sqlite /tmp/vcdb.sqlite --limit 5000
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sqlite3
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator


DISCLAIMER = (
    "Not professional mechanic advice — verify fitment with your VIN and a "
    "licensed mechanic when unsure."
)

# Makes we overweight for US DIY DIY coaching relevance
PRIORITY_MAKES = {
    "toyota",
    "honda",
    "ford",
    "chevrolet",
    "chevy",
    "nissan",
    "hyundai",
    "kia",
    "subaru",
    "mazda",
    "jeep",
    "ram",
    "gmc",
    "bmw",
    "mercedes-benz",
    "volkswagen",
    "audi",
    "lexus",
    "acura",
    "dodge",
    "chrysler",
    "buick",
    "cadillac",
    "volvo",
    "tesla",
}


# ── MySQL dump parsing ─────────────────────────────────────────────

INSERT_RE = re.compile(
    r"^INSERT INTO `(?P<table>[^`]+)` VALUES (?P<body>.*);?\s*$",
    re.IGNORECASE,
)
CREATE_RE = re.compile(
    r"CREATE TABLE `(?P<table>[^`]+)` \((?P<body>.*?)\) ENGINE=",
    re.IGNORECASE | re.DOTALL,
)


def split_mysql_tuples(body: str) -> list[str]:
    """Split INSERT VALUES body into raw tuple strings (without outer parens)."""
    body = body.strip()
    if body.endswith(";"):
        body = body[:-1].rstrip()
    tuples: list[str] = []
    i = 0
    n = len(body)
    while i < n:
        while i < n and body[i] in " \t\r\n,":
            i += 1
        if i >= n:
            break
        if body[i] != "(":
            # unexpected — skip char
            i += 1
            continue
        i += 1  # skip '('
        start = i
        depth = 1
        in_str = False
        escape = False
        while i < n and depth > 0:
            ch = body[i]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == "'":
                    # MySQL '' escape inside strings
                    if i + 1 < n and body[i + 1] == "'":
                        i += 1
                    else:
                        in_str = False
            else:
                if ch == "'":
                    in_str = True
                elif ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
                    if depth == 0:
                        tuples.append(body[start:i])
                        i += 1
                        break
            i += 1
    return tuples


def parse_sql_value(token: str) -> Any:
    token = token.strip()
    if token.upper() == "NULL":
        return None
    if token.startswith("'") and token.endswith("'"):
        inner = token[1:-1]
        inner = inner.replace("''", "'").replace("\\'", "'").replace("\\\\", "\\")
        return inner
    try:
        if "." in token:
            return float(token)
        return int(token)
    except ValueError:
        return token


def split_tuple_values(raw: str) -> list[Any]:
    vals: list[str] = []
    i = 0
    n = len(raw)
    cur: list[str] = []
    in_str = False
    escape = False
    while i < n:
        ch = raw[i]
        if in_str:
            cur.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == "'":
                if i + 1 < n and raw[i + 1] == "'":
                    cur.append("'")
                    i += 1
                else:
                    in_str = False
        else:
            if ch == "'":
                in_str = True
                cur.append(ch)
            elif ch == ",":
                vals.append("".join(cur).strip())
                cur = []
            else:
                cur.append(ch)
        i += 1
    if cur or vals:
        vals.append("".join(cur).strip())
    return [parse_sql_value(v) for v in vals]


def extract_columns(create_body: str) -> list[str]:
    cols: list[str] = []
    for line in create_body.split("\n"):
        line = line.strip().rstrip(",")
        m = re.match(r"`([^`]+)`\s+", line)
        if not m:
            continue
        upper = line.upper()
        if upper.startswith(("PRIMARY", "KEY", "CONSTRAINT", "UNIQUE", "INDEX")):
            continue
        cols.append(m.group(1))
    return cols


def import_dump_to_sqlite(sql_path: Path, sqlite_path: Path, tables: set[str] | None = None) -> None:
    """Stream MySQL dump into SQLite. Replaces existing DB."""
    if sqlite_path.exists():
        sqlite_path.unlink()
    conn = sqlite3.connect(str(sqlite_path))
    conn.execute("PRAGMA journal_mode=OFF")
    conn.execute("PRAGMA synchronous=OFF")
    cur = conn.cursor()

    create_map: dict[str, list[str]] = {}
    buf = sql_path.read_text(encoding="latin-1", errors="replace")

    for m in CREATE_RE.finditer(buf):
        name = m.group("table")
        if tables and name not in tables:
            continue
        cols = extract_columns(m.group("body"))
        create_map[name] = cols
        col_sql = ", ".join(f'"{c}" TEXT' for c in cols)
        cur.execute(f'CREATE TABLE IF NOT EXISTS "{name}" ({col_sql})')

    print(f"[sqlite] created {len(create_map)} tables → {sqlite_path}", file=sys.stderr)

    # Stream inserts line-by-line (each INSERT is typically one giant line)
    inserted = 0
    with sql_path.open("r", encoding="latin-1", errors="replace") as f:
        for line_no, line in enumerate(f, 1):
            if not line.startswith("INSERT INTO"):
                continue
            m = INSERT_RE.match(line.rstrip("\n"))
            if not m:
                # multi-line unlikely in this dump; skip
                continue
            table = m.group("table")
            if table not in create_map:
                continue
            cols = create_map[table]
            placeholders = ",".join("?" for _ in cols)
            col_list = ",".join(f'"{c}"' for c in cols)
            sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})'
            batch: list[tuple[Any, ...]] = []
            for raw in split_mysql_tuples(m.group("body")):
                values = split_tuple_values(raw)
                if len(values) < len(cols):
                    values = values + [None] * (len(cols) - len(values))
                elif len(values) > len(cols):
                    values = values[: len(cols)]
                batch.append(tuple(values))
                if len(batch) >= 2000:
                    cur.executemany(sql, batch)
                    inserted += len(batch)
                    batch = []
            if batch:
                cur.executemany(sql, batch)
                inserted += len(batch)
            if line_no % 50 == 0:
                conn.commit()
                print(f"[sqlite] … {inserted:,} rows (line {line_no})", file=sys.stderr)

    conn.commit()
    print(f"[sqlite] done — {inserted:,} rows total", file=sys.stderr)
    conn.close()


# ── Vehicle profiles ───────────────────────────────────────────────

NEEDED_TABLES = {
    "Year",
    "Make",
    "Model",
    "SubModel",
    "BaseVehicle",
    "Vehicle",
    "VehicleType",
    "Region",
    "DriveType",
    "VehicleToDriveType",
    "EngineBase",
    "Aspiration",
    "FuelType",
    "EngineConfig",
    "VehicleToEngineConfig",
    "TransmissionType",
    "TransmissionNumSpeeds",
    "TransmissionControlType",
    "TransmissionBase",
    "Transmission",
    "VehicleToTransmission",
    "BrakeType",
    "BrakeABS",
    "BrakeConfig",
    "VehicleToBrakeConfig",
}


@dataclass
class VehicleProfile:
    vehicle_id: int
    year: int
    make: str
    model: str
    submodel: str | None
    vehicle_type: str | None
    region: str | None
    engines: list[str]
    transmissions: list[str]
    drive_types: list[str]
    brakes: list[str]

    @property
    def label(self) -> str:
        bits = [str(self.year), self.make, self.model]
        if self.submodel and self.submodel not in ("-", "N/A", "N/R", "U/K"):
            bits.append(self.submodel)
        return " ".join(bits)


def q(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    return list(conn.execute(sql, args))


def load_lookup(conn: sqlite3.Connection, table: str, id_col: str, name_col: str) -> dict[int, str]:
    out: dict[int, str] = {}
    try:
        for row in q(conn, f'SELECT "{id_col}", "{name_col}" FROM "{table}"'):
            try:
                out[int(row[0])] = str(row[1] or "").strip()
            except (TypeError, ValueError):
                continue
    except sqlite3.Error:
        pass
    return out


def build_profiles(conn: sqlite3.Connection, max_vehicles: int, seed: int) -> list[VehicleProfile]:
    rng = random.Random(seed)

    makes = load_lookup(conn, "Make", "MakeID", "MakeName")
    models = {int(r[0]): (str(r[1] or ""), r[2]) for r in q(conn, 'SELECT "ModelID","ModelName","VehicleTypeID" FROM "Model"')}
    submodels = load_lookup(conn, "SubModel", "SubModelID", "SubModelName")
    vtypes = load_lookup(conn, "VehicleType", "VehicleTypeID", "VehicleTypeName")
    regions = load_lookup(conn, "Region", "RegionID", "RegionName")
    drive = load_lookup(conn, "DriveType", "DriveTypeID", "DriveTypeName")
    aspiration = load_lookup(conn, "Aspiration", "AspirationID", "AspirationName")
    fuel = load_lookup(conn, "FuelType", "FuelTypeID", "FuelTypeName")
    brake_type = load_lookup(conn, "BrakeType", "BrakeTypeID", "BrakeTypeName")
    brake_abs = load_lookup(conn, "BrakeABS", "BrakeABSID", "BrakeABSName")

    # EngineConfig → readable string
    engine_cfg: dict[int, str] = {}
    for r in q(
        conn,
        """
        SELECT ec."EngineConfigID", eb."Liter", eb."Cylinders", eb."BlockType",
               ec."AspirationID", ec."FuelTypeID"
        FROM "EngineConfig" ec
        LEFT JOIN "EngineBase" eb ON eb."EngineBaseID" = ec."EngineBaseID"
        """,
    ):
        lit = (r["Liter"] or "").strip()
        cyl = (r["Cylinders"] or "").strip()
        block = (r["BlockType"] or "").strip()
        asp = aspiration.get(int(r["AspirationID"] or 0), "")
        ft = fuel.get(int(r["FuelTypeID"] or 0), "")
        parts = []
        if lit and lit not in ("-", "N/A", "N/R", "U/K"):
            parts.append(f"{lit}L")
        if cyl and block and cyl not in ("-", "N/A"):
            parts.append(f"{block}{cyl}")
        elif cyl and cyl not in ("-", "N/A"):
            parts.append(f"{cyl}-cyl")
        if asp and asp not in ("-", "N/A", "N/R", "U/K", "Naturally Aspirated"):
            parts.append(asp)
        elif asp == "Naturally Aspirated":
            parts.append("NA")
        if ft and ft not in ("-", "N/A", "N/R", "U/K"):
            parts.append(ft)
        engine_cfg[int(r["EngineConfigID"])] = " ".join(parts) if parts else "Unknown engine"

    # Transmission readable
    trans_cfg: dict[int, str] = {}
    for r in q(
        conn,
        """
        SELECT t."TransmissionID",
               tt."TransmissionTypeName",
               tn."TransmissionNumSpeeds",
               tc."TransmissionControlTypeName"
        FROM "Transmission" t
        LEFT JOIN "TransmissionBase" tb ON tb."TransmissionBaseID" = t."TransmissionBaseID"
        LEFT JOIN "TransmissionType" tt ON tt."TransmissionTypeID" = tb."TransmissionTypeID"
        LEFT JOIN "TransmissionNumSpeeds" tn ON tn."TransmissionNumSpeedsID" = tb."TransmissionNumSpeedsID"
        LEFT JOIN "TransmissionControlType" tc ON tc."TransmissionControlTypeID" = tb."TransmissionControlTypeID"
        """,
    ):
        bits = []
        for v in (r["TransmissionNumSpeeds"], r["TransmissionTypeName"], r["TransmissionControlTypeName"]):
            s = str(v or "").strip()
            if s and s not in ("-", "N/A", "N/R", "U/K"):
                bits.append(s)
        trans_cfg[int(r["TransmissionID"])] = " ".join(bits) if bits else "Unknown transmission"

    brake_cfg: dict[int, str] = {}
    for r in q(
        conn,
        """
        SELECT "BrakeConfigID","FrontBrakeTypeID","RearBrakeTypeID","BrakeABSID"
        FROM "BrakeConfig"
        """,
    ):
        front = brake_type.get(int(r["FrontBrakeTypeID"] or 0), "")
        rear = brake_type.get(int(r["RearBrakeTypeID"] or 0), "")
        abs_n = brake_abs.get(int(r["BrakeABSID"] or 0), "")
        bits = []
        if front:
            bits.append(f"front {front}")
        if rear:
            bits.append(f"rear {rear}")
        if abs_n and abs_n not in ("-", "N/A"):
            bits.append(f"ABS: {abs_n}")
        brake_cfg[int(r["BrakeConfigID"])] = ", ".join(bits) if bits else "Unknown brakes"

    # Junction maps
    v_engines: dict[int, set[str]] = defaultdict(set)
    for r in q(conn, 'SELECT "VehicleID","EngineConfigID" FROM "VehicleToEngineConfig"'):
        vid, eid = int(r[0]), int(r[1])
        if eid in engine_cfg:
            v_engines[vid].add(engine_cfg[eid])

    v_trans: dict[int, set[str]] = defaultdict(set)
    for r in q(conn, 'SELECT "VehicleID","TransmissionID" FROM "VehicleToTransmission"'):
        vid, tid = int(r[0]), int(r[1])
        if tid in trans_cfg:
            v_trans[vid].add(trans_cfg[tid])

    v_drive: dict[int, set[str]] = defaultdict(set)
    for r in q(conn, 'SELECT "VehicleID","DriveTypeID" FROM "VehicleToDriveType"'):
        vid, did = int(r[0]), int(r[1])
        name = drive.get(did, "")
        if name and name not in ("-", "N/A"):
            v_drive[vid].add(name)

    v_brake: dict[int, set[str]] = defaultdict(set)
    for r in q(conn, 'SELECT "VehicleID","BrakeConfigID" FROM "VehicleToBrakeConfig"'):
        vid, bid = int(r[0]), int(r[1])
        if bid in brake_cfg:
            v_brake[vid].add(brake_cfg[bid])

    # Candidate vehicles: prefer recent + priority makes
    rows = q(
        conn,
        """
        SELECT v."VehicleID", bv."YearID", bv."MakeID", bv."ModelID",
               v."SubModelID", v."RegionID"
        FROM "Vehicle" v
        JOIN "BaseVehicle" bv ON bv."BaseVehicleID" = v."BaseVehicleID"
        WHERE CAST(bv."YearID" AS INTEGER) >= 2005
        """,
    )

    scored: list[tuple[float, sqlite3.Row]] = []
    for r in rows:
        make = makes.get(int(r["MakeID"] or 0), "")
        year = int(r["YearID"] or 0)
        score = 1.0
        if make.lower() in PRIORITY_MAKES:
            score += 3.0
        if year >= 2015:
            score += 2.0
        elif year >= 2010:
            score += 1.0
        score += rng.random() * 0.3
        scored.append((score, r))

    scored.sort(key=lambda x: -x[0])
    picked = [r for _, r in scored[: max_vehicles * 3]]
    rng.shuffle(picked)
    picked = picked[:max_vehicles]

    profiles: list[VehicleProfile] = []
    for r in picked:
        vid = int(r["VehicleID"])
        make_id = int(r["MakeID"] or 0)
        model_id = int(r["ModelID"] or 0)
        make = makes.get(make_id, "Unknown")
        model_name, vtype_id = models.get(model_id, ("Unknown", None))
        sm_id = r["SubModelID"]
        sub = submodels.get(int(sm_id), None) if sm_id not in (None, "") else None
        region = regions.get(int(r["RegionID"] or 0))
        vtype = vtypes.get(int(vtype_id or 0)) if vtype_id not in (None, "") else None

        profiles.append(
            VehicleProfile(
                vehicle_id=vid,
                year=int(r["YearID"] or 0),
                make=make,
                model=model_name,
                submodel=sub,
                vehicle_type=vtype,
                region=region,
                engines=sorted(v_engines.get(vid, set())),
                transmissions=sorted(v_trans.get(vid, set())),
                drive_types=sorted(v_drive.get(vid, set())),
                brakes=sorted(v_brake.get(vid, set())),
            )
        )

    print(f"[profiles] built {len(profiles)} vehicle profiles", file=sys.stderr)
    return profiles


# ── JSONL sample generation ────────────────────────────────────────

PART_CATEGORIES = [
    ("brake pads", "brakes", "front brake pads"),
    ("brake rotors", "brakes", "front brake rotors"),
    ("engine oil filter", "engine", "oil filter"),
    ("cabin air filter", "hvac", "cabin filter"),
    ("engine air filter", "engine", "engine air filter"),
    ("spark plugs", "engine", "spark plugs"),
    ("serpentine belt", "engine", "serpentine / drive belt"),
    ("battery", "electrical", "12V battery"),
    ("wiper blades", "lights", "wiper blades"),
    ("shock absorbers", "suspension", "front shocks / struts"),
]


def clean_list(items: list[str], limit: int = 8) -> list[str]:
    out = []
    for x in items:
        x = x.strip()
        if not x or x in out:
            continue
        out.append(x)
        if len(out) >= limit:
            break
    return out


def sample_record(
    instruction: str,
    response: str,
    *,
    meta: dict[str, Any],
) -> dict[str, Any]:
    return {
        "instruction": instruction.strip(),
        "response": response.strip(),
        "metadata": meta,
    }


def gen_vehicle_identity(p: VehicleProfile, rng: random.Random) -> list[dict[str, Any]]:
    sm = f" {p.submodel}" if p.submodel else ""
    prompts = [
        f"What vehicle is a {p.year} {p.make} {p.model}{sm}?",
        f"Confirm the configuration basics for my {p.year} {p.make} {p.model}.",
        f"I'm working on a {p.year} {p.make} {p.model}{sm}. What should I know about this vehicle type?",
    ]
    vtype = p.vehicle_type or "passenger vehicle"
    region = p.region or "North America"
    resp = (
        f"You're looking at a **{p.label}** ({vtype}, {region} catalog region).\n\n"
        f"Use this exact fitment when shopping parts or following DIY steps: "
        f"**{p.year} {p.make} {p.model}**"
        + (f" · trim/submodel **{p.submodel}**" if p.submodel else "")
        + ".\n\n"
        "If you have a VIN, I can refine engine/transmission options further.\n\n"
        f"{DISCLAIMER}"
    )
    return [
        sample_record(rng.choice(prompts), resp, meta={"type": "vehicle_identity", "vehicle_id": p.vehicle_id})
    ]


def gen_engine_options(p: VehicleProfile, rng: random.Random) -> list[dict[str, Any]]:
    engines = clean_list(p.engines)
    if not engines:
        return []
    q_opts = [
        f"What engines were available on the {p.year} {p.make} {p.model}?",
        f"My {p.year} {p.make} {p.model} — which engine configs exist in VCDB?",
        f"List engine options for a {p.label}.",
    ]
    bullets = "\n".join(f"- {e}" for e in engines)
    resp = (
        f"For the **{p.label}**, these engine configurations appear in AutoCare VCdb:\n\n"
        f"{bullets}\n\n"
        "Focus Mode tip: identify **which engine you actually have** (hood sticker, VIN decode, "
        "or under-hood label) before ordering sensors, plugs, or filters.\n\n"
        f"{DISCLAIMER}"
    )
    return [sample_record(rng.choice(q_opts), resp, meta={"type": "engine_options", "vehicle_id": p.vehicle_id})]


def gen_transmission_drive(p: VehicleProfile, rng: random.Random) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    trans = clean_list(p.transmissions)
    drives = clean_list(p.drive_types)
    if trans:
        resp = (
            f"Transmission options listed for **{p.label}**:\n\n"
            + "\n".join(f"- {t}" for t in trans)
            + "\n\nIf your car slips, flares, or delays engagement, tell me whether it's auto/manual "
            "and when it happens (cold, hot, upshift, downshift).\n\n"
            f"{DISCLAIMER}"
        )
        out.append(
            sample_record(
                f"What transmissions fit a {p.year} {p.make} {p.model}?",
                resp,
                meta={"type": "transmission_options", "vehicle_id": p.vehicle_id},
            )
        )
    if drives:
        resp = (
            f"Drive types for **{p.label}** in VCdb:\n\n"
            + "\n".join(f"- {d}" for d in drives)
            + "\n\nAWD/4WD vs FWD/RWD changes parts like hubs, axles, and some sensors — "
            "confirm yours before buying.\n\n"
            f"{DISCLAIMER}"
        )
        out.append(
            sample_record(
                f"Is my {p.year} {p.make} {p.model} FWD, RWD, or AWD?",
                resp,
                meta={"type": "drive_type", "vehicle_id": p.vehicle_id},
            )
        )
    return out


def gen_brake_config(p: VehicleProfile, rng: random.Random) -> list[dict[str, Any]]:
    brakes = clean_list(p.brakes, limit=5)
    if not brakes:
        return []
    resp = (
        f"Brake configurations linked to **{p.label}**:\n\n"
        + "\n".join(f"- {b}" for b in brakes)
        + "\n\n**Focus Mode — BRAKES first** if you hear grinding or the pedal feels soft. "
        "Next action: measure pad thickness through the wheel and tell me if the pedal is firm or spongy.\n\n"
        f"{DISCLAIMER}"
    )
    return [
        sample_record(
            f"What brake setup does a {p.year} {p.make} {p.model} use?",
            resp,
            meta={"type": "brake_config", "vehicle_id": p.vehicle_id},
        )
    ]


def gen_parts_recommendation(p: VehicleProfile, rng: random.Random) -> list[dict[str, Any]]:
    """
    Synthetic parts Q&A grounded in real vehicle fitment.
    OEM numbers are intentionally NOT hallucinated — user must supply PCdb later.
    """
    part_name, category, short = rng.choice(PART_CATEGORIES)
    engine_hint = p.engines[0] if p.engines else "your engine"
    prompts = [
        f"I need {part_name} for my {p.year} {p.make} {p.model}. What should I buy?",
        f"Recommend {short} that fit a {p.label}.",
        f"My {p.year} {p.make} {p.model} needs new {part_name}. Help me choose OEM vs aftermarket.",
    ]
    focus = {
        "brakes": "brakes",
        "engine": "engine",
        "hvac": "hvac",
        "electrical": "battery",
        "suspension": "suspension",
        "lights": "lights",
    }.get(category, "engine")

    resp = (
        f"Let's tackle **{part_name}** for your **{p.label}** "
        f"(config note: {engine_hint}).\n\n"
        f"**Focus Mode — primary area: {focus.upper()}**\n\n"
        "1. Confirm fitment: year / make / model"
        + (f" / {p.submodel}" if p.submodel else "")
        + f" and engine ({engine_hint}).\n"
        "2. Prefer **1 OEM** option + **1–2 quality aftermarket** (Bosch, Denso, Aisin, Moog, ACDelco, etc.).\n"
        "3. I do **not** invent OEM numbers from VCdb alone — look up the OEM in a parts catalog "
        "(RockAuto / dealer EPC) or paste your VIN and I'll refine.\n\n"
        "Suggested shopping query:\n"
        f"`{p.year} {p.make} {p.model} {short}`\n\n"
        "<focus>"
        f"{focus}"
        "</focus>\n\n"
        f"{DISCLAIMER}"
    )
    return [
        sample_record(
            rng.choice(prompts),
            resp,
            meta={
                "type": "parts_recommendation_template",
                "vehicle_id": p.vehicle_id,
                "part": part_name,
                "category": category,
                "note": "OEM numbers require PCdb/ACES — not present in VCdb",
            },
        )
    ]


def gen_diy_coach(p: VehicleProfile, rng: random.Random) -> list[dict[str, Any]]:
    scenarios = [
        (
            f"My {p.year} {p.make} {p.model} has a soft brake pedal. What should I check first?",
            "brakes",
            [
                "Check brake fluid level and color in the reservoir",
                "Look for leaks at calipers, lines, and the master cylinder",
                "Pump the pedal with engine off vs running — note if it sinks",
            ],
        ),
        (
            f"My {p.year} {p.make} {p.model} won't blow cold A/C. Where do I start?",
            "hvac",
            [
                "Verify blower speed and vent selection work",
                "Feel lines at the firewall after 5 minutes of A/C on max",
                "Check for cabin filter clogging and condenser debris",
            ],
        ),
        (
            f"Rough idle on my {p.year} {p.make} {p.model}. Focus me on one thing.",
            "engine",
            [
                "Scan for misfire or fuel-trim codes if you have an OBD reader",
                "Listen for vacuum leaks around the intake boot",
                "Note whether it happens cold, hot, or with A/C on",
            ],
        ),
    ]
    prompt, focus, steps = rng.choice(scenarios)
    engine = p.engines[0] if p.engines else "unknown engine"
    step_lines = "\n".join(f"{i+1}. {s}" for i, s in enumerate(steps))
    resp = (
        f"Let's tackle the **main issue** first on your **{p.label}** ({engine}).\n\n"
        f"**FOCUS: {focus.upper()}**\n\n"
        f"{step_lines}\n\n"
        "Do step 1 and tell me what you find — then we'll zoom in.\n\n"
        f"<focus>{focus}</focus>\n\n"
        f"{DISCLAIMER}"
    )
    return [
        sample_record(prompt, resp, meta={"type": "diy_coach", "vehicle_id": p.vehicle_id, "focus": focus})
    ]


def generate_samples(
    profiles: list[VehicleProfile],
    limit: int,
    seed: int,
) -> Iterator[dict[str, Any]]:
    rng = random.Random(seed)
    generators = [
        gen_vehicle_identity,
        gen_engine_options,
        gen_transmission_drive,
        gen_brake_config,
        gen_parts_recommendation,
        gen_diy_coach,
    ]
    count = 0
    # Round-robin across profiles for diversity
    order = profiles[:]
    rng.shuffle(order)
    while count < limit and order:
        for p in order:
            if count >= limit:
                break
            gen = rng.choice(generators)
            for rec in gen(p, rng):
                yield rec
                count += 1
                if count >= limit:
                    break


# ── CLI ────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="AutoCare VCdb SQL → training JSONL")
    ap.add_argument(
        "--sql",
        type=Path,
        default=Path(
            "/Users/xietian/Desktop/车库天才garage-genius-ai/训练数据/"
            "AutoCare_VCdb_NA_LDMDHDPS_enUS_MySQL_20260625.sql"
        ),
    )
    ap.add_argument(
        "--sqlite",
        type=Path,
        default=Path("scripts/data/vcdb-cache.sqlite"),
        help="SQLite cache path (created/reused)",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=Path("scripts/data/vcdb-train.jsonl"),
    )
    ap.add_argument("--limit", type=int, default=20000, help="Max JSONL records")
    ap.add_argument("--vehicles", type=int, default=8000, help="Vehicle profiles to sample")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument(
        "--rebuild-sqlite",
        action="store_true",
        help="Force re-import from SQL even if sqlite exists",
    )
    ap.add_argument(
        "--skip-import",
        action="store_true",
        help="Only generate JSONL from existing sqlite",
    )
    args = ap.parse_args()

    args.sqlite.parent.mkdir(parents=True, exist_ok=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    if not args.skip_import:
        if args.rebuild_sqlite or not args.sqlite.exists():
            if not args.sql.exists():
                print(f"SQL not found: {args.sql}", file=sys.stderr)
                return 1
            print(
                "\nNOTE: This dump is AutoCare VCdb (vehicles), not a parts catalog.\n"
                "OEM / brand / price training needs PCdb or ACES data.\n",
                file=sys.stderr,
            )
            import_dump_to_sqlite(args.sql, args.sqlite, tables=NEEDED_TABLES)
        else:
            print(f"[sqlite] reusing {args.sqlite}", file=sys.stderr)

    conn = sqlite3.connect(str(args.sqlite))
    profiles = build_profiles(conn, max_vehicles=args.vehicles, seed=args.seed)
    conn.close()

    written = 0
    with args.out.open("w", encoding="utf-8") as f:
        for rec in generate_samples(profiles, limit=args.limit, seed=args.seed):
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            written += 1

    print(f"[jsonl] wrote {written:,} records → {args.out}", file=sys.stderr)

    # Tiny preview
    with args.out.open("r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= 2:
                break
            obj = json.loads(line)
            print("\n--- sample ---", file=sys.stderr)
            print("Q:", obj["instruction"][:160], file=sys.stderr)
            print("A:", obj["response"][:220].replace("\n", " / "), file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
