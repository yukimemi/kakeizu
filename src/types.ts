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
  // Soft-delete: when set, the person is hidden from the tree but remains in
  // Firestore so the audit-history "元に戻す" can restore it.
  deletedAt?: number;
  deletedBy?: string;
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
  deletedAt?: number;
  deletedBy?: string;
  createdAt?: number;
};

// ---------- Audit log ----------

export type AuditEventType = "create" | "update" | "delete" | "restore";
export type AuditTargetType = "person" | "relationship";

export type AuditEvent = {
  id: string;
  treeId: string;
  ts: number; // ms epoch
  actor: string; // uid
  actorEmail?: string;
  actorName?: string;
  type: AuditEventType;
  targetType: AuditTargetType;
  targetId: string;
  // JSON-safe snapshots. id / treeId are stripped (redundant). For relationship
  // events we also stash fromName/toName so the history list can render
  // without a separate person lookup.
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  // Pre-computed Japanese summary, evaluated at write time.
  summary: string;
  // When this event was produced by reverting another event, points back to
  // the reverted event's id.
  revertOfId?: string;
};

// AuditEventInput = an event prepared on the client, before Firestore assigns
// an id and the server stamps `ts`.
export type AuditEventInput = Omit<AuditEvent, "id" | "ts">;

export type RevertPlan =
  | {
      kind: "restorePerson";
      personId: string;
      // Relationships that were soft-deleted alongside the person — restore
      // them in the same operation so the family graph snaps back as one
      // logical unit.
      relationshipIds: string[];
    }
  | {
      kind: "restoreRelationship";
      relationshipId: string;
    }
  | {
      kind: "softDeletePerson";
      personId: string;
    }
  | {
      kind: "softDeleteRelationship";
      relationshipId: string;
    }
  | {
      kind: "rollbackPersonUpdate";
      personId: string;
      // Field values to restore. `undefined` means "clear this field"
      // (i.e. it was added in the update being reverted).
      fields: Record<string, unknown>;
    };
