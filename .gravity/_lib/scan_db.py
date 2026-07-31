#!/usr/bin/env python3
"""
scan_db.py — the one reader for a DB evidence pack, and the instrument that
turns it into candidate vertical domains.

Why this exists
---------------
Everything else in gravity has an instrument. Docs have `scan_project.py`,
seams have `generate_boundary.py`, gates have `run_gate.py`, path anchors have
`check.py arch`. The DB evidence pack had **none** — an agent opened the CSVs
and narrated. So the single highest-value derivation in a brownfield
excavation, *"which tables belong together, and where are the real seams?"*,
was done by eyeball, and nothing could be checked afterwards.

This module does that derivation mechanically and says how confident it is.

What it reads
-------------
`<project>/.gravity/integration/structural/db/`, the pack described by
`gravity/templates/DB-EVIDENCE.template.md` (Oracle shapes; the same files map
onto `information_schema` elsewhere):

    tables-columns.csv   inventory + COMMENTS   -> semantics, comment coverage
    constraints.csv      PK/FK/UK               -> THE ENTITY GRAPH
    ddl/*.sql            CREATE TABLE scripts   -> the same graph, scrap-it-yourself
    grants.csv           grantee -> table       -> access boundaries
    rowcounts.csv        NUM_ROWS, LAST_ANALYZED-> live vs dead
    activity.csv         executed SQL per module-> runtime truth
    db-source.sql        procs/views/triggers   -> queries living IN the db

The graph needs ONE of `constraints.csv` **or** `ddl/` — nothing else is
load-bearing; every other file improves the answer and its absence weakens it
**visibly** rather than silently. DDL is first-class because it is what a human
engineer can usually GET: the CSV queries assume a cooperative DBA, but
`CREATE TABLE` scripts can be scraped from SQL Developer / DBeaver / the repo's
migration files with no credentials beyond your own. The trade is recorded, not
hidden: the dictionary CSVs are the live database's own catalog, DDL is a
script that may drift from what's deployed and covers only the tables you
scraped — the report names which source the graph came from.

The honesty rules — the whole point
-----------------------------------
1. **Absent is never zero.** A metric whose input file is missing is `None` and
   prints as `unknown`, never `0`. "No orphan tables" and "we never collected
   the file that would show orphan tables" are different claims, and conflating
   them is how a DB analysis becomes confidently wrong.
2. **Every score names the signals it actually used.** Domain confidence
   combines FK cohesion, name-prefix agreement and grant agreement. When
   `grants.csv` is absent the weights renormalise over the surviving signals and
   the result carries `signals_used` — so a 0.8 from two signals can never be
   mistaken for a 0.8 from three.
3. **Proposals, not decisions.** This emits *candidate* domains. Minting one is
   `/new-domain`, which runs the is-it-a-domain gate with a human. A clustering
   heuristic does not get to create doctrine.
4. **Metadata only.** Nothing here reads or wants row data. The pack is
   structure, comments, constraints, grants and statistics — no PII.
"""
from __future__ import annotations

import csv
import io
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from project_arg import resolve_target  # noqa: E402

PACK_DIR = ("integration", "structural", "db")

# Header aliases. Oracle tooling is inconsistent about case and prefixes
# (SQL*Plus `SET MARKUP CSV ON`, SQL Developer export, DBA hand-edits), so
# every lookup normalises rather than demanding one exact spelling.
ALIASES: dict[str, tuple[str, ...]] = {
    "owner": ("owner", "table_owner", "schema", "schema_name", "parsing_schema_name"),
    "table_name": ("table_name", "table", "tablename"),
    "column_name": ("column_name", "column", "columnname"),
    "column_id": ("column_id", "position", "ordinal_position"),
    "data_type": ("data_type", "datatype", "type"),
    "nullable": ("nullable", "is_nullable"),
    "table_comment": ("table_comment", "table_comments", "tab_comment"),
    "column_comment": ("column_comment", "column_comments", "col_comment", "comments"),
    "constraint_name": ("constraint_name", "constraint"),
    "constraint_type": ("constraint_type", "type", "ctype"),
    "r_owner": ("r_owner", "referenced_owner", "ref_owner"),
    "referenced_table": ("referenced_table", "r_table_name", "ref_table",
                         "referenced_table_name"),
    "grantee": ("grantee", "grantee_name", "user"),
    "privilege": ("privilege", "priv"),
    "num_rows": ("num_rows", "numrows", "row_count", "rowcount"),
    "last_analyzed": ("last_analyzed", "lastanalyzed", "analyzed"),
    "module": ("module", "program"),
    "executions": ("executions", "execs", "exec_count"),
    "sql_text": ("sql_text", "sql_fulltext", "sqltext", "text"),
}


# --------------------------------------------------------------------------- #
# Reading — tolerant on purpose. A pack is exported by a DBA on some other
# machine, and refusing it over an encoding or a header case is not a wall,
# just an obstacle.
# --------------------------------------------------------------------------- #

def _decode(raw: bytes) -> str:
    """Oracle exports arrive in whatever the DBA's client used. Try the likely
    encodings in order; latin-1 cannot fail, so there is always an answer."""
    for enc in ("utf-8-sig", "utf-8", "cp949", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace")


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (name or "").strip().lower()).strip("_")


def _read_csv(path: Path) -> list[dict[str, str]] | None:
    """Rows as dicts keyed by CANONICAL field name. None when the file is
    absent — the caller must distinguish that from an empty file, which is a
    real (and reportable) "collected, contained nothing"."""
    if not path.is_file():
        return None
    text = _decode(path.read_bytes())
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    try:
        header = next(reader)
    except StopIteration:
        return []
    lookup: dict[int, str] = {}
    for i, raw in enumerate(header):
        n = _norm(raw)
        for canon, alts in ALIASES.items():
            if n == canon or n in alts:
                lookup[i] = canon
                break
        else:
            lookup[i] = n
    out: list[dict[str, str]] = []
    for row in reader:
        if not any(c.strip() for c in row):
            continue
        out.append({lookup.get(i, str(i)): (v or "").strip()
                    for i, v in enumerate(row)})
    return out


def _key(owner: str, table: str) -> str:
    return f"{(owner or '').upper()}.{(table or '').upper()}"


# --------------------------------------------------------------------------- #
# DDL — the scrap-it-yourself evidence path.
#
# The CSV queries assume a cooperative DBA; the artifact a human engineer can
# usually get without one is CREATE TABLE scripts (SQL Developer / DBeaver
# "export DDL", or the repo's migration files). DDL carries the load-bearing
# facts — tables, columns, PK/FK, comments — so it is parsed as a first-class
# graph source, not a poor cousin. What it does NOT carry is liveness: a script
# can drift from the deployed schema and covers only what was scraped, so the
# report always names which source the graph came from.
# --------------------------------------------------------------------------- #

def _ddl_norm(qualified: str) -> str:
    """`"APP"."ORD_ORDER"` -> `APP.ORD_ORDER`; unqualified stays bare (the
    build step resolves bare names against the CSV inventory when that match
    is unambiguous, and otherwise keeps them bare — a guessed schema would be
    invented provenance)."""
    parts = [p for p in qualified.replace('"', "").strip().split(".") if p]
    return ".".join(p.upper() for p in parts[-2:])


def parse_ddl(sql: str) -> dict:
    """Extract tables / FK edges / PKs / comments from CREATE TABLE scripts.

    Tolerant by design (regex + paren-matching, not a SQL grammar): scraped
    DDL arrives with storage clauses, tablespace noise, editor artifacts. A
    statement this can't read is simply not evidence — never an error.
    """
    sql = re.sub(r"--[^\n]*", "", sql)
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.S)
    tables: dict[str, dict] = {}
    edges: list[tuple[str, str]] = []
    pks: set[str] = set()

    _IDENT = r'[\w"$#.]+'
    for m in re.finditer(rf"CREATE\s+TABLE\s+({_IDENT})\s*\(", sql, re.I):
        key = _ddl_norm(m.group(1))
        depth, j = 1, m.end()
        while j < len(sql) and depth:
            if sql[j] == "(":
                depth += 1
            elif sql[j] == ")":
                depth -= 1
            j += 1
        body = sql[m.end():j - 1]
        # split the body on top-level commas only (types nest parens: NUMBER(10,2))
        items, buf, d = [], [], 0
        for ch in body:
            if ch == "(":
                d += 1
            elif ch == ")":
                d -= 1
            if ch == "," and d == 0:
                items.append("".join(buf))
                buf = []
            else:
                buf.append(ch)
        if buf:
            items.append("".join(buf))

        cols = 0
        for item in items:
            it = item.strip()
            up = it.upper()
            is_constraint = up.startswith(("CONSTRAINT", "PRIMARY KEY",
                                           "FOREIGN KEY", "UNIQUE", "CHECK"))
            if not is_constraint:
                cols += 1
            if "PRIMARY KEY" in up:
                pks.add(key)
            fm = re.search(rf"REFERENCES\s+({_IDENT})", it, re.I)
            if fm:  # table-level FK clause or a column-level REFERENCES
                edges.append((key, _ddl_norm(fm.group(1))))
        tables[key] = {"columns": cols, "comment": "", "commented_columns": 0}

    for m in re.finditer(
            rf"ALTER\s+TABLE\s+({_IDENT})\s+ADD\s+(?:CONSTRAINT\s+[\w\"$#]+\s+)?"
            rf"FOREIGN\s+KEY\s*\([^)]*\)\s*REFERENCES\s+({_IDENT})", sql, re.I):
        edges.append((_ddl_norm(m.group(1)), _ddl_norm(m.group(2))))
    for m in re.finditer(
            rf"ALTER\s+TABLE\s+({_IDENT})\s+ADD\s+(?:CONSTRAINT\s+[\w\"$#]+\s+)?"
            rf"PRIMARY\s+KEY", sql, re.I):
        pks.add(_ddl_norm(m.group(1)))

    for m in re.finditer(rf"COMMENT\s+ON\s+TABLE\s+({_IDENT})\s+IS\s+'((?:[^']|'')*)'",
                         sql, re.I):
        key = _ddl_norm(m.group(1))
        tables.setdefault(key, {"columns": 0, "comment": "",
                                "commented_columns": 0})
        tables[key]["comment"] = m.group(2).replace("''", "'")
    for m in re.finditer(rf"COMMENT\s+ON\s+COLUMN\s+({_IDENT})\s+IS\s+'(?:[^']|'')*'",
                         sql, re.I):
        parts = m.group(1).replace('"', "").split(".")
        if len(parts) >= 2:  # [owner.]table.column — drop the column
            key = _ddl_norm(".".join(parts[:-1]))
            tables.setdefault(key, {"columns": 0, "comment": "",
                                    "commented_columns": 0})
            tables[key]["commented_columns"] += 1

    return {"tables": tables,
            "edges": list(dict.fromkeys(edges)),
            "pk": pks}


def load_pack(db_dir: Path) -> dict:
    """Every source file, each tagged present/absent. Absence is data."""
    files = {
        "tables_columns": "tables-columns.csv",
        "constraints": "constraints.csv",
        "grants": "grants.csv",
        "rowcounts": "rowcounts.csv",
        "activity": "activity.csv",
    }
    pack: dict = {"dir": db_dir, "sources": {}}
    for key, fname in files.items():
        rows = _read_csv(db_dir / fname)
        pack[key] = rows
        pack["sources"][fname] = ("absent" if rows is None
                                  else f"present ({len(rows)} rows)")
    src = db_dir / "db-source.sql"
    pack["db_source"] = _decode(src.read_bytes()) if src.is_file() else None
    pack["sources"]["db-source.sql"] = ("absent" if pack["db_source"] is None
                                        else f"present ({len(pack['db_source'])} bytes)")

    # ddl/ — scraped CREATE TABLE scripts, merged across however many files
    # the engineer collected (one per table is a common export shape).
    ddl_files = sorted((db_dir / "ddl").glob("**/*.sql")) \
        + sorted(db_dir.glob("*.ddl"))
    if ddl_files:
        merged = {"tables": {}, "edges": [], "pk": set()}
        for fp in ddl_files:
            parsed = parse_ddl(_decode(fp.read_bytes()))
            merged["tables"].update(parsed["tables"])
            merged["edges"] += parsed["edges"]
            merged["pk"] |= parsed["pk"]
        merged["edges"] = list(dict.fromkeys(merged["edges"]))
        pack["ddl"] = merged
        pack["sources"]["ddl/"] = (f"present ({len(ddl_files)} file(s), "
                                   f"{len(merged['tables'])} CREATE TABLE)")
    else:
        pack["ddl"] = None
        pack["sources"]["ddl/"] = "absent"
    return pack


# --------------------------------------------------------------------------- #
# Derivation
# --------------------------------------------------------------------------- #

def _prefix(table: str) -> str | None:
    """The naming-convention prefix, when there plausibly is one.

    `BIL_INVOICE` -> `BIL`. Requires a separator and a short head: without
    that guard every table 'shares' a one-letter prefix and the signal is
    noise dressed as evidence.
    """
    name = table.split(".")[-1]
    m = re.match(r"^([A-Za-z]{2,5})[_-]", name)
    return m.group(1).upper() if m else None


def _components(nodes: set[str], edges: list[tuple[str, str]]) -> list[set[str]]:
    """Connected components over the undirected FK graph — union-find."""
    parent = {n: n for n in nodes}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in edges:
        if a in parent and b in parent:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb
    groups: dict[str, set[str]] = defaultdict(set)
    for n in nodes:
        groups[find(n)].add(n)
    return sorted(groups.values(), key=lambda g: (-len(g), sorted(g)[0]))


def _agreement(values: list[str]) -> tuple[float, str | None]:
    """Share of the most common non-empty value, and that value."""
    vals = [v for v in values if v]
    if not vals:
        return 0.0, None
    counts: dict[str, int] = defaultdict(int)
    for v in vals:
        counts[v] += 1
    top, n = max(counts.items(), key=lambda kv: (kv[1], kv[0]))
    return n / len(vals), top


# --------------------------------------------------------------------------- #
# Partitioning — the part that decides whether this instrument is useful.
#
# The obvious approach, connected components of the FK graph, is WRONG on real
# databases and was this module's first bug: production schemas are almost
# entirely FK-connected, so components return one giant blob and "the tool
# found 1 domain of 400 tables" is exactly the eyeball answer it replaced.
#
# Connectivity is therefore not the partition — it is the EVIDENCE. Naming
# convention and grant sets propose the partition; FK edges then score it, and
# the edges that cross a boundary are the most valuable output on the page,
# because a cross-cluster FK is a seam.
#
# Three strategies compete and the winner is chosen by modularity, so the
# choice is a number a reader can argue with rather than a preference.
# --------------------------------------------------------------------------- #

def _modularity(clusters: list[set[str]], edges: list[tuple[str, str]]) -> float:
    """Newman modularity of a partition over the undirected FK graph.

    Q = Σ_c [ e_c/m − (d_c/2m)² ].  ~0 means "no better than chance"; higher
    means the partition captures real structure. Comparable ACROSS strategies,
    which is the only reason a winner can be picked honestly.
    """
    m = len(edges)
    if not m:
        return 0.0
    deg: dict[str, int] = defaultdict(int)
    for a, b in edges:
        deg[a] += 1
        deg[b] += 1
    q = 0.0
    for c in clusters:
        e_c = sum(1 for a, b in edges if a in c and b in c)
        d_c = sum(deg[n] for n in c)
        q += e_c / m - (d_c / (2 * m)) ** 2
    return q


def _by_prefix(tables: dict) -> list[set[str]]:
    groups: dict[str, set[str]] = defaultdict(set)
    for k in tables:
        groups[_prefix(k) or f"~{k}"].add(k)
    return list(groups.values())


def _by_grantee(tables: dict, grantees: dict[str, set[str]]) -> list[set[str]]:
    """Group by the exact SET of grantees — the access-boundary signature.
    Two tables reachable by the same services are plausibly one domain."""
    groups: dict[str, set[str]] = defaultdict(set)
    for k in tables:
        sig = ",".join(sorted(grantees.get(k, ()))) or f"~{k}"
        groups[sig].add(k)
    return list(groups.values())


def _label_propagation(tables: dict, edges: list[tuple[str, str]],
                       rounds: int = 12) -> list[set[str]]:
    """Community detection for schemas with no naming convention at all.

    Deterministic on purpose — nodes are processed in sorted order and ties
    break by label name, so two runs of the same pack never disagree. A
    non-reproducible domain proposal is worse than none.
    """
    adj: dict[str, list[str]] = defaultdict(list)
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    label = {k: k for k in tables}
    for _ in range(rounds):
        changed = False
        for n in sorted(tables):
            if not adj[n]:
                continue
            counts: dict[str, int] = defaultdict(int)
            for nb in adj[n]:
                counts[label[nb]] += 1
            best = min(sorted(counts), key=lambda l: (-counts[l], l))
            if label[n] != best:
                label[n] = best
                changed = True
        if not changed:
            break
    groups: dict[str, set[str]] = defaultdict(set)
    for k, l in label.items():
        groups[l].add(k)
    return list(groups.values())


def build(pack: dict) -> dict:
    """Turn a loaded pack into facts. Every field that depends on an absent
    source is None, never a default."""
    tc, cons = pack["tables_columns"], pack["constraints"]
    grants, rows_f, activity = pack["grants"], pack["rowcounts"], pack["activity"]
    ddl = pack.get("ddl")

    # ---- inventory -------------------------------------------------------
    tables: dict[str, dict] = {}
    if tc is not None:
        for r in tc:
            k = _key(r.get("owner", ""), r.get("table_name", ""))
            if k == ".":
                continue
            t = tables.setdefault(k, {"owner": r.get("owner", "").upper(),
                                      "name": r.get("table_name", "").upper(),
                                      "columns": 0, "comment": "",
                                      "commented_columns": 0})
            t["columns"] += 1
            if r.get("table_comment"):
                t["comment"] = r["table_comment"]
            if r.get("column_comment"):
                t["commented_columns"] += 1

    # ---- FK graph (load-bearing) ----------------------------------------
    edges: list[tuple[str, str]] = []
    cross_schema: list[tuple[str, str]] = []
    pk_tables: set[str] = set()
    if cons is not None:
        for r in cons:
            ctype = (r.get("constraint_type") or "").upper()[:1]
            child = _key(r.get("owner", ""), r.get("table_name", ""))
            if ctype == "P":
                pk_tables.add(child)
            if ctype != "R":
                continue
            ref_owner = r.get("r_owner") or r.get("owner", "")
            parent = _key(ref_owner, r.get("referenced_table", ""))
            if child == "." or parent == "." or not r.get("referenced_table"):
                continue
            if (child, parent) not in edges:
                edges.append((child, parent))
            if child.split(".")[0] != parent.split(".")[0]:
                cross_schema.append((child, parent))

    # ---- DDL fold-in (the scrap-it-yourself graph source) ----------------
    # Policy, stated so it can be argued with:
    #   cons present  -> the live dictionary IS the graph; DDL is only compared
    #                    against it, and disagreement is reported as DRIFT
    #                    (merging silently would launder stale scripts into
    #                    live evidence).
    #   cons absent   -> DDL becomes the graph, and the report says so with
    #                    the drift caveat attached.
    graph_source = "constraints.csv" if cons is not None else None
    ddl_only_edges: list[tuple[str, str]] | None = None
    if ddl is not None:
        # Bare (schema-less) DDL names resolve against the CSV inventory only
        # when the match is unambiguous — a guessed schema is invented
        # provenance, so an ambiguous bare name just stays bare.
        remap: dict[str, str] = {}
        if tables:
            by_name: dict[str, list[str]] = defaultdict(list)
            for k in tables:
                by_name[k.split(".")[-1]].append(k)
            for k in ddl["tables"]:
                if "." not in k and len(by_name.get(k, [])) == 1:
                    remap[k] = by_name[k][0]

        def rk(k: str) -> str:
            return remap.get(k, k)

        for k, t in ddl["tables"].items():
            key = rk(k)
            entry = tables.setdefault(key, {
                "owner": key.split(".")[0] if "." in key else "",
                "name": key.split(".")[-1], "columns": 0,
                "comment": "", "commented_columns": 0})
            if tc is None:  # DDL fills the inventory only when the CSV can't
                entry["columns"] = max(entry["columns"], t["columns"])
                entry["commented_columns"] = max(entry["commented_columns"],
                                                 t["commented_columns"])
            if not entry["comment"] and t["comment"]:
                entry["comment"] = t["comment"]

        ddl_edges = list(dict.fromkeys((rk(a), rk(b)) for a, b in ddl["edges"]))
        if cons is None:
            if ddl["tables"] or ddl_edges:
                graph_source = "ddl"
            edges = ddl_edges
            pk_tables |= {rk(k) for k in ddl["pk"]}
            cross_schema = [(a, b) for a, b in edges
                            if "." in a and "." in b
                            and a.split(".")[0] != b.split(".")[0]]
        else:
            have = set(edges)
            ddl_only_edges = [e for e in ddl_edges if e not in have]
    graph_known = graph_source is not None

    # Tables can be known from the FK graph even when the inventory is absent.
    # PK rows count too: a table with a primary key and no foreign key is still
    # a table, and dropping it made the census silently undercount (found on
    # the constraints-only fixture: 10 reported, 12 real).
    nodes = set(tables) | {n for e in edges for n in e} | pk_tables
    for n in nodes:
        tables.setdefault(n, {"owner": n.split(".")[0] if "." in n else "",
                              "name": n.split(".")[-1],
                              "columns": 0, "comment": "",
                              "commented_columns": 0})

    in_deg: dict[str, int] = defaultdict(int)
    out_deg: dict[str, int] = defaultdict(int)
    for child, parent in edges:
        in_deg[parent] += 1
        out_deg[child] += 1

    # ---- grants ----------------------------------------------------------
    table_grantees: dict[str, set[str]] = defaultdict(set)
    if grants is not None:
        for r in grants:
            k = _key(r.get("owner", ""), r.get("table_name", ""))
            g = (r.get("grantee") or "").upper()
            if k != "." and g:
                table_grantees[k].add(g)

    # ---- rowcounts -------------------------------------------------------
    numrows: dict[str, int | None] = {}
    never_analyzed: list[str] = []
    if rows_f is not None:
        for r in rows_f:
            k = _key(r.get("owner", ""), r.get("table_name", ""))
            if k == ".":
                continue
            raw = (r.get("num_rows") or "").replace(",", "")
            numrows[k] = int(raw) if raw.isdigit() else None
            if not (r.get("last_analyzed") or "").strip():
                never_analyzed.append(k)

    # ---- activity --------------------------------------------------------
    module_tables: dict[str, set[str]] = defaultdict(set)
    if activity is not None:
        names = {t["name"]: k for k, t in tables.items()}
        for r in activity:
            mod = (r.get("module") or "").strip() or "(unnamed)"
            text = (r.get("sql_text") or "").upper()
            for name, k in names.items():
                if name and re.search(rf"\b{re.escape(name)}\b", text):
                    module_tables[mod].add(k)

    # ---- flags -----------------------------------------------------------
    orphans = None
    if graph_known:
        orphans = sorted(
            k for k in tables
            if in_deg[k] == 0 and out_deg[k] == 0
            and (grants is None or not table_grantees.get(k))
        )
    dead = (sorted(k for k, v in numrows.items() if v == 0)
            if rows_f is not None else None)
    # A "god" table is an in-degree outlier: many tables point AT it. Uses a
    # mean+2sigma cut, with a floor, so a small schema can't manufacture one.
    gods = None
    if graph_known and in_deg:
        vals = [in_deg[k] for k in tables]
        mean = sum(vals) / len(vals)
        var = sum((v - mean) ** 2 for v in vals) / len(vals)
        cut = max(mean + 2 * (var ** 0.5), 5)
        gods = sorted((k for k in tables if in_deg[k] >= cut),
                      key=lambda k: -in_deg[k])

    shared = (sorted((k for k, g in table_grantees.items() if len(g) > 1),
                     key=lambda k: -len(table_grantees[k]))
              if grants is not None else None)

    # ---- candidate vertical domains --------------------------------------
    comps = _components(set(tables), edges) if graph_known else []
    strategies: dict[str, list[set[str]]] = {}
    candidates: list[dict] = []
    chosen = None
    seams: list[dict] = []
    if graph_known and tables:
        strategies["naming prefix"] = _by_prefix(tables)
        if grants is not None:
            strategies["grant signature"] = _by_grantee(tables, table_grantees)
        strategies["FK community"] = _label_propagation(tables, edges)
        scored = {n: _modularity(cs, edges) for n, cs in strategies.items()}
        chosen = max(sorted(scored), key=lambda n: scored[n])

        for cl in strategies[chosen]:
            if len(cl) < 2:
                continue
            pref_share, pref = _agreement([_prefix(k) or "" for k in cl])
            gr_share, gr = (_agreement([",".join(sorted(table_grantees[k]))
                                        if table_grantees.get(k) else ""
                                        for k in cl])
                            if grants is not None else (None, None))
            internal = sum(1 for a, b in edges if a in cl and b in cl)
            cohesion = min(internal / max(len(cl) - 1, 1), 1.0)
            signals = {"fk_cohesion": cohesion, "prefix_agreement": pref_share}
            if gr_share is not None:
                signals["grant_agreement"] = gr_share
            weights = {"fk_cohesion": 0.4, "prefix_agreement": 0.35,
                       "grant_agreement": 0.25}
            total_w = sum(weights[s] for s in signals)
            conf = sum(signals[s] * weights[s] for s in signals) / total_w
            label = pref or max(cl, key=lambda k: in_deg[k]).split(".")[-1]
            candidates.append({
                "label": label.lower(), "tables": sorted(cl), "size": len(cl),
                "confidence": round(conf, 2), "signals_used": sorted(signals),
                "signals": {k: round(v, 2) for k, v in signals.items()},
                "top_grantee": gr,
            })
        candidates.sort(key=lambda c: (-c["size"], -c["confidence"]))

        # The payoff: an FK that leaves its cluster is a candidate seam. These
        # are the edges an agent must not change blind, and they only become
        # visible once the partition stops being "one component".
        where = {t: i for i, c in enumerate(strategies[chosen]) for t in c}
        named = {i: (c[0]["label"] if (c := [x for x in candidates
                                             if set(x["tables"]) == cl]) else None)
                 for i, cl in enumerate(strategies[chosen])}
        for a, b in edges:
            ca, cb = where.get(a), where.get(b)
            if ca is not None and cb is not None and ca != cb:
                seams.append({"from": a, "to": b,
                              "from_domain": named.get(ca) or "(unclustered)",
                              "to_domain": named.get(cb) or "(unclustered)",
                              "cross_schema": "." in a and "." in b
                              and a.split(".")[0] != b.split(".")[0]})
        strategies = {n: [sorted(c) for c in cs] for n, cs in strategies.items()}

    # ---- comment coverage (the semantic-honesty metric) -------------------
    # From the CSV inventory when present; from DDL COMMENT ON statements when
    # that's all there is — tagged with its source either way, because "25% of
    # the live catalog carries comments" and "25% of the scripts I scraped do"
    # are different claims.
    if tables and (tc is not None or ddl is not None):
        with_c = sum(1 for t in tables.values() if t["comment"])
        total_cols = sum(t["columns"] for t in tables.values())
        cols_c = sum(t["commented_columns"] for t in tables.values())
        coverage = {
            "tables_with_comment": with_c,
            "table_pct": round(100 * with_c / len(tables), 1),
            "column_pct": round(100 * cols_c / total_cols, 1) if total_cols else 0.0,
            "source": "tables-columns.csv" if tc is not None else "ddl",
        }
    else:
        coverage = None

    return {
        "dir": str(pack["dir"]),
        "sources": pack["sources"],
        "tables": tables,
        "n_tables": len(tables) if tables else 0,
        "n_edges": len(edges) if graph_known else None,
        "edges": edges,
        "components": [sorted(c) for c in comps],
        "biggest_component": max((len(c) for c in comps), default=0),
        "partition_strategy": chosen,
        "partition_scores": ({n: round(_modularity([set(c) for c in cs], edges), 3)
                              for n, cs in strategies.items()} if strategies else None),
        "candidates": candidates,
        "seams": seams if graph_known else None,
        "cross_schema": cross_schema if graph_known else None,
        "orphans": orphans,
        "dead": dead,
        "gods": [{"table": k, "in_degree": in_deg[k]} for k in (gods or [])]
                if gods is not None else None,
        "shared_tables": [{"table": k, "grantees": sorted(table_grantees[k])}
                          for k in (shared or [])] if shared is not None else None,
        "modules": {m: sorted(t) for m, t in sorted(module_tables.items())}
                   if activity is not None else None,
        "comment_coverage": coverage,
        "no_pk": sorted(set(tables) - pk_tables) if graph_known else None,
        "graph_source": graph_source,
        "ddl_only_edges": ddl_only_edges,
        "grants_known": grants is not None,
    }


# --------------------------------------------------------------------------- #
# Report
# --------------------------------------------------------------------------- #

def _u(v, unit: str = "") -> str:
    """Render a possibly-unknown number. `unknown` and `0` must never look
    alike — that conflation is the whole reason this helper exists."""
    return "unknown (not collected)" if v is None else f"{v}{unit}"


def report(f: dict) -> str:
    out: list[str] = []
    add = out.append
    add(f"DB evidence pack — {f['dir']}")
    add("")
    add("sources")
    for name, state in f["sources"].items():
        mark = "-" if state == "absent" else "+"
        add(f"  {mark} {name:20} {state}")

    if f["n_edges"] is None:
        add("")
        add("no entity graph — neither constraints.csv nor ddl/*.sql is present,")
        add("so nothing can be derived. The graph needs ONE of these, cheapest first:")
        add("  1. DDL you can scrap yourself — CREATE TABLE scripts from")
        add("     SQL Developer / DBeaver (export DDL) or the repo's migration")
        add("     files -> drop into ddl/")
        add("  2. the two P1 CSVs from the live data dictionary (exact queries")
        add("     in MANIFEST.md — this is the DBA ask)")
        add("No row data is ever needed. The CSVs are the STRUCTURE itself —")
        add("the database's own catalog of your tables, exported as flat files.")
        return "\n".join(out)

    add("")
    add(f"inventory   {f['n_tables']} tables · {f['n_edges']} FK edges · "
        f"{len(f['components'])} components")
    if f["graph_source"] == "ddl":
        add("graph from  ddl/ scripts — scraped DDL can drift from the deployed")
        add("            schema and covers only the tables you scraped; treat")
        add("            coverage as partial, not complete")
    else:
        add("graph from  constraints.csv (the live data dictionary)")
        if f["ddl_only_edges"]:
            add(f"            DRIFT: ddl/ declares {len(f['ddl_only_edges'])} FK "
                "edge(s) the dictionary doesn't have —")
            add("            scripts and database disagree; trust the dictionary, "
                "fix the scripts")
    # Connectivity alone is almost never the answer; say so with the number.
    big = f["biggest_component"]
    if big and f["n_tables"] and big / f["n_tables"] > 0.6:
        add(f"            {big} of {f['n_tables']} tables form ONE FK component "
            "— connectivity")
        add("            alone cannot separate domains here")
    cc = f["comment_coverage"]
    if cc is None:
        add("comments    unknown (tables-columns.csv not collected) — every "
            "semantic claim is a guess until it is")
    else:
        src = " (from DDL scripts, over scraped tables only)" \
            if cc.get("source") == "ddl" else ""
        add(f"comments    {cc['table_pct']}% of tables, {cc['column_pct']}% of "
            f"columns carry one{src}")
        if cc["table_pct"] < 25:
            add("            LOW — name-based semantics only; do not present "
                "inferred meaning as documented")

    add("")
    scores = f["partition_scores"] or {}
    add(f"candidate vertical domains  (proposals — /new-domain gates them)")
    if f["partition_strategy"]:
        others = ", ".join(f"{n} {scores[n]:+.3f}" for n in sorted(scores)
                           if n != f["partition_strategy"])
        add(f"  partitioned by {f['partition_strategy'].upper()} "
            f"(modularity {scores.get(f['partition_strategy'], 0):+.3f}"
            + (f"; beat {others}" if others else "") + ")")
    if not f["candidates"]:
        add("  none: no cluster has 2+ tables")
    for c in f["candidates"]:
        sig = ",".join(s.split("_")[0] for s in c["signals_used"])
        add(f"  {c['label']:<16} {c['size']:>3} tables  conf {c['confidence']:.2f}"
            f"  [{len(c['signals_used'])} signals: {sig}]")
        if c["top_grantee"]:
            add(f"  {'':<16}     reachable by {c['top_grantee']}")
    if f["candidates"] and "grant_agreement" not in f["candidates"][0]["signals_used"]:
        add("  NOTE: grants.csv absent — scores use 2 of 3 signals and are "
            "weaker than the number suggests")

    add("")
    add("candidate seams  (FK edges that LEAVE their cluster — the boundaries")
    add("an agent must not change blind; these belong in integration/SPEC.md)")
    if f["seams"] is None:
        add("  unknown (constraints.csv not collected)")
    elif not f["seams"]:
        add("  none — every FK stays inside its cluster")
    for s in f["seams"][:15]:
        flag = "  [CROSS-SCHEMA]" if s["cross_schema"] else ""
        add(f"  {s['from_domain']} -> {s['to_domain']:<14} "
            f"{s['from']} -> {s['to']}{flag}")
    if f["seams"] and len(f["seams"]) > 15:
        add(f"  … and {len(f['seams']) - 15} more (--json for all)")

    add("")
    add("outliers")
    gods = f["gods"]
    add(f"  god tables        {_u(len(gods) if gods is not None else None)}")
    for g in (gods or [])[:5]:
        add(f"      {g['table']} (in-degree {g['in_degree']})")
    sh = f["shared_tables"]
    add(f"  shared tables     {_u(len(sh) if sh is not None else None)}"
        + ("  (>1 grantee — a boundary crossing)" if sh else ""))
    for s in (sh or [])[:5]:
        add(f"      {s['table']}: {', '.join(s['grantees'])}")
    add(f"  orphans           {_u(len(f['orphans']) if f['orphans'] is not None else None)}"
        + ("  (no FK, no grants)" if f["grants_known"]
           else "  (no FK only — grants.csv absent, so this is the WEAKER test)"))
    add(f"  dead (0 rows)     {_u(len(f['dead']) if f['dead'] is not None else None)}")
    add(f"  no primary key    {_u(len(f['no_pk']) if f['no_pk'] is not None else None)}")

    mods = f["modules"]
    if mods is None:
        add("  modules           unknown (activity.csv not collected)")
    else:
        add(f"  modules seen      {len(mods)} (runtime truth from activity.csv)")
        for m, ts in list(mods.items())[:5]:
            add(f"      {m}: {len(ts)} tables")

    add("")
    add("These are CANDIDATES from structure, not decisions. Confirm each")
    add("against the code and the people before minting a domain.")
    return "\n".join(out)


def scan(project: Path) -> dict:
    return build(load_pack(Path(project).joinpath(".gravity", *PACK_DIR)))


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    argv = list(sys.argv[1:] if argv is None else argv)
    as_json = "--json" in argv
    argv = [a for a in argv if not a.startswith("--")]
    name, root = resolve_target(argv[0] if argv else None)
    db_dir = root / ".gravity" / Path(*PACK_DIR)
    if not db_dir.is_dir():
        print(f"{name}: no DB evidence pack at .gravity/{'/'.join(PACK_DIR)}/")
        print()
        print("To start one, get ANY of these (cheapest first) and put it there")
        print("(or drop it in .gravity/_inbox/ and /given routes it):")
        print("  1. DDL scripts you can scrap yourself — CREATE TABLE statements")
        print("     from SQL Developer / DBeaver (export DDL) or the repo's")
        print("     migration files -> ddl/*.sql")
        print("  2. the P1 CSVs from the live data dictionary — exact queries in")
        print("     gravity/templates/DB-EVIDENCE.template.md (the DBA ask)")
        print("No row data is ever needed — structure only, so no PII moves.")
        return 2
    facts = build(load_pack(db_dir))
    if as_json:
        import json
        print(json.dumps(facts, indent=2, default=str))
    else:
        print(report(facts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
