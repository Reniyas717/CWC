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
  build)
    if [[ ${DOCKER_MODE:-success} == interrupt ]]; then
      sleep 30
    fi
    printf 'build output\n'
    ;;
  push) printf 'push output\n' ;;
  image) printf 'docker.io/example/app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n' ;;
  *) exit 1 ;;
esac
DOCKER
chmod +x "$TEST_ROOT/bin/docker"
cat > "$TEST_ROOT/bin/git" <<'GIT'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ ${GIT_MODE:-failure} == success ]]; then
  if [[ $1 == clone ]]; then
    target=${@: -1}
    mkdir -p "$target"
    printf 'FROM scratch\n' > "$target/Dockerfile"
    exit 0
  fi
  if [[ $1 == -C && $3 == rev-parse && $4 == HEAD ]]; then
    printf '0123456789012345678901234567890123456789\n'
    exit 0
  fi
fi
printf 'simulated clone failure\n' >&2
exit 1
GIT
chmod +x "$TEST_ROOT/bin/git"

output=$(PATH="$TEST_ROOT/bin:$PATH" "$SCRIPT_DIR/build-and-publish.sh" "https://github.com/example/app.git" "main" "example/app" 2>"$TEST_ROOT/log") && fail "clone failure should fail"
assert_contains "$output" '"status":"failure"' 'clone failure should be JSON failure'
assert_contains "$output" '"stage":"clone"' 'clone failure should identify clone stage'

output=$(PATH="$TEST_ROOT/bin:$PATH" "$SCRIPT_DIR/build-and-publish.sh" "http://github.com/example/app.git" "main" "example/app" 2>"$TEST_ROOT/log") && fail "HTTP URL should fail"
assert_contains "$output" '"stage":"validation"' 'HTTP URL should identify validation stage'

output=$(GIT_MODE=success PATH="$TEST_ROOT/bin:$PATH" "$SCRIPT_DIR/build-and-publish.sh" "https://github.com/example/app.git" "main" "example/app" 2>"$TEST_ROOT/log") || fail "successful build should succeed"
assert_contains "$output" '"status":"success"' 'successful build should return JSON success'
assert_contains "$output" '"digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' 'successful build should return the image digest'

mkdir -p "$TEST_ROOT/temp"
set +e
DOCKER_MODE=interrupt GIT_MODE=success PATH="$TEST_ROOT/bin:$PATH" TMPDIR="$TEST_ROOT/temp" "$SCRIPT_DIR/build-and-publish.sh" "https://github.com/example/app.git" "main" "example/app" >"$TEST_ROOT/interrupted-result" 2>"$TEST_ROOT/interrupted-log" &
pipeline_pid=$!
sleep 1
kill -TERM "$pipeline_pid"
wait "$pipeline_pid"
pipeline_status=$?
set -e
[[ $pipeline_status -eq 143 ]] || fail "SIGTERM should return status 143 (got $pipeline_status)"
output=$(<"$TEST_ROOT/interrupted-result")
assert_contains "$output" '"stage":"interrupted"' 'interrupted build should identify interruption stage'
assert_contains "$(<"$TEST_ROOT/interrupted-log")" 'cleaning up' 'interrupted build should log cleanup'
[[ -z "$(find "$TEST_ROOT/temp" -mindepth 1 -maxdepth 1 -print -quit)" ]] || fail "interrupted build should remove its temporary checkout"

printf 'ok - CLI validates failures, reports digest, and cleans up on interruption\n'
