// Root build for the Enterprise OS JVM control plane (Kotlin DSL).
//
// Conventions only — no application code lives at the root. Each included module in
// settings.gradle.kts is a Spring Boot bounded context. The plugins block is left
// commented so this file parses without requiring the Spring/Gradle plugins to be
// resolved in a lightweight sandbox; uncomment when building against real infra.
//
// Layer B: requires real infra (JDK 21, Spring Boot, PostgreSQL, Kafka) to build.

// plugins {
//     java
//     id("org.springframework.boot") version "3.3.2" apply false
//     id("io.spring.dependency-management") version "1.1.6" apply false
// }

group = "com.enterprise.os"
version = "0.1.0-SNAPSHOT"

allprojects {
    group = rootProject.group
    version = rootProject.version

    repositories {
        mavenCentral()
    }
}

// Conventions applied to every JVM plane module.
subprojects {
    apply(plugin = "java")
    // apply(plugin = "org.springframework.boot")
    // apply(plugin = "io.spring.dependency-management")

    extensions.configure<JavaPluginExtension> {
        toolchain {
            languageVersion.set(JavaLanguageVersion.of(21))
        }
    }

    dependencies {
        // Spring Boot BOM + starters added per-module once plugins are enabled.
        // "implementation"(platform("org.springframework.boot:spring-boot-dependencies:3.3.2"))
        // "implementation"("org.springframework.boot:spring-boot-starter-web")
        // "testImplementation"("org.springframework.boot:spring-boot-starter-test")
    }

    tasks.withType<Test>().configureEach {
        useJUnitPlatform()
    }
}
