#!/usr/bin/env python3
"""arch-forge hooks (standard library only)

Subcommands:
  session-start  inject a summary of the confirmed architecture into the session context (minimal and above)
  pre-edit       protect accepted ADRs and decision.json from edits (standard and above)
  post-edit      check the dependency direction of the edited file right away (standard and above)
  stop           run arch-lint on units with changes (strict only)
  doctor         show whether the hooks can read decision.json and what they inject and check (a self-check before reporting completion; always runs)

Profiles (ARCH_FORGE_HOOK_PROFILE):
  minimal  context injection only
  standard context injection + warnings (never blocks; editing an accepted ADR asks for confirmation)
  strict   upgrades the standard warnings to blocks, and runs arch-lint before stopping

No failure ever stops the session: every exception is swallowed and the hook exits 0.
Does nothing in projects without decision.json.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

DOCS_DIR = PurePosixPath("docs/architecture")
DECISION = DOCS_DIR / "decision.json"
ADR_DIR = DOCS_DIR / "adr"

PROFILES = ("minimal", "standard", "strict")

CODE_EXT = {".go", ".php", ".rs"}

# Directory names used to decide the layer (compared in lowercase). 0 is the innermost.
INNER = {"domain", "entity", "entities"}
MIDDLE = {"usecase", "usecases", "application", "app_service", "appservice"}
OUTER = {
    "adapter", "adapters", "infrastructure", "infra", "handler", "handlers",
    "presentation", "interfaces", "controller", "controllers", "persistence",
}

# External libraries the domain layer must not depend on
GO_FORBIDDEN_IN_DOMAIN = (
    "net/http", "database/sql", "github.com/jackc/pgx", "gorm.io/", "entgo.io/",
    "github.com/jmoiron/sqlx", "github.com/labstack/echo", "github.com/gin-gonic/",
    "github.com/go-chi/", "connectrpc.com/", "google.golang.org/grpc",
    "github.com/redis/", "go.mongodb.org/", "github.com/gofiber/", "github.com/uptrace/bun",
)
PHP_FORBIDDEN_IN_DOMAIN = (
    "Illuminate\\", "Symfony\\", "Doctrine\\", "Slim\\", "Psr\\Http\\",
    "GuzzleHttp\\", "PDO", "Laminas\\", "Cake\\",
)
RUST_FORBIDDEN_IN_DOMAIN = (
    "axum", "sqlx", "tokio_postgres", "diesel", "reqwest", "actix_web",
    "sea_orm", "tonic", "redis", "hyper", "tower", "tokio", "rocket", "poem", "warp",
)
RUST_FORBIDDEN_CRATES_IN_DOMAIN = tuple(c.replace("_", "-") for c in RUST_FORBIDDEN_IN_DOMAIN)

SAFE_REL_PATH = re.compile(r"^(\.|[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*)$")


# --------------------------------------------------------------------------- I/O


def read_input() -> dict:
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except Exception:
        return {}


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()


def profile() -> str:
    p = os.environ.get("ARCH_FORGE_HOOK_PROFILE", "standard").strip().lower()
    return p if p in PROFILES else "standard"


def at_least(level: str) -> bool:
    return PROFILES.index(profile()) >= PROFILES.index(level)


def project_dir(data: dict) -> Path:
    d = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
    return Path(d).resolve()


def load_decision(root: Path) -> dict | None:
    path = root / DECISION
    if not path.is_file():
        return None
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else None
    except Exception:
        return None


def rel_to(root: Path, file_path: str) -> PurePosixPath | None:
    if not file_path:
        return None
    p = Path(file_path)
    if not p.is_absolute():
        p = root / p
    try:
        return PurePosixPath(p.resolve().relative_to(root).as_posix())
    except Exception:
        return None


def safe_units(decision: dict) -> list[dict]:
    units = []
    for u in decision.get("units") or []:
        if not isinstance(u, dict):
            continue
        path = str(u.get("path", "")).strip().rstrip("/") or "."
        if path.startswith("./"):
            path = path[2:] or "."
        if ".." in path.split("/") or not SAFE_REL_PATH.match(path):
            continue
        units.append({**u, "path": path})
    return units


# --------------------------------------------------------------------------- session-start


def cmd_session_start(data: dict) -> None:
    root = project_dir(data)
    decision = load_decision(root)
    docs = root / DOCS_DIR

    if decision is None:
        if docs.is_dir() and any((docs / f).exists() for f in ("00-brief.md", "05-proposal.md")):
            emit(context("SessionStart",
                         "[arch-forge] docs/architecture/ has in-progress design documents, but no decision.json yet. "
                         "Continue the architecture design with /arch-forge:design (Step 0 resumes from where it stopped)."))
        return

    lines = ["[arch-forge] This project's architecture is confirmed. Follow these rules when changing code."]
    proj = decision.get("project") or {}
    lines.append(f"- Project: {proj.get('name', '?')} / topology: {decision.get('topology', '?')} / "
                 f"repository layout: {decision.get('repoLayout', '?')}")
    for u in safe_units(decision)[:12]:
        mods = ", ".join(m.get("name", "") for m in (u.get("modules") or []) if isinstance(m, dict))
        fw = str(u.get("framework") or "").strip()
        libs = u.get("libraries") if isinstance(u.get("libraries"), dict) else {}
        stack = ", ".join(f"{k}={v}" for k, v in list(libs.items())[:6] if isinstance(v, str))
        ep = str(u.get("entrypoint") or "").strip()
        pk = str(u.get("packaging") or "").strip()
        lines.append(f"- Unit {u.get('name')}: {u.get('language')} / {u.get('pattern')} / path={u['path']}"
                     + (f" / entrypoint={ep}" if ep else "")
                     + (f" / packaging={pk}" if pk else "")
                     + (f" / framework={fw}" if fw else "")
                     + (f" / libraries=[{stack}]" if stack else "")
                     + (f" / modules=[{mods}]" if mods else ""))
    shared = shared_build_units(safe_units(decision))
    for path, names in shared.items():
        lines.append(f"- path={path} is one build unit shared by units {', '.join(names)} (changing shared parts affects all of them)")
    conv = [c for c in (decision.get("conventions") or []) if isinstance(c, dict) and c.get("id") and c.get("rule")]
    if conv:
        lines.append("- Conventions: " + " / ".join(f"{c['id']} {str(c['rule'])[:80]}" for c in conv[:9]))
    adrs = sorted(p.name for p in (root / ADR_DIR).glob("*.md")) if (root / ADR_DIR).is_dir() else []
    if adrs:
        lines.append(f"- ADRs: {', '.join(adrs[:10])} (docs/architecture/adr/)")
    rules_dir = root / ".claude" / "rules" / "arch-forge"
    if rules_dir.is_dir():
        lines.append("- Detailed dependency rules are in .claude/rules/arch-forge/ (loaded automatically when you open a matching file)")
    else:
        lines.append("- .claude/rules/arch-forge/ does not exist. Install the dependency rules with /arch-forge:rules")
    lines.append("- Dependencies point inward (to domain). Write a new ADR before changing layer, module or service boundaries, or the framework or major libraries")
    lines.append("- Never rewrite an accepted ADR (create a new ADR that supersedes it). After changing the structure, check it with /arch-forge:check")
    lines.append(f"- Hook profile: {profile()}")
    emit(context("SessionStart", "\n".join(lines)))


def context(event: str, text: str) -> dict:
    return {"hookSpecificOutput": {"hookEventName": event, "additionalContext": text}}


# --------------------------------------------------------------------------- pre-edit

# The Japanese alternatives match ADRs written in Japanese: ADRs are generated in the user's language.
ACCEPTED_RE = re.compile(
    r"^\s*(?:[-*]\s*)?(?:\*\*)?(?:ステータス|状態|status)(?:\*\*)?\s*[:：|]\s*(?:\*\*)?\s*(承認済み|採用|accepted|approved)",
    re.IGNORECASE | re.MULTILINE,
)
SUPERSEDE_RE = re.compile(r"置き換え|置換|廃止|superseded|deprecated", re.IGNORECASE)


def edit_payload(tool_input: dict) -> str:
    parts = [str(tool_input.get("content", "")), str(tool_input.get("new_string", ""))]
    for e in tool_input.get("edits") or []:
        if isinstance(e, dict):
            parts.append(str(e.get("new_string", "")))
    return "\n".join(parts)


def cmd_pre_edit(data: dict) -> None:
    if not at_least("standard"):
        return
    root = project_dir(data)
    if load_decision(root) is None and not (root / ADR_DIR).is_dir():
        return
    tool_input = data.get("tool_input") or {}
    rel = rel_to(root, str(tool_input.get("file_path", "")))
    if rel is None:
        return
    target = root / rel

    # Rewriting an accepted ADR
    if rel.parent == ADR_DIR and rel.suffix == ".md" and target.is_file():
        try:
            current = target.read_text(encoding="utf-8")
        except Exception:
            return
        if not ACCEPTED_RE.search(current):
            return
        if SUPERSEDE_RE.search(edit_payload(tool_input)):
            return  # allow edits that change the status to superseded or similar
        reason = (f"{rel} is an accepted ADR. Treat ADRs as immutable: if a change is needed, create a new ADR and "
                  "change the old ADR's status to \"Superseded by ADR-XXXX\".")
        decision = "deny" if at_least("strict") else "ask"
        emit({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": f"[arch-forge] {reason}",
        }})
        return

    # Rewriting decision.json
    if rel == DECISION and target.is_file():
        msg = ("[arch-forge] decision.json is the contract for the confirmed architecture. To change it, add an ADR that explains the same change, "
               "and afterwards run /arch-forge:rules (regenerate the rules) and /arch-forge:check (conformance check).")
        if at_least("strict"):
            emit({"hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "ask",
                "permissionDecisionReason": msg,
            }})
        else:
            emit(context("PreToolUse", msg))


# --------------------------------------------------------------------------- post-edit


def layer_of(parts: list[str]) -> int | None:
    rank = None
    for seg in parts:
        s = seg.lower()
        base = re.sub(r"[-_](crate|lib)$", "", s)
        for name in (base, *re.split(r"[-_]", base)):
            if name in INNER:
                rank = 0 if rank is None else min(rank, 0)
            elif name in MIDDLE:
                rank = 1 if rank is None else min(rank, 1)
            elif name in OUTER:
                rank = 2 if rank is None else min(rank, 2)
    return rank


def shared_build_units(units: list[dict]) -> dict[str, list[str]]:
    by_path: dict[str, list[str]] = {}
    for u in units:
        by_path.setdefault(u["path"], []).append(str(u.get("name", "?")))
    return {p: names for p, names in by_path.items() if len(names) > 1}


def unit_for(rel: PurePosixPath, units: list[dict]) -> dict | None:
    best = None
    for u in units:
        p = u["path"]
        if p == "." or rel.as_posix() == p or rel.as_posix().startswith(p + "/"):
            if best is None or len(p) > len(best["path"]):
                best = u
    if best is None:
        return None
    # Among units sharing the same path, pick the one whose entrypoint the file is under
    inner = rel.as_posix() if best["path"] == "." else rel.as_posix()[len(best["path"]) + 1:]
    for u in units:
        ep = str(u.get("entrypoint") or "").strip().strip("/")
        if u["path"] == best["path"] and ep and (inner == ep or inner.startswith(ep + "/")):
            return u
    return best


def go_module_path(start: Path, root: Path) -> str | None:
    d = start.parent
    while True:
        gm = d / "go.mod"
        if gm.is_file():
            m = re.search(r"^module\s+(\S+)", gm.read_text(encoding="utf-8", errors="ignore"), re.MULTILINE)
            return m.group(1) if m else None
        if d == root or d.parent == d:
            return None
        d = d.parent


def go_imports(src: str) -> list[str]:
    imports = re.findall(r'^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"', src, re.MULTILINE)
    for block in re.findall(r"^\s*import\s*\((.*?)\)", src, re.MULTILINE | re.DOTALL):
        imports += re.findall(r'"([^"]+)"', block)
    return imports


def module_name_in(parts: list[str]) -> str | None:
    lowered = [p.lower() for p in parts]
    if "modules" in lowered:
        i = lowered.index("modules")
        if i + 1 < len(parts) - 1:
            return parts[i + 1]
    return None


def check_go(rel: PurePosixPath, src: str, root: Path, unit: dict) -> list[str]:
    issues = []
    file_parts = list(rel.parent.parts)
    layer = layer_of(file_parts)
    imports = go_imports(src)
    mod = go_module_path(root / rel, root) or ""
    pattern = str(unit.get("pattern", ""))
    is_test = rel.name.endswith("_test.go")
    my_module = module_name_in(file_parts)

    for imp in imports:
        internal = bool(mod) and (imp == mod or imp.startswith(mod + "/"))
        if layer == 0 and not internal and any(imp == f.rstrip("/") or imp.startswith(f) for f in GO_FORBIDDEN_IN_DOMAIN):
            issues.append(f'the domain layer imports "{imp}" (the domain must not depend on frameworks, DBs or logger implementations)')
        if internal and layer is not None and pattern not in ("layered", "vertical-slice"):
            rest = imp[len(mod):].strip("/").split("/") if imp != mod else []
            target = layer_of(rest)
            if target is not None and target > layer:
                kind = "test" if is_test else "code"
                issues.append(f'{kind} in an inner layer imports the outer layer "{imp}" (dependencies point inward; keep test doubles inside the tests)')
        if internal and my_module:
            rest = imp[len(mod):].strip("/").split("/") if imp != mod else []
            low = [r.lower() for r in rest]
            if "modules" in low:
                i = low.index("modules")
                other = rest[i + 1] if i + 1 < len(rest) else None
                if other and other != my_module and len(rest) > i + 2:
                    issues.append(f'module {my_module} references "{imp}", internal to another module {other} (go through its public API root package)')
    return issues


def php_uses(src: str) -> list[str]:
    return [u.strip().lstrip("\\") for u in re.findall(r"^\s*use\s+(?:function\s+|const\s+)?([A-Za-z_\\][\w\\]*)", src, re.MULTILINE)]


def check_php(rel: PurePosixPath, src: str, unit: dict) -> list[str]:
    issues = []
    file_parts = list(rel.parent.parts)
    layer = layer_of(file_parts)
    pattern = str(unit.get("pattern", ""))
    my_module = module_name_in(file_parts)
    for use in php_uses(src):
        segs = use.split("\\")
        if layer == 0 and any(use == f.rstrip("\\") or use.startswith(f) for f in PHP_FORBIDDEN_IN_DOMAIN):
            issues.append(f"the domain layer uses {use} (the domain must not depend on frameworks, ORMs or HTTP)")
            continue
        framework = any(use.startswith(f) for f in PHP_FORBIDDEN_IN_DOMAIN)
        if not framework and layer is not None and pattern not in ("layered", "vertical-slice"):
            target = layer_of(segs[:-1])
            if target is not None and target > layer:
                issues.append(f"an inner layer uses the outer layer {use} (dependencies point inward)")
        if my_module and len(segs) > 2 and segs[0] == "Modules" and segs[1] != my_module and segs[2] != "Contracts":
            issues.append(f"module {my_module} references {use}, internal to another module {segs[1]} (go through its Contracts interfaces)")
    return issues


def check_rust(rel: PurePosixPath, src: str, unit: dict) -> list[str]:
    issues = []
    file_parts = list(rel.parent.parts)
    layer = layer_of(file_parts)
    pattern = str(unit.get("pattern", ""))
    uses = re.findall(r"^\s*(?:pub\s+)?use\s+([A-Za-z_][\w:]*)", src, re.MULTILINE)
    uses += re.findall(r"\b([a-z_][a-z0-9_]*)::", src)
    seen = set()
    for use in uses:
        segs = [s for s in use.split("::") if s]
        if not segs:
            continue
        head = segs[0]
        if head in ("crate", "super", "self") and len(segs) > 1:
            head_layer = layer_of(segs[1:2])
        else:
            head_layer = layer_of([head])
        if layer == 0 and head in RUST_FORBIDDEN_IN_DOMAIN and head not in seen:
            seen.add(head)
            issues.append(f"the domain layer uses {head} (the domain crate must not depend on frameworks, DBs or runtimes)")
        elif (layer is not None and head_layer is not None and head_layer > layer
              and pattern not in ("layered", "vertical-slice")):
            key = segs[1] if head in ("crate", "super", "self") else head
            if key not in seen:
                seen.add(key)
                issues.append(f"an inner layer references the outer layer {key} (dependencies point inward)")
    return issues


def check_cargo_toml(rel: PurePosixPath, src: str) -> list[str]:
    if layer_of(list(rel.parent.parts)) != 0:
        return []
    issues = []
    for section in re.findall(r"^\[(?:dev-)?dependencies\]\s*\n(.*?)(?=^\[|\Z)", src, re.MULTILINE | re.DOTALL):
        for name in re.findall(r"^\s*([A-Za-z0-9_-]+)\s*=", section, re.MULTILINE):
            n = name.lower()
            if n in RUST_FORBIDDEN_CRATES_IN_DOMAIN or n.replace("-", "_") in RUST_FORBIDDEN_IN_DOMAIN:
                issues.append(f"the domain crate's Cargo.toml depends on {name}")
            elif layer_of([n]) in (1, 2):
                issues.append(f"the domain crate depends on the outer crate {name} (dependencies point inward)")
    return issues


def cmd_post_edit(data: dict) -> None:
    if not at_least("standard"):
        return
    root = project_dir(data)
    decision = load_decision(root)
    if decision is None:
        return
    tool_input = data.get("tool_input") or {}
    rel = rel_to(root, str(tool_input.get("file_path", "")))
    if rel is None:
        return
    is_cargo = rel.name == "Cargo.toml"
    if rel.suffix not in CODE_EXT and not is_cargo:
        return
    if any(p in ("vendor", "target", "node_modules", ".git") for p in rel.parts):
        return
    unit = unit_for(rel, safe_units(decision))
    if unit is None:
        return
    try:
        src = (root / rel).read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return

    if is_cargo:
        issues = check_cargo_toml(rel, src)
    elif rel.suffix == ".go":
        issues = check_go(rel, src, root, unit)
    elif rel.suffix == ".php":
        issues = check_php(rel, src, unit)
    else:
        issues = check_rust(rel, src, unit)

    if not issues:
        return
    body = (f"[arch-forge] {rel} may violate the dependency rules (unit {unit.get('name')} / {unit.get('pattern')}):\n"
            + "\n".join(f"- {i}" for i in dict.fromkeys(issues))
            + "\nIf the change is intended, write the reason in an ADR. Otherwise define a port (interface / trait) on the inner side and invert the dependency.")
    if at_least("strict"):
        emit({"decision": "block", "reason": body})
    else:
        emit(context("PostToolUse", body))


# --------------------------------------------------------------------------- stop


def changed_paths(root: Path) -> list[str] | None:
    try:
        out = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all"], cwd=root,
                             capture_output=True, text=True, timeout=15)
    except Exception:
        return None
    if out.returncode != 0:
        return None
    paths = []
    for line in out.stdout.splitlines():
        p = line[3:].strip()
        if " -> " in p:
            p = p.split(" -> ", 1)[1]
        paths.append(p.strip('"'))
    return paths


def lint_commands(unit_dir: Path, language: str) -> list[list[str]]:
    cmds = []
    if language == "go" and (unit_dir / ".go-arch-lint.yml").is_file():
        gomod = unit_dir / "go.mod"
        if gomod.is_file() and "go-arch-lint" in gomod.read_text(encoding="utf-8", errors="ignore"):
            cmds.append(["go", "tool", "go-arch-lint", "check"])
    if language == "php" and (unit_dir / "deptrac.yaml").is_file() and (unit_dir / "vendor/bin/deptrac").is_file():
        cmds.append(["vendor/bin/deptrac", "analyse", "--no-progress"])
    return cmds


def cmd_stop(data: dict) -> None:
    if not at_least("strict") or data.get("stop_hook_active"):
        return
    root = project_dir(data)
    decision = load_decision(root)
    if decision is None:
        return
    changed = changed_paths(root)
    if not changed:
        return
    failures = []
    done: set[str] = set()
    for u in safe_units(decision):
        p = u["path"]
        if p in done:  # check units sharing the same build unit only once
            continue
        done.add(p)
        touched = [c for c in changed if Path(c).suffix in CODE_EXT and (p == "." or c.startswith(p + "/"))]
        if not touched:
            continue
        unit_dir = root / p
        for cmd in lint_commands(unit_dir, str(u.get("language", ""))):
            try:
                r = subprocess.run(cmd, cwd=unit_dir, capture_output=True, text=True, timeout=120)
            except Exception:
                continue
            if r.returncode != 0:
                tail = "\n".join((r.stdout + r.stderr).strip().splitlines()[-20:])
                failures.append(f"## {u.get('name')}: `{' '.join(cmd)}` failed (exit {r.returncode})\n{tail}")
    if failures:
        emit({"decision": "block",
              "reason": "[arch-forge] The dependency direction check failed. Fix the violations, or if they are intentional, add an ADR before finishing.\n\n"
                        + "\n\n".join(failures)})


# --------------------------------------------------------------------------- doctor

INNER_DIR_NAMES = tuple(sorted(INNER))


def find_domain_dirs(unit_dir: Path, limit: int = 5) -> list[str]:
    found: list[str] = []
    skip = {"vendor", "target", "node_modules", ".git", "docs"}
    for cur, dirs, _ in os.walk(unit_dir):
        dirs[:] = sorted(d for d in dirs if d not in skip and not d.startswith("."))
        for d in dirs:
            name = re.sub(r"[-_](crate|lib)$", "", d.lower())
            if name in INNER:
                found.append(os.path.join(cur, d))
                if len(found) >= limit:
                    return found
    return found


def cmd_doctor(data: dict) -> None:
    """Self-check. Prints a human-readable result to stdout (not registered as a hook)"""
    root = project_dir(data)
    out = [f"arch-forge hooks doctor (profile: {os.environ.get('ARCH_FORGE_HOOK_PROFILE') or os.environ.get('CLAUDE_PLUGIN_OPTION_HOOK_PROFILE') or 'standard'})",
           f"- Project: {root}"]
    decision = load_decision(root)
    if decision is None:
        out.append("- NG cannot read decision.json (missing or invalid JSON). The hooks do nothing")
        print("\n".join(out))
        return
    units = safe_units(decision)
    skipped = len(decision.get("units") or []) - len(units)
    out.append(f"- OK read decision.json ({len(units)} units" + (f", {skipped} excluded for an invalid path" if skipped else "") + ")")

    # Context injected by session-start
    buf = []
    global emit
    real_emit = emit
    emit = buf.append  # type: ignore[assignment]
    try:
        cmd_session_start(data)
    finally:
        emit = real_emit  # type: ignore[assignment]
    ctx = buf[0]["hookSpecificOutput"]["additionalContext"] if buf else ""
    out.append(f"- {'OK' if ctx else 'NG'} session-start context injection: {len(ctx.splitlines())} lines")

    # What post-edit checks (directories recognized as the domain layer), and a detection probe
    shared = shared_build_units(units)
    seen_paths: set[str] = set()
    for u in units:
        if u["path"] in seen_paths:
            continue  # check the same build unit only once
        seen_paths.add(u["path"])
        if u["path"] in shared:
            u = {**u, "name": "+".join(shared[u["path"]])}
        unit_dir = root / u["path"]
        if not unit_dir.is_dir():
            out.append(f"- NG unit {u.get('name')}: path={u['path']} does not exist")
            continue
        domains = find_domain_dirs(unit_dir)
        if not domains:
            out.append(f"- WARN unit {u.get('name')}: no domain layer directory ({', '.join(INNER_DIR_NAMES)}) found. The dependency direction check covers only the outer layers")
            continue
        rel = PurePosixPath(Path(domains[0]).relative_to(root).as_posix()) / "probe.go"
        lang = str(u.get("language", ""))
        if lang == "go":
            issues = check_go(rel, 'package domain\nimport "net/http"\n', root, u)
        elif lang == "php":
            issues = check_php(rel.with_suffix(".php"), "<?php\nuse Illuminate\\Support\\Facades\\DB;\n", u)
        elif lang == "rust":
            issues = check_rust(rel.with_suffix(".rs"), "use axum::Router;\n", u)
        else:
            issues = []
        out.append(f"- {'OK' if issues else 'NG'} unit {u.get('name')}: recognized {rel.parent} as the domain layer"
                   + (" and detected the framework dependency" if issues else ", but did not detect the probe violation"))
        lint = lint_commands(unit_dir, lang)
        out.append(f"  - strict pre-stop check: {' '.join(lint[0]) if lint else 'none (no go-arch-lint tool registration or vendor/bin/deptrac)'}")
    rules_dir = root / ".claude" / "rules" / "arch-forge"
    out.append(f"- {'OK' if rules_dir.is_dir() else 'WARN'} .claude/rules/arch-forge/ " + ("exists" if rules_dir.is_dir() else "does not exist (install with /arch-forge:rules)"))
    print("\n".join(out))


# --------------------------------------------------------------------------- main

COMMANDS = {
    "session-start": cmd_session_start,
    "pre-edit": cmd_pre_edit,
    "post-edit": cmd_post_edit,
    "stop": cmd_stop,
    "doctor": cmd_doctor,
}


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        return 0
    data = read_input()
    try:
        COMMANDS[sys.argv[1]](data)
    except Exception as e:  # never stop the session because of a hook bug
        if sys.argv[1] == "doctor":
            print(f"NG arch-forge hooks doctor failed: {e!r}")
        elif os.environ.get("ARCH_FORGE_HOOK_DEBUG"):
            print(f"arch-forge hook error: {e!r}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
