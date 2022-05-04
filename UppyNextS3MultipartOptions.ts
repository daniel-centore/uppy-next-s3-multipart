import { AwsS3Part } from '@uppy/aws-s3-multipart';
import { UppyFile } from '@uppy/core';
import {
  AbortMultipartUploadResponse,
  CompleteMultipartUploadResponse,
  CreateMultipartUploadResponse,
  ListPartsResponse,
  PrepareUploadPartsResponse,
} from './UppyNextS3MultipartEndpoint';

const DEFAULT_CHUNK_SIZE = 20 * 1024 * 1024
const DEFAULT_MAX_CHUNKS = 9000;
const DEFAULT_MAX_SIMULTANEOUS = 5;

export const getUppyNextS3MultipartOptions = <T>(endpoint: string, filenameParams: T) => {
  return {
    limit: DEFAULT_MAX_SIMULTANEOUS,
    getChunkSize: (file: UppyFile) => {
      const CHUNKS = file.size / DEFAULT_CHUNK_SIZE;
      if (CHUNKS > DEFAULT_MAX_CHUNKS) {
        return file.size / DEFAULT_MAX_CHUNKS;
      }
      return DEFAULT_CHUNK_SIZE;
    },
    createMultipartUpload: async (file: UppyFile) => {
      const res = await fetch(`${endpoint}/createMultipartUpload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, filenameParams })
      });
      const j = await res.json();
      const json = j as CreateMultipartUploadResponse;
      if ('err' in json) {
        throw json.err;
      }
      return json;
    },
    listParts: async (file: UppyFile, { uploadId, key }: {uploadId: string, key: string}) => {
      const res = await fetch(`${endpoint}/listParts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, uploadId, key })
      });
      const j = await res.json();
      const json = j as ListPartsResponse;
      if ('err' in json) {
        throw json.err;
      }
      return json;
    },
    prepareUploadParts: async (file: UppyFile, partData: { uploadId: string; key: string; partNumbers: Array<number>; chunks: { [k: number]: Blob } }) => {
      const res = await fetch(`${endpoint}/prepareUploadParts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, partData })
      });
      const j = await res.json();
      const json = j as PrepareUploadPartsResponse;
      if ('err' in json) {
        throw json.err;
      }
      return json;
    },
    abortMultipartUpload: async (file: UppyFile, { uploadId, key }: {uploadId: string, key: string}) => {
      const res = await fetch(`${endpoint}/abortMultipartUpload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, uploadId, key })
      });
      const j = await res.json();
      const json = j as AbortMultipartUploadResponse;
      if ('err' in json) {
        throw json.err;
      }
    },
    completeMultipartUpload: async (file: UppyFile, { uploadId, key, parts }: { uploadId: string; key: string; parts: AwsS3Part[] }) => {
      const res = await fetch(`${endpoint}/completeMultipartUpload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, uploadId, key, parts })
      });
      const j = await res.json();
      const json = j as CompleteMultipartUploadResponse;
      if ('err' in json) {
        throw json.err;
      }
      return json;
    },
  }
}
