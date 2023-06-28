import aws from "@aws-sdk/client-s3";

export class Backup {
    constructor(options) {
        // check for required options
        if (!options.bucketName) {
            throw new Error("Missing required option: bucketName");
        }
        if (!options.awsAccessKeyId) {
            throw new Error("Missing required option: awsAccessKeyId");
        }
        if (!options.awsAccessSecretKey) {
            throw new Error("Missing required option: awsAccessSecretKey");
        }

        this.storageClass = options.s3StorageClass || "STANDARD";
        this.bucket = options.bucketName;
        this.s3 = new aws.S3({
            accessKeyId: options.awsAccessKeyId,
            secretAccessKey: options.awsAccessSecretKey
        })
    }

    async uploadBundle(bundleStream, repo) {
        const s3Params = {
            Bucket: this.bucket,
            Key: repo.name + "/" + new Date().toISOString() + ".bundle",
            Body: bundleStream,
            StorageClass: this.storageClass,
            Metadata: {
                "repository": repo.name,
                "backup-date": new Date().toISOString(),
                "tags": repo.tags || 'none',
                "description": repo.description,
                "default-branch": repo.defaultBranch
            }
        };

        try {
            await this.s3.send(new aws.PutObjectCommand(s3Params));
            console.log("  Uploaded " + repo.name + " to S3");
        } catch (e) {
            console.error("Error uploading " + repo.name + " to S3: " + e.message);
        }
    }

    async getLastUpdated(repo) {
        // get the last time a file inside the s3 directory was updated
        const s3Params = {
            Bucket: this.bucket,
            Prefix: repo.name + "/",
        };

        try {
            const response = await this.s3.send(new aws.ListObjectVersionsCommand(s3Params));
            const lastUpdated = (response.Versions || []).reduce((lastUpdated, file) => {
                if (file.IsLatest && file.LastModified > lastUpdated) {
                    return file.LastModified;
                } else {
                    return lastUpdated;
                }
            }, new Date(0));
            return lastUpdated;
        } catch (e) {
            console.error("Error getting last updated for " + repo.name + ": " + e.message);
            return new Date(0);
        }
    }
}