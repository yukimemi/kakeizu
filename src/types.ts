export type Gender = "male" | "female" | "other";

export type TreeRole = "owner" | "editor" | "viewer";

export type Tree = {
  id: string;
  name: string;
  ownerId: string; // creator (also has owner role)
  memberIds: string[]; // for `array-contains` queries
  memberRoles: Record<string, TreeRole>;
  createdAt?: number;
  updatedAt?: number;
};

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
  address?: string;
  phone?: string;
  email?: string;
  sns?: string;
  memo?: string;
  position?: { x: number; y: number };
  // Set when this person was imported from another tree. Lets the import
  // dialog tell "already imported" from "new" and detect drift to offer
  // re-sync.
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
