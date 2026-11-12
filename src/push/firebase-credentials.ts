import { z } from 'zod';

const serviceAccountSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.string().email(),
  private_key: z.string().min(1),
});

export interface FirebaseCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export function parseFirebaseCredentials(base64: string): FirebaseCredentials {
  const json: unknown = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  const parsed = serviceAccountSchema.parse(json);
  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
  };
}
