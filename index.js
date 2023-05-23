const backup = require("./backup.js")

require("dotenv").config()

const options = {
  githubAccessToken: process.env.GITHUB_ACCESS_TOKEN,
  s3BucketName: process.env.AWS_S3_BUCKET_NAME,
  s3AccessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
  s3AccessSecretKey: process.env.AWS_S3_ACCESS_SECRET_KEY,
  s3StorageClass: process.env.AWS_S3_STORAGE_CLASS,
  mode: process.env.BACKUP_MODE,
  organisation: process.env.GITHUB_ORGANISATION,
  expireThreshold: process.env.EXPIRE_THRESHOLD
}

backup(options).then(
  () => {
    console.log("")
    console.log("All repos were successfully backed up")
  },
  error => {
    console.log("")
    console.error(error)
  }
)
