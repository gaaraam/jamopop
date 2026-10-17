export type BubbleMessage = {
  id: number;
  memberId: string;
  body: string;
  createdAt: number;
  deleted: number;
};
export function activeChatBubbles(messages: BubbleMessage[], now: number) {
  const latest: Record<string, BubbleMessage> = {};
  for (const message of messages) {
    if (!latest[message.memberId] || latest[message.memberId].id < message.id)
      latest[message.memberId] = message;
  }
  return Object.fromEntries(
    Object.entries(latest).filter(
      ([, m]) => !m.deleted && m.body && m.createdAt > now - 8000 && m.createdAt <= now,
    ),
  );
}
