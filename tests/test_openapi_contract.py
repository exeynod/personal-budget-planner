"""Phase 69 B1 — OpenAPI contract guard.

Asserts the live ``app.openapi()`` schema is a sound, complete single source
of truth for the web (B2) + iOS (B3) codegen:

1. All 8 in-scope domains expose at least one path.
2. Every public 2xx READ-DTO route declares a real schema ``$ref`` (not a
   free-form ``object``) — with the free-form data-dump / compliance routes on
   an explicit EXEMPTION allowlist so they are not flagged (synthesising a
   model for an arbitrary export would risk reshaping compliance keys = a
   regression; see app/api/routes/me.py GET /me/export).
3. ``CategoryRead`` lists ``code`` / ``ord`` / ``created_at`` in its ``required``
   set (the fact that kills the web/iOS "pending schema" stubs in 69-04/05),
   while the server-defaulted fields (``plan_cents`` / ``rollover`` / ``paused``
   / ``parent_id`` / ``tag``) are present but NOT required (optional in the
   generated types).

The guard runs against the LIVE schema (``app.openapi()``) rather than the
committed file so a code change that breaks the contract fails CI immediately,
before the artifact is regenerated.
"""
from __future__ import annotations

from main_api import app

# 8 in-scope domains → their OpenAPI path prefixes. Note ``actuals`` is mounted
# under the singular ``/api/v1/actual`` prefix.
DOMAIN_PREFIXES: dict[str, str] = {
    "subscriptions": "/api/v1/subscriptions",
    "categories": "/api/v1/categories",
    "actuals": "/api/v1/actual",
    "me": "/api/v1/me",
    "ai": "/api/v1/ai",
    "accounts": "/api/v1/accounts",
    "savings": "/api/v1/savings",
    "goals": "/api/v1/goals",
}

# Free-form data-dump / compliance routes intentionally left response_model=None
# (the synthesise-a-model risk is a regression). EXEMPTED from the schema-ref
# coverage check. Keyed by (path, method-lower).
SCHEMA_REF_EXEMPTIONS: set[tuple[str, str]] = {
    # Right-of-access export: arbitrary nested per-user data dump (CMP-33-06).
    ("/api/v1/me/export", "get"),
    # SSE token stream — text/event-stream, not a JSON response_model.
    ("/api/v1/ai/chat", "post"),
}


def _spec() -> dict:
    return app.openapi()


def test_all_eight_domains_present():
    spec = _spec()
    paths = spec["paths"]
    for domain, prefix in DOMAIN_PREFIXES.items():
        hits = [p for p in paths if p.startswith(prefix)]
        assert hits, f"Domain {domain!r} ({prefix}) has no paths in the OpenAPI spec"


def _response_has_schema(response: dict) -> bool:
    """True if the 2xx response declares a real (typed) JSON schema.

    A free-form ``{"type": "object"}`` with no ``$ref`` / ``properties`` /
    ``items`` and no ``additionalProperties`` schema is treated as untyped.
    A 204 (no content) has no ``content`` and is not a READ-DTO surface.
    """
    content = response.get("content")
    if not content:
        # No body (e.g. 204) — not a READ-DTO surface.
        return True
    for media in content.values():
        schema = media.get("schema")
        if _schema_is_typed(schema):
            return True
    return False


def _schema_is_typed(schema: dict | None) -> bool:
    """True if ``schema`` resolves to a declared model (not a free-form dict).

    Handles ``$ref``, ``list[Model]`` (array+items.$ref), inline objects with
    properties, and ``Optional[Model]`` / unions (anyOf/oneOf/allOf carrying a
    typed member — e.g. ``Optional[SubscriptionRead]`` → anyOf[$ref, null]).
    """
    if not schema:
        return False
    if "$ref" in schema:
        return True
    items = schema.get("items")
    if isinstance(items, dict) and _schema_is_typed(items):
        return True
    if schema.get("properties"):
        return True
    for key in ("anyOf", "oneOf", "allOf"):
        members = schema.get(key)
        if isinstance(members, list) and any(
            _schema_is_typed(m) for m in members if isinstance(m, dict)
        ):
            return True
    return False


def test_every_public_read_dto_route_has_a_schema():
    """Each public 2xx response carries a typed schema (or is exempted)."""
    spec = _spec()
    in_scope_prefixes = tuple(DOMAIN_PREFIXES.values())
    offenders: list[str] = []
    for path, methods in spec["paths"].items():
        if not path.startswith(in_scope_prefixes):
            continue
        for method, op in methods.items():
            if method.lower() not in {"get", "post", "patch", "put", "delete"}:
                continue
            if (path, method.lower()) in SCHEMA_REF_EXEMPTIONS:
                continue
            responses = op.get("responses", {})
            for code, response in responses.items():
                if not str(code).startswith("2"):
                    continue
                if str(code) == "204":
                    continue
                if not _response_has_schema(response):
                    offenders.append(f"{method.upper()} {path} -> {code}")
    assert not offenders, (
        "Public READ-DTO routes returning an untyped/free-form 2xx body "
        f"(add a response_model or exempt them explicitly): {offenders}"
    )


def test_category_read_required_vs_optional_split():
    """code/ord/created_at REQUIRED; defaulted v1.0 fields OPTIONAL."""
    spec = _spec()
    cr = spec["components"]["schemas"]["CategoryRead"]
    required = set(cr.get("required", []))
    props = set(cr["properties"].keys())

    # The three fields that kill the pending-schema stubs (no server default).
    for field in ("code", "ord", "created_at"):
        assert field in required, (
            f"CategoryRead.{field} must be REQUIRED in the contract "
            f"(got required={sorted(required)})"
        )

    # Server-defaulted fields: present but NOT required → optional in codegen.
    for field in ("plan_cents", "rollover", "paused", "parent_id", "tag"):
        assert field in props, f"CategoryRead.{field} missing from properties"
        assert field not in required, (
            f"CategoryRead.{field} has a server default → must NOT be required"
        )


def test_consent_routes_carry_typed_response_models():
    """The structured-read me compliance routes now declare a schema $ref."""
    spec = _spec()
    paths = spec["paths"]
    typed = {
        ("/api/v1/me/consent", "post"),
        ("/api/v1/me/consent", "delete"),
        ("/api/v1/me/account", "delete"),
    }
    for path, method in typed:
        op = paths[path][method]
        ok = _response_has_schema(op["responses"]["200"])
        assert ok, f"{method.upper()} {path} 200 must declare a typed schema"
