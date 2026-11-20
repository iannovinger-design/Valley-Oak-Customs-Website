export function createMemoryInquiryStore({ failCreate = false, failStatus = false } = {}) {
  const inquiries = new Map();
  const notifications = new Map();
  return {
    inquiries,
    notifications,
    failCreate,
    failStatus,
    async createInquiry(record) {
      if (this.failCreate) throw new Error("synthetic storage failure");
      const existing = inquiries.get(record.inquiryId);
      if (existing) return existing.requestHash === record.requestHash ?
        { kind: "duplicate", record: existing } : { kind: "conflict", record: existing };
      inquiries.set(record.inquiryId, structuredClone(record));
      return { kind: "created", record: structuredClone(record) };
    },
    async ensureNotification(id, now) {
      if (this.failStatus) throw new Error("synthetic status failure");
      if (!notifications.has(id)) notifications.set(id, {
        inquiryId: id, status: "pending", attempts: 0, createdAt: now.toISOString(), activeToken: null,
      });
    },
    async claimNotification(id, now, maxAttempts) {
      if (this.failStatus) throw new Error("synthetic status failure");
      const state = notifications.get(id);
      if (state.status === "sent") return { claimed: false, status: "sent" };
      if (state.status === "sending") return { claimed: false, status: "pending" };
      if (state.attempts >= maxAttempts) return { claimed: false, status: "failed" };
      const token = `claim-${state.attempts + 1}`;
      Object.assign(state, { status: "sending", attempts: state.attempts + 1, activeToken: token, lastAttemptAt: now.toISOString() });
      return { claimed: true, status: "sending", token };
    },
    async finishNotification(id, token, outcome, now, errorCode = null) {
      if (this.failStatus) throw new Error("synthetic status failure");
      const state = notifications.get(id);
      if (state.activeToken !== token) return false;
      Object.assign(state, {
        status: outcome,
        activeToken: null,
        sentAt: outcome === "sent" ? now.toISOString() : state.sentAt ?? null,
        lastErrorCode: errorCode,
      });
      return true;
    },
  };
}
