#!/bin/bash
set -e

# Migrations disabled during build (run manually after deploy)
# echo "=== Traciona: Running migrations ==="
# npm run migrate:up

echo "=== Traciona: Building Next.js ==="
npm run build
