#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: build-and-publish.sh <public-https-git-url> <branch> <dockerhub-repository>

Builds the branch tip using ./Dockerfile at the repository root and pushes
<dockerhub-repository>:<commit-sha>. Authenticate with `docker login` first.
USAGE
}

json_escape() {
  local value=${1-}
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '%s' "$value"
}

emit_result() {
  local status=$1 stage=$2 message=${3-}
  local result="{\"status\":\"$(json_escape "$status")\",\"stage\":\"$(json_escape "$stage")\""
  if [[ -n ${COMMIT_SHA:-} ]]; then
    result+=",\"commit_sha\":\"$(json_escape "$COMMIT_SHA")\""
  fi
  if [[ -n ${IMAGE_REF:-} ]]; then
    result+=",\"image\":\"$(json_escape "$IMAGE_REF")\""
  fi
  if [[ -n ${DIGEST:-} ]]; then
    result+=",\"digest\":\"$(json_escape "$DIGEST")\""
  fi
  if [[ -n $message ]]; then
    result+=",\"error\":\"$(json_escape "$message")\""
  fi
  printf '%s}\n' "$result"
}

log() {
  printf '[git-to-image] %s\n' "$*" >&2
}

fail() {
  local stage=$1 message=$2
  log "failed during ${stage}: ${message}"
  emit_result failure "$stage" "$message"
  exit 1
}

cleanup() {
  if [[ -n ${WORK_DIR:-} && -d ${WORK_DIR:-} ]]; then
    rm -rf -- "$WORK_DIR"
  fi
}

if [[ ${1:-} == "--help" || ${1:-} == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 3 ]]; then
  usage
  emit_result failure arguments "expected a Git URL, branch, and Docker Hub repository"
  exit 2
fi

REPOSITORY_URL=$1
BRANCH=$2
DOCKERHUB_REPOSITORY=$3

if [[ ! $REPOSITORY_URL =~ ^https://[^/]+/.+ ]]; then
  emit_result failure validation "repository URL must be a public HTTPS Git URL"
  exit 2
fi
if [[ -z $BRANCH || $BRANCH == -* ]]; then
  emit_result failure validation "branch must be a non-empty name"
  exit 2
fi
if [[ ! $DOCKERHUB_REPOSITORY =~ ^[a-z0-9]+([._-][a-z0-9]+)*/[a-z0-9]+([._-][a-z0-9]+)*$ ]]; then
  emit_result failure validation "Docker Hub repository must have the form owner/name"
  exit 2
fi

if ! command -v git >/dev/null 2>&1; then
  emit_result failure prerequisites "git is not installed"
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  emit_result failure prerequisites "docker is not installed"
  exit 1
fi

ensure_docker_daemon() {
  if docker info >/dev/null 2> >(sed 's/^/[docker] /' >&2); then
    log "Docker daemon is ready"
    return 0
  fi

  log "Docker daemon is unavailable; attempting to start it"
  local started=1
  if command -v systemctl >/dev/null 2>&1; then
    if sudo systemctl start docker >&2; then
      started=0
    fi
  fi
  if (( started != 0 )) && command -v service >/dev/null 2>&1; then
    if sudo service docker start >&2; then
      started=0
    fi
  fi
  if (( started != 0 )); then
    return 1
  fi

  log "waiting for Docker daemon readiness"
  if docker info >/dev/null 2> >(sed 's/^/[docker] /' >&2); then
    return 0
  fi
  return 2
}

if ensure_docker_daemon; then
  :
else
  startup_status=$?
  if (( startup_status == 2 )); then
    fail docker-readiness "Docker daemon did not become ready"
  fi
  fail docker-start "unable to start the Docker daemon"
fi

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/cwc-build.XXXXXX")
trap cleanup EXIT

log "cloning ${REPOSITORY_URL} (branch ${BRANCH})"
if ! git clone --depth 1 --single-branch --branch "$BRANCH" "$REPOSITORY_URL" "$WORK_DIR" >&2; then
  fail clone "unable to clone the requested branch"
fi

if ! COMMIT_SHA=$(git -C "$WORK_DIR" rev-parse HEAD 2> >(sed 's/^/[git] /' >&2)); then
  fail checkout "unable to resolve the checked-out commit"
fi
if [[ ! $COMMIT_SHA =~ ^[0-9a-f]{40}$ ]]; then
  fail checkout "git returned an invalid commit SHA"
fi

IMAGE_REF="${DOCKERHUB_REPOSITORY}:${COMMIT_SHA}"
log "building ${IMAGE_REF}"
if ! docker build --tag "$IMAGE_REF" "$WORK_DIR" >&2; then
  fail build "Docker image build failed"
fi

log "pushing ${IMAGE_REF}"
if ! docker push "$IMAGE_REF" >&2; then
  fail push "Docker Hub push failed"
fi

if DIGEST=$(docker image inspect --format '{{index .RepoDigests 0}}' "$IMAGE_REF" 2> >(sed 's/^/[docker] /' >&2)); then
  [[ $DIGEST == "<no value>" ]] && DIGEST=
else
  DIGEST=
fi

log "published ${IMAGE_REF}"
emit_result success complete
