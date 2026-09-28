"""Shared loaders for the Hard Numbers tab builders (scripts/hn/<tab>.py)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "data" / "archive"
OUT = ROOT / "data" / "numbers"

def load(rel):
    return json.loads((ROOT / rel).read_text())

def record():
    """data/record.json — the game log and the manager codes (JAS -> Jason)."""
    return load("data/record.json")

def names():
    """Manager code -> first name, e.g. {'JAS': 'Jason'}."""
    return record()["managers"]

def seasons():
    """Every archived season, oldest first, as parsed JSON (see scripts/archive.py for the shape)."""
    return [json.loads(p.read_text()) for p in sorted(ARCHIVE.glob("*.json"), key=lambda p: int(p.stem))]

def season(year):
    return json.loads((ARCHIVE / ("%s.json" % year)).read_text())

def manager(s, team_id):
    """A season's team_id -> first name (via the archive's manager code)."""
    code = (s["teams"].get(str(team_id)) or {}).get("m")
    return names().get(code, code)

def write(tab, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / ("%s.json" % tab)).write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")

def r2(x):
    return None if x is None else round(float(x), 2)
