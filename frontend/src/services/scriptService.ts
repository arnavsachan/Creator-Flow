import apiClient from './apiClient';
import { ensureAuthenticatedSession } from './youtubeService';
import type {
  AuditRetentionPayload,
  GenerateHooksPayload,
  GenerateHooksResponse,
  GenerateScriptPayload,
  GenerateScriptResponse,
  RetentionAuditResponse,
  SaveScriptPayload,
  SavedScript,
} from '../types/script';

/**
 * Generates 3 diverse 5-second hook variations using Gemini AI.
 */
export async function generateHooks(
  payload: GenerateHooksPayload,
  signal?: AbortSignal
): Promise<GenerateHooksResponse> {
  await ensureAuthenticatedSession();
  const response = await apiClient.post<GenerateHooksResponse>(
    '/scripts/generate-hooks',
    payload,
    { signal }
  );
  return response.data;
}

/**
 * Generates a full structured script with timecodes and retention locks.
 */
export async function generateScript(
  payload: GenerateScriptPayload,
  signal?: AbortSignal
): Promise<GenerateScriptResponse> {
  await ensureAuthenticatedSession();
  const response = await apiClient.post<GenerateScriptResponse>(
    '/scripts/generate',
    payload,
    { signal }
  );
  return response.data;
}

/**
 * Audits script text for pacing, opening hook effectiveness, and drop-off risks.
 */
export async function auditRetention(
  payload: AuditRetentionPayload,
  signal?: AbortSignal
): Promise<RetentionAuditResponse> {
  await ensureAuthenticatedSession();
  const response = await apiClient.post<RetentionAuditResponse>(
    '/scripts/audit-retention',
    payload,
    { signal }
  );
  return response.data;
}

/**
 * Persists a video script for the authenticated user.
 */
export async function saveScript(
  payload: SaveScriptPayload,
  signal?: AbortSignal
): Promise<SavedScript> {
  await ensureAuthenticatedSession();
  const response = await apiClient.post<SavedScript>('/scripts', payload, { signal });
  return response.data;
}

/**
 * Lists all saved scripts for the user.
 */
export async function listSavedScripts(
  channelId?: string,
  signal?: AbortSignal
): Promise<SavedScript[]> {
  await ensureAuthenticatedSession();
  const params: Record<string, string> = {};
  if (channelId) params.channel_id = channelId;

  const response = await apiClient.get<SavedScript[]>('/scripts', {
    params,
    signal,
  });
  return response.data;
}

/**
 * Retrieves a single saved script by ID.
 */
export async function getSavedScript(
  id: string,
  signal?: AbortSignal
): Promise<SavedScript> {
  await ensureAuthenticatedSession();
  const response = await apiClient.get<SavedScript>(`/scripts/${id}`, { signal });
  return response.data;
}

export default {
  generateHooks,
  generateScript,
  auditRetention,
  saveScript,
  listSavedScripts,
  getSavedScript,
};
