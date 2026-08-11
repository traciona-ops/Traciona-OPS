/** Barrel estável — UI continua importando daqui.
 *  Sem "use server" aqui: Next 16 só permite export de async fn
 *  em arquivos com a diretiva; as actions reais estão nos *-actions.ts.
 */
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
