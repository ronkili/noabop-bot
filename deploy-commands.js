require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const config = require("./config");

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("בדיקת פינג של NoaBop"),

  new SlashCommandBuilder()
    .setName("verify-panel")
    .setDescription("שולח Verify פשוט בלחיצה אחת"),

  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("שולח את פאנל הטיקטים"),

  new SlashCommandBuilder()
    .setName("staff-panel")
    .setDescription("שולח Apply For Staff"),

  new SlashCommandBuilder()
    .setName("setup-take-role")
    .setDescription("שולח פאנל קבלת רולים לפי ה־IDs שב־config"),

  new SlashCommandBuilder()
    .setName("chatmute")
    .setDescription("Chat Mute לצוות בלבד")
    .addSubcommand(
      sub =>
        sub
          .setName("add")
          .setDescription("נותן Chat Mute")
          .addUserOption(
            option =>
              option
                .setName("user")
                .setDescription("המשתמש")
                .setRequired(true)
          )
          .addStringOption(
            option =>
              option
                .setName("duration")
                .setDescription("משך ה־Mute")
                .setRequired(true)
                .addChoices(
                  { name: "10 דקות", value: "10m" },
                  { name: "30 דקות", value: "30m" },
                  { name: "שעה", value: "1h" },
                  { name: "שעתיים", value: "2h" },
                  { name: "6 שעות", value: "6h" },
                  { name: "12 שעות", value: "12h" },
                  { name: "יום", value: "1d" },
                  { name: "3 ימים", value: "3d" },
                  { name: "7 ימים", value: "7d" },
                  { name: "לצמיתות", value: "permanent" }
                )
          )
          .addStringOption(
            option =>
              option
                .setName("reason")
                .setDescription("סיבה")
                .setRequired(false)
          )
    )
    .addSubcommand(
      sub =>
        sub
          .setName("remove")
          .setDescription("מסיר Chat Mute")
          .addUserOption(
            option =>
              option
                .setName("user")
                .setDescription("המשתמש")
                .setRequired(true)
          )
          .addStringOption(
            option =>
              option
                .setName("reason")
                .setDescription("סיבה")
                .setRequired(false)
          )
    )
].map(command =>
  command.toJSON()
);

const rest =
  new REST({
    version: "10"
  }).setToken(
    process.env.TOKEN
  );

(async () => {
  try {
    console.log(
      "🔄 Deploying NoaBop commands..."
    );

    await rest.put(
      Routes.applicationGuildCommands(
        config.clientId,
        config.guildId
      ),
      {
        body: commands
      }
    );

    console.log(
      "✅ NoaBop commands deployed."
    );
  } catch (error) {
    console.error(
      "❌ Deploy error:",
      error
    );

    process.exitCode = 1;
  }
})();
