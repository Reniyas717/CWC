#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: build-and-publish.sh <public-https-git-url> <branch> <dockerhub-repository> [build-context] [dockerfile]

Builds the branch tip and pushes <dockerhub-repository>:<commit-sha>.
Paths are relative to the repository root and default to . and Dockerfile.
Authenticate with `docker login` first.
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

if [[ $# -lt 3 || $# -gt 5 ]]; then
  usage
  emit_result failure arguments "expected a Git URL, branch, Docker Hub repository, and optional build paths"
  exit 2
fi

REPOSITORY_URL=$1
BRANCH=$2
DOCKERHUB_REPOSITORY=$3
BUILD_CONTEXT=${4:-.}
DOCKERFILE=${5:-Dockerfile}

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
if [[ $BUILD_CONTEXT == /* || $DOCKERFILE == /* ]]; then
  emit_result failure validation "build paths must be relative to the repository root"
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

if ! docker info >/dev/null 2> >(sed 's/^/[docker] /' >&2); then
  fail docker "Docker daemon is unavailable; start Docker and try again"
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

resolve_repo_path() {
  local relative_path=$1 resolved_path
  if ! resolved_path=$(realpath -e -- "$WORK_DIR/$relative_path" 2> >(sed 's/^/[path] /' >&2)); then
    fail validation "path does not exist: ${relative_path}"
  fi
  case "$resolved_path" in
    "$WORK_DIR"|"$WORK_DIR"/*) RESOLVED_REPO_PATH=$resolved_path ;;
    *) fail validation "path escapes the repository checkout: ${relative_path}" ;;
  esac
}

resolve_repo_path "$BUILD_CONTEXT"
BUILD_CONTEXT_PATH=$RESOLVED_REPO_PATH
resolve_repo_path "$DOCKERFILE"
DOCKERFILE_PATH=$RESOLVED_REPO_PATH
if [[ ! -d $BUILD_CONTEXT_PATH ]]; then
  fail validation "build context is not a directory: ${BUILD_CONTEXT}"
fi
if [[ ! -f $DOCKERFILE_PATH ]]; then
  fail validation "Dockerfile is not a regular file: ${DOCKERFILE}"
fi

IMAGE_REF="${DOCKERHUB_REPOSITORY}:${COMMIT_SHA}"
log "building ${IMAGE_REF}"
if ! docker build --tag "$IMAGE_REF" --file "$DOCKERFILE_PATH" "$BUILD_CONTEXT_PATH" >&2; then
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
