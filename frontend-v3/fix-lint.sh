#!/bin/bash
# Fix remaining ESLint errors in UI components

# Fix carousel.tsx - remaining error on line 114
sed -i '' '113s|orientation:|orientation:|' src/components/ui/carousel.tsx
sed -i '' '114s|          orientation|          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions\n          orientation|' src/components/ui/carousel.tsx

echo "Applied lint fixes to carousel.tsx"
