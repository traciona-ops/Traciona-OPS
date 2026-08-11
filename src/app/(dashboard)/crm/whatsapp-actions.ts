"use server";

/** Barrel estável — UI continua importando daqui. */
export {
  sendWhatsappMessage,
  sendWhatsappMedia,
  scheduleMessage,
  cancelScheduledMessage,
  reactToMessage,
  deleteMessageForAll,
  editWhatsappMessage,
} from "./whatsapp-send-actions";

export {
  listChatNumbers,
  fetchThread,
  fetchDockContext,
  startConversation,
  fetchLeadHistory,
  deleteConversation,
  markAllConversationsRead,
  markConversationRead,
  markConversationUnread,
} from "./whatsapp-inbox-actions";

export {
  createQuickReply,
  listQuickReplies,
  deleteQuickReply,
  getConnectionStatus,
  getChatSettings,
  updateChatSettings,
  presenceKeepalive,
  typingPresence,
  type ChatSettings,
} from "./whatsapp-settings-actions";
