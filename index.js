require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Events,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  MessageFlags
} = require("discord.js");

const {
  createCanvas,
  loadImage
} = require("@napi-rs/canvas");

const config = require("./config");

// =====================
// CLIENT
// =====================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// =====================
// DATA
// =====================

const DATA_DIR =
  process.env.DATA_DIR ||
  "/app/data";

fs.mkdirSync(DATA_DIR, {
  recursive: true
});

const STAFF_STATS_FILE =
  path.join(
    DATA_DIR,
    "staff-stats.json"
  );

const CHATMUTE_TIMERS_FILE =
  path.join(
    DATA_DIR,
    "chatmute-timers.json"
  );

function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }

    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  } catch (error) {
    console.error(
      `❌ Failed loading ${file}:`,
      error
    );

    return fallback;
  }
}

function saveJson(file, data) {
  const temp =
    `${file}.tmp`;

  fs.writeFileSync(
    temp,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );

  fs.renameSync(
    temp,
    file
  );
}

const staffStats =
  loadJson(
    STAFF_STATS_FILE,
    {
      guilds: {}
    }
  );

const chatMuteTimers =
  loadJson(
    CHATMUTE_TIMERS_FILE,
    {
      timers: {}
    }
  );

function saveStaffStats() {
  saveJson(
    STAFF_STATS_FILE,
    staffStats
  );
}

function saveChatMuteTimers() {
  saveJson(
    CHATMUTE_TIMERS_FILE,
    chatMuteTimers
  );
}

function getStaffProfile(
  guildId,
  userId
) {
  if (!staffStats.guilds[guildId]) {
    staffStats.guilds[guildId] = {
      users: {}
    };
  }

  const guildData =
    staffStats.guilds[guildId];

  if (!guildData.users[userId]) {
    guildData.users[userId] = {
      messages: 0,
      voiceMs: 0,
      helpsTaken: 0,
      ticketsTaken: 0,
      totalHelpResponseMs: 0,
      totalTicketClaimMs: 0
    };
  }

  return guildData.users[userId];
}

// =====================
// ACCESS
// =====================

function hasStaffAccess(
  member,
  guild
) {
  if (!member || !guild) {
    return false;
  }

  return Boolean(
    member.id ===
      guild.ownerId ||
    member.permissions.has(
      PermissionFlagsBits.Administrator
    ) ||
    (
      config.staffRoleId &&
      member.roles.cache.has(
        config.staffRoleId
      )
    )
  );
}

function canSetupPanels(
  member,
  guild
) {
  if (!member || !guild) {
    return false;
  }

  return Boolean(
    member.id ===
      guild.ownerId ||
    member.permissions.has(
      PermissionFlagsBits.Administrator
    ) ||
    member.permissions.has(
      PermissionFlagsBits.ManageGuild
    ) ||
    (
      config.staffRoleId &&
      member.roles.cache.has(
        config.staffRoleId
      )
    )
  );
}

// =====================
// GENERAL HELPERS
// =====================

function safeChannelName(value) {
  return String(
    value || "user"
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9א-ת_-]/g,
      "-"
    )
    .replace(
      /-+/g,
      "-"
    )
    .slice(0, 24);
}

function parseDuration(value) {
  const values = {
    "10m": 10 * 60 * 1000,
    "30m": 30 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "2h": 2 * 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "12h": 12 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000
  };

  return values[value] || null;
}

function formatDuration(ms) {
  if (!ms) {
    return "לצמיתות";
  }

  const minutes =
    Math.round(
      ms / 60000
    );

  if (minutes < 60) {
    return `${minutes} דקות`;
  }

  const hours =
    Math.round(
      minutes / 60
    );

  if (hours < 24) {
    return `${hours} שעות`;
  }

  return `${Math.round(
    hours / 24
  )} ימים`;
}

function formatVoiceTime(ms) {
  const totalSeconds =
    Math.floor(
      Number(ms || 0) /
      1000
    );

  const hours =
    Math.floor(
      totalSeconds / 3600
    );

  const minutes =
    Math.floor(
      (
        totalSeconds % 3600
      ) / 60
    );

  return `${hours} שעות ו־${minutes} דקות`;
}

function averageResponse(
  totalMs,
  count
) {
  if (!count) {
    return "—";
  }

  const seconds =
    Math.round(
      totalMs /
      count /
      1000
    );

  if (seconds < 60) {
    return `${seconds} שניות`;
  }

  return `${Math.floor(
    seconds / 60
  )} דקות ${seconds % 60} שניות`;
}

// =====================
// WELCOME
// =====================

function roundedRect(
  ctx,
  x,
  y,
  width,
  height,
  radius
) {
  const r =
    Math.min(
      radius,
      width / 2,
      height / 2
    );

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(
    x + width,
    y,
    x + width,
    y + height,
    r
  );
  ctx.arcTo(
    x + width,
    y + height,
    x,
    y + height,
    r
  );
  ctx.arcTo(
    x,
    y + height,
    x,
    y,
    r
  );
  ctx.arcTo(
    x,
    y,
    x + width,
    y,
    r
  );
  ctx.closePath();
}

async function loadOptionalImage(url) {
  if (!url) {
    return null;
  }

  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

function drawCover(
  ctx,
  image,
  x,
  y,
  width,
  height
) {
  const ratio =
    Math.max(
      width / image.width,
      height / image.height
    );

  const drawWidth =
    image.width * ratio;

  const drawHeight =
    image.height * ratio;

  ctx.drawImage(
    image,
    x +
      (width - drawWidth) / 2,
    y +
      (height - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
}

function getWelcomeChannel(guild) {
  if (config.welcomeChannelId) {
    const fixed =
      guild.channels.cache.get(
        config.welcomeChannelId
      );

    if (
      fixed &&
      fixed.isTextBased()
    ) {
      return fixed;
    }
  }

  const names = [
    "welcome",
    "welcomes",
    "ברוכים-הבאים",
    "ברוכים הבאים"
  ];

  const found =
    guild.channels.cache.find(
      channel =>
        channel.isTextBased() &&
        names.includes(
          String(
            channel.name || ""
          ).toLowerCase()
        )
    );

  return (
    found ||
    guild.systemChannel ||
    null
  );
}

async function createWelcomeCard(member) {
  const width = 740;
  const height = 338;

  const canvas =
    createCanvas(
      width,
      height
    );

  const ctx =
    canvas.getContext("2d");

  const guild =
    member.guild;

  const backgroundUrl =
    config.welcomeBackgroundUrl ||
    guild.bannerURL({
      extension: "png",
      size: 2048
    }) ||
    guild.iconURL({
      extension: "png",
      size: 1024
    });

  const background =
    await loadOptionalImage(
      backgroundUrl
    );

  if (background) {
    drawCover(
      ctx,
      background,
      0,
      0,
      width,
      height
    );
  } else {
    ctx.fillStyle =
      "#07131d";

    ctx.fillRect(
      0,
      0,
      width,
      height
    );
  }

  // Dark overlay like the reference screenshot.
  ctx.fillStyle =
    "rgba(2, 13, 22, 0.76)";

  ctx.fillRect(
    0,
    0,
    width,
    height
  );

  // Purple left stripe.
  ctx.fillStyle =
    "#a833ff";

  ctx.fillRect(
    0,
    0,
    8,
    height
  );

  // Avatar panel on the right.
  const avatarX = 548;
  const avatarY = 26;
  const avatarSize = 150;

  ctx.fillStyle =
    "rgba(44, 142, 225, 0.92)";

  roundedRect(
    ctx,
    avatarX,
    avatarY,
    avatarSize,
    avatarSize,
    14
  );

  ctx.fill();

  const avatar =
    await loadOptionalImage(
      member.user.displayAvatarURL({
        extension: "png",
        size: 512
      })
    );

  if (avatar) {
    ctx.save();

    roundedRect(
      ctx,
      avatarX + 7,
      avatarY + 7,
      avatarSize - 14,
      avatarSize - 14,
      11
    );

    ctx.clip();

    drawCover(
      ctx,
      avatar,
      avatarX + 7,
      avatarY + 7,
      avatarSize - 14,
      avatarSize - 14
    );

    ctx.restore();
  }

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";

  ctx.font =
    'bold 30px "DejaVu Sans", Arial';

  ctx.fillText(
    "ברוכים הבאים! 👋",
    520,
    58
  );

  ctx.font =
    '22px "DejaVu Sans", Arial';

  ctx.fillText(
    "ברוך הבא לשרת,",
    520,
    112
  );

  const displayName =
    `@ ${member.displayName}`;

  ctx.font =
    'bold 19px "DejaVu Sans", Arial';

  const pillWidth =
    Math.min(
      360,
      ctx.measureText(
        displayName
      ).width + 36
    );

  const pillX =
    520 - pillWidth;

  const pillY = 126;

  ctx.fillStyle =
    "rgba(57, 145, 255, 0.92)";

  roundedRect(
    ctx,
    pillX,
    pillY,
    pillWidth,
    38,
    10
  );

  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";

  ctx.fillText(
    displayName,
    pillX +
      pillWidth / 2,
    pillY + 26
  );

  ctx.textAlign = "right";
  ctx.font =
    '21px "DejaVu Sans", Arial';

  ctx.fillText(
    "אנחנו שמחים שהצטרפת אלינו 🎉",
    520,
    202
  );

  ctx.font =
    'bold 22px "DejaVu Sans", Arial';

  ctx.fillText(
    "חבר מספר",
    520,
    246
  );

  ctx.font =
    '24px "DejaVu Sans", Arial';

  ctx.fillText(
    String(
      guild.memberCount
    ),
    520,
    286
  );

  const icon =
    await loadOptionalImage(
      guild.iconURL({
        extension: "png",
        size: 256
      })
    );

  const iconX = 30;
  const iconY = 278;
  const iconSize = 34;

  if (icon) {
    ctx.save();

    ctx.beginPath();
    ctx.arc(
      iconX +
        iconSize / 2,
      iconY +
        iconSize / 2,
      iconSize / 2,
      0,
      Math.PI * 2
    );

    ctx.clip();

    ctx.drawImage(
      icon,
      iconX,
      iconY,
      iconSize,
      iconSize
    );

    ctx.restore();
  }

  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font =
    'bold 18px "DejaVu Sans", Arial';

  ctx.fillText(
    guild.name,
    76,
    302
  );

  return canvas.toBuffer(
    "image/png"
  );
}

// =====================
// GRAPHIC PANELS
// =====================

function getServerBackgroundUrl(guild) {
  return (
    config.panelBackgroundUrl ||
    config.welcomeBackgroundUrl ||
    guild.bannerURL({
      extension: "png",
      size: 2048
    }) ||
    guild.iconURL({
      extension: "png",
      size: 1024
    })
  );
}

async function createPanelCanvas(
  guild,
  width,
  height,
  stripeColor = "#5865f2"
) {
  const canvas =
    createCanvas(width, height);

  const ctx =
    canvas.getContext("2d");

  const background =
    await loadOptionalImage(
      getServerBackgroundUrl(guild)
    );

  if (background) {
    drawCover(
      ctx,
      background,
      0,
      0,
      width,
      height
    );
  } else {
    ctx.fillStyle =
      "#07131d";

    ctx.fillRect(
      0,
      0,
      width,
      height
    );
  }

  ctx.fillStyle =
    "rgba(2, 10, 18, 0.78)";

  ctx.fillRect(
    0,
    0,
    width,
    height
  );

  ctx.fillStyle =
    stripeColor;

  ctx.fillRect(
    0,
    0,
    7,
    height
  );

  return {
    canvas,
    ctx
  };
}

async function drawGuildIcon(
  ctx,
  guild,
  x,
  y,
  size
) {
  const icon =
    await loadOptionalImage(
      guild.iconURL({
        extension: "png",
        size: 512
      })
    );

  if (!icon) {
    return;
  }

  ctx.save();

  roundedRect(
    ctx,
    x,
    y,
    size,
    size,
    12
  );

  ctx.clip();

  drawCover(
    ctx,
    icon,
    x,
    y,
    size,
    size
  );

  ctx.restore();
}

function drawRtlText(
  ctx,
  text,
  x,
  y,
  font,
  color = "#ffffff"
) {
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(
    text,
    x,
    y
  );
}

function drawLtrText(
  ctx,
  text,
  x,
  y,
  font,
  color = "#ffffff"
) {
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(
    text,
    x,
    y
  );
}

async function createHelpCard(
  guild,
  requester,
  createdAt,
  reason = "בקשת עזרה חדשה",
  claimedBy = null
) {
  const width = 740;
  const height = 338;

  const {
    canvas,
    ctx
  } =
    await createPanelCanvas(
      guild,
      width,
      height,
      "#6d38ff"
    );

  drawLtrText(
    ctx,
    "NoaBop • Help Center",
    24,
    34,
    'bold 18px "DejaVu Sans", Arial'
  );

  drawRtlText(
    ctx,
    "🆘 בקשת עזרה חדשה",
    700,
    76,
    'bold 25px "DejaVu Sans", Arial'
  );

  drawRtlText(
    ctx,
    reason.slice(0, 55),
    700,
    106,
    '18px "DejaVu Sans", Arial',
    "#e8edf5"
  );

  const avatar =
    await loadOptionalImage(
      requester.displayAvatarURL({
        extension: "png",
        size: 256
      })
    );

  const avatarX = 28;
  const avatarY = 132;
  const avatarSize = 42;

  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2,
      avatarSize / 2,
      0,
      Math.PI * 2
    );
    ctx.clip();
    ctx.drawImage(
      avatar,
      avatarX,
      avatarY,
      avatarSize,
      avatarSize
    );
    ctx.restore();
  }

  const userText =
    `@${requester.username}`;

  ctx.font =
    'bold 17px "DejaVu Sans", Arial';

  const userPillWidth =
    Math.min(
      330,
      ctx.measureText(
        userText
      ).width + 32
    );

  ctx.fillStyle =
    "rgba(32, 142, 255, 0.95)";

  roundedRect(
    ctx,
    78,
    134,
    userPillWidth,
    38,
    10
  );

  ctx.fill();

  drawLtrText(
    ctx,
    userText,
    94,
    160,
    'bold 17px "DejaVu Sans", Arial'
  );

  drawRtlText(
    ctx,
    "📌 סטטוס",
    700,
    150,
    'bold 20px "DejaVu Sans", Arial'
  );

  drawRtlText(
    ctx,
    claimedBy
      ? "✅ בטיפול"
      : "⌛ ממתין לצוות",
    700,
    179,
    '19px "DejaVu Sans", Arial',
    claimedBy
      ? "#65e58c"
      : "#ffe17a"
  );

  drawRtlText(
    ctx,
    "👤 משתמש",
    700,
    220,
    'bold 20px "DejaVu Sans", Arial'
  );

  drawRtlText(
    ctx,
    requester.username,
    700,
    248,
    '18px "DejaVu Sans", Arial'
  );

  drawRtlText(
    ctx,
    "🛡️ מטפל",
    700,
    284,
    'bold 20px "DejaVu Sans", Arial'
  );

  drawRtlText(
    ctx,
    claimedBy
      ? claimedBy.username
      : "עדיין לא נלקח",
    700,
    312,
    '18px "DejaVu Sans", Arial',
    claimedBy
      ? "#8ec8ff"
      : "#d3dae5"
  );

  const helpId =
    String(createdAt)
      .slice(-12);

  drawLtrText(
    ctx,
    `NoaBop Help ID • ${helpId}`,
    24,
    316,
    'bold 13px "DejaVu Sans", Arial',
    "#e4e8ef"
  );

  return canvas.toBuffer(
    "image/png"
  );
}

async function createTicketPanelCard(guild) {
  const width = 900;
  const height = 520;

  const {
    canvas,
    ctx
  } =
    await createPanelCanvas(
      guild,
      width,
      height,
      "#5865f2"
    );

  await drawGuildIcon(
    ctx,
    guild,
    724,
    28,
    130
  );

  drawRtlText(
    ctx,
    "🎟️ מרכז התמיכה של NoaBop",
    690,
    64,
    'bold 29px "DejaVu Sans", Arial'
  );

  drawRtlText(
    ctx,
    "בחרו את סוג הפנייה שמתאים לכם באמצעות הכפתורים למטה.",
    690,
    108,
    '20px "DejaVu Sans", Arial',
    "#e3e8f0"
  );

  const sections = [
    {
      title:
        "📌 פנייה להנהלה",
      body:
        "לנושאים פרטיים, חשובים או דברים שדורשים טיפול ישיר של ההנהלה."
    },
    {
      title:
        "💬 עזרה כללית",
      body:
        "לשאלות, תמיכה, הכוונה ועזרה כללית בשרת."
    },
    {
      title:
        "⚠️ דיווח על משתמש/צוות",
      body:
        "לדיווח על משתמש או איש צוות שעובר על החוקים או מפריע בשרת."
    }
  ];

  let y = 174;

  for (const section of sections) {
    drawRtlText(
      ctx,
      section.title,
      825,
      y,
      'bold 24px "DejaVu Sans", Arial'
    );

    drawRtlText(
      ctx,
      section.body,
      825,
      y + 33,
      '17px "DejaVu Sans", Arial',
      "#e0e5ed"
    );

    y += 104;
  }

  drawRtlText(
    ctx,
    "לאחר הלחיצה ייפתח עבורכם טיקט פרטי והצוות יגיע אליכם בהקדם.",
    825,
    472,
    '18px "DejaVu Sans", Arial',
    "#ffffff"
  );

  drawLtrText(
    ctx,
    "NoaBop • Premium Support Center",
    24,
    494,
    'bold 14px "DejaVu Sans", Arial',
    "#e4e8ef"
  );

  return canvas.toBuffer(
    "image/png"
  );
}

async function createStaffPanelCard(guild) {
  const width = 900;
  const height = 590;

  const {
    canvas,
    ctx
  } =
    await createPanelCanvas(
      guild,
      width,
      height,
      "#7a35ff"
    );

  await drawGuildIcon(
    ctx,
    guild,
    742,
    26,
    118
  );

  drawRtlText(
    ctx,
    "📣 דרושים אנשי צוות חדשים לשרת!",
    700,
    66,
    'bold 28px "DejaVu Sans", Arial'
  );

  drawRtlText(
    ctx,
    "אנחנו שמחים להודיע כי ההרשמה לצוות השרת פתוחה תמיד 🚀",
    835,
    126,
    '20px "DejaVu Sans", Arial'
  );

  drawRtlText(
    ctx,
    "אם אתם אחראיים, בעלי רצון לעזור ורוצים לקחת חלק בניהול ובפיתוח השרת — זה המקום שלכם.",
    835,
    164,
    '18px "DejaVu Sans", Arial',
    "#e0e6ef"
  );

  drawRtlText(
    ctx,
    "📌 דרישות סף",
    835,
    222,
    'bold 23px "DejaVu Sans", Arial'
  );

  const requirements = [
    "• גיל מינימלי: 13+",
    "• פעילות וזמינות מתאימה",
    "• ידע בסיסי בחוקי השרת ויחסי אנוש טובים",
    "• ללא עבר משמעותי בתקופה האחרונה"
  ];

  let y = 260;

  for (const line of requirements) {
    drawRtlText(
      ctx,
      line,
      835,
      y,
      '18px "DejaVu Sans", Arial',
      "#f0f3f7"
    );

    y += 32;
  }

  drawRtlText(
    ctx,
    "📝 איך זה עובד?",
    835,
    408,
    'bold 23px "DejaVu Sans", Arial'
  );

  const steps = [
    "1. לחצו על Apply For Staff.",
    "2. ייפתח עבורכם טיקט בחינה פרטי.",
    "3. ענו על כל השאלות בצורה מפורטת.",
    "4. צוות ההנהלה יעבור על הבחינה ויחזור אליכם."
  ];

  y = 446;

  for (const line of steps) {
    drawRtlText(
      ctx,
      line,
      835,
      y,
      '18px "DejaVu Sans", Arial'
    );

    y += 30;
  }

  drawRtlText(
    ctx,
    "⏰ ההרשמה פתוחה תמיד — בהצלחה לכל המשתתפים!",
    835,
    566,
    'bold 18px "DejaVu Sans", Arial',
    "#ffffff"
  );

  return canvas.toBuffer(
    "image/png"
  );
}

// =====================
// TAKE ROLE
// =====================

async function buildTakeRolePanel(guild) {
  const ids =
    Array.isArray(
      config.takeRoleIds
    )
      ? config.takeRoleIds
      : [];

  const roles = [];

  for (const roleId of ids) {
    const role =
      await guild.roles
        .fetch(roleId)
        .catch(() => null);

    if (
      role &&
      !role.managed
    ) {
      roles.push(role);
    }
  }

  if (!roles.length) {
    throw new Error(
      "NO_TAKE_ROLES"
    );
  }

  const rows = [];

  for (
    let i = 0;
    i < roles.length &&
    i < 25;
    i += 5
  ) {
    const row =
      new ActionRowBuilder();

    for (
      const role
      of roles.slice(
        i,
        i + 5
      )
    ) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(
            `take_role:${role.id}`
          )
          .setLabel(
            role.name.slice(
              0,
              80
            )
          )
          .setStyle(
            ButtonStyle.Primary
          )
      );
    }

    rows.push(row);
  }

  return {
    embeds: [
      new EmbedBuilder()
        .setColor("Blurple")
        .setTitle(
          "🔔 קבלת רולים"
        )
        .setDescription(
          [
            "בחרו את רולי העדכונים שאתם רוצים לקבל.",
            "",
            "לחיצה על כפתור מוסיפה את הרול.",
            "לחיצה נוספת מסירה אותו.",
            "",
            "שם הכפתור נלקח אוטומטית משם הרול לפי ה־ID שהוגדר."
          ].join("\n")
        )
        .setFooter({
          text:
            "NoaBop • Take Role"
        })
        .setTimestamp()
    ],
    components: rows
  };
}

// =====================
// TICKETS
// =====================

const ticketTypes = {
  management: {
    emoji: "📌",
    name: "פנייה להנהלה",
    description:
      "פנייה פרטית וישירה לצוות ההנהלה"
  },

  general_help: {
    emoji: "💬",
    name: "עזרה כללית",
    description:
      "שאלות, עזרה ותמיכה כללית"
  },

  report: {
    emoji: "⚠️",
    name:
      "דיווח על משתמש/צוות",
    description:
      "דיווח על משתמש או איש צוות"
  },

  staff_test: {
    emoji: "📖",
    name: "בחינה לצוות",
    description:
      "Apply For Staff"
  }
};

async function ticketPanel(guild) {
  const buffer =
    await createTicketPanelCard(
      guild
    );

  return {
    files: [
      new AttachmentBuilder(
        buffer,
        {
          name:
            "noabop-ticket-panel.png"
        }
      )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              "ticket_open:management"
            )
            .setLabel(
              "פנייה להנהלה"
            )
            .setEmoji("📌")
            .setStyle(
              ButtonStyle.Primary
            ),

          new ButtonBuilder()
            .setCustomId(
              "ticket_open:general_help"
            )
            .setLabel(
              "עזרה כללית"
            )
            .setEmoji("💬")
            .setStyle(
              ButtonStyle.Primary
            ),

          new ButtonBuilder()
            .setCustomId(
              "ticket_open:report"
            )
            .setLabel(
              "דיווח על משתמש/צוות"
            )
            .setEmoji("⚠️")
            .setStyle(
              ButtonStyle.Primary
            )
        )
    ]
  };
}

async function staffApplicationPanel(
  guild
) {
  const buffer =
    await createStaffPanelCard(
      guild
    );

  return {
    files: [
      new AttachmentBuilder(
        buffer,
        {
          name:
            "noabop-staff-panel.png"
        }
      )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              "staff_apply"
            )
            .setLabel(
              "Apply For Staff"
            )
            .setEmoji("📖")
            .setStyle(
              ButtonStyle.Success
            )
        )
    ]
  };
}

function staffExamEmbeds() {
  return [
    new EmbedBuilder()
      .setColor("Purple")
      .setTitle(
        "📖 בחינה לצוות — חלק 1"
      )
      .setDescription(
        [
          "**1. שם מלא / כינוי בדיסקורד**",
          "",
          "**2. גיל**",
          "",
          "**3. כמה זמן אתה בשרת שלנו?**",
          "",
          "**4. ניסיון קודם בצוות ניהול / מודרטור? ואם עזבת, מדוע? הוכחה אם יש.**",
          "",
          "**5. איך אתה מגדיר צוות טוב? אילו תכונות צריך?**"
        ].join("\n")
      ),

    new EmbedBuilder()
      .setColor("Purple")
      .setTitle(
        "📖 בחינה לצוות — חלק 2"
      )
      .setDescription(
        [
          "**6. סיטואציה לא נעימה בצ'אט/וויס: התחצפות, עבירת חוקים, ריבים — מה תעשה? תן דוגמה.**",
          "",
          "**7. איך תגיב אם צוות מתחתיך תוקף אותך? ומה אם הוא מעליך?**",
          "",
          "**8. כמה זמן תוכל לתת לשרת בשבוע/כל יום?**",
          "",
          "**9. אם השרת בחוסר פעילות, איך תשנה מצב?**"
        ].join("\n")
      ),

    new EmbedBuilder()
      .setColor("Purple")
      .setTitle(
        "📖 בחינה לצוות — חלק 3"
      )
      .setDescription(
        [
          "**10. באילו תחומים רוצה לעזור (צ'אט, וויס, אירועים, טכני)?**",
          "",
          "**11. איך תתרום וכמה רחוק תוכל להגיע?**",
          "",
          "**12. מאיפה הרצון להצטרף?**",
          "",
          "**13. למה דווקא אתה מתאים?**",
          "",
          "**💡 תן רעיון אחד לשיפור השרת.**",
          "",
          "⚠️ טרול או זלזול בבחינה עלולים להוביל לענישה.",
          "",
          "**בהצלחה!**"
        ].join("\n")
      )
      .setFooter({
        text:
          "NoaBop • Staff Application"
      })
      .setTimestamp()
  ];
}

function parseTicketTopic(channel) {
  const result = {};

  for (
    const part
    of String(
      channel?.topic || ""
    ).split(";")
  ) {
    const [
      key,
      ...value
    ] =
      part.split("=");

    if (key && value.length) {
      result[
        key.trim()
      ] =
        value.join("=")
          .trim();
    }
  }

  return result;
}

function buildTicketTopic(data) {
  return [
    "noabopTicket=1",
    `owner=${data.owner}`,
    `type=${data.type}`,
    `created=${data.created}`,
    `claimed=${data.claimed || ""}`
  ].join(";");
}

function ticketControls(claimedBy) {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            claimedBy
              ? "ticket_release"
              : "ticket_claim"
          )
          .setLabel(
            claimedBy
              ? "Release"
              : "Claim"
          )
          .setEmoji(
            claimedBy
              ? "🔓"
              : "🙋"
          )
          .setStyle(
            claimedBy
              ? ButtonStyle.Secondary
              : ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "ticket_add_user"
          )
          .setLabel("Add User")
          .setEmoji("➕")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "ticket_remove_user"
          )
          .setLabel(
            "Remove User"
          )
          .setEmoji("➖")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "ticket_close"
          )
          .setLabel("Close")
          .setEmoji("🔒")
          .setStyle(
            ButtonStyle.Danger
          )
      )
  ];
}

async function openTicket(
  interaction,
  type
) {
  const info =
    ticketTypes[type];

  if (!info) {
    return interaction.reply({
      content:
        "❌ סוג הטיקט לא קיים.",
      flags:
        MessageFlags.Ephemeral
    });
  }

  const duplicate =
    interaction.guild.channels.cache.find(
      channel => {
        const data =
          parseTicketTopic(channel);

        return (
          data.noabopTicket ===
            "1" &&
          data.owner ===
            interaction.user.id
        );
      }
    );

  if (duplicate) {
    return interaction.reply({
      content:
        `❌ כבר יש לך טיקט פתוח: ${duplicate}`,
      flags:
        MessageFlags.Ephemeral
    });
  }

  const category =
    interaction.guild.channels.cache.get(
      config.ticketCategoryId
    );

  if (
    !category ||
    category.type !==
      ChannelType.GuildCategory
  ) {
    return interaction.reply({
      content:
        "❌ `ticketCategoryId` לא מוגדר נכון.",
      flags:
        MessageFlags.Ephemeral
    });
  }

  const staffRoleId =
    type === "staff_test"
      ? (
          config.staffTestTicketRoleId ||
          config.ticketStaffRoleId
        )
      : config.ticketStaffRoleId;

  const permissionOverwrites = [
    {
      id:
        interaction.guild.id,
      deny: [
        PermissionFlagsBits.ViewChannel
      ]
    },

    {
      id:
        interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  if (staffRoleId) {
    permissionOverwrites.push({
      id:
        staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    });
  }

  const created =
    Date.now();

  const channel =
    await interaction.guild.channels.create({
      name:
        `${info.emoji}-${safeChannelName(
          interaction.user.username
        )}`,
      type:
        ChannelType.GuildText,
      parent:
        category.id,
      topic:
        buildTicketTopic({
          owner:
            interaction.user.id,
          type,
          created,
          claimed: ""
        }),
      permissionOverwrites
    });

  await channel.send({
    content:
      staffRoleId
        ? `<@&${staffRoleId}>`
        : undefined,

    embeds: [
      new EmbedBuilder()
        .setColor(
          type === "staff_test"
            ? "Purple"
            : "Blue"
        )
        .setTitle(
          `${info.emoji} ${info.name}`
        )
        .setDescription(
          [
            `שלום ${interaction.user}, הטיקט נפתח בהצלחה.`,
            "",
            `📌 **סוג:** ${info.name}`,
            `📝 ${info.description}`,
            "",
            "כתוב כאן את כל הפרטים הרלוונטיים והצוות יגיע בהקדם."
          ].join("\n")
        )
        .setThumbnail(
          interaction.user.displayAvatarURL({
            size: 256
          })
        )
        .setFooter({
          text:
            "NoaBop • Ticket System"
        })
        .setTimestamp()
    ],

    components:
      ticketControls(null),

    allowedMentions: {
      roles:
        staffRoleId
          ? [staffRoleId]
          : []
    }
  });

  if (type === "staff_test") {
    await channel.send({
      embeds:
        staffExamEmbeds()
    });
  }

  return interaction.reply({
    content:
      `✅ הטיקט נפתח: ${channel}`,
    flags:
      MessageFlags.Ephemeral
  });
}

async function createTranscript(channel) {
  const messages = [];
  let before = null;

  while (true) {
    const batch =
      await channel.messages.fetch({
        limit: 100,
        before
      });

    if (!batch.size) {
      break;
    }

    messages.push(
      ...batch.values()
    );

    before =
      batch.last().id;

    if (batch.size < 100) {
      break;
    }
  }

  messages.sort(
    (a, b) =>
      a.createdTimestamp -
      b.createdTimestamp
  );

  const lines = [
    "NoaBop Ticket Transcript",
    `Channel: #${channel.name}`,
    `Channel ID: ${channel.id}`,
    ""
  ];

  for (const message of messages) {
    lines.push(
      `[${message.createdAt.toLocaleString()}] ${message.author.tag}: ${message.content || "[No text]"}`
    );

    for (
      const attachment
      of message.attachments.values()
    ) {
      lines.push(
        `Attachment: ${attachment.url}`
      );
    }
  }

  return Buffer.from(
    lines.join("\n"),
    "utf8"
  );
}

// =====================
// CHAT MUTE
// =====================

function timerKey(
  guildId,
  userId
) {
  return `${guildId}:${userId}`;
}

async function removeChatMute(
  guildId,
  userId,
  reason
) {
  const guild =
    client.guilds.cache.get(
      guildId
    );

  if (!guild) {
    return;
  }

  const member =
    await guild.members
      .fetch(userId)
      .catch(() => null);

  const role =
    config.muteRoleId
      ? await guild.roles
          .fetch(
            config.muteRoleId
          )
          .catch(() => null)
      : null;

  if (member && role) {
    await member.roles
      .remove(
        role,
        reason
      )
      .catch(() => {});
  }

  delete chatMuteTimers.timers[
    timerKey(
      guildId,
      userId
    )
  ];

  saveChatMuteTimers();
}

function scheduleChatMuteTimer(
  guildId,
  userId,
  expiresAt
) {
  const delay =
    Math.max(
      0,
      expiresAt -
      Date.now()
    );

  setTimeout(
    () => {
      removeChatMute(
        guildId,
        userId,
        "NoaBop Chat Mute expired"
      ).catch(
        console.error
      );
    },
    Math.min(
      delay,
      2_147_000_000
    )
  );
}

async function restoreChatMuteTimers() {
  for (
    const timer
    of Object.values(
      chatMuteTimers.timers
    )
  ) {
    if (
      !timer ||
      !timer.guildId ||
      !timer.userId
    ) {
      continue;
    }

    if (
      timer.expiresAt &&
      timer.expiresAt <=
        Date.now()
    ) {
      await removeChatMute(
        timer.guildId,
        timer.userId,
        "NoaBop Chat Mute expired while offline"
      );

      continue;
    }

    if (timer.expiresAt) {
      scheduleChatMuteTimer(
        timer.guildId,
        timer.userId,
        timer.expiresAt
      );
    }
  }
}

async function sendModLog(
  guild,
  embed
) {
  if (!config.modLogsChannelId) {
    return;
  }

  const channel =
    guild.channels.cache.get(
      config.modLogsChannelId
    );

  if (
    channel &&
    channel.isTextBased()
  ) {
    await channel.send({
      embeds: [embed]
    }).catch(() => {});
  }
}

// =====================
// HELP + STAFF STATS
// =====================

const activeVoice =
  new Map();

async function helpPanel(
  guild,
  requester,
  createdAt,
  reason
) {
  const buffer =
    await createHelpCard(
      guild,
      requester,
      createdAt,
      reason,
      null
    );

  return {
    files: [
      new AttachmentBuilder(
        buffer,
        {
          name:
            "noabop-help-center.png"
        }
      )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `help_claim:${requester.id}:${createdAt}`
            )
            .setLabel("בטיפול")
            .setEmoji("🛡️")
            .setStyle(
              ButtonStyle.Primary
            )
        )
    ]
  };
}

function liveVoiceMs(
  guildId,
  userId,
  storedMs
) {
  const key =
    `${guildId}:${userId}`;

  const started =
    activeVoice.get(key);

  return (
    Number(storedMs || 0) +
    (
      started
        ? Date.now() - started
        : 0
    )
  );
}

async function sendStats(
  message,
  target
) {
  const profile =
    getStaffProfile(
      message.guild.id,
      target.id
    );

  const voiceMs =
    liveVoiceMs(
      message.guild.id,
      target.id,
      profile.voiceMs
    );

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor("Purple")
        .setTitle(
          `📊 Staff Stats • ${target.user.username}`
        )
        .setThumbnail(
          target.user.displayAvatarURL({
            size: 256
          })
        )
        .addFields(
          {
            name:
              "🎙️ זמן בשיחות",
            value:
              formatVoiceTime(
                voiceMs
              ),
            inline: true
          },
          {
            name:
              "💬 הודעות",
            value:
              String(
                profile.messages
              ),
            inline: true
          },
          {
            name:
              "🆘 Helps Taken",
            value:
              String(
                profile.helpsTaken
              ),
            inline: true
          },
          {
            name:
              "🎟️ Tickets Taken",
            value:
              String(
                profile.ticketsTaken
              ),
            inline: true
          },
          {
            name:
              "⚡ ממוצע תגובה ל־Help",
            value:
              averageResponse(
                profile.totalHelpResponseMs,
                profile.helpsTaken
              ),
            inline: true
          },
          {
            name:
              "⚡ ממוצע Claim לטיקט",
            value:
              averageResponse(
                profile.totalTicketClaimMs,
                profile.ticketsTaken
              ),
            inline: true
          }
        )
        .setFooter({
          text:
            "NoaBop • Staff Stats"
        })
        .setTimestamp()
    ]
  });
}

// =====================
// READY
// =====================

client.once(
  Events.ClientReady,
  async readyClient => {
    console.log(
      `✅ NoaBop online as ${readyClient.user.tag}`
    );

    await restoreChatMuteTimers();

    for (
      const guild
      of readyClient.guilds.cache.values()
    ) {
      for (
        const channel
        of guild.channels.cache.values()
      ) {
        if (
          channel.type !==
          ChannelType.GuildVoice
        ) {
          continue;
        }

        for (
          const member
          of channel.members.values()
        ) {
          if (
            hasStaffAccess(
              member,
              guild
            )
          ) {
            activeVoice.set(
              `${guild.id}:${member.id}`,
              Date.now()
            );
          }
        }
      }
    }
  }
);

// =====================
// WELCOME EVENT
// =====================

client.on(
  Events.GuildMemberAdd,
  async member => {
    try {
      const channel =
        getWelcomeChannel(
          member.guild
        );

      if (!channel) {
        return;
      }

      const buffer =
        await createWelcomeCard(
          member
        );

      await channel.send({
        content:
          `${member}`,

        files: [
          new AttachmentBuilder(
            buffer,
            {
              name:
                "noabop-welcome.png"
            }
          )
        ]
      });
    } catch (error) {
      console.error(
        "❌ Welcome error:",
        error
      );
    }
  }
);

// =====================
// VOICE STATS
// =====================

client.on(
  Events.VoiceStateUpdate,
  (
    oldState,
    newState
  ) => {
    const member =
      newState.member ||
      oldState.member;

    if (
      !member ||
      !hasStaffAccess(
        member,
        member.guild
      )
    ) {
      return;
    }

    const key =
      `${member.guild.id}:${member.id}`;

    const wasInVoice =
      Boolean(
        oldState.channelId
      );

    const isInVoice =
      Boolean(
        newState.channelId
      );

    if (
      !wasInVoice &&
      isInVoice
    ) {
      activeVoice.set(
        key,
        Date.now()
      );

      return;
    }

    if (
      wasInVoice &&
      !isInVoice
    ) {
      const started =
        activeVoice.get(key);

      activeVoice.delete(key);

      if (started) {
        const profile =
          getStaffProfile(
            member.guild.id,
            member.id
          );

        profile.voiceMs +=
          Date.now() -
          started;

        saveStaffStats();
      }
    }
  }
);

// =====================
// MESSAGE COMMANDS
// =====================

client.on(
  Events.MessageCreate,
  async message => {
    if (
      !message.guild ||
      message.author.bot
    ) {
      return;
    }

    if (
      message.member &&
      hasStaffAccess(
        message.member,
        message.guild
      )
    ) {
      const profile =
        getStaffProfile(
          message.guild.id,
          message.author.id
        );

      profile.messages += 1;
      saveStaffStats();
    }

    const content =
      message.content.trim();

    if (
      content === "!h" ||
      content.startsWith("!h ")
    ) {
      const createdAt =
        Date.now();

      const reason =
        content.length > 2
          ? content
              .slice(2)
              .trim()
          : "בקשת עזרה חדשה";

      return message.reply(
        await helpPanel(
          message.guild,
          message.author,
          createdAt,
          reason
        )
      );
    }

    if (
      content.startsWith(
        "!stats"
      )
    ) {
      if (
        !hasStaffAccess(
          message.member,
          message.guild
        )
      ) {
        return message.reply(
          "❌ `!stats` מיועד לצוות בלבד."
        );
      }

      const target =
        message.mentions.members
          .first() ||
        message.member;

      if (
        !hasStaffAccess(
          target,
          message.guild
        )
      ) {
        return message.reply(
          "❌ אפשר לראות Stats רק של אנשי צוות."
        );
      }

      return sendStats(
        message,
        target
      );
    }
  }
);

// =====================
// INTERACTIONS
// =====================

client.on(
  Events.InteractionCreate,
  async interaction => {
    try {
      // ---------- SLASH ----------

      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "ping"
        ) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor("Green")
                .setTitle(
                  "🏓 Pong!"
                )
                .addFields(
                  {
                    name:
                      "Bot Latency",
                    value:
                      `${Date.now() - interaction.createdTimestamp}ms`,
                    inline: true
                  },
                  {
                    name:
                      "Discord WS",
                    value:
                      `${Math.round(client.ws.ping)}ms`,
                    inline: true
                  }
                )
            ]
          });
        }

        if (
          interaction.commandName ===
          "verify-panel"
        ) {
          if (
            !canSetupPanels(
              interaction.member,
              interaction.guild
            )
          ) {
            return interaction.reply({
              content:
                "❌ אין לך גישה.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          if (!config.memberRoleId) {
            return interaction.reply({
              content:
                "❌ חסר `memberRoleId` ב־config.js.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          await interaction.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor("Green")
                .setTitle(
                  "✅ NoaBop • Verify"
                )
                .setDescription(
                  [
                    "ברוכים הבאים לשרת!",
                    "",
                    "לחצו על **Verify** כדי לקבל את רול ה־Member ולקבל גישה לשרת.",
                    "",
                    "אין מספרים ואין שאלות — לחיצה אחת וזהו."
                  ].join("\n")
                )
                .setThumbnail(
                  interaction.guild.iconURL({
                    size: 256
                  })
                )
                .setFooter({
                  text:
                    "NoaBop • Verification System"
                })
                .setTimestamp()
            ],

            components: [
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId(
                      "verify_member"
                    )
                    .setLabel("Verify")
                    .setEmoji("✅")
                    .setStyle(
                      ButtonStyle.Success
                    )
                )
            ]
          });

          return interaction.reply({
            content:
              "✅ פאנל ה־Verify נשלח.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          interaction.commandName ===
          "ticket-panel"
        ) {
          if (
            !canSetupPanels(
              interaction.member,
              interaction.guild
            )
          ) {
            return interaction.reply({
              content:
                "❌ אין לך גישה.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          await interaction.channel.send(
            await ticketPanel(
              interaction.guild
            )
          );

          return interaction.reply({
            content:
              "✅ פאנל הטיקטים נשלח.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          interaction.commandName ===
          "staff-panel"
        ) {
          if (
            !canSetupPanels(
              interaction.member,
              interaction.guild
            )
          ) {
            return interaction.reply({
              content:
                "❌ אין לך גישה.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          await interaction.channel.send(
            await staffApplicationPanel(
              interaction.guild
            )
          );

          return interaction.reply({
            content:
              "✅ פאנל Apply For Staff נשלח.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          interaction.commandName ===
          "setup-take-role"
        ) {
          if (
            !canSetupPanels(
              interaction.member,
              interaction.guild
            )
          ) {
            return interaction.reply({
              content:
                "❌ אין לך גישה.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          try {
            const panel =
              await buildTakeRolePanel(
                interaction.guild
              );

            await interaction.channel.send(
              panel
            );

            return interaction.reply({
              content:
                "✅ פאנל Take Role נשלח.",
              flags:
                MessageFlags.Ephemeral
            });
          } catch (error) {
            if (
              error.message ===
              "NO_TAKE_ROLES"
            ) {
              return interaction.reply({
                content:
                  "❌ אין רולים תקינים ב־`takeRoleIds` ב־config.js.",
                flags:
                  MessageFlags.Ephemeral
              });
            }

            throw error;
          }
        }

        if (
          interaction.commandName ===
          "chatmute"
        ) {
          if (
            !hasStaffAccess(
              interaction.member,
              interaction.guild
            )
          ) {
            return interaction.reply({
              content:
                "❌ הפקודה מיועדת לצוות בלבד.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          if (!config.muteRoleId) {
            return interaction.reply({
              content:
                "❌ חסר `muteRoleId` ב־config.js.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          const subcommand =
            interaction.options
              .getSubcommand();

          const user =
            interaction.options
              .getUser("user");

          const member =
            await interaction.guild.members
              .fetch(
                user.id
              )
              .catch(() => null);

          const role =
            await interaction.guild.roles
              .fetch(
                config.muteRoleId
              )
              .catch(() => null);

          if (
            !member ||
            !role
          ) {
            return interaction.reply({
              content:
                "❌ המשתמש או רול ה־Mute לא נמצא.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          const botMember =
            await interaction.guild.members
              .fetchMe();

          if (
            !botMember.permissions.has(
              PermissionFlagsBits.ManageRoles
            ) ||
            role.position >=
              botMember.roles.highest.position
          ) {
            return interaction.reply({
              content:
                "❌ הבוט לא יכול לנהל את רול ה־Mute.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          if (
            subcommand ===
            "add"
          ) {
            const durationValue =
              interaction.options
                .getString(
                  "duration"
                );

            const duration =
              durationValue ===
              "permanent"
                ? null
                : parseDuration(
                    durationValue
                  );

            const reason =
              interaction.options
                .getString(
                  "reason"
                ) ||
              "לא צוינה סיבה";

            await member.roles.add(
              role,
              `${reason} | NoaBop Chat Mute by ${interaction.user.tag}`
            );

            const key =
              timerKey(
                interaction.guild.id,
                user.id
              );

            delete chatMuteTimers
              .timers[key];

            if (duration) {
              const expiresAt =
                Date.now() +
                duration;

              chatMuteTimers
                .timers[key] = {
                  guildId:
                    interaction.guild.id,
                  userId:
                    user.id,
                  expiresAt
                };

              scheduleChatMuteTimer(
                interaction.guild.id,
                user.id,
                expiresAt
              );
            }

            saveChatMuteTimers();

            await sendModLog(
              interaction.guild,
              new EmbedBuilder()
                .setColor("Orange")
                .setTitle(
                  "🔇 Chat Mute"
                )
                .addFields(
                  {
                    name: "משתמש",
                    value: `${user}`,
                    inline: true
                  },
                  {
                    name: "צוות",
                    value:
                      `${interaction.user}`,
                    inline: true
                  },
                  {
                    name: "זמן",
                    value:
                      formatDuration(
                        duration
                      ),
                    inline: true
                  },
                  {
                    name: "סיבה",
                    value: reason
                  }
                )
                .setTimestamp()
            );

            return interaction.reply({
              content:
                `✅ ${user} קיבל Chat Mute ל־**${formatDuration(duration)}**.`,
              flags:
                MessageFlags.Ephemeral
            });
          }

          if (
            subcommand ===
            "remove"
          ) {
            const reason =
              interaction.options
                .getString(
                  "reason"
                ) ||
              "הוסר ידנית";

            await member.roles
              .remove(
                role,
                `${reason} | NoaBop Chat Unmute by ${interaction.user.tag}`
              )
              .catch(() => {});

            delete chatMuteTimers
              .timers[
                timerKey(
                  interaction.guild.id,
                  user.id
                )
              ];

            saveChatMuteTimers();

            await sendModLog(
              interaction.guild,
              new EmbedBuilder()
                .setColor("Green")
                .setTitle(
                  "🔊 Chat Mute Removed"
                )
                .addFields(
                  {
                    name: "משתמש",
                    value: `${user}`,
                    inline: true
                  },
                  {
                    name: "צוות",
                    value:
                      `${interaction.user}`,
                    inline: true
                  },
                  {
                    name: "סיבה",
                    value: reason
                  }
                )
                .setTimestamp()
            );

            return interaction.reply({
              content:
                `✅ ה־Chat Mute של ${user} הוסר.`,
              flags:
                MessageFlags.Ephemeral
            });
          }
        }
      }

      // ---------- VERIFY ----------

      if (
        interaction.isButton() &&
        interaction.customId ===
          "verify_member"
      ) {
        if (!config.memberRoleId) {
          return interaction.reply({
            content:
              "❌ חסר `memberRoleId` ב־config.js.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const member =
          await interaction.guild.members
            .fetch(
              interaction.user.id
            )
            .catch(() => null);

        const role =
          await interaction.guild.roles
            .fetch(
              config.memberRoleId
            )
            .catch(() => null);

        const botMember =
          await interaction.guild.members
            .fetchMe()
            .catch(() => null);

        if (
          !member ||
          !role ||
          !botMember
        ) {
          return interaction.reply({
            content:
              "❌ לא הצלחתי לטעון את המשתמש, הרול או הבוט.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          member.roles.cache.has(
            role.id
          )
        ) {
          return interaction.reply({
            content:
              "✅ אתה כבר מאומת.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          role.managed ||
          !botMember.permissions.has(
            PermissionFlagsBits.ManageRoles
          ) ||
          role.position >=
            botMember.roles.highest.position
        ) {
          return interaction.reply({
            content:
              "❌ הבוט לא יכול לתת את רול ה־Member. ודא שיש `Manage Roles` ושרול NoaBop מעל Member.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        await member.roles.add(
          role,
          "NoaBop Verify"
        );

        return interaction.reply({
          content:
            "✅ אומתת בהצלחה! קיבלת את רול ה־Member.",
          flags:
            MessageFlags.Ephemeral
        });
      }

      // ---------- TAKE ROLE ----------

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "take_role:"
        )
      ) {
        const roleId =
          interaction.customId.split(
            ":"
          )[1];

        if (
          !Array.isArray(
            config.takeRoleIds
          ) ||
          !config.takeRoleIds.includes(
            roleId
          )
        ) {
          return interaction.reply({
            content:
              "❌ הרול הזה כבר לא מוגדר בפאנל.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const member =
          await interaction.guild.members
            .fetch(
              interaction.user.id
            );

        const role =
          await interaction.guild.roles
            .fetch(roleId)
            .catch(() => null);

        if (
          !role ||
          role.managed
        ) {
          return interaction.reply({
            content:
              "❌ הרול לא נמצא או שאי אפשר לתת אותו ידנית.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const botMember =
          await interaction.guild.members
            .fetchMe();

        if (
          !botMember.permissions.has(
            PermissionFlagsBits.ManageRoles
          ) ||
          role.position >=
            botMember.roles.highest.position
        ) {
          return interaction.reply({
            content:
              "❌ רול NoaBop חייב להיות מעל הרול הזה וצריך `Manage Roles`.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          member.roles.cache.has(
            role.id
          )
        ) {
          await member.roles.remove(
            role,
            "NoaBop Take Role"
          );

          return interaction.reply({
            content:
              `➖ הרול **${role.name}** הוסר.`,
            flags:
              MessageFlags.Ephemeral
          });
        }

        await member.roles.add(
          role,
          "NoaBop Take Role"
        );

        return interaction.reply({
          content:
            `✅ קיבלת את הרול **${role.name}**.`,
          flags:
            MessageFlags.Ephemeral
        });
      }

      // ---------- OPEN TICKET ----------

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "ticket_open:"
        )
      ) {
        const type =
          interaction.customId.split(
            ":"
          )[1];

        return openTicket(
          interaction,
          type
        );
      }

      if (
        interaction.isButton() &&
        interaction.customId ===
          "staff_apply"
      ) {
        return openTicket(
          interaction,
          "staff_test"
        );
      }

      // ---------- HELP CLAIM ----------

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "help_claim:"
        )
      ) {
        if (
          !hasStaffAccess(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ רק צוות יכול לקחת Help.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const [
          ,
          requesterId,
          createdAtText
        ] =
          interaction.customId.split(
            ":"
          );

        const createdAt =
          Number(
            createdAtText
          );

        const profile =
          getStaffProfile(
            interaction.guild.id,
            interaction.user.id
          );

        profile.helpsTaken += 1;

        if (
          Number.isFinite(
            createdAt
          )
        ) {
          profile.totalHelpResponseMs +=
            Math.max(
              0,
              Date.now() -
              createdAt
            );
        }

        saveStaffStats();

        const requester =
          await interaction.client.users
            .fetch(requesterId)
            .catch(() => null);

        const buffer =
          requester
            ? await createHelpCard(
                interaction.guild,
                requester,
                createdAt,
                "בקשת עזרה חדשה",
                interaction.user
              )
            : null;

        const updatePayload = {
          components: [
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    `help_claimed:${interaction.user.id}`
                  )
                  .setLabel(
                    `בטיפול • ${interaction.user.username}`
                  )
                  .setEmoji("✅")
                  .setStyle(
                    ButtonStyle.Success
                  )
                  .setDisabled(true)
              )
          ]
        };

        if (buffer) {
          updatePayload.attachments = [];
          updatePayload.files = [
            new AttachmentBuilder(
              buffer,
              {
                name:
                  "noabop-help-center-claimed.png"
              }
            )
          ];
        }

        return interaction.update(
          updatePayload
        );
      }

      // ---------- TICKET CLAIM ----------

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_claim"
      ) {
        if (
          !hasStaffAccess(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ רק צוות יכול לקחת טיקט.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const data =
          parseTicketTopic(
            interaction.channel
          );

        if (data.claimed) {
          return interaction.reply({
            content:
              `❌ הטיקט כבר נלקח על ידי <@${data.claimed}>.`,
            flags:
              MessageFlags.Ephemeral
          });
        }

        data.claimed =
          interaction.user.id;

        await interaction.channel
          .setTopic(
            buildTicketTopic({
              owner:
                data.owner,
              type:
                data.type,
              created:
                data.created,
              claimed:
                data.claimed
            })
          );

        const profile =
          getStaffProfile(
            interaction.guild.id,
            interaction.user.id
          );

        profile.ticketsTaken += 1;

        const createdAt =
          Number(
            data.created
          );

        if (
          Number.isFinite(
            createdAt
          )
        ) {
          profile.totalTicketClaimMs +=
            Math.max(
              0,
              Date.now() -
              createdAt
            );
        }

        saveStaffStats();

        return interaction.update({
          embeds:
            interaction.message.embeds,
          components:
            ticketControls(
              interaction.user.id
            )
        });
      }

      // ---------- TICKET RELEASE ----------

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_release"
      ) {
        if (
          !hasStaffAccess(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ רק צוות יכול לשחרר טיקט.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const data =
          parseTicketTopic(
            interaction.channel
          );

        if (
          data.claimed &&
          data.claimed !==
            interaction.user.id &&
          !interaction.member.permissions.has(
            PermissionFlagsBits.Administrator
          )
        ) {
          return interaction.reply({
            content:
              "❌ רק מי שלקח את הטיקט או Administrator יכול לשחרר אותו.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        data.claimed = "";

        await interaction.channel
          .setTopic(
            buildTicketTopic({
              owner:
                data.owner,
              type:
                data.type,
              created:
                data.created,
              claimed: ""
            })
          );

        return interaction.update({
          embeds:
            interaction.message.embeds,
          components:
            ticketControls(null)
        });
      }

      // ---------- ADD USER ----------

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_add_user"
      ) {
        if (
          !hasStaffAccess(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ רק צוות יכול להוסיף משתמש.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const modal =
          new ModalBuilder()
            .setCustomId(
              "ticket_add_user_modal"
            )
            .setTitle(
              "Add User"
            );

        const input =
          new TextInputBuilder()
            .setCustomId(
              "user_id"
            )
            .setLabel(
              "User ID"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(input)
        );

        return interaction.showModal(
          modal
        );
      }

      // ---------- REMOVE USER ----------

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_remove_user"
      ) {
        if (
          !hasStaffAccess(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ רק צוות יכול להסיר משתמש.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const modal =
          new ModalBuilder()
            .setCustomId(
              "ticket_remove_user_modal"
            )
            .setTitle(
              "Remove User"
            );

        const input =
          new TextInputBuilder()
            .setCustomId(
              "user_id"
            )
            .setLabel(
              "User ID"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(input)
        );

        return interaction.showModal(
          modal
        );
      }

      // ---------- CLOSE ----------

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_close"
      ) {
        if (
          !hasStaffAccess(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ רק צוות יכול לסגור טיקט.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const modal =
          new ModalBuilder()
            .setCustomId(
              "ticket_close_modal"
            )
            .setTitle(
              "Close Ticket"
            );

        const input =
          new TextInputBuilder()
            .setCustomId(
              "reason"
            )
            .setLabel(
              "סיבת סגירה"
            )
            .setStyle(
              TextInputStyle.Paragraph
            )
            .setMaxLength(500)
            .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(input)
        );

        return interaction.showModal(
          modal
        );
      }

      // ---------- MODALS ----------

      if (
        interaction.isModalSubmit()
      ) {
        if (
          interaction.customId ===
          "ticket_add_user_modal"
        ) {
          const userId =
            interaction.fields
              .getTextInputValue(
                "user_id"
              )
              .trim();

          if (
            !/^\d{17,20}$/.test(
              userId
            )
          ) {
            return interaction.reply({
              content:
                "❌ User ID לא תקין.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          const member =
            await interaction.guild.members
              .fetch(userId)
              .catch(() => null);

          if (!member) {
            return interaction.reply({
              content:
                "❌ המשתמש לא נמצא בשרת.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          await interaction.channel
            .permissionOverwrites.edit(
              member.id,
              {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
                EmbedLinks: true
              }
            );

          return interaction.reply({
            content:
              `✅ ${member} נוסף לטיקט.`,
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          interaction.customId ===
          "ticket_remove_user_modal"
        ) {
          const userId =
            interaction.fields
              .getTextInputValue(
                "user_id"
              )
              .trim();

          const data =
            parseTicketTopic(
              interaction.channel
            );

          if (
            userId ===
            data.owner
          ) {
            return interaction.reply({
              content:
                "❌ אי אפשר להסיר את פותח הטיקט.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          await interaction.channel
            .permissionOverwrites
            .delete(userId)
            .catch(() => {});

          return interaction.reply({
            content:
              `✅ <@${userId}> הוסר מהטיקט.`,
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          interaction.customId ===
          "ticket_close_modal"
        ) {
          const reason =
            interaction.fields
              .getTextInputValue(
                "reason"
              );

          const channel =
            interaction.channel;

          const data =
            parseTicketTopic(
              channel
            );

          await interaction.reply({
            content:
              "🔒 סוגר את הטיקט ושומר Transcript...",
            flags:
              MessageFlags.Ephemeral
          });

          const transcript =
            await createTranscript(
              channel
            ).catch(() => null);

          const logs =
            config.ticketLogsChannelId
              ? interaction.guild.channels.cache.get(
                  config.ticketLogsChannelId
                )
              : null;

          if (
            logs &&
            logs.isTextBased()
          ) {
            const files = [];

            if (transcript) {
              files.push(
                new AttachmentBuilder(
                  transcript,
                  {
                    name:
                      `${channel.name}-transcript.txt`
                  }
                )
              );
            }

            await logs.send({
              embeds: [
                new EmbedBuilder()
                  .setColor("Red")
                  .setTitle(
                    "🔒 Ticket Closed"
                  )
                  .addFields(
                    {
                      name:
                        "פותח הטיקט",
                      value:
                        data.owner
                          ? `<@${data.owner}>`
                          : "לא ידוע",
                      inline: true
                    },
                    {
                      name:
                        "נסגר על ידי",
                      value:
                        `${interaction.user}`,
                      inline: true
                    },
                    {
                      name:
                        "סיבה",
                      value:
                        reason
                    }
                  )
                  .setTimestamp()
              ],
              files
            }).catch(() => {});
          }

          setTimeout(
            () => {
              channel.delete(
                `Closed by ${interaction.user.tag}`
              ).catch(() => {});
            },
            2000
          );

          return;
        }
      }
    } catch (error) {
      console.error(
        "❌ Interaction error:",
        error
      );

      if (
        interaction.isRepliable()
      ) {
        const payload = {
          content:
            "❌ קרתה שגיאה. בדוק את הלוגים.",
          flags:
            MessageFlags.Ephemeral
        };

        if (
          interaction.replied ||
          interaction.deferred
        ) {
          await interaction
            .followUp(payload)
            .catch(() => {});
        } else {
          await interaction
            .reply(payload)
            .catch(() => {});
        }
      }
    }
  }
);

// =====================
// ERRORS + LOGIN
// =====================

client.on(
  "error",
  error => {
    console.error(
      "❌ Discord client error:",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "❌ Unhandled rejection:",
      error
    );
  }
);

async function loginWithRetry() {
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      console.log(
        `🔌 Discord login attempt ${attempt}...`
      );

      await client.login(
        process.env.TOKEN
      );

      return;
    } catch (error) {
      console.error(
        "❌ Discord login error:",
        error
      );

      const delay =
        Math.min(
          60000,
          attempt * 10000
        );

      console.log(
        `🔁 Retrying in ${delay / 1000}s...`
      );

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            delay
          )
      );
    }
  }
}

loginWithRetry();
