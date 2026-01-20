---
name: running-tests
description: "Test runner checkpoint for conductor gates. Detects test framework (jest, pytest, cargo test, go test, etc.), runs tests, and captures output. Returns structured result with pass/fail status and failed test details. Use when: 'run tests', 'test runner', 'check tests pass'."
user-invocable: true
---

# Test Runner Checkpoint

Auto-detects test framework and runs tests, writing results to `.checkpoints/running-tests.json`.

## Workflow

```
Progress:
- [ ] Step 1: Detect test framework
- [ ] Step 2: Run tests with timeout
- [ ] Step 3: Write checkpoint result
```

### Step 1: Detect Test Framework

| Indicator | Command |
|-----------|---------|
| `package.json` with test script | `npm test` |
| `pytest.ini` or `conftest.py` | `pytest --tb=short` |
| `Cargo.toml` | `cargo test` |
| `go.mod` | `go test ./...` |
| `Makefile` with test target | `make test` |

### Step 2: Run Tests

```bash
timeout 300 <test-command> 2>&1 | tee /tmp/test-output.txt
TEST_EXIT_CODE=${PIPESTATUS[0]}
```

### Step 3: Write Checkpoint Result

```bash
mkdir -p .checkpoints
cat > .checkpoints/running-tests.json << 'EOF'
{
  "checkpoint": "running-tests",
  "timestamp": "...",
  "passed": true,
  "framework": "jest",
  "command": "npm test",
  "exit_code": 0,
  "stats": {"total": 17, "passed": 17, "failed": 0},
  "failed_tests": [],
  "summary": "All 17 tests passed"
}
EOF
```

## Decision Criteria

**Pass:** Exit code 0, no test failures

**Fail:** Any test fails, tests error out, or timeout (300s default)

**No tests found:** Pass with `"framework": "none"`

## JSON Output Flags (optional)

For complex parsing, use framework JSON output:
- Jest: `npx jest --json --outputFile=/tmp/results.json`
- Pytest: `pytest --json-report` (requires plugin)
- Go: `go test -json ./...`
