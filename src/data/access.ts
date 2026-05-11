import {
  doc,
  onSnapshot,
  setDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";

export type AccessConfig = {
  allowedEmails: string[];
  adminEmails: string[];
};

const ACCESS_DOC = doc(db, "config", "access");

export function useAccessConfig() {
  const [config, setConfig] = useState<AccessConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      ACCESS_DOC,
      (snap) => {
        const data = snap.data() as Partial<AccessConfig> | undefined;
        setConfig({
          allowedEmails: (data?.allowedEmails ?? []).map((e) => e.toLowerCase()),
          adminEmails: (data?.adminEmails ?? []).map((e) => e.toLowerCase()),
        });
        setLoading(false);
      },
      (err) => {
        console.error("[access] subscription error", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  return { config, loading };
}

export function useIsAdmin(email: string | null | undefined) {
  const { config, loading } = useAccessConfig();
  const isAdmin = useMemo(() => {
    if (!email || !config) return false;
    return config.adminEmails.includes(email.toLowerCase());
  }, [config, email]);
  return { isAdmin, loading };
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export async function addAllowedEmail(email: string): Promise<void> {
  const lower = normalize(email);
  if (!lower || !lower.includes("@")) throw new Error("invalid email");
  await setDoc(
    ACCESS_DOC,
    { allowedEmails: arrayUnion(lower), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function removeAllowedEmail(email: string): Promise<void> {
  const lower = normalize(email);
  if (!lower) return;
  await setDoc(
    ACCESS_DOC,
    { allowedEmails: arrayRemove(lower), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function addAdminEmail(email: string): Promise<void> {
  const lower = normalize(email);
  if (!lower || !lower.includes("@")) throw new Error("invalid email");
  await setDoc(
    ACCESS_DOC,
    {
      // Admins must also be in allowedEmails so write rules accept them.
      adminEmails: arrayUnion(lower),
      allowedEmails: arrayUnion(lower),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function removeAdminEmail(email: string): Promise<void> {
  const lower = normalize(email);
  if (!lower) return;
  await setDoc(
    ACCESS_DOC,
    { adminEmails: arrayRemove(lower), updatedAt: serverTimestamp() },
    { merge: true },
  );
}
