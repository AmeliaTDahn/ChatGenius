import type { Channel } from "@db/schema";

export async function updateChannelColor({ channelId, backgroundColor }: { channelId: number; backgroundColor: string }): Promise<Channel> {
  const res = await fetch(`/api/channels/${channelId}/color`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backgroundColor }),
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}
