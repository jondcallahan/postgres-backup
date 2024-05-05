import { exec, execSync } from "node:child_process";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createReadStream, unlink, statSync, mkdir } from "node:fs";
import { filesize } from "filesize";
import path from "node:path";
import os from "node:os";
import { env } from "./env.js";

const uploadToS3 = async ({ name, path }) => {
  console.log("Uploading backup to S3...");

  const bucket = env.AWS_S3_BUCKET;

  /**
   * @type {import("@aws-sdk/client-s3").S3ClientConfig} clientOptions
   */
  const clientOptions = {
    region: env.AWS_S3_REGION
  }

  if (env.AWS_S3_ENDPOINT) {
    console.log(`Using custom endpoint: ${env.AWS_S3_ENDPOINT}`)
    clientOptions['endpoint'] = env.AWS_S3_ENDPOINT;
  }

  const client = new S3Client(clientOptions);

  await new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: name,
      Body: createReadStream(path),
      Expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * env.DAYS_TO_KEEP), // 30 days by default
    },
  }).done();

  console.log("Backup uploaded to S3...");
}

const dumpToFile = async (filePath) => {
  console.log("Dumping DB to file...");

  await new Promise((resolve, reject) => {
    exec(`pg_dump --dbname=${env.BACKUP_DATABASE_URL} --format=tar | gzip > ${filePath}`, (error, stdout, stderr) => {
      if (error) {
        reject({ error: error, stderr: stderr.trimEnd() });
        return;
      }

      // check if archive is valid and contains data
      const isValidArchive = (execSync(`gzip -cd ${filePath} | head -c1`).length == 1) ? true : false;
      if (isValidArchive == false) {
        reject({ error: "Backup archive file is invalid or empty; check for errors above" });
        return;
      }

      // not all text in stderr will be a critical error, print the error / warning
      if (stderr != "") {
        console.log({ stderr: stderr.trimEnd() });
      }

      console.log("Backup archive file is valid");
      console.log("Backup filesize:", filesize(statSync(filePath).size));

      // if stderr contains text, let the user know that it was potently just a warning message
      if (stderr != "") {
        console.log(`Potential warnings detected; Please ensure the backup file "${path.basename(filePath)}" contains all needed data`);
      }

      resolve(undefined);
    });
  });

  console.log("DB dumped to file...");
}


const deleteFile = async (path) => {
  console.log("Deleting file...");
  await new Promise((resolve, reject) => {
    unlink(path, (err) => {
      reject({ error: err });
      return;
    });
    resolve(undefined);
  });
}

export const backup = async () => {
  console.log("Initiating DB backup...");

  const now = new Date().toISOString();
  const nestedDate = now.split('T')[0].split('-').join('/');
  const timestamp = now.split('T')[1].replace(/[:\.]+/g, '-');
  const filename = `${nestedDate}/backup-${timestamp}.tar.gz`;
  const filepath = path.join(os.tmpdir(), filename);

  // Create the directory structure if it doesn't exist
  const dirname = path.dirname(filepath);
  await mkdir(dirname, { recursive: true });

  await dumpToFile(filepath);
  await uploadToS3({ name: filename, path: filepath });
  await deleteFile(filepath);

  console.log("DB backup complete...✅");
};
