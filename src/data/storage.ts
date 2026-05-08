import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { storage } from "../firebase";

export async function uploadPersonPhoto(
  treeId: string,
  personId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `trees/${treeId}/persons/${personId}-${Date.now()}.${ext}`;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type });
  return await getDownloadURL(r);
}

export async function deletePersonPhoto(url: string) {
  try {
    const r = ref(storage, url);
    await deleteObject(r);
  } catch {
    // ignore — file may already be gone
  }
}
