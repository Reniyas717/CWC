#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/cwc-pipeline-test.XXXXXX")
trap 'rm -rf -- "$TEST_ROOT"' EXIT

fail() {
  printf 'not ok - %s\n' "$1"
  exit 1
}

assert_contains() {
  local haystack=$1 needle=$2 message=$3
  [[ $haystack == *"$needle"* ]] || fail "$message (missing: $needle)"
}

mkdir -p "$TEST_ROOT/bin"
cat > "$TEST_ROOT/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
case "$1" in
  info) exit 0 ;;
  build) printf 'build output\n' ;;
  push) printf 'push output\n' ;;
  image) printf 'docker.io/example/app@sha256:testdigest\n' ;;
  *) exit 1 ;;
esac
DOCKER
chmod +x "$TEST_ROOT/bin/docker"
cat > "$TEST_ROOT/bin/git" <<'GIT'
#!/usr/bin/env bash
printf 'simulated clone failure\n' >&2
exit 1
GIT
chmod +x "$TEST_ROOT/bin/git"

output=$(PATH="$TEST_ROOT/bin:$PATH" "$SCRIPT_DIR/build-and-publish.sh" "https://github.com/example/app.git" "main" "example/app" 2>"$TEST_ROOT/log") && fail "clone failure should fail"
assert_contains "$output" '"status":"failure"' 'clone failure should be JSON failure'
assert_contains "$output" '"stage":"clone"' 'clone failure should identify clone stage'

output=$(PATH="$TEST_ROOT/bin:$PATH" "$SCRIPT_DIR/build-and-publish.sh" "http://github.com/example/app.git" "main" "example/app" 2>"$TEST_ROOT/log") && fail "HTTP URL should fail"
assert_contains "$output" '"stage":"validation"' 'HTTP URL should identify validation stage'

printf 'ok - CLI validates public HTTPS URLs and reports structured failures\n'
