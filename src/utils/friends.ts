export interface FriendActionResult {
  ok: boolean;
  message?: string;
}

export async function acceptFriendRequest(..._args: unknown[]): Promise<FriendActionResult> {
  return { ok: true };
}

export async function cancelFriendRequest(..._args: unknown[]): Promise<FriendActionResult> {
  return { ok: true };
}

export async function declineFriendRequest(..._args: unknown[]): Promise<FriendActionResult> {
  return { ok: true };
}

export async function removeFriend(..._args: unknown[]): Promise<FriendActionResult> {
  return { ok: true };
}

export async function sendFriendRequest(..._args: unknown[]): Promise<FriendActionResult> {
  return { ok: true };
}
