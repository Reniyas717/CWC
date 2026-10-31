# Git-to-image pipeline

`build-and-publish.sh` builds a public Git branch into a Linux Docker image and publishes it to Docker Hub for compatible workers to pull.

## Prerequisites

- Ubuntu running directly or through WSL 2.
- `git`, Docker CLI, and a working Docker daemon. If the daemon is stopped, the script attempts `sudo systemctl start docker` and then `sudo service docker start`.
- A public HTTPS Git repository containing a Dockerfile.
- A public Docker Hub repository and permission to push to it.
- An existing Docker Hub login, for example `docker login`; credentials are never passed to the script.

The script builds for the local Docker daemon's default Linux architecture. Workers pulling the image need a compatible architecture. Docker startup may prompt for sudo credentials.

## Usage

```bash
bash deploy/build-and-publish.sh \
  https://github.com/example/project.git \
  main \
  dockerhub-owner/project
```

The required arguments are the public HTTPS Git URL, branch name, and Docker Hub repository in `owner/name` form. The branch is fetched at its current tip; commit SHA input is not supported.

For a monorepo, pass an optional repository-relative build context and Dockerfile path:

```bash
bash deploy/build-and-publish.sh \
  https://github.com/example/project.git \
  main \
  dockerhub-owner/project \
  apps/web \
  apps/web/Dockerfile
```

The defaults are `.` and `Dockerfile`. Both paths must exist inside the checkout after symbolic links are resolved. The pipeline rejects absolute paths and escapes outside the checkout.

## Output contract

Progress from Git, Docker, and the pipeline streams to stderr. The final line on stdout is one JSON object, so callers can save or parse it independently from the build log.

Success includes the resolved commit SHA and the commit-tagged image reference:

```json
{"status":"success","stage":"complete","commit_sha":"<full-sha>","image":"dockerhub-owner/project:<full-sha>","digest":"sha256:<digest>"}
```

The digest is included when Docker reports one. The SHA tag identifies the source commit; the digest identifies the particular image content published for that tag. Rebuilding the same commit may replace the tag.

Failures exit nonzero and include `status`, `stage`, and `error`; the commit SHA and image reference are included when they were determined before the failure. Stages include validation, prerequisites, Docker startup/readiness, clone, checkout, build, push, and interrupted. A failed Docker Hub push is a failed pipeline even when the local build succeeded.

The caller owns persistent log storage and may impose a timeout externally, for example:

```bash
timeout 20m bash deploy/build-and-publish.sh \
  https://github.com/example/project.git main dockerhub-owner/project
```

The temporary checkout is removed after success or failure. Normal SIGINT and SIGTERM attempt to stop the active child command and clean up before returning an interrupted result. Forced termination or machine shutdown may leave temporary files.

## Current integration boundary

This is a standalone build-and-publish CLI for the deployment pipeline. It is verified at its command-line seam and does not yet integrate with the control plane or worker task poller. A future worker integration can invoke the same contract or reproduce its lifecycle, then pull the public Docker Hub image by its SHA tag or digest.

Run the controlled checks with:

```bash
bash deploy/test-build-and-publish.sh
```

Those checks exercise validation, path handling, Docker startup/readiness, digest reporting, interruption cleanup, and structured results. A real build and cross-machine pull additionally require Docker Desktop WSL integration, Docker Hub credentials, and a compatible second worker.
