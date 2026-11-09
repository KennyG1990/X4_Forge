import { createHash, randomBytes, verify as verifySignature, type KeyObject } from 'node:crypto';
import { canonicalJson } from '../lib/actionReceipt';
import type { OwnerDecision } from './projectCheckApproval';

const RP_ID = 'localhost';
const CHALLENGE_TTL_MS = 120_000;
const MAX_PENDING_CHALLENGES = 16;
const AUTHENTICATOR_DATA_BYTES = 37;
const VERIFIED_DEVICE_FLAGS = 0x01 | 0x04;
const PROOF_FIELDS = new Set(['type', 'id', 'userHandle', 'clientDataJSON', 'authenticatorData', 'signature']);

interface PinnedOwnerCredential {
  ownerId: string;
  origin: string;
  credentialId: string;
  userHandle: string;
  publicKey: KeyObject;
}

function decodeBase64Url(value: unknown, maxBytes: number): Buffer | undefined {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return undefined;
  }
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length <= maxBytes && bytes.toString('base64url') === value ? bytes : undefined;
}

function sha256(value: string | Buffer): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Relying-party proof for one independently provisioned, device-bound owner credential. */
export class ProjectCheckOwnerProof {
  private readonly pending = new Map<string, { decision: string; expiresAt: number }>();
  private readonly credential: Readonly<PinnedOwnerCredential>;
  private readonly rpHash = sha256(RP_ID);
  private lastSignCount = 0;

  constructor(credential: PinnedOwnerCredential, private readonly now = () => performance.now()) {
    const origin = new URL(credential.origin);
    if (origin.hostname !== RP_ID || origin.origin !== credential.origin || !['http:', 'https:'].includes(origin.protocol)
      || !/^[A-Za-z0-9_-]{1,96}$/.test(credential.ownerId)
      || !decodeBase64Url(credential.credentialId, 1023) || !decodeBase64Url(credential.userHandle, 64)
      || credential.publicKey.type !== 'public' || credential.publicKey.asymmetricKeyType !== 'ec'
      || credential.publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
      throw new Error('Invalid pinned local project-check owner credential.');
    }
    this.credential = Object.freeze({ ...credential });
  }

  /** Only a trusted host adapter may call this with a server-owned review decision. */
  issue(decision: Readonly<OwnerDecision>) {
    const now = this.now();
    for (const [challenge, pending] of this.pending) {
      if (pending.expiresAt <= now) this.pending.delete(challenge);
    }
    if (this.pending.size >= MAX_PENDING_CHALLENGES) throw new Error('Too many pending owner confirmations.');
    const challenge = randomBytes(32).toString('base64url');
    this.pending.set(challenge, { decision: canonicalJson(decision), expiresAt: now + CHALLENGE_TTL_MS });
    return {
      challenge, rpId: RP_ID, timeout: CHALLENGE_TTL_MS, userVerification: 'required' as const,
      allowCredentials: [{ type: 'public-key' as const, id: this.credential.credentialId }],
    };
  }

  readonly verify = (ownerId: string, decision: Readonly<OwnerDecision>, proof: unknown): boolean => {
    if (ownerId !== this.credential.ownerId || !proof || typeof proof !== 'object' || Array.isArray(proof)
      || Object.keys(proof).some(key => !PROOF_FIELDS.has(key))) return false;
    const response = proof as Record<string, unknown>;
    if (response.type !== 'public-key' || response.id !== this.credential.credentialId
      || (response.userHandle != null && response.userHandle !== this.credential.userHandle)) return false;
    const clientBytes = decodeBase64Url(response.clientDataJSON, 4096);
    const authData = decodeBase64Url(response.authenticatorData, AUTHENTICATOR_DATA_BYTES);
    const signature = decodeBase64Url(response.signature, 80);
    if (!clientBytes || !authData || !signature || authData.length !== AUTHENTICATOR_DATA_BYTES
      || !authData.subarray(0, 32).equals(this.rpHash) || authData[32] !== VERIFIED_DEVICE_FLAGS) return false;
    try {
      const client = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clientBytes));
      if (client?.type !== 'webauthn.get' || client.origin !== this.credential.origin
        || (client.crossOrigin !== undefined && client.crossOrigin !== false)
        || client.topOrigin !== undefined || typeof client.challenge !== 'string') return false;
      const pending = this.pending.get(client.challenge);
      if (!pending || pending.expiresAt <= this.now() || pending.decision !== canonicalJson(decision)) return false;
      const signCount = authData.readUInt32BE(33);
      if ((signCount || this.lastSignCount) && signCount <= this.lastSignCount) return false;
      if (!verifySignature('sha256', Buffer.concat([authData, sha256(clientBytes)]), this.credential.publicKey, signature)) {
        return false;
      }
      this.pending.delete(client.challenge);
      this.lastSignCount = signCount;
      return true;
    } catch {
      return false;
    }
  };
}
