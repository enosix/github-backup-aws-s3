const backup = require("./backup.js")
require("dotenv").config()

module.exports.runBackup = (event, context, callback) => {
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

  backup(options, context).then(() => {
    callback(null, {
      response: "All repos were successfully backed up"
    })
  }, callback)
}
