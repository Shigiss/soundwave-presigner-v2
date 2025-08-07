const AWS = require('aws-sdk');
const s3 = new AWS.S3({ region: 'eu-north-1' });

const BUCKET = 'my-soundwave-uploads-sp';
const ALLOWED_ORIGIN = 'https://xyrscv-gx.myshopify.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  const method = event.requestContext.http.method;
  const qs = event.queryStringParameters || {};

  // Handle OPTIONS → CORS preflight
  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS
    };
  }

  // Generate presigned PUT URL
  if (!qs.get) {
    const filename = qs.filename;
    if (!filename) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing ?filename parameter' })
      };
    }

    const key = `incoming/${Date.now()}-${filename}`;
    const url = await s3.getSignedUrlPromise('putObject', {
      Bucket: BUCKET,
      Key: key,
      Expires: 300,
      ContentType: 'application/octet-stream'
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ url, key })
    };
  }

  // Generate presigned GET URL
  const key = qs.key;
  if (!key) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing &key parameter' })
    };
  }

  const url = await s3.getSignedUrlPromise('getObject', {
    Bucket: BUCKET,
    Key: key,
    Expires: 300
  });

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ url })
  };
};
