export type Gender = "male" | "female" | "other";

export type TreeRole = "owner" | "editor" | "viewer";

export type MemberInfo = { email?: string; displayName?: string };

export type Tree = {
  id: string;
  name: string;
  ownerId: string; // creator (also has owner role)
  memberIds: string[]; // for `array-contains` queries
  memberRoles: Record<string, TreeRole>;
  // Email-based pending invites — claimed by the invitee at sign-in.
  invitedEmails?: string[]; // for `array-contains` queries
  pendingRoles?: Record<string, TreeRole>; // email → role
  // Cached identity info for member display (uid → { email, displayName }).
  memberInfo?: Record<string, MemberInfo>;
  createdAt?: number;
  updatedAt?: number;
};

export type ContactEntry = { label?: string; value: string };

export type SocialService =
  | "x"
  | "instagram"
  | "facebook"
  | "line"
  | "youtube"
  | "tiktok"
  | "threads"
  | "github";

export type Socials = Partial<Record<SocialService, string>>;

export type Person = {
  id: string;
  treeId: string;
  lastName: string;
  firstName: string;
  lastNameKana?: string;
  firstNameKana?: string;
  birthDate?: string; // YYYY-MM-DD
  gender?: Gender;
  photoUrl?: string;
  // Crop/pan state for the avatar — x/y are percentage offsets, scale is a
  // multiplier (1 = fit, default). Only meaningful while photoUrl is set.
  photoTransform?: { x: number; y: number; scale: number };
  postalCode?: string;
  address?: string;
  phones?: ContactEntry[];
  emails?: ContactEntry[];
  socials?: Socials;
  memo?: string;
  // Legacy single-value fields, retained for back-compat with persons created
  // before the structured contact fields were introduced. Read once into the
  // new shape on load; new writes only touch the new fields.
  phone?: string;
  email?: string;
  sns?: string;
  position?: { x: number; y: number };
  importedFromId?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type RelationshipType = "parent" | "spouse";

// parent: from = parent, to = child
// spouse: from <-> to (undirected; we still record both ids)
export type Relationship = {
  id: string;
  treeId: string;
  type: RelationshipType;
  from: string;
  to: string;
  createdAt?: number;
};
