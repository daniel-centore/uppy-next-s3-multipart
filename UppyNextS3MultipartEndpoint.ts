import { AwsS3Part } from '@uppy/aws-s3-multipart';
import { UppyFile } from '@uppy/core';
import { S3 } from 'aws-sdk';
import type { NextApiRequest, NextApiResponse } from 'next'

const S3_ENDPOINTS = [
  'createMultipartUpload',
  'listParts',
  'prepareUploadParts',
  'abortMultipartUpload',
  'completeMultipartUpload',
] as const;
export type S3Endpoint = typeof S3_ENDPOINTS[number];

export type CreateMultipartUploadResponse = { err: Error | string } | {
  key: string;
  uploadId: string;
};

export type ListPartsResponse = { err: Error | string } | AwsS3Part[];

export type PrepareUploadPartsResponse = { err: Error | string }
  | { presignedUrls: { [k: number]: string }, headers?: { [k: string]: string } };

export type AbortMultipartUploadResponse = { err: Error | string } | {};

export type CompleteMultipartUploadResponse = { err: Error | string }
  | { location?: string | undefined; };

export type FilenameGenFunction<T>
  = (file: UppyFile, filenameParams: T) => string;

export class UppyNextS3MultipartEndpoint<T = undefined> {
  readonly s3: S3;
  readonly bucket_name: string;
  readonly genFilename: FilenameGenFunction<T>;
  readonly signed_url_expire_time_secs: number;

  constructor(
    s3: S3,
    bucket_name: string,
    signed_url_expire_time_secs: number,
    genFilename: FilenameGenFunction<T>,
  ) {
    this.s3 = s3;
    this.bucket_name = bucket_name;
    this.genFilename = genFilename;
    this.signed_url_expire_time_secs = signed_url_expire_time_secs;
  }

  createMultipartUpload = (
    req: NextApiRequest,
    res: NextApiResponse<CreateMultipartUploadResponse>,
  ) => {
    const { file, filenameParams }: {
      file: UppyFile,
      filenameParams: T,
    } = req.body;

    if (!file) {
      res.status(400).json({ err: 'Missing param' });
      return;
    }

    const multipartParams = {
      Bucket: this.bucket_name ?? '',
      Key: this.genFilename(file, filenameParams),
      ContentType: file.type ?? '',
    }

    const t = this;
    return new Promise(((resolve, reject) => {
      t.s3.createMultipartUpload(multipartParams, (err, data) => {
        if (err) {
          res.status(err.statusCode ?? 500).json({ err });
          reject(err);
        }
        const result = {
          key: data.Key ?? '',
          uploadId: data.UploadId ?? '',
        };
        res.status(200).json(result);
        resolve(result);
      })
    }));
  }

  listParts = (
    req: NextApiRequest,
    res: NextApiResponse<ListPartsResponse>
  ) => {
    const { file, uploadId, key }: {
      file: UppyFile;
      uploadId: string;
      key: string;
    } = req.body;

    if (!uploadId || !key) {
      res.status(400).json({ err: 'Missing param' });
    }
    const t = this;
    return new Promise(function (resolve, reject) {
      t.s3.listParts((err, data) => {
        const result = data.Parts?.map(part => {
          const PartNumber = part.PartNumber;
          const Size = part.Size;
          const ETag = part.ETag;
          if (PartNumber === undefined || Size === undefined || ETag === undefined) {
            const err = 'Invalid parts: ' + JSON.stringify(part);
            res.status(500).json({ err });
            reject(err);
            return null;
          }
          return {
            PartNumber, Size, ETag,
          }
        }).flatMap(f => f ? [f] : []) ?? [];
        res.status(200).json(result);
        resolve(result);
      });
    })
  }

  prepareUploadParts = async (
    req: NextApiRequest,
    res: NextApiResponse<PrepareUploadPartsResponse>
  ) => {
    const { file, partData }: {
      file: UppyFile,
      partData: {
        uploadId: string;
        key: string;
        partNumbers: Array<number>;
        chunks: { [k: number]: Blob }
      },
    } = req.body;

    if (!file || !partData) {
      res.status(400).json({ err: 'Missing param' });
    }
    const t = this;
    const urls = await Promise.all(
      partData.partNumbers.map((partNumber) => {
        return t.s3.getSignedUrlPromise('uploadPart', {
          Bucket: this.bucket_name,
          Key: partData.key,
          UploadId: partData.uploadId,
          PartNumber: partNumber,
          Body: '',
          Expires: this.signed_url_expire_time_secs,
        });
      }));
    const presignedUrls = Object.create(null);
    for (let index = 0; index < partData.partNumbers.length; index++) {
      presignedUrls[partData.partNumbers[index]] = urls[index];
    }
    res.status(200).json({ presignedUrls });
  }

  abortMultipartUpload = async (
    req: NextApiRequest,
    res: NextApiResponse<AbortMultipartUploadResponse>
  ) => {
    const { file, uploadId, key }: {
      file: UppyFile;
      uploadId: string;
      key: string;
    } = req.body;

    if (!file || !uploadId || !key) {
      res.status(400).json({ err: 'Missing param' });
    }
    this.s3.abortMultipartUpload({
      Bucket: this.bucket_name,
      Key: key,
      UploadId: uploadId,
    });
    res.status(200).json({});
  }

  completeMultipartUpload = async (
    req: NextApiRequest,
    res: NextApiResponse<CompleteMultipartUploadResponse>
  ) => {
    const { file, uploadId, key, parts }: {
      file: UppyFile;
      uploadId: string;
      key: string;
      parts: AwsS3Part[];
    } = req.body;

    if (!file || !uploadId || !key || !parts) {
      res.status(400).json({ err: 'Missing param' });
      return;
    }
    const t = this;
    return new Promise(function (resolve, reject) {
      t.s3.completeMultipartUpload({
        Bucket: t.bucket_name,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts,
        }
      }, (err, data) => {
        if (err) {
          res.status(500).json({ err });
          reject(err);
        }
        const result = {
          location: data.Location,
        };
        res.status(200).json(result);
        resolve(result);
      })
    });
  }

  handle = async (
    req: NextApiRequest,
    res: NextApiResponse,
  ) => {
    const endpoint = req.query.endpoint;

    if (!(typeof endpoint === 'string')) {
      res.status(404).json({ message: 'Endpoint must be a string' });
      return;
    }

    switch (endpoint) {
      case 'createMultipartUpload':
        await this.createMultipartUpload(req, res);
        break;
      case 'listParts':
        await this.listParts(req, res);
        break;
      case 'prepareUploadParts':
        await this.prepareUploadParts(req, res);
        break;
      case 'abortMultipartUpload':
        await this.abortMultipartUpload(req, res);
        break;
      case 'completeMultipartUpload':
        await this.completeMultipartUpload(req, res);
        break;
      default:
        res.status(404).json({ message: 'Endpoint could not be found: ' + endpoint });
    }
  }
}
