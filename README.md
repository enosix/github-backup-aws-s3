# github-backup-to-s3

A tool to back up all your github repos to an aws s3 bucket.
It can optionally back up just an organization's repositories.

## Usage

copy `.env.example` and rename it `.env` and set up the config variables.

### AWS Credentials

create a new IAM user with *programmatic access* and add access to `putObject` on the specific bucket you want to back up.

*(no other permissions is needed)*

the policy could look something like:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "123456789",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject"
            ],
            "Resource": [
                "arn:aws:s3:::REPLACE-WITH-BUCKET-NAME/*"
            ]
        }
    ]
}
```

### Environment variables

In your `.env`, set:

`GITHUB_ORGANIZATION` to the name of the Organization
`AWS_ACCESS_KEY_ID` and `AWS_ACCESS_SECRET_KEY` to the credentials of the IAM user
`AWS_S3_STORAGE_CLASS` to STANDARD
`BUCKET_NAME` to the name of the bucket you want to back up to
`GITHUB_ACCESS_TOKEN` to a github access token with read access to the organization


### Run locally

```
node index.js
```

### Deploy to aws lambda

it might be more useful to deploy it with a schedule on aws lambda, so it will backup with a given interval.

install [Serverless Framework](https://github.com/serverless/serverless)
```
npm install -g serverless
```

optionally make modifications to **serverless.yml** and run

choose the scheduling interval:
http://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html

```
serverless deploy -v --schedule-expression 'rate(2 hours)'

// every hour
serverless deploy -v --schedule-expression 'rate(0 * * * ? *)'

// every 5 minute
serverless deploy -v --schedule-expression 'cron(*/5 * * * ? *)'
```