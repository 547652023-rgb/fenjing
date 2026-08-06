import type {
  CreateSceneInput,
  Shot,
  StoryboardProject,
  StoryboardScene,
} from "../domain/storyboard";
import type {
  AuthUser,
  ProjectEventListener,
  ProjectFolder,
  ProjectHomeSettings,
  ProjectMember,
  PlatformAccount,
  PlatformAccountStatus,
  ProjectMetaPatch,
  ProjectSummary,
  PermanentDeleteRequestStatus,
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
  | "not_supervisor"
  | "registration_not_allowed"
  | "account_disabled"
  | "invalid_email"
  | "invalid_status"
  | "cannot_disable_supervisor"
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
  isSupervisor(): Promise<boolean>;
  listPlatformAccounts(): Promise<PlatformAccount[]>;
  invitePlatformAccount(email: string): Promise<PlatformAccount>;
  setPlatformAccountStatus(userId: string, status: Extract<PlatformAccountStatus, "active" | "disabled">): Promise<PlatformAccount>;
  listProjects(): Promise<ProjectSummary[]>;
  createProject(title: string, template?: TemplateSnapshot): Promise<ProjectSummary>;
  listFolders(): Promise<ProjectFolder[]>;
  createFolder(name: string): Promise<ProjectFolder>;
  renameFolder(folderId: string, name: string): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  setProjectFolder(projectId: string, folderId: string | null): Promise<void>;
  listProjectFolderAssignments(): Promise<Record<string, string>>;
  listHomeSettings(): Promise<ProjectHomeSettings>;
  saveHomeSettings(settings: ProjectHomeSettings): Promise<void>;
  setProjectIcon(projectId: string, icon: string | null): Promise<void>;
  moveProjectToTrash(projectId: string): Promise<void>;
  restoreProject(projectId: string): Promise<void>;
  permanentlyDeleteProject(projectId: string): Promise<PermanentDeleteRequestStatus>;
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
  createScene(projectId: string, input: CreateSceneInput): Promise<StoryboardScene>;
  updateScene(projectId: string, scene: StoryboardScene): Promise<void>;
  deleteScene(projectId: string, sceneId: string): Promise<void>;
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
