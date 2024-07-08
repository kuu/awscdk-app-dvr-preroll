import { Aws, Stack, StackProps, CfnOutput, Fn, RemovalPolicy } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { LiveChannelFromMp4 } from 'awscdk-construct-live-channel-from-mp4-file';
import { ScteScheduler } from 'awscdk-construct-scte-scheduler';
import { MediaTailorWithCloudFront, MediaTailorWithCloudFrontProps } from 'awscdk-mediatailor-cloudfront-construct';
import { FilePublisher } from 'awscdk-construct-file-publisher';
import { AdDecisionServer } from 'awscdk-construct-ad-decision-server';
import { Wrapper } from 'awscdk-construct-mediapackage-wrapper';

export class AwscdkAppDvrPrerollStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Make the files in the local folder publicly accessible
    const publicFolder = new FilePublisher(this, 'FilePublisher', {
      path: './upload',
    });

    // Build DVR channel
    const { eml, empv1: emp } = new LiveChannelFromMp4(this, 'LiveChannelFromMp4', {
      sourceUrl: `${publicFolder.url}/desert-song.mp4`,
      timecodeBurninPrefix: 'Ch1',
      autoStart: true,
      mediaPackageVersionSpec: 'V1_ONLY',
      startoverWindowSeconds: 1209600,
    });

    // Schedule a 60-sec ad break every 10 minutes
    new ScteScheduler(this, 'ScteScheduler1', {
      channelId: eml.channel.ref,
      scteDurationInSeconds: 30,
      intervalInMinutes: 10,
    });

    if (!emp) {
      return;
    }

    // Create wrapper L@E functions
    const arr = Fn.split('/', emp.endpoints.hls.attrUrl);
    const empDomain = Fn.select(2, arr);
    const empPath = `${Fn.select(5, arr)}/${Fn.select(6, arr)}`;
    const wrapper = new Wrapper(this, 'Wrapper', {
      domainName: empDomain,
      hlsWrapperFunction: lambda.Code.fromAsset('./lib/code/'),
    });
    const wrappedEndpoint = `https://${wrapper.cf.distribution.distributionDomainName}/out/v1/${empPath}`;
    const unwrappedEndpoint = emp.endpoints.hls.attrUrl;

    // Build Ad Decision Server (ADS)
    const ads = new AdDecisionServer(this, 'AdDecisionServer', {
      creatives: [
        {
          duration: 30,
          url: `${publicFolder.url}/30sec.mp4`,
          delivery: 'progressive',
          mimeType: 'video/mp4',
          width: 1280,
          height: 720,
        },
        {
          duration: 60,
          url: `${publicFolder.url}/60sec.mp4`,
          delivery: 'progressive',
          mimeType: 'video/mp4',
          width: 1280,
          height: 720,
        },
      ],
    });

    // Build MediaTailor with preroll
    const wrappedEMTUrl = getMediaTailorUrl(this, '1', empPath, {
      videoContentSourceUrl: wrappedEndpoint,
      adDecisionServerUrl: `${ads.url}?duration=[session.avail_duration_secs]`,
      slateAdUrl: `${publicFolder.url}/slate-1sec.mp4`,
      prerollAdUrl: `${ads.url}?duration=60`,
    });

    const unwrappedEMTUrl = getMediaTailorUrl(this, '2', empPath, {
      videoContentSourceUrl: unwrappedEndpoint,
      adDecisionServerUrl: `${ads.url}?duration=[session.avail_duration_secs]`,
      slateAdUrl: `${publicFolder.url}/slate-1sec.mp4`,
      prerollAdUrl: `${ads.url}?duration=60`,
    });

    // Print wrapped EMP HLS endpoint
    new CfnOutput(this, "WrappedEMPHLSEndpoint", {
      value: wrappedEndpoint,
      exportName: Aws.STACK_NAME + "WrappedHLSEndpoint",
      description: "Wrapped EMP HLS Endpoint",
    });

    // Print wrapped EMT HLS URL
    new CfnOutput(this, "WrappedEMTHLSURL", {
      value: wrappedEMTUrl,
      exportName: Aws.STACK_NAME + "WrappedEMTHLSURL",
      description: "Wrapped EMT HLS URL",
    });

    // Print unwrapped EMP HLS endpoint
    new CfnOutput(this, "UnwrappedEMPHLSEndpoint", {
      value: unwrappedEndpoint,
      exportName: Aws.STACK_NAME + "UnwrappedHLSEndpoint",
      description: "Unwrapped EMP HLS Endpoint",
    });

    // Print unwrapped EMT HLS URL
    new CfnOutput(this, "UnwrappedEMTHLSURL", {
      value: unwrappedEMTUrl,
      exportName: Aws.STACK_NAME + "UnwrappedEMTHLSURL",
      description: "Unwrapped EMT HLS URL",
    });
  }
}

function getMediaTailorUrl(construct: Construct, id: string, empPath: string, props: MediaTailorWithCloudFrontProps): string {
    // Build MediaTailor with preroll
    const {emt} = new MediaTailorWithCloudFront(construct, `MediaTailorWithCloudFrontPreroll${id}`, {
      videoContentSourceUrl: props.videoContentSourceUrl,
      adDecisionServerUrl: props.adDecisionServerUrl,
      slateAdUrl: props.slateAdUrl,
      prerollAdUrl: props.prerollAdUrl,
      skipCloudFront: true,
    });

    return `${emt.config.attrHlsConfigurationManifestEndpointPrefix}${empPath}?start=${Math.floor(Date.now() / 1000)}&aws.logMode=DEBUG`;
}