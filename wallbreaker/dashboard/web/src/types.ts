export interface Settings {
  profiles?: string[];
  profile_details?: Record<string, ProfileDetail>;
  default_profile?: string | null;
  attacker_model?: string | null;
  target?: { model: string; modality: string; base_url: string; protocol: string; provider: string[] } | null;
  target_profile?: string | null;
  judge_model?: string | null;
  judge_profile?: string | null;
  agent?: AgentConfig;
  target_options?: TargetOptions;
  [key: string]: unknown;
}

export interface ProfileDetail {
  name: string;
  model: string;
  protocol: string;
  base_url: string;
  modality: string;
}

export interface ModelCatalog {
  profile: string;
  protocol: string;
  models: string[];
  fetched: boolean;
  error: string;
}

export interface ProviderTestResult extends ModelCatalog {
  ok: boolean;
  refreshed_at?: string;
}

export interface ProviderRecord extends ProfileDetail {
  enabled: boolean;
  api_key_env: string;
  has_api_key: boolean;
  auth_style: string;
  inference_path: string;
  models_path: string;
  timeout: number;
  reasoning: boolean;
}

export interface RoleChoice {
  provider: string;
  model: string;
  profile: string;
  custom: boolean;
  prompt_source: "none" | "inline" | "file";
  has_system_prompt: boolean;
}

export type RoleAssignments = Record<"attacker" | "target" | "judge", RoleChoice>;

export interface AgentConfig {
  max_rounds?: number;
  max_tokens?: number;
  concurrency?: number;
  request_delay_ms?: number;
}

export interface TargetOptions {
  modality: "auto" | "text" | "image";
  system_mode: "default" | "merge" | "drop";
  provider: string;
  judge_enabled: boolean;
}

export type AgentRole = "attacker" | "target" | "judge";
export interface AgentProfile {
  name: string;
  role: AgentRole;
  provider: string;
  model: string;
  prompt_source: "none" | "inline" | "file";
  system_prompt: string;
  system_prompt_file: string;
}
export interface AgentProfileRoleData { active: RoleChoice; profiles: AgentProfile[] }
export interface AgentProfilesResponse { roles: Record<AgentRole, AgentProfileRoleData> }

export interface Preset { name: string; description: string; template: string }
export interface Transform { name: string; description: string; lossy: boolean; reversible: boolean }
export interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  control?: boolean;
}

