---
description: "Run build and report errors. Standalone command for build verification."
---

# Verify Build

Run the project build and report any errors. This is a standalone atomic command.

## Usage

```
/conductor:verify-build
```

## Execute

```bash
echo "=== Build Verification ==="

# Detect build command
if [ -f "package.json" ]; then
  if grep -q '"build"' package.json 2>/dev/null; then
    BUILD_CMD="npm run build"
  else
    echo "No build script in package.json"
    echo '{"passed": true, "skipped": true, "reason": "no build script"}'
    exit 0
  fi
elif [ -f "Cargo.toml" ]; then
  BUILD_CMD="cargo build"
elif [ -f "go.mod" ]; then
  BUILD_CMD="go build ./..."
elif [ -f "Makefile" ]; then
  BUILD_CMD="make"
else
  echo "No recognized build system"
  echo '{"passed": true, "skipped": true, "reason": "no build system"}'
  exit 0
fi

echo "Running: $BUILD_CMD"
$BUILD_CMD 2>&1 | tee /tmp/build-output.txt
BUILD_EXIT=${PIPESTATUS[0]}

if [ $BUILD_EXIT -ne 0 ]; then
  echo ""
  echo "BUILD FAILED"
  echo ""
  echo "=== Error Output ==="
  tail -50 /tmp/build-output.txt
  echo ""
  echo '{"passed": false, "errors": "see output above"}'
  exit 1
fi

echo ""
echo "Build passed"
echo '{"passed": true}'
```

## Output Format

Returns JSON on last line:

```json
{"passed": true}
{"passed": false, "errors": "..."}
{"passed": true, "skipped": true, "reason": "no build script"}
```

## Error Handling

If build fails:
1. Fix the errors shown
2. Re-run `/conductor:verify-build`

## Composable With

- `/conductor:run-tests` - Run after build passes
- `/conductor:commit-changes` - Run after build + tests pass
- `/conductor:worker-done` - Full pipeline that includes this
