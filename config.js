module.exports = {
  // =====================
  // BOT
  // =====================

  clientId: "PUT_CLIENT_ID_HERE",
  guildId: "PUT_GUILD_ID_HERE",

  // =====================
  // ROLES
  // =====================

  // רול שמקבלים אחרי Verify
  memberRoleId: "PUT_MEMBER_ROLE_ID_HERE",

  // רול צוות:
  // מודרציה, !h, /rank, פאנל Verify וטיקטים
  staffRoleId: "PUT_STAFF_ROLE_ID_HERE",

  // רול Chat Mute
  // תגדיר לו Deny ל-Send Messages / Send Messages in Threads
  // אבל אל תחסום Connect / Speak ב-Voice
  muteRoleId: "PUT_MUTE_ROLE_ID_HERE",

  // =====================
  // MOD LOGS
  // =====================

  // אפשר להשאיר "" אם לא רוצים לוגים
  modLogsChannelId: "PUT_MOD_LOGS_CHANNEL_ID_HERE",

  // =====================
  // TICKETS
  // =====================

  // קטגוריה שבה ייפתחו הטיקטים
  ticketCategoryId: "PUT_TICKET_CATEGORY_ID_HERE",

  // רול צוות לטיקטים רגילים
  ticketStaffRoleId: "PUT_TICKET_STAFF_ROLE_ID_HERE",

  // רול נפרד לטיקט "בחינה לצוות"
  staffTestTicketRoleId: "PUT_STAFF_TEST_TICKET_ROLE_ID_HERE",

  // חדר Transcript / לוג סגירת טיקטים
  ticketLogsChannelId: "PUT_TICKET_LOGS_CHANNEL_ID_HERE",

  // =====================
  // XP + CASINO
  // =====================

  xpPrefix: "!",

  xpPerMessageMin: 5,
  xpPerMessageMax: 15,

  xpMessageCooldownMs:
    60 * 1000,

  dailyXpMin: 250,
  dailyXpMax: 500,

  maxCasinoBet: 1000,

  casinoCooldownMs:
    5 * 1000,

  // XP לכל Level ב-/rank
  rankXpPerLevel: 500
};
