module.exports = {
  // =====================
  // BOT
  // =====================

  // Application ID של הבוט
  clientId: "1549754322131222598",

  // ID של השרת
  guildId: "1489571427567796326",

  // =====================
  // STAFF
  // =====================

  // רול Staff הראשי
  // משמש ל-!rank, !h, מודרציה וגישה למערכות צוות
  staffRoleId: "1530262361146003456",

  // =====================
  // MODERATION
  // =====================

  // רול Chat Mute
  muteRoleId: "1549774361324425246",

  // חדר לוגים של מודרציה
  // אפשר לשים "" אם לא רוצים לוגים
  modLogsChannelId: "1533958151525630043",

  // =====================
  // TICKETS
  // =====================

  // הקטגוריה שבה כל הטיקטים נפתחים
  ticketCategoryId: "1548269968108429342",

  // רול שמטפל בטיקטים רגילים
  ticketStaffRoleId: "1530262361146003456",

  // רול שרואה ומטפל בטיקט "בחינה לצוות"
  staffTestTicketRoleId: "1547920868964040784",

  // חדר Transcript + לוגים של סגירת טיקטים
  ticketLogsChannelId: "1530571895186133092",

  // =====================
  // WELCOME
  // =====================

  // חדר Welcome ספציפי.
  // אם משאירים "", הבוט ינסה למצוא:
  // welcome / welcomes / ברוכים-הבאים
  // ואם לא ימצא, ישתמש ב-System Channel.
  welcomeChannelId: "1489574096831516772",

  // =====================
  // XP
  // =====================

  xpPrefix: "!",

  // XP מהודעות
  xpPerMessageMin: 5,
  xpPerMessageMax: 15,

  // Cooldown לקבלת XP מהודעות
  xpMessageCooldownMs: 60 * 1000,

  // Daily
  dailyXpMin: 250,
  dailyXpMax: 500,

  // XP לכל Level
  rankXpPerLevel: 500,

  // =====================
  // CASINO
  // Virtual XP Only
  // =====================

  // מקסימום XP שאפשר לשים במשחק אחד
  maxCasinoBet: 1000,

  // Cooldown בין משחקי Casino
  casinoCooldownMs: 5 * 1000,

  // =====================
  // XP SHOP
  // =====================

  xpShop: [
    {
      key: "supporter",
      name: "Noabop Supporter",
      emoji: "💙",
      price: 2500,
      roleId: "1547924546688913429"
    },
    {
      key: "elite",
      name: "Noabop Elite",
      emoji: "💎",
      price: 5000,
      roleId: "1547924662229667922"
    },
    {
      key: "legend",
      name: "Noabop Legend",
      emoji: "👑",
      price: 10000,
      roleId: "1547924399129231420"
    }
  ]
};
