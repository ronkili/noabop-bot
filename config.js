module.exports = {
  // =====================
  // BOT
  // =====================

  clientId: "1547910111043911690",
  guildId: "1489571427567796326",

  // =====================
  // ROLES
  // =====================

  // רול שמקבלים אחרי Verify
  memberRoleId: "1489580991734480976",

  // רול צוות:
  // מודרציה, !h, /rank, פאנל Verify וטיקטים
  staffRoleId: "1530262361146003456",

  // רול Chat Mute
  // תגדיר לו Deny ל-Send Messages / Send Messages in Threads
  // אבל אל תחסום Connect / Speak ב-Voice
  muteRoleId: "1547919633057714196",

  // =====================
  // MOD LOGS
  // =====================

  // אפשר להשאיר "" אם לא רוצים לוגים
  modLogsChannelId: "1533958151525630043",

  // =====================
  // TICKETS
  // =====================

  // קטגוריה שבה ייפתחו הטיקטים
  ticketCategoryId: "1489573588813086811",

  // רול צוות לטיקטים רגילים
  ticketStaffRoleId: "1530262361146003456",

  // רול נפרד לטיקט "בחינה לצוות"
  staffTestTicketRoleId: "1547916330496163860",

  // חדר Transcript / לוג סגירת טיקטים
  ticketLogsChannelId: "1530571895186133092",

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
