# awscdk-app-dvr-preroll

Sample CDK app to deploy MediaTailor pre/mid roll ads with time-shifted viewing

**Data flow**
* Unwrapped: S3 ---(MP4 file)---> MediaLive ---(HLS)---> MediaPackage ---(HLS)---> MediaTailor
* Wrapped: S3 ---(MP4 file)---> MediaLive ---(HLS)---> MediaPackage ---(HLS)---> CloudFront Lambda@Edge ---(HLS)---> MediaTailor

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
