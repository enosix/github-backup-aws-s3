import { Octokit } from "@octokit/rest";
import { mkdtemp, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import {exec} from "node:child_process";
const execAsync = promisify(exec);

export class Organization {
    constructor(token) {
        // check for required options
        if (!token) {
            throw new Error("Missing required option: token");
        }

        this.octokit = new Octokit({
            auth: token
        });
        this.token = token;
    }

    async createBundle(repo){
        const uri = new URL(repo);

        // make a temp directory
        let tempDir = await mkdtemp(join(tmpdir(), 'github-backup-'));

        console.log("  Cloning  repo...")
        try {
            await execAsync(`git clone --mirror https://${this.token}@${uri.hostname}${uri.pathname} .`, {cwd: tempDir});
        } catch (e) {
            console.error(e.stderr);
            await rm(tempDir, {recursive: true});
            return null;
        }

        console.log("  Creating bundle...")
        try{
            await execAsync(`git bundle create ${tempDir}.bundle --all`, {cwd: tempDir});
        } catch (e) {
            console.error(e.stderr);
            await rm(tempDir, {recursive: true});
            return null;
        }

        try {
            await rm(tempDir, {recursive: true});
            let bundleStream = createReadStream(`${tempDir}.bundle`, {emitClose: true});

            bundleStream.on('close', async () => {
                console.log("  Cleaning up...");
                await rm(`${tempDir}.bundle`);
            });

            return bundleStream;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    async * getRepositories(org) {
        for await (const response of this.octokit.paginate.iterator(
            this.octokit.repos.listForOrg, {
            type: "all",
            org: org,
            per_page: 50,
            sort: "pushed"
        })) {
            // Return if the repo was updated after the lastUpdated date
            for (const repo of response.data) {
                if (!repo.size) {
                    continue;
                }
                const updatedAt = new Date(repo.pushed_at)

                const branch = await this.octokit.rest.repos.getBranch({
                    owner: org,
                    repo: repo.name,
                    branch: repo.default_branch
                });
                yield {
                    name: repo.name,
                    url: repo.clone_url,
                    updatedAt: updatedAt,
                    id: repo.id,
                    tags: repo.topics.join(", "),
                    description: repo.description,
                    defaultBranch: repo.default_branch,
                    headCommit: branch.data.commit.sha
                }
            }
        }
    }
}