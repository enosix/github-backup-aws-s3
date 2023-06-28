import { Organization } from './github.js';
import { Backup } from './s3.js';
import 'dotenv/config';
const isLambda = !!process.env.LAMBDA_TASK_ROOT;

export const runBackup = async () => {
  const options = {
    organization: process.env.GITHUB_ORGANIZATION,
    githubAccessToken: process.env.GITHUB_ACCESS_TOKEN,
    bucketName: process.env.BUCKET_NAME,
    awsAccessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
    awsAccessSecretKey: process.env.AWS_S3_ACCESS_SECRET_KEY,
    s3StorageClass: process.env.AWS_S3_STORAGE_CLASS
  }

  const backup = new Backup(options);
  const org = new Organization(options.githubAccessToken);

  for await ( let repo of org.getRepositories(options.organization) ) {
    const lastUpdated = await backup.getLastUpdated(repo);
    if (lastUpdated < repo.updatedAt) {
      console.log("Backing up " + repo.name);
      const bundleStream = await org.createBundle(repo.url);
      if (!bundleStream) {
        console.error("Error creating bundle for " + repo.name);
        continue;
      }
      await backup.uploadBundle(bundleStream, repo);
    }else{
      console.log("Skipping " + repo.name.slice(0, 40).padEnd(40, " ") + " last updated " + lastUpdated.toISOString());
    }
  }
}

if (!isLambda) {
  runBackup().then(() => {
    console.log("Backup complete");
  });
}