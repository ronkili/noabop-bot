require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder
} = require("discord.js");

const { createCanvas, loadImage } = require("@napi-rs/canvas");

const config = require("./config");

// =====================
// DATA
// =====================

const DATA_DIR =
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  path.join(__dirname, "data");

fs.mkdirSync(DATA_DIR, { recursive: true });

const XP_FILE = path.join(DATA_DIR, "xp.json");
const WARNS_FILE = path.join(DATA_DIR, "warns.json");
const TIMERS_FILE = path.join(DATA_DIR, "mod-timers.json");
const VOICE_FILE = path.join(DATA_DIR, "voice-time.json");
const STAFF_STATS_FILE = path.join(DATA_DIR, "staff-stats.json");

function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      return structuredClone(fallback);
    }

    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`❌ Failed loading ${file}:`, error);
    return structuredClone(fallback);
  }
}

function saveJson(file, data) {
  try {
    fs.writeFileSync(
      file,
      JSON.stringify(data, null, 2)
    );
  } catch (error) {
    console.error(`❌ Failed saving ${file}:`, error);
  }
}

const xpData = loadJson(XP_FILE, { guilds: {} });
const warnsData = loadJson(WARNS_FILE, { guilds: {} });
const modTimers = loadJson(TIMERS_FILE, {});
const voiceData = loadJson(VOICE_FILE, { guilds: {} });
const staffStatsData = loadJson(STAFF_STATS_FILE, { guilds: {} });

const messageXpCooldowns = new Map();
const casinoCooldowns = new Map();
const blackjackGames = new Map();
const activeVoiceSessions = new Map();
const xpPurchaseLocks = new Set();

// =====================
// CLIENT
// =====================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

// =====================
// GENERAL
// =====================

function isStaff(member) {
  return Boolean(
    config.staffRoleId &&
    member?.roles?.cache?.has(config.staffRoleId)
  );
}

function canSendSetupPanels(member, guild) {
  return Boolean(
    isStaff(member) ||
    member?.id === guild?.ownerId ||
    member?.permissions?.has(
      PermissionFlagsBits.Administrator
    ) ||
    member?.permissions?.has(
      PermissionFlagsBits.ManageGuild
    )
  );
}

function randomInt(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

function parseDuration(value, maxDays = 28) {
  const match = String(value || "")
    .trim()
    .toLowerCase()
    .match(/^(\d+)(s|m|h|d)$/);

  if (!match) return null;

  const amount = Number(match[1]);

  const units = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  const ms = amount * units[match[2]];

  if (
    ms < 10 * 1000 ||
    ms > maxDays * 24 * 60 * 60 * 1000
  ) {
    return null;
  }

  return ms;
}

function formatDuration(ms) {
  const seconds = Math.floor(Number(ms || 0) / 1000);

  if (seconds >= 86400 && seconds % 86400 === 0) {
    return `${seconds / 86400}d`;
  }

  if (seconds >= 3600 && seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }

  if (seconds >= 60 && seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }

  return `${seconds}s`;
}

async function fetchMember(guild, userId) {
  return guild.members.fetch(userId).catch(() => null);
}

async function sendModLog(guild, embed) {
  if (!config.modLogsChannelId) return;

  const channel = await guild.channels
    .fetch(config.modLogsChannelId)
    .catch(() => null);

  if (!channel?.isTextBased()) return;

  await channel.send({ embeds: [embed] }).catch(() => {});
}

function modEmbed(title, color, fields) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(fields)
    .setTimestamp();
}

// =====================
// LEGACY PREFIX CLEANUP
// =====================

// The automatic prefix system was removed.
// This only cleans old prefixes that may already exist in nicknames.
const LEGACY_ROLE_PREFIXES = [
  "VIP",
  "HR",
  "GR",
  "MOD",
  "SMD",
  "SV",
  "CA",
  "AD",
  "SA",
  "AR",
  "DEV",
  "SM",
  "CO"
];

function stripLegacyPrefix(name) {
  let result =
    String(name || "").trim();

  for (
    const prefix of
    LEGACY_ROLE_PREFIXES
  ) {
    const escaped =
      prefix.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    result =
      result.replace(
        new RegExp(
          `^${escaped}\\s*\\|\\s*`,
          "i"
        ),
        ""
      );
  }

  return result.trim();
}

async function cleanupLegacyPrefixNickname(member) {
  if (
    !member ||
    member.user?.bot ||
    !member.nickname
  ) {
    return;
  }

  const cleaned =
    stripLegacyPrefix(
      member.nickname
    );

  if (
    cleaned === member.nickname ||
    !cleaned
  ) {
    return;
  }

  const botMember =
    member.guild.members.me ||
    await member.guild.members
      .fetchMe()
      .catch(() => null);

  if (
    !botMember ||
    !botMember.permissions.has(
      PermissionFlagsBits.ManageNicknames
    ) ||
    member.id ===
      member.guild.ownerId ||
    member.roles.highest.position >=
      botMember.roles.highest.position
  ) {
    return;
  }

  await member.setNickname(
    cleaned.slice(0, 32),
    "Noabop legacy prefix cleanup"
  ).catch(error => {
    console.error(
      `⚠️ Could not clean old prefix for ${member.user.tag}:`,
      error
    );
  });
}

async function cleanupLegacyPrefixes() {
  for (
    const guild of
    client.guilds.cache.values()
  ) {
    const members =
      await guild.members
        .fetch()
        .catch(() => null);

    if (!members) {
      continue;
    }

    for (
      const member of
      members.values()
    ) {
      await cleanupLegacyPrefixNickname(
        member
      );
    }
  }
}


// =====================
// XP
// =====================

function getGuildXp(guildId) {
  if (!xpData.guilds[guildId]) {
    xpData.guilds[guildId] = { users: {} };
  }

  if (!xpData.guilds[guildId].users) {
    xpData.guilds[guildId].users = {};
  }

  return xpData.guilds[guildId];
}

function getXpProfile(guildId, userId) {
  const guildData = getGuildXp(guildId);

  if (!guildData.users[userId]) {
    guildData.users[userId] = {
      xp: 0,
      messages: 0,
      lastDailyAt: 0
    };
  }

  const profile = guildData.users[userId];

  profile.xp = Math.max(0, Number(profile.xp || 0));
  profile.messages = Math.max(0, Number(profile.messages || 0));
  profile.lastDailyAt = Math.max(0, Number(profile.lastDailyAt || 0));

  return profile;
}

function saveXp() {
  saveJson(XP_FILE, xpData);
}

function changeXp(guildId, userId, amount) {
  const profile = getXpProfile(guildId, userId);

  profile.xp = Math.max(
    0,
    profile.xp + Number(amount || 0)
  );

  saveXp();
  return profile.xp;
}

function casinoCheck(guildId, userId, bet) {
  const amount = Number(bet);

  if (!Number.isInteger(amount) || amount <= 0) {
    return {
      ok: false,
      message: "❌ סכום ה־XP חייב להיות מספר שלם וחיובי."
    };
  }

  const maxBet = Number(config.maxCasinoBet || 1000);

  if (amount > maxBet) {
    return {
      ok: false,
      message:
        `❌ המקסימום למשחק הוא **${maxBet.toLocaleString("en-US")} XP**.`
    };
  }

  const profile = getXpProfile(guildId, userId);

  if (profile.xp < amount) {
    return {
      ok: false,
      message: "❌ אין לך מספיק XP."
    };
  }

  const key = `${guildId}:${userId}`;
  const cooldownMs = Number(config.casinoCooldownMs || 5000);
  const last = casinoCooldowns.get(key) || 0;
  const left = cooldownMs - (Date.now() - last);

  if (left > 0) {
    return {
      ok: false,
      message:
        `⏳ חכה עוד **${Math.ceil(left / 1000)} שניות** לפני משחק נוסף.`
    };
  }

  casinoCooldowns.set(key, Date.now());

  return {
    ok: true,
    bet: amount
  };
}

function casinoInfoEmbed() {
  return new EmbedBuilder()
    .setColor("Gold")
    .setTitle("🎰 Noabop Casino")
    .setDescription(
      [
        "ברוכים הבאים לקזינו של **Noabop Bot**.",
        "",
        "💡 כל המשחקים משתמשים ב־**XP וירטואלי בלבד**.",
        "אין ל־XP ערך כספי, אי אפשר לקנות אותו ואין Cashout.",
        "",
        "**🎮 פקודות**",
        "`!xp` / `!balance` — יתרת XP",
        "`!daily` — בונוס יומי",
        "`!coinflip <xp> <heads/tails>`",
        "`!dice <xp> <1-6>`",
        "`!slots <xp>`",
        "`!roulette <xp> <red/black/green>`",
        "`!blackjack <xp>` — Blackjack עם כפתורי Hit / Stand",
        "`!leaderboard` — Top 10 XP",
        "`!casino` — המידע הזה",
        "",
        `💰 Max bet: **${Number(config.maxCasinoBet || 1000).toLocaleString("en-US")} XP**`
      ].join("\n")
    )
    .setFooter({
      text: "Noabop Casino • Virtual XP only"
    })
    .setTimestamp();
}

// =====================
// XP SHOP
// =====================

function getXpShopItems() {
  return Array.isArray(config.xpShop)
    ? config.xpShop
        .filter(item =>
          item &&
          item.key &&
          item.name &&
          item.roleId &&
          Number(item.price) > 0
        )
        .slice(0, 25)
    : [];
}

function buildXpShopPanel() {
  const items = getXpShopItems();

  if (!items.length) {
    return null;
  }

  const description = items
    .map(item =>
      `${item.emoji || "🎁"} **${item.name}** — **${Number(item.price).toLocaleString("en-US")} XP**`
    )
    .join("\n");

  const rows = [];

  for (let i = 0; i < items.length; i += 5) {
    const row = new ActionRowBuilder();

    row.addComponents(
      items.slice(i, i + 5).map(item =>
        new ButtonBuilder()
          .setCustomId(`xp_shop_buy:${item.key}`)
          .setLabel(
            `${item.name} • ${Number(item.price).toLocaleString("en-US")} XP`
          )
          .setEmoji(item.emoji || "🎁")
          .setStyle(ButtonStyle.Primary)
      )
    );

    rows.push(row);
  }

  return {
    embeds: [
      new EmbedBuilder()
        .setColor("Gold")
        .setTitle("🛒 Noabop XP Shop")
        .setDescription(
          [
            "קנה רולים בעזרת ה־XP הווירטואלי שלך.",
            "",
            description,
            "",
            "💡 ה־XP יורד רק אחרי שהרול ניתן בהצלחה."
          ].join("\n")
        )
        .setFooter({
          text: "Noabop XP Shop • Virtual XP only"
        })
        .setTimestamp()
    ],
    components: rows
  };
}

async function handleXpShopPurchase(interaction, itemKey) {
  const item = getXpShopItems()
    .find(shopItem =>
      shopItem.key === itemKey
    );

  if (!item) {
    return interaction.reply({
      content:
        "❌ הפריט הזה כבר לא קיים ב־XP Shop.",
      ephemeral: true
    });
  }

  const lockKey =
    `${interaction.guild.id}:${interaction.user.id}`;

  if (xpPurchaseLocks.has(lockKey)) {
    return interaction.reply({
      content:
        "⏳ כבר מתבצעת רכישה בחשבון שלך. נסה שוב בעוד רגע.",
      ephemeral: true
    });
  }

  xpPurchaseLocks.add(lockKey);

  try {
    const member =
      await interaction.guild.members
        .fetch(interaction.user.id)
        .catch(() => null);

    const role =
      await interaction.guild.roles
        .fetch(item.roleId)
        .catch(() => null);

    if (!member || !role) {
      return interaction.reply({
        content:
          "❌ לא מצאתי את הרול של הפריט הזה.",
        ephemeral: true
      });
    }

    if (member.roles.cache.has(role.id)) {
      return interaction.reply({
        content:
          "❌ כבר יש לך את הרול הזה.",
        ephemeral: true
      });
    }

    const profile =
      getXpProfile(
        interaction.guild.id,
        interaction.user.id
      );

    const price =
      Number(item.price);

    if (profile.xp < price) {
      return interaction.reply({
        content:
          `❌ אין לך מספיק XP.\nצריך **${price.toLocaleString("en-US")} XP**, ויש לך **${profile.xp.toLocaleString("en-US")} XP**.`,
        ephemeral: true
      });
    }

    const botMember =
      await interaction.guild.members
        .fetchMe()
        .catch(() => null);

    if (
      !botMember ||
      !botMember.permissions.has(
        PermissionFlagsBits.ManageRoles
      )
    ) {
      return interaction.reply({
        content:
          "❌ לבוט אין `Manage Roles`.",
        ephemeral: true
      });
    }

    if (
      role.managed ||
      role.position >=
        botMember.roles.highest.position
    ) {
      return interaction.reply({
        content:
          "❌ הבוט לא יכול לתת את הרול הזה. תעלה את רול הבוט מעליו.",
        ephemeral: true
      });
    }

    try {
      await member.roles.add(
        role,
        `Noabop XP Shop purchase: ${item.name}`
      );
    } catch (error) {
      console.error(
        "❌ XP Shop role add error:",
        error
      );

      return interaction.reply({
        content:
          "❌ לא הצלחתי לתת את הרול. לא ירד לך XP.",
        ephemeral: true
      });
    }

    profile.xp =
      Math.max(
        0,
        profile.xp - price
      );

    saveXp();

    return interaction.reply({
      content:
        `✅ קנית **${item.name}** ב־**${price.toLocaleString("en-US")} XP**!\n` +
        `💰 נשארו לך **${profile.xp.toLocaleString("en-US")} XP**.`,
      ephemeral: true
    });
  } finally {
    xpPurchaseLocks.delete(lockKey);
  }
}


// =====================
// BLACKJACK
// =====================

function drawBlackjackCard() {
  const deckValues = [
    2, 3, 4, 5, 6, 7, 8, 9,
    10, 10, 10, 10, 11
  ];

  return deckValues[
    randomInt(0, deckValues.length - 1)
  ];
}

function blackjackTotal(cards) {
  let total = cards.reduce(
    (sum, card) => sum + card,
    0
  );

  let aces = cards.filter(card => card === 11).length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function blackjackKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function blackjackButtons(userId, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bj_hit:${userId}`)
        .setLabel("Hit")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),

      new ButtonBuilder()
        .setCustomId(`bj_stand:${userId}`)
        .setLabel("Stand")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    )
  ];
}

function blackjackEmbed(user, game, result = null) {
  const finished = Boolean(result);

  const dealerText = finished
    ? `${game.dealer.join(" • ")} → **${blackjackTotal(game.dealer)}**`
    : `${game.dealer[0]} • ?`;

  return new EmbedBuilder()
    .setColor(finished ? "Gold" : "DarkGreen")
    .setTitle("🃏 Noabop Blackjack")
    .setDescription(
      [
        `👤 ${user}`,
        `💰 Bet: **${game.bet.toLocaleString("en-US")} XP**`,
        "",
        `**Your cards:** ${game.player.join(" • ")} → **${blackjackTotal(game.player)}**`,
        `**Dealer:** ${dealerText}`,
        result
          ? `\n${result}`
          : "\nבחר **Hit** או **Stand**."
      ].join("\n")
    )
    .setTimestamp();
}

async function finishBlackjack(interaction, game) {
  let dealer = blackjackTotal(game.dealer);

  while (dealer < 17) {
    game.dealer.push(drawBlackjackCard());
    dealer = blackjackTotal(game.dealer);
  }

  const player = blackjackTotal(game.player);

  blackjackGames.delete(
    blackjackKey(game.guildId, game.userId)
  );

  if (player > 21) {
    changeXp(game.guildId, game.userId, -game.bet);

    return interaction.update({
      embeds: [
        blackjackEmbed(
          interaction.user,
          game,
          `💥 Bust — הפסדת **${game.bet.toLocaleString("en-US")} XP**.`
        )
      ],
      components: blackjackButtons(game.userId, true)
    });
  }

  if (dealer > 21 || player > dealer) {
    changeXp(game.guildId, game.userId, game.bet);

    return interaction.update({
      embeds: [
        blackjackEmbed(
          interaction.user,
          game,
          `🏆 ניצחת — הרווחת **${game.bet.toLocaleString("en-US")} XP**!`
        )
      ],
      components: blackjackButtons(game.userId, true)
    });
  }

  if (player === dealer) {
    return interaction.update({
      embeds: [
        blackjackEmbed(
          interaction.user,
          game,
          "🤝 Push — לא הרווחת ולא הפסדת XP."
        )
      ],
      components: blackjackButtons(game.userId, true)
    });
  }

  changeXp(game.guildId, game.userId, -game.bet);

  return interaction.update({
    embeds: [
      blackjackEmbed(
        interaction.user,
        game,
        `💔 הפסדת **${game.bet.toLocaleString("en-US")} XP**.`
      )
    ],
    components: blackjackButtons(game.userId, true)
  });
}

// =====================
// STAFF PERFORMANCE STATS
// =====================

function getGuildStaffStats(guildId) {
  if (!staffStatsData.guilds[guildId]) {
    staffStatsData.guilds[guildId] = {
      users: {}
    };
  }

  if (!staffStatsData.guilds[guildId].users) {
    staffStatsData.guilds[guildId].users = {};
  }

  return staffStatsData.guilds[guildId];
}

function getStaffStats(guildId, userId) {
  const guildData = getGuildStaffStats(guildId);

  if (!guildData.users[userId]) {
    guildData.users[userId] = {
      helpsTaken: 0,
      ticketsTaken: 0,
      voiceMs: 0
    };
  }

  const stats = guildData.users[userId];
  stats.helpsTaken = Math.max(0, Number(stats.helpsTaken || 0));
  stats.ticketsTaken = Math.max(0, Number(stats.ticketsTaken || 0));
  stats.voiceMs = Math.max(0, Number(stats.voiceMs || 0));

  return stats;
}

function saveStaffStats() {
  saveJson(STAFF_STATS_FILE, staffStatsData);
}

function addHelpTaken(guildId, userId) {
  const stats = getStaffStats(guildId, userId);
  stats.helpsTaken += 1;
  saveStaffStats();
}

function addTicketTaken(guildId, userId) {
  const stats = getStaffStats(guildId, userId);
  stats.ticketsTaken += 1;
  saveStaffStats();
}

function addStaffVoiceMs(guildId, userId, amountMs) {
  const amount = Math.max(0, Number(amountMs || 0));
  if (!amount) return;

  const stats = getStaffStats(guildId, userId);
  stats.voiceMs += amount;
}

function totalStaffVoiceMs(guildId, userId) {
  const stats = getStaffStats(guildId, userId);
  let total = Number(stats.voiceMs || 0);

  const active = activeVoiceSessions.get(`${guildId}:${userId}`);
  if (active) {
    total += Math.max(0, Date.now() - Number(active.startedAt || Date.now()));
  }

  return total;
}

// =====================
// WARNS
// =====================

const WARN_PUNISHMENTS = [
  { warns: 3, timeoutMs: 30 * 60 * 1000, label: "30 דקות Timeout" },
  { warns: 5, timeoutMs: 2 * 60 * 60 * 1000, label: "שעתיים Timeout" },
  { warns: 7, timeoutMs: 24 * 60 * 60 * 1000, label: "יום Timeout" },
  { warns: 10, timeoutMs: 7 * 24 * 60 * 60 * 1000, label: "7 ימים Timeout" }
];

function getGuildWarns(guildId) {
  if (!warnsData.guilds[guildId]) {
    warnsData.guilds[guildId] = {
      idSequence: 0,
      users: {}
    };
  }

  const guildData = warnsData.guilds[guildId];

  if (!guildData.users) {
    guildData.users = {};
  }

  if (!Number.isInteger(Number(guildData.idSequence))) {
    guildData.idSequence = 0;
  }

  return guildData;
}

function getUserWarns(guildId, userId) {
  const guildData = getGuildWarns(guildId);

  if (!guildData.users[userId]) {
    guildData.users[userId] = {
      warns: [],
      appliedThresholds: []
    };
  }

  const data = guildData.users[userId];

  if (!Array.isArray(data.warns)) {
    data.warns = [];
  }

  if (!Array.isArray(data.appliedThresholds)) {
    data.appliedThresholds = [];
  }

  return data;
}

function saveWarns() {
  saveJson(WARNS_FILE, warnsData);
}

function generateWarnId(guildId) {
  const guildData = getGuildWarns(guildId);

  guildData.idSequence =
    (Number(guildData.idSequence || 0) + 1) % 4096;

  // Numeric Snowflake-style moderation ID.
  const epoch = 1704067200000n; // 2024-01-01 UTC
  const timestamp = BigInt(Date.now()) - epoch;
  const sequence = BigInt(guildData.idSequence);
  const worker = 17n;

  return (
    (timestamp << 22n) |
    (worker << 12n) |
    sequence
  ).toString();
}

function addWarn(guildId, userId, moderatorId, reason) {
  const userData = getUserWarns(guildId, userId);

  const warning = {
    id: generateWarnId(guildId),
    userId,
    moderatorId,
    reason,
    createdAt: Date.now()
  };

  userData.warns.push(warning);
  saveWarns();

  return warning;
}

function deleteWarn(guildId, userId, warnId) {
  const userData = getUserWarns(guildId, userId);
  const normalized = String(warnId || "").trim();

  const index = userData.warns.findIndex(
    warn => String(warn.id) === normalized
  );

  if (index === -1) return null;

  const [removed] = userData.warns.splice(index, 1);

  const count = userData.warns.length;
  userData.appliedThresholds = userData.appliedThresholds.filter(
    threshold => Number(threshold) <= count
  );

  saveWarns();
  return removed;
}

async function applyAutomaticWarnPunishment(guild, member) {
  const data = getUserWarns(guild.id, member.id);
  const count = data.warns.length;

  const punishment = WARN_PUNISHMENTS.find(
    item => item.warns === count
  );

  if (!punishment) return null;

  if (data.appliedThresholds.includes(punishment.warns)) {
    return null;
  }

  if (!member.moderatable) {
    return {
      ok: false,
      text:
        `המשתמש הגיע ל־${count} Warns, אבל הבוט לא יכול לתת Timeout בגלל היררכיית רולים.`
    };
  }

  await member.timeout(
    punishment.timeoutMs,
    `Noabop automatic punishment: ${count} warns`
  );

  data.appliedThresholds.push(punishment.warns);
  saveWarns();

  return {
    ok: true,
    text: `🔨 עונש אוטומטי: **${punishment.label}** בגלל **${count} Warns**.`
  };
}

// =====================
// MOD TIMERS
// =====================

function timerKey(guildId, userId, type) {
  return `${guildId}:${userId}:${type}`;
}

function addModTimer(data) {
  modTimers[
    timerKey(data.guildId, data.userId, data.type)
  ] = data;

  saveJson(TIMERS_FILE, modTimers);
}

function removeModTimer(guildId, userId, type) {
  delete modTimers[
    timerKey(guildId, userId, type)
  ];

  saveJson(TIMERS_FILE, modTimers);
}

async function checkModTimers() {
  const now = Date.now();
  let changed = false;

  for (const [key, timer] of Object.entries(modTimers)) {
    if (Number(timer.expiresAt) > now) continue;

    const guild = client.guilds.cache.get(timer.guildId);

    if (!guild) {
      delete modTimers[key];
      changed = true;
      continue;
    }

    const member = await fetchMember(guild, timer.userId);

    if (timer.type === "chat-mute") {
      if (member && config.muteRoleId) {
        const role = await guild.roles
          .fetch(config.muteRoleId)
          .catch(() => null);

        if (role && member.roles.cache.has(role.id)) {
          await member.roles.remove(
            role,
            "Noabop automatic Chat Unmute"
          ).catch(() => {});
        }
      }
    }

    if (timer.type === "voice-mute") {
      if (
        member &&
        member.voice.channelId &&
        member.voice.serverMute
      ) {
        await member.voice.setMute(
          false,
          "Noabop automatic Voice Unmute"
        ).catch(() => {});
      }
    }

    delete modTimers[key];
    changed = true;
  }

  if (changed) {
    saveJson(TIMERS_FILE, modTimers);
  }
}

// =====================
// WEEKLY VOICE
// =====================

function weekStartMs(now = Date.now()) {
  const date = new Date(now);
  const day = date.getUTCDay();
  const fromMonday = day === 0 ? 6 : day - 1;

  date.setUTCDate(date.getUTCDate() - fromMonday);
  date.setUTCHours(0, 0, 0, 0);

  return date.getTime();
}

function ensureVoiceWeek(guildId, now = Date.now()) {
  const start = weekStartMs(now);
  const current = voiceData.guilds[guildId];

  if (!current || Number(current.weekStart) !== start) {
    voiceData.guilds[guildId] = {
      weekStart: start,
      users: {}
    };

    for (const session of activeVoiceSessions.values()) {
      if (session.guildId === guildId) {
        session.startedAt = Math.max(
          Number(session.startedAt || start),
          start
        );
      }
    }

    saveJson(VOICE_FILE, voiceData);
  }

  return voiceData.guilds[guildId];
}

function voiceProfile(guildId, userId) {
  const guildData = ensureVoiceWeek(guildId);

  if (!guildData.users[userId]) {
    guildData.users[userId] = {
      milliseconds: 0
    };
  }

  return guildData.users[userId];
}

function startVoiceSession(guildId, userId, startedAt = Date.now()) {
  const key = `${guildId}:${userId}`;

  if (activeVoiceSessions.has(key)) return;

  const guildData = ensureVoiceWeek(guildId, startedAt);

  activeVoiceSessions.set(key, {
    guildId,
    userId,
    startedAt: Math.max(startedAt, guildData.weekStart)
  });
}

function endVoiceSession(guildId, userId, endedAt = Date.now()) {
  const key = `${guildId}:${userId}`;
  const session = activeVoiceSessions.get(key);

  if (!session) return;

  const guildData = ensureVoiceWeek(guildId, endedAt);
  const profile = voiceProfile(guildId, userId);

  const startedAt = Math.max(
    Number(session.startedAt || endedAt),
    guildData.weekStart
  );

  const elapsed = Math.max(0, endedAt - startedAt);

  profile.milliseconds =
    Number(profile.milliseconds || 0) +
    elapsed;

  addStaffVoiceMs(guildId, userId, elapsed);
  saveStaffStats();

  activeVoiceSessions.delete(key);
  saveJson(VOICE_FILE, voiceData);
}

function flushVoiceSessions() {
  const now = Date.now();
  let changed = false;

  for (const [key, session] of activeVoiceSessions) {
    const guildData = ensureVoiceWeek(session.guildId, now);
    const profile = voiceProfile(session.guildId, session.userId);

    const startedAt = Math.max(
      Number(session.startedAt || now),
      guildData.weekStart
    );

    const elapsed = Math.max(0, now - startedAt);

    if (elapsed > 0) {
      profile.milliseconds =
        Number(profile.milliseconds || 0) + elapsed;

      addStaffVoiceMs(
        session.guildId,
        session.userId,
        elapsed
      );

      session.startedAt = now;
      activeVoiceSessions.set(key, session);
      changed = true;
    }
  }

  if (changed) {
    saveJson(VOICE_FILE, voiceData);
    saveStaffStats();
  }
}

function weeklyVoiceMs(guildId, userId) {
  const now = Date.now();
  const guildData = ensureVoiceWeek(guildId, now);
  const profile = voiceProfile(guildId, userId);

  let total = Number(profile.milliseconds || 0);

  const session = activeVoiceSessions.get(
    `${guildId}:${userId}`
  );

  if (session) {
    total += Math.max(
      0,
      now - Math.max(
        Number(session.startedAt || now),
        guildData.weekStart
      )
    );
  }

  return total;
}

function formatVoiceTime(ms) {
  const totalMinutes = Math.floor(
    Math.max(0, Number(ms || 0)) / 60000
  );

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}m`;
}

function initVoiceSessions() {
  for (const guild of client.guilds.cache.values()) {
    ensureVoiceWeek(guild.id);

    for (const state of guild.voiceStates.cache.values()) {
      if (!state.channelId || state.member?.user?.bot) continue;

      startVoiceSession(guild.id, state.id);
    }
  }
}

// =====================
// RANK
// =====================

function positionByField(guildId, userId, field) {
  const users = getGuildXp(guildId).users;

  const sorted = Object.entries(users)
    .map(([id, profile]) => ({
      id,
      value: Number(profile?.[field] || 0)
    }))
    .sort((a, b) => b.value - a.value);

  const index = sorted.findIndex(item => item.id === userId);

  return index === -1
    ? sorted.length + 1
    : index + 1;
}

function rankLevel(xp) {
  const perLevel = Number(config.rankXpPerLevel || 500);
  const safeXp = Math.max(0, Number(xp || 0));
  const level = Math.floor(safeXp / perLevel) + 1;
  const intoLevel = safeXp % perLevel;

  return {
    level,
    percent: Math.floor((intoLevel / perLevel) * 100),
    needed: perLevel - intoLevel
  };
}

function buildRankEmbed(guild, member) {
  const stats = getStaffStats(guild.id, member.id);
  const voice = formatVoiceTime(
    totalStaffVoiceMs(guild.id, member.id)
  );

  return new EmbedBuilder()
    .setColor("Blurple")
    .setTitle("📊 Noabop Staff Rank")
    .setThumbnail(
      member.user.displayAvatarURL({ size: 256 })
    )
    .setDescription(
      `סטטיסטיקות הצוות של ${member} ב־**${guild.name}**`
    )
    .addFields(
      {
        name: "🆘 Helps Taken",
        value: `**${stats.helpsTaken.toLocaleString("en-US")}**`,
        inline: true
      },
      {
        name: "🎫 Tickets Taken",
        value: `**${stats.ticketsTaken.toLocaleString("en-US")}**`,
        inline: true
      },
      {
        name: "🎙️ Voice Time",
        value: `**${voice}**`,
        inline: true
      }
    )
    .setFooter({
      text: `Noabop • Staff Rank • ${member.user.username}`
    })
    .setTimestamp();
}

// =====================
// HELP REQUEST
// =====================

function helpRequestEmbed(
  user,
  reason,
  requestId,
  handler = null
) {
  return new EmbedBuilder()
    .setColor(handler ? "Green" : "DarkGreen")
    .setTitle("🚨 בקשת עזרה חדשה")
    .addFields(
      {
        name: "משתמש:",
        value: `${user}`,
        inline: false
      },
      {
        name: "סיבה:",
        value: reason || "לא צוינה סיבה",
        inline: false
      },
      {
        name: "סטטוס:",
        value:
          handler
            ? "✅ נמצא בטיפול"
            : "❌ לא נמצא בטיפול",
        inline: false
      },
      {
        name: "סטטוס טיפול:",
        value:
          handler
            ? `✅ בטיפול על ידי ${handler}`
            : "❌ אף אחד",
        inline: false
      }
    )
    .setFooter({
      text: `ID: ${requestId}`
    })
    .setTimestamp();
}

// =====================
// STAFF EXAM
// =====================

function buildStaffExamEmbeds() {
  const intro = new EmbedBuilder()
    .setColor("Blurple")
    .setTitle("📜 טופס מועמדות לצוות השרת")
    .setDescription(
      [
        "ברוך הבא לבחינה לצוות של **Noabop**.",
        "",
        "📝 יש לענות על **כל השאלות** בצורה מסודרת, רצינית ומפורטת.",
        "💡 ככל שתשקיע יותר בתשובות — כך נוכל להכיר אותך טוב יותר.",
        "",
        "⚠️ **זלזול, טרול או תשובות לא רציניות עלולים לגרור ענישה.**"
      ].join("\\n")
    )
    .setFooter({
      text: "Noabop • Staff Application"
    })
    .setTimestamp();

  const partOne = new EmbedBuilder()
    .setColor("Blue")
    .setTitle("🧠 חלק א׳ — היכרות וניסיון")
    .setDescription(
      [
        "**1. 🪪 שם מלא / כינוי בדיסקורד**",
        "מה השם שלך ומה הכינוי שלך בדיסקורד?",
        "",
        "**2. 🎂 גיל**",
        "בן/בת כמה אתה/את?",
        "",
        "**3. ⏳ ותק בשרת**",
        "כמה זמן אתה נמצא בשרת שלנו?",
        "",
        "**4. 🛡️ ניסיון קודם**",
        "האם יש לך ניסיון קודם בצוות ניהול / מודרטור? ספר קצת. אם עזבת — מדוע? צרף הוכחה במידה ויש.",
        "",
        "**5. ⭐ מהו צוות טוב?**",
        "איך אתה מגדיר צוות טוב? אילו תכונות לדעתך חייבות להיות לחבר צוות?",
        "",
        "**6. 🚨 טיפול בסיטואציה בעייתית**",
        "מה היית עושה אם יש סיטואציה לא נעימה בצ׳אט או בווייס — קללות, מעבר על החוקים או ריב בין כמה חברי שרת? תן דוגמה.",
        "",
        "**7. 🧩 קונפליקט בתוך הצוות**",
        "איך היית מגיב אם חבר צוות שמתחתיך תוקף אותך? ואיך היית מגיב אם הוא היה מעליך?"
      ].join("\\n")
    );

  const partTwo = new EmbedBuilder()
    .setColor("DarkBlue")
    .setTitle("🚀 חלק ב׳ — פעילות, תרומה ומוטיבציה")
    .setDescription(
      [
        "**8. 🕒 זמינות**",
        "כמה זמן בערך אתה חושב שתוכל לתת מעצמך למען השרת בכל יום / במהלך שבוע?",
        "",
        "**9. 📈 החזרת פעילות לשרת**",
        "אם השרת מתחיל להראות חוסר פעילות — האם לדעתך תוכל לשנות את המצב? איך?",
        "",
        "**10. 🧰 תחומי עזרה**",
        "באילו תחומים אתה רוצה לעזור בשרת? למשל: ניהול צ׳אט, ניהול ווייס, הפקת אירועים או תמיכה טכנית.",
        "",
        "**11. 🏆 תרומה והתקדמות**",
        "איך אתה חושב שתוכל לתרום לשרת, וכמה רחוק אתה חושב שתוכל להגיע בצוות?",
        "",
        "**12. ❤️ למה צוות?**",
        "מאיפה מגיע הרצון שלך להצטרף לצוות?",
        "",
        "**13. 🎯 למה דווקא אתה?**",
        "למה דווקא אתה מתאים לצוות שלנו?",
        "",
        "**💡 בונוס — רעיון לשיפור השרת**",
        "יש לך רעיון לשיפור השרת? נשמח לשמוע.",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "🍀 **בהצלחה!** השקעה, סדר וכנות עושים הבדל."
      ].join("\\n")
    )
    .setFooter({
      text: "Noabop Staff Team • Good Luck"
    });

  return [intro, partOne, partTwo];
}


// =====================
// TICKETS
// =====================

const ticketTypes = {
  report_user: {
    emoji: "🚨",
    name: "Report User",
    hebrewName: "דיווח על משתמש",
    description: "דיווח על משתמש שעובר על חוקי השרת"
  },
  management_support: {
    emoji: "📋",
    name: "Management Support",
    hebrewName: "פנייה להנהלה",
    description: "פנייה ישירה לצוות ההנהלה"
  },
  giveaway_winner: {
    emoji: "🎁",
    name: "Giveaway Winner",
    hebrewName: "זכייה בהגרלה",
    description: "פנייה בנוגע לזכייה בהגרלה"
  },
  video_participation: {
    emoji: "🎬",
    name: "Video Participation",
    hebrewName: "השתתפות בסרטון",
    description: "בקשה להשתתף בסרטון"
  },
  other: {
    emoji: "❓",
    name: "Other",
    hebrewName: "אחר",
    description: "נושא אחר שלא מופיע ברשימה"
  },
  staff_test: {
    emoji: "📝",
    name: "Staff Application",
    hebrewName: "בחינה לצוות",
    description: "מועמדות לצוות השרת"
  }
};

function ticketPanel() {
  const regularTypes = [
    "report_user",
    "management_support",
    "giveaway_winner",
    "video_participation",
    "other"
  ];

  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket_type_select")
    .setPlaceholder("בחר נושא לפתיחת טיקט")
    .addOptions(
      regularTypes.map(value => {
        const data = ticketTypes[value];

        return new StringSelectMenuOptionBuilder()
          .setLabel(data.name)
          .setDescription(data.hebrewName)
          .setEmoji(data.emoji)
          .setValue(value);
      })
    );

  const description = [
    "🎟️ **צריכים עזרה? הגעתם למקום הנכון.**",
    "",
    "כדי לפתוח פנייה לצוות, בחרו מהתפריט למטה את הנושא שהכי מתאים לפנייה שלכם.",
    "לאחר הבחירה ייפתח עבורכם טיקט פרטי שבו תוכלו להסביר את המקרה בצורה מלאה.",
    "",
    "📌 **נושאים זמינים**",
    "",
    "🚨 **Report User**",
    "דיווח על משתמש שעובר על חוקי השרת.",
    "",
    "📋 **Management Support**",
    "פנייה ישירה להנהלה בנושא שדורש טיפול או עזרה.",
    "",
    "🎁 **Giveaway Winner**",
    "פנייה בנוגע לזכייה בהגרלה או קבלת הפרס.",
    "",
    "🎬 **Video Participation**",
    "בקשה להשתתף בסרטון או פעילות תוכן של השרת.",
    "",
    "❓ **Other**",
    "לכל נושא אחר שלא מתאים לאחת האפשרויות למעלה.",
    "",
    "⚠️ **שימו לב**",
    "יש לפתוח טיקט רק כשבאמת צריך עזרה ולפרט את הנושא בצורה מסודרת.",
    "פתיחת טיקטים ללא סיבה או ספאם עלולה להוביל לסגירת הטיקט ולטיפול מצד הצוות.",
    "",
    "💙 צוות Noabop יחזור אליכם בהקדם האפשרי."
  ].join("\n");

  const embed = new EmbedBuilder()
    .setColor("Blurple")
    .setTitle("🎟️ מרכז תמיכה — פתיחת טיקט")
    .setDescription(description)
    .setFooter({
      text: "Noabop • Support Center"
    })
    .setTimestamp();

  if (client.user) {
    embed.setThumbnail(
      client.user.displayAvatarURL({
        size: 256
      })
    );
  }

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder()
        .addComponents(select)
    ]
  };
}
function staffApplicationPanel() {
  const button =
    new ButtonBuilder()
      .setCustomId("staff_apply")
      .setLabel("Apply For Staff")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary);

  const content = [
    "📢 **__דרושים אנשי צוות חדשים לשרת!__** 📢",
    "",
    "🚀 **קהילה יקרה, אנחנו שמחים להודיע כי ההרשמה לצוות השרת פתוחה תמיד!**",
    "",
    "אם אתם אחראיים, בעלי רצון לעזור ורוצים לקחת חלק בניהול ובפיתוח של השרת — זה המקום שלכם.",
    "אנחנו תמיד מחפשים אנשים טובים לצוות!",
    "",
    "📌 **דרישות סף**",
    "",
    "• גיל מינימלי: **13+**",
    "• פעילות וזמינות בשרת ובצ׳אטים.",
    "• ידע בסיסי בחוקי השרת ויחסי אנוש טובים.",
    "• ללא עבר משמעתי כבד בתקופה האחרונה.",
    "",
    "📝 **איך זה עובד?**",
    "",
    "1. לחצו על הכפתור **Apply For Staff** למטה.",
    "2. ייפתח עבורכם טיקט בחינה פרטי.",
    "3. ענו על כל השאלות בצורה מסודרת ומפורטת.",
    "4. צוות ההנהלה יעבור על הבחינה ויחזור אליכם.",
    "",
    "⏰ **שימו לב:** ההרשמה פתוחה תמיד, כך שאתם יכולים להגיש מועמדות בכל זמן שתרצו.",
    "",
    "🤍 **בהצלחה לכל המשתתפים!**"
  ].join("\n");

  return {
    content,
    components: [
      new ActionRowBuilder()
        .addComponents(button)
    ]
  };
}
function ticketRole(type) {
  if (
    type === "staff_test" &&
    config.staffTestTicketRoleId
  ) {
    return config.staffTestTicketRoleId;
  }

  return config.ticketStaffRoleId || config.staffRoleId;
}

function parseTicketTopic(channel) {
  const topic = String(channel.topic || "");

  if (!topic.startsWith("noabop-ticket:")) {
    return null;
  }

  const [, ownerId, type, claimedBy] =
    topic.split(":");

  return {
    ownerId,
    type,
    claimedBy: claimedBy === "none"
      ? null
      : claimedBy
  };
}

async function setTicketTopic(channel, data) {
  await channel.setTopic(
    `noabop-ticket:${data.ownerId}:${data.type}:${data.claimedBy || "none"}`
  );
}

function ticketButtons(claimed = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel(claimed ? "Claimed" : "Claim")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(claimed),

      new ButtonBuilder()
        .setCustomId("ticket_release")
        .setLabel("Release")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!claimed),

      new ButtonBuilder()
        .setCustomId("ticket_add")
        .setLabel("Add User")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("ticket_remove")
        .setLabel("Remove User")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

async function transcriptBuffer(channel) {
  const messages = [];
  let before;

  for (let i = 0; i < 5; i++) {
    const batch = await channel.messages.fetch({
      limit: 100,
      before
    }).catch(() => null);

    if (!batch?.size) break;

    messages.push(...batch.values());
    before = batch.last().id;

    if (batch.size < 100) break;
  }

  messages.sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  );

  const lines = messages.map(message => {
    const date = new Date(
      message.createdTimestamp
    ).toISOString();

    const attachments = [
      ...message.attachments.values()
    ].map(item => item.url).join(" ");

    return (
      `[${date}] ${message.author.tag}: ` +
      `${message.content || ""}` +
      `${attachments ? ` ${attachments}` : ""}`
    );
  });

  return Buffer.from(
    lines.join("\n"),
    "utf8"
  );
}

async function openTicket(interaction, type) {
  const typeData = ticketTypes[type];

  if (!typeData) {
    return interaction.reply({
      content: "❌ סוג טיקט לא תקין.",
      ephemeral: true
    });
  }

  if (!config.ticketCategoryId) {
    return interaction.reply({
      content:
        "❌ חסר `ticketCategoryId` ב־config.js.",
      ephemeral: true
    });
  }

  const existing = interaction.guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildText &&
      String(channel.topic || "").startsWith(
        `noabop-ticket:${interaction.user.id}:`
      )
  );

  if (existing) {
    return interaction.reply({
      content:
        `❌ כבר יש לך טיקט פתוח: ${existing}`,
      ephemeral: true
    });
  }

  const staffRoleId = ticketRole(type);

  const overwrites = [
    {
      id: interaction.guild.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    },
    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages
      ]
    }
  ];

  if (staffRoleId) {
    overwrites.push({
      id: staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    });
  }

  const safeName = interaction.user.username
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .slice(0, 70);

  const channel = await interaction.guild.channels.create({
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId,
    topic:
      `noabop-ticket:${interaction.user.id}:${type}:none`,
    permissionOverwrites: overwrites
  });

  const openedEmbed = new EmbedBuilder()
    .setColor(
      type === "staff_test"
        ? "Purple"
        : "Blurple"
    )
    .setTitle(
      `${typeData.emoji} ${typeData.hebrewName || typeData.name}`
    )
    .setDescription(
      type === "staff_test"
        ? [
            `שלום ${interaction.user},`,
            "",
            "נפתח עבורך טיקט מועמדות לצוות.",
            "ענה על השאלות שיופיעו מיד בצורה רצינית ומסודרת.",
            "",
            "🛡️ צוות ההנהלה יעבור על המועמדות שלך בהקדם."
          ].join("\n")
        : [
            `שלום ${interaction.user}, הפנייה שלך נפתחה בהצלחה.`,
            "",
            `📌 **נושא:** ${typeData.name}`,
            `📝 **קטגוריה:** ${typeData.hebrewName || typeData.name}`,
            "",
            "צוות השרת יענה כאן בהקדם האפשרי."
          ].join("\n")
    )
    .setThumbnail(
      interaction.user.displayAvatarURL({
        size: 256
      })
    )
    .setFooter({
      text: "Noabop • Ticket System"
    })
    .setTimestamp();

  await channel.send({
    content:
      staffRoleId
        ? `<@&${staffRoleId}>`
        : undefined,
    embeds: [openedEmbed],
    components: ticketButtons(false),
    allowedMentions: {
      users: [interaction.user.id],
      roles: staffRoleId ? [staffRoleId] : []
    }
  });

  if (type === "staff_test") {
    await channel.send({
      embeds: buildStaffExamEmbeds()
    });
  }

  return interaction.reply({
    content:
      `✅ הטיקט שלך נפתח: ${channel}`,
    ephemeral: true
  });
}

// =====================
// WELCOME
// =====================

function roundRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function getWelcomeChannel(guild) {
  if (config.welcomeChannelId) {
    const configured = guild.channels.cache.get(config.welcomeChannelId);
    if (configured?.isTextBased()) {
      return configured;
    }
  }

  const preferredNames = new Set([
    "welcome",
    "welcomes",
    "ברוכים-הבאים",
    "ברוכים-הבאים-לשרת",
    "ברוכים הבאים"
  ]);

  const named = guild.channels.cache.find(channel =>
    channel?.isTextBased?.() &&
    preferredNames.has(String(channel.name || "").toLowerCase())
  );

  return named || guild.systemChannel || null;
}

client.on(Events.GuildMemberAdd, async member => {
  try {
    if (member.user.bot) return;

    const welcomeChannel = getWelcomeChannel(member.guild);
    if (!welcomeChannel?.isTextBased()) return;

    const joinedDate = new Date().toLocaleDateString("en-GB");
    const canvas = createCanvas(1000, 500);
    const ctx = canvas.getContext("2d");

    const backgroundUrl =
      member.guild.bannerURL({ extension: "png", size: 1024 }) ||
      member.guild.iconURL({ extension: "png", size: 1024 });

    if (backgroundUrl) {
      const background = await loadImage(backgroundUrl);
      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 7;
    roundRectPath(ctx, 30, 35, 940, 430, 35);
    ctx.stroke();

    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(510, 250, 400, 165, 0, 0, Math.PI * 2);
    ctx.stroke();

    const avatar = await loadImage(
      member.user.displayAvatarURL({ extension: "png", size: 256 })
    );

    ctx.save();
    ctx.beginPath();
    ctx.arc(235, 250, 82, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 153, 168, 164, 164);
    ctx.restore();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(235, 250, 85, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";

    ctx.font = "36px Arial";
    ctx.fillText("WELCOME", 570, 185);

    ctx.font = "bold 62px Arial";
    ctx.fillText(
      member.user.username.toUpperCase().slice(0, 18),
      570,
      265
    );

    ctx.font = "28px Arial";
    ctx.fillText(member.guild.name.slice(0, 30), 570, 320);

    ctx.font = "24px Arial";
    ctx.fillText(`Member #${member.guild.memberCount}`, 570, 360);

    ctx.font = "20px Arial";
    ctx.fillText(`Date: ${joinedDate}`, 570, 395);

    const attachment = new AttachmentBuilder(
      canvas.toBuffer("image/png"),
      { name: "welcome.png" }
    );

    await welcomeChannel.send({
      content:
        `👋 Welcome ${member} to **${member.guild.name}**!\n\n` +
        `📅 Date: **${joinedDate}**\n` +
        `👤 You are member **#${member.guild.memberCount}**`,
      files: [attachment]
    });
  } catch (error) {
    console.error("❌ Welcome error:", error);
  }
});

// =====================
// READY
// =====================

client.once(Events.ClientReady, async readyClient => {
  console.log(
    `✅ Noabop Bot online as ${readyClient.user.tag}`
  );

  await checkModTimers();

  initVoiceSessions();

  await cleanupLegacyPrefixes();

  setInterval(() => {
    checkModTimers().catch(error => {
      console.error("❌ Timer check error:", error);
    });
  }, 10 * 1000);

  setInterval(() => {
    try {
      flushVoiceSessions();
    } catch (error) {
      console.error("❌ Voice save error:", error);
    }
  }, 60 * 1000);
});

// =====================
// VOICE EVENTS
// =====================

client.on(
  Events.VoiceStateUpdate,
  (oldState, newState) => {
    try {
      const member =
        newState.member || oldState.member;

      if (!member || member.user?.bot) return;

      if (!oldState.channelId && newState.channelId) {
        startVoiceSession(
          newState.guild.id,
          newState.id
        );
      }

      if (oldState.channelId && !newState.channelId) {
        endVoiceSession(
          oldState.guild.id,
          oldState.id
        );
      }
    } catch (error) {
      console.error(
        "❌ VoiceStateUpdate error:",
        error
      );
    }
  }
);

// =====================
// PREFIX + XP
// =====================

client.on(
  Events.MessageCreate,
  async message => {
    try {
      if (!message.guild || message.author.bot) return;

      const profile = getXpProfile(
        message.guild.id,
        message.author.id
      );

      // Count every normal message.
      profile.messages += 1;

      const cooldownKey =
        `${message.guild.id}:${message.author.id}`;

      const lastXp =
        messageXpCooldowns.get(cooldownKey) || 0;

      const xpCooldownMs =
        Number(config.xpMessageCooldownMs || 60000);

      if (Date.now() - lastXp >= xpCooldownMs) {
        messageXpCooldowns.set(
          cooldownKey,
          Date.now()
        );

        const min = Number(config.xpPerMessageMin || 5);
        const max = Number(config.xpPerMessageMax || 15);

        profile.xp += randomInt(
          Math.min(min, max),
          Math.max(min, max)
        );
      }

      saveXp();

      const prefix = String(config.xpPrefix || "!");

      if (!message.content.startsWith(prefix)) {
        return;
      }

      const args = message.content
        .slice(prefix.length)
        .trim()
        .split(/\s+/);

      const command = args.shift()?.toLowerCase();

      // ---------- HELP REQUEST ----------

      if (command === "h" || command === "help") {
        const reason =
          args.join(" ").trim() ||
          "לא צוינה סיבה";

        const requestId = Date.now().toString();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `take_help_request:${message.author.id}:${requestId}`
            )
            .setLabel("בטיפול")
            .setStyle(ButtonStyle.Primary)
        );

        return message.channel.send({
          content:
            config.staffRoleId
              ? `<@&${config.staffRoleId}>`
              : undefined,
          embeds: [
            helpRequestEmbed(
              message.author,
              reason,
              requestId
            )
          ],
          components: [row],
          allowedMentions:
            config.staffRoleId
              ? { roles: [config.staffRoleId] }
              : undefined
        });
      }

      // ---------- STAFF RANK ----------

      if (command === "rank") {
        if (!isStaff(message.member)) {
          return message.reply(
            "❌ רק Staff יכול להשתמש ב־`!rank`."
          );
        }

        let member = message.mentions.members.first();

        if (!member && args[0] && /^\d{16,20}$/.test(args[0])) {
          member = await fetchMember(
            message.guild,
            args[0]
          );
        }

        if (!member) {
          member = message.member;
        }

        if (!isStaff(member)) {
          return message.reply(
            "❌ אפשר להציג `!rank` רק עבור חבר צוות."
          );
        }

        return message.channel.send({
          embeds: [
            buildRankEmbed(
              message.guild,
              member
            )
          ]
        });
      }

      // ---------- BALANCE ----------

      if (command === "xp" || command === "balance") {
        return message.reply(
          `💰 יש לך **${profile.xp.toLocaleString("en-US")} XP**.`
        );
      }

      if (command === "casino") {
        return message.reply({
          embeds: [casinoInfoEmbed()]
        });
      }

      // ---------- LEADERBOARD ----------

      if (command === "leaderboard" || command === "lb") {
        const top = Object.entries(
          getGuildXp(message.guild.id).users
        )
          .sort(
            (a, b) =>
              Number(b[1]?.xp || 0) -
              Number(a[1]?.xp || 0)
          )
          .slice(0, 10);

        if (!top.length) {
          return message.reply(
            "אין עדיין XP במערכת."
          );
        }

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Gold")
              .setTitle("🏆 Noabop XP Leaderboard")
              .setDescription(
                top.map(
                  ([userId, data], index) =>
                    `**${index + 1}.** <@${userId}> — **${Number(data.xp || 0).toLocaleString("en-US")} XP**`
                ).join("\n")
              )
              .setTimestamp()
          ]
        });
      }

      // ---------- DAILY ----------

      if (command === "daily") {
        const dayMs = 24 * 60 * 60 * 1000;

        const left =
          dayMs -
          (Date.now() - profile.lastDailyAt);

        if (left > 0) {
          const hours = Math.floor(
            left / (60 * 60 * 1000)
          );

          const minutes = Math.ceil(
            (left % (60 * 60 * 1000)) / 60000
          );

          return message.reply(
            `⏳ כבר לקחת Daily. חזור בעוד **${hours}h ${minutes}m**.`
          );
        }

        const min = Number(config.dailyXpMin || 250);
        const max = Number(config.dailyXpMax || 500);

        const reward = randomInt(
          Math.min(min, max),
          Math.max(min, max)
        );

        profile.xp += reward;
        profile.lastDailyAt = Date.now();

        saveXp();

        return message.reply(
          `🎁 קיבלת **${reward.toLocaleString("en-US")} XP** מה־Daily!`
        );
      }

      // ---------- COINFLIP ----------

      if (command === "coinflip" || command === "cf") {
        const choiceRaw = String(args[1] || "").toLowerCase();

        const choice =
          ["heads", "head", "h"].includes(choiceRaw)
            ? "heads"
            : (
                ["tails", "tail", "t"].includes(choiceRaw)
                  ? "tails"
                  : null
              );

        if (!choice) {
          return message.reply(
            "❌ שימוש: `!coinflip <xp> <heads/tails>`"
          );
        }

        const check = casinoCheck(
          message.guild.id,
          message.author.id,
          Number(args[0])
        );

        if (!check.ok) {
          return message.reply(check.message);
        }

        const result =
          Math.random() < 0.5
            ? "heads"
            : "tails";

        if (result === choice) {
          changeXp(
            message.guild.id,
            message.author.id,
            check.bet
          );

          return message.reply(
            `🪙 יצא **${result}** — ניצחת **${check.bet.toLocaleString("en-US")} XP**!`
          );
        }

        changeXp(
          message.guild.id,
          message.author.id,
          -check.bet
        );

        return message.reply(
          `🪙 יצא **${result}** — הפסדת **${check.bet.toLocaleString("en-US")} XP**.`
        );
      }

      // ---------- DICE ----------

      if (command === "dice") {
        const picked = Number(args[1]);

        if (
          !Number.isInteger(picked) ||
          picked < 1 ||
          picked > 6
        ) {
          return message.reply(
            "❌ שימוש: `!dice <xp> <1-6>`"
          );
        }

        const check = casinoCheck(
          message.guild.id,
          message.author.id,
          Number(args[0])
        );

        if (!check.ok) {
          return message.reply(check.message);
        }

        const result = randomInt(1, 6);

        if (result === picked) {
          const profit = check.bet * 4;

          changeXp(
            message.guild.id,
            message.author.id,
            profit
          );

          return message.reply(
            `🎲 יצא **${result}** — פגיעה! זכית **${profit.toLocaleString("en-US")} XP**.`
          );
        }

        changeXp(
          message.guild.id,
          message.author.id,
          -check.bet
        );

        return message.reply(
          `🎲 יצא **${result}** — הפסדת **${check.bet.toLocaleString("en-US")} XP**.`
        );
      }

      // ---------- SLOTS ----------

      if (command === "slots") {
        const check = casinoCheck(
          message.guild.id,
          message.author.id,
          Number(args[0])
        );

        if (!check.ok) {
          return message.reply(check.message);
        }

        const symbols = [
          "🍒", "🍋", "🍇", "🔔", "💎"
        ];

        const reels = [
          symbols[randomInt(0, symbols.length - 1)],
          symbols[randomInt(0, symbols.length - 1)],
          symbols[randomInt(0, symbols.length - 1)]
        ];

        const allSame =
          reels[0] === reels[1] &&
          reels[1] === reels[2];

        const pair =
          new Set(reels).size === 2;

        let profit = -check.bet;
        let resultText = "הפסדת";

        if (allSame) {
          profit = check.bet * 5;
          resultText = "JACKPOT";
        } else if (pair) {
          profit = check.bet;
          resultText = "זכית";
        }

        changeXp(
          message.guild.id,
          message.author.id,
          profit
        );

        return message.reply(
          `🎰 | ${reels.join(" | ")} |\n` +
          `**${resultText}** ${Math.abs(profit).toLocaleString("en-US")} XP${profit >= 0 ? "!" : "."}`
        );
      }

      // ---------- ROULETTE ----------

      if (command === "roulette") {
        const choice = String(args[1] || "").toLowerCase();

        if (!["red", "black", "green"].includes(choice)) {
          return message.reply(
            "❌ שימוש: `!roulette <xp> <red/black/green>`"
          );
        }

        const check = casinoCheck(
          message.guild.id,
          message.author.id,
          Number(args[0])
        );

        if (!check.ok) {
          return message.reply(check.message);
        }

        const roll = randomInt(1, 100);

        const result =
          roll <= 47
            ? "red"
            : (
                roll <= 94
                  ? "black"
                  : "green"
              );

        if (result === choice) {
          const profit =
            check.bet *
            (result === "green" ? 10 : 1);

          changeXp(
            message.guild.id,
            message.author.id,
            profit
          );

          return message.reply(
            `🎡 יצא **${result}** — זכית **${profit.toLocaleString("en-US")} XP**!`
          );
        }

        changeXp(
          message.guild.id,
          message.author.id,
          -check.bet
        );

        return message.reply(
          `🎡 יצא **${result}** — הפסדת **${check.bet.toLocaleString("en-US")} XP**.`
        );
      }

      // ---------- BLACKJACK ----------

      if (command === "blackjack" || command === "bj") {
        const key = blackjackKey(
          message.guild.id,
          message.author.id
        );

        if (blackjackGames.has(key)) {
          return message.reply(
            "❌ כבר יש לך משחק Blackjack פעיל."
          );
        }

        const check = casinoCheck(
          message.guild.id,
          message.author.id,
          Number(args[0])
        );

        if (!check.ok) {
          return message.reply(check.message);
        }

        const game = {
          guildId: message.guild.id,
          userId: message.author.id,
          channelId: message.channel.id,
          bet: check.bet,
          player: [
            drawBlackjackCard(),
            drawBlackjackCard()
          ],
          dealer: [
            drawBlackjackCard(),
            drawBlackjackCard()
          ]
        };

        blackjackGames.set(key, game);

        return message.reply({
          embeds: [
            blackjackEmbed(
              message.author,
              game
            )
          ],
          components: blackjackButtons(
            message.author.id
          )
        });
      }

      // ---------- STAFF XP ----------

      if (
        ["addxp", "removexp", "setxp"].includes(command)
      ) {
        if (!isStaff(message.member)) {
          return message.reply(
            "❌ רק Staff יכולים להשתמש בפקודה הזאת."
          );
        }

        const target = message.mentions.users.first();
        const amount = Number(args[1]);

        if (
          !target ||
          !Number.isInteger(amount) ||
          amount < 0
        ) {
          return message.reply(
            `❌ שימוש: \`${prefix}${command} @user <amount>\``
          );
        }

        const targetProfile = getXpProfile(
          message.guild.id,
          target.id
        );

        if (command === "addxp") {
          targetProfile.xp += amount;
        }

        if (command === "removexp") {
          targetProfile.xp = Math.max(
            0,
            targetProfile.xp - amount
          );
        }

        if (command === "setxp") {
          targetProfile.xp = amount;
        }

        saveXp();

        return message.reply(
          `✅ ל־${target} יש עכשיו **${targetProfile.xp.toLocaleString("en-US")} XP**.`
        );
      }
    } catch (error) {
      console.error("❌ MessageCreate error:", error);
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
      // ---------- STAFF APPLICATION BUTTON ----------

      if (
        interaction.isButton() &&
        interaction.customId === "staff_apply"
      ) {
        return openTicket(
          interaction,
          "staff_test"
        );
      }

      // ---------- TICKET TYPE ----------

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId === "ticket_type_select"
      ) {
        return openTicket(
          interaction,
          interaction.values[0]
        );
      }

      // ---------- TICKET MODALS ----------

      if (interaction.isModalSubmit()) {
        if (
          ![
            "ticket_add_modal",
            "ticket_remove_modal"
          ].includes(interaction.customId)
        ) {
          return;
        }

        const data = parseTicketTopic(interaction.channel);

        if (!data) {
          return interaction.reply({
            content: "❌ זה לא טיקט.",
            ephemeral: true
          });
        }

        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content:
              "❌ רק Staff יכול לעשות את זה.",
            ephemeral: true
          });
        }

        const userId = interaction.fields
          .getTextInputValue("ticket_user_id")
          .trim()
          .replace(/[<@!>]/g, "");

        const member = await fetchMember(
          interaction.guild,
          userId
        );

        if (!member) {
          return interaction.reply({
            content:
              "❌ לא מצאתי משתמש עם ה־ID הזה.",
            ephemeral: true
          });
        }

        if (interaction.customId === "ticket_add_modal") {
          await interaction.channel.permissionOverwrites.edit(
            member.id,
            {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true
            }
          );

          return interaction.reply({
            content:
              `✅ ${member} נוסף לטיקט.`,
            ephemeral: true
          });
        }

        if (member.id === data.ownerId) {
          return interaction.reply({
            content:
              "❌ אי אפשר להסיר את בעל הטיקט.",
            ephemeral: true
          });
        }

        await interaction.channel.permissionOverwrites
          .delete(member.id)
          .catch(() => {});

        return interaction.reply({
          content:
            `✅ ${member} הוסר מהטיקט.`,
          ephemeral: true
        });
      }

      // ---------- BUTTONS ----------

      if (interaction.isButton()) {
        // HELP

        if (
          interaction.customId.startsWith(
            "take_help_request:"
          )
        ) {
          if (!isStaff(interaction.member)) {
            return interaction.reply({
              content:
                "❌ רק צוות יכול לקחת בקשות עזרה.",
              ephemeral: true
            });
          }

          const [
            ,
            requesterId,
            requestId
          ] = interaction.customId.split(":");

          const requester = await fetchMember(
            interaction.guild,
            requesterId
          );

          const reason =
            interaction.message.embeds[0]
              ?.fields
              ?.find(field => field.name === "סיבה:")
              ?.value ||
            "לא צוינה סיבה";

          const claimedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(interaction.customId)
              .setLabel("בטיפול")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true)
          );

          addHelpTaken(
            interaction.guild.id,
            interaction.user.id
          );

          return interaction.update({
            embeds: [
              helpRequestEmbed(
                requester || `<@${requesterId}>`,
                reason,
                requestId,
                interaction.user
              )
            ],
            components: [claimedRow]
          });
        }

        // BLACKJACK

        if (
          interaction.customId.startsWith("bj_hit:") ||
          interaction.customId.startsWith("bj_stand:")
        ) {
          const [action, ownerId] =
            interaction.customId.split(":");

          if (interaction.user.id !== ownerId) {
            return interaction.reply({
              content:
                "❌ זה לא משחק ה־Blackjack שלך.",
              ephemeral: true
            });
          }

          const key = blackjackKey(
            interaction.guild.id,
            ownerId
          );

          const game = blackjackGames.get(key);

          if (!game) {
            return interaction.reply({
              content:
                "❌ המשחק כבר הסתיים.",
              ephemeral: true
            });
          }

          if (interaction.channel.id !== game.channelId) {
            return interaction.reply({
              content:
                "❌ המשחק הזה שייך לחדר אחר.",
              ephemeral: true
            });
          }

          if (action === "bj_hit") {
            game.player.push(drawBlackjackCard());

            const total = blackjackTotal(game.player);

            if (total > 21) {
              blackjackGames.delete(key);
              changeXp(
                game.guildId,
                game.userId,
                -game.bet
              );

              return interaction.update({
                embeds: [
                  blackjackEmbed(
                    interaction.user,
                    game,
                    `💥 Bust — הפסדת **${game.bet.toLocaleString("en-US")} XP**.`
                  )
                ],
                components:
                  blackjackButtons(ownerId, true)
              });
            }

            if (total === 21) {
              return finishBlackjack(
                interaction,
                game
              );
            }

            blackjackGames.set(key, game);

            return interaction.update({
              embeds: [
                blackjackEmbed(
                  interaction.user,
                  game
                )
              ],
              components:
                blackjackButtons(ownerId, false)
            });
          }

          return finishBlackjack(
            interaction,
            game
          );
        }

        // XP SHOP

        if (
          interaction.customId
            .startsWith("xp_shop_buy:")
        ) {
          const itemKey =
            interaction.customId
              .slice(
                "xp_shop_buy:".length
              );

          return handleXpShopPurchase(
            interaction,
            itemKey
          );
        }

        // TICKETS

        if (
          [
            "ticket_claim",
            "ticket_release",
            "ticket_add",
            "ticket_remove",
            "ticket_close"
          ].includes(interaction.customId)
        ) {
          const data = parseTicketTopic(
            interaction.channel
          );

          if (!data) {
            return interaction.reply({
              content: "❌ זה לא טיקט.",
              ephemeral: true
            });
          }

          if (!isStaff(interaction.member)) {
            return interaction.reply({
              content:
                "❌ רק Staff יכול להשתמש בכפתורי הטיקט.",
              ephemeral: true
            });
          }

          if (interaction.customId === "ticket_claim") {
            if (data.claimedBy) {
              return interaction.reply({
                content:
                  `❌ הטיקט כבר בטיפול של <@${data.claimedBy}>.`,
                ephemeral: true
              });
            }

            data.claimedBy = interaction.user.id;
            await setTicketTopic(interaction.channel, data);

            addTicketTaken(
              interaction.guild.id,
              interaction.user.id
            );

            await interaction.message.edit({
              components: ticketButtons(true)
            });

            return interaction.reply({
              content:
                `✅ ${interaction.user} לקח את הטיקט לטיפול.`
            });
          }

          if (interaction.customId === "ticket_release") {
            if (
              data.claimedBy &&
              data.claimedBy !== interaction.user.id &&
              !interaction.member.permissions.has(
                PermissionFlagsBits.Administrator
              )
            ) {
              return interaction.reply({
                content:
                  "❌ רק מי שלקח את הטיקט או Admin יכול לשחרר אותו.",
                ephemeral: true
              });
            }

            data.claimedBy = null;
            await setTicketTopic(interaction.channel, data);

            await interaction.message.edit({
              components: ticketButtons(false)
            });

            return interaction.reply({
              content: "✅ הטיקט שוחרר."
            });
          }

          if (
            interaction.customId === "ticket_add" ||
            interaction.customId === "ticket_remove"
          ) {
            const add =
              interaction.customId === "ticket_add";

            const modal = new ModalBuilder()
              .setCustomId(
                add
                  ? "ticket_add_modal"
                  : "ticket_remove_modal"
              )
              .setTitle(
                add
                  ? "Add User"
                  : "Remove User"
              );

            const input = new TextInputBuilder()
              .setCustomId("ticket_user_id")
              .setLabel("User ID")
              .setStyle(TextInputStyle.Short)
              .setRequired(true);

            modal.addComponents(
              new ActionRowBuilder().addComponents(input)
            );

            return interaction.showModal(modal);
          }

          if (interaction.customId === "ticket_close") {
            await interaction.deferReply({
              ephemeral: true
            });

            const transcript =
              await transcriptBuffer(interaction.channel);

            if (config.ticketLogsChannelId) {
              const logs = await interaction.guild.channels
                .fetch(config.ticketLogsChannelId)
                .catch(() => null);

              if (logs?.isTextBased()) {
                const file = new AttachmentBuilder(
                  transcript,
                  {
                    name:
                      `${interaction.channel.name}-transcript.txt`
                  }
                );

                await logs.send({
                  content:
                    `🧾 Transcript — ${interaction.channel.name}\n` +
                    `👤 Owner: <@${data.ownerId}>\n` +
                    `🔒 Closed by: ${interaction.user}`,
                  files: [file]
                }).catch(() => {});
              }
            }

            await interaction.editReply(
              "✅ הטיקט נסגר. החדר יימחק בעוד 3 שניות."
            );

            setTimeout(() => {
              interaction.channel.delete(
                `Closed by ${interaction.user.tag}`
              ).catch(() => {});
            }, 3000);

            return;
          }
        }
      }

      // ---------- SLASH ----------

      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === "ping") {
        const responseMs = Math.max(
          0,
          Date.now() - interaction.createdTimestamp
        );

        return interaction.reply({
          content:
            `🏓 **Pong!**\n` +
            `🤖 Bot: **${responseMs}ms**\n` +
            `🌐 Discord WS: **${client.ws.ping}ms**`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "ticket-panel") {
        if (
          !canSendSetupPanels(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ אין לך גישה. צריך Staff, Manage Server, Administrator או להיות Owner של השרת.",
            ephemeral: true
          });
        }

        await interaction.channel.send(
          ticketPanel()
        );

        return interaction.reply({
          content:
            "✅ פאנל מרכז התמיכה נשלח.",
          ephemeral: true
        });
      }

      if (interaction.commandName === "staff-panel") {
        if (
          !canSendSetupPanels(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ אין לך גישה. צריך Staff, Manage Server, Administrator או להיות Owner של השרת.",
            ephemeral: true
          });
        }

        if (!interaction.channel?.isTextBased()) {
          return interaction.reply({
            content:
              "❌ אפשר לשלוח את פאנל הגיוס רק בחדר טקסט.",
            ephemeral: true
          });
        }

        await interaction.channel.send(
          staffApplicationPanel()
        );

        return interaction.reply({
          content:
            "✅ פאנל הגיוס לצוות נשלח.",
          ephemeral: true
        });
      }

      if (
        interaction.commandName ===
        "setup-xp-shop"
      ) {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content:
              "❌ רק Staff יכול לשלוח את פאנל ה־XP Shop.",
            ephemeral: true
          });
        }

        if (!interaction.channel?.isTextBased()) {
          return interaction.reply({
            content:
              "❌ אפשר לשלוח את הפאנל רק בחדר טקסט.",
            ephemeral: true
          });
        }

        const panel =
          buildXpShopPanel();

        if (!panel) {
          return interaction.reply({
            content:
              "❌ אין פריטים תקינים ב־`xpShop` בתוך config.js.",
            ephemeral: true
          });
        }

        await interaction.channel.send(
          panel
        );

        return interaction.reply({
          content:
            "✅ פאנל ה־XP Shop נשלח.",
          ephemeral: true
        });
      }

      const moderationCommands = [
        "warn",
        "warnings",
        "unwarn",
        "clear-warns",
        "mute",
        "unvoice-mute",
        "chat-mute",
        "un-chat-mute",
        "timeout",
        "untimeout",
        "kick",
        "ban",
        "clear"
      ];

      if (
        moderationCommands.includes(
          interaction.commandName
        ) &&
        !isStaff(interaction.member)
      ) {
        return interaction.reply({
          content:
            "❌ אין לך גישה לפקודת המודרציה הזאת.",
          ephemeral: true
        });
      }

      // WARN

      if (interaction.commandName === "warn") {
        const user =
          interaction.options.getUser("user");

        const reason =
          interaction.options.getString("reason") ||
          "לא צוינה סיבה";

        if (user.bot) {
          return interaction.reply({
            content:
              "❌ אי אפשר לתת Warn לבוט.",
            ephemeral: true
          });
        }

        if (user.id === interaction.user.id) {
          return interaction.reply({
            content:
              "❌ אי אפשר לתת Warn לעצמך.",
            ephemeral: true
          });
        }

        if (user.id === interaction.guild.ownerId) {
          return interaction.reply({
            content:
              "❌ אי אפשר לתת Warn לבעל השרת.",
            ephemeral: true
          });
        }

        const member = await fetchMember(
          interaction.guild,
          user.id
        );

        if (!member) {
          return interaction.reply({
            content:
              "❌ המשתמש לא נמצא בשרת.",
            ephemeral: true
          });
        }

        const warning = addWarn(
          interaction.guild.id,
          user.id,
          interaction.user.id,
          reason
        );

        const count = getUserWarns(
          interaction.guild.id,
          user.id
        ).warns.length;

        const autoPunishment =
          await applyAutomaticWarnPunishment(
            interaction.guild,
            member
          ).catch(error => {
            console.error(
              "❌ Automatic warn punishment error:",
              error
            );

            return {
              ok: false,
              text: "ה־Warn נשמר, אבל העונש האוטומטי נכשל."
            };
          });

        await user.send(
          `⚠️ קיבלת Warn ב־**${interaction.guild.name}**.\n` +
          `ID: **${warning.id}**\n` +
          `סיבה: ${reason}\n` +
          `Warns פעילים: **${count}**` +
          `${autoPunishment ? `\n${autoPunishment.text}` : ""}`
        ).catch(() => {});

        await sendModLog(
          interaction.guild,
          modEmbed(
            "⚠️ Warn",
            "Yellow",
            [
              {
                name: "משתמש",
                value: `${user}`
              },
              {
                name: "צוות",
                value: `${interaction.user}`
              },
              {
                name: "Warn ID",
                value: warning.id
              },
              {
                name: "סיבה",
                value: reason
              },
              {
                name: "Warns פעילים",
                value: String(count)
              },
              {
                name: "עונש אוטומטי",
                value:
                  autoPunishment
                    ? autoPunishment.text
                    : "אין כרגע"
              }
            ]
          )
        );

        return interaction.reply({
          content:
            `✅ ${user} קיבל Warn **${warning.id}**.` +
            `${autoPunishment ? `\n${autoPunishment.text}` : ""}`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "warnings") {
        const user =
          interaction.options.getUser("user");

        const warns = getUserWarns(
          interaction.guild.id,
          user.id
        ).warns;

        if (!warns.length) {
          return interaction.reply({
            content:
              `✅ ל־${user} אין Warns פעילים.`,
            ephemeral: true
          });
        }

        const text = warns
          .slice(-20)
          .map(warn => {
            const timestamp = Math.floor(
              warn.createdAt / 1000
            );

            return (
              `**${warn.id}** • ${warn.reason}\n` +
              `צוות: <@${warn.moderatorId}> • <t:${timestamp}:R>`
            );
          })
          .join("\n\n");

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Yellow")
              .setTitle(
                `⚠️ Warns — ${user.username}`
              )
              .setDescription(text)
              .setFooter({
                text: `Total: ${warns.length}`
              })
          ],
          ephemeral: true
        });
      }

      if (interaction.commandName === "unwarn") {
        const user =
          interaction.options.getUser("user");

        const id =
          interaction.options.getString("id");

        const removed = deleteWarn(
          interaction.guild.id,
          user.id,
          id
        );

        if (!removed) {
          return interaction.reply({
            content:
              "❌ לא מצאתי Warn עם ה־ID הזה.",
            ephemeral: true
          });
        }

        return interaction.reply({
          content:
            `✅ Warn **${removed.id}** הוסר מ־${user}.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "clear-warns") {
        const user =
          interaction.options.getUser("user");

        const data = getUserWarns(
          interaction.guild.id,
          user.id
        );

        const count = data.warns.length;

        data.warns = [];
        data.appliedThresholds = [];
        saveWarns();

        return interaction.reply({
          content:
            `✅ נמחקו **${count} Warns** מ־${user}.`,
          ephemeral: true
        });
      }

      // VOICE MUTE

      if (interaction.commandName === "mute") {
        const user =
          interaction.options.getUser("user");

        const duration = parseDuration(
          interaction.options.getString("duration"),
          28
        );

        const reason =
          interaction.options.getString("reason") ||
          "לא צוינה סיבה";

        if (!duration) {
          return interaction.reply({
            content: "❌ זמן לא תקין.",
            ephemeral: true
          });
        }

        const member = await fetchMember(
          interaction.guild,
          user.id
        );

        if (!member?.voice.channelId) {
          return interaction.reply({
            content:
              "❌ המשתמש לא נמצא כרגע ב־Voice.",
            ephemeral: true
          });
        }

        await member.voice.setMute(
          true,
          `${reason} | Noabop Voice Mute by ${interaction.user.tag}`
        );

        addModTimer({
          guildId: interaction.guild.id,
          userId: user.id,
          type: "voice-mute",
          expiresAt: Date.now() + duration,
          reason,
          moderatorId: interaction.user.id
        });

        await sendModLog(
          interaction.guild,
          modEmbed(
            "🔇 Voice Mute",
            "Orange",
            [
              {
                name: "משתמש",
                value: `${user}`
              },
              {
                name: "זמן",
                value: formatDuration(duration)
              },
              {
                name: "צוות",
                value: `${interaction.user}`
              },
              {
                name: "סיבה",
                value: reason
              }
            ]
          )
        );

        return interaction.reply({
          content:
            `✅ ${user} קיבל Voice Mute ל־**${formatDuration(duration)}**.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "unvoice-mute") {
        const user =
          interaction.options.getUser("user");

        const member = await fetchMember(
          interaction.guild,
          user.id
        );

        if (!member?.voice.channelId) {
          return interaction.reply({
            content:
              "❌ המשתמש לא נמצא כרגע ב־Voice.",
            ephemeral: true
          });
        }

        await member.voice.setMute(
          false,
          `Noabop Voice Unmute by ${interaction.user.tag}`
        );

        removeModTimer(
          interaction.guild.id,
          user.id,
          "voice-mute"
        );

        return interaction.reply({
          content:
            `✅ ה־Voice Mute הוסר מ־${user}.`,
          ephemeral: true
        });
      }

      // CHAT MUTE

      if (interaction.commandName === "chat-mute") {
        const user =
          interaction.options.getUser("user");

        const duration = parseDuration(
          interaction.options.getString("duration"),
          28
        );

        const reason =
          interaction.options.getString("reason") ||
          "לא צוינה סיבה";

        if (!duration || !config.muteRoleId) {
          return interaction.reply({
            content:
              "❌ זמן לא תקין או שחסר `muteRoleId`.",
            ephemeral: true
          });
        }

        const member = await fetchMember(
          interaction.guild,
          user.id
        );

        const role = await interaction.guild.roles
          .fetch(config.muteRoleId)
          .catch(() => null);

        if (!member || !role) {
          return interaction.reply({
            content:
              "❌ משתמש או רול Mute לא נמצא.",
            ephemeral: true
          });
        }

        const botMember = await interaction.guild.members
          .fetchMe();

        if (
          !botMember.permissions.has(
            PermissionFlagsBits.ManageRoles
          ) ||
          role.position >= botMember.roles.highest.position
        ) {
          return interaction.reply({
            content:
              "❌ הבוט לא יכול לנהל את רול ה־Mute.",
            ephemeral: true
          });
        }

        await member.roles.add(
          role,
          `${reason} | Noabop Chat Mute by ${interaction.user.tag}`
        );

        addModTimer({
          guildId: interaction.guild.id,
          userId: user.id,
          type: "chat-mute",
          expiresAt: Date.now() + duration,
          reason,
          moderatorId: interaction.user.id
        });

        return interaction.reply({
          content:
            `✅ ${user} קיבל Chat Mute ל־**${formatDuration(duration)}**.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "un-chat-mute") {
        const user =
          interaction.options.getUser("user");

        const member = await fetchMember(
          interaction.guild,
          user.id
        );

        const role = await interaction.guild.roles
          .fetch(config.muteRoleId)
          .catch(() => null);

        if (!member || !role) {
          return interaction.reply({
            content:
              "❌ משתמש או רול Mute לא נמצא.",
            ephemeral: true
          });
        }

        await member.roles.remove(
          role,
          `Noabop Chat Unmute by ${interaction.user.tag}`
        ).catch(() => {});

        removeModTimer(
          interaction.guild.id,
          user.id,
          "chat-mute"
        );

        return interaction.reply({
          content:
            `✅ ה־Chat Mute הוסר מ־${user}.`,
          ephemeral: true
        });
      }

      // TIMEOUT

      if (interaction.commandName === "timeout") {
        const user =
          interaction.options.getUser("user");

        const duration = parseDuration(
          interaction.options.getString("duration"),
          28
        );

        const reason =
          interaction.options.getString("reason") ||
          "לא צוינה סיבה";

        if (!duration) {
          return interaction.reply({
            content: "❌ זמן לא תקין.",
            ephemeral: true
          });
        }

        const member = await fetchMember(
          interaction.guild,
          user.id
        );

        if (!member?.moderatable) {
          return interaction.reply({
            content:
              "❌ אי אפשר לתת Timeout למשתמש הזה.",
            ephemeral: true
          });
        }

        await member.timeout(
          duration,
          `${reason} | Noabop by ${interaction.user.tag}`
        );

        return interaction.reply({
          content:
            `✅ ${user} קיבל Timeout ל־**${formatDuration(duration)}**.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "untimeout") {
        const user =
          interaction.options.getUser("user");

        const member = await fetchMember(
          interaction.guild,
          user.id
        );

        if (!member) {
          return interaction.reply({
            content: "❌ המשתמש לא נמצא.",
            ephemeral: true
          });
        }

        await member.timeout(
          null,
          `Noabop UnTimeout by ${interaction.user.tag}`
        );

        return interaction.reply({
          content:
            `✅ Timeout הוסר מ־${user}.`,
          ephemeral: true
        });
      }

      // KICK

      if (interaction.commandName === "kick") {
        const user =
          interaction.options.getUser("user");

        const reason =
          interaction.options.getString("reason") ||
          "לא צוינה סיבה";

        const member = await fetchMember(
          interaction.guild,
          user.id
        );

        if (!member?.kickable) {
          return interaction.reply({
            content:
              "❌ אי אפשר לעשות Kick למשתמש הזה.",
            ephemeral: true
          });
        }

        await member.kick(
          `${reason} | Noabop by ${interaction.user.tag}`
        );

        return interaction.reply({
          content:
            `✅ ${user.tag} קיבל Kick.`,
          ephemeral: true
        });
      }

      // BAN

      if (interaction.commandName === "ban") {
        const user =
          interaction.options.getUser("user");

        const reason =
          interaction.options.getString("reason") ||
          "לא צוינה סיבה";

        const member = await fetchMember(
          interaction.guild,
          user.id
        );

        if (member && !member.bannable) {
          return interaction.reply({
            content:
              "❌ אי אפשר לעשות Ban למשתמש הזה.",
            ephemeral: true
          });
        }

        await interaction.guild.members.ban(
          user.id,
          {
            reason:
              `${reason} | Noabop by ${interaction.user.tag}`
          }
        );

        return interaction.reply({
          content:
            `✅ ${user.tag} קיבל Ban.`,
          ephemeral: true
        });
      }

      // CLEAR

      if (interaction.commandName === "clear") {
        const amount =
          interaction.options.getInteger("amount");

        const deleted = await interaction.channel
          .bulkDelete(amount, true);

        return interaction.reply({
          content:
            `✅ נמחקו **${deleted.size}** הודעות.`,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error("❌ Interaction error:", error);

      if (interaction.isRepliable()) {
        const data = {
          content:
            "❌ קרתה שגיאה. בדוק את ה־Logs ב־Railway.",
          ephemeral: true
        };

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(data).catch(() => {});
        } else {
          await interaction.reply(data).catch(() => {});
        }
      }
    }
  }
);

// =====================
// CONNECTION SAFETY
// =====================

// Discord.js emits network/WebSocket errors through the Client.
// Without an "error" listener, Node treats them as unhandled
// EventEmitter errors and can terminate the whole process.
client.on("error", error => {
  console.error(
    "⚠️ Discord client error (kept alive):",
    error
  );
});

client.on("warn", warning => {
  console.warn(
    "⚠️ Discord client warning:",
    warning
  );
});

// Keep rejected async network operations from becoming an
// unhandled process-level rejection.
process.on("unhandledRejection", error => {
  console.error(
    "⚠️ Unhandled promise rejection (kept alive):",
    error
  );
});

// =====================
// LOGIN WITH RETRY
// =====================

if (!process.env.TOKEN) {
  console.error("❌ TOKEN missing.");
  process.exit(1);
}

let loginRetryTimer = null;
let loginAttempt = 0;

async function loginWithRetry() {
  try {
    loginAttempt += 1;

    console.log(
      `🔌 Discord login attempt ${loginAttempt}...`
    );

    await client.login(
      process.env.TOKEN
    );

    loginAttempt = 0;

    if (loginRetryTimer) {
      clearTimeout(
        loginRetryTimer
      );

      loginRetryTimer = null;
    }
  } catch (error) {
    console.error(
      "❌ Discord login/network error:",
      error
    );

    const delayMs =
      Math.min(
        60 * 1000,
        Math.max(
          10 * 1000,
          loginAttempt *
            10 *
            1000
        )
      );

    console.log(
      `🔁 Retrying Discord login in ${Math.ceil(delayMs / 1000)}s...`
    );

    loginRetryTimer =
      setTimeout(
        loginWithRetry,
        delayMs
      );
  }
}

loginWithRetry();
