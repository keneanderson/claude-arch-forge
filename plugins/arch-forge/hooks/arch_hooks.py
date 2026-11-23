#!/usr/bin/env python3
"""arch-forge hooks（標準ライブラリのみ）

サブコマンド:
  session-start  確定アーキテクチャの要約をセッション文脈に注入する（minimal 以上）
  pre-edit       承認済み ADR と decision.json の編集を保護する（standard 以上）
  post-edit      編集したファイルの依存方向をすぐに検査する（standard 以上）
  stop           変更のあるユニットで arch-lint を実行する（strict のみ）
  doctor         hooks が decision.json を読めるか、何を注入・検査するかを表示する（完了報告前の動作確認用。常に実行）

プロファイル（ARCH_FORGE_HOOK_PROFILE）:
  minimal  文脈注入のみ
  standard 文脈注入 + 警告（ブロックしない。承認済み ADR の編集は確認を求める）
  strict   standard の警告をブロックに格上げし、停止前に arch-lint を実行する

どの失敗でもセッションを止めない: 例外はすべて握りつぶして exit 0 で終わる。
decision.json が無いプロジェクトでは何もしない。
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

# 層の判定に使うディレクトリ名（小文字で比較）。0 が最も内側。
INNER = {"domain", "entity", "entities"}
MIDDLE = {"usecase", "usecases", "application", "app_service", "appservice"}
OUTER = {
    "adapter", "adapters", "infrastructure", "infra", "handler", "handlers",
    "presentation", "interfaces", "controller", "controllers", "persistence",
}

# ドメイン層が依存してはいけない外部ライブラリ
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


# --------------------------------------------------------------------------- 入出力


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
                         "[arch-forge] docs/architecture/ に設計途中のドキュメントがあり、decision.json はまだ無い。"
                         "アーキテクチャ設計の続きは /arch-forge:design で再開できる（Step 0 で途中から再開）。"))
        return

    lines = ["[arch-forge] このプロジェクトのアーキテクチャは確定済み。コードを変更するときは次に従うこと。"]
    proj = decision.get("project") or {}
    lines.append(f"- プロジェクト: {proj.get('name', '?')} / トポロジー: {decision.get('topology', '?')} / "
                 f"リポジトリ構成: {decision.get('repoLayout', '?')}")
    for u in safe_units(decision)[:12]:
        mods = ", ".join(m.get("name", "") for m in (u.get("modules") or []) if isinstance(m, dict))
        fw = str(u.get("framework") or "").strip()
        libs = u.get("libraries") if isinstance(u.get("libraries"), dict) else {}
        stack = ", ".join(f"{k}={v}" for k, v in list(libs.items())[:6] if isinstance(v, str))
        ep = str(u.get("entrypoint") or "").strip()
        pk = str(u.get("packaging") or "").strip()
        lines.append(f"- ユニット {u.get('name')}: {u.get('language')} / {u.get('pattern')} / path={u['path']}"
                     + (f" / entrypoint={ep}" if ep else "")
                     + (f" / packaging={pk}" if pk else "")
                     + (f" / framework={fw}" if fw else "")
                     + (f" / libraries=[{stack}]" if stack else "")
                     + (f" / modules=[{mods}]" if mods else ""))
    shared = shared_build_units(safe_units(decision))
    for path, names in shared.items():
        lines.append(f"- path={path} はユニット {', '.join(names)} が共有する 1 つのビルド単位（共通部分を変えると全員に影響する）")
    conv = [c for c in (decision.get("conventions") or []) if isinstance(c, dict) and c.get("id") and c.get("rule")]
    if conv:
        lines.append("- 実装規約: " + " / ".join(f"{c['id']} {str(c['rule'])[:80]}" for c in conv[:9]))
    adrs = sorted(p.name for p in (root / ADR_DIR).glob("*.md")) if (root / ADR_DIR).is_dir() else []
    if adrs:
        lines.append(f"- ADR: {', '.join(adrs[:10])}（docs/architecture/adr/）")
    rules_dir = root / ".claude" / "rules" / "arch-forge"
    if rules_dir.is_dir():
        lines.append("- 依存ルールの詳細は .claude/rules/arch-forge/ にある（該当ファイルを開くと自動で読み込まれる）")
    else:
        lines.append("- .claude/rules/arch-forge/ が無い。/arch-forge:rules で依存ルールを導入できる")
    lines.append("- 依存は内側（domain）に向ける。層・モジュール・サービスの境界や、フレームワーク・主要ライブラリを変える判断は新しい ADR を書いてから行う")
    lines.append("- 承認済み ADR は書き換えない（置き換える ADR を新規に作る）。構造を変えたら /arch-forge:check で検査する")
    lines.append(f"- hook プロファイル: {profile()}")
    emit(context("SessionStart", "\n".join(lines)))


def context(event: str, text: str) -> dict:
    return {"hookSpecificOutput": {"hookEventName": event, "additionalContext": text}}


# --------------------------------------------------------------------------- pre-edit

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

    # 承認済み ADR の書き換え
    if rel.parent == ADR_DIR and rel.suffix == ".md" and target.is_file():
        try:
            current = target.read_text(encoding="utf-8")
        except Exception:
            return
        if not ACCEPTED_RE.search(current):
            return
        if SUPERSEDE_RE.search(edit_payload(tool_input)):
            return  # ステータスを「置き換え済み」等に変える編集は許可
        reason = (f"{rel} は承認済みの ADR。ADR は不変として扱い、変更が必要なら新しい ADR を作成して"
                  "旧 ADR のステータスを「置き換え済み（ADR-XXXX）」に変えること。")
        decision = "deny" if at_least("strict") else "ask"
        emit({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": f"[arch-forge] {reason}",
        }})
        return

    # decision.json の書き換え
    if rel == DECISION and target.is_file():
        msg = ("[arch-forge] decision.json は確定済みアーキテクチャの契約。変更する場合は同じ変更を説明する ADR を追加し、"
               "変更後に /arch-forge:rules（ルール再生成）と /arch-forge:check（適合チェック）を実行すること。")
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
    # 同じ path を共有するユニットのうち、起動点の下のファイルならそのユニットを選ぶ
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
            issues.append(f'ドメイン層が "{imp}" を import している（ドメインはフレームワーク・DB・ロガー実装に依存しない）')
        if internal and layer is not None and pattern not in ("layered", "vertical-slice"):
            rest = imp[len(mod):].strip("/").split("/") if imp != mod else []
            target = layer_of(rest)
            if target is not None and target > layer:
                kind = "テスト" if is_test else "コード"
                issues.append(f'内側の層の{kind}が外側の層 "{imp}" を import している（依存は内側に向ける。テストダブルはテスト内に置く）')
        if internal and my_module:
            rest = imp[len(mod):].strip("/").split("/") if imp != mod else []
            low = [r.lower() for r in rest]
            if "modules" in low:
                i = low.index("modules")
                other = rest[i + 1] if i + 1 < len(rest) else None
                if other and other != my_module and len(rest) > i + 2:
                    issues.append(f'モジュール {my_module} が他モジュール {other} の内部 "{imp}" を参照している（公開 API のルートパッケージ経由にする）')
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
            issues.append(f"ドメイン層が {use} を use している（ドメインはフレームワーク・ORM・HTTP に依存しない）")
            continue
        framework = any(use.startswith(f) for f in PHP_FORBIDDEN_IN_DOMAIN)
        if not framework and layer is not None and pattern not in ("layered", "vertical-slice"):
            target = layer_of(segs[:-1])
            if target is not None and target > layer:
                issues.append(f"内側の層が外側の層 {use} を use している（依存は内側に向ける）")
        if my_module and len(segs) > 2 and segs[0] == "Modules" and segs[1] != my_module and segs[2] != "Contracts":
            issues.append(f"モジュール {my_module} が他モジュール {segs[1]} の内部 {use} を参照している（Contracts の interface 経由にする）")
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
            issues.append(f"ドメイン層が {head} を使っている（ドメイン crate はフレームワーク・DB・ランタイムに依存しない）")
        elif (layer is not None and head_layer is not None and head_layer > layer
              and pattern not in ("layered", "vertical-slice")):
            key = segs[1] if head in ("crate", "super", "self") else head
            if key not in seen:
                seen.add(key)
                issues.append(f"内側の層が外側の層 {key} を参照している（依存は内側に向ける）")
    return issues


def check_cargo_toml(rel: PurePosixPath, src: str) -> list[str]:
    if layer_of(list(rel.parent.parts)) != 0:
        return []
    issues = []
    for section in re.findall(r"^\[(?:dev-)?dependencies\]\s*\n(.*?)(?=^\[|\Z)", src, re.MULTILINE | re.DOTALL):
        for name in re.findall(r"^\s*([A-Za-z0-9_-]+)\s*=", section, re.MULTILINE):
            n = name.lower()
            if n in RUST_FORBIDDEN_CRATES_IN_DOMAIN or n.replace("-", "_") in RUST_FORBIDDEN_IN_DOMAIN:
                issues.append(f"ドメイン crate の Cargo.toml が {name} に依存している")
            elif layer_of([n]) in (1, 2):
                issues.append(f"ドメイン crate が外側の crate {name} に依存している（依存は内側に向ける）")
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
    body = (f"[arch-forge] {rel} に依存ルール違反の可能性がある（ユニット {unit.get('name')} / {unit.get('pattern')}）:\n"
            + "\n".join(f"- {i}" for i in dict.fromkeys(issues))
            + "\n意図した変更なら ADR に理由を書く。そうでなければ port（interface / trait）を内側に定義して依存を逆転させる。")
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
        if p in done:  # 同じビルド単位を共有するユニットは 1 回だけ検査する
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
                failures.append(f"## {u.get('name')}: `{' '.join(cmd)}` が失敗（exit {r.returncode}）\n{tail}")
    if failures:
        emit({"decision": "block",
              "reason": "[arch-forge] 依存方向チェックが失敗した。違反を修正するか、意図的なら ADR を追加してから終了すること。\n\n"
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
    """動作確認。結果を人が読む形で stdout に出す（hook としては登録しない）"""
    root = project_dir(data)
    out = [f"arch-forge hooks doctor（プロファイル: {os.environ.get('ARCH_FORGE_HOOK_PROFILE') or os.environ.get('CLAUDE_PLUGIN_OPTION_HOOK_PROFILE') or 'standard'}）",
           f"- プロジェクト: {root}"]
    decision = load_decision(root)
    if decision is None:
        out.append("- NG decision.json を読めない（無いか JSON が壊れている）。hooks は何もしない")
        print("\n".join(out))
        return
    units = safe_units(decision)
    skipped = len(decision.get("units") or []) - len(units)
    out.append(f"- OK decision.json を読めた（ユニット {len(units)} 個" + (f"、path が不正で除外 {skipped} 個" if skipped else "") + "）")

    # session-start で注入される文脈
    buf = []
    global emit
    real_emit = emit
    emit = buf.append  # type: ignore[assignment]
    try:
        cmd_session_start(data)
    finally:
        emit = real_emit  # type: ignore[assignment]
    ctx = buf[0]["hookSpecificOutput"]["additionalContext"] if buf else ""
    out.append(f"- {'OK' if ctx else 'NG'} セッション開始時の文脈注入: {len(ctx.splitlines())} 行")

    # post-edit の検査対象（ドメイン層として認識されるディレクトリ）と、検出の試験
    shared = shared_build_units(units)
    seen_paths: set[str] = set()
    for u in units:
        if u["path"] in seen_paths:
            continue  # 同じビルド単位は 1 回だけ確認する
        seen_paths.add(u["path"])
        if u["path"] in shared:
            u = {**u, "name": "+".join(shared[u["path"]])}
        unit_dir = root / u["path"]
        if not unit_dir.is_dir():
            out.append(f"- NG ユニット {u.get('name')}: path={u['path']} が存在しない")
            continue
        domains = find_domain_dirs(unit_dir)
        if not domains:
            out.append(f"- 注意 ユニット {u.get('name')}: ドメイン層のディレクトリ（{', '.join(INNER_DIR_NAMES)}）が見つからない。依存方向チェックは外側の層どうしだけになる")
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
        out.append(f"- {'OK' if issues else 'NG'} ユニット {u.get('name')}: {rel.parent} をドメイン層と認識"
                   + ("し、フレームワークへの依存を検出できた" if issues else "したが、試験の違反を検出できなかった"))
        lint = lint_commands(unit_dir, lang)
        out.append(f"  - strict の停止前チェック: {' '.join(lint[0]) if lint else '対象なし（go-arch-lint の tool 登録、または vendor/bin/deptrac が無い）'}")
    rules_dir = root / ".claude" / "rules" / "arch-forge"
    out.append(f"- {'OK' if rules_dir.is_dir() else '注意'} .claude/rules/arch-forge/ " + ("がある" if rules_dir.is_dir() else "が無い（/arch-forge:rules で導入）"))
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
    except Exception as e:  # hook の不具合でセッションを止めない
        if sys.argv[1] == "doctor":
            print(f"NG arch-forge hooks doctor が失敗した: {e!r}")
        elif os.environ.get("ARCH_FORGE_HOOK_DEBUG"):
            print(f"arch-forge hook error: {e!r}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
