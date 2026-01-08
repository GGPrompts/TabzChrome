---
description: "Run tests if available. Standalone command for test verification."
---

# Run Tests

Run project tests if a test script exists. This is a standalone atomic command.

## Usage

```
/conductor:run-tests
```

## Execute

```bash
echo "=== Test Verification ==="

# Detect test command
if [ -f "package.json" ]; then
  if grep -q '"test"' package.json 2>/dev/null; then
    # Check if it's a real test script (not "test": "echo \"Error: no test specified\"")
    TEST_SCRIPT=$(grep '"test"' package.json | head -1)
    if echo "$TEST_SCRIPT" | grep -q "no test specified"; then
      echo "No test script configured"
      echo '{"passed": true, "skipped": true, "reason": "no test script"}'
      exit 0
    fi
    TEST_CMD="npm test"
  else
    echo "No test script in package.json"
    echo '{"passed": true, "skipped": true, "reason": "no test script"}'
    exit 0
  fi
elif [ -f "Cargo.toml" ]; then
  TEST_CMD="cargo test"
elif [ -f "go.mod" ]; then
  TEST_CMD="go test ./..."
elif [ -f "pytest.ini" ] || [ -f "setup.py" ]; then
  TEST_CMD="pytest"
elif [ -f "Makefile" ] && grep -q "^test:" Makefile; then
  TEST_CMD="make test"
else
  echo "No recognized test system"
  echo '{"passed": true, "skipped": true, "reason": "no test system"}'
  exit 0
fi

echo "Running: $TEST_CMD"
$TEST_CMD 2>&1 | tee /tmp/test-output.txt
TEST_EXIT=${PIPESTATUS[0]}

if [ $TEST_EXIT -ne 0 ]; then
  echo ""
  echo "TESTS FAILED"
  echo ""
  echo "=== Failure Output ==="
  tail -100 /tmp/test-output.txt
  echo ""
  echo '{"passed": false, "errors": "see output above"}'
  exit 1
fi

echo ""
echo "Tests passed"
echo '{"passed": true}'
```

## Output Format

Returns JSON on last line:

```json
{"passed": true}
{"passed": false, "errors": "..."}
{"passed": true, "skipped": true, "reason": "no test script"}
```

## Error Handling

If tests fail:
1. Fix the failing tests
2. Re-run `/conductor:run-tests`

## Composable With

- `/conductor:verify-build` - Run build before tests
- `/conductor:commit-changes` - Run after tests pass
- `/conductor:worker-done` - Full pipeline that includes this
