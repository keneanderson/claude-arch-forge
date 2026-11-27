"""Tests for the arch-forge hooks (standard library only)

python3 -m unittest discover -s tests/hooks -v
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / "plugins" / "arch-forge" / "hooks" / "run-hook.sh"

DECISION = {
    "version": 1,
    "project": {"name": "shop", "summary": "for tests", "goModulePath": "example.com/shop"},
    "topology": "modular-monolith",
    "repoLayout": "single",
    "units": [
        {"name": "app", "kind": "app", "language": "go", "pattern": "clean", "path": ".",
         "framework": "chi", "libraries": {"db": "sqlc+pgx", "migration": "goose"},
         "responsibilities": ["orders"], "modules": [{"name": "ordering", "pattern": "clean"}]},
    ],
    "shared": {},
    "scaffold": {},
}

ADR_ACCEPTED = textwrap.dedent("""\
    # ADR-0001: Application architecture

    - Status: Accepted
    - Deciders: user
    """)

# The same ADR written in Japanese ("Status: Accepted"); the hook matches Japanese status words too.
ADR_ACCEPTED_JA = "# ADR-0001\n\n- \u30b9\u30c6\u30fc\u30bf\u30b9: \u627f\u8a8d\u6e08\u307f\n"


def run(cmd: str, payload: dict, cwd: Path, profile: str = "standard") -> dict | None:
    env = {**os.environ, "CLAUDE_PROJECT_DIR": str(cwd), "ARCH_FORGE_HOOK_PROFILE": profile}
    out = subprocess.run(["bash", str(RUNNER), cmd], input=json.dumps(payload), capture_output=True,
                         text=True, env=env, timeout=30)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout) if out.stdout.strip() else None


class Project:
    def __init__(self, with_decision: bool = True):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        if with_decision:
            self.write("docs/architecture/decision.json", json.dumps(DECISION, ensure_ascii=False))
            self.write("docs/architecture/adr/0001-application-architecture.md", ADR_ACCEPTED)
            self.write("go.mod", "module example.com/shop\n\ngo 1.24\n")

    def write(self, rel: str, text: str) -> Path:
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
        return p

    def close(self) -> None:
        self.tmp.cleanup()


class SessionStartTest(unittest.TestCase):
    def test_injects_summary_when_decision_exists(self):
        p = Project()
        try:
            out = run("session-start", {"hook_event_name": "SessionStart"}, p.root, "minimal")
            ctx = out["hookSpecificOutput"]["additionalContext"]
            self.assertIn("modular-monolith", ctx)
            self.assertIn("Unit app", ctx)
            self.assertIn("/arch-forge:rules", ctx)
            self.assertIn("framework=chi", ctx)
            self.assertIn("db=sqlc+pgx", ctx)
        finally:
            p.close()

    def test_suggests_resume_when_design_in_progress(self):
        p = Project(with_decision=False)
        try:
            p.write("docs/architecture/00-brief.md", "# brief\n")
            out = run("session-start", {}, p.root)
            self.assertIn("/arch-forge:design", out["hookSpecificOutput"]["additionalContext"])
        finally:
            p.close()

    def test_silent_without_architecture_docs(self):
        p = Project(with_decision=False)
        try:
            self.assertIsNone(run("session-start", {}, p.root))
        finally:
            p.close()

    def test_off_profile_disables_everything(self):
        p = Project()
        try:
            self.assertIsNone(run("session-start", {}, p.root, "off"))
        finally:
            p.close()


class PreEditTest(unittest.TestCase):
    def setUp(self):
        self.p = Project()
        self.adr = str(self.p.root / "docs/architecture/adr/0001-application-architecture.md")

    def tearDown(self):
        self.p.close()

    def test_accepted_adr_edit_asks_in_standard(self):
        out = run("pre-edit", {"tool_name": "Edit", "tool_input": {"file_path": self.adr, "new_string": "another decision"}}, self.p.root)
        self.assertEqual(out["hookSpecificOutput"]["permissionDecision"], "ask")

    def test_accepted_adr_edit_denied_in_strict(self):
        out = run("pre-edit", {"tool_name": "Edit", "tool_input": {"file_path": self.adr, "new_string": "another decision"}}, self.p.root, "strict")
        self.assertEqual(out["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_accepted_adr_in_japanese_is_protected(self):
        ja = self.p.write("docs/architecture/adr/0002-ja.md", ADR_ACCEPTED_JA)
        out = run("pre-edit", {"tool_name": "Edit", "tool_input": {"file_path": str(ja), "new_string": "another decision"}}, self.p.root)
        self.assertEqual(out["hookSpecificOutput"]["permissionDecision"], "ask")

    def test_marking_superseded_is_allowed(self):
        out = run("pre-edit", {"tool_name": "Edit", "tool_input": {"file_path": self.adr, "new_string": "- Status: Superseded by ADR-0002"}}, self.p.root, "strict")
        self.assertIsNone(out)

    def test_new_adr_is_allowed(self):
        new = str(self.p.root / "docs/architecture/adr/0002-new.md")
        self.assertIsNone(run("pre-edit", {"tool_name": "Write", "tool_input": {"file_path": new, "content": "x"}}, self.p.root, "strict"))

    def test_minimal_does_not_guard(self):
        self.assertIsNone(run("pre-edit", {"tool_name": "Edit", "tool_input": {"file_path": self.adr, "new_string": "x"}}, self.p.root, "minimal"))

    def test_decision_edit_reminds_in_standard_and_asks_in_strict(self):
        path = str(self.p.root / "docs/architecture/decision.json")
        out = run("pre-edit", {"tool_name": "Write", "tool_input": {"file_path": path, "content": "{}"}}, self.p.root)
        self.assertIn("additionalContext", out["hookSpecificOutput"])
        out = run("pre-edit", {"tool_name": "Write", "tool_input": {"file_path": path, "content": "{}"}}, self.p.root, "strict")
        self.assertEqual(out["hookSpecificOutput"]["permissionDecision"], "ask")


class PostEditGoTest(unittest.TestCase):
    def setUp(self):
        self.p = Project()

    def tearDown(self):
        self.p.close()

    def edit(self, rel: str, src: str, profile: str = "standard") -> dict | None:
        path = self.p.write(rel, src)
        return run("post-edit", {"tool_name": "Write", "tool_input": {"file_path": str(path)}}, self.p.root, profile)

    def test_domain_importing_net_http_warns(self):
        out = self.edit("internal/modules/ordering/domain/order.go",
                        'package domain\n\nimport (\n\t"errors"\n\t"net/http"\n)\n')
        ctx = out["hookSpecificOutput"]["additionalContext"]
        self.assertIn("net/http", ctx)

    def test_domain_importing_fiber_warns(self):
        out = self.edit("internal/modules/ordering/domain/order.go",
                        'package domain\n\nimport "github.com/gofiber/fiber/v2"\n')
        self.assertIn("gofiber", out["hookSpecificOutput"]["additionalContext"])

    def test_usecase_test_importing_adapter_warns(self):
        out = self.edit("internal/modules/ordering/usecase/create_test.go",
                        'package usecase\n\nimport "example.com/shop/internal/modules/ordering/adapter/memory"\n')
        self.assertIn("test in an inner layer", out["hookSpecificOutput"]["additionalContext"])

    def test_cross_module_internal_reference_warns(self):
        out = self.edit("internal/modules/ordering/usecase/create.go",
                        'package usecase\n\nimport "example.com/shop/internal/modules/inventory/domain"\n')
        self.assertIn("inventory", out["hookSpecificOutput"]["additionalContext"])

    def test_cross_module_public_api_is_fine(self):
        self.assertIsNone(self.edit("internal/modules/ordering/usecase/create.go",
                                    'package usecase\n\nimport "example.com/shop/internal/modules/inventory"\n'))

    def test_clean_code_is_silent(self):
        self.assertIsNone(self.edit("internal/modules/ordering/usecase/create.go",
                                    'package usecase\n\nimport (\n\t"context"\n\t"example.com/shop/internal/modules/ordering/domain"\n)\n'))

    def test_strict_blocks(self):
        out = self.edit("internal/modules/ordering/domain/order.go", 'package domain\n\nimport "database/sql"\n', "strict")
        self.assertEqual(out["decision"], "block")

    def test_non_code_file_is_ignored(self):
        self.assertIsNone(self.edit("README.md", "net/http"))


class PostEditOtherLanguagesTest(unittest.TestCase):
    def setUp(self):
        self.p = Project(with_decision=False)
        decision = {**DECISION, "topology": "microservices", "repoLayout": "monorepo", "units": [
            {"name": "billing", "kind": "service", "language": "php", "pattern": "clean", "path": "services/billing", "responsibilities": ["billing"]},
            {"name": "catalog", "kind": "service", "language": "rust", "pattern": "clean", "path": "services/catalog", "responsibilities": ["products"]},
            {"name": "evil", "kind": "service", "language": "go", "pattern": "clean", "path": "../outside", "responsibilities": ["x"]},
        ]}
        self.p.write("docs/architecture/decision.json", json.dumps(decision))

    def tearDown(self):
        self.p.close()

    def edit(self, rel: str, src: str) -> dict | None:
        path = self.p.write(rel, src)
        return run("post-edit", {"tool_name": "Write", "tool_input": {"file_path": str(path)}}, self.p.root)

    def test_php_domain_using_eloquent_warns(self):
        out = self.edit("services/billing/src/Billing/Domain/Invoice.php",
                        "<?php\ndeclare(strict_types=1);\nnamespace Acme\\Billing\\Domain;\nuse Illuminate\\Database\\Eloquent\\Model;\n")
        self.assertIn("Illuminate", out["hookSpecificOutput"]["additionalContext"])

    def test_php_application_using_infrastructure_warns(self):
        out = self.edit("services/billing/src/Billing/Application/Issue.php",
                        "<?php\nuse Acme\\Billing\\Infrastructure\\EloquentInvoiceRepository;\n")
        self.assertIn("Infrastructure", out["hookSpecificOutput"]["additionalContext"])

    def test_rust_domain_using_sqlx_warns(self):
        out = self.edit("services/catalog/crates/domain/src/product.rs", "use sqlx::PgPool;\npub struct Product;\n")
        self.assertIn("sqlx", out["hookSpecificOutput"]["additionalContext"])

    def test_rust_domain_cargo_dependency_warns(self):
        out = self.edit("services/catalog/crates/domain/Cargo.toml",
                        '[package]\nname = "domain"\n\n[dependencies]\nthiserror = "2"\naxum = "0.8"\n')
        self.assertIn("axum", out["hookSpecificOutput"]["additionalContext"])

    def test_rust_domain_cargo_actix_web_warns(self):
        out = self.edit("services/catalog/crates/domain/Cargo.toml",
                        '[package]\nname = "domain"\n\n[dependencies]\nactix-web = "4"\n')
        self.assertIn("actix-web", out["hookSpecificOutput"]["additionalContext"])

    def test_rust_application_clean_is_silent(self):
        self.assertIsNone(self.edit("services/catalog/crates/application/src/lib.rs", "use domain::Product;\n"))

    def test_unit_with_unsafe_path_is_ignored(self):
        self.assertIsNone(self.edit("outside/internal/domain/x.go", 'package domain\nimport "net/http"\n'))


class StopTest(unittest.TestCase):
    def test_stop_is_noop_outside_strict_and_when_active(self):
        p = Project()
        try:
            self.assertIsNone(run("stop", {}, p.root, "standard"))
            self.assertIsNone(run("stop", {"stop_hook_active": True}, p.root, "strict"))
        finally:
            p.close()

    def test_stop_without_git_is_noop(self):
        p = Project()
        try:
            self.assertIsNone(run("stop", {}, p.root, "strict"))
        finally:
            p.close()


class RobustnessTest(unittest.TestCase):
    def test_garbage_input_never_fails(self):
        p = Project()
        try:
            for cmd in ("session-start", "pre-edit", "post-edit", "stop", "unknown"):
                env = {**os.environ, "CLAUDE_PROJECT_DIR": str(p.root), "ARCH_FORGE_HOOK_PROFILE": "strict"}
                out = subprocess.run(["bash", str(RUNNER), cmd], input="not json", capture_output=True, text=True, env=env, timeout=30)
                self.assertEqual(out.returncode, 0)
        finally:
            p.close()

    def test_broken_decision_json_is_ignored(self):
        p = Project(with_decision=False)
        try:
            p.write("docs/architecture/decision.json", "{broken")
            path = p.write("internal/domain/x.go", 'package domain\nimport "net/http"\n')
            self.assertIsNone(run("post-edit", {"tool_input": {"file_path": str(path)}}, p.root))
        finally:
            p.close()


SHARED_DECISION = {
    **DECISION,
    "units": [
        {"name": "api", "kind": "app", "language": "go", "pattern": "clean", "path": ".", "entrypoint": "cmd/api",
         "packaging": "by-feature", "responsibilities": ["API"]},
        {"name": "worker", "kind": "worker", "language": "go", "pattern": "layered", "path": ".", "entrypoint": "cmd/worker",
         "responsibilities": ["jobs"]},
    ],
    "conventions": [{"id": "C1", "rule": "Call other modules through api.go", "check": "arch-lint"}],
}


def run_doctor(cwd: Path) -> str:
    env = {**os.environ, "CLAUDE_PROJECT_DIR": str(cwd)}
    script = ROOT / "plugins" / "arch-forge" / "hooks" / "arch_hooks.py"
    out = subprocess.run(["python3", "-I", str(script), "doctor"], input="", capture_output=True, text=True, env=env, timeout=30)
    assert out.returncode == 0, out.stderr
    return out.stdout


class SharedBuildUnitTest(unittest.TestCase):
    def setUp(self):
        self.p = Project()
        self.p.write("docs/architecture/decision.json", json.dumps(SHARED_DECISION, ensure_ascii=False))

    def tearDown(self):
        self.p.close()

    def test_session_start_shows_entrypoints_shared_build_unit_and_conventions(self):
        ctx = run("session-start", {}, self.p.root, "minimal")["hookSpecificOutput"]["additionalContext"]
        self.assertIn("entrypoint=cmd/api", ctx)
        self.assertIn("packaging=by-feature", ctx)
        self.assertIn("one build unit shared by units api, worker", ctx)
        self.assertIn("C1 Call other modules through api.go", ctx)

    def test_post_edit_picks_the_unit_owning_the_entrypoint(self):
        # worker is layered, so no layer-backflow warning under worker's entrypoint
        path = self.p.write("cmd/worker/usecase/run.go",
                            'package usecase\nimport "example.com/shop/internal/adapter/http"\n')
        self.assertIsNone(run("post-edit", {"tool_input": {"file_path": str(path)}}, self.p.root))
        path = self.p.write("cmd/api/usecase/run.go",
                            'package usecase\nimport "example.com/shop/internal/adapter/http"\n')
        out = run("post-edit", {"tool_input": {"file_path": str(path)}}, self.p.root)
        self.assertIn("(unit api", out["hookSpecificOutput"]["additionalContext"])


class DoctorTest(unittest.TestCase):
    def test_reports_ok_when_domain_layer_is_detected(self):
        p = Project()
        try:
            p.write("internal/domain/order.go", "package domain\n")
            report = run_doctor(p.root)
            self.assertIn("OK read decision.json", report)
            self.assertIn("OK session-start context injection", report)
            self.assertIn("OK unit app: recognized internal/domain as the domain layer", report)
        finally:
            p.close()

    def test_checks_a_shared_build_unit_once(self):
        p = Project()
        try:
            p.write("docs/architecture/decision.json", json.dumps(SHARED_DECISION, ensure_ascii=False))
            p.write("internal/domain/order.go", "package domain\n")
            report = run_doctor(p.root)
            self.assertEqual(report.count("as the domain layer"), 1)
            self.assertIn("unit api+worker", report)
        finally:
            p.close()

    def test_reports_ng_without_decision_and_warns_without_domain_dir(self):
        p = Project(with_decision=False)
        try:
            self.assertIn("NG cannot read decision.json", run_doctor(p.root))
        finally:
            p.close()
        p = Project()
        try:
            self.assertIn("no domain layer directory", run_doctor(p.root))
        finally:
            p.close()


if __name__ == "__main__":
    unittest.main()
