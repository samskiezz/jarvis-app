# Vendored from github.com/affaan-m/ECC

This directory is an upstream copy of "Everything Claude Code" (ECC) at the
state of `main` at the time of vendoring. MIT-licensed (c) 2026 Affaan Mustafa.
The `LICENSE` file in this dir is the original.

Why vendored: per owner directive to integrate everything from ECC into Jarvis
across the whole repo and CLI. Source-of-truth lives in the upstream repo;
this is a frozen snapshot for in-tree referenceability and offline use.

To sync: `rm -rf vendor/ecc && git clone --depth 1 https://github.com/affaan-m/ECC.git vendor/ecc-tmp && rsync -a --exclude='.git' vendor/ecc-tmp/ vendor/ecc/ && rm -rf vendor/ecc-tmp`
