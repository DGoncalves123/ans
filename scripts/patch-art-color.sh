#!/bin/bash
# Patch ART color module for strict-mode bundles (avoids undefined.hex access)

set -e

ART_COLOR_FILE="node_modules/art/core/color.js"

if [ ! -f "$ART_COLOR_FILE" ]; then
  echo "ART color module not found at $ART_COLOR_FILE; skipping patch."
  exit 0
fi

perl -0777 -i -pe 's/if \(this\.hex == null\) this\.hex = Color\.hex;/var root = typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : {}));\nif \(root\.hex == null\) root\.hex = Color\.hex;/g' "$ART_COLOR_FILE"
perl -0777 -i -pe 's/if \(this\.hsb == null\) this\.hsb = Color\.hsb;/if \(root\.hsb == null\) root\.hsb = Color\.hsb;/g' "$ART_COLOR_FILE"
perl -0777 -i -pe 's/if \(this\.hsl == null\) this\.hsl = Color\.hsl;/if \(root\.hsl == null\) root\.hsl = Color\.hsl;/g' "$ART_COLOR_FILE"
perl -0777 -i -pe 's/if \(this\.rgb == null\) this\.rgb = Color\.rgb;/if \(root\.rgb == null\) root\.rgb = Color\.rgb;/g' "$ART_COLOR_FILE"

echo "Patched $ART_COLOR_FILE"
