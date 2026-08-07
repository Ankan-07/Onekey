# tests/test_registry.py — unit tests for registry.py
#
# What this file does: verifies model parsing, tier lookups, cascade logic,
# effective table building, and provider catalog merging — all pure functions,
# no DB or HTTP involved.
# What it must never do: import models.py or make network calls.

import pytest

from registry import (
    PROVIDERS,
    MODEL_TIERS,
    parse_model,
    models_for_effort,
    cascade_models,
    all_models,
    models_by_tier,
    build_effective_table,
    effective_cascade,
    provider_catalog,
)


# ---------------------------------------------------------------------------
# parse_model
# ---------------------------------------------------------------------------

class TestParseModel:
    def test_slash_entry_splits_on_first_slash(self):
        provider, model = parse_model("groq/llama-3.1-8b-instant")
        assert provider == "groq"
        assert model == "llama-3.1-8b-instant"

    def test_openrouter_multi_slash_preserves_vendor_path(self):
        # "openrouter/openai/gpt-oss-20b:free" -> provider="openrouter", model="openai/gpt-oss-20b:free"
        provider, model = parse_model("openrouter/openai/gpt-oss-20b:free")
        assert provider == "openrouter"
        assert model == "openai/gpt-oss-20b:free"

    def test_bare_gemini_resolves_to_gemini(self):
        provider, model = parse_model("gemini-2.0-flash")
        assert provider == "gemini"
        assert model == "gemini-2.0-flash"

    def test_bare_mistral_resolves_to_mistral(self):
        provider, model = parse_model("mistral-small-latest")
        assert provider == "mistral"
        assert model == "mistral-small-latest"

    def test_unknown_bare_model_raises_value_error(self):
        with pytest.raises(ValueError, match="Cannot resolve provider"):
            parse_model("unknown-model-xyz")

    def test_all_registry_entries_parse_without_error(self):
        """Every entry in MODEL_TIERS must be parseable."""
        for tier, entries in MODEL_TIERS.items():
            for entry in entries:
                provider, model = parse_model(entry)
                assert provider, f"Empty provider for entry {entry!r} in tier {tier!r}"
                assert model, f"Empty model for entry {entry!r} in tier {tier!r}"


# ---------------------------------------------------------------------------
# models_for_effort
# ---------------------------------------------------------------------------

class TestModelsForEffort:
    def test_low_effort_returns_list(self):
        result = models_for_effort("low")
        assert isinstance(result, list)
        assert len(result) > 0

    def test_medium_effort_returns_list(self):
        assert len(models_for_effort("medium")) > 0

    def test_high_effort_returns_list(self):
        assert len(models_for_effort("high")) > 0

    def test_unknown_effort_raises(self):
        with pytest.raises(ValueError, match="Unknown effort"):
            models_for_effort("extreme")

    def test_returns_exact_tier_contents(self):
        assert models_for_effort("low") == MODEL_TIERS["low"]


# ---------------------------------------------------------------------------
# cascade_models
# ---------------------------------------------------------------------------

class TestCascadeModels:
    def test_low_cascade_contains_only_low_tier(self):
        result = cascade_models("low")
        # Every model in result must come from the low tier
        low_set = set(MODEL_TIERS["low"])
        for entry in result:
            assert entry in low_set

    def test_high_cascade_includes_all_tiers(self):
        result = cascade_models("high")
        all_entries = (
            set(MODEL_TIERS["high"])
            | set(MODEL_TIERS["medium"])
            | set(MODEL_TIERS["low"])
        )
        for entry in result:
            assert entry in all_entries

    def test_cascade_has_no_duplicates(self):
        for effort in ("low", "medium", "high"):
            result = cascade_models(effort)
            assert len(result) == len(set(result)), f"Duplicates found in cascade({effort!r})"

    def test_high_cascade_starts_with_high_tier_model(self):
        # The first model in a "high" cascade should come from the high tier
        result = cascade_models("high")
        assert result[0] in MODEL_TIERS["high"]

    def test_medium_cascade_does_not_include_high_only_models(self):
        # Models that only appear in "high" should not be in a "medium" cascade
        high_only = set(MODEL_TIERS["high"]) - set(MODEL_TIERS["medium"]) - set(MODEL_TIERS["low"])
        result = set(cascade_models("medium"))
        for entry in high_only:
            assert entry not in result

    def test_unknown_effort_raises(self):
        with pytest.raises(ValueError):
            cascade_models("turbo")


# ---------------------------------------------------------------------------
# all_models
# ---------------------------------------------------------------------------

class TestAllModels:
    def test_returns_list_of_dicts(self):
        result = all_models()
        assert isinstance(result, list)
        for item in result:
            assert "model_entry" in item
            assert "provider" in item
            assert "tier" in item

    def test_covers_all_tiers(self):
        tiers_seen = {m["tier"] for m in all_models()}
        assert {"low", "medium", "high"} == tiers_seen


# ---------------------------------------------------------------------------
# models_by_tier
# ---------------------------------------------------------------------------

class TestModelsByTier:
    def test_returns_all_three_tiers(self):
        result = models_by_tier()
        assert set(result.keys()) == {"low", "medium", "high"}

    def test_each_entry_has_expected_keys(self):
        result = models_by_tier()
        for tier, entries in result.items():
            for e in entries:
                assert "model_entry" in e
                assert "provider" in e
                assert "upstream_model" in e


# ---------------------------------------------------------------------------
# build_effective_table
# ---------------------------------------------------------------------------

class TestBuildEffectiveTable:
    def _default_table(self):
        return build_effective_table(overrides={}, customs=[])

    def test_returns_all_three_tiers(self):
        table = self._default_table()
        assert set(table.keys()) == {"low", "medium", "high"}

    def test_default_entries_are_enabled(self):
        table = self._default_table()
        for tier, entries in table.items():
            for e in entries:
                assert e["enabled"] is True

    def test_override_disables_entry(self):
        # Disable the first low-tier model
        first_entry = MODEL_TIERS["low"][0]
        overrides = {(first_entry, "low"): {"enabled": False}}
        table = build_effective_table(overrides=overrides, customs=[])
        disabled = [e for e in table["low"] if e["model_entry"] == first_entry]
        assert len(disabled) == 1
        assert disabled[0]["enabled"] is False

    def test_custom_model_appears_in_tier(self):
        customs = [
            {
                "model_entry": "groq/my-custom-model",
                "tier": "low",
                "enabled": True,
                "priority": 999,
            }
        ]
        table = build_effective_table(overrides={}, customs=customs)
        entries = [e["model_entry"] for e in table["low"]]
        assert "groq/my-custom-model" in entries

    def test_table_sorted_by_priority(self):
        overrides = {
            (MODEL_TIERS["low"][0], "low"): {"priority": 999},
        }
        table = build_effective_table(overrides=overrides, customs=[])
        priorities = [e["priority"] for e in table["low"]]
        assert priorities == sorted(priorities)


# ---------------------------------------------------------------------------
# effective_cascade
# ---------------------------------------------------------------------------

class TestEffectiveCascade:
    def _default_table(self):
        return build_effective_table(overrides={}, customs=[])

    def test_returns_list(self):
        table = self._default_table()
        result = effective_cascade(table, "low")
        assert isinstance(result, list)

    def test_no_duplicates(self):
        table = self._default_table()
        for effort in ("low", "medium", "high"):
            result = effective_cascade(table, effort)
            assert len(result) == len(set(result))

    def test_excluded_model_not_in_result(self):
        table = self._default_table()
        excluded = MODEL_TIERS["low"][0]
        result = effective_cascade(table, "low", excluded_models={excluded})
        assert excluded not in result

    def test_excluded_provider_removes_all_its_models(self):
        table = self._default_table()
        result = effective_cascade(table, "high", excluded_providers={"groq"})
        for entry in result:
            provider, _ = parse_model(entry)
            assert provider != "groq"

    def test_preferred_provider_floats_to_front(self):
        table = self._default_table()
        result = effective_cascade(table, "high", preferred_providers=["gemini"])
        # First model should be from gemini
        first_provider, _ = parse_model(result[0])
        assert first_provider == "gemini"

    def test_disabled_model_not_in_result(self):
        first_entry = MODEL_TIERS["high"][0]
        table = build_effective_table(
            overrides={(first_entry, "high"): {"enabled": False}},
            customs=[],
        )
        result = effective_cascade(table, "high")
        assert first_entry not in result

    def test_unknown_effort_raises(self):
        table = self._default_table()
        with pytest.raises(ValueError):
            effective_cascade(table, "extreme")


# ---------------------------------------------------------------------------
# provider_catalog
# ---------------------------------------------------------------------------

class TestProviderCatalog:
    def test_returns_all_providers(self):
        catalog = provider_catalog()
        assert set(catalog.keys()) == set(PROVIDERS.keys())

    def test_each_entry_has_base_url(self):
        catalog = provider_catalog()
        for provider, meta in catalog.items():
            assert "base_url" in meta

    def test_override_changes_base_url(self):
        overrides = {"groq": {"base_url": "https://custom.groq.example.com"}}
        catalog = provider_catalog(overrides=overrides)
        assert catalog["groq"]["base_url"] == "https://custom.groq.example.com"

    def test_override_does_not_affect_other_providers(self):
        original_gemini_url = PROVIDERS["gemini"]["base_url"]
        overrides = {"groq": {"base_url": "https://custom.groq.example.com"}}
        catalog = provider_catalog(overrides=overrides)
        assert catalog["gemini"]["base_url"] == original_gemini_url

    def test_no_override_is_deep_copy(self):
        # Mutating the returned catalog should not change PROVIDERS
        catalog = provider_catalog()
        catalog["groq"]["base_url"] = "https://mutated.example.com"
        assert PROVIDERS["groq"]["base_url"] != "https://mutated.example.com"
