#!/bin/bash
# Update MZ2SYNTH Fortran repository

set -e

REPO_URL="https://github.com/frankenbeans/MZ2SYNTH.git"
FORTRAN_DIR="fortran-source"

echo "📦 Updating MZ2SYNTH Fortran repository..."

if [ -d "$FORTRAN_DIR" ]; then
  echo "Repository exists, pulling latest changes..."
  cd "$FORTRAN_DIR"
  git fetch origin
  git pull origin main
  cd ..
else
  echo "Cloning repository for the first time..."
  git clone "$REPO_URL" "$FORTRAN_DIR"
fi

echo "✅ Fortran repository updated successfully!"
