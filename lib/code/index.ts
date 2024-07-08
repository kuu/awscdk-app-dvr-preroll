import { CloudFrontRequestEvent, CloudFrontResponseResult } from 'aws-lambda';
import fetch from 'node-fetch'; // For making a request to the origin
import * as HLS from 'hls-parser'; // For reading/writing the HLS manifest

export const handler = async (event: CloudFrontRequestEvent): Promise<CloudFrontResponseResult> => {
  // Define an empty responce
  const response: CloudFrontResponseResult = {
    status: '200',
    statusDescription: 'OK',
    headers: {
      'content-type': [{
        key: 'Content-Type',
        value: 'text/plain',
      }],
    },
    bodyEncoding: 'text',
    body: '',
  };
  // Extract the data from the origin request
  const { uri, querystring, headers: requestHeaders, origin } = event.Records[0].cf.request;
  if (!origin?.custom) {
    response.body = 'Origin not found';
    return response;
  }
  const { protocol, domainName, port } = origin.custom;
  // Build a request URL and request headers
  const requestUri = `${protocol}://${domainName}:${port}${uri}?${querystring}`;
  console.log(`Request URL: ${requestUri}`);
  const headerMap = new Map();
  for (const k of Object.keys(requestHeaders)) {
    for (const {key, value} of requestHeaders[k]) {
      if (key) {
        headerMap.set(key, value);
      }
    }
  }
  // Make an origin request
  const res = await fetch(requestUri, {headers: headerMap.entries()});
  if (!res.ok) {
    response.body = `${res.status} ${res.statusText}\n${requestUri}`;
    return response;
  }
  // Parse the HLS manifest
  let playlist = HLS.parse(await res.text());
  if (!playlist.isMasterPlaylist) {
    // Add Cue-IN/OUT tags
    playlist = convert(playlist as HLS.types.MediaPlaylist);
  }
  response.body = HLS.stringify(playlist);
  // Add HTTP headers
  response.headers!['content-type'] = [{key: 'Content-Type', value: res.headers.get('content-type') as string}];
  response.headers!['date'] = [{key: 'Date', value: res.headers.get('date') as string}];
  response.headers!['cache-control'] = [{key: 'Cache-Control', value: res.headers.get('cache-control') as string}];
  response.headers!['access-control-allow-origin'] = [{key: 'Access-Control-Allow-Origin', value: res.headers.get('access-control-allow-origin') as string}];
  response.headers!['access-control-allow-credentials'] = [{key: 'Access-Control-Allow-Credentials', value: res.headers.get('access-control-allow-credentials') as string}];
  response.headers!['vary'] = [{key: 'Vary', value: res.headers.get('vary') as string}];
  response.headers!['x-mediapackage-manifest-last-sequence'] = [{key: 'X-MediaPackage-Manifest-Last-Sequence', value: res.headers.get('x-mediapackage-manifest-last-sequence') as string}];
  response.headers!['x-mediapackage-manifest-last-updated'] = [{key: 'X-MediaPackage-Manifest-Last-Updated', value: res.headers.get('x-mediapackage-manifest-last-updated') as string}];
  response.headers!['x-mediapackage-request-id'] = [{key: 'X-MediaPackage-Request-Id', value: res.headers.get('x-mediapackage-request-id') as string}];
  // Return response
  return response;
};

function convert(playlist: HLS.types.MediaPlaylist): HLS.types.MediaPlaylist {
  playlist.start = {offset: -(playlist.targetDuration * 3), precise: true};
  playlist.segments.unshift(
    new HLS.types.Segment({
      uri: 'https://live-logiclogic.streaks.jp/null.ts',
      duration: 300,
      markers: [
        {type: 'RAW', tagName: 'EXT-X-ASSET', value: 'AD_TYPE=PREROLL,MEDIA_ID=12345'},
        {type: 'OUT', duration: 300},
      ],
    }),
    new HLS.types.Segment({
      uri: 'https://live-logiclogic.streaks.jp/null.ts',
      duration: 0,
      markers: [{type: 'IN'}],
    }),
  );
  return playlist;
}