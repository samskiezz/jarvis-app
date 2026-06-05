// Gradle settings for the JVM control-plane of the Enterprise OS monorepo.
//
// This declares the Java/Kotlin (Spring Boot) "Layer B" production modules that
// will own the sovereign control plane. The behavioural Layer A reference for each
// module currently lives as Python under server/ (see each plane's TARGET_RUNTIME.md
// and docs/SOVEREIGN_PLATFORM_BLUEPRINT.md). The modules below are the JVM targets.
//
// Go fleet agents (fleet-agents/) and the TypeScript mission apps (mission-apps/)
// are NOT JVM modules and are intentionally excluded from this Gradle build.

rootProject.name = "enterprise-os-control-plane"

// Centralised dependency-resolution / plugin repositories.
dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}

pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

// JVM plane modules (Layer B targets).
include(
    "kernel",          // Layer 6 substrate primitives shared across planes
    "control-plane",   // Layer 1  Apollo delivery fabric (JVM hub + Go agents)
    "ontology-plane",  // Layer 6  ontology kernel (object/link/action/function types)
    "object-runtime",  // Layer 7  object runtime (object store, neighbors, history)
    "security-plane",  // Layer 2  identity / policy (ABAC/PBAC) / classification
    "action-plane",    // Layer 10 kinetic action engine (governed verbs, approvals)
    "workflow-plane",  // Layer 11 workflow / rules / automation (Temporal-grade)
    "aip-plane",       // Layer 13 AIP / AI mesh governance gateway
    "event-plane"      // Layer 15 event backbone projections (Kafka contract)
)
