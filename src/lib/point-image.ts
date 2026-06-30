import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

// Evidence images attached to governance points. Stored on local disk, re-encoded on upload to strip
// EXIF/metadata, and served back via /api/governance/image/<id>.

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB per image (input cap)
export const IMAGE_MAX_DIM = 4000; // max width/height of the source
export const IMAGE_MAX_PER_POINT = 4; // how many images one point may carry

// Accepted input types, detected by magic bytes (NOT the client-supplied content-type or extension).
export type ImageKind = "png" | "jpeg" | "webp";

export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpeg";
  }
  // WEBP: "RIFF"...."WEBP"
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

const MIME: Record<ImageKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

// Root of on-disk uploads. Lives outside .next and outside git, so it survives deploys.
function uploadsRoot(): string {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads", "governance");
}

function caseDir(caseId: string): string {
  // caseId is a cuid (alphanumeric); still, guard against path traversal.
  const safe = caseId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(uploadsRoot(), safe);
}

export interface StoredImage {
  ext: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
}

// Validate, strip metadata by re-encoding, and write the image to disk under its case + id. Returns
// the stored facts, or throws an Error whose message is safe to surface to the client.
export async function storePointImage(
  caseId: string,
  imageId: string,
  input: Buffer
): Promise<StoredImage> {
  if (input.length > IMAGE_MAX_BYTES) {
    throw new Error("image is larger than 2 MB");
  }
  const kind = sniffImage(input);
  if (!kind) {
    throw new Error("unsupported image type (PNG, JPEG, or WebP only)");
  }

  // Decode with sharp. rotate() bakes in EXIF orientation; the pipeline drops all other metadata by
  // default (we never call withMetadata), so the written file carries no EXIF/GPS/device data.
  let pipeline = sharp(input, { failOn: "error" }).rotate();
  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) {
    throw new Error("could not read image dimensions");
  }
  if (meta.width > IMAGE_MAX_DIM || meta.height > IMAGE_MAX_DIM) {
    throw new Error(`image is larger than ${IMAGE_MAX_DIM}px on a side`);
  }

  // Re-encode to the same family (keeps PNG transparency; JPEG/WebP stay compressed). This is what
  // strips metadata; the output buffer is what we persist.
  let ext: string;
  let mime: string;
  if (kind === "png") {
    pipeline = pipeline.png({ compressionLevel: 9 });
    ext = "png";
    mime = MIME.png;
  } else if (kind === "webp") {
    pipeline = pipeline.webp({ quality: 85 });
    ext = "webp";
    mime = MIME.webp;
  } else {
    pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
    ext = "jpg";
    mime = MIME.jpeg;
  }
  const out = await pipeline.toBuffer();

  const dir = caseDir(caseId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${imageId}.${ext}`), out);

  return { ext, mime, width: meta.width, height: meta.height, bytes: out.length };
}

// Store a batch of images for a freshly-created point, in one call. Used by the combined
// create-point-with-images routes so a point + its evidence are saved under a single signature.
// `prisma` and `randomUUID` are passed in to avoid importing them into this fs/sharp module.
export async function storePointImageBatch(opts: {
  // Prisma client; typed loosely to avoid mirroring Prisma's generated types in this fs/sharp module.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any;
  randomUUID: () => string;
  caseId: string;
  ownerColumn: string; // "initiationId" | "groundsEntryId" | "defenseId" | "defenseEntryId"
  ownerId: string;
  signerAddress: string;
  files: Buffer[];
}): Promise<number> {
  const { prisma, randomUUID, caseId, ownerColumn, ownerId, signerAddress, files } = opts;
  if (files.length === 0) return 0;
  // Decode/validate/write the files first (outside the DB transaction, since these touch the
  // filesystem). The per-point cap is then enforced atomically below.
  const prepared: { id: string; stored: Awaited<ReturnType<typeof storePointImage>> }[] = [];
  for (const buf of files.slice(0, IMAGE_MAX_PER_POINT)) {
    const id = randomUUID();
    const stored = await storePointImage(caseId, id, buf); // validates + strips EXIF + writes
    prepared.push({ id, stored });
  }
  // Insert inside a transaction that RE-COUNTS, so two concurrent uploads can't both observe room and
  // collectively exceed IMAGE_MAX_PER_POINT (S19).
  const saved = await prisma.$transaction(async (tx: typeof prisma) => {
    const existing = await tx.providerFlagPointImage.count({
      where: { [ownerColumn]: ownerId, removedAt: null },
    });
    const room = Math.max(0, IMAGE_MAX_PER_POINT - existing);
    let n = 0;
    for (const { id, stored } of prepared.slice(0, room)) {
      await tx.providerFlagPointImage.create({
        data: {
          id,
          caseId,
          [ownerColumn]: ownerId,
          mime: stored.mime,
          ext: stored.ext,
          width: stored.width,
          height: stored.height,
          bytes: stored.bytes,
          signerAddress,
        },
      });
      n++;
    }
    return n;
  });
  return saved;
}

// Soft-remove a set of images that belong to a given point (ownerColumn=ownerId). Only rows that
// match the owner are removed, so a caller can pass ids freely without cross-point leakage. The file
// bytes are discarded; the row stays (removedAt set) for the public record. Returns how many removed.
export async function removePointImages(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any;
  ownerColumn: string;
  ownerId: string;
  ids: string[];
  now: Date;
}): Promise<number> {
  const { prisma, ownerColumn, ownerId, ids, now } = opts;
  if (ids.length === 0) return 0;
  const rows = await prisma.providerFlagPointImage.findMany({
    where: { id: { in: ids }, [ownerColumn]: ownerId, removedAt: null },
    select: { id: true, caseId: true, ext: true },
  });
  for (const r of rows) {
    await prisma.providerFlagPointImage.update({ where: { id: r.id }, data: { removedAt: now } });
    await deletePointImageFile(r.caseId, r.id, r.ext);
  }
  return rows.length;
}

// Pull image files out of a multipart form, capping count and per-file size. Returns the raw buffers
// (validation/EXIF-strip happens in storePointImage). Throws if a file is too large.
export async function imageBuffersFromForm(form: FormData): Promise<Buffer[]> {
  const entries = form.getAll("images");
  const bufs: Buffer[] = [];
  for (const v of entries.slice(0, IMAGE_MAX_PER_POINT)) {
    if (!(v instanceof Blob)) continue;
    if (v.size > IMAGE_MAX_BYTES) throw new Error("an image is larger than 2 MB");
    bufs.push(Buffer.from(await v.arrayBuffer()));
  }
  return bufs;
}

// Read a stored image's bytes for serving. Returns null if missing.
export async function readPointImage(caseId: string, imageId: string, ext: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(caseDir(caseId), `${imageId}.${ext}`));
  } catch {
    return null;
  }
}

// Remove a stored image file (best-effort; the DB row is the source of truth).
export async function deletePointImageFile(caseId: string, imageId: string, ext: string): Promise<void> {
  try {
    await fs.unlink(path.join(caseDir(caseId), `${imageId}.${ext}`));
  } catch {
    // already gone
  }
}
