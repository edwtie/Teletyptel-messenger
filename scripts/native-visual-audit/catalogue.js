"use strict";

const screens = Object.freeze([
  ["login", "Aanmelden", "TeleTypTelNativeApp.swift", "login-settings"],
  ["login-settings", "Serverinstellingen", "TeleTypTelNativeApp.swift", "server-address"],
  ["startup-checking", "Server controleren", "TeleTypTelNativeApp.swift", "startup-progress"],
  ["startup-offline", "Server onbereikbaar", "TeleTypTelNativeApp.swift", "startup-retry"],
  ["startup-certificate", "Certificaatfout", "TeleTypTelNativeApp.swift", "startup-failure-title"],
  ["registration", "Registreren", "NativeAccountLifecycleView.swift", ""],
  ["password-reset", "Wachtwoord herstellen", "NativeAccountLifecycleView.swift", ""],
  ["two-factor-login", "Tweestapsaanmelding", "TeleTypTelNativeApp.swift", ""],
  ["contacts", "Contacten", "NativeTranslationView.swift", "messenger-main-menu"],
  ["main-menu", "Hoofdmenu", "NativeTranslationView.swift", "main-menu-grid"],
  ["new-contact", "Nieuw contact", "NativeNewContactView.swift", ""],
  ["contact-profile", "Contactprofiel", "NativeChatView.swift", ""],
  ["chat", "Privégesprek", "NativeChatView.swift", "chat-draft"],
  ["conversation-menu", "Gespreksmenu", "NativeChatView.swift", "chat-menu"],
  ["message-menu", "Berichtmenu", "NativeChatView.swift", "message-menu-"],
  ["message-reactions", "Reacties", "NativeChatEnhancements.swift", ""],
  ["message-edit", "Bericht bewerken", "NativeMessageActionsView.swift", ""],
  ["message-forward", "Bericht doorsturen", "NativeMessageActionsView.swift", ""],
  ["message-delete", "Bericht verwijderen", "NativeChatView.swift", ""],
  ["attachments", "Bijlagenmenu", "NativeAttachmentsView.swift", ""],
  ["smileys", "Smileys", "NativeSmileys.swift", "smiley-picker"],
  ["translation", "Vertaalvoorkeuren", "NativeTranslationView.swift", ""],
  ["appearance", "Weergave", "NativeAppearanceView.swift", "render-smileys"],
  ["account", "Accountinstellingen", "NativeAccountSettingsView.swift", ""],
  ["profile-edit", "Eigen profiel en avatar", "NativeAvatarEditorView.swift", ""],
  ["account-security", "Accountbeveiliging", "NativeAccountLifecycleView.swift", ""],
  ["history", "Online geschiedenis", "NativeHistoryBrowserView.swift", ""],
  ["archive", "Archief", "NativeHistoryBrowserView.swift", ""],
  ["groups", "Groepenoverzicht", "NativeGroupsView.swift", ""],
  ["group-chat", "Groepsgesprek", "NativeGroupsView.swift", "group-smileys"],
  ["group-create", "Groep maken", "NativeGroupsView.swift", ""],
  ["group-management", "Groepsbeheer", "NativeGroupManagementView.swift", ""],
  ["group-invite", "Groepsuitnodiging", "NativeInvitationViews.swift", ""],
  ["dialer", "Nummertoetsen", "NativeDialerView.swift", ""],
  ["dialer-contacts", "Nummercontacten", "NativeDialerView.swift", ""],
  ["incoming-call", "Inkomende oproep", "NativeTotalConversationView.swift", ""],
  ["audio", "Audiogesprek", "NativeTotalConversationView.swift", ""],
  ["video", "Videogesprek", "NativeTotalConversationView.swift", ""],
  ["tc", "Total Conversation / RTT", "NativeTotalConversationView.swift", ""],
  ["call-controls", "Gespreksbediening", "NativeTotalConversationView.swift", ""],
  ["call-keypad", "DTMF-toetsen", "NativeTotalConversationView.swift", ""],
  ["interpreter", "Gebarentolk oproepen", "NativeInterpreterCallView.swift", ""],
  ["news", "Nieuws", "NativeTranslationView.swift", ""],
  ["support", "Klantenservice", "NativeTranslationView.swift", ""]
].map(([id, title, source, identifier]) => Object.freeze({ id, title, source, identifier })));

const variants = Object.freeze([
  { family: "iPhone", orientation: "portrait", width: 402, height: 778 },
  { family: "iPhone", orientation: "landscape", width: 748, height: 381 },
  { family: "iPad", orientation: "portrait", width: 834, height: 1166 },
  { family: "iPad", orientation: "landscape", width: 1210, height: 790 }
].flatMap(viewport => ["light", "dark"].map(theme => Object.freeze({ ...viewport, scale: viewport.family === "iPhone" ? 3 : 2, theme }))));

const exclusions = Object.freeze([
  "iOS status bar, home indicator and software keyboard: operating-system UI, not the app viewport",
  "Apple permission dialogs, Contacts/Photos/document picker and provider-owned Google/Facebook pages",
  "Live camera pixels and third-party media: compare app-owned frames/controls using identical fixed fixture media instead"
]);

function caseID(screen, variant) {
  return [screen, variant.family, variant.orientation, variant.theme].join("-");
}

module.exports = { screens, variants, exclusions, caseID };
