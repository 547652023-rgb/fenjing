import type { FieldDefinition, Shot } from "./storyboard";

export type AuthUser = {
  id: string;
  email: string;
};

export type ProjectRole = "owner" | "editor";

export type ProjectSummary = {
  id: string;
  title: string;
  ownerId: string;
  ownerEmail: string;
  role: ProjectRole;
  memberCount: number;
  updatedAt: string;
};

export type ProjectMember = {
  userId: string;
  email: string;
  role: ProjectRole;
};

export type VersionedShot = {
  shot: Shot;
  version: number;
};

export type RemoteImage = {
  path: string;
  url: string;
  name: string;
  position: number;
};

export type ProjectMetaPatch = {
  title?: string;
  aspectRatio?: string;
  fields?: FieldDefinition[];
};

export type UploadImageInput = {
  projectId: string;
  shotId: string;
  fieldId: string;
  file: File;
  position: number;
};

export type SaveState =
  | "saving"
  | "saved"
  | "offline"
  | "reconnecting"
  | "error"
  | "conflict";

export type ProjectEvent =
  | { type: "project.changed" }
  | { type: "shot.updated"; shot: VersionedShot }
  | { type: "shot.deleted"; shotId: string }
  | { type: "structure.changed" };

export type ProjectEventListener = (event: ProjectEvent) => void;
export type Unsubscribe = () => void;
