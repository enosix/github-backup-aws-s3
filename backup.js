const GitHubApi = require("@octokit/rest")
const aws = require("@aws-sdk/client-s3")
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const requiredOptions = [
    "githubAccessToken",
    "s3BucketName",
    "s3AccessKeyId",
    "s3AccessSecretKey"
]

module.exports = function (options, context) {
    requiredOptions.forEach(key => {
        if (!options[key]) {
            console.error("missing option `" + key + "`")
            process.exit(1)
        }
    })

    const octokit = new GitHubApi.Octokit({
        auth: options.githubAccessToken
    });

    octokit.users.getAuthenticated().then(({ data }) => {
        console.log(`Running as user ${data.login}`);
    });

    const s3 = new aws.S3({
        accessKeyId: options.s3AccessKeyId,
        secretAccessKey: options.s3AccessSecretKey
    })

    async function getAllRepos() {
        let repos = []

        if (options.mode === "organisation") {
            console.log("Running in Organisation mode")
            // noinspection JSCheckFunctionSignatures
            for await (const response of octokit.paginate.iterator(octokit.repos.listForOrg, {
                type: "all",
                org: options.organisation,
                per_page: 50,
                sort: "pushed"
            })) {
                repos = repos.concat(response.data)
            }
        } else {
            // Assume get all repos current user has access to
            console.log("Running in User mode")
            // noinspection JSCheckFunctionSignatures
            for await (const response of octokit.paginate.iterator(octokit.repos.listForAuthenticatedUser, {
                per_page: 100
            })) {
                repos = repos.concat(response.data)
            }
        }

        return repos
    }

    async function s3ExistsAndIsNotExpired(name) {
        const s3Params = new aws.HeadObjectCommand({
            Bucket: options.s3BucketName,
            Key: name
        });

        try {
            let response = await s3.send(s3Params);

            if (options.expireThreshold && response.Expiration){
                // string format:
                // expiry-date="Tue, 22 Aug 2023 00:00:00 GMT", rule-id="Expire old objects"
                const match = response.Expiration.match(/expiry-date="([^"]+)"/)
                if (match) {
                    const expiry = new Date(match[1])
                    // If the expiration date is within x days of the threshold, return false
                    const threshold = new Date(Date.now() + options.expireThreshold * 24 * 60 * 60 * 1000)
                    return expiry >= threshold;
                }
            }
            return true
        } catch (e) {
            if (e.name === "NotFound") {
                return false
            }

            console.log("Error checking if " + name + " exists in S3: " + e.message);
            return false
        }
    }

    async function getS3Item(name){
        const s3Params = new aws.GetObjectCommand({
            Bucket: options.s3BucketName,
            Key: name
        });

        try {
            let response = await s3.send(s3Params);
            return response.Body.transformToString();
        } catch (e) {
            return null
        }
    }

    async function gitRepoToTarball(name) {
        let refs = [];
        let failures = [];

        // noinspection JSCheckFunctionSignatures
        for await (const response of octokit.paginate.iterator(octokit.repos.listBranches, {
            owner: options.organisation,
            repo: name
        })) {
            let data = response.data.map(b => ({
                name: b.name,
                sha: b.commit.sha,
                type: "heads",
                tarball_url: "https://github.com/" + options.organisation + "/" + encodeURIComponent(name) + "/tarball/" + encodeURIComponent(b.name)
            }));
            refs = refs.concat(data)
        }

        // noinspection JSCheckFunctionSignatures
        for await (const response of octokit.paginate.iterator(octokit.repos.listTags, {
            owner: options.organisation,
            repo: name
        })) {
            let data = response.data.map(b => ({
                name: b.name,
                sha: b.commit.sha,
                type: "tags",
                tarball_url: b.tarball_url
            }))
            refs = refs.concat(data)
        }

        for (const ref of refs) {
            if (context && context.getRemainingTimeInMillis() < 10*1000) {
                break;
            }

            try {
                let filename = name + "/objects/" + ref.sha + ".tar.gz"

                if (!await s3ExistsAndIsNotExpired(filename)) {
                    const tarballUrl = ref.tarball_url
                    const tarballStream = await fetch(tarballUrl, {
                        headers: {
                            "User-Agent": "github-backup-script",
                            "Authorization": "token " + options.githubAccessToken
                        }
                    });

                    if (tarballStream.status !== 200) {
                        throw new Error(`Failed to download ${tarballUrl} - ${tarballStream.status}`)
                    }

                    const command = new aws.PutObjectCommand({
                        Bucket: options.s3BucketName,
                        Key: filename,
                        Body: await tarballStream.arrayBuffer()
                    })
                    let result = await s3.send(command);
                    console.log(`Uploaded ${ref.sha} to S3`)
                }

                if (await getS3Item(name + "/" + ref.type + "/" + ref.name) !== ref.sha) {
                    // upload a git ref text file to s3 that contains the sha
                    const command = new aws.PutObjectCommand({
                        Bucket: options.s3BucketName,
                        Key: name + "/" + ref.type + "/" + ref.name,
                        Body: ref.sha
                    })
                    let result = await s3.send(command);
                    console.log(`Added ref ${ref.name} to S3`)
                }


            } catch (e) {
                console.error(`Failed to upload ${ref.name} for ${name} to S3`)
                console.error(e)
                failures.push(ref)
            }
        }

        return failures
    }

    return getAllRepos().then(async repos => {
        console.log(`Found ${repos.length} repos`)
        let failures = []
        console.time('runtime');

        for (const repo of repos) {
            if (context && context.getRemainingTimeInMillis() < 10*1000) {
                console.log("Ran out of time, exiting")
                break;
            }

            try {
                console.log(`Backing up ${repo.name}`)

                let modified = new Date(repo.updated_at)
                failures = failures.concat(await gitRepoToTarball(repo.name, modified, context));
            } catch (e) {
                console.error(`Failed to backup ${repo.name}`)
                console.error(e)
            }
        }

        console.timeEnd('runtime');

        if (failures.length > 0) {
            console.error(`Failed to backup ${failures.length} items`)
            throw new Error("Failed to backup some items")
        }
        return failures
    });
}