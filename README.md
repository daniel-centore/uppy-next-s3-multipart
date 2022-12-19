# UppyNextS3Multipart

NOTE: THIS LIBRARY DOES NOT YET WORK WITH UPPY V3! I do not know when I'll get around to fixing it. Please either use Uppy v2 or update this library yourself and put up a PR.

This is a library designed to make it simple to integrate the [Uppy](https://uppy.io/) uploader library with [AWS S3 Multipart Uploads](https://uppy.io/docs/aws-s3-multipart/) while using a [NextJS](https://nextjs.org/) server.

Normally Uppy wants you to include their [Companion](https://uppy.io/docs/companion/) server for doing this, but it's a little bit overkill for this simple use case, and it means you'd have to switch to using [Express](https://expressjs.com/), which causes you to lose many of the benefits of the NextJS server.

## Setup
First install this library with `yarn add uppy-next-s3-multipart` or `npm install uppy-next-s3-multipart`

Then, create a new API endpoint at the location of your choosing. This endpoint should redirect all of its calls to `new UppyNextS3MultipartEndpoint(...).handle(req, res)`. In this example, I'm creating it at `pages/api/uppy-aws/[endpoint].ts`:

```typescript
import { UppyFile } from '@uppy/core';
import { S3 } from 'aws-sdk';
import type { NextApiRequest, NextApiResponse } from 'next'
import { v4 as uuid } from 'uuid';
import { UppyNextS3MultipartEndpoint } from uppy-next-s3-multipart';

const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_REGION = process.env.S3_REGION;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME ?? '';

const EXPIRE_TIME_SEC = 1 * 60 * 60;

const s3 = new S3({
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: S3_SECRET_ACCESS_KEY ?? '',
  },
  region: S3_REGION,
});

export type FilenameGenParams = { prefix: string };

const endpointHandler = new UppyNextS3MultipartEndpoint<FilenameGenParams>(
  s3,
  S3_BUCKET_NAME,
  EXPIRE_TIME_SEC,
  // This is used to specify how you would like the file to be named
  // In this example, I am passing a prefix from the client, then adding
  // a year-month folder, then a uuid with the filename appended at the end
  (file, params) => {
    const date = new Date();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${params.prefix}/${year}-${month}/${uuid()}_${file.name}`;
  }
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  return endpointHandler.handle(req, res);
}
```

Finally, on the client side, create your Uppy instance as you normally would, but pass in the options from `getUppyNextS3MultipartOptions(endpoint)`. For example:

```typescript
import '@uppy/core/dist/style.css'
import '@uppy/dashboard/dist/style.css'

import Uppy from '@uppy/core'
import { Dashboard } from '@uppy/react'
import { AwsS3Multipart } from 'uppy'
import { getUppyNextS3MultipartOptions } from 'uppy-next-s3-multipart'
import { FilenameGenParams } from '../pages/api/uppy-aws/[endpoint]'

const uppy = new Uppy();
uppy.use(AwsS3Multipart,
  getUppyNextS3MultipartOptions<FilenameGenParams>(
    // The endpoint you saved the earlier file at. No trailing slash.
    '/api/uppy-aws',
    // This is where we pass in the params used for filename generation
    { prefix: 'music' },
  ));

export function FileUploadExample() {
  return (
    <Dashboard uppy={uppy} />
  )
}
```
