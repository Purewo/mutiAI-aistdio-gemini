import type { CoordinationEvidenceRef } from '../api/types';

/**
 * Build a content-addressed product evidence reference from text the user can actually inspect.
 * The user never enters an internal resource ID; the visible text remains in the observation or
 * report body while its SHA-256 provides a stable idempotent evidence identity.
 */
export async function contentEvidenceRef(
  resourceType: string,
  label: string,
  content: string,
): Promise<CoordinationEvidenceRef> {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  const sha256 = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return {
    resource_type: resourceType,
    resource_id: sha256,
    label,
    sha256,
  };
}
