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

contracts-validate: ## Parse & validate every contract (real — runs the harness)
	@echo ">> Validating contract layer via test-harness/contract_validate.py ..."
	@$(PYTHON) test-harness/contract_validate.py

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

up: ## Boot the whole platform (Llama+backend+data+frontend)
	@bash boot.sh
