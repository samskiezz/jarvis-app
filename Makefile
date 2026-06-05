# Enterprise OS — root build orchestration (polyglot: JVM / Go / TS)
#
# Most targets are placeholders that ECHO the command they WOULD run in a full
# environment (the heavy toolchains and infra are Layer B). The exception is
# `contracts-validate`, which really validates every contract JSON/YAML file.

SHELL := /bin/bash
PYTHON ?= python3
GRADLE ?= ./gradlew
PNPM ?= pnpm

.DEFAULT_GOAL := help

.PHONY: help contracts-validate db-migrate build-jvm build-go build-ui up-dev test

help: ## List targets
	@echo "Enterprise OS targets:"
	@echo "  contracts-validate  Validate all contract JSON/YAML (runs for real)"
	@echo "  db-migrate          Apply database migrations (placeholder)"
	@echo "  build-jvm           Build JVM control-plane modules via Gradle (placeholder)"
	@echo "  build-go            Build Go fleet agents (placeholder)"
	@echo "  build-ui            Build TS mission apps via pnpm (placeholder)"
	@echo "  up-dev              Bring up the local dev stack (placeholder)"
	@echo "  test                Run the polyglot test suites (placeholder)"

contracts-validate: ## Parse & validate every contract JSON/YAML (real)
	@echo ">> Validating contracts under ./contracts ..."
	@$(PYTHON) - <<'PY'
	import json, sys, glob, os
	try:
	    import yaml
	except ImportError:
	    print("PyYAML not installed; install with: pip install pyyaml", file=sys.stderr)
	    sys.exit(2)

	root = "contracts"
	ok, bad = 0, 0
	patterns = ("**/*.json", "**/*.yaml", "**/*.yml")
	files = sorted({f for p in patterns for f in glob.glob(os.path.join(root, p), recursive=True)})
	if not files:
	    print(f"!! no contract files found under {root}/", file=sys.stderr)
	    sys.exit(1)
	for f in files:
	    try:
	        with open(f, "r", encoding="utf-8") as fh:
	            if f.endswith(".json"):
	                json.load(fh)
	            else:
	                yaml.safe_load(fh)
	        ok += 1
	        print(f"  ok    {f}")
	    except Exception as e:  # noqa: BLE001
	        bad += 1
	        print(f"  FAIL  {f}: {e}", file=sys.stderr)
	print(f">> contracts: {ok} valid, {bad} invalid")
	sys.exit(1 if bad else 0)
	PY

db-migrate: ## Apply database migrations (placeholder)
	@echo ">> WOULD RUN: psql \$$DATABASE_URL -f database/postgres migrations (Flyway/Liquibase)"
	@echo ">> WOULD APPLY: contracts/sql/0001_core_schema.sql and successors"
	@echo "   # Layer B: requires real infra (PostgreSQL)"

build-jvm: ## Build JVM control-plane modules (placeholder)
	@echo ">> WOULD RUN: $(GRADLE) build"
	@echo "   modules: kernel control-plane ontology-plane object-runtime \\"
	@echo "            security-plane action-plane workflow-plane aip-plane event-plane"

build-go: ## Build Go fleet agents (placeholder)
	@echo ">> WOULD RUN: (cd fleet-agents && go build ./...)"
	@echo "   # Layer B: Go edge daemons run on real nodes"

build-ui: ## Build TS mission apps (placeholder)
	@echo ">> WOULD RUN: $(PNPM) -r --filter './mission-apps/**' build"

up-dev: ## Bring up local dev stack (placeholder)
	@echo ">> WOULD RUN: docker compose -f docker-compose.control-plane.yml up -d"
	@echo ">> WOULD RUN: docker compose -f docker-compose.data-plane.yml up -d"
	@echo "   # Layer B services (spark/flink/k8s/vault) are not started by the sandbox"

test: ## Run polyglot test suites (placeholder)
	@echo ">> WOULD RUN: $(GRADLE) test           # JVM"
	@echo ">> WOULD RUN: (cd fleet-agents && go test ./...)  # Go"
	@echo ">> WOULD RUN: $(PNPM) -r test          # TS mission apps"
	@$(MAKE) --no-print-directory contracts-validate
