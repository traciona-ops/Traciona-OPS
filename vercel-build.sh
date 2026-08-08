#!/bin/bash
set -e

echo "=== Traciona: Running migrations ==="
npm run migrate:up

echo "=== Traciona: Building Next.js ==="
npm run build
