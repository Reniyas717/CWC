import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { createLogger } from '../logger.js';

const execFileAsync = promisify(execFile);
const logger = createLogger('GitRunner');

export interface GitCloneOptions {
  deploymentId: string;
  repositoryUrl: string;
  branch?: string;
  commitHash?: string;
}

export interface GitCloneResult {
  workingDir: string;
  commitSha: string;
}

export class GitRunner {
  private baseBuildsDir: string;

  constructor() {
    this.baseBuildsDir = path.join(os.tmpdir(), 'cwc-builds');
  }

  /**
   * Validates that the repository URL is a valid public HTTPS Git URL.
   */
  public validateRepositoryUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return false;
      }
      // Prohibit embedded credentials in the URL
      if (parsed.username || parsed.password) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validates a Git branch or tag name to prevent flag injection or path traversal.
   */
  public validateRefName(ref: string): boolean {
    if (!ref || ref.startsWith('-') || ref.includes('..') || ref.includes('//')) {
      return false;
    }
    return /^[a-zA-Z0-9_./-]+$/.test(ref);
  }

  /**
   * Validates a Git commit SHA (7 to 64 hexadecimal characters).
   */
  public validateCommitHash(sha: string): boolean {
    return /^[a-fA-F0-9]{7,64}$/.test(sha);
  }

  /**
   * Validates a deployment ID for safe filesystem path construction.
   */
  public validateDeploymentId(id: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(id);
  }

  /**
   * Clones a public repository into an isolated temporary workspace directory.
   */
  public async cloneRepository(options: GitCloneOptions): Promise<GitCloneResult> {
    const { deploymentId, repositoryUrl, branch = 'main', commitHash } = options;

    if (!this.validateDeploymentId(deploymentId)) {
      throw new Error(`Invalid deployment ID: "${deploymentId}". Must be alphanumeric with dashes/underscores.`);
    }

    if (!this.validateRepositoryUrl(repositoryUrl)) {
      throw new Error(
        `Invalid or insecure repository URL: ${repositoryUrl}. Only public https:// URLs without credentials are permitted.`
      );
    }

    if (!this.validateRefName(branch)) {
      throw new Error(`Invalid Git branch name: "${branch}".`);
    }

    if (commitHash && !this.validateCommitHash(commitHash)) {
      throw new Error(`Invalid Git commit hash: "${commitHash}". Must be a 7-64 char hex string.`);
    }

    const workingDir = path.join(this.baseBuildsDir, deploymentId);

    // Clean up any existing directory from a previous attempt
    await this.cleanup(workingDir);
    await fs.mkdir(workingDir, { recursive: true });

    logger.info(`Cloning repository for deployment ${deploymentId}...`, {
      repositoryUrl,
      branch,
      commitHash,
      targetDir: workingDir,
    });

    try {
      if (commitHash) {
        // Clone repository and checkout specific commit
        await execFileAsync('git', ['clone', '--no-checkout', repositoryUrl, workingDir]);
        await execFileAsync('git', ['checkout', commitHash], { cwd: workingDir });
      } else {
        // Shallow clone target branch
        await execFileAsync('git', [
          'clone',
          '--depth',
          '1',
          '-b',
          branch,
          repositoryUrl,
          workingDir,
        ]);
      }

      // Resolve HEAD commit SHA
      const { stdout: commitShaRaw } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: workingDir,
      });
      const commitSha = commitShaRaw.trim();

      logger.info(`Repository cloned successfully at commit ${commitSha}`, {
        deploymentId,
        commitSha,
      });

      return {
        workingDir,
        commitSha,
      };
    } catch (err) {
      await this.cleanup(workingDir);
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to clone repository for deployment ${deploymentId}`, err);
      throw new Error(`Git clone failed: ${message}`, { cause: err });
    }
  }

  /**
   * Safely cleans up the temporary repository directory.
   */
  public async cleanup(workingDir: string): Promise<void> {
    try {
      await fs.rm(workingDir, { recursive: true, force: true });
    } catch (err) {
      logger.warn(`Failed to clean up temporary directory ${workingDir}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
