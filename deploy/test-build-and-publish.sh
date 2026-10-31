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

cat > "$TEST_ROOT/bin/docker" <<'DOCKER_STARTUP'
#!/usr/bin/env bash
set -Eeuo pipefail
case "$1" in
  info)
    if [[ ${DOCKER_TEST_FAIL_READINESS:-0} == 1 ]]; then
      printf 'daemon unavailable\n' >&2
      exit 1
    fi
    if [[ ! -f ${DOCKER_TEST_STATE:?} ]]; then
      : > "$DOCKER_TEST_STATE"
      printf 'daemon unavailable\n' >&2
      exit 1
    fi
    exit 0
    ;;
  *) exit 1 ;;
esac
DOCKER_STARTUP
chmod +x "$TEST_ROOT/bin/docker"
cat > "$TEST_ROOT/bin/systemctl" <<'SYSTEMCTL'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'systemctl %s\n' "$*" >> "${DOCKER_TEST_COMMANDS:?}"
exit 0
SYSTEMCTL
chmod +x "$TEST_ROOT/bin/systemctl"
cat > "$TEST_ROOT/bin/sudo" <<'SUDO'
#!/usr/bin/env bash
set -Eeuo pipefail
"$@"
SUDO
chmod +x "$TEST_ROOT/bin/sudo"
cat > "$TEST_ROOT/bin/git" <<'GIT_STARTUP'
#!/usr/bin/env bash
printf 'simulated clone failure\n' >&2
exit 1
GIT_STARTUP
chmod +x "$TEST_ROOT/bin/git"

DOCKER_TEST_STATE="$TEST_ROOT/docker-state"
DOCKER_TEST_COMMANDS="$TEST_ROOT/docker-commands"
export DOCKER_TEST_STATE DOCKER_TEST_COMMANDS
output=$(PATH="$TEST_ROOT/bin:$PATH" "$SCRIPT_DIR/build-and-publish.sh" "https://github.com/example/app.git" "main" "example/app" 2>"$TEST_ROOT/start-log") && fail "daemon startup clone failure should fail"
commands=$(<"$TEST_ROOT/docker-commands")
start_log=$(<"$TEST_ROOT/start-log")
assert_contains "$commands" 'systemctl start docker' 'daemon startup should invoke systemctl'
assert_contains "$start_log" 'attempting to start it' 'daemon startup should be logged'
assert_contains "$output" '"stage":"clone"' 'daemon startup should complete before clone'

printf 'ok - CLI starts an unavailable daemon and verifies readiness\n'

output=$(DOCKER_TEST_FAIL_READINESS=1 PATH="$TEST_ROOT/bin:$PATH" "$SCRIPT_DIR/build-and-publish.sh" "https://github.com/example/app.git" "main" "example/app" 2>"$TEST_ROOT/readiness-log") && fail "readiness failure should fail"
assert_contains "$output" '"stage":"docker-readiness"' 'readiness failure should identify readiness stage'

printf 'ok - CLI reports a daemon readiness failure\n'
