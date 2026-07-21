import type { Shot, StoryboardProject } from "../domain/storyboard";
import type {
  AuthUser,
  ProjectEventListener,
  ProjectMember,
  ProjectMetaPatch,
  ProjectSummary,
  RemoteImage,
  StoryboardTemplate,
  TemplateSnapshot,
  Unsubscribe,
  UploadImageInput,
  VersionedShot,
} from "../domain/models";

export type GatewayErrorCode =
  | "already_registered"
  | "invalid_credentials"
  | "not_authenticated"
  | "forbidden"
  | "not_found"
  | "user_not_found"
  | "already_member"
  | "conflict"
  | "upload_failed"
  | "network";

export class GatewayError extends Error {
  constructor(
    public readonly code: GatewayErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export interface StoryboardGateway {
  getSession(): Promise<AuthUser | null>;
  onAuthChange(listener: (user: AuthUser | null) => void): Unsubscribe;
  signUp(email: string, password: string): Promise<AuthUser>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  listProjects(): Promise<ProjectSummary[]>;
  createProject(title: string, template?: TemplateSnapshot): Promise<ProjectSummary>;
  listTemplates(): Promise<StoryboardTemplate[]>;
  createTemplate(
    sourceProjectId: string,
    name: string,
    snapshot: TemplateSnapshot,
  ): Promise<StoryboardTemplate>;
  updateTemplate(
    templateId: string,
    name: string,
    snapshot: TemplateSnapshot,
  ): Promise<void>;
  deleteTemplate(templateId: string): Promise<void>;
  renameProject(projectId: string, title: string): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  loadProject(projectId: string): Promise<StoryboardProject>;
  saveProjectMeta(projectId: string, patch: ProjectMetaPatch): Promise<void>;
  saveShot(
    projectId: string,
    shot: Shot,
    expectedVersion: number,
  ): Promise<VersionedShot>;
  addShot(projectId: string): Promise<VersionedShot>;
  deleteShot(projectId: string, shotId: string): Promise<void>;
  reorderShots(projectId: string, orderedShotIds: string[]): Promise<void>;
  listMembers(projectId: string): Promise<ProjectMember[]>;
  inviteMember(projectId: string, email: string): Promise<void>;
  removeMember(projectId: string, userId: string): Promise<void>;
  uploadImage(input: UploadImageInput): Promise<RemoteImage>;
  deleteImage(projectId: string, path: string): Promise<void>;
  subscribeProject(
    projectId: string,
    listener: ProjectEventListener,
  ): Unsubscribe;
  importLocalProject(project: StoryboardProject): Promise<ProjectSummary>;
}
