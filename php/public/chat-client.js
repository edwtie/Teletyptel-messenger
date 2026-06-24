(function () {
  "use strict";

  const smiles = [
    ["biggrin", "biggrin.gif", [":D"]],
    ["bonk", "bonk.gif", ["8)7"]],
    ["bonk3", "bonk3.gif", ["7(8)7"]],
    ["bye", "bye.gif", [":w"]],
    ["clown", "clown.gif", [":+"]],
    ["confused", "confused.gif", [":?"]],
    ["coool", "coool.gif", ["8)"]],
    ["cry", "cry.gif", [":'("]],
    ["devil", "devil.gif", [">:)"]],
    ["devilish", "devilish.gif", ["})"]],
    ["frown", "frown.gif", [":("]],
    ["frusty", "frusty.gif", ["|:("]],
    ["heart", "heart.gif", ["O+"]],
    ["hypocrite", "hypocrite.gif", ["O-)"]],
    ["kwijl", "kwijl.gif", [":9~"]],
    ["loveit", "loveit.gif", [":7"]],
    ["loveys", "loveys.gif", ["*;"]],
    ["marrysmile", "marrysmile.gif", ["^)"]],
    ["michel", "michel.gif", ["(8>"]],
    ["nerd", "nerd.gif", ["B)"]],
    ["nosmile", "nosmile.gif", [":/"]],
    ["nosmile2", "nosmile2.gif", [":|"]],
    ["puh", "puh.gif", [":>", ":*"]],
    ["puh2", "puh2.svg", [":P"]],
    ["pukey", "pukey.gif", [":r"]],
    ["rc5", "rc5.gif", ["}:O"]],
    ["redface", "redface.gif", [":o"]],
    ["sadley", "sadley.gif", [";("]],
    ["shadey", "shadey.gif", ["B-)" ]],
    ["shiny", "shiny.gif", [":*)"]],
    ["shutup", "shutup.gif", [":X"]],
    ["sintsmiley", "sintsmiley.svg", ["<+:)"]],
    ["sleepey", "sleepey.gif", [":Z"]],
    ["sleephappy", "sleephappy.gif", [":z"]],
    ["smile", "smile.gif", [":)"]],
    ["thumbsup", "thumbsup.svg", ["d:)b"]],
    ["vork", "vork.gif", [":Y)"]],
    ["wink", "wink.gif", [";)"]],
    ["worshippy", "worshippy.gif", ["_/-\\o_", "_o_"]],
    ["yawnee", "yawnee.gif", [":O"]],
    ["yummie", "yummie.gif", [":9"]]
  ].map(([name, fileName, codes]) => ({ name, fileName, codes }));

  const smileIndex = smiles
    .flatMap((smiley) => smiley.codes.map((code) => ({ code, smiley })))
    .sort((a, b) => b.code.length - a.code.length || a.code.localeCompare(b.code));
  const smileyBasePath = "smileys/";
  const quickReactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
  const callModeDefinitions = {
    audio: { mediaKind: "audio", rttEnabled: false },
    video: { mediaKind: "video", rttEnabled: false },
    total: { mediaKind: "video", rttEnabled: true }
  };
  const accountStorageKeyBase = "teletyptel.serverAccountSession";
  const clientInstanceStorageKeyBase = "teletyptel.clientInstance";
  const sessionProfileStorageKey = "teletyptel.sessionProfile";
  const mediaSettingsStorageKey = "teletyptel.mediaSettings";
  const callVideoHeightStorageKey = "teletyptel.callVideoHeight";
  const blockedJidsStorageKeyBase = "teletyptel.blockedJids";
  const mutedNotificationJidsStorageKeyBase = "teletyptel.mutedNotificationJids";
  const doNotDisturbStorageKey = "teletyptel.doNotDisturb";
  const xmppStreamManagementStorageKeyBase = "teletyptel.xmppStreamManagement";
  const locationSettingsStorageKeyBase = "teletyptel.locationSettings";
  const chatBackgroundStorageKeyBase = "teletyptel.chatBackground";
  const historySettingsStorageKeyBase = "teletyptel.historySettings";
  const accountApiPath = "api/account.php";
  const historyApiPath = "api/history.php";
  const linkPreviewApiPath = "api/link-preview.php";
  const rtcConfigApiPath = "api/rtc-config.php";
  const uploadApiPath = "api/upload.php";
  const uploadChunkSize = 1_310_720;
  const languageBasePath = "lang/";
  const avatarMaxBytes = 256 * 1024;
  const avatarSourceMaxBytes = 5 * 1024 * 1024;
  const geolocNamespace = "http://jabber.org/protocol/geoloc";
  const xmppStreamManagementNamespace = "urn:xmpp:sm:3";
  const xmppStreamManagementResumeMaxAgeMs = 10 * 60 * 1000;
  const xmppMamNamespace = "urn:xmpp:mam:2";
  const xmppForwardNamespace = "urn:xmpp:forward:0";
  const xmppDelayNamespace = "urn:xmpp:delay";
  const xmppDataFormsNamespace = "jabber:x:data";
  const xmppRsmNamespace = "http://jabber.org/protocol/rsm";
  const teletyptelCallInfoNamespace = "urn:teletyptel:call-info:0";
  const teletyptelJingleSignalNamespace = "urn:teletyptel:jingle-signal:0";
  const jingleHistoryNamespace = "urn:xmpp:jingle-history:0";
  const jingleRttSyncNamespace = "urn:xmpp:jingle:apps:rtt-sync:0";
  const jingleGroupingNamespace = "urn:xmpp:jingle:apps:grouping:0";
  const jingleRttSyncDataChannelLabel = "rtt";
  const jingleRttSyncMaxSkewMs = 700;
  const t140Backspace = "\b";
  const t140Delete = "\u007f";
  const locationStaleAfterMs = 5 * 60 * 1000;
  const websocketHeartbeatMs = 25 * 1000;
  const sessionInactivityTimeoutMs = 30 * 60 * 1000;
  const sessionActivityThrottleMs = 15 * 1000;
  const sessionActivityEvents = ["pointerdown", "keydown", "input", "scroll", "touchstart"];
  const locationDurationOptions = [
    [15 * 60 * 1000, "location.duration_15m"],
    [30 * 60 * 1000, "location.duration_30m"],
    [60 * 60 * 1000, "location.duration_1h"],
    [2 * 60 * 60 * 1000, "location.duration_2h"],
    [4 * 60 * 60 * 1000, "location.duration_4h"],
    [8 * 60 * 60 * 1000, "location.duration_8h"]
  ];
  const maxLocationLiveDurationMs = 8 * 60 * 60 * 1000;
  const chatBackgroundIds = new Set(["auto", "none", "wide-1", "wide-2", "wide-3", "mobile"]);
  const linkPreviewCache = new Map();
  let googleMapsApiPromise = null;
  const materialIcons = {
    add: {
      viewBox: "0 -960 960 960",
      paths: ["M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"]
    },
    ballot: {
      viewBox: "0 -960 960 960",
      paths: ["M480-560h200v-80H480v80Zm0 240h200v-80H480v80ZM360-520q33 0 56.5-23.5T440-600q0-33-23.5-56.5T360-680q-33 0-56.5 23.5T280-600q0 33 23.5 56.5T360-520Zm0 240q33 0 56.5-23.5T440-360q0-33-23.5-56.5T360-440q-33 0-56.5 23.5T280-360q0 33 23.5 56.5T360-280ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z"]
    },
    call: {
      viewBox: "0 -960 960 960",
      paths: ["M798-120q-125 0-247-54.5T329-329Q229-429 174.5-551T120-798q0-18 12-30t30-12h162q14 0 25 9.5t13 22.5l26 140q2 16-1 27t-11 19l-97 98q20 37 47.5 71.5T387-386q31 31 65 57.5t72 48.5l94-94q9-9 23.5-13.5T670-390l138 28q14 4 23 14.5t9 23.5v162q0 18-12 30t-30 12ZM241-600l66-66-17-94h-89q5 41 14 81t26 79Zm358 358q39 17 79.5 27t81.5 13v-88l-94-19-67 67ZM241-600Zm358 358Z"]
    },
    callEnd: {
      viewBox: "0 -960 960 960",
      paths: ["M480-520q112 0 213 38.5T872-372q15 15 20.5 34.5T892-298l-35 92q-8 22-27 34t-43 8l-146-22q-18-3-30-16t-12-31v-84q-29-12-59-18t-60-6q-31 0-60.5 6T361-317v84q0 18-12 31t-30 16l-146 22q-24 4-43-8t-27-34l-35-92q-7-20-1-40t21-34q78-71 179-109.5T480-520Z"]
    },
    logout: {
      viewBox: "0 -960 960 960",
      paths: ["M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Zm440-160-55-58 102-102H360v-80h327L585-622l55-58 200 200-200 200Z"]
    },
    notificationsOff: {
      viewBox: "0 -960 960 960",
      paths: ["M160-200v-80h80v-280q0-83 50-147.5T420-792v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v28q30 8 56 24t46 39l-58 58q-19-22-46-35.5T480-720q-66 0-113 47t-47 113v280h326L160-766l56-56 608 608-56 56-84-82H160Zm320 120q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80Zm240-342-80-80v-58q0-28-10-53t-28-46l57-57q29 32 45 72t16 84v138Z"]
    },
    search: {
      viewBox: "0 -960 960 960",
      paths: ["M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"]
    },
    videocam: {
      viewBox: "0 -960 960 960",
      paths: ["M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h480q33 0 56.5 23.5T720-720v180l160-160v440L720-420v180q0 33-23.5 56.5T640-160H160Zm0-80h480v-480H160v480Zm0 0v-480 480Z"]
    },
    videocamOff: {
      viewBox: "0 0 256 256",
      paths: [
        "M46 72c0-13.255 10.745-24 24-24h86c13.255 0 24 10.745 24 24v22.8l37.2-27.9C225.11 60.97 236 66.61 236 76.5v103c0 9.89-10.89 15.53-18.8 9.6L180 161.2V184c0 13.255-10.745 24-24 24H70c-13.255 0-24-10.745-24-24V72Zm28 4v104h78V76H74Z",
        "M37.657 25.657c6.248-6.248 16.378-6.248 22.626 0l170 170c6.248 6.248 6.248 16.378 0 22.626s-16.378 6.248-22.626 0l-170-170c-6.248-6.248-6.248-16.378 0-22.626Z"
      ]
    },
    description: {
      viewBox: "0 -960 960 960",
      paths: ["M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"]
    },
    delete: {
      viewBox: "0 0 791.908 791.908",
      paths: ["M648.587,99.881H509.156C500.276,43.486,452.761,0,394.444,0S287.696,43.486,279.731,99.881H142.315c-26.733,0-48.43,21.789-48.43,48.43v49.437c0,24.719,17.761,44.493,41.564,47.423V727.64c0,35.613,28.655,64.268,64.268,64.268h392.475c35.613,0,64.268-28.655,64.268-64.268V246.087c23.711-3.937,41.564-23.711,41.564-47.423v-49.437C697.017,121.67,675.228,99.881,648.587,99.881z M394.444,36.62c38.543,0,70.219,26.733,77.085,63.261H316.351C324.225,64.268,355.901,36.62,394.444,36.62z M618.924,728.739c0,14.831-11.901,27.648-27.648,27.648H198.71c-14.831,0-27.648-11.901-27.648-27.648V247.185h446.948v481.554H618.924z M660.397,197.748c0,6.958-4.944,11.902-11.902,11.902H142.223c-6.958,0-11.902-4.944-11.902-11.902v-49.437c0-6.958,4.944-11.902,11.902-11.902h505.265c6.958,0,11.901,4.944,11.901,11.902v49.437H660.397z M253.09,661.45V349.081c0-9.887,7.873-17.761,17.761-17.761s17.761,7.873,17.761,17.761V661.45c0,9.887-7.873,17.761-17.761,17.761C260.964,680.309,253.09,671.337,253.09,661.45z M378.606,661.45V349.081c0-9.887,7.873-17.761,17.761-17.761c9.887,0,17.761,7.873,17.761,17.761V661.45c0,9.887-7.873,17.761-17.761,17.761C386.57,680.309,378.606,671.337,378.606,661.45z M504.212,661.45V349.081c0-9.887,7.873-17.761,17.761-17.761s17.761,7.873,17.761,17.761V661.45c0,9.887-7.873,17.761-17.761,17.761C513.093,680.309,504.212,671.337,504.212,661.45z"]
    },
    event: {
      viewBox: "0 -960 960 960",
      paths: ["M580-240q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Z"]
    },
    fileUpload: {
      viewBox: "0 -960 960 960",
      paths: ["M440-200h80v-167l64 64 56-57-160-160-160 160 57 56 63-63v167ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"]
    },
    download: {
      viewBox: "0 -960 960 960",
      paths: ["M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"]
    },
    gpsFixed: {
      viewBox: "0 0 24 24",
      paths: ["M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"]
    },
    highQuality: {
      viewBox: "0 -960 960 960",
      paths: ["M160-200q-33 0-56.5-23.5T80-280v-400q0-33 23.5-56.5T160-760h640q33 0 56.5 23.5T880-680v400q0 33-23.5 56.5T800-200H160Zm0-80h640v-400H160v400Zm80-80h80v-120h120v120h80v-320h-80v120H320v-120h-80v320Zm360 0h100q50 0 85-35t35-85v-80q0-50-35-85t-85-35H600v320Zm80-80v-160h20q17 0 28.5 11.5T740-560v80q0 17-11.5 28.5T700-440h-20ZM160-280v-400 400Z"]
    },
    qualityTune: {
      viewBox: "0 -960 960 960",
      paths: ["M440-120v-240h80v80h320v80H520v80h-80Zm-320-80v-80h240v80H120Zm160-160v-80H120v-80h160v-80h80v240h-80Zm160-80v-80h400v80H440Zm160-160v-240h80v80h160v80H680v80h-80Zm-480-80v-80h400v80H120Z"]
    },
    locationOff: {
      viewBox: "0 -960 960 960",
      paths: ["M560-560q0-33-23.5-56.5T480-640q-10 0-19 2t-17 7l107 107q5-8 7-17t2-19Zm168 213-58-58q25-42 37.5-78.5T720-552q0-109-69.5-178.5T480-800q-44 0-82.5 13.5T328-747l-57-57q43-37 97-56.5T480-880q127 0 223.5 89T800-552q0 48-18 98.5T728-347Zm-157 71L244-603q-2 12-3 25t-1 26q0 71 59 162.5T480-186q26-23 48.5-45.5T571-276ZM819-28 627-220q-32 34-68 69t-79 71Q319-217 239.5-334.5T160-552q0-32 5-61t14-55L27-820l57-57L876-85l-57 57ZM408-439Zm91-137Z"]
    },
    locationOn: {
      viewBox: "0 -960 960 960",
      paths: ["M480-480q33 0 56.5-23.5T560-560q0-33-23.5-56.5T480-640q-33 0-56.5 23.5T400-560q0 33 23.5 56.5T480-480Zm0 294q122-112 181-203.5T720-552q0-109-69.5-178.5T480-800q-101 0-170.5 69.5T240-552q0 71 59 162.5T480-186Zm0 106Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Zm0-480Z"]
    },
    locationSearching: {
      viewBox: "0 -960 960 960",
      paths: ["M440-40v-80q-125-14-214.5-103.5T122-438H42v-80h80q14-125 103.5-214.5T440-836v-80h80v80q125 14 214.5 103.5T838-518h80v80h-80q-14 125-103.5 214.5T520-120v80h-80Zm40-158q116 0 198-82t82-198q0-116-82-198t-198-82q-116 0-198 82t-82 198q0 116 82 198t198 82Z"]
    },
    headphones: {
      viewBox: "0 -960 960 960",
      paths: ["M360-120H200q-33 0-56.5-23.5T120-200v-280q0-75 28.5-140.5t77-114q48.5-48.5 114-77T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480v280q0 33-23.5 56.5T760-120H600v-320h160v-40q0-117-81.5-198.5T480-760q-117 0-198.5 81.5T200-480v40h160v320Zm-80-240h-80v160h80v-160Zm400 0v160h80v-160h-80Zm-400 0h-80 80Zm400 0h80-80Z"]
    },
    mic: {
      viewBox: "0 -960 960 960",
      paths: ["M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm0-240Zm-40 520v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T480-320q83 0 141.5-58.5T680-520h80q0 105-68 184t-172 93v123h-80Zm40-360q17 0 28.5-11.5T520-520v-240q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760v240q0 17 11.5 28.5T480-480Z"]
    },
    micOff: {
      viewBox: "0 0 256 256",
      paths: [
        "M213.91992,210.61816l-160-176A8.0006,8.0006,0,1,0,42.08008,45.38184L80,87.09375V128a47.9902,47.9902,0,0,0,73.91211,40.39685l10.875,11.96252A63.99208,63.99208,0,0,1,64.39062,135.12109a7.9996,7.9996,0,0,0-15.90234,1.75782A79.83705,79.83705,0,0,0,120,207.59692V232a8,8,0,0,0,16,0V207.59082a79.72,79.72,0,0,0,39.62012-15.31506l26.46,29.10608a8.0006,8.0006,0,1,0,11.83984-10.76368ZM128,160a32.03667,32.03667,0,0,1-32-32V104.69373l46.91943,51.61145A31.93466,31.93466,0,0,1,128,160Z",
        "M89.75,49.78809a8.00143,8.00143,0,0,0,11.0127-2.59473A32.00393,32.00393,0,0,1,160,64v60.42871a8,8,0,1,0,16,0V64A48.0045,48.0045,0,0,0,87.15527,38.77539,8.00057,8.00057,0,0,0,89.75,49.78809Z",
        "M192.165,161.665a7.99262,7.99262,0,0,0,10.36426-4.53613,79.61568,79.61568,0,0,0,4.98242-20.25,7.9996,7.9996,0,0,0-15.90235-1.75782,63.67417,63.67417,0,0,1-3.98046,16.17969A7.99991,7.99991,0,0,0,192.165,161.665Z"
      ]
    },
    mood: {
      viewBox: "0 -960 960 960",
      paths: ["M620-520q25 0 42.5-17.5T680-580q0-25-17.5-42.5T620-640q-25 0-42.5 17.5T560-580q0 25 17.5 42.5T620-520Zm-280 0q25 0 42.5-17.5T400-580q0-25-17.5-42.5T340-640q-25 0-42.5 17.5T280-580q0 25 17.5 42.5T340-520Zm140 260q68 0 123.5-38.5T684-400H276q25 63 80.5 101.5T480-260Zm0 180q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Z"]
    },
    myLocation: {
      viewBox: "0 -960 960 960",
      paths: ["M440-42v-80q-125-14-214.5-103.5T122-440H42v-80h80q14-125 103.5-214.5T440-838v-80h80v80q125 14 214.5 103.5T838-520h80v80h-80q-14 125-103.5 214.5T520-122v80h-80Zm40-158q116 0 198-82t82-198q0-116-82-198t-198-82q-116 0-198 82t-82 198q0 116 82 198t198 82Zm0-120q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T560-480q0-33-23.5-56.5T480-560q-33 0-56.5 23.5T400-480q0 33 23.5 56.5T480-400Zm0-80Z"]
    },
    person: {
      viewBox: "0 -960 960 960",
      paths: ["M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T560-640q0-33-23.5-56.5T480-720q-33 0-56.5 23.5T400-640q0 33 23.5 56.5T480-560Zm0-80Zm0 400Z"]
    },
    pause: {
      viewBox: "0 -960 960 960",
      paths: ["M520-200v-560h240v560H520Zm-320 0v-560h240v560H200Zm400-80h80v-400h-80v400Zm-320 0h80v-400h-80v400Zm0-400v400-400Zm320 0v400-400Z"]
    },
    photoCamera: {
      viewBox: "0 -960 960 960",
      paths: ["M480-260q75 0 127.5-52.5T660-440q0-75-52.5-127.5T480-620q-75 0-127.5 52.5T300-440q0 75 52.5 127.5T480-260Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM160-120q-33 0-56.5-23.5T80-200v-480q0-33 23.5-56.5T160-760h126l74-80h240l74 80h126q33 0 56.5 23.5T880-680v480q0 33-23.5 56.5T800-120H160Zm0-80h640v-480H638l-73-80H395l-73 80H160v480Zm320-240Z"]
    },
    photoLibrary: {
      viewBox: "0 -960 960 960",
      paths: ["M360-400h400L622-580l-92 120-62-80-108 140Zm-40 160q-33 0-56.5-23.5T240-320v-480q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H320Zm0-80h480v-480H320v480ZM160-80q-33 0-56.5-23.5T80-160v-560h80v560h560v80H160Zm160-720v480-480Z"]
    },
    playArrow: {
      viewBox: "0 -960 960 960",
      paths: ["M320-200v-560l440 280-440 280Zm80-280Zm0 134 210-134-210-134v268Z"]
    },
    rtt: {
      viewBox: "0 -960 960 960",
      paths: ["m365-120 16-102h93l82-516H456l-29 180H321l45-282h519l-45 282H734l28-180H662l-82 516h93l-16 102H365ZM150-680l13-80h150l-13 80H150Zm-25 160 13-80h150l-13 80H125ZM75-200l12-80h250l-12 80H75Zm25-160 13-80h250l-13 80H100Z"]
    },
    restartAlt: {
      viewBox: "0 -960 960 960",
      paths: ["M480-80q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T120-440h80q0 117 81.5 198.5T480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720h-6l62 62-56 58-160-160 160-160 56 58-62 62h6q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-440q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-80Z"]
    },
    send: {
      viewBox: "0 -960 960 960",
      paths: ["M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z"]
    },
    volumeOff: {
      viewBox: "0 0 256 256",
      paths: [
       "M24 94c0-8.837 7.163-16 16-16h39l54.343-52.432C143.504 15.741 161 22.94 161 37.076v181.848c0 14.136-17.496 21.335-27.657 11.508L79 178H40c-8.837 0-16-7.163-16-16V94Z",
        "M183.373 83.373c6.248-6.248 16.379-6.248 22.627 0l19 19 19-19c6.248-6.248 16.379-6.248 22.627 0s6.248 16.379 0 22.627l-19 19 19 19c6.248 6.248 6.248 16.379 0 22.627s-16.379 6.248-22.627 0l-19-19-19 19c-6.248 6.248-16.379 6.248-22.627 0s-6.248-16.379 0-22.627l19-19-19-19c-6.248-6.248-6.248-16.379 0-22.627Z"
      ]
    },
    volumeUp: {
      viewBox: "0 -960 960 960",
      paths: ["M560-131v-82q90-26 145-100t55-167q0-93-55-167T560-747v-82q124 28 202 125.5T840-480q0 126-78 223.5T560-131ZM120-360v-240h160l200-200v640L280-360H120Zm440 40v-322q47 22 73.5 66t26.5 96q0 51-26.5 95T560-320ZM400-606l-86 86H200v80h114l86 86v-252Z"]
    },
    settings: {
      viewBox: "0 -960 960 960",
      paths: ["m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 22.5-15t24.5-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l104 78-110 190-119-50q-11 8-22.5 15T606-208L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"]
    },
    sticker: {
      viewBox: "0 -960 960 960",
      paths: ["M460-360q69 0 120-45t60-113l-320 90q26 32 62 50t78 18ZM294-510l106-30q4-28-14-49t-46-21q-25 0-42.5 17.5T280-550q0 11 4 21t10 19Zm240-70 106-30q5-28-13.5-49T580-680q-25 0-42.5 17.5T520-620q0 11 4 21t10 19Zm106 460H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v440L640-120Zm-40-80v-80q0-33 23.5-56.5T680-360h80v-400H200v560h400Zm0 0Zm-400 0v-560 560Z"]
    },
    stop: {
      viewBox: "0 -960 960 960",
      paths: ["M320-240v-480h320v480H320Z"]
    },
    supportTech: {
      viewBox: "0 0 448 448",
      paths: [
        "M384,172.4C384,83.6,312.4,12,224,12S64,83.6,64,172c0,0,0,0,0,0.4C28.4,174.4,0,204,0,240v8c0,37.6,30.4,68,68,68h3.6l28.4,45.2c20,32,54,50.8,91.6,50.8h5.6c3.6,13.6,16,24,30.8,24c17.6,0,32-14.4,32-32c0-17.6-14.4-32-32-32c-14.8,0-27.2,10.4-30.8,24h-5.6c-32,0-61.2-16.4-78-43.6L90.4,316H96c8.8,0,16-7.2,16-16V188c0-8.8-7.2-16-16-16H80c0-79.6,64.4-144,144-144s144,64.4,144,144h-16c-8.8,0-16,7.2-16,16v112c0,8.8,7.2,16,16,16h28c37.6,0,68-30.4,68-68v-8C448,204,419.6,174.4,384,172.4z M228,388c8.8,0,16,7.2,16,16s-7.2,16-16,16s-16-7.2-16-16S219.2,388,228,388z M96,188v112H68c-28.8,0-52-23.2-52-52v-8c0-28.8,23.2-52,52-52H96z M432,248c0,28.8-23.2,52-52,52h-28V188h28c28.8,0,52,23.2,52,52V248z",
        "M290.4,72.4c-0.8-0.4-2-1.2-3.2-2c-1.2-0.8-2.4-1.6-3.2-2c-3.6-2.4-8.8-1.2-10.8,2.8S272,79.6,276,82c0.8,0.4,2,1.2,3.2,2s2.4,1.6,3.6,2c1.2,0.8,2.8,1.2,4,1.2c2.8,0,5.2-1.2,6.8-4C295.6,79.6,294.4,74.8,290.4,72.4z",
        "M224,52c-34,0-66,14.8-88,40.4c-2.8,3.2-2.4,8.4,0.8,11.2c1.6,1.2,3.2,2,5.2,2c2.4,0,4.4-0.8,6-2.8c19.2-22,46.8-34.8,76-34.8c7.2,0,14.4,0.8,21.6,2.4c4.4,0.8,8.4-2,9.6-6s-2-8.4-6-9.6C240.8,52.8,232.4,52,224,52z"
      ]
    }
  };
  const sessionProfile = loadSessionProfile();
  const hasInitialAccountProfile = Boolean(loadSavedAccountProfile(sessionProfile));
  const locationSearchParams = new URLSearchParams(location.search);
  const developerMode = locationSearchParams.has("dev")
    || localStorage.getItem("teletyptel.developerMode") === "1";
  const resetServiceWorker = locationSearchParams.has("reset-sw");
  const oauthAccountId = locationSearchParams.get("accountId") || "";
  const oauthLoginToken = locationSearchParams.get("loginToken") || "";

  const state = {
    mode: "xmpp",
    theme: loadTheme(),
    relaySocket: null,
    xmppSocket: null,
    xmppSession: null,
    intentionalDisconnect: false,
    xmppAuthRefreshAttempted: false,
    account: null,
    pendingLoginTwoFactor: null,
    accountSettingsPanel: "profile",
    passwordResetToken: locationSearchParams.get("reset") || "",
    developerMode,
    provider: null,
    rtcConfig: {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceTransportPolicy: "all",
      bundlePolicy: "balanced",
      rtcpMuxPolicy: "require"
    },
    translations: new Map(),
    languageCode: "eng",
    sessionProfile,
    clientInstance: loadClientInstance(sessionProfile),
    clientLifecycle: {
      current: "active",
      relayLastSent: null,
      xmppLastSent: null,
      nativeLastPosted: null,
      blurTimer: null,
      mediaCaptureUntil: 0,
      transientReconnectTimer: null
    },
    websocketHeartbeat: {
      relayTimer: null,
      xmppTimer: null
    },
    activeTabId: "chat",
    conversationHistory: {
      calls: [],
      selectedId: null,
      loaded: false
    },
    historySettings: loadHistorySettings(sessionProfile),
    sequence: 0,
    previousText: "",
    editingMessage: null,
    call: null,
    callVideoResize: {
      pointerId: null,
      startY: 0,
      startHeight: 0
    },
    totalConversationTextVisible: true,
    photoViewer: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      attachment: null,
      dragging: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      startOffsetX: 0,
      startOffsetY: 0
    },
    avatarCrop: {
      image: null,
      scale: 1,
      minScale: 1,
      offsetX: 0,
      offsetY: 0,
      dragging: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      startOffsetX: 0,
      startOffsetY: 0
    },
    mapViewer: {
      location: null,
      source: null,
      provider: normalizeMapProvider(loadLocationSettings(sessionProfile).mapProvider),
      zoom: 16,
      centerLat: null,
      centerLon: null,
      dragging: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      startCenterPixelX: 0,
      startCenterPixelY: 0,
      googleApiKey: localStorage.getItem("teletyptel.googleMapsApiKey") || "",
      googleMapId: localStorage.getItem("teletyptel.googleMapsMapId") || "DEMO_MAP_ID",
      googleMap: null,
      googleMarker: null
    },
    chatBackground: loadChatBackground(sessionProfile),
    mediaSettings: loadMediaSettings(),
    mediaDevices: [],
    mediaPreviewStream: null,
    incomingCallNotification: null,
    incomingCallNotificationSid: "",
    voiceRecorder: {
      recorder: null,
      stream: null,
      chunks: [],
      blob: null,
      objectUrl: "",
      mimeType: "",
      startedAt: 0,
      timerId: null,
      audioContext: null,
      analyser: null,
      meterData: null,
      meterAnimationId: null,
      waveLevels: [],
      cancelled: false
    },
    videoRecorder: {
      recorder: null,
      stream: null,
      previewStream: null,
      chunks: [],
      blob: null,
      objectUrl: "",
      mimeType: "",
      startedAt: 0,
      timerId: null,
      cancelled: false
    },
    blockedJids: new Set(loadBlockedJids(sessionProfile)),
    mutedNotificationJids: new Set(loadMutedNotificationJids(sessionProfile)),
    doNotDisturb: localStorage.getItem(doNotDisturbStorageKey) === "1",
    accountReady: false,
    pendingMucAvatarConversationId: null,
    contactProfileRequestId: 0,
    publicProfileCache: new Map(),
    publicProfileRequests: new Set(),
    security: {
      twoFactorVerificationId: 0,
      twoFactorMethod: "authenticator",
      twoFactorOtpauthUri: "",
      twoFactorManualSecret: ""
    },
    location: {
      current: null,
      permission: "unknown",
      error: "",
      live: false,
      watchId: null,
      liveExpiresAt: null,
      liveStopTimerId: null,
      sharedConversationId: null,
      lastSharedAt: null,
      lastLiveSentAt: 0,
      settings: loadLocationSettings(sessionProfile)
    },
    contextConversationId: null,
    contextMessage: null,
    reactionMessageId: null,
    messageStateSync: new Map(),
    xmppMam: {
      pending: false,
      lastStartedAt: 0,
      loaded: false,
      resultCount: 0,
      fallbackHistoryReloaded: false,
      timerId: null
    },
    smileyPickerMode: "composer",
    accountBooting: true,
    accountGateRequired: false,
    accountDialogMode: !hasInitialAccountProfile ? "signin" : "settings",
    suppressAutoLoginDialog: hasInitialAccountProfile,
    sessionIdleTimerId: null,
    sessionLastActivityAt: Date.now(),
    sessionLastActivityRecordedAt: 0,
    sessionTimeoutInProgress: false,
    conversations: [
      {
        id: "tester",
        name: "Tester",
        nameKey: "conversation.tester",
        peer: "tester@localhost",
        kind: "contact",
        avatarColor: "#2563eb",
        presence: "offline",
        meta: "Offline",
        clientState: null,
        clientStateUpdatedAt: null,
        lastSeenAt: null,
        messages: [],
        unreadCount: 0,
        remoteText: "",
        remoteFrom: "",
        remoteDraftUpdatedAt: null
      },
      {
        id: "support-group",
        name: "Support group",
        nameKey: "conversation.support_group",
        peer: "support@conference.localhost",
        kind: "group",
        avatarColor: "#7c3aed",
        presence: "group",
        meta: "Group",
        clientState: null,
        clientStateUpdatedAt: null,
        lastSeenAt: null,
        messages: [],
        unreadCount: 0,
        remoteText: "",
        remoteFrom: "",
        remoteDraftUpdatedAt: null
      }
    ],
    activeConversationId: null
  };

  const el = {
    appTabs: byId("appTabs"),
    connectionSummary: byId("connectionSummary"),
    viewMenu: byId("viewMenu"),
    themeButton: byId("themeButton"),
    chatBackgroundInput: byId("chatBackgroundInput"),
    newsButton: byId("newsButton"),
    supportButton: byId("supportButton"),
    historyButton: byId("historyButton"),
    profileButton: byId("profileButton"),
    accountButton: byId("accountButton"),
    doNotDisturbButton: byId("doNotDisturbButton"),
    logoutButton: byId("logoutButton"),
    connectButton: byId("connectButton"),
    disconnectButton: byId("disconnectButton"),
    addConversationButton: byId("addConversationButton"),
    addGroupButton: byId("addGroupButton"),
    inviteConversationButton: byId("inviteConversationButton"),
    developerPanel: byId("developerPanel"),
    conversationContextMenu: byId("conversationContextMenu"),
    contextProfileButton: byId("contextProfileButton"),
    contextRoomAvatarButton: byId("contextRoomAvatarButton"),
    contextMuteNotificationsButton: byId("contextMuteNotificationsButton"),
    contextBlockButton: byId("contextBlockButton"),
    mucAvatarFileInput: byId("mucAvatarFileInput"),
    contactProfileDialog: byId("contactProfileDialog"),
    contactProfileTitle: byId("contactProfileTitle"),
    contactProfileSubtitle: byId("contactProfileSubtitle"),
    contactProfileAvatar: byId("contactProfileAvatar"),
    contactProfileName: byId("contactProfileName"),
    contactProfilePresence: byId("contactProfilePresence"),
    contactProfileEmail: byId("contactProfileEmail"),
    contactProfilePhone: byId("contactProfilePhone"),
    contactProfileJid: byId("contactProfileJid"),
    contactProfileStatus: byId("contactProfileStatus"),
    closeContactProfileButton: byId("closeContactProfileButton"),
    contactProfileOkButton: byId("contactProfileOkButton"),
    messageContextMenu: byId("messageContextMenu"),
    messageContextEditButton: byId("messageContextEditButton"),
    messageContextDeleteButton: byId("messageContextDeleteButton"),
    messageContextDownloadButton: byId("messageContextDownloadButton"),
    messageContextForwardButton: byId("messageContextForwardButton"),
    conversationItems: byId("conversationItems"),
    conversationSearchInput: byId("conversationSearchInput"),
    backToContactsButton: byId("backToContactsButton"),
    activeConversationAvatar: byId("activeConversationAvatar"),
    activeConversationName: byId("activeConversationName"),
    activeConversationMeta: byId("activeConversationMeta"),
    startAudioCallOption: byId("startAudioCallOption"),
    startVideoCallOption: byId("startVideoCallOption"),
    startTotalCallOption: byId("startTotalCallOption"),
    answerCallButton: byId("answerCallButton"),
    rejectCallButton: byId("rejectCallButton"),
    hangupCallButton: byId("hangupCallButton"),
    callStatus: byId("callStatus"),
    incomingCallBanner: byId("incomingCallBanner"),
    incomingCallTitle: byId("incomingCallTitle"),
    incomingCallText: byId("incomingCallText"),
    incomingAnswerButton: byId("incomingAnswerButton"),
    incomingRejectButton: byId("incomingRejectButton"),
    incomingCallDialog: byId("incomingCallDialog"),
    incomingCallDialogTitle: byId("incomingCallDialogTitle"),
    incomingCallDialogText: byId("incomingCallDialogText"),
    dialogAnswerButton: byId("dialogAnswerButton"),
    dialogRejectButton: byId("dialogRejectButton"),
    callPanel: byId("callPanel"),
    callResizeHandle: byId("callResizeHandle"),
    remoteVideo: byId("remoteVideo"),
    localVideo: byId("localVideo"),
    toggleCameraButton: byId("toggleCameraButton"),
    muteMicrophoneButton: byId("muteMicrophoneButton"),
    muteRemoteAudioButton: byId("muteRemoteAudioButton"),
    toggleTotalConversationTextButton: byId("toggleTotalConversationTextButton"),
    hangupCallPanelButton: byId("hangupCallPanelButton"),
    remoteVolumeInput: byId("remoteVolumeInput"),
    remoteVolumeValue: byId("remoteVolumeValue"),
    totalConversationTextPanel: byId("totalConversationTextPanel"),
    totalConversationRemoteName: byId("totalConversationRemoteName"),
    totalConversationRemotePreviousText: byId("totalConversationRemotePreviousText"),
    totalConversationRemoteText: byId("totalConversationRemoteText"),
    totalConversationLocalPreviousText: byId("totalConversationLocalPreviousText"),
    totalConversationLocalText: byId("totalConversationLocalText"),
    relayModeButton: byId("relayModeButton"),
    xmppModeButton: byId("xmppModeButton"),
    dropOverlay: byId("dropOverlay"),
    messageTimeline: byId("messageTimeline"),
    tabPanel: byId("tabPanel"),
    tabPanelTitle: byId("tabPanelTitle"),
    tabPanelMeta: byId("tabPanelMeta"),
    tabPanelBody: byId("tabPanelBody"),
    closeTabPanelButton: byId("closeTabPanelButton"),
    historyPage: byId("historyPage"),
    historyPageTitle: byId("historyPageTitle"),
    historyPageMeta: byId("historyPageMeta"),
    historyPageBody: byId("historyPageBody"),
    closeHistoryPageButton: byId("closeHistoryPageButton"),
    historyPrivacyDialog: byId("historyPrivacyDialog"),
    closeHistoryPrivacyDialogButton: byId("closeHistoryPrivacyDialogButton"),
    historyPrivacyOkButton: byId("historyPrivacyOkButton"),
    remoteDraft: byId("remoteDraft"),
    remoteDraftName: byId("remoteDraftName"),
    remoteDraftPreviousText: byId("remoteDraftPreviousText"),
    remoteDraftText: byId("remoteDraftText"),
    composerForm: byId("composerForm"),
    resetRttButton: byId("resetRttButton"),
    enableRttButton: byId("enableRttButton"),
    attachmentMenuButton: byId("attachmentMenuButton"),
    attachmentMenuPanel: byId("attachmentMenuPanel"),
    attachmentPhotoButton: byId("attachmentPhotoButton"),
    attachmentVideoButton: byId("attachmentVideoButton"),
    uploadFileButton: byId("attachmentFilesButton"),
    attachmentLocationButton: byId("attachmentLocationButton"),
    emojiButton: byId("emojiButton"),
    smileyPickerPanel: byId("smileyPickerPanel"),
    videoMessageButton: byId("videoMessageButton"),
    voiceMessageButton: byId("voiceMessageButton"),
    voicePreviewPanel: byId("voicePreviewPanel"),
    voicePreviewStatus: byId("voicePreviewStatus"),
    voicePreviewAudio: byId("voicePreviewAudio"),
    voiceRecordingWaveLine: byId("voiceRecordingWaveLine"),
    cancelVoiceMessageButton: byId("cancelVoiceMessageButton"),
    playVoiceMessageButton: byId("playVoiceMessageButton"),
    rerecordVoiceMessageButton: byId("rerecordVoiceMessageButton"),
    sendVoiceMessageButton: byId("sendVoiceMessageButton"),
    videoPreviewPanel: byId("videoPreviewPanel"),
    openVideoPreviewDialogButton: byId("openVideoPreviewDialogButton"),
    videoPreviewVideo: byId("videoPreviewVideo"),
    videoPreviewStatus: byId("videoPreviewStatus"),
    videoPreviewDialog: byId("videoPreviewDialog"),
    videoPreviewDialogTitle: byId("videoPreviewDialogTitle"),
    videoPreviewDialogVideo: byId("videoPreviewDialogVideo"),
    videoRecorderQualityInput: byId("videoRecorderQualityInput"),
    videoRecorderQualityButton: byId("videoRecorderQualityButton"),
    videoRecorderQualityLabel: byId("videoRecorderQualityLabel"),
    videoRecorderQualityMenu: byId("videoRecorderQualityMenu"),
    videoRecorderCameraButton: byId("videoRecorderCameraButton"),
    videoRecorderCameraLabel: byId("videoRecorderCameraLabel"),
    videoRecorderCameraMenu: byId("videoRecorderCameraMenu"),
    closeVideoPreviewDialogButton: byId("closeVideoPreviewDialogButton"),
    startVideoRecordingButton: byId("startVideoRecordingButton"),
    dialogCancelVideoMessageButton: byId("dialogCancelVideoMessageButton"),
    dialogRerecordVideoMessageButton: byId("dialogRerecordVideoMessageButton"),
    dialogSendVideoMessageButton: byId("dialogSendVideoMessageButton"),
    cancelVideoMessageButton: byId("cancelVideoMessageButton"),
    playVideoMessageButton: byId("playVideoMessageButton"),
    rerecordVideoMessageButton: byId("rerecordVideoMessageButton"),
    sendVideoMessageButton: byId("sendVideoMessageButton"),
    fileInput: byId("fileInput"),
    rttToggle: byId("rttToggle"),
    smileyToggle: byId("smileyToggle"),
    sessionTimeoutToggle: byId("sessionTimeoutToggle"),
    composerInputRow: byId("composerInputRow"),
    messageInput: byId("messageInput"),
    sendButton: byId("sendButton"),
    composerState: byId("composerState"),
    sessionProfileInput: byId("sessionProfileInput"),
    switchSessionButton: byId("switchSessionButton"),
    openSecondSessionButton: byId("openSecondSessionButton"),
    relayUrlInput: byId("relayUrlInput"),
    displayNameInput: byId("displayNameInput"),
    accountAvatarPreview: byId("accountAvatarPreview"),
    avatarFileInput: byId("avatarFileInput"),
    avatarColorInput: byId("avatarColorInput"),
    chooseAvatarButton: byId("chooseAvatarButton"),
    clearAvatarButton: byId("clearAvatarButton"),
    dialogAccountAvatarPreview: byId("dialogAccountAvatarPreview"),
    dialogAvatarFileInput: byId("dialogAvatarFileInput"),
    dialogAvatarColorInput: byId("dialogAvatarColorInput"),
    dialogChooseAvatarButton: byId("dialogChooseAvatarButton"),
    dialogClearAvatarButton: byId("dialogClearAvatarButton"),
    avatarCropDialog: byId("avatarCropDialog"),
    avatarCropTitle: byId("avatarCropTitle"),
    avatarCropStatus: byId("avatarCropStatus"),
    avatarCropCanvas: byId("avatarCropCanvas"),
    avatarCropZoomInput: byId("avatarCropZoomInput"),
    closeAvatarCropButton: byId("closeAvatarCropButton"),
    cancelAvatarCropButton: byId("cancelAvatarCropButton"),
    applyAvatarCropButton: byId("applyAvatarCropButton"),
    jidInput: byId("jidInput"),
    passwordInput: byId("passwordInput"),
    rememberPasswordToggle: byId("rememberPasswordToggle"),
    peerInput: byId("peerInput"),
    phoneInput: byId("phoneInput"),
    languageInput: byId("languageInput"),
    providerInput: byId("providerInput"),
    accountStatus: byId("accountStatus"),
    saveAccountButton: byId("saveAccountButton"),
    resetAccountButton: byId("resetAccountButton"),
    accountDialog: byId("accountDialog"),
    accountDialogTitle: byId("accountDialogTitle"),
    accountDialogSubtitle: byId("accountDialogSubtitle"),
    closeAccountDialogButton: byId("closeAccountDialogButton"),
    cancelAccountDialogButton: byId("cancelAccountDialogButton"),
    dialogRealAccountTitle: byId("dialogRealAccountTitle"),
    dialogAdvancedDetails: byId("dialogAdvancedDetails"),
    dialogSessionProfileInput: byId("dialogSessionProfileInput"),
    dialogDisplayNameInput: byId("dialogDisplayNameInput"),
    dialogJidInput: byId("dialogJidInput"),
    dialogPasswordInput: byId("dialogPasswordInput"),
    dialogForgotPasswordButton: byId("dialogForgotPasswordButton"),
    dialogRememberPasswordToggle: byId("dialogRememberPasswordToggle"),
    loginTwoFactorSection: byId("loginTwoFactorSection"),
    loginTwoFactorCodeInput: byId("loginTwoFactorCodeInput"),
    verifyLoginTwoFactorButton: byId("verifyLoginTwoFactorButton"),
    dialogXmppDomainInput: byId("dialogXmppDomainInput"),
    dialogXmppHostInput: byId("dialogXmppHostInput"),
    dialogXmppPortInput: byId("dialogXmppPortInput"),
    dialogXmppTlsModeInput: byId("dialogXmppTlsModeInput"),
    dialogRelayUrlInput: byId("dialogRelayUrlInput"),
    dialogXmppUrlInput: byId("dialogXmppUrlInput"),
    dialogProviderInput: byId("dialogProviderInput"),
    dialogLanguageInput: byId("dialogLanguageInput"),
    settingsLanguageInput: byId("settingsLanguageInput"),
    dialogPeerInput: byId("dialogPeerInput"),
    dialogPhoneInput: byId("dialogPhoneInput"),
    dialogBirthDateInput: byId("dialogBirthDateInput"),
    accountSecuritySection: byId("accountSecuritySection"),
    dialogCurrentPasswordInput: byId("dialogCurrentPasswordInput"),
    dialogNewPasswordInput: byId("dialogNewPasswordInput"),
    dialogRepeatPasswordInput: byId("dialogRepeatPasswordInput"),
    passwordRulesPanel: byId("passwordRulesPanel"),
    dialogRememberNewPasswordToggle: byId("dialogRememberNewPasswordToggle"),
    changePasswordButton: byId("changePasswordButton"),
    googleLinkStatus: byId("googleLinkStatus"),
    linkGoogleButton: byId("linkGoogleButton"),
    unlinkGoogleButton: byId("unlinkGoogleButton"),
    facebookLinkStatus: byId("facebookLinkStatus"),
    linkFacebookButton: byId("linkFacebookButton"),
    unlinkFacebookButton: byId("unlinkFacebookButton"),
    twoFactorStatus: byId("twoFactorStatus"),
    twoFactorQrPanel: byId("twoFactorQrPanel"),
    twoFactorQrCode: byId("twoFactorQrCode"),
    twoFactorSecretText: byId("twoFactorSecretText"),
    twoFactorCodeInput: byId("twoFactorCodeInput"),
    requestTwoFactorButton: byId("requestTwoFactorButton"),
    confirmTwoFactorButton: byId("confirmTwoFactorButton"),
    dialogChatBackgroundInput: byId("dialogChatBackgroundInput"),
    dialogMapProviderInput: byId("dialogMapProviderInput"),
    dialogCameraInput: byId("dialogCameraInput"),
    dialogMicrophoneInput: byId("dialogMicrophoneInput"),
    dialogVideoQualityInput: byId("dialogVideoQualityInput"),
    dialogVideoMessageFacingInput: byId("dialogVideoMessageFacingInput"),
    dialogMediaStatus: byId("dialogMediaStatus"),
    dialogRefreshMediaButton: byId("dialogRefreshMediaButton"),
    dialogPreviewMediaButton: byId("dialogPreviewMediaButton"),
    dialogStopMediaPreviewButton: byId("dialogStopMediaPreviewButton"),
    callCameraInput: byId("callCameraInput"),
    callVideoFacingToggle: byId("callVideoFacingToggle"),
    callVideoFacingInput: byId("callVideoFacingInput"),
    callMicrophoneInput: byId("callMicrophoneInput"),
    dialogContactsPanel: byId("dialogContactsPanel"),
    dialogAccessibilityPanel: byId("dialogAccessibilityPanel"),
    dialogServerSettingsLockNote: byId("dialogServerSettingsLockNote"),
    dialogAccountStatus: byId("dialogAccountStatus"),
    accountSettingsMenu: byId("accountSettingsMenu"),
    dialogCreateAccountButton: byId("dialogCreateAccountButton"),
    dialogGoogleLoginButton: byId("dialogGoogleLoginButton"),
    dialogGoogleLoginFallbackButton: byId("dialogGoogleLoginFallbackButton"),
    dialogGoogleLoginOverlayButton: byId("dialogGoogleLoginOverlayButton"),
    dialogFacebookLoginButton: byId("dialogFacebookLoginButton"),
    dialogSaveAccountButton: byId("dialogSaveAccountButton"),
    dialogConnectButton: byId("dialogConnectButton"),
    dialogResetPasswordButton: byId("dialogResetPasswordButton"),
    dialogServerSettingsButton: byId("dialogServerSettingsButton"),
    settingsLogoutButton: byId("settingsLogoutButton"),
    locationShareDialog: byId("locationShareDialog"),
    locationShareStatus: byId("locationShareStatus"),
    locationShareMap: byId("locationShareMap"),
    locationShareDurationInput: byId("locationShareDurationInput"),
    confirmLocationShareButton: byId("confirmLocationShareButton"),
    cancelLocationShareButton: byId("cancelLocationShareButton"),
    closeLocationShareDialogButton: byId("closeLocationShareDialogButton"),
    photoViewerDialog: byId("photoViewerDialog"),
    photoViewerTitle: byId("photoViewerTitle"),
    photoViewerCanvas: byId("photoViewerCanvas"),
    photoViewerImage: byId("photoViewerImage"),
    photoViewerZoomOutButton: byId("photoViewerZoomOutButton"),
    photoViewerZoomInButton: byId("photoViewerZoomInButton"),
    photoViewerResetButton: byId("photoViewerResetButton"),
    photoViewerCloseButton: byId("photoViewerCloseButton"),
    mapViewerDialog: byId("mapViewerDialog"),
    mapViewerTitle: byId("mapViewerTitle"),
    mapViewerMeta: byId("mapViewerMeta"),
    mapViewerTiles: byId("mapViewerTiles"),
    mapViewerPositionDot: byId("mapViewerPositionDot"),
    mapViewerExternalLink: byId("mapViewerExternalLink"),
    mapViewerOpenStreetMapButton: byId("mapViewerOpenStreetMapButton"),
    mapViewerGoogleButton: byId("mapViewerGoogleButton"),
    mapViewerZoomOutButton: byId("mapViewerZoomOutButton"),
    mapViewerZoomInButton: byId("mapViewerZoomInButton"),
    mapViewerCloseButton: byId("mapViewerCloseButton"),
    cameraInput: byId("cameraInput"),
    microphoneInput: byId("microphoneInput"),
    videoQualityInput: byId("videoQualityInput"),
    videoMessageFacingInput: byId("videoMessageFacingInput"),
    mediaStatus: byId("mediaStatus"),
    refreshMediaButton: byId("refreshMediaButton"),
    previewMediaButton: byId("previewMediaButton"),
    stopMediaPreviewButton: byId("stopMediaPreviewButton"),
    providerSummary: byId("providerSummary"),
    capabilityList: byId("capabilityList"),
    xmppUrlInput: byId("xmppUrlInput"),
    xmppOpenButton: byId("xmppOpenButton"),
    xmppCloseButton: byId("xmppCloseButton"),
    clearLogButton: byId("clearLogButton"),
    debugLog: byId("debugLog")
  };

  document.body.classList.toggle("account-booting", state.accountBooting);
  document.body.classList.toggle("account-gate", state.accountGateRequired);
  document.body.classList.toggle("developer-mode", state.developerMode);
  applyDeviceDetection();
  configureInlineVideoPlayback();
  updateDeveloperPanelVisibility();
  bindEvents();
  el.sessionProfileInput.value = state.sessionProfile;
  applyNetworkDefaultsForCurrentHost();
  applyTheme(state.theme);
  applyChatBackground(state.chatBackground, { persist: false });
  renderMaterialIcons();
  renderSmileyPicker();
  renderTabs();
  renderConversations();
  renderActiveConversation();
  setConnectionStatus(t("status.disconnected", "Disconnected"), "warn");
  updateComposerAvailability();
  updateServerSettingsReadonly();
  updateConnectButtonAvailability();
  syncDoNotDisturbButton();
  resetServiceWorkerCachesIfRequested();
  loadPlatformConfig();
  applyMediaSettingsToControls();
  refreshMediaDevices(false);
  registerServiceWorker();
  setupMobileLifecycle();
  setupSessionInactivityTimeout();

  async function resetServiceWorkerCachesIfRequested() {
    if (!resetServiceWorker || !("serviceWorker" in navigator)) {
      return;
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete("reset-sw");
      location.replace(cleanUrl.toString());
    } catch (error) {
      appendDebug("cache-reset", error.message || String(error));
    }
  }

  function bindEvents() {
    el.themeButton.addEventListener("click", toggleTheme);
    el.chatBackgroundInput.addEventListener("change", () => applyChatBackground(el.chatBackgroundInput.value));
    el.newsButton.addEventListener("click", () => activateTab("news"));
    el.supportButton.addEventListener("click", () => activateSupportTab());
    el.historyButton.addEventListener("click", () => activateTab("history"));
    el.profileButton.addEventListener("click", () => openAccountDialog({ mode: "profile" }));
    el.accountButton.addEventListener("click", () => openAccountDialog({ mode: "settings" }));
    el.doNotDisturbButton.addEventListener("click", toggleDoNotDisturb);
    el.logoutButton.addEventListener("click", logoutAccount);
    el.settingsLogoutButton.addEventListener("click", logoutAccount);
    el.connectButton.addEventListener("click", () => {
      requestCallNotificationPermissionFromGesture();
      connectXmppWebSocket();
    });
    el.disconnectButton.addEventListener("click", disconnectAll);
    el.addConversationButton.addEventListener("click", addConversation);
    el.addGroupButton.addEventListener("click", addGroupConversation);
    el.inviteConversationButton.addEventListener("click", inviteContactToActiveGroup);
    el.conversationSearchInput.addEventListener("input", renderConversations);
    el.backToContactsButton.addEventListener("click", closeActiveConversation);
    el.activeConversationAvatar.addEventListener("click", openActiveConversationAvatarProfile);
    el.activeConversationAvatar.addEventListener("keydown", handleActiveConversationAvatarKeydown);
    el.contextProfileButton.addEventListener("click", openContextConversationProfile);
    el.contextRoomAvatarButton.addEventListener("click", chooseContextRoomAvatar);
    el.contextMuteNotificationsButton.addEventListener("click", toggleMuteContextConversationNotifications);
    el.contextBlockButton.addEventListener("click", toggleBlockContextConversation);
    el.mucAvatarFileInput.addEventListener("change", handleMucAvatarFileSelected);
    el.conversationContextMenu.addEventListener("click", (event) => event.stopPropagation());
    el.closeContactProfileButton.addEventListener("click", closeContactProfileDialog);
    el.contactProfileOkButton.addEventListener("click", closeContactProfileDialog);
    el.contactProfileDialog.addEventListener("click", closeContactProfileDialogOnBackdrop);
    el.messageContextMenu.addEventListener("click", (event) => event.stopPropagation());
    el.messageContextEditButton.addEventListener("click", editContextMessage);
    el.messageContextDeleteButton.addEventListener("click", deleteContextMessage);
    el.messageContextDownloadButton.addEventListener("click", downloadContextMessageAttachment);
    el.messageContextForwardButton.addEventListener("click", forwardContextMessage);
    el.startAudioCallOption.addEventListener("click", () => {
      requestCallNotificationPermissionFromGesture();
      startCallFromMenu("audio");
    });
    el.startVideoCallOption.addEventListener("click", () => {
      requestCallNotificationPermissionFromGesture();
      startCallFromMenu("video");
    });
    el.startTotalCallOption.addEventListener("click", () => {
      requestCallNotificationPermissionFromGesture();
      startCallFromMenu("total");
    });
    el.answerCallButton.addEventListener("click", answerIncomingCall);
    el.rejectCallButton.addEventListener("click", rejectIncomingCall);
    el.incomingAnswerButton.addEventListener("click", answerIncomingCall);
    el.incomingRejectButton.addEventListener("click", rejectIncomingCall);
    el.dialogAnswerButton.addEventListener("click", answerIncomingCall);
    el.dialogRejectButton.addEventListener("click", rejectIncomingCall);
    el.hangupCallButton.addEventListener("click", hangupCall);
    el.hangupCallPanelButton.addEventListener("click", hangupCall);
    el.toggleCameraButton.addEventListener("click", toggleCameraVideo);
    el.muteMicrophoneButton.addEventListener("click", toggleMicrophoneMute);
    el.muteRemoteAudioButton.addEventListener("click", toggleRemoteAudioMute);
    el.toggleTotalConversationTextButton.addEventListener("click", toggleTotalConversationText);
    el.callResizeHandle.addEventListener("pointerdown", startCallVideoResize);
    el.callCameraInput.addEventListener("change", () => handleMediaSettingsChange("video", "call"));
    el.callVideoFacingToggle.addEventListener("click", toggleCallVideoFacingMode);
    el.callVideoFacingInput.addEventListener("change", () => handleMediaSettingsChange("video", "call"));
    el.callMicrophoneInput.addEventListener("change", () => handleMediaSettingsChange("audio", "call"));
    el.remoteVolumeInput.addEventListener("input", saveRemoteVolumeFromControl);
    el.relayModeButton.addEventListener("click", () => setMode("xmpp"));
    el.xmppModeButton.addEventListener("click", () => setMode("xmpp"));
    el.closeTabPanelButton.addEventListener("click", () => activateTab("chat"));
    el.closeHistoryPageButton.addEventListener("click", () => activateTab("chat"));
    el.closeHistoryPrivacyDialogButton.addEventListener("click", closeHistoryPrivacyDialog);
    el.historyPrivacyOkButton.addEventListener("click", closeHistoryPrivacyDialog);
    el.historyPrivacyDialog.addEventListener("click", closeHistoryPrivacyDialogOnBackdrop);
    el.resetRttButton.addEventListener("click", sendRttReset);
    el.enableRttButton.addEventListener("click", enableLiveRttFromToolbar);
    el.attachmentMenuButton.addEventListener("click", toggleAttachmentMenu);
    el.attachmentPhotoButton.addEventListener("click", () => openAttachmentFilePicker("image/*", ""));
    el.attachmentVideoButton.addEventListener("click", () => openAttachmentFilePicker("video/*", ""));
    el.uploadFileButton.addEventListener("click", () => openAttachmentFilePicker("", ""));
    el.attachmentLocationButton.addEventListener("click", shareLocationFromAttachmentMenu);
    el.emojiButton.addEventListener("click", toggleSmileyPicker);
    el.smileyPickerPanel.addEventListener("click", handleSmileyPickerClick);
    el.videoMessageButton.addEventListener("click", recordNewVideoMessage);
    el.voiceMessageButton.addEventListener("click", toggleVoiceRecording);
    el.cancelVoiceMessageButton.addEventListener("click", cancelVoiceMessage);
    el.playVoiceMessageButton.addEventListener("click", () => togglePreviewPlayback("voice"));
    el.rerecordVoiceMessageButton.addEventListener("click", rerecordVoiceMessage);
    el.sendVoiceMessageButton.addEventListener("click", sendRecordedVoiceMessage);
    el.cancelVideoMessageButton.addEventListener("click", cancelVideoMessage);
    el.openVideoPreviewDialogButton.addEventListener("click", openVideoPreviewDialog);
    el.closeVideoPreviewDialogButton.addEventListener("click", closeVideoPreviewDialog);
    el.videoPreviewDialog.addEventListener("click", closeVideoPreviewDialogOnBackdrop);
    el.startVideoRecordingButton.addEventListener("click", toggleDialogVideoRecording);
    el.dialogCancelVideoMessageButton.addEventListener("click", cancelVideoMessage);
    el.dialogRerecordVideoMessageButton.addEventListener("click", rerecordVideoMessage);
    el.dialogSendVideoMessageButton.addEventListener("click", sendRecordedVideoMessage);
    el.playVideoMessageButton.addEventListener("click", () => togglePreviewPlayback("video"));
    el.rerecordVideoMessageButton.addEventListener("click", rerecordVideoMessage);
    el.sendVideoMessageButton.addEventListener("click", sendRecordedVideoMessage);
    for (const eventName of ["play", "pause", "ended"]) {
      el.voicePreviewAudio.addEventListener(eventName, () => updatePreviewPlaybackButton("voice"));
      el.videoPreviewVideo.addEventListener(eventName, () => updatePreviewPlaybackButton("video"));
      el.videoPreviewDialogVideo.addEventListener(eventName, () => updatePreviewPlaybackButton("video"));
    }
    el.fileInput.addEventListener("change", uploadSelectedFiles);
    document.addEventListener("dragenter", handleDragEnter);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop);
    document.addEventListener("click", closeCallMenusOnOutsideClick);
    document.addEventListener("click", closeAttachmentMenuOnOutsideClick);
    document.addEventListener("click", closeSmileyPickerOnOutsideClick);
    document.addEventListener("click", closeConversationContextMenuOnOutsideClick);
    document.addEventListener("click", closeMessageContextMenuOnOutsideClick);
    document.addEventListener("click", closeMessageReactionPickerOnOutsideClick);
    document.addEventListener("keydown", closeCallMenusOnEscape);
    document.addEventListener("keydown", closeAttachmentMenuOnEscape);
    document.addEventListener("keydown", closeSmileyPickerOnEscape);
    document.addEventListener("keydown", closeConversationContextMenuOnEscape);
    document.addEventListener("keydown", closeContactProfileDialogOnEscape);
    document.addEventListener("keydown", closeMessageContextMenuOnEscape);
    document.addEventListener("keydown", closeMessageReactionPickerOnEscape);
    document.addEventListener("keydown", closeAccountDialogOnEscape);
    document.addEventListener("keydown", closeAvatarCropDialogOnEscape);
    document.addEventListener("keydown", closeLocationShareDialogOnEscape);
    document.addEventListener("keydown", closePhotoViewerOnEscape);
    document.addEventListener("keydown", closeVideoPreviewDialogOnEscape);
    document.addEventListener("keydown", closeMapViewerOnEscape);
    window.addEventListener("resize", closeConversationContextMenu);
    window.addEventListener("resize", closeMessageContextMenu);
    window.addEventListener("resize", closeMessageReactionPicker);
    window.addEventListener("resize", () => handleViewportChange("resize"));
    window.addEventListener("orientationchange", () => handleViewportChange("orientationchange"));
    window.visualViewport?.addEventListener("resize", () => handleViewportChange("visual-viewport-resize"));
    window.addEventListener("scroll", closeConversationContextMenu, true);
    window.addEventListener("scroll", closeMessageContextMenu, true);
    window.addEventListener("scroll", closeMessageReactionPicker, true);
    document.addEventListener("visibilitychange", handleVisibilityLifecycleChange);
    window.addEventListener("focus", () => setClientLifecycleState("active", "focus"));
    window.addEventListener("blur", handleWindowLifecycleBlur);
    window.addEventListener("pageshow", () => setClientLifecycleState("active", "pageshow"));
    window.addEventListener("pagehide", () => setClientLifecycleState("inactive", "pagehide", { force: true }));
    document.addEventListener("freeze", () => setClientLifecycleState("inactive", "freeze", { force: true }));
    document.addEventListener("pause", () => setClientLifecycleState("inactive", "app-pause", { force: true }));
    document.addEventListener("resume", () => setClientLifecycleState("active", "app-resume"));
    window.addEventListener("teletyptel:lifecycle", handleNativeLifecycleEvent);
    for (const eventName of sessionActivityEvents) {
      document.addEventListener(eventName, recordSessionActivity, { passive: true, capture: true });
    }
    el.composerForm.addEventListener("submit", sendComposerMessage);
    el.messageInput.addEventListener("input", handleComposerInput);
    el.messageInput.addEventListener("keydown", handleComposerKeydown);
    el.switchSessionButton.addEventListener("click", switchBrowserSession);
    el.openSecondSessionButton.addEventListener("click", openSecondBrowserSession);
    el.saveAccountButton.addEventListener("click", () => {
      saveAccountProfile().catch((error) => {
        updateAccountStatus(error.message);
        appendDebug("account-error", error.message);
      });
    });
    el.resetAccountButton.addEventListener("click", resetAccountProfile);
    el.accountDialog.addEventListener("click", closeAccountDialogOnBackdrop);
    el.closeAccountDialogButton.addEventListener("click", closeAccountDialog);
    el.cancelAccountDialogButton.addEventListener("click", closeAccountDialog);
    el.accountSettingsMenu.querySelectorAll("[data-account-panel]").forEach((button) => {
      button.addEventListener("click", () => setAccountSettingsPanel(button.dataset.accountPanel || "profile"));
    });
    el.dialogCreateAccountButton.addEventListener("click", createAccountFromDialog);
    el.dialogGoogleLoginFallbackButton.addEventListener("click", startGoogleLoginFromDialog);
    el.dialogGoogleLoginOverlayButton.addEventListener("click", startGoogleLoginFromDialog);
    el.dialogFacebookLoginButton.addEventListener("click", startFacebookLoginFromDialog);
    el.dialogSaveAccountButton.addEventListener("click", () => saveAccountDialogProfile(false));
    el.dialogConnectButton.addEventListener("click", () => saveAccountDialogProfile(true));
    el.dialogForgotPasswordButton.addEventListener("click", requestPasswordResetFromDialog);
    el.dialogResetPasswordButton.addEventListener("click", resetPasswordFromDialog);
    el.verifyLoginTwoFactorButton.addEventListener("click", verifyLoginTwoFactorFromDialog);
    el.loginTwoFactorCodeInput.addEventListener("input", () => {
      el.verifyLoginTwoFactorButton.disabled = el.loginTwoFactorCodeInput.value.replace(/\D+/g, "").length !== 6;
    });
    el.changePasswordButton.addEventListener("click", changePasswordFromSecuritySection);
    el.dialogCurrentPasswordInput.addEventListener("input", updatePasswordRulesPanel);
    el.dialogNewPasswordInput.addEventListener("input", updatePasswordRulesPanel);
    el.dialogRepeatPasswordInput.addEventListener("input", updatePasswordRulesPanel);
    el.linkGoogleButton.addEventListener("click", startGoogleLinkFromDialog);
    el.unlinkGoogleButton.addEventListener("click", unlinkGoogleFromDialog);
    el.linkFacebookButton.addEventListener("click", startFacebookLinkFromDialog);
    el.unlinkFacebookButton.addEventListener("click", unlinkFacebookFromDialog);
    el.requestTwoFactorButton.addEventListener("click", requestTwoFactorSetupFromDialog);
    el.confirmTwoFactorButton.addEventListener("click", confirmTwoFactorSetupFromDialog);
    el.dialogServerSettingsButton.addEventListener("click", openDialogServerSettings);
    el.dialogChatBackgroundInput.addEventListener("change", () => applyChatBackground(el.dialogChatBackgroundInput.value));
    el.dialogMapProviderInput.addEventListener("change", () => {
      state.location.settings.mapProvider = normalizeMapProvider(el.dialogMapProviderInput.value);
      saveLocationSettings();
      renderOpenLocationDialog();
    });
    el.closeLocationShareDialogButton.addEventListener("click", closeLocationShareDialog);
    el.cancelLocationShareButton.addEventListener("click", closeLocationShareDialog);
    el.confirmLocationShareButton.addEventListener("click", shareLocationFromDialog);
    el.locationShareDurationInput.addEventListener("change", () => {
      state.location.settings.liveDurationMs = normalizeLocationLiveDurationMs(el.locationShareDurationInput.value);
      saveLocationSettings();
    });
    el.locationShareDialog.addEventListener("click", closeLocationShareDialogOnBackdrop);
    el.photoViewerCloseButton.addEventListener("click", closePhotoViewer);
    el.photoViewerZoomOutButton.addEventListener("click", () => zoomPhotoViewer(1 / 1.2));
    el.photoViewerZoomInButton.addEventListener("click", () => zoomPhotoViewer(1.2));
    el.photoViewerResetButton.addEventListener("click", resetPhotoViewer);
    el.photoViewerDialog.addEventListener("click", closePhotoViewerOnBackdrop);
    el.photoViewerCanvas.addEventListener("pointerdown", startPhotoViewerDrag);
    el.photoViewerCanvas.addEventListener("pointermove", movePhotoViewerDrag);
    el.photoViewerCanvas.addEventListener("pointerup", endPhotoViewerDrag);
    el.photoViewerCanvas.addEventListener("pointercancel", endPhotoViewerDrag);
    el.photoViewerCanvas.addEventListener("wheel", handlePhotoViewerWheel, { passive: false });
    el.photoViewerCanvas.addEventListener("contextmenu", downloadPhotoViewerAttachment);
    el.mapViewerCloseButton.addEventListener("click", closeMapViewer);
    el.mapViewerDialog.addEventListener("click", closeMapViewerOnBackdrop);
    el.mapViewerOpenStreetMapButton.addEventListener("click", () => setMapViewerProvider("openstreetmap"));
    el.mapViewerGoogleButton.addEventListener("click", () => setMapViewerProvider("google"));
    el.mapViewerZoomOutButton.addEventListener("click", () => zoomMapViewer(-1));
    el.mapViewerZoomInButton.addEventListener("click", () => zoomMapViewer(1));
    el.cameraInput.addEventListener("change", () => handleMediaSettingsChange("video"));
    el.microphoneInput.addEventListener("change", () => handleMediaSettingsChange("audio"));
    el.videoQualityInput.addEventListener("change", () => handleMediaSettingsChange("video"));
    el.videoRecorderQualityInput.addEventListener("change", () => handleMediaSettingsChange("video", "recorder"));
    el.videoRecorderQualityButton?.addEventListener("click", toggleVideoRecorderQualityMenu);
    el.videoRecorderQualityMenu?.addEventListener("click", handleVideoRecorderQualityMenuClick);
    el.videoRecorderCameraButton?.addEventListener("click", toggleVideoRecorderCameraMenu);
    el.videoRecorderCameraMenu?.addEventListener("click", handleVideoRecorderCameraMenuClick);
    document.addEventListener("click", closeVideoRecorderQualityMenuOnOutsideClick);
    document.addEventListener("keydown", closeVideoRecorderQualityMenuOnEscape);
    el.videoMessageFacingInput.addEventListener("change", () => handleMediaSettingsChange("video"));
    el.refreshMediaButton.addEventListener("click", () => refreshMediaDevices(true));
    el.previewMediaButton.addEventListener("click", previewMedia);
    el.stopMediaPreviewButton.addEventListener("click", stopMediaPreview);
    el.dialogCameraInput.addEventListener("change", () => handleMediaSettingsChange("video", "dialog"));
    el.dialogMicrophoneInput.addEventListener("change", () => handleMediaSettingsChange("audio", "dialog"));
    el.dialogVideoQualityInput.addEventListener("change", () => handleMediaSettingsChange("video", "dialog"));
    el.dialogVideoMessageFacingInput.addEventListener("change", () => handleMediaSettingsChange("video", "dialog"));
    el.dialogRefreshMediaButton.addEventListener("click", () => refreshMediaDevices(true));
    el.dialogPreviewMediaButton.addEventListener("click", previewMedia);
    el.dialogStopMediaPreviewButton.addEventListener("click", stopMediaPreview);
    el.peerInput.addEventListener("change", updateRelayConversationMeta);
    el.displayNameInput.addEventListener("change", handleAccountIdentityChanged);
    el.jidInput.addEventListener("change", handleAccountIdentityChanged);
    el.avatarColorInput.addEventListener("input", () => handleAvatarColorChanged("main"));
    el.chooseAvatarButton.addEventListener("click", () => el.avatarFileInput.click());
    el.avatarFileInput.addEventListener("change", () => handleAvatarFileSelected(el.avatarFileInput));
    el.clearAvatarButton.addEventListener("click", clearAccountAvatar);
    el.dialogAvatarColorInput.addEventListener("input", () => handleAvatarColorChanged("dialog"));
    el.dialogChooseAvatarButton.addEventListener("click", () => el.dialogAvatarFileInput.click());
    el.dialogAvatarFileInput.addEventListener("change", () => handleAvatarFileSelected(el.dialogAvatarFileInput));
    el.dialogClearAvatarButton.addEventListener("click", clearAccountAvatar);
    el.closeAvatarCropButton.addEventListener("click", closeAvatarCropDialog);
    el.cancelAvatarCropButton.addEventListener("click", closeAvatarCropDialog);
    el.applyAvatarCropButton.addEventListener("click", applyAvatarCrop);
    el.avatarCropDialog.addEventListener("click", closeAvatarCropDialogOnBackdrop);
    el.avatarCropZoomInput.addEventListener("input", updateAvatarCropZoom);
    el.avatarCropCanvas.addEventListener("pointerdown", startAvatarCropDrag);
    el.avatarCropCanvas.addEventListener("pointermove", moveAvatarCropDrag);
    el.avatarCropCanvas.addEventListener("pointerup", endAvatarCropDrag);
    el.avatarCropCanvas.addEventListener("pointercancel", endAvatarCropDrag);
    el.rttToggle.addEventListener("change", () => {
      if (state.account) {
        state.account.liveRttEnabled = el.rttToggle.checked;
      }
      syncRttToolbarState();
    });
    el.smileyToggle.addEventListener("change", () => {
      if (state.account) {
        state.account.showSmileys = el.smileyToggle.checked;
      }
      renderActiveConversation();
    });
    el.sessionTimeoutToggle.addEventListener("change", () => {
      if (state.account) {
        state.account.sessionTimeoutEnabled = el.sessionTimeoutToggle.checked;
      }
      if (el.sessionTimeoutToggle.checked) {
        recordSessionActivity({ force: true });
        return;
      }

      window.clearTimeout(state.sessionIdleTimerId);
      state.sessionIdleTimerId = null;
    });
    el.passwordInput.addEventListener("input", updateAccountPasswordStatus);
    el.rememberPasswordToggle.addEventListener("change", updateAccountPasswordStatus);
    el.languageInput.addEventListener("change", () => handleLanguageInputChanged(el.languageInput.value));
    el.dialogLanguageInput.addEventListener("change", () => handleLanguageInputChanged(el.dialogLanguageInput.value));
    el.settingsLanguageInput.addEventListener("change", () => handleLanguageInputChanged(el.settingsLanguageInput.value));
    el.xmppOpenButton.addEventListener("click", connectXmppWebSocket);
    el.xmppCloseButton.addEventListener("click", closeXmppWebSocket);
    el.clearLogButton.addEventListener("click", () => {
      el.debugLog.textContent = "";
    });
  }

  function updateDeveloperPanelVisibility() {
    if (!el.developerPanel) {
      return;
    }

    const visible = state.developerMode === true;
    el.developerPanel.hidden = !visible;
    el.developerPanel.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function setupMobileLifecycle() {
    globalThis.TeletyptelLifecycle = {
      setActive: (reason = "native-active") => setClientLifecycleState("active", reason, { force: true }),
      setInactive: (reason = "native-inactive") => setClientLifecycleState("inactive", reason, { force: true }),
      refresh: (reason = "native-refresh") => flushClientLifecycleState(reason, true),
      state: () => ({
        current: state.clientLifecycle.current,
        relayLastSent: state.clientLifecycle.relayLastSent,
        xmppLastSent: state.clientLifecycle.xmppLastSent
      })
    };

    if (globalThis.chrome?.webview?.addEventListener) {
      globalThis.chrome.webview.addEventListener("message", (event) => {
        handleNativeLifecyclePayload(event.data, "webview2");
      });
    }

    setClientLifecycleState(browserLifecycleState(), "startup", { force: true });
  }

  function handleVisibilityLifecycleChange() {
    setClientLifecycleState(browserLifecycleState(), "visibilitychange");
  }

  function handleWindowLifecycleBlur() {
    clearTimeout(state.clientLifecycle.blurTimer);
    state.clientLifecycle.blurTimer = setTimeout(() => {
      if (document.visibilityState === "hidden" || document.hasFocus?.() === false) {
        setClientLifecycleState("inactive", "blur");
      }
    }, 750);
  }

  function handleNativeLifecycleEvent(event) {
    handleNativeLifecyclePayload(event.detail ?? event.data, "custom-event");
  }

  function handleNativeLifecyclePayload(payload, source) {
    const value = typeof payload === "string"
      ? payload
      : payload?.state ?? payload?.clientState ?? payload?.visibility;
    if (value === "active" || value === "foreground" || value === "visible") {
      setClientLifecycleState("active", `${source}-active`, { force: payload?.force === true });
    } else if (value === "inactive" || value === "background" || value === "hidden") {
      setClientLifecycleState("inactive", `${source}-inactive`, { force: payload?.force === true });
    }
  }

  function browserLifecycleState() {
    return document.visibilityState === "hidden" ? "inactive" : "active";
  }

  function setClientLifecycleState(nextState, reason, options = {}) {
    const normalized = nextState === "inactive" ? "inactive" : "active";
    clearTimeout(state.clientLifecycle.blurTimer);
    if (normalized === "inactive" && shouldHoldActiveLifecycleDuringMedia(reason)) {
      appendDebug("client-state", `kept active during media capture (${reason})`);
      return;
    }

    const changed = state.clientLifecycle.current !== normalized;
    state.clientLifecycle.current = normalized;
    if (changed || options.force === true) {
      flushClientLifecycleState(reason, options.force === true);
    }
  }

  function markMediaCaptureTransition(reason = "media-capture", durationMs = 8000) {
    state.clientLifecycle.mediaCaptureUntil = Math.max(
      state.clientLifecycle.mediaCaptureUntil || 0,
      Date.now() + durationMs);
    appendDebug("media-lifecycle", `${reason}: holding active transport state`);
  }

  function handleCallViewportChange(reason) {
    if (!state.call) {
      return;
    }

    markMediaCaptureTransition(`call-${reason}`, 15000);
    window.setTimeout(() => {
      updatePhoneLandscapeCallMode();
      updateCallUi();
      startVideoPlayback(el.localVideo);
      startVideoPlayback(el.remoteVideo);
    }, 350);
  }

  function handleViewportChange(reason) {
    applyViewportDetection();
    updatePhoneLandscapeCallMode();
    if (state.call) {
      handleCallViewportChange(reason);
    }
  }

  function updatePhoneLandscapeCallMode(visible = state.totalConversationTextVisible) {
    const metrics = currentViewportMetrics();
    const landscape = metrics.landscape;
    const phoneSized = isPhoneViewport();
    const keyboardVisible = landscape && phoneSized && metrics.visualHeight > 0 && metrics.visualHeight <= 430;
    document.body.classList.toggle(
      "tc-phone-landscape-active",
      Boolean(state.call && visible && landscape && phoneSized));
    document.body.classList.toggle(
      "tc-phone-keyboard-active",
      Boolean(state.call && visible && keyboardVisible));
  }

  function applyDeviceDetection() {
    const device = detectClientDevice();
    document.body.dataset.platform = device.platform;
    document.body.dataset.deviceClass = device.deviceClass;
    document.body.dataset.os = device.os;
    for (const className of Array.from(document.body.classList)) {
      if (className.startsWith("device-")) {
        document.body.classList.remove(className);
      }
    }
    document.body.classList.add(`device-${device.platform}`);
    document.body.classList.add(`device-${device.deviceClass}`);
    applyViewportDetection();
    appendDebug("device", `${device.platform}/${device.deviceClass}: ${device.userAgent}`);
  }

  function configureInlineVideoPlayback() {
    [
      el.remoteVideo,
      el.localVideo,
      el.videoPreviewVideo,
      el.videoPreviewDialogVideo
    ].forEach((video) => {
      if (video) {
        video.playsInline = true;
      }
    });
  }

  function applyViewportDetection() {
    const metrics = currentViewportMetrics();
    document.documentElement.style.setProperty("--visual-viewport-height", `${metrics.height}px`);
    const viewportClass = metrics.width <= 640
      ? "phone"
      : metrics.width <= 1024
        ? "tablet"
        : "desktop";
    document.body.dataset.viewportClass = viewportClass;
    document.body.dataset.viewportOrientation = metrics.landscape ? "landscape" : "portrait";
    for (const className of Array.from(document.body.classList)) {
      if (className.startsWith("viewport-")) {
        document.body.classList.remove(className);
      }
    }
    document.body.classList.add(`viewport-${viewportClass}`);
    document.body.classList.add(metrics.landscape ? "viewport-landscape" : "viewport-portrait");
  }

  function currentViewportMetrics() {
    const visualViewport = window.visualViewport;
    const visualWidth = Number(visualViewport?.width || 0);
    const visualHeight = Number(visualViewport?.height || 0);
    const layoutWidth = Number(window.innerWidth || document.documentElement.clientWidth || visualWidth || 0);
    const layoutHeight = Number(window.innerHeight || document.documentElement.clientHeight || visualHeight || 0);
    const width = Math.round(visualWidth || layoutWidth || 0);
    const height = Math.round(visualHeight || layoutHeight || 0);
    return {
      width,
      height,
      visualWidth: Math.round(visualWidth || width),
      visualHeight: Math.round(visualHeight || height),
      landscape: width > height
    };
  }

  function detectClientDevice() {
    const userAgent = navigator.userAgent || "";
    const platformText = navigator.userAgentData?.platform || navigator.platform || "";
    const touchPoints = Number(navigator.maxTouchPoints || 0);
    const isIpadDesktopMode = platformText === "MacIntel" && touchPoints > 1;
    const android = /Android/i.test(userAgent);
    const ios = /iP(?:hone|ad|od)/i.test(userAgent) || isIpadDesktopMode;
    const windows = /Windows/i.test(userAgent) || /Win/i.test(platformText);
    const macos = !ios && (/Macintosh|Mac OS X/i.test(userAgent) || /Mac/i.test(platformText));
    const linux = !android && (/Linux/i.test(userAgent) || /Linux/i.test(platformText));
    const mobileUa = /Mobi|Android.*Mobile|iPhone|iPod/i.test(userAgent);
    const tabletUa = /iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent) || isIpadDesktopMode;

    const platform = ios ? "ios" : android ? "android" : windows ? "windows" : macos ? "macos" : linux ? "linux" : "unknown";
    const os = ios ? "iOS" : android ? "Android" : windows ? "Windows" : macos ? "macOS" : linux ? "Linux" : "Unknown";
    const deviceClass = mobileUa ? "phone" : tabletUa ? "tablet" : "desktop";
    return { platform, os, deviceClass, userAgent };
  }

  function isPhoneDevice() {
    return document.body.dataset.deviceClass === "phone";
  }

  function isPhoneViewport() {
    return document.body.dataset.viewportClass === "phone"
      || (isPhoneDevice() && currentViewportMetrics().width <= 940);
  }

  function isMediaCaptureTransitionActive() {
    return Date.now() < (state.clientLifecycle.mediaCaptureUntil || 0);
  }

  function shouldHoldActiveLifecycleDuringMedia(reason) {
    return Boolean(state.call && isMediaCaptureTransitionActive() && reason !== "pagehide" && reason !== "freeze");
  }

  function flushClientLifecycleState(reason = "lifecycle", force = false) {
    sendClientStateToRelay(reason, force);
    sendClientStateToXmpp(reason, force);
    postClientLifecycleToNative(reason, force);
  }

  function sendClientStateToRelay(reason, force) {
    if (!isRelayConnected()) {
      return;
    }

    const clientState = state.clientLifecycle.current;
    if (!force && state.clientLifecycle.relayLastSent === clientState) {
      return;
    }

    const envelope = createRelayEnvelope(
      "client-state",
      "",
      createClientStateXml(clientState),
      "relay@localhost");
    envelope.clientState = clientState;
    envelope.notificationState = state.doNotDisturb ? "dnd" : "available";
    envelope.reason = reason;
    envelope.sentAt = new Date().toISOString();
    state.relaySocket.send(JSON.stringify(envelope));
    state.clientLifecycle.relayLastSent = clientState;
    appendDebug("client-state-out", `${clientState} ${reason}`);
  }

  function sendClientStateToXmpp(reason, force) {
    if (state.xmppSocket?.readyState !== WebSocket.OPEN || !state.xmppSession?.authenticated) {
      return;
    }

    const clientState = state.clientLifecycle.current;
    if (!force && state.clientLifecycle.xmppLastSent === clientState) {
      return;
    }

    const xml = createClientStateXml(clientState);
    sendXmppRaw(xml);
    state.clientLifecycle.xmppLastSent = clientState;
    appendDebug("csi-out", `${xml} (${reason})`);
  }

  function postClientLifecycleToNative(reason, force) {
    const payload = {
      type: "teletyptel.lifecycle",
      state: state.clientLifecycle.current,
      reason,
      forced: force,
      at: new Date().toISOString()
    };
    const signature = `${payload.state}:${payload.reason}:${payload.forced}`;
    if (!force && state.clientLifecycle.nativeLastPosted === signature) {
      return;
    }

    state.clientLifecycle.nativeLastPosted = signature;

    try {
      globalThis.chrome?.webview?.postMessage?.(payload);
    } catch {
    }

    try {
      globalThis.webkit?.messageHandlers?.teletyptelLifecycle?.postMessage?.(payload);
    } catch {
    }
  }

  function createClientStateXml(clientState) {
    const element = clientState === "inactive" ? "inactive" : "active";
    return `<${element} xmlns="urn:xmpp:csi:0"/>`;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function loadSessionProfile() {
    const requested = new URL(location.href).searchParams.get("profile");
    const saved = sessionStorage.getItem(sessionProfileStorageKey);
    const profile = sanitizeSessionProfile(requested || saved || "default");
    sessionStorage.setItem(sessionProfileStorageKey, profile);
    return profile;
  }

  function sanitizeSessionProfile(value) {
    const normalized = String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
    return normalized || "default";
  }

  function accountStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? accountStorageKeyBase : `${accountStorageKeyBase}.${normalized}`;
  }

  function clientInstanceStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? clientInstanceStorageKeyBase : `${clientInstanceStorageKeyBase}.${normalized}`;
  }

  function blockedJidsStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? blockedJidsStorageKeyBase : `${blockedJidsStorageKeyBase}.${normalized}`;
  }

  function mutedNotificationJidsStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? mutedNotificationJidsStorageKeyBase : `${mutedNotificationJidsStorageKeyBase}.${normalized}`;
  }

  function xmppStreamManagementStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? xmppStreamManagementStorageKeyBase : `${xmppStreamManagementStorageKeyBase}.${normalized}`;
  }

  function locationSettingsStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? locationSettingsStorageKeyBase : `${locationSettingsStorageKeyBase}.${normalized}`;
  }

  function chatBackgroundStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? chatBackgroundStorageKeyBase : `${chatBackgroundStorageKeyBase}.${normalized}`;
  }

  function historySettingsStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? historySettingsStorageKeyBase : `${historySettingsStorageKeyBase}.${normalized}`;
  }

  function loadBlockedJids(profile) {
    const saved = localStorage.getItem(blockedJidsStorageKeyFor(profile));
    if (!saved) {
      return [];
    }

    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.map(normalizeBlockJid).filter(Boolean)
        : [];
    } catch {
      localStorage.removeItem(blockedJidsStorageKeyFor(profile));
      return [];
    }
  }

  function saveBlockedJids() {
    localStorage.setItem(
      blockedJidsStorageKeyFor(state.sessionProfile),
      JSON.stringify(Array.from(state.blockedJids).sort()));
  }

  function loadMutedNotificationJids(profile) {
    const saved = localStorage.getItem(mutedNotificationJidsStorageKeyFor(profile));
    if (!saved) {
      return [];
    }

    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.map(normalizeBlockJid).filter(Boolean)
        : [];
    } catch {
      localStorage.removeItem(mutedNotificationJidsStorageKeyFor(profile));
      return [];
    }
  }

  function saveMutedNotificationJids() {
    localStorage.setItem(
      mutedNotificationJidsStorageKeyFor(state.sessionProfile),
      JSON.stringify(Array.from(state.mutedNotificationJids).sort()));
  }

  function loadLocationSettings(profile) {
    const saved = localStorage.getItem(locationSettingsStorageKeyFor(profile));
    if (!saved) {
      return defaultLocationSettings();
    }

    try {
      return normalizeLocationSettings({
        ...defaultLocationSettings(),
        ...JSON.parse(saved)
      });
    } catch {
      localStorage.removeItem(locationSettingsStorageKeyFor(profile));
      return defaultLocationSettings();
    }
  }

  function saveLocationSettings() {
    localStorage.setItem(
      locationSettingsStorageKeyFor(state.sessionProfile),
      JSON.stringify(state.location.settings));
  }

  function loadHistorySettings(profile) {
    const saved = localStorage.getItem(historySettingsStorageKeyFor(profile));
    if (!saved) {
      return defaultHistorySettings();
    }

    try {
      return normalizeHistorySettings({
        ...defaultHistorySettings(),
        ...JSON.parse(saved)
      });
    } catch {
      localStorage.removeItem(historySettingsStorageKeyFor(profile));
      return defaultHistorySettings();
    }
  }

  function saveHistorySettings() {
    state.historySettings = normalizeHistorySettings(state.historySettings);
    localStorage.setItem(
      historySettingsStorageKeyFor(state.sessionProfile),
      JSON.stringify(state.historySettings));
  }

  function defaultHistorySettings() {
    return {
      saveChat: true,
      saveTotalConversation: true,
      retention: "365"
    };
  }

  function normalizeHistorySettings(settings) {
    const retention = String(settings?.retention ?? "365");
    return {
      saveChat: settings?.saveChat !== false,
      saveTotalConversation: settings?.saveTotalConversation !== false,
      retention: ["30", "90", "365", "730", "1825", "unlimited"].includes(retention) ? retention : "365"
    };
  }

  function normalizeLocationSettings(settings) {
    return {
      ...settings,
      liveDurationMs: normalizeLocationLiveDurationMs(settings.liveDurationMs),
      mapProvider: normalizeMapProvider(settings.mapProvider)
    };
  }

  function normalizeMapProvider(value) {
    return value === "google" ? "google" : "openstreetmap";
  }

  function normalizeLocationLiveDurationMs(value) {
    const number = Number(value);
    const allowed = locationDurationOptions.map(([duration]) => duration);
    if (allowed.includes(number)) {
      return number;
    }

    if (Number.isFinite(number)) {
      return Math.min(maxLocationLiveDurationMs, Math.max(15 * 60 * 1000, number));
    }

    return 15 * 60 * 1000;
  }

  function defaultLocationSettings() {
    return {
      highAccuracy: true,
      timeoutMs: 10000,
      maximumAgeMs: 15000,
      liveIntervalMs: 15000,
      liveDurationMs: 15 * 60 * 1000,
      mapProvider: "openstreetmap"
    };
  }

  function loadTheme() {
    const saved = localStorage.getItem("teletyptel.theme");
    if (saved === "light" || saved === "dark") {
      return saved;
    }

    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function loadMediaSettings() {
    const saved = localStorage.getItem(mediaSettingsStorageKey);
    if (!saved) {
      return defaultMediaSettings();
    }

    try {
      return {
        ...defaultMediaSettings(),
        ...JSON.parse(saved)
      };
    } catch {
      localStorage.removeItem(mediaSettingsStorageKey);
      return defaultMediaSettings();
    }
  }

  function defaultMediaSettings() {
    return {
      cameraDeviceId: "",
      microphoneDeviceId: "",
      videoQuality: "default",
      videoMessageFacingMode: "user",
      remoteVolume: 1,
      remoteSoundMuted: false
    };
  }

  function loadClientInstance(profile) {
    const key = clientInstanceStorageKeyFor(profile);
    const saved = sessionStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.id === "string" && parsed.id) {
          return parsed;
        }
      } catch {
        sessionStorage.removeItem(key);
      }
    }

    const id = createShortId();
    const instance = {
      id,
      resourceSuffix: id.slice(0, 6)
    };
    sessionStorage.setItem(key, JSON.stringify(instance));
    return instance;
  }

  function createShortId() {
    const bytes = new Uint8Array(8);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    return Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-6);
  }

  function toggleTheme() {
    applyTheme(state.theme === "dark" ? "light" : "dark");
    el.viewMenu.removeAttribute("open");
  }

  function toggleDoNotDisturb() {
    state.doNotDisturb = !state.doNotDisturb;
    localStorage.setItem(doNotDisturbStorageKey, state.doNotDisturb ? "1" : "0");
    if (state.doNotDisturb) {
      closeIncomingCallBrowserNotification();
    }
    syncDoNotDisturbButton();
    sendPresence("online");
    flushClientLifecycleState("do-not-disturb", true);
    setConnectionStatus(state.doNotDisturb
      ? t("status.do_not_disturb_on", "Do not disturb is on. Browser notifications are muted.")
      : t("status.do_not_disturb_off", "Do not disturb is off. Browser notifications are enabled."), state.doNotDisturb ? "warn" : "good");
  }

  function syncDoNotDisturbButton() {
    if (!el.doNotDisturbButton) {
      return;
    }

    const label = state.doNotDisturb
      ? t("button.do_not_disturb_on", "Do not disturb on")
      : t("button.do_not_disturb", "Do not disturb");
    el.doNotDisturbButton.classList.toggle("selected", state.doNotDisturb);
    el.doNotDisturbButton.title = label;
    el.doNotDisturbButton.setAttribute("aria-label", label);
    const srText = el.doNotDisturbButton.querySelector(".sr-only");
    if (srText) {
      srText.textContent = label;
    }
  }

  function loadChatBackground(profile) {
    return normalizeChatBackground(localStorage.getItem(chatBackgroundStorageKeyFor(profile)));
  }

  function normalizeChatBackground(value) {
    return chatBackgroundIds.has(value) ? value : "auto";
  }

  function applyChatBackground(background, options = {}) {
    state.chatBackground = normalizeChatBackground(background);
    document.body.dataset.chatBackground = state.chatBackground;
    syncChatBackgroundControls();
    if (options.persist !== false) {
      localStorage.setItem(chatBackgroundStorageKeyFor(state.sessionProfile), state.chatBackground);
    }
  }

  function syncChatBackgroundControls() {
    el.chatBackgroundInput.value = state.chatBackground;
    if (el.dialogChatBackgroundInput) {
      el.dialogChatBackgroundInput.value = state.chatBackground;
    }
  }

  function applyTheme(theme) {
    state.theme = theme === "light" ? "light" : "dark";
    document.body.dataset.theme = state.theme;
    localStorage.setItem("teletyptel.theme", state.theme);
    el.themeButton.textContent = state.theme === "dark"
      ? t("button.theme_white", "Mode: White")
      : t("button.theme_black", "Mode: Black");
    el.themeButton.setAttribute(
      "aria-label",
      state.theme === "dark"
        ? t("aria.theme_white", "Switch to white mode")
        : t("aria.theme_black", "Switch to black mode"));
    el.themeButton.title = el.themeButton.getAttribute("aria-label");
  }

  function setMode(mode) {
    state.mode = mode;
    el.relayModeButton.classList.toggle("selected", mode === "relay");
    el.xmppModeButton.classList.toggle("selected", mode === "xmpp");
    el.relayModeButton.setAttribute("aria-selected", mode === "relay" ? "true" : "false");
    el.xmppModeButton.setAttribute("aria-selected", mode === "xmpp" ? "true" : "false");
    setDefaultComposerState();
    updateComposerAvailability();
  }

  function applyNetworkDefaultsForCurrentHost() {
    el.relayUrlInput.value = "";
    el.xmppUrlInput.value = normalizeLocalXmppWebSocketUrlForCurrentHost(el.xmppUrlInput.value);
  }

  async function loadPlatformConfig() {
    let savedAccount = null;
    let databaseLoaded = false;
    try {
      savedAccount = loadSavedAccountProfile();
      const hasSavedAccountSession = Boolean(savedAccount?.accountId || savedAccount?.jid);
      state.suppressAutoLoginDialog = hasSavedAccountSession;
      const account = mergeAccountProfiles(
        applySessionAccountDefaults(await fetchJson("config/account-profile.json"), savedAccount),
        savedAccount);
      if (oauthAccountId) {
        account.accountId = oauthAccountId;
        account.loginToken = oauthLoginToken;
      }
      state.account = account;
      applyAccountProfile(account);
      databaseLoaded = await loadDatabaseAccount(account.accountId, accountLoginToken(account));
      if (databaseLoaded) {
        if (oauthAccountId || state.account.savedInDatabase) {
          storeServerAccountBrowserSession(state.account);
        }
        if (oauthAccountId) {
          cleanOauthUrl();
        }
      }
      await loadMessageHistory();
      await loadConversationHistory();
      await loadLanguage(state.account.preferredLanguage ?? "eng");
      await loadRtcConfig();
      const provider = await fetchJson(`config/providers/${encodeURIComponent(state.account.providerId)}.json`);
      state.provider = provider;
      await loadGoogleMapsConfig();
      renderProvider();
      renderTabs();
      setAccountBooting(false);
      showAccountStartIfRequired(!databaseLoaded && !state.pendingLoginTwoFactor && !hasSavedAccountSession);
      setAccountReady(databaseLoaded || hasSavedAccountSession);
      if (databaseLoaded || state.account?.password) {
        autoConnectIfReady();
      }
      openPasswordResetDialogIfRequested();
      appendDebug("config", `Loaded provider ${provider.providerId}`);
    } catch (error) {
      el.providerSummary.textContent = t("provider.unavailable", "Provider manifest unavailable.");
      appendDebug("config-error", error.message);
      await loadLanguage(state.account?.preferredLanguage ?? "eng");
      await loadRtcConfig();
      await loadGoogleMapsConfig();
      renderTabs();
      setAccountBooting(false);
      const hasSavedAccountSession = Boolean(savedAccount?.accountId || savedAccount?.jid || hasStoredAccountSession());
      state.suppressAutoLoginDialog = hasSavedAccountSession;
      showAccountStartIfRequired(!databaseLoaded && !state.pendingLoginTwoFactor && !hasSavedAccountSession);
      setAccountReady(databaseLoaded || hasSavedAccountSession);
      if (databaseLoaded || state.account?.password) {
        autoConnectIfReady();
      }
      openPasswordResetDialogIfRequested();
    }
  }

  async function loadGoogleMapsConfig() {
    try {
      const config = await fetchJson("config/google-maps.json");
      const apiKey = String(config.apiKey || "").trim();
      if (apiKey) {
        state.mapViewer.googleApiKey = apiKey;
        localStorage.setItem("teletyptel.googleMapsApiKey", apiKey);
        appendDebug("maps", "Google Maps API key loaded from local config.");
      }
      const mapId = String(config.mapId || "").trim();
      if (mapId) {
        state.mapViewer.googleMapId = mapId;
        localStorage.setItem("teletyptel.googleMapsMapId", mapId);
      }
    } catch {
      if (state.mapViewer.googleApiKey) {
        appendDebug("maps", "Google Maps API key loaded from browser storage.");
      }
    }
  }

  async function renderGoogleSdkLoginButton() {
    if (!el.dialogGoogleLoginButton || !el.dialogGoogleLoginFallbackButton || !el.dialogGoogleLoginOverlayButton) {
      return;
    }
    const wrapper = el.dialogGoogleLoginButton.closest(".google-sdk-login-wrap");
    const row = el.dialogGoogleLoginButton.closest(".social-login-row");
    if (row?.hidden) {
      return;
    }
    if (wrapper?.classList.contains("sdk-ready") && el.dialogGoogleLoginButton.querySelector("iframe")) {
      return;
    }

    const rect = el.dialogGoogleLoginButton.getBoundingClientRect();
    if (rect.width < 36) {
      return;
    }

    wrapper?.classList.remove("sdk-ready");
    wrapper?.classList.add("sdk-rendering");
    el.dialogGoogleLoginButton.replaceChildren();
    el.dialogGoogleLoginFallbackButton.hidden = false;
    el.dialogGoogleLoginOverlayButton.hidden = true;

    try {
      const config = await fetchJson("api/auth/public-config.php");
      const clientId = String(config?.google?.clientId || "").trim();
      if (!clientId) {
        wrapper?.classList.remove("sdk-rendering");
        appendDebug("google-sdk", "Google client ID unavailable; using fallback button.");
        return;
      }

      const locale = languageCodeForGoogleButton();
      el.dialogGoogleLoginButton.dataset.locale = locale;
      await loadExternalScript(`https://accounts.google.com/gsi/client?hl=${encodeURIComponent(locale)}`, `teletyptel-google-identity-${locale}`);
      if (!globalThis.google?.accounts?.id?.initialize || !globalThis.google?.accounts?.id?.renderButton) {
        throw new Error("Google Identity Services unavailable.");
      }

      globalThis.google.accounts.id.initialize({
        client_id: clientId,
        callback: () => startGoogleLoginFromDialog()
      });
      globalThis.google.accounts.id.renderButton(el.dialogGoogleLoginButton, {
        type: "icon",
        theme: "filled_black",
        size: "large",
        text: "sign_in_with",
        shape: "circle",
        logo_alignment: "left",
        width: 44,
        locale
      });
      window.setTimeout(() => activateGoogleSdkLoginButton(), 500);
    } catch (error) {
      resetGoogleSdkLoginButton();
      appendDebug("google-sdk-error", error.message || String(error));
    }
  }

  function activateGoogleSdkLoginButton() {
    if (!el.dialogGoogleLoginButton || !el.dialogGoogleLoginOverlayButton) {
      return;
    }
    const wrapper = el.dialogGoogleLoginButton.closest(".google-sdk-login-wrap");
    const iframe = el.dialogGoogleLoginButton.querySelector("iframe");
    const frameRect = iframe?.getBoundingClientRect();
    if (iframe && frameRect && frameRect.width >= 36 && frameRect.height >= 32) {
      wrapper?.classList.remove("sdk-rendering");
      wrapper?.classList.add("sdk-ready");
      el.dialogGoogleLoginOverlayButton.hidden = false;
      appendDebug("google-sdk", "Google Identity Services button rendered.");
      return;
    }
    resetGoogleSdkLoginButton();
    appendDebug("google-sdk", "Google Identity Services button unavailable; using fallback button.");
  }

  function resetGoogleSdkLoginButton() {
    const wrapper = el.dialogGoogleLoginButton?.closest(".google-sdk-login-wrap");
    wrapper?.classList.remove("sdk-rendering", "sdk-ready");
    el.dialogGoogleLoginButton?.replaceChildren();
    if (el.dialogGoogleLoginFallbackButton) {
      el.dialogGoogleLoginFallbackButton.hidden = false;
    }
    if (el.dialogGoogleLoginOverlayButton) {
      el.dialogGoogleLoginOverlayButton.hidden = true;
    }
  }

  function loadExternalScript(src, marker) {
    const existing = document.querySelector(`script[data-${marker}]`);
    if (existing) {
      return existing.dataset.loaded === "true"
        ? Promise.resolve()
        : new Promise((resolve, reject) => {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
        });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.defer = true;
      script.setAttribute(`data-${marker}`, "true");
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  function languageCodeForGoogleButton() {
    const lang = String(state.account?.preferredLanguage || el.languageInput?.value || document.documentElement.lang || "").toLowerCase();
    return lang.startsWith("ned") || lang.startsWith("nl") ? "nl" : "en";
  }

  async function loadLanguage(code) {
    const normalized = normalizeLanguageCode(code);
    state.languageCode = normalized;
    syncLanguageInputs(normalized);

    try {
      const text = await fetchText(`${languageBasePath}${encodeURIComponent(normalized)}.lng`);
      state.translations = parseLng(text);
      applyTranslations();
      appendDebug("lng", `Loaded ${normalized}`);
    } catch (error) {
      if (normalized !== "eng") {
        appendDebug("lng-error", `${normalized}: ${error.message}`);
        await loadLanguage("eng");
        return;
      }

      appendDebug("lng-error", error.message);
    }
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }

    return response.text();
  }

  function parseLng(text) {
    const map = new Map();
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const equals = line.indexOf("=");
      if (equals <= 0) {
        continue;
      }

      map.set(line.slice(0, equals).trim(), line.slice(equals + 1).trim());
    }

    return map;
  }

  function t(key, fallback = key) {
    return state.translations.get(key) ?? fallback;
  }

  function createMaterialIcon(name) {
    const icon = materialIcons[name];
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("material-icon-svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("viewBox", icon?.viewBox ?? "0 0 24 24");

    for (const d of icon?.paths ?? []) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }

    return svg;
  }

  function renderMaterialIcons(root = document) {
    for (const node of root.querySelectorAll("[data-icon]")) {
      const name = node.dataset.icon;
      if (!materialIcons[name] || node.dataset.renderedIcon === name) {
        continue;
      }

      node.replaceChildren(createMaterialIcon(name));
      node.dataset.renderedIcon = name;
    }
  }

  function createScreenReaderText(text) {
    const span = document.createElement("span");
    span.className = "sr-only";
    span.textContent = text;
    return span;
  }

  function setIconButtonContent(button, iconName, label) {
    button.replaceChildren(createMaterialIcon(iconName), createScreenReaderText(label));
    button.title = label;
    button.setAttribute("aria-label", label);
  }

  function renderSmileyPicker() {
    const fragment = document.createDocumentFragment();
    for (const smiley of smiles) {
      const code = smiley.codes[0];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "smiley-picker-option";
      button.dataset.smileyCode = code;
      button.setAttribute("role", "menuitem");
      button.title = smiley.codes.join(" / ");
      button.setAttribute("aria-label", `${smiley.name}: ${smiley.codes.join(" / ")}`);

      const image = document.createElement("img");
      image.src = smileyBasePath + encodeURIComponent(smiley.fileName);
      image.alt = code;
      image.loading = "lazy";
      image.addEventListener("error", () => {
        const fallbackFile = smiley.fileName.replace(/\.[^.]+$/, ".svg");
        if (fallbackFile !== smiley.fileName && !image.dataset.triedSvg) {
          image.dataset.triedSvg = "1";
          image.src = smileyBasePath + encodeURIComponent(fallbackFile);
        }
      });

      button.appendChild(image);
      fragment.appendChild(button);
    }

    el.smileyPickerPanel.replaceChildren(fragment);
  }

  function applyTranslations() {
    document.title = t("app.title", document.title);
    for (const node of document.querySelectorAll("[data-i18n]")) {
      node.textContent = t(node.dataset.i18n, node.textContent);
    }

    for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
      node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder, node.getAttribute("placeholder") ?? ""));
    }

    for (const node of document.querySelectorAll("[data-i18n-aria-label]")) {
      node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel, node.getAttribute("aria-label") ?? ""));
    }

    for (const node of document.querySelectorAll("[data-i18n-title]")) {
      node.setAttribute("title", t(node.dataset.i18nTitle, node.getAttribute("title") ?? ""));
    }

    renderMaterialIcons();
    applyTheme(state.theme);
    setMode(state.mode);
    if (state.provider) {
      renderProvider();
    }

    renderMediaDeviceSelects();
    renderTabs();
    renderConversations();
    renderActiveConversation();
    if (!el.accountDialog.hidden) {
      updateAccountDialogMode();
    }

    if (state.account) {
      updateAccountStatus(accountStatusPrefix());
    }
    syncEmojiButtonState();
    updateCallUi();
  }

  function normalizeLanguageCode(code) {
    const value = String(code ?? "").toLowerCase();
    if (value === "nl" || value === "nld" || value === "ned") {
      return "ned";
    }

    return "eng";
  }

  async function loadDatabaseAccount(accountId, loginToken = "") {
    try {
      const query = new URLSearchParams({ accountId });
      if (loginToken) {
        query.set("loginToken", loginToken);
      }
      const response = await fetch(`${accountApiPath}?${query.toString()}`, {
        cache: "no-store"
      });
      if (response.status === 404) {
        appendDebug("account-db", "No server account yet");
        return;
      }

      if (!response.ok) {
        throw new Error(`account API returned ${response.status}`);
      }

      const payload = await response.json();
      if (payload.ok && payload.twoFactorRequired) {
        showLoginTwoFactorChallenge(payload, { oauth: Boolean(loginToken), connectAfterSave: true });
        return false;
      }

      if (payload.ok && payload.account) {
        state.account = {
          ...state.account,
          ...payload.account,
          savedInDatabase: true
        };
        applyAccountProfile(state.account);
        appendDebug("account-db", `Loaded ${state.account.jid}`);
        return true;
      }
      return false;
    } catch (error) {
      appendDebug("account-db-error", error.message);
      return false;
    }
  }

  async function loadMessageHistory() {
    if (!state.account?.accountId) {
      return false;
    }

    try {
      const result = await fetchHistoryPayload({ limit: "1000" }, "messages", "history");
      if (!result) {
        return false;
      }

      const { payload } = result;
      if (!payload.ok || !Array.isArray(payload.messages)) {
        return false;
      }

      let restored = 0;
      const restoredByPeer = new Map();
      for (const item of payload.messages) {
        const conversation = restoreHistoryMessage(item);
        if (conversation) {
          restored += 1;
          restoredByPeer.set(conversation.peer, (restoredByPeer.get(conversation.peer) || 0) + 1);
        }
      }

      renderConversations();
      renderActiveConversation();
      syncAllConversationMessageState("history");
      appendDebug("history", `Loaded ${payload.messages.length} messages from ${result.accountId}, restored ${restored}: ${Array.from(restoredByPeer, ([peer, count]) => `${peer}=${count}`).join(", ")}`);
      return true;
    } catch (error) {
      appendDebug("history-error", error.message);
      return false;
    }
  }

  function syncLanguageInputs(code) {
    const normalized = normalizeLanguageCode(code);
    [el.languageInput, el.dialogLanguageInput, el.settingsLanguageInput].forEach((input) => {
      if (input) {
        input.value = normalized;
      }
    });
  }

  function handleLanguageInputChanged(code) {
    const normalized = normalizeLanguageCode(code);
    syncLanguageInputs(normalized);
    if (state.account) {
      state.account.preferredLanguage = normalized;
    }
    loadLanguage(normalized).catch((error) => appendDebug("lng-error", error.message || String(error)));
  }

  async function loadRtcConfig() {
    try {
      const config = await fetchJson(rtcConfigApiPath);
      if (Array.isArray(config.iceServers)) {
        state.rtcConfig = {
          iceServers: config.iceServers,
          iceTransportPolicy: config.iceTransportPolicy === "relay" ? "relay" : "all",
          bundlePolicy: ["balanced", "max-bundle", "max-compat"].includes(config.bundlePolicy) ? config.bundlePolicy : "balanced",
          rtcpMuxPolicy: config.rtcpMuxPolicy === "negotiate" ? "negotiate" : "require"
        };
      }
      appendDebug("rtc-config", rtcConfigDebugSummary(state.rtcConfig));
    } catch (error) {
      appendDebug("rtc-config-error", error.message || String(error));
    }
  }

  function historyQueryParams(params = {}) {
    const query = new URLSearchParams({
      ...params
    });
    const loginToken = accountLoginToken();
    if (loginToken) {
      query.set("loginToken", loginToken);
    }
    return query;
  }

  function accountLoginToken(account = state.account) {
    return String(oauthLoginToken || account?.loginToken || "").trim();
  }

  async function fetchHistoryPayload(params, payloadField, debugLabel) {
    const attempted = [];
    for (const accountId of historyAccountIdCandidates()) {
      attempted.push(accountId);
      const query = historyQueryParams(params);
      query.set("accountId", accountId);
      const response = await fetch(`${historyApiPath}?${query.toString()}`, {
        cache: "no-store"
      });
      if (response.status === 404 || response.status === 401) {
        appendDebug(debugLabel, `History unavailable for ${accountId}: ${response.status}`);
        continue;
      }

      if (!response.ok) {
        throw new Error(`history API returned ${response.status}`);
      }

      const payload = await response.json();
      if (payload.ok && Array.isArray(payload[payloadField])) {
        if (accountId !== state.account.accountId) {
          appendDebug(debugLabel, `History account switched ${state.account.accountId} -> ${accountId}`);
        }
        return { payload, accountId };
      }
    }

    setConnectionStatus(`History unavailable: 401 (${attempted.join(", ")})`, "warn");
    return null;
  }

  function historyAccountIdCandidates() {
    const ids = [];
    const add = (value) => {
      const id = String(value || "").trim();
      if (id && !ids.includes(id)) {
        ids.push(id);
      }
    };
    add(state.account?.accountId);
    add(accountIdFromJid(stripGeneratedResourceSuffix(state.account?.jid || el.jidInput.value || "")));
    if (oauthAccountId) {
      add(oauthAccountId);
    }
    return ids;
  }

  function restoreHistoryMessage(item) {
    const peer = String(item.conversationPeer || "").trim();
    if (!peer) {
      return null;
    }

    const conversation = ensureConversationForPeer(
      peer,
      item.conversationKind === "group" ? "group" : "contact",
      item.conversationName || displayNameForJid(peer));
    if (!conversation) {
      return null;
    }

    const messageId = String(item.messageId || "").trim();
    if (messageId && conversation.messages.some((message) => messageMatchesAnyId(message, messageId))) {
      return null;
    }

    const message = addMessage(
      item.direction === "self" ? "self" : "peer",
      item.text || "",
      item.status || "history",
      item.from || null,
      item.attachment || null,
      conversation.id,
      item.location || null,
      messageId || null,
      item.stylingDisabled === true,
      false);
    if (!message) {
      return null;
    }

    message.edited = item.edited === true;
    message.retracted = item.retracted === true;
    message.retraction = item.retraction || null;
    message.callInfo = item.callInfo && typeof item.callInfo === "object" ? item.callInfo : null;
    message.jingleHistory = item.jingleHistory && typeof item.jingleHistory === "object" ? item.jingleHistory : null;
    message.reactions = normalizeMessageReactions(item.reactions);
    message.deliveryStatus = normalizeDeliveryStatus(item.deliveryStatus, message.direction);
    const timestamp = new Date(item.timestamp || Date.now());
    message.timestamp = Number.isNaN(timestamp.valueOf()) ? new Date() : timestamp;
    return conversation;
  }

  function persistHistoryMessage(conversation, message) {
    if (!state.historySettings.saveChat || !state.account?.accountId || !conversation || !message || message.draft || message.status === "history") {
      return;
    }

    const messageId = bestMessageTargetId(message);
    if (!messageId) {
      return;
    }

    const payload = {
      action: "save",
      accountId: state.account.accountId,
      conversationPeer: conversation.peer,
      conversationName: conversationDisplayName(conversation),
      conversationKind: conversation.kind === "group" ? "group" : "contact",
      messageId,
      direction: message.direction,
      from: message.from || "",
      text: message.text || "",
      status: message.status || "",
      attachment: message.attachment || null,
      location: message.location || null,
      callInfo: message.callInfo || null,
      jingleHistory: message.jingleHistory || null,
      stylingDisabled: message.stylingDisabled === true,
      edited: message.edited === true,
      retracted: message.retracted === true,
      retraction: message.retraction || null,
      reactions: normalizeMessageReactions(message.reactions),
      deliveryStatus: normalizeDeliveryStatus(message.deliveryStatus, message.direction),
      timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : new Date().toISOString()
    };
    postHistory(payload);
    persistRecipientHistoryMessage(conversation, message, payload);
  }

  function persistRecipientHistoryMessage(conversation, message, payload) {
    if (state.mode === "xmpp" || conversation.kind !== "contact" || message.direction !== "self" || isOwnPeer(conversation.peer)) {
      return;
    }

    postHistory({
      ...payload,
      action: "save_recipient",
      recipientPeer: conversation.peer,
      senderPeer: currentBareJid(),
      senderName: currentSenderName(),
      recipientStatus: "offline"
    });
  }

  function deleteHistoryMessage(message, text = null, retraction = null) {
    if (!state.account?.accountId || !message) {
      return;
    }

    const messageId = bestMessageTargetId(message);
    if (!messageId) {
      return;
    }

    postHistory({
      action: "delete",
      accountId: state.account.accountId,
      messageId,
      text: text || retractedMessageText(retraction),
      retraction
    });
  }

  function postHistory(payload) {
    fetch(historyApiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).then((response) => {
      if (!response.ok) {
        appendDebug("history-error", `history API returned ${response.status}`);
      }
    }).catch((error) => appendDebug("history-error", error.message));
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }

    return response.json();
  }

  function applyAccountProfile(account) {
    el.displayNameInput.value = account.displayName ?? el.displayNameInput.value;
    el.jidInput.value = createUniqueJid(account.jid ?? el.jidInput.value);
    state.account = {
      ...state.account,
      avatarDataUrl: account.avatarDataUrl ?? state.account?.avatarDataUrl ?? "",
      avatarColor: account.avatarColor || state.account?.avatarColor || avatarColorFor(account.displayName ?? account.jid ?? state.sessionProfile),
      sessionTimeoutEnabled: account.sessionTimeoutEnabled !== false,
      twoFactorEnabled: account.twoFactorEnabled === true || state.account?.twoFactorEnabled === true,
      twoFactorMethod: account.twoFactorMethod || state.account?.twoFactorMethod || ""
    };
    setAvatarColorControls(normalizeAvatarColor(state.account.avatarColor));
    el.passwordInput.value = account.rememberPassword ? account.password ?? "" : "";
    el.rememberPasswordToggle.checked = account.rememberPassword === true;
    el.rttToggle.checked = account.liveRttEnabled !== false;
    el.smileyToggle.checked = account.showSmileys !== false;
    el.sessionTimeoutToggle.checked = account.sessionTimeoutEnabled !== false;
    syncRttToolbarState();
    el.peerInput.value = account.peer && !addressMatches(account.peer, "relay@localhost")
      ? account.peer
      : "tester@localhost";
    el.phoneInput.value = account.phoneNumber ?? "";
    if (state.account) {
      state.account.birthDate = normalizeBirthDate(account.birthDate ?? state.account.birthDate ?? "");
    }
    syncLanguageInputs(account.preferredLanguage ?? "eng");
    el.providerInput.value = account.providerId ?? "";
    el.relayUrlInput.value = "";
    el.xmppUrlInput.value = normalizeLocalXmppWebSocketUrlForCurrentHost(account.xmppWebSocket ?? el.xmppUrlInput.value);
    state.account.xmppHost = account.xmppHost ?? state.account.xmppHost ?? domainFromJid(account.jid ?? "");
    state.account.xmppPort = account.xmppPort ?? state.account.xmppPort ?? 5222;
    state.account.xmppDomain = account.xmppDomain ?? state.account.xmppDomain ?? domainFromJid(account.jid ?? "");
    state.account.xmppTlsMode = "websocket";
    updateAccountStatus(account.savedInDatabase === true ? t("account.database_loaded", "Server account loaded") : t("account.default_profile", "Default account profile"));
    updateAccountAvatarPreview();
    updateRelayConversationMeta();
    reconcileContactsForCurrentAccount();
    syncAccountDialogFromControls();
  }

  function refreshDatabaseAccountAfterXmppAuthFailure() {
    if (state.xmppAuthRefreshAttempted
      || !state.account?.accountId
      || state.account?.savedInDatabase !== true) {
      return false;
    }

    state.xmppAuthRefreshAttempted = true;
    const accountId = state.account.accountId;
    const loginToken = accountLoginToken(state.account);
    appendDebug("xmpp-auth", "Refreshing server account after auth failure");
    state.intentionalDisconnect = true;
    closeXmppWebSocket();
    loadDatabaseAccount(accountId, loginToken)
      .then((loaded) => {
        if (!loaded || !state.account?.password) {
          returnToLoginScreenAfterDisconnect(t("account.invalid_credentials", "The server rejected this email or password."));
          return;
        }

        setAccountReady(true);
        state.intentionalDisconnect = false;
        connectXmppWebSocket();
      })
      .catch((error) => {
        appendDebug("xmpp-auth-refresh-error", error.message);
        returnToLoginScreenAfterDisconnect(t("account.invalid_credentials", "The server rejected this email or password."));
      });
    return true;
  }

  function showAccountStartIfRequired(required) {
    if (required) {
      requestLoginRequired(t("account.start_required", "Sign in or create an account before Teletyptel opens."));
      return;
    }

    setAccountGateRequired(false);
  }

  function shouldSuppressAutomaticLoginDialog(options = {}) {
    if (options.forceLogin === true || state.pendingLoginTwoFactor) {
      return false;
    }

    return state.suppressAutoLoginDialog === true
      && (hasStoredAccountSession() || Boolean(state.account?.accountId || state.account?.jid));
  }

  function setupSessionInactivityTimeout() {
    recordSessionActivity({ force: true });
  }

  function isSessionInactivityTimeoutEnabled() {
    return state.account?.sessionTimeoutEnabled !== false
      && el.sessionTimeoutToggle?.checked !== false;
  }

  function recordSessionActivity(options = {}) {
    if (state.sessionTimeoutInProgress) {
      return;
    }

    const now = Date.now();
    if (options.force !== true && now - state.sessionLastActivityRecordedAt < sessionActivityThrottleMs) {
      return;
    }

    state.sessionLastActivityAt = now;
    state.sessionLastActivityRecordedAt = now;
    scheduleSessionInactivityTimeout();
  }

  function scheduleSessionInactivityTimeout() {
    window.clearTimeout(state.sessionIdleTimerId);
    state.sessionIdleTimerId = null;
    if (!isSessionInactivityTimeoutEnabled() || !hasAccountSessionForInactivityTimeout()) {
      return;
    }

    const elapsed = Date.now() - state.sessionLastActivityAt;
    const delay = Math.max(1000, sessionInactivityTimeoutMs - elapsed);
    state.sessionIdleTimerId = window.setTimeout(handleSessionInactivityTimeout, delay);
  }

  function hasAccountSessionForInactivityTimeout() {
    return !state.accountGateRequired
      && Boolean(state.account?.accountId || state.account?.jid || hasStoredAccountSession());
  }

  function handleSessionInactivityTimeout() {
    if (!hasAccountSessionForInactivityTimeout()) {
      return;
    }

    const elapsed = Date.now() - state.sessionLastActivityAt;
    if (elapsed < sessionInactivityTimeoutMs) {
      scheduleSessionInactivityTimeout();
      return;
    }

    state.sessionTimeoutInProgress = true;
    logoutAccount({
      message: t("account.session_expired", "Session expired after inactivity. Sign in again."),
      forceLogin: true
    })
      .finally(() => {
        state.sessionTimeoutInProgress = false;
      });
  }

  function requestLoginRequired(message = "", options = {}) {
    const text = message || t("account.disconnected_login_required", "Connection closed. Sign in to continue.");
    const forceLogin = options.forceLogin === true;
    if (!forceLogin && (options.openLogin === false || shouldSuppressAutomaticLoginDialog(options))) {
      setAccountGateRequired(false);
      if (!el.accountDialog.hidden && effectiveAccountDialogMode() === "signin") {
        closeAccountDialog();
      }
      updateAccountStatus(text);
      updateConnectButtonAvailability();
      return false;
    }

    openAccountDialog({ required: true, forceLogin: true });
    el.dialogAccountStatus.textContent = text;
    return true;
  }

  function setAccountBooting(booting) {
    state.accountBooting = booting === true;
    document.body.classList.toggle("account-booting", state.accountBooting);
  }

  function setAccountGateRequired(required) {
    state.accountGateRequired = required === true;
    if (state.accountGateRequired && state.accountDialogMode !== "reset") {
      state.accountDialogMode = "signin";
    }
    document.body.classList.toggle("account-gate", state.accountGateRequired);
    el.closeAccountDialogButton.hidden = state.accountGateRequired;
    el.cancelAccountDialogButton.hidden = state.accountGateRequired;
    updateAccountDialogMode();
    updateConnectButtonAvailability();
  }

  function openPasswordResetDialogIfRequested() {
    if (!state.passwordResetToken || !el.accountDialog) {
      return;
    }

    state.accountDialogMode = "reset";
    openAccountDialog({ mode: "reset", required: true });
  }

  function openAccountDialog(options = {}) {
    state.accountDialogMode = options.mode === "reset"
      ? "reset"
      : (options.required === true
        ? "signin"
        : (options.mode === "profile" ? "profile" : "settings"));
    if (state.accountDialogMode === "profile") {
      ensureAccountSettingsPanel("profile");
    } else if (state.accountDialogMode === "settings") {
      ensureAccountSettingsPanel(state.accountSettingsPanel === "profile" ? "preferences" : state.accountSettingsPanel);
    }
    if (options.required === true) {
      setAccountGateRequired(true);
    } else {
      setAccountGateRequired(state.accountGateRequired);
    }
    syncAccountDialogFromControls();
    renderSettingsPanels();
    const mode = effectiveAccountDialogMode();
    el.dialogAccountStatus.textContent = mode === "reset"
      ? t("account.reset_ready", "Enter your email and a new password.")
      : mode === "signin"
      ? t("account.start_required", "Sign in or create an account before Teletyptel opens.")
      : (mode === "profile"
        ? accountDialogStatusText("account.profile_ready", "Edit your profile and save it.")
        : accountDialogStatusText("account.settings_ready", "Edit app, media and server settings."));
    el.accountDialog.hidden = false;
    document.body.classList.add("modal-open");
    if (mode === "signin") {
      window.setTimeout(() => renderGoogleSdkLoginButton(), 0);
    }
    window.setTimeout(() => {
      accountDialogFocusTarget(mode).focus();
    }, 0);
  }

  function effectiveAccountDialogMode() {
    if (state.accountDialogMode === "reset") {
      return "reset";
    }

    return state.accountGateRequired ? "signin" : (state.accountDialogMode === "profile" ? "profile" : "settings");
  }

  function updateAccountDialogMode() {
    const mode = effectiveAccountDialogMode();
    const startMode = mode === "signin";
    const resetMode = mode === "reset";
    const profileMode = mode === "profile";
    const settingsMode = mode === "settings";
    el.accountDialog.classList.toggle("account-start-dialog", startMode || resetMode);
    el.accountDialog.classList.toggle("account-reset-dialog", resetMode);
    el.accountDialog.classList.toggle("profile-dialog", profileMode);
    el.accountDialog.classList.toggle("settings-dialog", settingsMode);
    el.accountDialog.classList.toggle("server-settings-visible", settingsMode);
    const loginTwoFactorMode = Boolean(state.pendingLoginTwoFactor);
    el.accountDialog.classList.toggle("account-menu-dialog", !startMode && !resetMode && !loginTwoFactorMode);
    el.accountDialogTitle.textContent = resetMode
      ? t("account.reset_title", "Reset password")
      : loginTwoFactorMode
      ? t("account.login_two_factor_title", "Two-factor check")
      : startMode
      ? t("account.start_title", "Sign in")
      : (profileMode ? t("account.profile_title", "Profile") : t("account.settings_title", "Settings"));
    el.accountDialogSubtitle.textContent = resetMode
      ? t("account.reset_subtitle", "Use the reset link from your e-mail and choose a new password.")
      : loginTwoFactorMode
      ? t("account.login_two_factor_subtitle", "Use the code from your authenticator app.")
      : startMode
      ? t("account.start_subtitle", "Use your XMPP account. New users can create an account.")
      : (profileMode
        ? t("account.profile_subtitle", "Name, phone number and personal details.")
        : t("account.settings_subtitle", "Devices, preferences and server settings."));
    el.dialogRealAccountTitle.textContent = resetMode
      ? t("section.reset_password", "Reset password")
      : startMode
      ? t("section.sign_in", "Sign in")
      : t("section.real_account", "Real account");
    ensureAccountSettingsPanel(profileMode ? state.accountSettingsPanel : (settingsMode ? state.accountSettingsPanel : "profile"));
    el.dialogAdvancedDetails.open = settingsMode;
    el.accountSecuritySection.hidden = startMode || resetMode;
    el.dialogSaveAccountButton.hidden = startMode || resetMode;
    el.dialogConnectButton.hidden = resetMode || (!startMode && !state.developerMode);
    el.dialogResetPasswordButton.hidden = !resetMode;
    el.dialogForgotPasswordButton.hidden = resetMode;
    el.dialogGoogleLoginButton.closest(".social-login-row").hidden = resetMode || !startMode;
    el.dialogCreateAccountButton.hidden = resetMode;
    el.loginTwoFactorSection.hidden = !loginTwoFactorMode;
    el.verifyLoginTwoFactorButton.disabled = !loginTwoFactorMode || el.loginTwoFactorCodeInput.value.replace(/\D+/g, "").length !== 6;
    el.dialogRememberPasswordToggle.closest("label").hidden = resetMode;
    el.dialogPasswordInput.autocomplete = resetMode ? "new-password" : "current-password";
    el.dialogConnectButton.textContent = startMode
      ? t("button.sign_in", "Sign in")
      : t("button.save_connect", "Save and connect");
    el.dialogSaveAccountButton.textContent = profileMode
      ? t("button.save_profile", "Save profile")
      : t("button.save_settings", "Save settings");
    if (!resetMode) {
      el.dialogCreateAccountButton.hidden = loginTwoFactorMode;
      el.dialogCreateAccountButton.textContent = startMode
        ? t("button.sign_up", "New account")
        : t("button.create_account", "Create account");
    }
    if (loginTwoFactorMode) {
      el.dialogSaveAccountButton.hidden = true;
      el.dialogConnectButton.hidden = true;
      el.dialogForgotPasswordButton.hidden = true;
      el.dialogGoogleLoginButton.closest(".social-login-row").hidden = true;
    } else if (startMode && !el.accountDialog.hidden) {
      window.setTimeout(() => renderGoogleSdkLoginButton(), 0);
    }
    el.dialogServerSettingsButton.hidden = profileMode || settingsMode || resetMode;
    renderAccountSettingsMenu();
    updateServerSettingsReadonly();
  }

  function openDialogServerSettings() {
    state.accountDialogMode = "settings";
    setAccountSettingsPanel("server", { focus: false });
    updateAccountDialogMode();
    el.accountDialog.classList.add("server-settings-visible");
    el.dialogAdvancedDetails.open = true;
    updateServerSettingsReadonly();
    const firstServerSetting = serverSettingsControls().find((control) => !control.disabled) || el.dialogAdvancedDetails;
    firstServerSetting.scrollIntoView({ block: "center", behavior: "smooth" });
    window.setTimeout(() => {
      firstServerSetting.focus({ preventScroll: true });
    }, 120);
  }

  function accountDialogPanelsForMode(mode = effectiveAccountDialogMode()) {
    if (mode === "profile") {
      return ["profile", "security"];
    }

    if (mode === "settings") {
      return ["preferences", "app-security", "media", "server", "accessibility"];
    }

    return [];
  }

  function ensureAccountSettingsPanel(preferred = state.accountSettingsPanel) {
    const panels = accountDialogPanelsForMode();
    if (!panels.length) {
      state.accountSettingsPanel = preferred || "profile";
      return;
    }

    state.accountSettingsPanel = panels.includes(preferred) ? preferred : panels[0];
  }

  function setAccountSettingsPanel(panel, options = {}) {
    state.accountSettingsPanel = panel;
    ensureAccountSettingsPanel(panel);
    renderAccountSettingsMenu();
    if (options.focus !== false) {
      window.setTimeout(() => accountDialogFocusTarget(effectiveAccountDialogMode()).focus({ preventScroll: true }), 0);
    }
  }

  function renderAccountSettingsMenu() {
    if (!el.accountSettingsMenu) {
      return;
    }

    const mode = effectiveAccountDialogMode();
    const panels = accountDialogPanelsForMode(mode);
    const menuVisible = panels.length > 0 && !state.pendingLoginTwoFactor;
    el.accountSettingsMenu.hidden = !menuVisible;
    el.accountSettingsMenu.querySelectorAll("[data-account-panel]").forEach((button) => {
      const panel = button.dataset.accountPanel || "";
      button.hidden = !panels.includes(panel);
      button.classList.toggle("selected", panel === state.accountSettingsPanel);
      button.setAttribute("aria-current", panel === state.accountSettingsPanel ? "page" : "false");
    });

    el.accountDialog.querySelectorAll("[data-settings-panel]").forEach((panelEl) => {
      panelEl.classList.toggle("active-settings-panel", panelEl.dataset.settingsPanel === state.accountSettingsPanel);
    });
    el.dialogAdvancedDetails.open = mode === "settings";
  }

  function accountDialogFocusTarget(mode) {
    if (mode === "reset") {
      return el.dialogPasswordInput;
    }

    if (mode === "signin") {
      return el.dialogJidInput;
    }

    const byPanel = {
      profile: el.dialogDisplayNameInput,
      security: el.dialogCurrentPasswordInput,
      preferences: el.rttToggle,
      "app-security": el.settingsLogoutButton,
      media: el.dialogCameraInput || el.dialogMicrophoneInput,
      server: serverSettingsControls().find((control) => !control.disabled) || el.dialogXmppDomainInput,
      accessibility: el.dialogAccessibilityPanel
    };
    return byPanel[state.accountSettingsPanel] || el.dialogDisplayNameInput || el.dialogJidInput;
  }

  function startGoogleLoginFromDialog() {
    startProviderLoginFromDialog("google");
  }

  function startFacebookLoginFromDialog() {
    startProviderLoginFromDialog("facebook");
  }

  function startProviderLoginFromDialog(provider) {
    const name = providerDisplayName(provider);
    updateAccountStatus(t(`account.${provider}_redirecting`, `Opening ${name} sign-in...`));
    const target = new URL(`api/auth/${provider}/start`, location.href);
    location.assign(target.toString());
  }

  function startGoogleLinkFromDialog() {
    startProviderLinkFromDialog("google");
  }

  function startFacebookLinkFromDialog() {
    startProviderLinkFromDialog("facebook");
  }

  function startProviderLinkFromDialog(provider) {
    if (!state.account?.accountId || state.account?.savedInDatabase !== true) {
      const name = providerDisplayName(provider);
      el.dialogAccountStatus.textContent = t(`account.save_before_${provider}_link`, `Save and sign in before linking ${name}.`);
      el.dialogAccountStatus.scrollIntoView({ block: "nearest" });
      return;
    }

    const name = providerDisplayName(provider);
    updateAccountStatus(t(`account.${provider}_link_redirecting`, `Opening ${name} linking...`));
    const target = new URL(`api/auth/${provider}/start`, location.href);
    target.searchParams.set("mode", "link");
    location.assign(target.toString());
  }

  async function unlinkGoogleFromDialog() {
    await unlinkProviderFromDialog("google");
  }

  async function unlinkFacebookFromDialog() {
    await unlinkProviderFromDialog("facebook");
  }

  async function unlinkProviderFromDialog(provider) {
    if (!state.account?.accountId || state.account?.savedInDatabase !== true) {
      return;
    }

    const name = providerDisplayName(provider);
    setAccountDialogBusy(true, t(`account.${provider}_unlinking`, `Unlinking ${name}...`));
    try {
      const payload = await postAccountAction({
        action: "unlink_identity",
        accountId: state.account.accountId,
        provider
      });
      state.account = { ...state.account, ...payload.account, savedInDatabase: true };
      updateLinkedIdentityStatus();
      const message = t(`account.${provider}_unlinked`, `${name} has been unlinked.`);
      updateAccountStatus(message);
      el.dialogAccountStatus.textContent = message;
    } catch (error) {
      showAccountDialogError(error);
    } finally {
      setAccountDialogBusy(false);
    }
  }

  function providerDisplayName(provider) {
    return provider === "facebook" ? "Facebook" : provider === "google" ? "Google" : provider;
  }

  async function loadConversationHistory() {
    if (!state.account?.accountId) {
      return false;
    }

    try {
      const result = await fetchHistoryPayload({ type: "calls", limit: "200" }, "calls", "conversation-history");
      if (!result) {
        return false;
      }

      const { payload } = result;
      if (!payload.ok || !Array.isArray(payload.calls)) {
        return false;
      }

      state.conversationHistory.calls = payload.calls.map(normalizeConversationHistoryCall);
      state.conversationHistory.loaded = true;
      refreshOpenTabPanel();
      appendDebug("conversation-history", `Loaded ${payload.calls.length} calls from ${result.accountId}`);
      return true;
    } catch (error) {
      appendDebug("conversation-history-error", error.message);
      return false;
    }
  }

  function normalizeConversationHistoryCall(item) {
    return {
      callId: String(item.callId || "call-" + createShortId()),
      conversationPeer: String(item.conversationPeer || ""),
      conversationName: String(item.conversationName || ""),
      conversationKind: item.conversationKind === "group" ? "group" : "contact",
      direction: item.direction === "self" ? "self" : "peer",
      callType: ["audio", "video", "total"].includes(item.callType) ? item.callType : "total",
      status: ["started", "ended", "missed", "rejected", "failed"].includes(item.status) ? item.status : "ended",
      startedAt: item.startedAt || new Date().toISOString(),
      endedAt: item.endedAt || null,
      durationSeconds: Math.max(0, Number(item.durationSeconds || 0)),
      transcript: Array.isArray(item.transcript) ? item.transcript : [],
      media: Array.isArray(item.media) ? item.media : [],
      note: String(item.note || "")
    };
  }

  function serverSettingsControls() {
    return [
      el.dialogXmppDomainInput,
      el.dialogXmppHostInput,
      el.dialogXmppPortInput,
      el.dialogXmppTlsModeInput,
      el.dialogRelayUrlInput,
      el.dialogXmppUrlInput,
      el.dialogProviderInput
    ].filter(Boolean);
  }

  function serverSettingsLocked() {
    return state.relaySocket?.readyState === WebSocket.CONNECTING
      || state.relaySocket?.readyState === WebSocket.OPEN
      || state.xmppSocket?.readyState === WebSocket.CONNECTING
      || state.xmppSocket?.readyState === WebSocket.OPEN;
  }

  function updateServerSettingsReadonly() {
    const locked = serverSettingsLocked();
    for (const control of serverSettingsControls()) {
      if (control.tagName === "SELECT") {
        control.disabled = locked;
      } else {
        control.readOnly = locked;
      }
      control.classList.toggle("server-setting-readonly", locked);
      control.setAttribute("aria-readonly", locked ? "true" : "false");
    }

    if (el.dialogServerSettingsLockNote) {
      el.dialogServerSettingsLockNote.hidden = !locked;
    }
  }

  function closeAccountDialog() {
    if (state.accountGateRequired) {
      return;
    }

    el.accountDialog.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function closeAccountDialogOnBackdrop(event) {
    if (event.target === el.accountDialog) {
      closeAccountDialog();
    }
  }

  function closeAccountDialogOnEscape(event) {
    if (event.key === "Escape" && !el.accountDialog.hidden) {
      closeAccountDialog();
    }
  }

  function syncAccountDialogFromControls() {
    if (!el.accountDialog) {
      return;
    }

    const hasStoredAccount = Boolean(state.account?.savedInSession || state.account?.savedInDatabase);
    el.dialogSessionProfileInput.value = el.sessionProfileInput.value;
    el.dialogDisplayNameInput.value = state.accountGateRequired ? "" : el.displayNameInput.value;
    el.dialogAvatarColorInput.value = currentAvatarColor();
    updateAccountAvatarPreview();
    el.dialogJidInput.value = state.accountGateRequired && !hasStoredAccount
      ? ""
      : stripGeneratedResourceSuffix(el.jidInput.value.trim());
    el.dialogPasswordInput.value = el.passwordInput.value;
    el.dialogRememberPasswordToggle.checked = el.rememberPasswordToggle.checked || state.accountGateRequired;
    el.dialogCurrentPasswordInput.value = "";
    el.dialogNewPasswordInput.value = "";
    el.dialogRepeatPasswordInput.value = "";
    el.dialogRememberNewPasswordToggle.checked = el.dialogRememberPasswordToggle.checked;
    updatePasswordRulesPanel();
    updateLinkedIdentityStatus();
    el.dialogXmppDomainInput.value = state.account?.xmppDomain || domainFromJid(el.dialogJidInput.value);
    el.dialogXmppHostInput.value = state.account?.xmppHost || el.dialogXmppDomainInput.value || "localhost";
    el.dialogXmppPortInput.value = String(state.account?.xmppPort || 5222);
    el.dialogXmppTlsModeInput.value = "websocket";
    el.dialogRelayUrlInput.value = el.relayUrlInput.value;
    el.dialogXmppUrlInput.value = el.xmppUrlInput.value;
    el.dialogProviderInput.value = el.providerInput.value;
    syncLanguageInputs(el.languageInput.value);
    el.dialogPeerInput.value = el.peerInput.value;
    el.dialogPhoneInput.value = el.phoneInput.value;
    el.dialogBirthDateInput.value = normalizeBirthDate(state.account?.birthDate ?? "");
    el.dialogChatBackgroundInput.value = state.chatBackground;
    el.dialogMapProviderInput.value = normalizeMapProvider(state.location.settings.mapProvider);
    updateTwoFactorStatus();
    renderMediaDeviceSelects();
  }

  function showLoginTwoFactorChallenge(payload, options = {}) {
    state.pendingLoginTwoFactor = {
      accountId: String(payload.accountId || ""),
      method: payload.method || "authenticator",
      profile: options.profile || currentAccountProfile(),
      connectAfterSave: options.connectAfterSave !== false,
      oauth: options.oauth === true
    };
    state.accountDialogMode = "signin";
    setAccountGateRequired(true);
    el.loginTwoFactorCodeInput.value = "";
    syncAccountDialogFromControls();
    updateAccountDialogMode();
    el.dialogAccountStatus.textContent = t("account.login_two_factor_prompt", "Enter the 6-digit authenticator code to finish signing in.");
    el.accountDialog.hidden = false;
    document.body.classList.add("modal-open");
    window.setTimeout(() => el.loginTwoFactorCodeInput.focus(), 0);
  }

  async function verifyLoginTwoFactorFromDialog() {
    const pending = state.pendingLoginTwoFactor;
    const code = el.loginTwoFactorCodeInput.value.replace(/\D+/g, "");
    if (!pending || code.length !== 6) {
      el.loginTwoFactorCodeInput.focus();
      el.dialogAccountStatus.textContent = t("account.two_factor_code_required", "Enter the 6-digit code first.");
      return;
    }

    setAccountDialogBusy(true, t("account.login_two_factor_verifying", "Checking 2FA code..."));
    try {
      const payload = await postAccountAction({
        action: "verify_login_two_factor",
        accountId: pending.accountId,
        code
      });
      if (!payload.account) {
        throw new Error(t("account.login_two_factor_failed", "2FA login failed."));
      }

      await applyDatabaseAccount(payload.account, pending.profile || currentAccountProfile());
      state.pendingLoginTwoFactor = null;
      setAccountGateRequired(false);
      setAccountReady(true);
      recordSessionActivity({ force: true });
      closeAccountDialog();
      if (pending.oauth) {
        cleanOauthUrl();
      }
      if (pending.connectAfterSave) {
        autoConnectIfReady();
      }
    } catch (error) {
      showAccountDialogError(error);
    } finally {
      setAccountDialogBusy(false);
      updateAccountDialogMode();
    }
  }

  function updateTwoFactorStatus(message = "") {
    if (!el.twoFactorStatus) {
      return;
    }

    const enabled = state.account?.twoFactorEnabled === true;
    const method = state.account?.twoFactorMethod || "email_code";
    const hasQr = !enabled && state.security.twoFactorOtpauthUri !== "";
    el.twoFactorStatus.textContent = message || (enabled
      ? t("account.two_factor_on", "2FA is on.")
      : t("account.two_factor_off", "2FA is off."));
    el.requestTwoFactorButton.disabled = enabled;
    el.confirmTwoFactorButton.disabled = enabled || (!hasQr && state.security.twoFactorVerificationId <= 0);
    el.twoFactorCodeInput.disabled = enabled;
    el.twoFactorCodeInput.placeholder = enabled
      ? method
      : t("account.two_factor_code_placeholder", "6 digits");
    el.twoFactorQrPanel.hidden = !hasQr;
    el.twoFactorSecretText.textContent = hasQr ? state.security.twoFactorManualSecret : "";
  }

  function updateLinkedIdentityStatus() {
    updateProviderLinkStatus("google", el.googleLinkStatus, el.linkGoogleButton, el.unlinkGoogleButton);
    updateProviderLinkStatus("facebook", el.facebookLinkStatus, el.linkFacebookButton, el.unlinkFacebookButton);
  }

  function updateProviderLinkStatus(provider, statusElement, linkButton, unlinkButton) {
    if (!statusElement || !linkButton || !unlinkButton) {
      return;
    }

    const name = providerDisplayName(provider);
    const identity = state.account?.linkedIdentities?.[provider] || null;
    const linked = identity?.linked === true;
    const email = String(identity?.email || "").trim();
    statusElement.textContent = linked
      ? (email
        ? t(`account.${provider}_linked_email`, `${name} linked: {email}`).replace("{email}", email)
        : t(`account.${provider}_linked`, `${name} is linked.`))
      : t(`account.${provider}_not_linked`, `${name} is not linked.`);
    linkButton.hidden = linked;
    unlinkButton.hidden = !linked;
    linkButton.disabled = state.account?.savedInDatabase !== true;
    unlinkButton.disabled = state.account?.savedInDatabase !== true;
  }

  function renderTwoFactorQrCode(uri) {
    state.security.twoFactorOtpauthUri = uri || "";
    el.twoFactorQrCode.textContent = "";
    if (!uri) {
      updateTwoFactorStatus();
      return;
    }

    if (typeof qrcode !== "function") {
      el.twoFactorQrCode.textContent = t("account.two_factor_qr_unavailable", "QR generator unavailable.");
      updateTwoFactorStatus();
      return;
    }

    try {
      const qr = qrcode(0, "M");
      qr.addData(uri);
      qr.make();
      el.twoFactorQrCode.innerHTML = qr.createSvgTag(4, 0);
    } catch (error) {
      appendDebug("two-factor-qr-error", error.message || String(error));
      el.twoFactorQrCode.textContent = t("account.two_factor_qr_unavailable", "QR generator unavailable.");
    }
    updateTwoFactorStatus();
  }

  function applyAccountDialogToControls(options = {}) {
    const jid = normalizeJidInput(stripGeneratedResourceSuffix(el.dialogJidInput.value.trim()));
    const displayName = el.dialogDisplayNameInput.value.trim();

    if (!isLikelyJid(jid)) {
      throw accountDialogError("dialogJidInput", t("account.invalid_jid", "Enter a valid email address, for example edward@localhost."));
    }

    if (options.requirePassword === true && !el.dialogPasswordInput.value) {
      throw accountDialogError("dialogPasswordInput", t("account.password_required", "Enter a password for a real server account."));
    }

    const xmppPort = normalizeXmppPort(el.dialogXmppPortInput.value);
    let xmppDomain = el.dialogXmppDomainInput.value.trim() || domainFromJid(jid);
    let xmppHost = el.dialogXmppHostInput.value.trim() || xmppDomain;
    const xmppWebSocket = normalizeLocalXmppWebSocketUrlForCurrentHost(el.dialogXmppUrlInput.value.trim() || el.xmppUrlInput.value);
    if (isLocalAccountDomain(xmppHost) || isLocalXmppWebSocketUrl(xmppWebSocket)) {
      xmppDomain = "localhost";
      xmppHost = "localhost";
      el.dialogXmppDomainInput.value = xmppDomain;
      el.dialogXmppHostInput.value = xmppHost;
    }

    el.sessionProfileInput.value = sanitizeSessionProfile(el.dialogSessionProfileInput.value);
    el.displayNameInput.value = displayName || jid.split("@")[0] || "Teletyptel";
    el.jidInput.value = jid;
    el.dialogJidInput.value = jid;
    el.passwordInput.value = el.dialogPasswordInput.value;
    el.rememberPasswordToggle.checked = el.dialogRememberPasswordToggle.checked;
    el.relayUrlInput.value = "";
    el.xmppUrlInput.value = xmppWebSocket;
    el.providerInput.value = el.dialogProviderInput.value.trim() || "example-provider";
    syncLanguageInputs(el.dialogLanguageInput.value);
    el.peerInput.value = el.dialogPeerInput.value.trim() || el.peerInput.value;
    el.phoneInput.value = el.dialogPhoneInput.value.trim();
    const birthDate = normalizeBirthDate(el.dialogBirthDateInput.value);
    applyChatBackground(el.dialogChatBackgroundInput.value);
    state.location.settings.mapProvider = normalizeMapProvider(el.dialogMapProviderInput.value);
    saveLocationSettings();
    saveMediaSettingsFromControls(false, "dialog");

    if (!state.account) {
      state.account = currentAccountProfile();
    }

    state.account = {
      ...state.account,
      accountId: state.accountGateRequired ? accountIdFromJid(jid) : state.account.accountId || accountIdFromJid(jid),
      displayName: el.displayNameInput.value,
      jid,
      liveRttEnabled: el.rttToggle.checked,
      showSmileys: el.smileyToggle.checked,
      sessionTimeoutEnabled: el.sessionTimeoutToggle.checked,
      birthDate,
      xmppDomain,
      xmppHost,
      xmppPort,
      xmppTlsMode: normalizeTlsMode(el.dialogXmppTlsModeInput.value)
    };

    handleAccountIdentityChanged();
    updateAccountPasswordStatus();
  }

  async function createAccountFromDialog() {
    setAccountDialogBusy(true, t("account.creating", "Creating account profile..."));
    try {
      applyAccountDialogToControls({ requirePassword: true });
      const bareJid = stripGeneratedResourceSuffix(el.jidInput.value.trim());
      const xmppDomain = state.account?.xmppDomain || el.dialogXmppDomainInput.value.trim() || domainFromJid(bareJid);
      const isLocalAccount = isLocalAccountDomain(xmppDomain);
      state.account = {
        ...state.account,
        accountId: accountIdFromJid(bareJid),
        jid: bareJid
      };
      await saveAccountProfile(isLocalAccount ? "create" : "save");
      el.dialogAccountStatus.textContent = isLocalAccount
        ? accountDialogStatusText("account.created_database", "Account profile created and saved on the server.")
        : accountDialogStatusText("account.external_account_saved", "External account profile saved. Connecting to the XMPP server...");
      syncAccountDialogFromControls();
      setAccountGateRequired(false);
      closeAccountDialog();
      setAccountReady(true);
      autoConnectIfReady();
    } catch (error) {
      showAccountDialogError(error);
    } finally {
      setAccountDialogBusy(false);
    }
  }

  async function requestPasswordResetFromDialog() {
    setAccountDialogBusy(true, t("account.reset_requesting", "Sending password reset e-mail..."));
    try {
      const jid = normalizeJidInput(stripGeneratedResourceSuffix(el.dialogJidInput.value.trim()));
      if (!isLikelyJid(jid)) {
        throw accountDialogError("dialogJidInput", t("account.invalid_jid", "Enter a valid email address, for example edward@localhost."));
      }

      const response = await fetch(accountApiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_password_reset", jid })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(accountApiErrorText(payload.error || `account API returned ${response.status}`, payload));
      }

      el.dialogAccountStatus.textContent = payload.mailSent
        ? t("account.reset_mail_sent", "Password reset e-mail sent.")
        : t("account.reset_mail_logged", "Password reset link created. Check mail settings or the local mail log.");
      appendDebug("account-reset", `Password reset requested for ${jid}`);
    } catch (error) {
      showAccountDialogError(error);
    } finally {
      setAccountDialogBusy(false);
    }
  }

  async function resetPasswordFromDialog() {
    setAccountDialogBusy(true, t("account.resetting_password", "Resetting password..."));
    try {
      const jid = normalizeJidInput(stripGeneratedResourceSuffix(el.dialogJidInput.value.trim()));
      const password = el.dialogPasswordInput.value;
      if (!state.passwordResetToken) {
        throw new Error(t("account.reset_token_missing", "The password reset link is missing or incomplete."));
      }

      if (!isLikelyJid(jid)) {
        throw accountDialogError("dialogJidInput", t("account.invalid_jid", "Enter a valid email address, for example edward@localhost."));
      }

      if (!password) {
        throw accountDialogError("dialogPasswordInput", t("account.password_required", "Enter a password for a real server account."));
      }

      const response = await fetch(accountApiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_password", token: state.passwordResetToken, jid, password })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(accountApiErrorText(payload.error || `account API returned ${response.status}`, payload));
      }

      el.passwordInput.value = password;
      if (payload.account) {
        state.account = { ...state.account, ...payload.account, password, savedInDatabase: true };
        applyAccountProfile(state.account);
        el.passwordInput.value = password;
        state.account.password = password;
      } else {
        state.account = { ...state.account, jid, password };
      }

      state.passwordResetToken = "";
      history.replaceState(null, "", location.pathname + location.hash);
      setAccountGateRequired(false);
      closeAccountDialog();
      setAccountReady(true);
      autoConnectIfReady();
      appendDebug("account-reset", `Password reset completed for ${jid}`);
    } catch (error) {
      showAccountDialogError(error);
    } finally {
      setAccountDialogBusy(false);
    }
  }

  async function changePasswordFromSecuritySection() {
    const currentPassword = el.dialogCurrentPasswordInput.value;
    const password = el.dialogNewPasswordInput.value;
    const repeatedPassword = el.dialogRepeatPasswordInput.value;
    const validation = passwordValidationState(currentPassword, password, repeatedPassword);
    if (!currentPassword) {
      showAccountDialogError(accountDialogError("dialogCurrentPasswordInput", t("account.current_password_required", "Enter your current password first.")));
      return;
    }

    if (!password) {
      showAccountDialogError(accountDialogError("dialogNewPasswordInput", t("account.password_required", "Enter a password for a real server account.")));
      return;
    }

    if (password !== repeatedPassword) {
      showAccountDialogError(accountDialogError("dialogRepeatPasswordInput", t("account.password_repeat_mismatch", "The repeated password does not match.")));
      return;
    }

    if (!validation.valid) {
      showAccountDialogError(accountDialogError("dialogNewPasswordInput", t("account.password_rules_incomplete", "The new password does not meet all security rules.")));
      updatePasswordRulesPanel();
      return;
    }

    setAccountDialogBusy(true, t("account.changing_password", "Changing password..."));
    try {
      el.dialogPasswordInput.value = password;
      el.passwordInput.value = password;
      el.dialogRememberPasswordToggle.checked = el.dialogRememberNewPasswordToggle.checked;
      el.rememberPasswordToggle.checked = el.dialogRememberNewPasswordToggle.checked;
      if (state.account) {
        state.account.password = password;
        state.account.rememberPassword = el.dialogRememberNewPasswordToggle.checked;
      }

      applyAccountDialogToControls({ requirePassword: true });
      const profile = currentAccountProfile();
      const account = await saveDatabaseAccount({ ...profile, currentPassword }, "save");
      state.account = { ...state.account, ...profile, ...account, password, savedInDatabase: true };
      storeServerAccountSession(state.account, profile.rememberPassword);
      updateAccountAvatarPreview();
      updateRelayConversationMeta();
      reconcileContactsForCurrentAccount();
      updateAccountStatus(t("account.password_changed", "Password changed"));
      setAccountReady(true);
      el.dialogCurrentPasswordInput.value = "";
      el.dialogNewPasswordInput.value = "";
      el.dialogRepeatPasswordInput.value = "";
      updatePasswordRulesPanel();
      el.dialogAccountStatus.textContent = accountDialogStatusText("account.password_changed", "Password changed");
      syncAccountDialogFromControls();
    } catch (error) {
      showAccountDialogError(error);
    } finally {
      setAccountDialogBusy(false);
    }
  }

  function passwordValidationState(currentPassword = el.dialogCurrentPasswordInput.value, password = el.dialogNewPasswordInput.value, repeatedPassword = el.dialogRepeatPasswordInput.value) {
    const rules = [
      { id: "length", ok: password.length >= 10, text: t("password.rule_length", "At least 10 characters") },
      { id: "lower", ok: /[a-z]/.test(password), text: t("password.rule_lower", "At least one lowercase letter") },
      { id: "upper", ok: /[A-Z]/.test(password), text: t("password.rule_upper", "At least one uppercase letter") },
      { id: "number", ok: /\d/.test(password), text: t("password.rule_number", "At least one number") },
      { id: "symbol", ok: /[^A-Za-z0-9]/.test(password), text: t("password.rule_symbol", "At least one special character") },
      { id: "repeat", ok: password !== "" && password === repeatedPassword, text: t("password.rule_repeat", "Repeated password matches") },
      { id: "different", ok: currentPassword !== "" && password !== "" && currentPassword !== password, text: t("password.rule_different", "Different from current password") }
    ];
    return {
      rules,
      valid: rules.every((rule) => rule.ok)
    };
  }

  function updatePasswordRulesPanel() {
    if (!el.passwordRulesPanel || !el.changePasswordButton) {
      return;
    }

    const validation = passwordValidationState();
    el.passwordRulesPanel.replaceChildren(...validation.rules.map((rule) => {
      const item = document.createElement("div");
      item.className = `password-rule ${rule.ok ? "valid" : "invalid"}`;
      const marker = document.createElement("span");
      marker.className = "password-rule-marker";
      marker.textContent = rule.ok ? "✓" : "";
      marker.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = rule.text;
      item.append(marker, label);
      return item;
    }));
    el.changePasswordButton.disabled = !validation.valid;
  }

  async function requestTwoFactorSetupFromDialog() {
    if (!state.account?.accountId || state.account?.savedInDatabase !== true) {
      el.dialogAccountStatus.textContent = t("account.save_before_2fa", "Save and sign in before enabling 2FA.");
      el.dialogAccountStatus.scrollIntoView({ block: "nearest" });
      return;
    }

    setAccountDialogBusy(true, t("account.two_factor_requesting", "Preparing authenticator QR code..."));
    try {
      const payload = await postAccountAction({
        action: "request_two_factor_setup",
        accountId: state.account.accountId,
        method: "authenticator"
      });
      state.security.twoFactorVerificationId = Number(payload.verificationId || 0);
      state.security.twoFactorMethod = payload.method || "authenticator";
      state.security.twoFactorManualSecret = payload.manualSecret || "";
      el.twoFactorCodeInput.value = "";
      renderTwoFactorQrCode(payload.otpauthUri || "");
      el.twoFactorCodeInput.focus();
      updateTwoFactorStatus(t("account.two_factor_qr_ready", "Scan the QR code and enter the 6 digits from your phone."));
    } catch (error) {
      showAccountDialogError(error);
    } finally {
      setAccountDialogBusy(false);
    }
  }

  async function confirmTwoFactorSetupFromDialog() {
    const code = el.twoFactorCodeInput.value.replace(/\D+/g, "");
    if (state.security.twoFactorVerificationId <= 0 || code.length !== 6) {
      el.twoFactorCodeInput.focus();
      el.dialogAccountStatus.textContent = t("account.two_factor_code_required", "Enter the 6-digit code first.");
      return;
    }

    setAccountDialogBusy(true, t("account.two_factor_enabling", "Enabling 2FA..."));
    try {
      const payload = await postAccountAction({
        action: "confirm_two_factor_setup",
        accountId: state.account.accountId,
        method: "authenticator",
        verificationId: state.security.twoFactorVerificationId,
        code
      });
      state.security.twoFactorVerificationId = 0;
      state.security.twoFactorOtpauthUri = "";
      state.security.twoFactorManualSecret = "";
      state.account = {
        ...state.account,
        twoFactorEnabled: payload.twoFactorEnabled === true,
        twoFactorMethod: payload.method || "authenticator"
      };
      el.twoFactorCodeInput.value = "";
      renderTwoFactorQrCode("");
      updateTwoFactorStatus(t("account.two_factor_enabled", "2FA is now enabled."));
    } catch (error) {
      showAccountDialogError(error);
    } finally {
      setAccountDialogBusy(false);
    }
  }

  async function postAccountAction(body) {
    const response = await fetch(accountApiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(accountApiErrorText(payload.error || `account API returned ${response.status}`, payload));
    }

    return payload;
  }

  async function saveAccountDialogProfile(connectAfterSave) {
    setAccountDialogBusy(true, connectAfterSave
      ? t("account.saving_connecting", "Saving account and connecting...")
      : t("account.saving", "Saving account settings..."));
    try {
      const wasGateRequired = state.accountGateRequired;
      applyAccountDialogToControls({ requirePassword: wasGateRequired });
      const result = await saveAccountProfile(wasGateRequired ? "login" : "save");
      if (result?.twoFactorRequired) {
        showLoginTwoFactorChallenge(result, { profile: result.profile, connectAfterSave: connectAfterSave || wasGateRequired });
        return;
      }
      await loadLanguage(el.languageInput.value);
      el.dialogAccountStatus.textContent = accountDialogStatusText("account.database_saved", "Server account saved");
      syncAccountDialogFromControls();
      setAccountGateRequired(false);
      setAccountReady(true);
      if (connectAfterSave || wasGateRequired) {
        closeAccountDialog();
      }

      if (connectAfterSave || wasGateRequired) {
        autoConnectIfReady();
      }
    } catch (error) {
      showAccountDialogError(error);
    } finally {
      setAccountDialogBusy(false);
    }
  }

  function setAccountDialogBusy(busy, text = "") {
    el.dialogCreateAccountButton.disabled = busy;
    el.dialogSaveAccountButton.disabled = busy;
    el.dialogConnectButton.disabled = busy;
    el.verifyLoginTwoFactorButton.disabled = busy || !state.pendingLoginTwoFactor || el.loginTwoFactorCodeInput.value.replace(/\D+/g, "").length !== 6;
    el.changePasswordButton.disabled = busy || !passwordValidationState().valid;
    el.linkGoogleButton.disabled = busy || state.account?.savedInDatabase !== true;
    el.unlinkGoogleButton.disabled = busy || state.account?.savedInDatabase !== true;
    el.linkFacebookButton.disabled = busy || state.account?.savedInDatabase !== true;
    el.unlinkFacebookButton.disabled = busy || state.account?.savedInDatabase !== true;
    el.requestTwoFactorButton.disabled = busy || state.account?.twoFactorEnabled === true;
    const hasAuthenticatorQr = state.account?.twoFactorEnabled !== true && state.security.twoFactorOtpauthUri !== "";
    el.confirmTwoFactorButton.disabled = busy || state.account?.twoFactorEnabled === true || (!hasAuthenticatorQr && state.security.twoFactorVerificationId <= 0);
    if (text) {
      el.dialogAccountStatus.textContent = text;
      el.dialogAccountStatus.scrollIntoView({ block: "nearest" });
    }
  }

  function accountDialogError(fieldId, message) {
    const error = new Error(message);
    error.fieldId = fieldId;
    return error;
  }

  function showAccountDialogError(error) {
    el.dialogAccountStatus.textContent = error.message;
    el.dialogAccountStatus.scrollIntoView({ block: "nearest" });
    const field = error.fieldId ? byId(error.fieldId) : el.dialogJidInput;
    field.focus();
  }

  function accountDialogStatusText(key, fallback) {
    if (state.accountGateRequired) {
      return t(key, fallback);
    }

    const password = el.dialogPasswordInput.value
      ? (el.dialogRememberPasswordToggle.checked ? t("account.password_saved", "account saved in database") : t("account.password_session", "password only this session"))
      : t("account.no_password", "no password");
    return `${t(key, fallback)} - ${el.dialogJidInput.value || t("account.no_jid", "no email")} - ${password}`;
  }

  function accountIdFromJid(jid) {
    const bare = normalizeJidInput(stripGeneratedResourceSuffix(jid)).toLowerCase();
    const normalized = bare.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized ? `xmpp-${normalized}` : `local-${state.sessionProfile}`;
  }

  function isLikelyJid(jid) {
    const bare = normalizeJidInput(stripGeneratedResourceSuffix(jid));
    return /^[^@\s]+@[^@\s]+$/u.test(bare);
  }

  function reconcileContactsForCurrentAccount() {
    const activeId = state.activeConversationId;
    state.conversations = state.conversations.filter((conversation) => !isOwnContact(conversation));
    ensureDefaultCounterpartContact();

    if (activeId && !state.conversations.some((conversation) => conversation.id === activeId)) {
      state.activeConversationId = null;
      state.previousText = "";
      el.messageInput.value = "";
      syncComposerActionButtons();
    }

    renderConversations();
    renderActiveConversation();
  }

  function ensureDefaultCounterpartContact() {
    const counterpart = defaultCounterpartForCurrentAccount();
    if (!counterpart || isOwnPeer(counterpart.peer)) {
      return;
    }

    const existing = state.conversations.find((conversation) => addressMatches(conversation.peer, counterpart.peer));
    if (existing) {
      existing.name = counterpart.name;
      existing.nameKey = counterpart.nameKey;
      existing.kind = "contact";
      existing.avatarColor = counterpart.avatarColor || existing.avatarColor;
      existing.avatarDataUrl = counterpart.avatarDataUrl || existing.avatarDataUrl;
      return;
    }

    const conversation = {
      ...counterpart,
      kind: "contact",
      presence: "offline",
      meta: "Offline",
      messages: [],
      unreadCount: 0,
      remoteText: "",
      remoteFrom: "",
      remoteDraftUpdatedAt: null
    };
    const firstGroupIndex = state.conversations.findIndex((item) => item.kind === "group");
    if (firstGroupIndex === -1) {
      state.conversations.push(conversation);
      return;
    }

    state.conversations.splice(firstGroupIndex, 0, conversation);
  }

  function defaultCounterpartForCurrentAccount() {
    const self = currentBareJid();
    if (!self) {
      return null;
    }

    const local = self.split("@")[0];
    if (local === "tester") {
      return {
        id: "edward",
        name: "Edward",
        nameKey: "conversation.edward",
        peer: "edward@localhost",
        avatarColor: "#0f766e"
      };
    }

    if (local === "edward") {
      return {
        id: "tester",
        name: "Tester",
        nameKey: "conversation.tester",
        peer: "tester@localhost",
        avatarColor: "#2563eb"
      };
    }

    return null;
  }

  function applySessionAccountDefaults(defaultAccount, savedAccount) {
    if (savedAccount || state.sessionProfile === "default") {
      return defaultAccount;
    }

    const localPart = sessionProfileToJidLocalPart(state.sessionProfile);
    return {
      ...defaultAccount,
      accountId: `local-${state.sessionProfile}`,
      displayName: sessionProfileToDisplayName(state.sessionProfile),
      jid: `${localPart}@localhost/web`,
      peer: defaultAccount.peer && !addressMatches(defaultAccount.peer, "relay@localhost")
        ? defaultAccount.peer
        : "tester@localhost"
    };
  }

  function sessionProfileToJidLocalPart(profile) {
    const localPart = sanitizeSessionProfile(profile).replace(/_/g, "-");
    return localPart === "default" ? "edward" : localPart;
  }

  function sessionProfileToDisplayName(profile) {
    const normalized = sanitizeSessionProfile(profile);
    if (normalized === "default") {
      return "Edward";
    }

    return normalized
      .split(/[-_]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Teletyptel";
  }

  function mergeAccountProfiles(defaultAccount, savedAccount) {
    if (!savedAccount) {
      return defaultAccount;
    }

    return {
      ...defaultAccount,
      ...savedAccount,
      providerId: savedAccount.providerId || defaultAccount.providerId,
      savedInSession: true
    };
  }

  function loadSavedAccountProfile(profile = state.sessionProfile) {
    const key = accountStorageKeyFor(profile);
    const saved = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!saved) {
      return null;
    }

    try {
      const parsed = JSON.parse(saved);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
      return null;
    }
  }

  function currentAccountProfile() {
    return {
      accountId: state.account?.accountId ?? `local-${state.sessionProfile}`,
      sessionProfile: state.sessionProfile,
      jid: stripGeneratedResourceSuffix(el.jidInput.value.trim()),
      displayName: el.displayNameInput.value.trim() || "Me",
      avatarDataUrl: currentAvatarDataUrl(),
      avatarColor: currentAvatarColor(),
      rememberPassword: el.rememberPasswordToggle.checked,
      liveRttEnabled: el.rttToggle.checked,
      showSmileys: el.smileyToggle.checked,
      sessionTimeoutEnabled: el.sessionTimeoutToggle.checked,
      password: el.passwordInput.value,
      phoneNumber: el.phoneInput.value.trim(),
      birthDate: normalizeBirthDate(state.account?.birthDate ?? el.dialogBirthDateInput?.value ?? ""),
      providerId: el.providerInput.value.trim() || state.account?.providerId || "example-provider",
      accessibilityProfileId: state.account?.accessibilityProfileId ?? "default-live-text",
      preferredLanguage: el.languageInput.value,
      relayWebSocket: "",
      xmppWebSocket: normalizeLocalXmppWebSocketUrlForCurrentHost(el.xmppUrlInput.value.trim()),
      xmppHost: state.account?.xmppHost || domainFromJid(el.jidInput.value.trim()),
      xmppPort: state.account?.xmppPort || 5222,
      xmppDomain: state.account?.xmppDomain || domainFromJid(el.jidInput.value.trim()),
      xmppTlsMode: "websocket",
      peer: el.peerInput.value.trim()
    };
  }

  function normalizeBirthDate(value) {
    const text = String(value ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
  }

  async function saveAccountProfile(action = "save") {
    const profile = currentAccountProfile();
    const account = await saveDatabaseAccount(profile, action);
    if (account?.twoFactorRequired) {
      return { ...account, profile };
    }

    await applyDatabaseAccount(account, profile);
    return { profile: state.account, databaseSaved: true };
  }

  async function applyDatabaseAccount(account, profile = currentAccountProfile()) {
    state.account = { ...state.account, ...profile, ...account, savedInDatabase: true };
    storeServerAccountSession(state.account, profile.rememberPassword);
    el.jidInput.value = createUniqueJid(state.account.jid);
    updateAccountAvatarPreview();
    updateRelayConversationMeta();
    reconcileContactsForCurrentAccount();
    updateAccountStatus(t("account.database_saved", "Server account saved"));
    appendDebug("account", `Server saved ${el.jidInput.value}`);
    setAccountReady(true);
    recordSessionActivity({ force: true });
    await loadMessageHistory();
    await loadConversationHistory();
  }

  async function saveDatabaseAccount(profile, action = "save") {
    const response = await fetch(accountApiPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ...profile, action })
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(accountApiErrorText(payload.error || `account API returned ${response.status}`, payload));
    }

    if (payload.twoFactorRequired) {
      appendDebug("account-db", `2FA required for ${payload.accountId || profile.jid}`);
      return payload;
    }

    appendDebug("account-db", `Saved ${payload.account.jid}`);
    return payload.account;
  }

  function storeServerAccountSession(account, keepAccount) {
    const key = accountStorageKeyFor(state.sessionProfile);
    if (keepAccount !== true) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, JSON.stringify({
      accountId: account.accountId,
      jid: account.jid,
      sessionProfile: state.sessionProfile
    }));
    sessionStorage.removeItem(key);
  }

  function storeServerAccountBrowserSession(account) {
    const key = accountStorageKeyFor(state.sessionProfile);
    sessionStorage.setItem(key, JSON.stringify({
      accountId: account.accountId,
      jid: account.jid,
      sessionProfile: state.sessionProfile,
      loginToken: accountLoginToken(account)
    }));
  }

  function cleanOauthUrl() {
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("oauth");
    cleanUrl.searchParams.delete("accountId");
    cleanUrl.searchParams.delete("loginToken");
    history.replaceState(null, document.title, cleanUrl.toString());
  }

  function accountApiErrorText(error, payload = null) {
    if (error === "invalid_credentials") {
      return t("account.invalid_credentials", "The server rejected this email or password.");
    }

    if (error === "invalid_current_password") {
      return t("account.invalid_current_password", "The current password is not correct.");
    }

    if (error === "not_authenticated") {
      return t("account.not_authenticated", "Sign in again before loading this server account.");
    }

    if (error === "verified_email_required") {
      return t("account.verified_email_required", "A verified e-mail address is required for this security step.");
    }

    if (error === "invalid_verification_code") {
      return t("account.invalid_verification_code", "The verification code is not correct.");
    }

    if (error === "verification_expired") {
      return t("account.verification_expired", "The verification code is expired. Request a new code.");
    }

    if (error === "too_many_verification_attempts") {
      return t("account.too_many_verification_attempts", "Too many attempts. Request a new verification code.");
    }

    if (error === "wrong_verification_purpose") {
      return t("account.wrong_verification_purpose", "This verification code is for another security step.");
    }

    if (error === "unsupported_two_factor_method") {
      return t("account.unsupported_two_factor_method", "This 2FA method is not supported.");
    }

    if (error === "two_factor_setup_missing") {
      return t("account.two_factor_setup_missing", "Create a new QR code before entering the 2FA code.");
    }

    if (error === "unsupported_identity_provider") {
      return t("account.unsupported_identity_provider", "This account link is not supported.");
    }

    if (error === "password_required") {
      return t("account.password_required", "Enter a password for a real server account.");
    }

    if (error === "invalid_reset_token") {
      return t("account.invalid_reset_token", "This password reset link is invalid or expired.");
    }

    if (error === "missing_reset_data") {
      return t("account.missing_reset_data", "Enter your email address and a new password.");
    }

    if (error === "account_not_found") {
      return t("account.account_not_found", "This account was not found on the XMPP server.");
    }

    if (error === "account_exists") {
      const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions.filter(Boolean) : [];
      if (suggestions.length) {
        return `${t("account.account_exists", "This account already exists. Use Sign in instead.")} ${t("account.account_suggestions", "Available alternatives")}: ${suggestions.join(", ")}`;
      }

      return t("account.account_exists", "This account already exists. Use Sign in instead.");
    }

    if (error === "unsupported_local_registration") {
      return t("account.unsupported_local_registration", "New local accounts can only be created for localhost here.");
    }

    if (error === "missing_jid") {
      return t("account.invalid_jid", "Enter a valid email address, for example edward@localhost.");
    }

    return `${t("account.server_save_failed", "Server account could not be saved")}: ${error}`;
  }

  function resetAccountProfile() {
    localStorage.removeItem(accountStorageKeyFor(state.sessionProfile));
    sessionStorage.removeItem(accountStorageKeyFor(state.sessionProfile));
    sessionStorage.removeItem(clientInstanceStorageKeyFor(state.sessionProfile));
    updateAccountStatus(t("account.reset_reload", "Account reset; reload to restore defaults"));
    appendDebug("account", "Server account session cleared");
    location.reload();
  }

  function clearAccountSessionForCurrentProfile() {
    localStorage.removeItem(accountStorageKeyFor(state.sessionProfile));
    sessionStorage.removeItem(accountStorageKeyFor(state.sessionProfile));
    sessionStorage.removeItem(clientInstanceStorageKeyFor(state.sessionProfile));
    clearStoredXmppStreamManagement();
    cleanOauthUrl();
  }

  async function logoutAccount(options = {}) {
    state.suppressAutoLoginDialog = false;
    window.clearTimeout(state.sessionIdleTimerId);
    state.sessionIdleTimerId = null;
    clearAccountSessionForCurrentProfile();
    if (state.account) {
      state.account.password = "";
      state.account.loginToken = "";
      state.account.rememberPassword = false;
      state.account.savedInSession = false;
    }
    el.passwordInput.value = "";
    el.dialogPasswordInput.value = "";
    el.rememberPasswordToggle.checked = false;
    el.dialogRememberPasswordToggle.checked = false;
    appendDebug("account", "Signed out and cleared local account session");
    setAccountReady(false);
    sendLogoutAccountSession()
      .then(() => appendDebug("account", "Server account session cleared"))
      .catch((error) => appendDebug("account-logout-error", error.message));
    disconnectAll(options.message || t("account.signed_out", "Signed out. Sign in to continue."), {
      forceLogin: options.forceLogin === true
    });
  }

  function sendLogoutAccountSession() {
    const body = JSON.stringify({ action: "logout" });
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(accountApiPath, new Blob([body], { type: "application/json" }));
      if (sent) {
        return Promise.resolve();
      }
    }

    return fetch(accountApiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`logout API returned ${response.status}`);
      }
    });
  }

  function handleAccountIdentityChanged() {
    if (!state.account) {
      return;
    }

    state.account.displayName = el.displayNameInput.value.trim() || "Me";
    state.account.jid = stripGeneratedResourceSuffix(el.jidInput.value.trim());
    if (!state.account.avatarColor) {
      state.account.avatarColor = avatarColorFor(`${state.account.displayName}:${state.account.jid}`);
      setAvatarColorControls(state.account.avatarColor);
    }

    updateAccountAvatarPreview();
    renderConversations();
    renderActiveConversation();
    if (isRelayConnected()) {
      sendPresence("online");
    }
  }

  function handleAvatarColorChanged(source = "main") {
    if (!state.account) {
      state.account = currentAccountProfile();
    }

    const colorInput = source === "dialog" ? el.dialogAvatarColorInput : el.avatarColorInput;
    state.account.avatarColor = normalizeAvatarColor(colorInput.value);
    setAvatarColorControls(state.account.avatarColor);
    updateAccountAvatarPreview();
    renderConversations();
    renderActiveConversation();
    if (isRelayConnected()) {
      sendPresence("online");
    }
  }

  function handleAvatarFileSelected(input = el.avatarFileInput) {
    const file = input.files?.[0] ?? null;
    input.value = "";
    if (!file) {
      return;
    }

    if (!isSupportedAvatarFile(file)) {
      updateAccountStatus(t("avatar.unsupported", "Choose a PNG, JPEG, GIF, WebP or SVG avatar."));
      return;
    }

    if (file.size > avatarSourceMaxBytes) {
      updateAccountStatus(t("avatar.source_too_large", "Avatar photo is too large. Choose an image up to 5 MB."));
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = String(reader.result ?? "");
      if (!isAvatarSourceDataUrl(dataUrl)) {
        updateAccountStatus(t("avatar.read_failed", "Avatar could not be read."));
        return;
      }

      openAvatarCropDialog(dataUrl);
    });
    reader.addEventListener("error", () => updateAccountStatus(t("avatar.read_failed", "Avatar could not be read.")));
    reader.readAsDataURL(file);
  }

  function openAvatarCropDialog(dataUrl) {
    const image = new Image();
    image.addEventListener("load", () => {
      state.avatarCrop.image = image;
      resetAvatarCrop();
      el.avatarCropDialog.hidden = false;
      document.body.classList.add("modal-open");
      el.avatarCropStatus.textContent = t("avatar.crop_ready", "Position the photo inside the circle.");
      drawAvatarCropPreview();
      el.applyAvatarCropButton.focus();
    }, { once: true });
    image.addEventListener("error", () => updateAccountStatus(t("avatar.read_failed", "Avatar could not be read.")), { once: true });
    image.src = dataUrl;
  }

  function resetAvatarCrop() {
    const crop = state.avatarCrop;
    const image = crop.image;
    const canvas = el.avatarCropCanvas;
    const cropSize = avatarCropSize();
    const minScale = image
      ? Math.max(cropSize / image.naturalWidth, cropSize / image.naturalHeight)
      : 1;
    crop.minScale = minScale;
    crop.scale = minScale;
    crop.offsetX = 0;
    crop.offsetY = 0;
    crop.dragging = false;
    crop.pointerId = null;
    el.avatarCropZoomInput.min = String(minScale);
    el.avatarCropZoomInput.max = String(minScale * 4);
    el.avatarCropZoomInput.step = String(Math.max(.01, minScale / 100));
    el.avatarCropZoomInput.value = String(minScale);
    canvas.classList.remove("dragging");
  }

  function avatarCropSize() {
    return Math.floor(Math.min(el.avatarCropCanvas.width, el.avatarCropCanvas.height) * .72);
  }

  function drawAvatarCropPreview() {
    const canvas = el.avatarCropCanvas;
    const context = canvas.getContext("2d");
    const crop = state.avatarCrop;
    const image = crop.image;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#e8eef7";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!image) {
      return;
    }

    constrainAvatarCrop();
    const width = image.naturalWidth * crop.scale;
    const height = image.naturalHeight * crop.scale;
    const x = (canvas.width - width) / 2 + crop.offsetX;
    const y = (canvas.height - height) / 2 + crop.offsetY;
    context.drawImage(image, x, y, width, height);

    const cropSize = avatarCropSize();
    const cropX = (canvas.width - cropSize) / 2;
    const cropY = (canvas.height - cropSize) / 2;
    context.save();
    context.fillStyle = "rgba(255, 255, 255, .60)";
    context.beginPath();
    context.rect(0, 0, canvas.width, canvas.height);
    context.arc(canvas.width / 2, canvas.height / 2, cropSize / 2, 0, Math.PI * 2, true);
    context.fill("evenodd");
    context.restore();

    context.save();
    context.strokeStyle = "#1d4ed8";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(canvas.width / 2, canvas.height / 2, cropSize / 2, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = "rgba(255,255,255,.65)";
    context.lineWidth = 1;
    context.strokeRect(cropX, cropY, cropSize, cropSize);
    context.restore();
  }

  function constrainAvatarCrop() {
    const crop = state.avatarCrop;
    const image = crop.image;
    if (!image) {
      return;
    }

    const cropSize = avatarCropSize();
    const width = image.naturalWidth * crop.scale;
    const height = image.naturalHeight * crop.scale;
    const maxX = Math.max(0, (width - cropSize) / 2);
    const maxY = Math.max(0, (height - cropSize) / 2);
    crop.offsetX = Math.max(-maxX, Math.min(maxX, crop.offsetX));
    crop.offsetY = Math.max(-maxY, Math.min(maxY, crop.offsetY));
  }

  function updateAvatarCropZoom() {
    const previousScale = state.avatarCrop.scale;
    const nextScale = Number(el.avatarCropZoomInput.value);
    if (!Number.isFinite(nextScale) || nextScale <= 0) {
      return;
    }

    const ratio = previousScale > 0 ? nextScale / previousScale : 1;
    state.avatarCrop.scale = nextScale;
    state.avatarCrop.offsetX *= ratio;
    state.avatarCrop.offsetY *= ratio;
    drawAvatarCropPreview();
  }

  function startAvatarCropDrag(event) {
    if (!state.avatarCrop.image || event.button > 0) {
      return;
    }

    const crop = state.avatarCrop;
    crop.dragging = true;
    crop.pointerId = event.pointerId;
    crop.startX = event.clientX;
    crop.startY = event.clientY;
    crop.startOffsetX = crop.offsetX;
    crop.startOffsetY = crop.offsetY;
    el.avatarCropCanvas.classList.add("dragging");
    el.avatarCropCanvas.setPointerCapture?.(event.pointerId);
  }

  function moveAvatarCropDrag(event) {
    const crop = state.avatarCrop;
    if (!crop.dragging || crop.pointerId !== event.pointerId) {
      return;
    }

    crop.offsetX = crop.startOffsetX + event.clientX - crop.startX;
    crop.offsetY = crop.startOffsetY + event.clientY - crop.startY;
    drawAvatarCropPreview();
  }

  function endAvatarCropDrag(event) {
    const crop = state.avatarCrop;
    if (event && crop.pointerId !== event.pointerId) {
      return;
    }

    if (crop.pointerId !== null) {
      el.avatarCropCanvas.releasePointerCapture?.(crop.pointerId);
    }

    crop.dragging = false;
    crop.pointerId = null;
    el.avatarCropCanvas.classList.remove("dragging");
  }

  function applyAvatarCrop() {
    const image = state.avatarCrop.image;
    if (!image) {
      return;
    }

    const outputSize = 256;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    const cropSize = avatarCropSize();
    const preview = el.avatarCropCanvas;
    const previewX = (preview.width - image.naturalWidth * state.avatarCrop.scale) / 2 + state.avatarCrop.offsetX;
    const previewY = (preview.height - image.naturalHeight * state.avatarCrop.scale) / 2 + state.avatarCrop.offsetY;
    const cropX = (preview.width - cropSize) / 2;
    const cropY = (preview.height - cropSize) / 2;
    const sourceX = Math.max(0, (cropX - previewX) / state.avatarCrop.scale);
    const sourceY = Math.max(0, (cropY - previewY) / state.avatarCrop.scale);
    const sourceSize = Math.min(image.naturalWidth - sourceX, image.naturalHeight - sourceY, cropSize / state.avatarCrop.scale);
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);
    const dataUrl = canvas.toDataURL("image/jpeg", .9);
    setAccountAvatarDataUrl(dataUrl);
    closeAvatarCropDialog();
  }

  function setAccountAvatarDataUrl(dataUrl) {
    if (!state.account) {
      state.account = currentAccountProfile();
    }

    state.account.avatarDataUrl = dataUrl;
    updateAccountAvatarPreview();
    renderConversations();
    renderActiveConversation();
    updateAccountStatus(t("avatar.changed_save", "Avatar changed; save the account to keep it."));
    if (isRelayConnected()) {
      sendPresence("online");
    }
  }

  function closeAvatarCropDialog() {
    el.avatarCropDialog.hidden = true;
    state.avatarCrop.image = null;
    endAvatarCropDrag();
    if (el.accountDialog.hidden) {
      document.body.classList.remove("modal-open");
    }
  }

  function closeAvatarCropDialogOnBackdrop(event) {
    if (event.target === el.avatarCropDialog) {
      closeAvatarCropDialog();
    }
  }

  function closeAvatarCropDialogOnEscape(event) {
    if (event.key === "Escape" && !el.avatarCropDialog.hidden) {
      closeAvatarCropDialog();
    }
  }

  function clearAccountAvatar() {
    if (!state.account) {
      state.account = currentAccountProfile();
    }

    state.account.avatarDataUrl = "";
    updateAccountAvatarPreview();
    renderConversations();
    renderActiveConversation();
    updateAccountStatus(t("avatar.changed_save", "Avatar changed; save the account to keep it."));
    if (isRelayConnected()) {
      sendPresence("online");
    }
  }

  function isSupportedAvatarFile(file) {
    const type = String(file.type || "").toLowerCase();
    const name = String(file.name || "").toLowerCase();
    return type.startsWith("image/")
      || [".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"].some((extension) => name.endsWith(extension));
  }

  function switchBrowserSession() {
    const profile = sanitizeSessionProfile(el.sessionProfileInput.value);
    navigateToSessionProfile(profile);
  }

  function openSecondBrowserSession() {
    const profile = state.sessionProfile === "session-2" ? "session-1" : "session-2";
    const url = sessionProfileUrl(profile);
    window.open(url.toString(), "_blank", "noopener");
  }

  function navigateToSessionProfile(profile) {
    const normalized = sanitizeSessionProfile(profile);
    sessionStorage.setItem(sessionProfileStorageKey, normalized);
    location.href = sessionProfileUrl(normalized).toString();
  }

  function sessionProfileUrl(profile) {
    const url = new URL(location.href);
    url.searchParams.set("profile", sanitizeSessionProfile(profile));
    return url;
  }

  function updateAccountStatus(text) {
    const passwordState = passwordStatusText();
    el.accountStatus.textContent = `${text} - ${t("account.session", "session")}: ${state.sessionProfile} - ${el.jidInput.value || t("account.no_jid", "no email")} - ${passwordState}`;
  }

  function updateAccountPasswordStatus() {
    updateAccountStatus(accountStatusPrefix());
  }

  function passwordStatusText() {
    if (!el.passwordInput.value) {
      return t("account.no_password", "no password");
    }

    return el.rememberPasswordToggle.checked
      ? t("account.password_saved", "account saved in database")
      : t("account.password_session", "password only this session");
  }

  function updateRelayConversationMeta() {
    const conversation = activeConversation();
    if (conversation && el.peerInput.value.trim()) {
      conversation.peer = el.peerInput.value.trim();
      conversation.meta = conversationMeta(conversation);
      renderConversations();
      renderActiveConversation();
    }

    updateAccountStatus(accountStatusPrefix());
  }

  function accountStatusPrefix() {
    if (state.account?.savedInDatabase) {
      return t("account.database_loaded", "Server account loaded");
    }

    return hasStoredAccountSession()
      ? t("account.server_session", "Server account session")
      : t("account.default_profile", "Default account profile");
  }

  function hasStoredAccountSession() {
    const key = accountStorageKeyFor(state.sessionProfile);
    return Boolean(localStorage.getItem(key) || sessionStorage.getItem(key));
  }

  function renderProvider() {
    const provider = state.provider;
    if (!provider) {
      el.providerSummary.textContent = t("provider.none", "No provider manifest loaded.");
      el.capabilityList.replaceChildren();
      return;
    }

    el.providerSummary.textContent = `${provider.name} ${provider.version} - ${provider.providerId}`;
    renderCapabilities(el.capabilityList, provider.capabilities ?? []);
  }

  function renderTabs() {
    const panels = allTabs();
    if (state.activeTabId !== "chat" && !panels.some((tab) => tab.id === state.activeTabId)) {
      state.activeTabId = "chat";
    }
    const newsTab = panels.find((tab) => tab.id === "news");
    const supportTab = panels.find(isSupportTab);
    const historyTab = panels.find(isHistoryTab);
    el.newsButton.hidden = !newsTab;
    el.newsButton.classList.toggle("selected", state.activeTabId === "news");
    el.supportButton.hidden = !supportTab;
    const supportLabel = supportTab?.title ?? t("tab.support", "Support");
    el.supportButton.title = supportLabel;
    el.supportButton.setAttribute("aria-label", supportLabel);
    const supportText = el.supportButton.querySelector(".sr-only");
    if (supportText) {
      supportText.textContent = supportLabel;
    }
    el.supportButton.classList.toggle("selected", Boolean(supportTab) && state.activeTabId === supportTab.id);
    el.historyButton.hidden = !historyTab;
    el.historyButton.classList.toggle("selected", state.activeTabId === "history");

    const tabs = panels.filter((tab) => tab.id !== "news" && !isSupportTab(tab) && !isHistoryTab(tab));
    el.appTabs.replaceChildren();
    el.appTabs.hidden = tabs.length === 0;
    for (const tab of tabs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = tab.id === state.activeTabId ? "selected" : "";
      button.textContent = tab.title;
      button.addEventListener("click", () => activateTab(tab.id));
      el.appTabs.appendChild(button);
    }
  }

  function allTabs() {
    const providerTabs = state.provider?.tabs
      ?.filter((tab) => tab.id !== "captions" && tab.service !== "caption")
      .map((tab) => ({
        ...tab,
        providerName: state.provider.name
    })) ?? [];
    return [
      ...(state.provider?.announcements ? [{ id: "news", title: t("tab.news", "News"), type: "builtin" }] : []),
      { id: "history", title: t("tab.history", "History"), type: "builtin" },
      ...providerTabs
    ];
  }

  function isSupportTab(tab) {
    return tab?.id === "support" || tab?.service === "support";
  }

  function isHistoryTab(tab) {
    return tab?.id === "history";
  }

  function activateSupportTab() {
    const supportTab = allTabs().find(isSupportTab);
    activateTab(supportTab?.id ?? "chat");
  }

  function activateTab(tabId) {
    state.activeTabId = tabId;
    renderTabs();

    if (tabId === "chat") {
      document.body.classList.remove("history-page-active");
      el.historyPage.hidden = true;
      el.messageTimeline.hidden = false;
      el.tabPanel.hidden = true;
      el.composerForm.hidden = false;
      return;
    }

    const tab = allTabs().find((item) => item.id === tabId);
    if (!tab) {
      activateTab("chat");
      return;
    }

    document.body.classList.toggle("history-page-active", isHistoryTab(tab));
    el.messageTimeline.hidden = true;
    el.composerForm.hidden = true;
    el.historyPage.hidden = !isHistoryTab(tab);
    el.tabPanel.hidden = isHistoryTab(tab);
    if (isHistoryTab(tab)) {
      renderHistoryPage(tab);
      return;
    }
    renderTabPanel(tab);
  }

  function renderHistoryPage(tab) {
    el.historyPageTitle.textContent = t("history.title", "Total Conversation geschiedenis");
    el.historyPageMeta.textContent = t("history.text", "Oproepen, gemiste oproepen en Total Conversation worden los van de gewone chat bewaard.");
    el.historyPageBody.replaceChildren();
    const card = createProviderCard();
    renderHistoryTab(card, { includeIntro: false, includeSaveToggle: false });
    el.historyPageBody.appendChild(card);
  }

  function renderTabPanel(tab) {
    el.tabPanel.classList.toggle("history-panel", isHistoryTab(tab));
    el.tabPanelTitle.textContent = tab.title;
    el.tabPanelMeta.textContent = tab.type === "builtin"
      ? "Teletyptel"
      : `${tab.providerName ?? "Provider"} - ${tab.type}`;
    el.tabPanelBody.replaceChildren();

    if (tab.type === "web") {
      renderWebTab(tab);
      return;
    }

    if (tab.type === "provider-service") {
      renderProviderServiceTab(tab);
      return;
    }

    renderBuiltinTab(tab);
  }

  function renderBuiltinTab(tab) {
    const card = createProviderCard();
    if (tab.id === "news") {
      renderNewsTab(card);
    } else if (tab.id === "history") {
      renderHistoryTab(card);
    } else {
      card.appendChild(createTextBlock(tab.title, t("tab.builtin_text", "Built-in Teletyptel tab.")));
    }

    el.tabPanelBody.appendChild(card);
  }

  function renderSettingsPanels() {
    if (el.dialogContactsPanel) {
      el.dialogContactsPanel.replaceChildren();
      renderContactsTab(el.dialogContactsPanel, { includeIntro: false });
    }

    if (el.dialogAccessibilityPanel) {
      el.dialogAccessibilityPanel.replaceChildren();
      renderAccessibilityTab(el.dialogAccessibilityPanel, { includeIntro: false });
    }
  }

  function renderContactsTab(card, options = {}) {
    if (options.includeIntro !== false) {
      card.appendChild(createTextBlock(t("tab.contacts", "Contacts"), t("tab.contacts_text", "Contacts will use XMPP roster and provider address book adapters.")));
    }

    const section = document.createElement("div");
    section.className = "blocked-contact-list";
    const title = document.createElement("strong");
    title.textContent = t("contacts.blocked_title", "Blocked contacts");
    section.appendChild(title);

    const blockedContacts = blockedContactEntries();
    if (!blockedContacts.length) {
      const empty = document.createElement("p");
      empty.className = "blocked-contact-empty";
      empty.textContent = t("contacts.blocked_empty", "No blocked contacts.");
      section.appendChild(empty);
      card.appendChild(section);
      return;
    }

    for (const conversation of blockedContacts) {
      const row = document.createElement("div");
      row.className = "blocked-contact-row";

      const text = document.createElement("div");
      text.className = "blocked-contact-text";
      const name = document.createElement("strong");
      name.textContent = conversationDisplayName(conversation);
      const peer = document.createElement("span");
      peer.textContent = conversation.peer;
      text.append(name, peer);

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = t("button.unblock_contact", "Unblock");
      button.addEventListener("click", () => toggleBlockConversation(conversation));

      row.append(createAvatarElement(conversation, "avatar-list"), text, button);
      section.appendChild(row);
    }

    card.appendChild(section);
  }

  function renderAccessibilityTab(card, options = {}) {
    if (options.includeIntro !== false) {
      card.appendChild(createTextBlock(
        t("tab.accessibility", "Accessibility"),
        t("tab.accessibility_text", "Live RTT, speech, location and provider bridges stay opt-in and visible.")));
    }
    renderCapabilities(card, ["rtt:publish", "xep-0080:geoloc"]);

    const locationPanel = document.createElement("section");
    locationPanel.className = "location-panel";

    const header = document.createElement("div");
    header.className = "location-header";
    const title = document.createElement("strong");
    title.textContent = t("location.title", "Location sharing");
    const status = document.createElement("span");
    status.textContent = locationStatusText();
    header.append(title, status);

    const actions = document.createElement("div");
    actions.className = "button-row location-actions";
    const requestButton = createActionButton(t("button.location_request", "Get browser location"), requestBrowserLocation, { icon: "locationSearching" });
    const shareButton = createActionButton(t("button.location_share_once", "Share once"), shareLocationOnce, { icon: "locationOn" });
    const durationControl = createLocationDurationControl();
    const liveButton = createActionButton(
      state.location.live
        ? t("button.location_live_on", "Live sharing on")
        : t("button.location_start_live", "Start live sharing"),
      () => state.location.live ? stopLocationSharing() : startLiveLocationSharing(),
      { icon: state.location.live ? "gpsFixed" : "myLocation" });
    liveButton.classList.toggle("selected", state.location.live);
    const stopButton = createActionButton(t("button.location_stop", "Stop sharing"), stopLocationSharing, { icon: "locationOff" });
    const exportButton = createActionButton(t("button.location_export_pidf", "Export PIDF-LO"), exportPidfLoLocation, { icon: "fileUpload" });
    shareButton.disabled = !state.location.current || !hasActiveConversation();
    liveButton.disabled = !hasActiveConversation();
    stopButton.disabled = !state.location.live && !state.location.current;
    exportButton.disabled = state.location.current?.lat == null || state.location.current?.lon == null;
    actions.append(requestButton, shareButton, durationControl, liveButton, stopButton, exportButton);

    const warningList = document.createElement("div");
    warningList.className = "location-warnings";
    for (const warning of locationWarnings()) {
      const item = document.createElement("span");
      item.textContent = warning;
      warningList.appendChild(item);
    }

    const rows = createDefinitionList(locationDefinitionRows());
    rows.classList.add("location-details");

    locationPanel.append(header, actions, warningList, rows);
    card.appendChild(locationPanel);
  }

  function createLocationDurationControl() {
    const label = document.createElement("label");
    label.className = "location-duration-control";
    const text = document.createElement("span");
    text.textContent = t("location.duration_label", "Duration");
    const select = document.createElement("select");
    select.disabled = state.location.live;

    for (const [duration, key] of locationDurationOptions) {
      const option = document.createElement("option");
      option.value = String(duration);
      option.textContent = t(key, formatLocationDuration(duration));
      option.selected = normalizeLocationLiveDurationMs(state.location.settings.liveDurationMs) === duration;
      select.appendChild(option);
    }

    select.addEventListener("change", () => {
      state.location.settings.liveDurationMs = normalizeLocationLiveDurationMs(select.value);
      saveLocationSettings();
      refreshOpenTabPanel();
    });
    label.append(text, select);
    return label;
  }

  function renderHistoryTab(card, options = {}) {
    card.classList.add("history-card");
    if (options.includeIntro !== false) {
      card.appendChild(createTextBlock(
        t("history.title", "Total Conversation geschiedenis"),
        t("history.text", "Oproepen, gemiste oproepen en Total Conversation worden los van de gewone chat bewaard.")));
    }
    card.appendChild(createHistorySettingsPanel({ includeSaveToggle: options.includeSaveToggle !== false }));

    const layout = document.createElement("div");
    layout.className = "history-layout";
    const list = document.createElement("div");
    list.className = "history-list";
    const detail = document.createElement("div");
    detail.className = "history-detail";
    renderHistoryList(list);
    renderHistoryDetail(detail);
    layout.append(list, detail);
    card.appendChild(layout);
  }

  function createHistorySettingsPanel(options = {}) {
    const panel = document.createElement("section");
    panel.className = "history-settings";
    if (options.includeSaveToggle !== false) {
      const tcLabel = createHistoryToggle(
        t("history.save_tc", "Total Conversation bewaren"),
        state.historySettings.saveTotalConversation,
        (checked) => {
          state.historySettings.saveTotalConversation = checked;
          saveHistorySettings();
          refreshOpenTabPanel();
        });
      panel.appendChild(tcLabel);
    }
    const retention = document.createElement("label");
    retention.className = "history-retention";
    const retentionText = document.createElement("span");
    retentionText.textContent = t("history.retention", "Bewaartermijn max.");
    const select = document.createElement("select");
    for (const [value, label] of historyRetentionOptions()) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = state.historySettings.retention === value;
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      state.historySettings.retention = select.value;
      saveHistorySettings();
      refreshOpenTabPanel();
    });
    retention.append(retentionText, select);
    panel.appendChild(retention);
    panel.appendChild(createHistoryPrivacyHelp());
    return panel;
  }

  function createHistoryPrivacyHelp() {
    const wrapper = document.createElement("div");
    wrapper.className = "history-privacy-help";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-help-button";
    button.textContent = "?";
    button.setAttribute("aria-label", t("history.privacy_help_label", "AVG uitleg"));
    button.addEventListener("click", openHistoryPrivacyDialog);

    wrapper.appendChild(button);
    return wrapper;
  }

  function openHistoryPrivacyDialog() {
    el.historyPrivacyDialog.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeHistoryPrivacyDialog() {
    el.historyPrivacyDialog.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function closeHistoryPrivacyDialogOnBackdrop(event) {
    if (event.target === el.historyPrivacyDialog) {
      closeHistoryPrivacyDialog();
    }
  }

  function createHistoryToggle(labelText, checked, onChange) {
    const label = document.createElement("label");
    label.className = "history-toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    const text = document.createElement("span");
    text.textContent = labelText;
    label.append(input, text);
    return label;
  }

  function historyRetentionOptions() {
    return [
      ["30", t("history.retention_30", "30 dagen")],
      ["90", t("history.retention_90", "90 dagen")],
      ["365", t("history.retention_365", "1 jaar")],
      ["730", t("history.retention_730", "2 jaar")],
      ["1825", t("history.retention_1825", "5 jaar")],
      ["unlimited", t("history.retention_unlimited", "Onbeperkt")]
    ];
  }

  function renderHistoryList(container) {
    const entries = conversationHistoryEntries();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = t("history.empty", "Nog geen Total Conversation geschiedenis.");
      container.appendChild(empty);
      return;
    }

    let previousGroup = "";
    for (const entry of entries) {
      const group = historyGroupLabel(entry.startedAt || entry.timestamp);
      if (group !== previousGroup) {
        const heading = document.createElement("strong");
        heading.className = "history-group";
        heading.textContent = group;
        container.appendChild(heading);
        previousGroup = group;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-item";
      button.classList.toggle("selected", selectedHistoryId() === entry.id);
      button.addEventListener("click", () => {
        state.conversationHistory.selectedId = entry.id;
        refreshOpenTabPanel();
      });
      const title = document.createElement("span");
      title.className = "history-item-title";
      title.textContent = entry.title;
      const meta = document.createElement("span");
      meta.className = "history-item-meta";
      meta.textContent = entry.meta;
      button.append(title, meta);
      container.appendChild(button);
    }
  }

  function renderHistoryDetail(container) {
    const entry = selectedHistoryEntry();
    if (!entry) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = t("history.select", "Kies links een oproep om terug te lezen.");
      container.appendChild(empty);
      return;
    }

    const title = document.createElement("h3");
    title.textContent = entry.title;
    const meta = document.createElement("p");
    meta.className = "history-detail-meta";
    meta.textContent = entry.meta;
    const actions = document.createElement("div");
    actions.className = "history-actions";
    const exportButton = createActionButton(t("button.export", "Exporteren"), () => exportHistoryEntry(entry), { icon: "download" });
    actions.appendChild(exportButton);
    container.append(title, meta, actions);

    if (entry.kind === "call") {
      renderHistoryMedia(container, entry.source.media);
      renderHistoryTranscript(container, entry.source.transcript);
    } else {
      const body = document.createElement("p");
      body.className = "history-message-text";
      body.textContent = entry.source.text || "";
      container.appendChild(body);
    }
  }

  function renderHistoryMedia(container, media) {
    const items = Array.isArray(media) ? media.filter((item) => item?.url) : [];
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = t("history.no_media", "Nog geen audio/video-opname bewaard.");
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "history-media";
    for (const item of items) {
      list.appendChild(createAttachmentElement({
        ...item,
        kind: item.kind || classifyAttachment(item)
      }));
    }
    container.appendChild(list);
  }

  function renderHistoryTranscript(container, transcript) {
    const list = document.createElement("div");
    list.className = "history-transcript";
    const lines = Array.isArray(transcript) ? transcript : [];
    if (!lines.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = t("history.no_transcript", "Nog geen teksttranscript bewaard.");
      list.appendChild(empty);
      container.appendChild(list);
      return;
    }

    for (const line of lines) {
      const row = document.createElement("div");
      row.className = "history-transcript-line";
      const who = document.createElement("strong");
      who.textContent = line.direction === "self" ? t("tc.local_label", "You") : displayNameForJid(line.from || "");
      const text = document.createElement("p");
      text.textContent = line.text || "";
      row.append(who, text);
      list.appendChild(row);
    }
    container.appendChild(list);
  }

  function conversationHistoryEntries() {
    return state.conversationHistory.calls.map((call) => ({
      id: `call:${call.callId}`,
      kind: "call",
      startedAt: call.startedAt,
      title: call.conversationName || displayNameForJid(call.conversationPeer),
      meta: `${historyCallTypeText(call)} - ${historyStatusText(call.status)} - ${formatHistoryDateTime(call.startedAt)}${call.durationSeconds ? ` - ${formatDuration(call.durationSeconds)}` : ""}`,
      preview: call.transcript?.[0]?.text || call.note || t("call.total_started", "Total conversation started"),
      source: call
    })).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }

  function selectedHistoryId() {
    const entries = conversationHistoryEntries();
    return state.conversationHistory.selectedId || entries[0]?.id || "";
  }

  function selectedHistoryEntry() {
    const entries = conversationHistoryEntries();
    return entries.find((entry) => entry.id === selectedHistoryId()) || entries[0] || null;
  }

  function historyGroupLabel(value) {
    const date = new Date(value || Date.now());
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return t("history.today", "Vandaag");
    }
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);
    return date >= weekAgo ? t("history.this_week", "Deze week") : t("history.earlier", "Eerder");
  }

  function historyCallTypeText(call) {
    if (call.callType === "total") {
      return t("button.call_total_conversation", "Totale conversatie");
    }
    return call.callType === "video"
      ? t("button.call_audio_video", "Audio + video")
      : t("button.call_audio", "Audio");
  }

  function historyStatusText(status) {
    const map = {
      ended: t("history.status_ended", "beeindigd"),
      missed: t("history.status_missed", "gemist"),
      rejected: t("history.status_rejected", "geweigerd"),
      failed: t("history.status_failed", "mislukt"),
      started: t("history.status_started", "gestart")
    };
    return map[status] || status;
  }

  function formatHistoryDateTime(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    return date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Number(seconds || 0));
    const minutes = Math.floor(total / 60);
    const rest = Math.floor(total % 60);
    return minutes > 0 ? `${minutes}:${String(rest).padStart(2, "0")}` : `0:${String(rest).padStart(2, "0")}`;
  }

  function exportHistoryEntry(entry) {
    const payload = {
      exportedAt: new Date().toISOString(),
      type: entry.kind,
      title: entry.title,
      meta: entry.meta,
      data: entry.source
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `teletyptel-gespreksgeschiedenis-${entry.id.replace(/[^a-z0-9_-]+/gi, "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderNewsTab(card) {
    const announcements = state.provider?.announcements;
    const items = Array.isArray(announcements?.items) ? announcements.items : [];
    card.appendChild(createTextBlock(
      t("tab.news", "News"),
      t("tab.news_text", "Provider announcements through XEP-0060 PubSub.")));
    card.appendChild(createDefinitionList([
      [t("news.node", "Node"), announcements?.node ?? "urn:tiedragon:teletyptel:announcements"],
      [t("news.items", "Items"), String(items.length)]
    ]));

    const list = document.createElement("div");
    list.className = "announcement-list";
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "announcement-empty";
      empty.textContent = t("news.empty", "No announcements.");
      list.appendChild(empty);
      card.appendChild(list);
      return;
    }

    for (const announcement of items) {
      const item = document.createElement("article");
      item.className = "announcement-item";

      const title = document.createElement("strong");
      title.textContent = announcement.title ?? announcement.id ?? t("tab.news", "News");

      const meta = document.createElement("span");
      meta.className = "announcement-meta";
      meta.textContent = [
        announcement.category,
        announcement.priority,
        announcement.published ? new Date(announcement.published).toLocaleString() : null
      ].filter(Boolean).join(" - ");

      const summary = document.createElement("p");
      summary.textContent = announcement.summary ?? "";
      item.append(title);
      if (meta.textContent) {
        item.appendChild(meta);
      }

      item.appendChild(summary);
      if (announcement.link) {
        const link = document.createElement("a");
        link.href = announcement.link;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = t("news.link", "Open");
        item.appendChild(link);
      }

      list.appendChild(item);
    }

    card.appendChild(list);
  }

  function createActionButton(text, handler, options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    if (options.icon) {
      button.classList.add("icon-button");
      setIconButtonContent(button, options.icon, text);
    } else {
      button.textContent = text;
    }
    button.addEventListener("click", () => {
      Promise.resolve(handler()).catch((error) => {
        state.location.error = error.message;
        setConnectionStatus(`${t("location.failed", "Location failed")}: ${error.message}`, "danger");
        refreshOpenTabPanel();
      });
    });
    return button;
  }

  function renderChecklistTab(card) {
    card.appendChild(createTextBlock(
      t("tab.checklist", "Checklist"),
      t("tab.checklist_text", "Visible progress for the current Teletyptel alpha. The full checklist is in docs/IMPLEMENTATION_CHECKLIST.md.")));

    const items = [
      [true, "RFC 6120/6121", t("checklist.xmpp_core", "XMPP core, TLS, SASL, roster, presence and chat models")],
      [true, "XEP-0301", t("checklist.rtt", "Real-time text sending, receiving and per-contact state")],
      [true, "Web UI", t("checklist.web_ui", "Browser chat UI with light/dark mode, contacts, groups and smileys")],
      [true, "Accounts", t("checklist.accounts", "Server account profile, MySQL account API and language preference")],
      [true, "XEP-0363", t("checklist.file_upload", "Local file upload plus XMPP HTTP upload slot helpers")],
      [true, "Jingle", t("checklist.calls", "Audio, audio+video and Total Conversation calls with camera, microphone, sound, volume, RTT sync and live device switching")],
      [true, "XEP-0084/0486", t("checklist.avatars", "Account avatar, contact avatar cache, group avatars and avatar presence")],
      [true, "XEP-0191", t("checklist.blocking", "Block and unblock contacts, with blocked chat, RTT and calls filtered")],
      [true, "XEP-0080", t("checklist.location", "Opt-in browser location sharing with XEP-0080 and PIDF-LO export")],
      [true, "XEP-0060", t("checklist.pubsub_news", "Provider news and announcements through PubSub")],
      [true, "ProtoXEP RTT Sync", t("checklist.jingle_rtt_sync", "Jingle co-session real-time text datachannel with XEP-0301 fallback")],
      [false, "Roster", t("checklist.roster", "Replace demo contact list with real XMPP roster-backed contacts")],
      [false, "OMEMO", t("checklist.omemo", "Finish encryption sessions, trust model and interoperability smoke")],
      [false, "Mobile", t("checklist.mobile", "Android and iOS WebView packaging smoke tests")]
    ];

    card.appendChild(createProtocolSummary(items));

    const list = document.createElement("ul");
    list.className = "checklist";
    for (const [done, label, text] of items) {
      const item = document.createElement("li");
      item.className = done ? "done" : "open";

      const mark = document.createElement("span");
      mark.className = "checklist-mark";
      mark.textContent = done ? "✓" : "□";

      const content = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = label;
      content.append(strong, ` ${text}`);
      item.append(mark, content);
      list.appendChild(item);
    }

    card.appendChild(list);
    card.appendChild(createTextBlock(
      t("checklist.mobile_diagnostics", "Mobile test diagnostics"),
      mobileDiagnosticsText()));
  }

  function mobileDiagnosticsText() {
    const relayUrl = normalizeLocalWebSocketUrlForCurrentHost(el.relayUrlInput?.value || "", 8787);
    const relayState = websocketReadyStateText(state.relaySocket?.readyState);
    const xmppState = websocketReadyStateText(state.xmppSocket?.readyState);
    const secure = window.isSecureContext ? "secure" : "not secure";
    return `Build 20260609-ios-rtt-relay - ${secure} - relay ${relayState} ${relayUrl} - xmpp ${xmppState}`;
  }

  function websocketReadyStateText(value) {
    if (value === WebSocket.CONNECTING) {
      return "connecting";
    }
    if (value === WebSocket.OPEN) {
      return "open";
    }
    if (value === WebSocket.CLOSING) {
      return "closing";
    }
    if (value === WebSocket.CLOSED) {
      return "closed";
    }
    return "none";
  }

  function createProtocolSummary(items) {
    const doneItems = items.filter(([done]) => done);
    const openItems = items.filter(([done]) => !done);
    const xepItems = items.filter(([, label]) => /^XEP-|ProtoXEP/i.test(label));
    const rfcItems = items.filter(([, label]) => /^RFC /i.test(label));
    const summary = document.createElement("div");
    summary.className = "protocol-summary";

    const rows = [
      [t("protocol.total", "Total"), String(items.length)],
      [t("protocol.done", "Done"), String(doneItems.length)],
      [t("protocol.open", "Open"), String(openItems.length)],
      [t("protocol.xeps", "XEPs"), String(xepItems.length)],
      [t("protocol.rfcs", "RFCs"), String(rfcItems.length)]
    ];

    for (const [label, value] of rows) {
      const item = document.createElement("div");
      item.className = "protocol-summary-item";
      const number = document.createElement("strong");
      number.textContent = value;
      const text = document.createElement("span");
      text.textContent = label;
      item.append(number, text);
      summary.appendChild(item);
    }

    return summary;
  }

  function renderWebTab(tab) {
    const card = createProviderCard();
    card.appendChild(createTextBlock("Sandboxed website tab", "This provider tab is separated from chat content by default."));
    card.appendChild(createDefinitionList([
      ["URL", tab.url ?? ""],
      ["Sandbox", tab.sandbox ? "yes" : "no"]
    ]));
    renderCapabilities(card, tab.capabilities ?? []);
    el.tabPanelBody.appendChild(card);
  }

  function renderProviderServiceTab(tab) {
    const card = createProviderCard();
    card.appendChild(createTextBlock("Provider service", `Service: ${tab.service ?? "unknown"}`));
    renderCapabilities(card, tab.capabilities ?? []);
    el.tabPanelBody.appendChild(card);
  }

  function createProviderCard() {
    const card = document.createElement("div");
    card.className = "provider-card";
    return card;
  }

  function createTextBlock(title, text) {
    const wrapper = document.createElement("div");
    const heading = document.createElement("strong");
    const paragraph = document.createElement("p");
    heading.textContent = title;
    paragraph.textContent = text;
    wrapper.append(heading, paragraph);
    return wrapper;
  }

  function createDefinitionList(rows) {
    const list = document.createElement("dl");
    for (const [term, value] of rows) {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = value;
      list.append(dt, dd);
    }

    return list;
  }

  function renderCapabilities(container, capabilities) {
    const list = document.createElement("div");
    list.className = "capability-list";
    for (const capability of capabilities) {
      const item = document.createElement("span");
      item.className = "capability";
      item.textContent = capability;
      list.appendChild(item);
    }

    if (container.classList?.contains("capability-list")) {
      container.replaceChildren(...Array.from(list.childNodes));
    } else {
      container.appendChild(list);
    }
  }

  async function requestBrowserLocation() {
    if (!navigator.geolocation?.getCurrentPosition) {
      state.location.error = t("location.unsupported", "Browser location is not available.");
      refreshOpenTabPanel();
      throw new Error(state.location.error);
    }

    state.location.error = "";
    setConnectionStatus(t("location.requesting", "Requesting browser location..."), "warn");
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, geolocationOptions());
    });
    state.location.current = positionToLocation(position, "browser-geolocation");
    state.location.permission = "granted";
    setConnectionStatus(t("location.ready", "Location ready; share only when you choose it."), "good");
    refreshOpenTabPanel();
    return state.location.current;
  }

  async function shareLocationOnce() {
    const location = state.location.current ?? await requestBrowserLocation();
    sendLocationToActiveConversation(location, "share");
  }

  async function startLiveLocationSharing() {
    if (!navigator.geolocation?.watchPosition) {
      state.location.error = t("location.unsupported", "Browser location is not available.");
      refreshOpenTabPanel();
      throw new Error(state.location.error);
    }

    const firstLocation = state.location.current ?? await requestBrowserLocation();
    const durationMs = normalizeLocationLiveDurationMs(state.location.settings.liveDurationMs);
    state.location.settings.liveDurationMs = durationMs;
    saveLocationSettings();
    sendLocationToActiveConversation(firstLocation, "live");
    stopLocationWatchOnly();
    state.location.live = true;
    state.location.liveExpiresAt = new Date(Date.now() + durationMs);
    scheduleLocationAutoStop(durationMs);
    state.location.watchId = navigator.geolocation.watchPosition(
      (position) => {
        state.location.current = positionToLocation(position, "browser-geolocation");
        const now = Date.now();
        if (state.location.liveExpiresAt && now >= state.location.liveExpiresAt.getTime()) {
          stopLocationSharing("expired");
          return;
        }

        if (now - state.location.lastLiveSentAt >= state.location.settings.liveIntervalMs) {
          sendLocationToActiveConversation(state.location.current, "live");
        }

        refreshOpenTabPanel();
      },
      (error) => {
        state.location.error = geolocationErrorText(error);
        setConnectionStatus(state.location.error, "warn");
        refreshOpenTabPanel();
      },
      geolocationOptions());
    setConnectionStatus(
      t("location.live_started_until", "Live location sharing started until {0}.")
        .replace("{0}", formatTime(state.location.liveExpiresAt)),
      "good");
    refreshOpenTabPanel();
  }

  function stopLocationSharing(reason = "manual") {
    stopLocationWatchOnly();
    state.location.live = false;
    state.location.liveExpiresAt = null;
    clearLocationAutoStopTimer();
    sendLocationStopped();
    setConnectionStatus(
      reason === "expired"
        ? t("location.expired", "Location sharing time expired.")
        : t("location.stopped", "Location sharing stopped."),
      "warn");
    refreshOpenTabPanel();
  }

  function stopLocationWatchOnly() {
    if (state.location.watchId !== null && navigator.geolocation?.clearWatch) {
      navigator.geolocation.clearWatch(state.location.watchId);
    }

    state.location.watchId = null;
  }

  function scheduleLocationAutoStop(durationMs) {
    clearLocationAutoStopTimer();
    state.location.liveStopTimerId = window.setTimeout(() => {
      if (state.location.live) {
        stopLocationSharing("expired");
      }
    }, Math.min(durationMs, maxLocationLiveDurationMs));
  }

  function clearLocationAutoStopTimer() {
    if (state.location.liveStopTimerId !== null) {
      window.clearTimeout(state.location.liveStopTimerId);
    }

    state.location.liveStopTimerId = null;
  }

  function sendLocationToActiveConversation(location, action) {
    const conversation = activeConversation();
    if (!location || !conversation) {
      setConnectionStatus(t("status.select_contact_first", "Select a contact first"), "warn");
      return;
    }

    if (isBlockedConversation(conversation)) {
      setConnectionStatus(t("status.contact_blocked_cannot_send", "This contact is blocked. Unblock to send messages."), "warn");
      return;
    }

    const text = locationMessageText(location);
    const xml = createGeolocXml(location);
    const messageId = createMessageId(action === "live" ? "loc-live" : "loc");
    if (isRelayConnected()) {
      const envelope = createRelayEnvelope("location", text, xml, conversation.peer);
      envelope.locationAction = action;
      envelope.location = publicLocationPayload(location);
      envelope.messageId = messageId;
      state.relaySocket.send(JSON.stringify(envelope));
      appendDebug("location-out", JSON.stringify(redactEnvelopeForLog(envelope)));
    }

    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN) {
      const iq = createGeolocPublishIq(location);
      sendXmppStanza(iq, "geoloc publish redacted");
    }

    if (action === "live") {
      state.location.sharedConversationId = conversation.id;
    }

    state.location.lastSharedAt = new Date();
    state.location.lastLiveSentAt = Date.now();
    if (action === "live") {
      upsertLiveLocationMessage("self", text, "location live", null, conversation.id, location);
    } else {
      addMessage("self", text, "location", null, null, conversation.id, location, messageId);
    }
    refreshOpenTabPanel();
  }

  function sendLocationStopped() {
    const conversation = state.location.sharedConversationId
      ? state.conversations.find((item) => item.id === state.location.sharedConversationId)
      : activeConversation();

    if (isRelayConnected() && conversation && !isBlockedConversation(conversation)) {
      const envelope = createRelayEnvelope("location", t("location.stopped_message", "Location sharing stopped."), createEmptyGeolocXml(), conversation.peer);
      envelope.locationAction = "stop";
      envelope.location = null;
      state.relaySocket.send(JSON.stringify(envelope));
      appendDebug("location-out", JSON.stringify(redactEnvelopeForLog(envelope)));
      addMessage("self", t("location.stopped_message", "Location sharing stopped."), "location", null, null, conversation.id);
    }

    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN) {
      const iq = createGeolocClearIq();
      sendXmppStanza(iq);
    }

    state.location.sharedConversationId = null;
  }

  function exportPidfLoLocation() {
    const location = state.location.current;
    if (location?.lat == null || location?.lon == null) {
      setConnectionStatus(t("location.no_coordinates", "No coordinates available."), "warn");
      return;
    }

    const xml = createPidfLoXml(location);
    appendDebug("pidf-lo", xml);
    navigator.clipboard?.writeText(xml).then(
      () => setConnectionStatus(t("location.pidf_copied", "PIDF-LO copied to clipboard."), "good"),
      () => setConnectionStatus(t("location.pidf_logged", "PIDF-LO written to Debug XML."), "good"));
  }

  function geolocationOptions() {
    return {
      enableHighAccuracy: state.location.settings.highAccuracy !== false,
      timeout: state.location.settings.timeoutMs,
      maximumAge: state.location.settings.maximumAgeMs
    };
  }

  function positionToLocation(position, source) {
    const coords = position.coords;
    return {
      lat: roundLocationNumber(coords.latitude, 7),
      lon: roundLocationNumber(coords.longitude, 7),
      accuracy: roundLocationNumber(coords.accuracy, 1),
      alt: Number.isFinite(coords.altitude) ? roundLocationNumber(coords.altitude, 1) : null,
      altaccuracy: Number.isFinite(coords.altitudeAccuracy) ? roundLocationNumber(coords.altitudeAccuracy, 1) : null,
      bearing: Number.isFinite(coords.heading) ? roundLocationNumber(coords.heading, 1) : null,
      speed: Number.isFinite(coords.speed) ? roundLocationNumber(coords.speed, 1) : null,
      timestamp: new Date(position.timestamp || Date.now()).toISOString(),
      text: t("location.browser_text", "Browser location shared by explicit consent."),
      source
    };
  }

  function publicLocationPayload(location) {
    return {
      lat: location.lat,
      lon: location.lon,
      accuracy: location.accuracy,
      alt: location.alt,
      altaccuracy: location.altaccuracy,
      bearing: location.bearing,
      speed: location.speed,
      timestamp: location.timestamp,
      text: location.text
    };
  }

  function roundLocationNumber(value, digits) {
    const number = Number(value);
    return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
  }

  function locationStatusText() {
    if (state.location.live) {
      return state.location.liveExpiresAt
        ? t("location.status_live_until", "Live sharing until {0}").replace("{0}", formatTime(state.location.liveExpiresAt))
        : t("location.status_live", "Live sharing is on");
    }

    if (state.location.error) {
      return state.location.error;
    }

    if (state.location.current) {
      return t("location.status_ready", "Location is ready, not shared automatically");
    }

    return t("location.status_idle", "Not requested");
  }

  function locationDefinitionRows() {
    const location = state.location.current;
    if (!location) {
      return [
        [t("location.field_protocol", "Protocol"), "XEP-0080"],
        [t("location.field_permission", "Permission"), state.location.permission],
        [t("location.field_policy", "Policy"), t("location.policy", "Only share after a visible button press.")]
      ];
    }

    return [
      [t("location.field_protocol", "Protocol"), "XEP-0080"],
      [t("location.field_latitude", "Latitude"), formatCoordinate(location.lat)],
      [t("location.field_longitude", "Longitude"), formatCoordinate(location.lon)],
      [t("location.field_accuracy", "Accuracy"), location.accuracy === null ? "-" : `${location.accuracy} m`],
      [t("location.field_timestamp", "Timestamp"), formatLocationTimestamp(location.timestamp)],
      [t("location.field_source", "Source"), location.source || "browser-geolocation"],
      [t("location.field_last_shared", "Last shared"), state.location.lastSharedAt ? formatTime(state.location.lastSharedAt) : "-"],
      [t("location.field_live_until", "Live until"), state.location.liveExpiresAt ? formatTime(state.location.liveExpiresAt) : "-"]
    ];
  }

  function locationWarnings() {
    const warnings = [];
    const location = state.location.current;
    if (!navigator.geolocation) {
      warnings.push(t("location.warn_no_browser_api", "This browser has no geolocation API."));
      return warnings;
    }

    if (state.mode === "xmpp") {
      warnings.push(t("location.warn_xmpp_support", "XMPP location depends on server PEP/XEP-0080 support; use service discovery before relying on it."));
    }

    if (!location) {
      warnings.push(t("location.warn_not_shared", "No location is sent until you press Share once or Start live sharing."));
      return warnings;
    }

    const age = Date.now() - Date.parse(location.timestamp);
    if (!Number.isFinite(age) || age > locationStaleAfterMs) {
      warnings.push(t("location.warn_stale", "Location may be stale; request a fresh position before emergency use."));
    }

    if (Number(location.accuracy) > 100) {
      warnings.push(t("location.warn_accuracy", "Accuracy is wider than 100 m."));
    }

    return warnings;
  }

  function geolocationErrorText(error) {
    if (error?.code === 1) {
      return t("location.denied", "Location permission was denied.");
    }

    if (error?.code === 2) {
      return t("location.unavailable", "Location is currently unavailable.");
    }

    if (error?.code === 3) {
      return t("location.timeout", "Location request timed out.");
    }

    return error?.message || t("location.failed", "Location failed");
  }

  function locationMessageText(location) {
    return `${t("location.shared_message", "Location shared")}: ${formatCoordinate(location.lat)}, ${formatCoordinate(location.lon)} (${location.accuracy ?? "?"} m)`;
  }

  function formatCoordinate(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(6) : "-";
  }

  function formatLocationDuration(durationMs) {
    const minutes = Math.round(Number(durationMs) / 60000);
    if (minutes < 60) {
      return t("location.duration_minutes", "{0} min").replace("{0}", String(minutes));
    }

    const hours = minutes / 60;
    return t(hours === 1 ? "location.duration_hour" : "location.duration_hours", hours === 1 ? "{0} hour" : "{0} hours")
      .replace("{0}", String(hours));
  }

  function formatLocationTimestamp(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : `${date.toLocaleString()} (${relativeAgeText(date)})`;
  }

  function relativeAgeText(date) {
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.round(seconds / 60);
    return `${minutes}m`;
  }

  function createGeolocXml(location) {
    return `<geoloc xmlns="${geolocNamespace}">`
      + `<lat>${escapeXml(location.lat)}</lat>`
      + `<lon>${escapeXml(location.lon)}</lon>`
      + (location.accuracy !== null ? `<accuracy>${escapeXml(location.accuracy)}</accuracy>` : "")
      + (location.alt !== null ? `<alt>${escapeXml(location.alt)}</alt>` : "")
      + (location.altaccuracy !== null ? `<altaccuracy>${escapeXml(location.altaccuracy)}</altaccuracy>` : "")
      + (location.bearing !== null ? `<bearing>${escapeXml(location.bearing)}</bearing>` : "")
      + (location.speed !== null ? `<speed>${escapeXml(location.speed)}</speed>` : "")
      + `<timestamp>${escapeXml(location.timestamp)}</timestamp>`
      + `<text>${escapeXml(location.text || t("location.browser_text", "Browser location shared by explicit consent."))}</text>`
      + `</geoloc>`;
  }

  function createEmptyGeolocXml() {
    return `<geoloc xmlns="${geolocNamespace}"/>`;
  }

  function createGeolocPublishIq(location) {
    const id = `geoloc-${Date.now().toString(36)}`;
    return `<iq xmlns="jabber:client" type="set" id="${id}"><pubsub xmlns="http://jabber.org/protocol/pubsub"><publish node="${geolocNamespace}"><item id="current">${createGeolocXml(location)}</item></publish></pubsub></iq>`;
  }

  function createGeolocClearIq() {
    const id = `geoloc-clear-${Date.now().toString(36)}`;
    return `<iq xmlns="jabber:client" type="set" id="${id}"><pubsub xmlns="http://jabber.org/protocol/pubsub"><publish node="${geolocNamespace}"><item id="current">${createEmptyGeolocXml()}</item></publish></pubsub></iq>`;
  }

  function createPidfLoXml(location) {
    const entity = currentBareJid() ? `pres:${currentBareJid()}` : "pres:unknown@localhost";
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    return `<presence xmlns="urn:ietf:params:xml:ns:pidf" xmlns:gp="urn:ietf:params:xml:ns:pidf:geopriv10" xmlns:bp="urn:ietf:params:xml:ns:pidf:geopriv10:basicPolicy" xmlns:gml="http://www.opengis.net/gml" entity="${escapeXml(entity)}"><tuple id="teletyptel-location"><status><basic>open</basic></status><gp:geopriv><gp:location-info><gml:Point srsName="urn:ogc:def:crs:EPSG::4326"><gml:pos>${escapeXml(location.lat)} ${escapeXml(location.lon)}</gml:pos></gml:Point>${location.accuracy !== null ? `<gp:accuracy uom="urn:ogc:def:uom:EPSG::9001">${escapeXml(location.accuracy)}</gp:accuracy>` : ""}</gp:location-info><gp:usage-rules><bp:retransmission-allowed>no</bp:retransmission-allowed><bp:retention-expiry>${escapeXml(expiry)}</bp:retention-expiry></gp:usage-rules><gp:method>GPS</gp:method></gp:geopriv><note>${escapeXml(location.text || "Teletyptel location")}</note><timestamp>${escapeXml(location.timestamp)}</timestamp></tuple></presence>`;
  }

  function shouldReconnectAfterMediaTransportClose() {
    return Boolean(!state.intentionalDisconnect && state.accountReady && (state.call || isMediaCaptureTransitionActive()));
  }

  function scheduleMediaTransportReconnect(kind, reason) {
    if (!shouldReconnectAfterMediaTransportClose()) {
      return false;
    }

    if (state.clientLifecycle.transientReconnectTimer) {
      return true;
    }

    setConnectionStatus(t("status.reconnecting", "Reconnecting..."), "warn");
    appendDebug(`${kind}-reconnect`, `scheduled after ${reason}`);
    state.clientLifecycle.transientReconnectTimer = window.setTimeout(() => {
      state.clientLifecycle.transientReconnectTimer = null;
      if (!state.accountReady || state.accountGateRequired || state.intentionalDisconnect) {
        return;
      }

      connectXmppWebSocket();
    }, 1000);
    return true;
  }

  function startRelayHeartbeat() {
    stopRelayHeartbeat();
    state.websocketHeartbeat.relayTimer = window.setInterval(() => {
      if (state.relaySocket?.readyState !== WebSocket.OPEN) {
        stopRelayHeartbeat();
        return;
      }

      const envelope = createRelayEnvelope("heartbeat", "", "", "relay@localhost");
      envelope.sentAt = new Date().toISOString();
      try {
        state.relaySocket.send(JSON.stringify(envelope));
        appendDebug("relay-heartbeat", envelope.sentAt);
      } catch (error) {
        appendDebug("relay-heartbeat-error", error.message);
      }
    }, websocketHeartbeatMs);
  }

  function stopRelayHeartbeat() {
    if (state.websocketHeartbeat.relayTimer) {
      window.clearInterval(state.websocketHeartbeat.relayTimer);
      state.websocketHeartbeat.relayTimer = null;
    }
  }

  function startXmppHeartbeat() {
    stopXmppHeartbeat();
    state.websocketHeartbeat.xmppTimer = window.setInterval(() => {
      if (state.xmppSocket?.readyState !== WebSocket.OPEN || !state.xmppSession?.authenticated) {
        return;
      }

      const id = createMessageId("ping");
      const xml = `<iq xmlns="jabber:client" type="get" id="${escapeXml(id)}"><ping xmlns="urn:xmpp:ping"/></iq>`;
      try {
        sendXmppStanza(xml, `ping ${id}`);
        appendDebug("xmpp-heartbeat", id);
      } catch (error) {
        appendDebug("xmpp-heartbeat-error", error.message);
      }
    }, websocketHeartbeatMs);
  }

  function stopXmppHeartbeat() {
    if (state.websocketHeartbeat.xmppTimer) {
      window.clearInterval(state.websocketHeartbeat.xmppTimer);
      state.websocketHeartbeat.xmppTimer = null;
    }
  }

  function connectRelay() {
    if (!state.accountReady || state.accountGateRequired) {
      requestLoginRequired(t("account.start_required", "Sign in or create an account before Teletyptel opens."), { forceLogin: true });
      return;
    }

    if (state.relaySocket && (state.relaySocket.readyState === WebSocket.CONNECTING || state.relaySocket.readyState === WebSocket.OPEN)) {
      return;
    }

    state.intentionalDisconnect = false;
    const relayUrl = normalizeLocalWebSocketUrlForCurrentHost(el.relayUrlInput.value.trim(), 8787);
    el.relayUrlInput.value = relayUrl;
    const socket = new WebSocket(relayUrl);
    state.relaySocket = socket;
    updateConnectButtonAvailability();
    setConnectionStatus(t("status.connecting_relay", "Connecting relay"), "warn");
    appendDebug("relay", "Connecting " + relayUrl);

    socket.addEventListener("open", () => {
      startRelayHeartbeat();
      setConnectionStatus(t("status.relay_connected", "Relay connected"), "good");
      setDefaultComposerState();
      updateConnectButtonAvailability();
      setInfrastructurePresence("online");
      sendPresence("online", { probe: true });
      flushClientLifecycleState("relay-open", true);
      syncAllConversationMessageState("relay-open");
      sendRttReset();
    });

    socket.addEventListener("message", (event) => {
      try {
        applyRelayEnvelope(JSON.parse(event.data));
      } catch (error) {
        appendDebug("relay-error", error.message);
      }
    });

    socket.addEventListener("close", () => {
      stopRelayHeartbeat();
      setConnectionStatus(t("status.relay_disconnected", "Relay disconnected"), "warn");
      state.relaySocket = null;
      state.clientLifecycle.relayLastSent = null;
      setAllContactPresence("offline");
      renderConversations();
      updateConnectButtonAvailability();
      updateComposerAvailability();
      if (scheduleMediaTransportReconnect("relay", "close")) {
        return;
      }

      if (!state.intentionalDisconnect && state.accountReady) {
        returnToLoginScreenAfterDisconnect(t("account.disconnected_login_required", "Connection closed. Sign in to continue."));
      }
    });

    socket.addEventListener("error", () => {
      setConnectionStatus(t("status.relay_error", "Relay error"), "danger");
      if (!state.intentionalDisconnect && state.accountReady) {
        window.setTimeout(() => {
          if (!state.relaySocket || state.relaySocket.readyState === WebSocket.CLOSED) {
            if (scheduleMediaTransportReconnect("relay", "error")) {
              return;
            }

            returnToLoginScreenAfterDisconnect(t("account.connection_failed_login_required", "Connection failed. Sign in to try again."));
          }
        }, 0);
      }
    });
  }

  function disconnectAll(message = null, options = {}) {
    if (message instanceof Event) {
      message = null;
    }

    state.intentionalDisconnect = true;
    clearTimeout(state.clientLifecycle.transientReconnectTimer);
    state.clientLifecycle.transientReconnectTimer = null;
    cleanupCall(true);

    if (state.location.live) {
      stopLocationSharing();
    }

    if (state.relaySocket) {
      sendPresence("offline");
      stopRelayHeartbeat();
      state.relaySocket.close();
    }

    closeXmppWebSocket();
    updateConnectButtonAvailability();
    returnToLoginScreenAfterDisconnect(message, options);
  }

  function returnToLoginScreenAfterDisconnect(message, options = {}) {
    state.intentionalDisconnect = true;
    clearTimeout(state.clientLifecycle.transientReconnectTimer);
    state.clientLifecycle.transientReconnectTimer = null;
    setAccountReady(false);
    state.clientLifecycle.relayLastSent = null;
    state.clientLifecycle.xmppLastSent = null;
    stopRelayHeartbeat();
    stopXmppHeartbeat();
    clearStoredXmppStreamManagement();
    state.previousText = "";
    state.activeConversationId = null;
    el.messageInput.value = "";
    syncComposerActionButtons();
    stopLocationWatchOnly();
    clearLocationAutoStopTimer();
    state.location.live = false;
    state.location.liveExpiresAt = null;

    if (!el.rememberPasswordToggle.checked) {
      el.passwordInput.value = "";
      el.dialogPasswordInput.value = "";
      if (state.account) {
        state.account.password = "";
      }
    }

    setAllContactPresence("offline");
    closeCallMenus();
    closeConversationContextMenu();
    renderConversations();
    renderActiveConversation();
    setConnectionStatus(t("status.disconnected", "Disconnected"), "warn");
    requestLoginRequired(message, options);
    updateConnectButtonAvailability();
  }

  function toggleCallMenu(menu, trigger) {
    if (!menu || !trigger || trigger.disabled) {
      return;
    }

    const shouldOpen = menu.hidden;
    closeAttachmentMenu();
    closeSmileyPicker();
    closeCallMenus();
    menu.hidden = !shouldOpen;
    trigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }

  function startCallFromMenu(mediaKind) {
    closeCallMenus();
    startCall(mediaKind);
  }

  function normalizeCallMode(mode) {
    const normalized = String(mode || "audio").toLowerCase();
    return callModeDefinitions[normalized] || callModeDefinitions.audio;
  }

  function callModeName(mediaKind, rttEnabled) {
    if (mediaKind === "video" && rttEnabled) {
      return "total";
    }

    return mediaKind === "video" ? "video" : "audio";
  }

  function closeCallMenusOnOutsideClick(event) {
    if (event.target instanceof Element && event.target.closest(".call-menu")) {
      return;
    }

    closeCallMenus();
  }

  function closeCallMenusOnEscape(event) {
    if (event.key === "Escape") {
      closeCallMenus();
    }
  }

  function showConversationContextMenu(event, conversation, anchor = null) {
    if (!canOpenConversationContextMenu(conversation)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    state.contextConversationId = conversation.id;
    updateConversationContextMenu();

    const anchorRect = anchor?.getBoundingClientRect();
    const fallbackX = anchorRect ? anchorRect.left + 18 : 12;
    const fallbackY = anchorRect ? anchorRect.top + 18 : 12;
    const x = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : fallbackX;
    const y = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : fallbackY;

    const menu = el.conversationContextMenu;
    menu.hidden = false;
    menu.style.left = "0px";
    menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    const focusTarget = [
      el.contextProfileButton,
      el.contextRoomAvatarButton,
      el.contextBlockButton
    ].find((button) => !button.hidden && !button.disabled) || menu;
    focusTarget.focus();
  }

  function closeConversationContextMenuOnOutsideClick(event) {
    if (event.target instanceof Element && event.target.closest("#conversationContextMenu")) {
      return;
    }

    closeConversationContextMenu();
  }

  function closeConversationContextMenuOnEscape(event) {
    if (event.key === "Escape") {
      closeConversationContextMenu();
    }
  }

  function closeConversationContextMenu() {
    state.contextConversationId = null;
    el.conversationContextMenu.hidden = true;
  }

  function openContextConversationProfile() {
    const conversation = state.conversations.find((item) => item.id === state.contextConversationId) ?? null;
    if (!canViewContactProfile(conversation)) {
      return;
    }

    closeConversationContextMenu();
    openContactProfileDialog(conversation);
  }

  function openActiveConversationAvatarProfile() {
    const conversation = activeConversation();
    if (canViewContactProfile(conversation)) {
      openContactProfileDialog(conversation);
      return;
    }

    openAccountDialog({ mode: "profile" });
  }

  function handleActiveConversationAvatarKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openActiveConversationAvatarProfile();
  }

  function openContactProfileDialog(conversation) {
    const requestId = ++state.contactProfileRequestId;
    renderContactProfileDialog(conversation, null);
    el.contactProfileStatus.textContent = state.account?.accountId
      ? t("profile.loading", "Loading server profile...")
      : t("profile.local_only", "Only local contact details are available.");
    el.contactProfileDialog.hidden = false;
    document.body.classList.add("modal-open");
    el.closeContactProfileButton.focus();

    loadPublicContactProfile(conversation)
      .then((profile) => {
        if (requestId !== state.contactProfileRequestId || el.contactProfileDialog.hidden) {
          return;
        }

        if (!profile) {
          el.contactProfileStatus.textContent = t("profile.local_only", "Only local contact details are available.");
          return;
        }

        applyPublicProfileToConversation(conversation, profile);
        renderContactProfileDialog(conversation, profile);
        el.contactProfileStatus.textContent = t("profile.loaded", "Profile loaded from server.");
      })
      .catch((error) => {
        appendDebug("profile-error", error.message || String(error));
        if (requestId === state.contactProfileRequestId && !el.contactProfileDialog.hidden) {
          el.contactProfileStatus.textContent = t("profile.local_only", "Only local contact details are available.");
        }
      });
  }

  function closeContactProfileDialog() {
    state.contactProfileRequestId++;
    el.contactProfileDialog.hidden = true;
    if (el.accountDialog.hidden && el.avatarCropDialog.hidden && el.locationShareDialog.hidden) {
      document.body.classList.remove("modal-open");
    }
  }

  function closeContactProfileDialogOnBackdrop(event) {
    if (event.target === el.contactProfileDialog) {
      closeContactProfileDialog();
    }
  }

  function closeContactProfileDialogOnEscape(event) {
    if (event.key === "Escape" && !el.contactProfileDialog.hidden) {
      closeContactProfileDialog();
    }
  }

  function renderContactProfileDialog(conversation, profile = null) {
    const name = profile?.displayName || conversationDisplayName(conversation) || displayNameForJid(conversation?.peer);
    const jid = bareJid(profile?.jid || conversation?.peer || "");
    const email = profile?.email || conversation?.email || jid || "-";
    const phone = profile?.phoneNumber || conversation?.phoneNumber || conversation?.phone || conversation?.telephone || "-";
    const avatarSource = {
      displayName: name,
      peer: jid,
      avatarDataUrl: profile?.avatarDataUrl || conversation?.avatarDataUrl || "",
      avatarColor: profile?.avatarColor || conversation?.avatarColor || avatarColorFor(`${name}:${jid}`)
    };

    el.contactProfileTitle.textContent = t("profile.contact_title", "Contact profile");
    el.contactProfileSubtitle.textContent = t("profile.contact_subtitle", "Contact details from this TeleTypTel account.");
    el.contactProfileName.textContent = name;
    el.contactProfilePresence.textContent = conversationMeta(conversation);
    el.contactProfileEmail.textContent = email;
    el.contactProfilePhone.textContent = phone;
    el.contactProfileJid.textContent = jid || "-";
    renderAvatarInto(el.contactProfileAvatar, avatarSource);
  }

  async function loadPublicContactProfile(conversation) {
    const accountId = state.account?.accountId || "";
    const lookupJid = bareJid(conversation?.peer || "");
    if (!accountId || !lookupJid || isInfrastructurePeer(lookupJid)) {
      return null;
    }

    const query = new URLSearchParams({ accountId, lookupJid });
    const response = await fetch(`${accountApiPath}?${query.toString()}`, {
      cache: "no-store"
    });
    if (response.status === 404 || response.status === 401) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`profile API returned ${response.status}`);
    }

    const payload = await response.json();
    return payload.ok && payload.profile ? payload.profile : null;
  }

  function ensurePublicProfileForConversation(conversation) {
    const jid = bareJid(conversation?.peer || "");
    if (!conversation || conversation.kind === "group" || !jid || isInfrastructurePeer(jid) || !state.account?.accountId) {
      return;
    }
    if (isValidAvatarDataUrl(conversation.avatarDataUrl) || state.publicProfileRequests.has(jid)) {
      return;
    }
    if (state.publicProfileCache.has(jid)) {
      const cached = state.publicProfileCache.get(jid);
      if (cached && conversation.publicProfileLoadedJid !== jid) {
        applyPublicProfileToConversation(conversation, cached, { render: false });
      }
      return;
    }

    state.publicProfileRequests.add(jid);
    loadPublicContactProfile(conversation)
      .then((profile) => {
        state.publicProfileCache.set(jid, profile || null);
        if (profile) {
          applyPublicProfileToConversation(conversation, profile);
        }
      })
      .catch((error) => appendDebug("profile-avatar-error", error.message || String(error)))
      .finally(() => state.publicProfileRequests.delete(jid));
  }

  function applyPublicProfileToConversation(conversation, profile, options = {}) {
    if (!conversation || !profile) {
      return;
    }

    const profileJid = bareJid(profile.jid || conversation.peer || "");
    if (profileJid) {
      state.publicProfileCache.set(profileJid, profile);
    }
    conversation.email = profile.email || conversation.email || "";
    conversation.phoneNumber = profile.phoneNumber || conversation.phoneNumber || "";
    if (isValidAvatarDataUrl(profile.avatarDataUrl)) {
      conversation.avatarDataUrl = profile.avatarDataUrl;
    }

    if (profile.avatarColor) {
      conversation.avatarColor = profile.avatarColor;
    }
    conversation.publicProfileLoadedJid = profileJid || bareJid(conversation.peer || "");

    if (options.render !== false) {
      renderConversations();
      if (conversation.id === state.activeConversationId) {
        renderActiveConversation();
      }
    }
  }

  function showMessageContextMenu(event, message, anchor = null) {
    if (!message?.id || message.draft) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    closeConversationContextMenu();
    state.contextMessage = {
      conversationId: activeConversation()?.id || state.activeConversationId,
      messageId: message.id
    };

    const canEdit = canEditMessage(message);
    const canDelete = !message.retracted;
    const canDownload = Boolean(message.attachment?.url);
    const canForward = canForwardMessage(message);
    el.messageContextEditButton.hidden = !canEdit;
    el.messageContextDeleteButton.hidden = !canDelete;
    el.messageContextDownloadButton.hidden = !canDownload;
    el.messageContextForwardButton.hidden = !canForward;

    if (!canEdit && !canDelete && !canDownload && !canForward) {
      closeMessageContextMenu();
      return;
    }

    const anchorRect = anchor?.getBoundingClientRect();
    const fallbackX = anchorRect ? anchorRect.left + 18 : 12;
    const fallbackY = anchorRect ? anchorRect.top + 18 : 12;
    const x = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : fallbackX;
    const y = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : fallbackY;

    const menu = el.messageContextMenu;
    menu.hidden = false;
    menu.style.left = "0px";
    menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.querySelector("button:not([hidden]):not(:disabled)")?.focus();
  }

  function closeMessageContextMenuOnOutsideClick(event) {
    if (event.target instanceof Element && event.target.closest("#messageContextMenu")) {
      return;
    }

    closeMessageContextMenu();
  }

  function closeMessageContextMenuOnEscape(event) {
    if (event.key === "Escape") {
      closeMessageContextMenu();
    }
  }

  function closeMessageContextMenu() {
    state.contextMessage = null;
    el.messageContextMenu.hidden = true;
  }

  function contextMessageTarget() {
    const reference = state.contextMessage;
    if (!reference?.conversationId || !reference.messageId) {
      return null;
    }

    const conversation = state.conversations.find((item) => item.id === reference.conversationId);
    const message = conversation?.messages.find((item) => item.id === reference.messageId);
    return conversation && message ? { conversation, message } : null;
  }

  function canEditMessage(message) {
    return Boolean(message
      && message.direction === "self"
      && !message.draft
      && !message.retracted
      && !message.attachment
      && !message.location
      && String(message.text ?? "").trim());
  }

  function canForwardMessage(message) {
    return Boolean(message
      && !message.draft
      && !message.retracted
      && (String(message.text ?? "").trim() || message.attachment || message.location));
  }

  function editContextMessage() {
    const target = contextMessageTarget();
    closeMessageContextMenu();
    if (!target || !canEditMessage(target.message)) {
      return;
    }

    if (target.conversation.id !== state.activeConversationId) {
      selectConversation(target.conversation);
    }
    startMessageEdit(target.message.id);
  }

  function deleteContextMessage() {
    const target = contextMessageTarget();
    closeMessageContextMenu();
    if (!target || target.message.retracted) {
      return;
    }

    if (target.message.direction === "self" && target.message.xmppId) {
      if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN) {
        const xml = createMessageRetractionStanza(target.conversation.peer, target.message.xmppId);
        sendXmppStanza(xml);
      } else if (state.relaySocket?.readyState === WebSocket.OPEN) {
        const envelope = createRelayEnvelope("message-delete", "", "", target.conversation.peer);
        envelope.targetMessageId = target.message.xmppId;
        envelope.messageId = createMessageId("delete");
        state.relaySocket.send(JSON.stringify(envelope));
        appendDebug("relay-out", JSON.stringify(redactEnvelopeForLog(envelope)));
      }
    }

    deleteHistoryMessage(target.message);
    target.conversation.messages = target.conversation.messages.filter((item) => item.id !== target.message.id);
    if (target.conversation.id === state.activeConversationId) {
      renderActiveConversation();
    }
    setConnectionStatus(t("status.message_deleted", "Message deleted."), "info");
  }

  function downloadContextMessageAttachment() {
    const target = contextMessageTarget();
    closeMessageContextMenu();
    if (!target?.message.attachment?.url) {
      return;
    }

    downloadAttachment(target.message.attachment);
  }

  function forwardContextMessage() {
    const target = contextMessageTarget();
    closeMessageContextMenu();
    if (!target || !canForwardMessage(target.message)) {
      return;
    }

    const destination = chooseForwardDestination(target.conversation);
    if (!destination) {
      return;
    }

    sendForwardedMessage(target.message, destination);
  }

  function chooseForwardDestination(sourceConversation) {
    const candidates = state.conversations
      .filter((conversation) => conversation.id !== sourceConversation.id)
      .filter((conversation) => !isOwnContact(conversation))
      .filter((conversation) => !isBlockedConversation(conversation));
    const hint = candidates
      .map((conversation) => `${conversation.name} <${conversation.peer}>`)
      .join("\n");
    const value = prompt(
      `${t("message.forward_to_prompt", "Forward to contact or JID:")}${hint ? `\n\n${hint}` : ""}`,
      candidates[0]?.peer || ""
    );
    const peer = String(value ?? "").trim();
    if (!peer) {
      return null;
    }

    return ensureConversationForPeer(peer, peer.includes("@conference.") ? "group" : "contact");
  }

  function sendForwardedMessage(message, destination) {
    const forwarded = createForwardedPayload(message);
    const outgoingId = createMessageId("fwd");

    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN) {
      const xml = createMessageStanza(forwarded.text, outgoingId, null, false, destination.peer);
      sendXmppStanza(xml);
      addMessage("self", forwarded.text, "forwarded", null, forwarded.attachment, destination.id, forwarded.location, outgoingId);
      setConnectionStatus(t("status.message_forwarded", "Message forwarded."), "info");
      return;
    }

    if (state.relaySocket?.readyState === WebSocket.OPEN) {
      const envelope = createRelayEnvelope("message", forwarded.text, "", destination.peer);
      envelope.messageId = outgoingId;
      envelope.forwarded = true;
      envelope.originalFrom = message.from || currentFromJid();
      if (forwarded.attachment) {
        envelope.attachment = forwarded.attachment;
      }
      if (forwarded.location) {
        envelope.location = forwarded.location;
      }
      state.relaySocket.send(JSON.stringify(envelope));
      appendDebug("relay-out", JSON.stringify(redactEnvelopeForLog(envelope)));
      addMessage("self", forwarded.text, "forwarded", null, forwarded.attachment, destination.id, forwarded.location, outgoingId);
      setConnectionStatus(t("status.message_forwarded", "Message forwarded."), "info");
      return;
    }

    showNotConnectedStatus();
  }

  function createForwardedPayload(message) {
    const prefix = t("message.forwarded_prefix", "Forwarded");
    const attachment = message.attachment ? { ...message.attachment } : null;
    const locationValue = message.location ? { ...message.location } : null;
    let text = String(message.text ?? "").trim();
    if (!text && attachment) {
      text = `${t("upload.shared_file", "Shared file")}: ${attachment.name || attachment.url}`;
    }
    if (attachment?.url) {
      const url = new URL(attachment.url, location.href).href;
      if (!text.includes(url)) {
        text = `${text}\n${url}`.trim();
      }
    }
    if (!text && locationValue) {
      text = t("location.shared_message", "Location shared.");
    }
    if (locationValue?.lat && locationValue?.lon) {
      const coordinates = `${locationValue.lat}, ${locationValue.lon}`;
      if (!text.includes(coordinates)) {
        text = `${text}\n${coordinates}`.trim();
      }
    }

    return {
      text: `${prefix}: ${text}`,
      attachment,
      location: locationValue
    };
  }

  function closeCallMenus() {
    // Call start is now direct icon buttons; kept as a harmless close hook for shared UI code.
  }

  function toggleAttachmentMenu(event) {
    event?.stopPropagation();
    if (el.attachmentMenuButton.disabled) {
      return;
    }

    const shouldOpen = el.attachmentMenuPanel.hidden;
    closeCallMenus();
    closeSmileyPicker();
    closeAttachmentMenu();
    el.attachmentMenuPanel.hidden = !shouldOpen;
    el.attachmentMenuButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }

  function closeAttachmentMenuOnOutsideClick(event) {
    if (event.target instanceof Element && event.target.closest(".attachment-menu")) {
      return;
    }

    closeAttachmentMenu();
  }

  function closeAttachmentMenuOnEscape(event) {
    if (event.key === "Escape") {
      closeAttachmentMenu();
    }
  }

  function closeAttachmentMenu() {
    el.attachmentMenuPanel.hidden = true;
    el.attachmentMenuButton.setAttribute("aria-expanded", "false");
  }

  function openAttachmentFilePicker(accept, capture) {
    closeAttachmentMenu();
    el.fileInput.value = "";
    el.fileInput.accept = accept;
    el.fileInput.multiple = !capture;
    if (capture) {
      el.fileInput.setAttribute("capture", capture);
    } else {
      el.fileInput.removeAttribute("capture");
    }

    el.fileInput.click();
  }

  function recordNewVideoMessage() {
    openVideoRecorderDialog();
  }

  function shareLocationFromAttachmentMenu() {
    closeAttachmentMenu();
    openLocationShareDialog().catch((error) => {
      state.location.error = error.message;
      setConnectionStatus(`${t("location.failed", "Location failed")}: ${error.message}`, "danger");
      refreshOpenTabPanel();
    });
  }

  async function openLocationShareDialog() {
    const conversation = activeConversation();
    if (!conversation) {
      setConnectionStatus(t("status.select_contact_first", "Select a contact first"), "warn");
      return;
    }

    if (isBlockedConversation(conversation)) {
      setConnectionStatus(t("status.contact_blocked_cannot_send", "This contact is blocked. Unblock to send messages."), "warn");
      return;
    }

    el.locationShareDialog.hidden = false;
    document.body.classList.add("modal-open");
    el.locationShareMap.hidden = true;
    el.locationShareMap.removeAttribute("src");
    el.confirmLocationShareButton.disabled = true;
    el.locationShareDurationInput.value = String(normalizeLocationLiveDurationMs(state.location.settings.liveDurationMs));
    el.locationShareStatus.textContent = t("location.requesting", "Requesting browser location...");
    const location = await requestBrowserLocation();
    renderOpenLocationDialog(location);
    el.confirmLocationShareButton.focus();
  }

  function renderOpenLocationDialog(location = state.location.current) {
    if (el.locationShareDialog.hidden || !location) {
      return;
    }

    el.locationShareStatus.textContent = [
      t("location.ready", "Location ready; share only when you choose it."),
      preferredMapProviderLabel()
    ].join(" - ");
    el.locationShareMap.src = locationMapEmbedHref(
      state.location.settings.mapProvider,
      location,
      16,
      { includeProviderMarker: true });
    el.locationShareMap.hidden = false;
    el.confirmLocationShareButton.disabled = false;
    el.locationShareDurationInput.value = String(normalizeLocationLiveDurationMs(state.location.settings.liveDurationMs));
  }

  async function shareLocationFromDialog() {
    el.confirmLocationShareButton.disabled = true;
    try {
      state.location.settings.liveDurationMs = normalizeLocationLiveDurationMs(el.locationShareDurationInput.value);
      saveLocationSettings();
      await startLiveLocationSharing();
      closeLocationShareDialog();
    } catch (error) {
      el.locationShareStatus.textContent = `${t("location.failed", "Location failed")}: ${error.message}`;
      el.confirmLocationShareButton.disabled = false;
    }
  }

  function closeLocationShareDialogOnBackdrop(event) {
    if (event.target === el.locationShareDialog) {
      closeLocationShareDialog();
    }
  }

  function closeLocationShareDialogOnEscape(event) {
    if (event.key === "Escape" && !el.locationShareDialog.hidden) {
      closeLocationShareDialog();
    }
  }

  function closeLocationShareDialog() {
    el.locationShareDialog.hidden = true;
    el.locationShareMap.removeAttribute("src");
    if (el.accountDialog.hidden) {
      document.body.classList.remove("modal-open");
    }
  }

  function showAttachmentPlaceholder(key) {
    closeAttachmentMenu();
    setConnectionStatus(
      t("attachment.not_ready", "{0} will be added later.").replace("{0}", t(key, key)),
      "warn");
  }

  async function toggleVoiceRecording(event) {
    event?.preventDefault();
    closeAttachmentMenu();
    closeSmileyPicker();

    if (state.voiceRecorder.recorder?.state === "recording") {
      stopVoiceRecording();
      return;
    }

    await startVoiceRecording();
  }

  async function startVoiceRecording() {
    if (!hasActiveConversation()) {
      setConnectionStatus(t("status.select_contact_first", "Select a contact first"), "warn");
      return;
    }

    if (!hasActiveMessageTransport()) {
      showNotConnectedStatus();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setConnectionStatus(t("voice.unsupported", "Voice recording is not available in this browser."), "danger");
      return;
    }

    clearRecordedVoiceMessage();
    try {
      const stream = await navigator.mediaDevices.getUserMedia(createAudioOnlyConstraints());
      const mimeType = preferredVoiceRecordingMimeType();
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      state.voiceRecorder.stream = stream;
      state.voiceRecorder.recorder = recorder;
      state.voiceRecorder.mimeType = recorder.mimeType || mimeType || "audio/webm";
      state.voiceRecorder.chunks = [];
      state.voiceRecorder.startedAt = Date.now();
      state.voiceRecorder.cancelled = false;
      recorder.addEventListener("dataavailable", (recordingEvent) => {
        if (recordingEvent.data && recordingEvent.data.size > 0) {
          state.voiceRecorder.chunks.push(recordingEvent.data);
        }
      });
      recorder.addEventListener("stop", prepareVoicePreview);
      recorder.start(250);
      updateVoiceRecordingUi(true);
      startVoiceLevelMeter(stream);
      el.voicePreviewPanel.hidden = false;
      el.voicePreviewPanel.classList.add("recording");
      el.voicePreviewPanel.classList.remove("preview-ready");
      el.voicePreviewAudio.hidden = true;
      el.sendVoiceMessageButton.disabled = false;
      updateVoicePreviewActionButtons("recording");
      el.voicePreviewStatus.textContent = voiceRecordingStatusText("00:00");
      state.voiceRecorder.timerId = window.setInterval(updateVoiceRecordingTimer, 500);
      updateVoiceRecordingTimer();
    } catch (error) {
      stopVoiceStream();
      updateVoiceRecordingUi(false);
      setConnectionStatus(`${t("voice.record_failed", "Could not start voice recording")}: ${error.message}`, "danger");
      appendDebug("voice-record-error", error.message || String(error));
    }
  }

  function stopVoiceRecording() {
    const recorder = state.voiceRecorder.recorder;
    if (recorder?.state === "recording") {
      recorder.stop();
    } else {
      stopVoiceStream();
    }
    clearVoiceTimer();
    stopVoiceLevelMeter();
    updateVoiceRecordingUi(false);
  }

  function prepareVoicePreview() {
    clearVoiceTimer();
    stopVoiceLevelMeter();
    stopVoiceStream();
    updateVoiceRecordingUi(false);
    if (state.voiceRecorder.cancelled) {
      clearRecordedVoiceMessage();
      return;
    }

    const chunks = state.voiceRecorder.chunks;
    if (!chunks.length) {
      setConnectionStatus(t("voice.empty", "No voice was recorded."), "warn");
      clearRecordedVoiceMessage();
      return;
    }

    const mimeType = state.voiceRecorder.mimeType || chunks[0]?.type || "audio/webm";
    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size <= 0) {
      setConnectionStatus(t("voice.empty", "No voice was recorded."), "warn");
      clearRecordedVoiceMessage();
      return;
    }

    state.voiceRecorder.blob = blob;
    state.voiceRecorder.objectUrl = URL.createObjectURL(blob);
    el.voicePreviewAudio.src = state.voiceRecorder.objectUrl;
    el.voicePreviewAudio.hidden = false;
    el.voicePreviewPanel.hidden = false;
    el.voicePreviewPanel.classList.remove("recording");
    el.voicePreviewPanel.classList.add("preview-ready");
    el.voicePreviewStatus.textContent = "";
    updateVoicePreviewActionButtons("preview");
    updatePreviewPlaybackButton("voice");
    setConnectionStatus(t("voice.preview_ready", "Voice message recorded. Listen, then send or cancel."), "warn");
    syncComposerActionButtons();
  }

  async function sendRecordedVoiceMessage() {
    if (state.voiceRecorder.recorder?.state === "recording") {
      stopVoiceRecording();
      return;
    }

    const blob = state.voiceRecorder.blob;
    if (!blob) {
      return;
    }

    if (!hasActiveMessageTransport()) {
      showNotConnectedStatus();
      return;
    }

    const mimeType = blob.type || state.voiceRecorder.mimeType || "audio/webm";
    const fileName = `voice-message-${voiceTimestamp()}.${voiceFileExtension(mimeType)}`;
    const file = new File([blob], fileName, { type: mimeType });
    el.sendVoiceMessageButton.disabled = true;
    el.cancelVoiceMessageButton.disabled = true;
    el.playVoiceMessageButton.disabled = true;
    el.rerecordVoiceMessageButton.disabled = true;
    el.voicePreviewStatus.textContent = t("voice.uploading", "Sending voice message...");
    try {
      await uploadOneFile(file, { throwOnError: true });
      clearRecordedVoiceMessage();
    } catch (error) {
      el.voicePreviewStatus.textContent = "";
      setConnectionStatus(`${t("upload.failed", "Upload failed")}: ${file.name}`, "danger");
      appendDebug("voice-upload-error", error.message || String(error));
    } finally {
      el.sendVoiceMessageButton.disabled = false;
      el.cancelVoiceMessageButton.disabled = false;
      el.playVoiceMessageButton.disabled = false;
      el.rerecordVoiceMessageButton.disabled = false;
    }
  }

  async function rerecordVoiceMessage() {
    if (state.voiceRecorder.recorder?.state === "recording") {
      stopVoiceRecording();
      return;
    }

    clearRecordedVoiceMessage();
    await startVoiceRecording();
  }

  function cancelVoiceMessage() {
    if (state.voiceRecorder.recorder?.state === "recording") {
      state.voiceRecorder.cancelled = true;
      stopVoiceRecording();
      setConnectionStatus(t("voice.cancelled", "Voice message cancelled."), "warn");
      return;
    }
    clearRecordedVoiceMessage();
    setConnectionStatus(t("voice.cancelled", "Voice message cancelled."), "warn");
  }

  function clearRecordedVoiceMessage() {
    clearVoiceTimer();
    stopVoiceStream();
    if (state.voiceRecorder.objectUrl) {
      URL.revokeObjectURL(state.voiceRecorder.objectUrl);
    }
    state.voiceRecorder.recorder = null;
    state.voiceRecorder.chunks = [];
    state.voiceRecorder.blob = null;
    state.voiceRecorder.objectUrl = "";
    state.voiceRecorder.mimeType = "";
    state.voiceRecorder.startedAt = 0;
    stopVoiceLevelMeter();
    state.voiceRecorder.cancelled = false;
    el.voicePreviewAudio.removeAttribute("src");
    el.voicePreviewAudio.load();
    el.voicePreviewAudio.hidden = false;
    el.voicePreviewPanel.hidden = true;
    el.voicePreviewPanel.classList.remove("recording");
    el.voicePreviewPanel.classList.remove("preview-ready");
    updateVoicePreviewActionButtons("preview");
    updatePreviewPlaybackButton("voice");
    updateVoiceRecordingUi(false);
    syncComposerActionButtons();
  }

  function updateVoiceRecordingUi(recording) {
    el.voiceMessageButton.classList.toggle("recording", recording);
    el.voiceMessageButton.setAttribute("aria-pressed", recording ? "true" : "false");
    const icon = el.voiceMessageButton.querySelector("[data-icon]");
    if (icon) {
      icon.dataset.icon = recording ? "micOff" : "mic";
      icon.dataset.renderedIcon = "";
      renderMaterialIcons(el.voiceMessageButton);
    }
    const label = recording
      ? t("voice.stop_recording", "Stop recording")
      : t("attachment.voice_message", "Voice message");
    el.voiceMessageButton.title = label;
    el.voiceMessageButton.setAttribute("aria-label", label);
    syncComposerActionButtons();
  }

  function updateVoicePreviewActionButtons(mode) {
    const recording = mode === "recording";
    const primaryLabel = recording
      ? t("voice.stop_recording", "Stop recording")
      : t("voice.send", "Send voice message");
    const primaryIcon = el.sendVoiceMessageButton.querySelector("[data-icon]");
    if (primaryIcon) {
      primaryIcon.dataset.icon = recording ? "stop" : "send";
      primaryIcon.dataset.renderedIcon = "";
    }

    const primaryText = el.sendVoiceMessageButton.querySelector(".sr-only");
    if (primaryText) {
      primaryText.textContent = primaryLabel;
    }

    el.rerecordVoiceMessageButton.hidden = recording;
    el.rerecordVoiceMessageButton.disabled = recording;
    updatePreviewPlaybackButton("voice");
    el.sendVoiceMessageButton.title = primaryLabel;
    el.sendVoiceMessageButton.setAttribute("aria-label", primaryLabel);
    el.sendVoiceMessageButton.classList.toggle("recording", recording);
    renderMaterialIcons(el.voicePreviewPanel);
  }

  function updateVoiceRecordingTimer() {
    if (!state.voiceRecorder.startedAt) {
      return;
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - state.voiceRecorder.startedAt) / 1000));
    const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
    const seconds = String(elapsedSeconds % 60).padStart(2, "0");
    const status = voiceRecordingStatusText(`${minutes}:${seconds}`);
    el.voicePreviewStatus.textContent = status;
    setConnectionStatus(status, "warn");
  }

  function voiceRecordingStatusText(timeText) {
    return document.body.classList.contains("viewport-phone")
      ? timeText
      : t("voice.recording", "Recording voice message {0}").replace("{0}", timeText);
  }

  function clearVoiceTimer() {
    if (state.voiceRecorder.timerId !== null) {
      window.clearInterval(state.voiceRecorder.timerId);
    }
    state.voiceRecorder.timerId = null;
  }

  function startVoiceLevelMeter(stream) {
    stopVoiceLevelMeter();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    try {
      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      state.voiceRecorder.audioContext = audioContext;
      state.voiceRecorder.analyser = analyser;
      state.voiceRecorder.meterData = new Uint8Array(analyser.fftSize);
      animateVoiceLevelMeter();
    } catch (error) {
      appendDebug("voice-meter-error", error.message || String(error));
    }
  }

  function animateVoiceLevelMeter() {
    const analyser = state.voiceRecorder.analyser;
    const data = state.voiceRecorder.meterData;
    if (!analyser || !data) {
      return;
    }

    analyser.getByteTimeDomainData(data);
    updateVoiceLevelMeter(data);
    state.voiceRecorder.meterAnimationId = window.requestAnimationFrame(animateVoiceLevelMeter);
  }

  function updateVoiceLevelMeter(data) {
    const group = el.voiceRecordingWaveLine;
    if (!group) {
      return;
    }

    const width = 180;
    const height = 32;
    const middle = height / 2;
    const barCount = 54;
    const gap = 1.6;
    const barWidth = (width - gap * (barCount - 1)) / barCount;
    if (!data || data.length === 0) {
      state.voiceRecorder.waveLevels = Array.from({ length: barCount }, () => 0.08);
      renderVoiceWaveBars(group, state.voiceRecorder.waveLevels, width, height, barWidth, gap);
      return;
    }

    let sum = 0;
    for (const sample of data) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }

    const rms = Math.sqrt(sum / data.length);
    const level = Math.min(1, Math.max(0.04, rms * 7.2));
    const previous = state.voiceRecorder.waveLevels.length
      ? state.voiceRecorder.waveLevels
      : Array.from({ length: barCount }, () => 0.08);
    const levels = previous.slice(1);
    const ripple = 0.72 + Math.sin(Date.now() / 95) * 0.18 + Math.random() * 0.1;
    levels.push(Math.min(1, Math.max(0.06, level * ripple)));
    state.voiceRecorder.waveLevels = levels;
    renderVoiceWaveBars(group, levels, width, height, barWidth, gap);
  }

  function renderVoiceWaveBars(group, levels, width, height, barWidth, gap) {
    const middle = height / 2;
    const barCount = levels.length;
    while (group.children.length < barCount) {
      group.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "rect"));
    }
    while (group.children.length > barCount) {
      group.removeChild(group.lastElementChild);
    }

    levels.forEach((level, index) => {
      const rect = group.children[index];
      const shaped = Math.pow(Math.max(0.04, Math.min(1, level)), 0.72);
      const barHeight = Math.max(2.4, shaped * (height - 4));
      const x = index * (barWidth + gap);
      const y = middle - barHeight / 2;
      rect.setAttribute("x", x.toFixed(1));
      rect.setAttribute("y", y.toFixed(1));
      rect.setAttribute("width", Math.max(1.2, barWidth).toFixed(1));
      rect.setAttribute("height", barHeight.toFixed(1));
      rect.setAttribute("opacity", (0.38 + shaped * 0.62).toFixed(2));
    });
  }

  function stopVoiceLevelMeter() {
    if (state.voiceRecorder.meterAnimationId !== null) {
      window.cancelAnimationFrame(state.voiceRecorder.meterAnimationId);
    }

    state.voiceRecorder.meterAnimationId = null;
    state.voiceRecorder.analyser = null;
    state.voiceRecorder.meterData = null;
    if (state.voiceRecorder.audioContext) {
      state.voiceRecorder.audioContext.close().catch(() => {});
    }

    state.voiceRecorder.audioContext = null;
    updateVoiceLevelMeter(null);
  }

  function stopVoiceStream() {
    if (state.voiceRecorder.stream) {
      stopStream(state.voiceRecorder.stream);
    }
    state.voiceRecorder.stream = null;
  }

  async function startVideoRecording() {
    closeAttachmentMenu();
    closeSmileyPicker();
    if (!hasActiveConversation()) {
      setConnectionStatus(t("status.select_contact_first", "Select a contact first"), "warn");
      return;
    }

    if (!hasActiveMessageTransport()) {
      showNotConnectedStatus();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setConnectionStatus(t("video.unsupported", "Video recording is not available in this browser."), "danger");
      return;
    }

    clearRecordedVoiceMessage();
    if (state.videoRecorder.blob || state.videoRecorder.objectUrl) {
      clearRecordedVideoMessage();
      openVideoRecorderDialog({ reset: false });
    }
    try {
      const stream = state.videoRecorder.previewStream || await requestVideoMessageStream();
      state.videoRecorder.stream = stream;

      const mimeType = preferredVideoRecordingMimeType();
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      if (state.videoRecorder.previewStream === stream) {
        state.videoRecorder.previewStream = null;
      }
      state.videoRecorder.recorder = recorder;
      state.videoRecorder.mimeType = recorder.mimeType || mimeType || "video/webm";
      state.videoRecorder.chunks = [];
      state.videoRecorder.startedAt = Date.now();
      state.videoRecorder.cancelled = false;
      recorder.addEventListener("dataavailable", (recordingEvent) => {
        if (recordingEvent.data && recordingEvent.data.size > 0) {
          state.videoRecorder.chunks.push(recordingEvent.data);
        }
      });
      recorder.addEventListener("stop", prepareVideoPreview);
      el.videoPreviewVideo.muted = true;
      el.videoPreviewVideo.controls = false;
      el.videoPreviewVideo.srcObject = stream;
      el.videoPreviewDialogVideo.srcObject = stream;
      el.videoPreviewDialogVideo.removeAttribute("src");
      el.videoPreviewDialogVideo.muted = true;
      el.videoPreviewDialogVideo.controls = false;
      el.videoPreviewDialogVideo.autoplay = true;
      el.videoPreviewDialogVideo.playsInline = true;
      el.videoPreviewDialogVideo.play?.().catch((error) => appendDebug("video-dialog-live-preview", error.message || String(error)));
      el.videoPreviewDialog.hidden = false;
      document.body.classList.add("modal-open");
      el.videoPreviewPanel.hidden = true;
      el.openVideoPreviewDialogButton.hidden = true;
      el.videoPreviewPanel.classList.add("recording");
      el.videoPreviewPanel.classList.remove("preview-ready");
      updateVideoPreviewActionButtons("recording");
      updateVideoDialogActionButtons("recording");
      recorder.start(500);
      updateVideoRecordingUi(true);
      el.videoPreviewStatus.textContent = t("video.recording", "Recording video message {0}").replace("{0}", "00:00");
      state.videoRecorder.timerId = window.setInterval(updateVideoRecordingTimer, 500);
      updateVideoRecordingTimer();
    } catch (error) {
      stopVideoStream();
      stopVideoPreviewStream();
      updateVideoRecordingUi(false);
      updateVideoDialogActionButtons("setup");
      setConnectionStatus(`${t("video.record_failed", "Could not start video recording")}: ${error.message}`, "danger");
      appendDebug("video-record-error", error.message || String(error));
    }
  }

  async function requestVideoMessageStream() {
    try {
      return await navigator.mediaDevices.getUserMedia(createVideoMessageConstraints());
    } catch {
      return await navigator.mediaDevices.getUserMedia(createVideoMessageConstraints(true));
    }
  }

  async function startVideoDialogPreview() {
    if (state.videoRecorder.blob || state.videoRecorder.objectUrl || state.videoRecorder.recorder?.state === "recording") {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setConnectionStatus(mediaAccessUnavailableMessage(), "danger");
      return;
    }

    stopVideoPreviewStream();
    try {
      markMediaCaptureTransition("video-dialog-preview", 12000);
      const stream = await requestVideoMessageStream();
      if (el.videoPreviewDialog.hidden
        || state.videoRecorder.blob
        || state.videoRecorder.recorder?.state === "recording") {
        stopStream(stream);
        return;
      }

      state.videoRecorder.previewStream = stream;
      el.videoPreviewDialogVideo.pause();
      el.videoPreviewDialogVideo.removeAttribute("src");
      el.videoPreviewDialogVideo.srcObject = stream;
      el.videoPreviewDialogVideo.muted = true;
      el.videoPreviewDialogVideo.defaultMuted = true;
      el.videoPreviewDialogVideo.controls = false;
      el.videoPreviewDialogVideo.autoplay = true;
      el.videoPreviewDialogVideo.playsInline = true;
      await el.videoPreviewDialogVideo.play?.();
      await refreshMediaDevices(false);
    } catch (error) {
      stopVideoPreviewStream();
      setConnectionStatus(`${t("media.preview_failed", "Preview failed")}: ${error.message}`, "danger");
      appendDebug("video-dialog-preview-error", error.message || String(error));
    }
  }

  function stopVideoRecording() {
    const recorder = state.videoRecorder.recorder;
    if (recorder?.state === "recording") {
      recorder.stop();
    } else {
      stopVideoStream();
    }
    clearVideoTimer();
    updateVideoRecordingUi(false);
  }

  function prepareVideoPreview() {
    clearVideoTimer();
    stopVideoStream();
    updateVideoRecordingUi(false);
    if (state.videoRecorder.cancelled) {
      clearRecordedVideoMessage();
      return;
    }

    const chunks = state.videoRecorder.chunks;
    if (!chunks.length) {
      setConnectionStatus(t("video.empty", "No video was recorded."), "warn");
      clearRecordedVideoMessage();
      return;
    }

    const mimeType = state.videoRecorder.mimeType || chunks[0]?.type || "video/webm";
    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size <= 0) {
      setConnectionStatus(t("video.empty", "No video was recorded."), "warn");
      clearRecordedVideoMessage();
      return;
    }

    state.videoRecorder.blob = blob;
    state.videoRecorder.objectUrl = URL.createObjectURL(blob);
    el.videoPreviewVideo.srcObject = null;
    el.videoPreviewVideo.src = state.videoRecorder.objectUrl;
    el.videoPreviewVideo.muted = false;
    el.videoPreviewVideo.controls = false;
    el.videoPreviewDialogVideo.srcObject = null;
    el.videoPreviewDialogVideo.src = state.videoRecorder.objectUrl;
    el.videoPreviewDialogVideo.currentTime = 0;
    el.videoPreviewDialogVideo.muted = false;
    el.videoPreviewDialogVideo.controls = true;
    if (el.videoPreviewDialogTitle) {
      el.videoPreviewDialogTitle.textContent = t("video.preview_title", "Video preview");
    }
    el.openVideoPreviewDialogButton.hidden = false;
    el.videoPreviewPanel.hidden = false;
    el.videoPreviewPanel.classList.remove("recording");
    el.videoPreviewPanel.classList.add("preview-ready");
    el.videoPreviewStatus.textContent = t("video.preview_ready", "Video message recorded. Review, then send or cancel.");
    updateVideoPreviewActionButtons("preview");
    updateVideoDialogActionButtons("preview");
    updatePreviewPlaybackButton("video");
    setConnectionStatus(t("video.preview_ready", "Video message recorded. Review, then send or cancel."), "warn");
    syncComposerActionButtons();
  }

  async function sendRecordedVideoMessage() {
    if (state.videoRecorder.recorder?.state === "recording") {
      stopVideoRecording();
      return;
    }

    const blob = state.videoRecorder.blob;
    if (!blob) {
      return;
    }

    if (!hasActiveMessageTransport()) {
      showNotConnectedStatus();
      return;
    }

    const mimeType = blob.type || state.videoRecorder.mimeType || "video/webm";
    const fileName = `video-message-${voiceTimestamp()}.${videoFileExtension(mimeType)}`;
    const file = new File([blob], fileName, { type: mimeType });
    el.sendVideoMessageButton.disabled = true;
    el.cancelVideoMessageButton.disabled = true;
    el.playVideoMessageButton.disabled = true;
    el.rerecordVideoMessageButton.disabled = true;
    el.dialogSendVideoMessageButton.disabled = true;
    el.dialogCancelVideoMessageButton.disabled = true;
    el.dialogRerecordVideoMessageButton.disabled = true;
    el.videoPreviewStatus.textContent = t("video.uploading", "Sending video message...");
    try {
      await uploadOneFile(file, { throwOnError: true });
      clearRecordedVideoMessage();
    } catch (error) {
      el.videoPreviewStatus.textContent = "";
      setConnectionStatus(`${t("upload.failed", "Upload failed")}: ${file.name}`, "danger");
      appendDebug("video-upload-error", error.message || String(error));
    } finally {
      el.sendVideoMessageButton.disabled = false;
      el.cancelVideoMessageButton.disabled = false;
      el.playVideoMessageButton.disabled = false;
      el.rerecordVideoMessageButton.disabled = false;
      el.dialogSendVideoMessageButton.disabled = false;
      el.dialogCancelVideoMessageButton.disabled = false;
      el.dialogRerecordVideoMessageButton.disabled = false;
    }
  }

  async function rerecordVideoMessage() {
    if (state.videoRecorder.recorder?.state === "recording") {
      stopVideoRecording();
      return;
    }

    clearRecordedVideoMessage();
    openVideoRecorderDialog({ reset: false });
  }

  function cancelVideoMessage() {
    if (state.videoRecorder.recorder?.state === "recording") {
      state.videoRecorder.cancelled = true;
      stopVideoRecording();
      setConnectionStatus(t("video.cancelled", "Video message cancelled."), "warn");
      return;
    }
    clearRecordedVideoMessage();
    setConnectionStatus(t("video.cancelled", "Video message cancelled."), "warn");
  }

  function clearRecordedVideoMessage() {
    clearVideoTimer();
    stopVideoStream();
    stopVideoPreviewStream();
    if (state.videoRecorder.objectUrl) {
      URL.revokeObjectURL(state.videoRecorder.objectUrl);
    }
    state.videoRecorder.recorder = null;
    state.videoRecorder.chunks = [];
    state.videoRecorder.blob = null;
    state.videoRecorder.objectUrl = "";
    state.videoRecorder.mimeType = "";
    state.videoRecorder.startedAt = 0;
    state.videoRecorder.cancelled = false;
    el.videoPreviewVideo.pause();
    el.videoPreviewVideo.srcObject = null;
    el.videoPreviewVideo.removeAttribute("src");
    el.videoPreviewVideo.load();
    el.videoPreviewDialogVideo.pause();
    el.videoPreviewDialog.hidden = true;
    document.body.classList.remove("modal-open");
    el.videoPreviewDialogVideo.srcObject = null;
    el.videoPreviewDialogVideo.removeAttribute("src");
    el.videoPreviewDialogVideo.load();
    if (el.videoPreviewDialogTitle) {
      el.videoPreviewDialogTitle.textContent = t("video.preview_title", "Video preview");
    }
    el.videoPreviewVideo.muted = true;
    el.videoPreviewVideo.controls = false;
    el.openVideoPreviewDialogButton.hidden = true;
    el.videoPreviewPanel.hidden = true;
    el.videoPreviewPanel.classList.remove("recording");
    el.videoPreviewPanel.classList.remove("preview-ready");
    updateVideoPreviewActionButtons("preview");
    updateVideoDialogActionButtons("setup");
    updatePreviewPlaybackButton("video");
    updateVideoRecordingUi(false);
    syncComposerActionButtons();
  }

  function updateVideoRecordingUi(recording) {
    el.videoMessageButton.classList.toggle("recording", recording);
    el.videoMessageButton.setAttribute("aria-pressed", recording ? "true" : "false");
    el.videoRecorderQualityInput.disabled = recording;
    if (el.videoRecorderQualityButton) {
      el.videoRecorderQualityButton.disabled = recording;
    }
    if (el.videoRecorderCameraButton) {
      el.videoRecorderCameraButton.disabled = recording;
    }
    if (recording) {
      closeVideoRecorderQualityMenu();
      closeVideoRecorderCameraMenu();
    }
    const icon = el.videoMessageButton.querySelector("[data-icon]");
    if (icon) {
      icon.dataset.icon = recording ? "videocamOff" : "videocam";
      icon.dataset.renderedIcon = "";
      renderMaterialIcons(el.videoMessageButton);
    }
    const label = recording
      ? t("video.stop_recording", "Stop recording")
      : t("attachment.video_message", "Record new video");
    el.videoMessageButton.title = label;
    el.videoMessageButton.setAttribute("aria-label", label);
    syncComposerActionButtons();
  }

  function updateVideoPreviewActionButtons(mode) {
    const recording = mode === "recording";
    const primaryLabel = recording
      ? t("video.stop_recording", "Stop recording")
      : t("video.send", "Send video message");
    const primaryIcon = el.sendVideoMessageButton.querySelector("[data-icon]");
    if (primaryIcon) {
      primaryIcon.dataset.icon = recording ? "stop" : "send";
      primaryIcon.dataset.renderedIcon = "";
    }
    const primaryText = el.sendVideoMessageButton.querySelector(".sr-only");
    if (primaryText) {
      primaryText.textContent = primaryLabel;
    }
    el.rerecordVideoMessageButton.hidden = recording;
    el.rerecordVideoMessageButton.disabled = recording;
    updatePreviewPlaybackButton("video");
    el.sendVideoMessageButton.title = primaryLabel;
    el.sendVideoMessageButton.setAttribute("aria-label", primaryLabel);
    el.sendVideoMessageButton.classList.toggle("recording", recording);
    renderMaterialIcons(el.videoPreviewPanel);
  }

  function updateVideoRecordingTimer() {
    if (!state.videoRecorder.startedAt) {
      return;
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - state.videoRecorder.startedAt) / 1000));
    const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
    const seconds = String(elapsedSeconds % 60).padStart(2, "0");
    const status = t("video.recording", "Recording video message {0}").replace("{0}", `${minutes}:${seconds}`);
    el.videoPreviewStatus.textContent = status;
    if (!el.videoPreviewDialog.hidden) {
      if (el.videoPreviewDialogTitle) {
        el.videoPreviewDialogTitle.textContent = status;
      }
    }
    setConnectionStatus(status, "warn");
  }

  async function togglePreviewPlayback(kind) {
    const media = previewPlaybackElement(kind);
    if (!media || !previewPlaybackBlob(kind)) {
      return;
    }

    try {
      if (kind === "video" && el.videoPreviewDialog.hidden) {
        openVideoPreviewDialog();
      }
      if (media.paused || media.ended) {
        if (media.ended) {
          media.currentTime = 0;
        }
        await media.play();
      } else {
        media.pause();
      }
    } catch (error) {
      appendDebug(`${kind}-preview-playback`, error.message || String(error));
      setConnectionStatus(t("media.play_failed", "Could not play media preview."), "warn");
    } finally {
      updatePreviewPlaybackButton(kind);
    }
  }

  function previewPlaybackElement(kind) {
    return kind === "video" ? el.videoPreviewDialogVideo : el.voicePreviewAudio;
  }

  function previewPlaybackButton(kind) {
    return kind === "video" ? el.playVideoMessageButton : el.playVoiceMessageButton;
  }

  function previewPlaybackBlob(kind) {
    return kind === "video" ? state.videoRecorder.blob : state.voiceRecorder.blob;
  }

  function previewRecordingActive(kind) {
    return kind === "video"
      ? state.videoRecorder.recorder?.state === "recording"
      : state.voiceRecorder.recorder?.state === "recording";
  }

  function updatePreviewPlaybackButton(kind) {
    const button = previewPlaybackButton(kind);
    const media = previewPlaybackElement(kind);
    if (!button || !media) {
      return;
    }
    if (kind === "voice") {
      button.hidden = true;
      button.disabled = true;
      return;
    }

    const available = Boolean(previewPlaybackBlob(kind)) && !previewRecordingActive(kind);
    button.hidden = !available;
    button.disabled = !available;
    const playing = available && !media.paused && !media.ended;
    const label = playing
      ? t("media.pause", "Pause")
      : t("media.play", "Play");
    const icon = button.querySelector("[data-icon]");
    if (icon) {
      icon.dataset.icon = playing ? "pause" : "playArrow";
      icon.dataset.renderedIcon = "";
    }
    const text = button.querySelector(".sr-only");
    if (text) {
      text.textContent = label;
    }
    button.title = label;
    button.setAttribute("aria-label", label);
    renderMaterialIcons(button);
  }

  function clearVideoTimer() {
    if (state.videoRecorder.timerId !== null) {
      window.clearInterval(state.videoRecorder.timerId);
    }
    state.videoRecorder.timerId = null;
  }

  function stopVideoStream() {
    if (state.videoRecorder.stream) {
      stopStream(state.videoRecorder.stream);
    }
    state.videoRecorder.stream = null;
  }

  function stopVideoPreviewStream() {
    if (state.videoRecorder.previewStream) {
      stopStream(state.videoRecorder.previewStream);
    }
    state.videoRecorder.previewStream = null;
  }

  function preferredVoiceRecordingMimeType() {
    const supportedTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4"
    ];
    return supportedTypes.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
  }

  function preferredVideoRecordingMimeType() {
    const supportedTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4"
    ];
    return supportedTypes.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
  }

  function videoFileExtension(mimeType) {
    const normalized = String(mimeType || "").toLowerCase();
    if (normalized.includes("mp4")) {
      return "mp4";
    }
    if (normalized.includes("ogg") || normalized.includes("ogv")) {
      return "ogv";
    }
    return "webm";
  }

  function voiceFileExtension(mimeType) {
    const normalized = String(mimeType || "").toLowerCase();
    if (normalized.includes("ogg")) {
      return "ogg";
    }
    if (normalized.includes("mp4") || normalized.includes("m4a")) {
      return "m4a";
    }
    return "webm";
  }

  function voiceTimestamp() {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  }

  function toggleSmileyPicker(event) {
    event?.stopPropagation();
    if (el.emojiButton.disabled) {
      return;
    }

    const shouldOpen = el.smileyPickerPanel.hidden;
    closeCallMenus();
    closeAttachmentMenu();
    closeSmileyPicker();
    state.smileyPickerMode = "composer";
    el.smileyPickerPanel.classList.remove("reaction-mode");
    el.smileyPickerPanel.hidden = !shouldOpen;
    el.emojiButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    el.smileyPickerPanel.style.left = "";
    el.smileyPickerPanel.style.top = "";
    syncEmojiButtonState();
  }

  function closeSmileyPickerOnOutsideClick(event) {
    if (event.target instanceof Element && event.target.closest(".smiley-menu, .message-reaction-picker, .message-reaction-button")) {
      return;
    }

    closeSmileyPicker();
  }

  function closeSmileyPickerOnEscape(event) {
    if (event.key === "Escape") {
      closeSmileyPicker();
    }
  }

  function closeSmileyPicker() {
    el.smileyPickerPanel.hidden = true;
    el.emojiButton.setAttribute("aria-expanded", "false");
    state.smileyPickerMode = "composer";
    el.smileyPickerPanel.classList.remove("reaction-mode");
    el.smileyPickerPanel.style.left = "";
    el.smileyPickerPanel.style.top = "";
    syncEmojiButtonState();
  }

  function handleSmileyPickerClick(event) {
    const button = event.target instanceof Element
      ? event.target.closest("[data-smiley-code]")
      : null;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    if (state.smileyPickerMode === "reaction") {
      reactWithSmileyCode(button.dataset.smileyCode ?? "");
      closeMessageReactionPicker();
      closeSmileyPicker();
      return;
    }

    insertSmileyCode(button.dataset.smileyCode ?? "");
    closeSmileyPicker();
  }

  function insertSmileyCode(code) {
    if (!code) {
      return;
    }

    const input = el.messageInput;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const prefix = before.length > 0 && !/\s$/.test(before) ? " " : "";
    const suffix = after.length === 0 || !/^\s/.test(after) ? " " : "";
    const insertion = `${prefix}${code}${suffix}`;

    input.value = `${before}${insertion}${after}`;
    const cursor = before.length + insertion.length;
    input.setSelectionRange(cursor, cursor);
    el.messageInput.focus();
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function syncEmojiButtonState() {
    el.emojiButton.classList.toggle("selected", !el.smileyPickerPanel.hidden);
  }

  function syncRttToolbarState() {
    const liveRttEnabled = el.rttToggle.checked;
    const hasConversation = hasActiveConversation();
    const blocked = isActiveConversationBlocked();
    el.resetRttButton.hidden = !liveRttEnabled;
    el.enableRttButton.hidden = liveRttEnabled;
    el.resetRttButton.disabled = !hasConversation || blocked;
    el.enableRttButton.disabled = blocked;
    el.resetRttButton.classList.toggle("selected", liveRttEnabled);
    el.enableRttButton.classList.toggle("selected", false);
  }

  function enableLiveRttFromToolbar() {
    el.rttToggle.checked = true;
    if (state.account) {
      state.account.liveRttEnabled = true;
    }
    state.previousText = "";
    syncRttToolbarState();
    updateComposerAvailability();
    if (hasActiveConversation() && (activeJingleRttSyncCall() || isRelayConnected())) {
      sendRttReset();
    }
  }

  function setCallButtonsDisabled(disabled) {
    el.startAudioCallOption.disabled = disabled;
    el.startVideoCallOption.disabled = disabled;
    el.startTotalCallOption.disabled = disabled;
    if (disabled) {
      closeCallMenus();
    }
  }

  function connectXmppWebSocket() {
    if (state.xmppSocket && state.xmppSocket.readyState === WebSocket.OPEN) {
      return;
    }

    state.intentionalDisconnect = false;
    const url = normalizeXmppWebSocketUrl(normalizeLocalXmppWebSocketUrlForCurrentHost(el.xmppUrlInput.value.trim()));
    el.xmppUrlInput.value = url;
    const socket = new WebSocket(url, "xmpp");
    state.xmppSocket = socket;
    state.xmppSession = createXmppSession();
    setMode("xmpp");
    appendDebug("xmpp", "Connecting " + url);

    socket.addEventListener("open", () => {
      el.xmppOpenButton.disabled = true;
      el.xmppCloseButton.disabled = false;
      setDefaultComposerState();
      updateComposerAvailability();
      sendXmppOpenFrame();
    });

    socket.addEventListener("message", (event) => {
      appendDebug("S", event.data);
      if (String(event.data).includes("urn:xmpp:csi:0")) {
        flushClientLifecycleState("xmpp-csi-feature", true);
      }
      handleXmppIncomingFrame(event.data);
    });

    socket.addEventListener("close", () => {
      stopXmppHeartbeat();
      window.clearTimeout(state.xmppSession?.streamManagement?.fallbackTimer);
      el.xmppOpenButton.disabled = false;
      el.xmppCloseButton.disabled = true;
      const wasReady = state.accountReady;
      state.xmppSocket = null;
      state.xmppSession = null;
      state.clientLifecycle.xmppLastSent = null;
      appendDebug("xmpp", "Closed");
      updateComposerAvailability();
      updateConnectButtonAvailability();
      if (scheduleMediaTransportReconnect("xmpp", "close")) {
        return;
      }

      if (!state.intentionalDisconnect && wasReady) {
        returnToLoginScreenAfterDisconnect(t("account.disconnected_login_required", "Connection closed. Sign in to continue."));
      }
    });

    socket.addEventListener("error", () => {
      appendDebug("xmpp-error", "WebSocket error");
      setConnectionStatus(t("status.xmpp_error", "XMPP connection error"), "danger");
      if (!state.intentionalDisconnect && state.accountReady) {
        window.setTimeout(() => {
          if (!state.xmppSocket || state.xmppSocket.readyState === WebSocket.CLOSED) {
            if (scheduleMediaTransportReconnect("xmpp", "error")) {
              return;
            }

            returnToLoginScreenAfterDisconnect(t("account.connection_failed_login_required", "Connection failed. Sign in to try again."));
          }
        }, 0);
      }
    });
  }

  function normalizeXmppWebSocketUrl(url) {
    const value = String(url || "").trim();
    return /\/websocket$/i.test(value) ? `${value}/` : value;
  }

  function createXmppSession() {
    const accountJid = normalizeJidInput(currentFromJid());
    const accountBare = bareJid(accountJid);
    const [localPart = "", accountDomain = "localhost"] = accountBare.split("@");
    const domain = state.account?.xmppDomain || accountDomain || "localhost";
    const resource = accountJid.includes("/")
      ? accountJid.split("/").slice(1).join("/") || `web-${state.clientInstance.resourceSuffix}`
      : `web-${state.clientInstance.resourceSuffix}`;
    return {
      phase: "opening",
      authenticated: false,
      localPart,
      domain,
      resource,
      accountJid: accountBare,
      bindId: createMessageId("bind"),
      boundJid: "",
      streamManagement: {
        offered: false,
        pending: false,
        pendingResume: false,
        enabled: false,
        id: "",
        resumeSupported: false,
        inboundHandled: 0,
        outboundSent: 0,
        outboundAcked: 0,
        fallbackTimer: null,
        resumeCandidate: loadStoredXmppStreamManagement(accountBare, domain)
      }
    };
  }

  function sendXmppOpenFrame() {
    if (state.xmppSocket?.readyState !== WebSocket.OPEN || !state.xmppSession) {
      return;
    }

    const open = `<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="${escapeXml(state.xmppSession.domain)}" version="1.0"/>`;
    sendXmppRaw(open);
    flushClientLifecycleState("xmpp-open", true);
  }

  function sendXmppRaw(xml, debugText = xml) {
    if (state.xmppSocket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    state.xmppSocket.send(xml);
    appendDebug("C", debugText);
    return true;
  }

  function sendXmppStanza(xml, debugText = xml) {
    const sent = sendXmppRaw(xml, debugText);
    if (sent && state.xmppSession?.streamManagement?.enabled && isXmppCountedStanza(xml)) {
      state.xmppSession.streamManagement.outboundSent += 1;
      saveXmppStreamManagementState();
    }

    return sent;
  }

  function sendXmppStreamManagementElement(xml, debugText = xml) {
    return sendXmppRaw(xml, debugText);
  }

  function isXmppCountedStanza(xml) {
    return /^<(message|presence|iq)\b/i.test(String(xml || "").trim());
  }

  function loadStoredXmppStreamManagement(accountJid, domain) {
    const saved = sessionStorage.getItem(xmppStreamManagementStorageKeyFor(state.sessionProfile));
    if (!saved) {
      return null;
    }

    try {
      const parsed = JSON.parse(saved);
      if (!parsed?.id || parsed.accountJid !== accountJid || parsed.domain !== domain) {
        return null;
      }

      if (Date.now() - Number(parsed.savedAt || 0) > xmppStreamManagementResumeMaxAgeMs) {
        clearStoredXmppStreamManagement();
        return null;
      }

      return parsed;
    } catch {
      clearStoredXmppStreamManagement();
      return null;
    }
  }

  function saveXmppStreamManagementState() {
    const sm = state.xmppSession?.streamManagement;
    if (!state.xmppSession || !sm?.enabled || !sm.resumeSupported || !sm.id) {
      return;
    }

    sessionStorage.setItem(xmppStreamManagementStorageKeyFor(state.sessionProfile), JSON.stringify({
      id: sm.id,
      accountJid: state.xmppSession.accountJid,
      domain: state.xmppSession.domain,
      boundJid: state.xmppSession.boundJid,
      inboundHandled: sm.inboundHandled,
      outboundSent: sm.outboundSent,
      outboundAcked: sm.outboundAcked,
      savedAt: Date.now()
    }));
  }

  function clearStoredXmppStreamManagement() {
    sessionStorage.removeItem(xmppStreamManagementStorageKeyFor(state.sessionProfile));
  }

  function maybeResumeXmppStreamManagement() {
    const sm = state.xmppSession?.streamManagement;
    const candidate = sm?.resumeCandidate;
    if (!state.xmppSession || !sm?.offered || !candidate?.id || sm.pendingResume || state.xmppSession.authenticated) {
      return false;
    }

    state.xmppSession.phase = "resuming";
    sm.pendingResume = true;
    const handled = Math.max(0, Number(candidate.inboundHandled || 0));
    const xml = `<resume xmlns="${xmppStreamManagementNamespace}" previd="${escapeXml(candidate.id)}" h="${handled}"/>`;
    sendXmppStreamManagementElement(xml);
    window.clearTimeout(sm.fallbackTimer);
    sm.fallbackTimer = window.setTimeout(() => {
      if (!state.xmppSession || state.xmppSession.phase !== "resuming") {
        return;
      }

      appendDebug("xmpp-sm", "resume timeout, binding new stream");
      sm.pendingResume = false;
      clearStoredXmppStreamManagement();
      sendXmppBind();
    }, 1500);
    return true;
  }

  function sendXmppPlainAuth() {
    const password = state.account?.password || el.passwordInput.value || "";
    if (!password) {
      setConnectionStatus(t("account.password_required", "Enter a password for a real server account."), "danger");
      returnToLoginScreenAfterDisconnect(t("account.password_required", "Enter a password for a real server account."), { openLogin: false });
      closeXmppWebSocket();
      return;
    }

    const authzid = "";
    const authcid = state.xmppSession?.localPart || bareJid(currentFromJid()).split("@")[0];
    const payload = base64Utf8(`${authzid}\u0000${authcid}\u0000${password}`);
    const xml = `<auth xmlns="urn:ietf:params:xml:ns:xmpp-sasl" mechanism="PLAIN">${payload}</auth>`;
    state.xmppSession.phase = "authenticating";
    sendXmppRaw(xml, "<auth mechanism=\"PLAIN\">...</auth>");
  }

  function sendXmppBind() {
    if (!state.xmppSession) {
      return;
    }

    state.xmppSession.phase = "binding";
    const xml = `<iq xmlns="jabber:client" type="set" id="${escapeXml(state.xmppSession.bindId)}"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><resource>${escapeXml(state.xmppSession.resource)}</resource></bind></iq>`;
    sendXmppStanza(xml);
  }

  function completeXmppBind(iq) {
    const jidElement = iq.getElementsByTagNameNS("urn:ietf:params:xml:ns:xmpp-bind", "jid")[0];
    const boundJid = jidElement?.textContent || currentFromJid();
    state.xmppSession.boundJid = boundJid;
    state.xmppSession.authenticated = true;
    if (state.account) {
      state.account.xmppBoundJid = boundJid;
    }
    state.clientLifecycle.xmppLastSent = null;
    if (state.xmppSession.streamManagement.offered) {
      enableXmppStreamManagement();
      return;
    }

    finishXmppReady();
  }

  function enableXmppStreamManagement() {
    if (!state.xmppSession || state.xmppSession.streamManagement.pending || state.xmppSession.streamManagement.enabled) {
      return;
    }

    state.xmppSession.phase = "stream-management";
    state.xmppSession.streamManagement.pending = true;
    const xml = `<enable xmlns="${xmppStreamManagementNamespace}" resume="true"/>`;
    sendXmppStreamManagementElement(xml);
    window.clearTimeout(state.xmppSession.streamManagement.fallbackTimer);
    state.xmppSession.streamManagement.fallbackTimer = window.setTimeout(() => {
      if (!state.xmppSession || state.xmppSession.phase !== "stream-management") {
        return;
      }

      appendDebug("xmpp-sm", "enable timeout, continuing without stream management");
      state.xmppSession.streamManagement.pending = false;
      finishXmppReady();
    }, 1500);
  }

  function finishXmppReady() {
    if (!state.xmppSession || state.xmppSession.phase === "ready") {
      return;
    }

    state.xmppAuthRefreshAttempted = false;
    state.xmppSession.phase = "ready";
    sendPresence("online");
    for (const conversation of state.conversations) {
      if (conversation.kind === "group") {
        conversation.mucJoined = false;
      }
    }
    joinActiveXmppGroupConversation();
    startXmppHeartbeat();
    flushClientLifecycleState("xmpp-ready", true);
    setConnectionStatus(t("status.xmpp_connected", "XMPP connected"), "good");
    updateComposerAvailability();
    syncXmppMamArchive("xmpp-ready");
  }

  function syncXmppMamArchive(reason = "manual") {
    if (state.mode !== "xmpp"
      || state.xmppSocket?.readyState !== WebSocket.OPEN
      || !state.xmppSession?.authenticated
      || state.xmppMam.pending) {
      return false;
    }

    const now = Date.now();
    if (now - state.xmppMam.lastStartedAt < 15000) {
      return false;
    }

    state.xmppMam.pending = true;
    state.xmppMam.lastStartedAt = now;
    state.xmppMam.resultCount = 0;
    const id = createMessageId("mam");
    const queryId = createMessageId("mamq");
    const xml = createXmppMamQueryStanza(id, queryId, { max: 200 });
    appendDebug("xmpp-mam", `query ${reason} ${queryId}`);
    window.clearTimeout(state.xmppMam.timerId);
    state.xmppMam.timerId = window.setTimeout(() => {
      if (!state.xmppMam.pending) {
        return;
      }
      state.xmppMam.pending = false;
      appendDebug("xmpp-mam", "query timeout or unsupported");
      reloadLocalHistoryAfterEmptyMam("timeout");
    }, 8000);
    return sendXmppStanza(xml, `<iq type="set" id="${id}"><query xmlns="${xmppMamNamespace}" queryid="${queryId}">...</query></iq>`);
  }

  function createXmppMamQueryStanza(id, queryId, options = {}) {
    const max = Math.max(1, Math.min(500, Number(options.max || 100)));
    const fields = [
      `<field var="FORM_TYPE" type="hidden"><value>${xmppMamNamespace}</value></field>`
    ];
    if (options.with) {
      fields.push(`<field var="with"><value>${escapeXml(options.with)}</value></field>`);
    }
    if (options.start) {
      fields.push(`<field var="start"><value>${escapeXml(options.start)}</value></field>`);
    }
    if (options.end) {
      fields.push(`<field var="end"><value>${escapeXml(options.end)}</value></field>`);
    }

    const paging = `<set xmlns="${xmppRsmNamespace}"><max>${max}</max></set>`;
    return `<iq xmlns="jabber:client" type="set" id="${escapeXml(id)}"><query xmlns="${xmppMamNamespace}" queryid="${escapeXml(queryId)}"><x xmlns="${xmppDataFormsNamespace}" type="submit">${fields.join("")}</x>${paging}</query></iq>`;
  }

  function base64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  function utf8FromBase64(value) {
    const binary = atob(String(value || ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function closeXmppWebSocket() {
    if (!state.xmppSocket) {
      return;
    }

    if (state.xmppSocket.readyState === WebSocket.OPEN) {
      const close = '<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>';
      sendXmppRaw(close);
    }

    stopXmppHeartbeat();
    window.clearTimeout(state.xmppSession?.streamManagement?.fallbackTimer);
    state.xmppSocket.close();
  }

  function handleXmppIncomingFrame(xmlText) {
    const text = String(xmlText ?? "");
    handleXmppSessionFrame(text);
    if (!text.includes("<message") && !text.includes("<presence")) {
      return;
    }

    let doc;
    try {
      doc = new DOMParser().parseFromString(`<wrapper xmlns="jabber:client">${text}</wrapper>`, "application/xml");
    } catch {
      return;
    }

    if (doc.querySelector("parsererror")) {
      return;
    }

    const presences = Array.from(doc.documentElement?.children || [])
      .filter((element) => element.localName === "presence" && element.namespaceURI === "jabber:client");
    for (const presence of presences) {
      handleXmppPresenceElement(presence);
    }

    const messages = Array.from(doc.documentElement?.children || [])
      .filter((element) => element.localName === "message" && element.namespaceURI === "jabber:client");
    for (const message of messages) {
      if (handleXmppMamResultMessage(message)) {
        continue;
      }

      const type = message.getAttribute("type") || "chat";
      const from = message.getAttribute("from") || "";
      if (!from || (!isXmppGroupchatType(type) && isOwnPeer(from))) {
        continue;
      }

      if (handleXmppJingleSignalMessage(message, from)) {
        continue;
      }

      const conversationPeer = isXmppGroupchatType(type) ? bareJid(from) : from;
      const conversationKind = isXmppGroupchatType(type) ? "group" : "contact";
      const conversation = ensureConversationForPeer(conversationPeer, conversationKind, displayNameForJid(conversationPeer));
      if (!conversation) {
        continue;
      }

      conversation.presence = "online";
      const receiptElement = message.getElementsByTagNameNS("urn:xmpp:receipts", "received")[0];
      if (receiptElement) {
        const receiptId = receiptElement.getAttribute("id") || "";
        appendDebug("xmpp-receipt-in", `${from} received ${receiptId}`);
        applyMessageDeliveryMarker(conversation, receiptId, "delivered");
        continue;
      }

      const displayedElement = message.getElementsByTagNameNS("urn:xmpp:chat-markers:0", "displayed")[0];
      if (displayedElement) {
        const displayedId = displayedElement.getAttribute("id") || "";
        appendDebug("xmpp-marker-in", `${from} displayed ${displayedId}`);
        applyMessageDeliveryMarker(conversation, displayedId, "displayed");
        continue;
      }

      const reactionsElement = message.getElementsByTagNameNS("urn:xmpp:reactions:0", "reactions")[0];
      if (reactionsElement) {
        applyMessageReaction(
          conversation,
          reactionsElement.getAttribute("id") || "",
          from,
          Array.from(reactionsElement.getElementsByTagNameNS("urn:xmpp:reactions:0", "reaction"))
            .map((item) => item.textContent || "")
            .filter(Boolean));
        continue;
      }

      const retractElement = message.getElementsByTagNameNS("urn:xmpp:message-retract:1", "retract")[0];
      const tombstoneElement = message.getElementsByTagNameNS("urn:xmpp:message-retract:1", "retracted")[0];
      if (retractElement) {
        applyMessageRetraction(
          conversation,
          retractElement.getAttribute("id") || "",
          parseModeratedRetraction(retractElement),
          from);
        continue;
      }

      if (tombstoneElement) {
        applyMessageRetraction(
          conversation,
          message.getAttribute("id") || "",
          parseModeratedRetraction(tombstoneElement),
          from);
        continue;
      }

      const bodyElement = message.getElementsByTagNameNS("jabber:client", "body")[0];
      if (!bodyElement) {
        continue;
      }

      const replaceElement = message.getElementsByTagNameNS("urn:xmpp:message-correct:0", "replace")[0];
      const replaceId = replaceElement?.getAttribute("id") || "";
      const messageId = stableXmppMessageId(message);
      const stylingDisabled = Boolean(message.getElementsByTagNameNS("urn:xmpp:styling:0", "unstyled")[0]);
      if (isXmppOwnGroupchatEcho(from, type)) {
        continue;
      }

      if (!isXmppGroupchatType(type)) {
        sendXmppMessageAcknowledgements(from, messageId, Boolean(message.getElementsByTagNameNS("urn:xmpp:receipts", "request")[0]));
      }
      if (replaceId) {
        applyMessageCorrection(conversation, replaceId, bodyElement.textContent || "", "peer", messageId, from, stylingDisabled);
      } else {
        const addedMessage = addMessage("peer", bodyElement.textContent || "", "received", from, null, conversation.id, null, messageId, stylingDisabled);
        setMessageXmppIdentifiers(addedMessage, xmppMessageIdentifiers(message));
        if (addedMessage) {
          addedMessage.callInfo = parseXmppCallInfo(message);
          addedMessage.jingleHistory = parseXmppJingleHistory(message);
          if (!addedMessage.callInfo && addedMessage.jingleHistory) {
            addedMessage.callInfo = callInfoFromJingleHistory(addedMessage.jingleHistory, from);
          } else if (addedMessage.callInfo && !addedMessage.jingleHistory) {
            addedMessage.jingleHistory = createJingleHistoryEventFromCallInfo(addedMessage.callInfo, addedMessage.direction);
          }
          if (addedMessage.callInfo) {
            addedMessage.status = callNotificationMessageStatus(addedMessage.callInfo.status);
            updateMessageElementById(addedMessage);
          }
        }
      }
    }
  }

  function handleXmppMamResultMessage(message) {
    const result = message.getElementsByTagNameNS(xmppMamNamespace, "result")[0];
    if (!result) {
      return false;
    }

    const forwarded = result.getElementsByTagNameNS(xmppForwardNamespace, "forwarded")[0];
    const archivedMessage = forwarded?.getElementsByTagNameNS("jabber:client", "message")[0];
    const bodyElement = archivedMessage?.getElementsByTagNameNS("jabber:client", "body")[0];
    if (!archivedMessage || !bodyElement) {
      return true;
    }

    if (restoreXmppMamArchivedMessage(archivedMessage, result, forwarded)) {
      state.xmppMam.resultCount += 1;
    }
    return true;
  }

  function handleXmppJingleSignalMessage(message, from) {
    const signal = message.getElementsByTagNameNS(teletyptelJingleSignalNamespace, "signal")[0];
    if (!signal) {
      return false;
    }

    const envelope = decodeXmppJingleSignal(signal);
    if (!envelope) {
      appendDebug("jingle-xmpp-error", "Invalid XMPP Jingle signal payload");
      return true;
    }

    if (envelope.clientId && envelope.clientId === state.clientInstance.id) {
      appendDebug("jingle-xmpp-skip", "Ignored own XMPP Jingle signal echo");
      return true;
    }

    envelope.type = "jingle";
    envelope.from = envelope.from || from;
    envelope.to = envelope.to || currentFromJid();
    if (isXmppGroupchatType(message.getAttribute("type"))) {
      envelope.conversationKind = "group";
      envelope.roomJid = envelope.roomJid || bareJid(from);
    }
    appendDebug("jingle-xmpp-in", `${envelope.action || "jingle"} sid=${envelope.sid || "-"} from=${bareJid(from)}`);
    handleJingleEnvelope(envelope);
    return true;
  }

  function decodeXmppJingleSignal(signal) {
    try {
      return JSON.parse(utf8FromBase64(signal.textContent || ""));
    } catch {
      return null;
    }
  }

  function restoreXmppMamArchivedMessage(message, result, forwarded) {
    const type = message.getAttribute("type") || "chat";
    const from = message.getAttribute("from") || "";
    const to = message.getAttribute("to") || "";
    const direction = isOwnPeer(from) || isXmppOwnGroupchatEcho(from, type) ? "self" : "peer";
    const peer = isXmppGroupchatType(type)
      ? bareJid(from)
      : direction === "self"
        ? bareJid(to)
        : bareJid(from);
    if (!peer || isOwnPeer(peer)) {
      return null;
    }

    const conversation = ensureConversationForPeer(
      peer,
      type === "groupchat" ? "group" : "contact",
      displayNameForJid(peer));
    if (!conversation) {
      return null;
    }

    const messageId = stableXmppMessageId(message) || result.getAttribute("id") || "";
    const existing = messageId
      ? findMessageRecordByAnyId(messageId, { conversation })
      : null;
    if (existing) {
      return existing.message;
    }

    const delay = forwarded?.getElementsByTagNameNS(xmppDelayNamespace, "delay")[0];
    const timestamp = parseXmppTimestamp(delay?.getAttribute("stamp") || "");
    const stylingDisabled = Boolean(message.getElementsByTagNameNS("urn:xmpp:styling:0", "unstyled")[0]);
    const added = addMessage(
      direction,
      message.getElementsByTagNameNS("jabber:client", "body")[0]?.textContent || "",
      direction === "self" ? "sent" : "received",
      direction === "peer" ? from : null,
      null,
      conversation.id,
      null,
      messageId || null,
      stylingDisabled,
      false);
    if (!added) {
      return null;
    }

    setMessageXmppIdentifiers(added, xmppMessageIdentifiers(message));
    added.xmppStanzaId = added.xmppStanzaId || result.getAttribute("id") || "";
    added.callInfo = parseXmppCallInfo(message);
    added.jingleHistory = parseXmppJingleHistory(message);
    if (!added.callInfo && added.jingleHistory) {
      added.callInfo = callInfoFromJingleHistory(added.jingleHistory, direction === "peer" ? from : peer);
    } else if (added.callInfo && !added.jingleHistory) {
      added.jingleHistory = createJingleHistoryEventFromCallInfo(added.callInfo, added.direction);
    }
    if (added.callInfo) {
      added.status = callNotificationMessageStatus(added.callInfo.status);
    }
    if (timestamp) {
      added.timestamp = timestamp;
    }
    persistHistoryMessage(conversation, added);
    appendDebug("xmpp-mam", `${conversation.peer} ${direction} ${messageId || result.getAttribute("id") || "-"}`);
    renderConversations();
    if (conversation.id === state.activeConversationId) {
      renderActiveConversation();
    }
    return added;
  }

  function parseXmppTimestamp(value) {
    if (!value) {
      return null;
    }

    const timestamp = new Date(value);
    return Number.isNaN(timestamp.valueOf()) ? null : timestamp;
  }

  function parseXmppCallInfo(message) {
    const element = message.getElementsByTagNameNS(teletyptelCallInfoNamespace, "call-info")[0];
    if (!element) {
      return null;
    }

    return {
      status: element.getAttribute("status") || "",
      callId: element.getAttribute("call-id") || "",
      mediaKind: element.getAttribute("media-kind") || "",
      rttEnabled: element.getAttribute("rtt-enabled") === "true",
      durationSeconds: Math.max(0, Number(element.getAttribute("duration-seconds") || 0)),
      peer: element.getAttribute("peer") || "",
      startedAt: element.getAttribute("started-at") || "",
      endedAt: element.getAttribute("ended-at") || ""
    };
  }

  function createJingleHistoryEventFromCallInfo(callInfo, messageDirection = "self") {
    const api = jingleHistoryApi();
    if (!api?.normalizeJingleHistoryEvent || !callInfo || typeof callInfo !== "object") {
      return null;
    }

    const disposition = jingleDispositionFromCallStatus(callInfo.status);
    if (!disposition) {
      return null;
    }

    const startedAt = parseXmppTimestamp(callInfo.startedAt || "") || null;
    const endedAt = parseXmppTimestamp(callInfo.endedAt || "") || null;
    const event = {
      sid: callInfo.callId || createMessageId("call"),
      direction: messageDirection === "self" ? "outgoing" : "incoming",
      disposition,
      media: jingleHistoryMediaFromCallInfo(callInfo),
      profile: jingleHistoryProfileFromCallInfo(callInfo),
      started: startedAt ? startedAt.toISOString() : undefined,
      ended: endedAt ? endedAt.toISOString() : undefined,
      duration: Math.max(0, Number(callInfo.durationSeconds || 0)),
      recording: "none",
      transcript: callInfo.rttEnabled === true ? "local" : "none",
      peerJid: callInfo.peer || "",
      encrypted: false,
      consent: "none",
      createdAt: new Date().toISOString()
    };

    try {
      return api.normalizeJingleHistoryEvent(event);
    } catch (error) {
      appendDebug("jingle-history-error", error.message || String(error));
      return null;
    }
  }

  function jingleDispositionFromCallStatus(status) {
    switch (status) {
      case "ended":
        return "completed";
      case "missed":
        return "missed";
      case "rejected":
        return "declined";
      case "failed":
        return "failed";
      default:
        return "";
    }
  }

  function jingleHistoryMediaFromCallInfo(callInfo) {
    const media = ["audio"];
    if (callInfo.mediaKind === "video") {
      media.push("video");
    }
    if (callInfo.rttEnabled === true) {
      media.push("rtt", "captions");
    }
    return media;
  }

  function jingleHistoryProfileFromCallInfo(callInfo) {
    if (callInfo.rttEnabled === true) {
      return "total-conversation";
    }
    return callInfo.mediaKind === "video" ? "video" : "audio";
  }

  function parseXmppJingleHistory(message) {
    const element = message.getElementsByTagNameNS(jingleHistoryNamespace, "jingle-history")[0];
    const api = jingleHistoryApi();
    return element && api?.parseJingleHistory ? api.parseJingleHistory(element) : null;
  }

  function jingleHistoryApi() {
    return globalThis.TeleTypTelJingleHistory || null;
  }

  function callInfoFromJingleHistory(event, peer = "") {
    if (!event) {
      return null;
    }

    return {
      status: callStatusFromJingleDisposition(event.disposition),
      callId: event.sid || "",
      mediaKind: event.media?.includes("video") ? "video" : "audio",
      rttEnabled: event.media?.includes("rtt") || event.profile === "total-conversation",
      durationSeconds: Math.max(0, Number(event.duration || 0)),
      peer: event.peerJid || peer || "",
      startedAt: event.started || "",
      endedAt: event.ended || ""
    };
  }

  function callStatusFromJingleDisposition(disposition) {
    switch (disposition) {
      case "missed":
      case "timeout":
        return "missed";
      case "declined":
        return "rejected";
      case "failed":
      case "busy":
      case "cancelled":
        return "failed";
      default:
        return "ended";
    }
  }

  function stableXmppMessageId(message) {
    const originId = message.getElementsByTagNameNS("urn:xmpp:sid:0", "origin-id")[0]?.getAttribute("id") || "";
    if (originId) {
      return originId;
    }

    const stanzaId = message.getElementsByTagNameNS("urn:xmpp:sid:0", "stanza-id")[0]?.getAttribute("id") || "";
    return stanzaId || message.getAttribute("id") || null;
  }

  function xmppMessageIdentifiers(messageElement) {
    const messageId = messageElement?.getAttribute("id") || "";
    const originId = messageElement?.getElementsByTagNameNS("urn:xmpp:sid:0", "origin-id")[0]?.getAttribute("id") || "";
    const stanzaId = messageElement?.getElementsByTagNameNS("urn:xmpp:sid:0", "stanza-id")[0]?.getAttribute("id") || "";
    return { messageId, originId, stanzaId };
  }

  function setMessageXmppIdentifiers(message, identifiers) {
    if (!message || !identifiers) {
      return;
    }

    message.xmppMessageId = identifiers.messageId || message.xmppMessageId || "";
    message.xmppOriginId = identifiers.originId || message.xmppOriginId || "";
    message.xmppStanzaId = identifiers.stanzaId || message.xmppStanzaId || "";
    if (!message.xmppId) {
      message.xmppId = message.xmppOriginId || message.xmppStanzaId || message.xmppMessageId || "";
    }
  }

  function sendXmppMessageAcknowledgements(to, messageId, receiptRequested) {
    if (!messageId || state.mode !== "xmpp" || state.xmppSocket?.readyState !== WebSocket.OPEN || !state.xmppSession?.authenticated) {
      return;
    }

    if (receiptRequested) {
      appendDebug("xmpp-receipt-out", `received ${messageId} to ${to}`);
      sendXmppStanza(createDeliveryReceiptStanza(to, messageId), "<message receipt=\"received\"/>");
    }
    appendDebug("xmpp-marker-out", `displayed ${messageId} to ${to}`);
    sendXmppStanza(createDisplayedMarkerStanza(to, messageId), "<message marker=\"displayed\"/>");
  }

  function applyMessageDeliveryMarker(conversation, messageId, status) {
    if (!messageId || !status) {
      return;
    }

    const match = findMessageRecordByAnyId(messageId, {
      conversation,
      direction: "self"
    });
    if (!match) {
      appendDebug("message-ack-miss", `${status} ${messageId}`);
      return;
    }

    const order = { sent: 1, delivered: 2, displayed: 3 };
    if ((order[status] || 0) <= (order[match.message.deliveryStatus] || 0)) {
      return;
    }

    match.message.deliveryStatus = status;
    updateMessageElementById(match.message);
  }

  function handleXmppSessionFrame(text) {
    if (!state.xmppSession || !text) {
      return;
    }

    let doc;
    try {
      doc = new DOMParser().parseFromString(`<wrapper>${text}</wrapper>`, "application/xml");
    } catch {
      return;
    }

    if (doc.querySelector("parsererror")) {
      return;
    }

    trackIncomingXmppStanzas(doc);
    handleXmppStreamManagement(doc);
    handleXmppMamFin(doc);

    const features = doc.getElementsByTagNameNS("http://etherx.jabber.org/streams", "features")[0];
    if (features) {
      handleXmppFeatures(features);
      return;
    }

    if (doc.getElementsByTagNameNS("urn:ietf:params:xml:ns:xmpp-sasl", "success")[0]) {
      state.xmppSession.phase = "reopening";
      sendXmppOpenFrame();
      return;
    }

    const failure = doc.getElementsByTagNameNS("urn:ietf:params:xml:ns:xmpp-sasl", "failure")[0];
    if (failure) {
      setConnectionStatus(t("status.xmpp_auth_failed", "XMPP authentication failed"), "danger");
      appendDebug("xmpp-auth", failure.textContent || "failed");
      if (refreshDatabaseAccountAfterXmppAuthFailure()) {
        return;
      }

      returnToLoginScreenAfterDisconnect(t("account.invalid_credentials", "The server rejected this email or password."));
      closeXmppWebSocket();
      return;
    }

    const iqElements = Array.from(doc.getElementsByTagNameNS("jabber:client", "iq"));
    const bindResult = iqElements.find((iq) =>
      iq.getAttribute("id") === state.xmppSession?.bindId
      && iq.getAttribute("type") === "result");
    if (bindResult) {
      completeXmppBind(bindResult);
    }
  }

  function handleXmppMamFin(doc) {
    const fin = doc.getElementsByTagNameNS(xmppMamNamespace, "fin")[0];
    if (!fin) {
      return false;
    }

    state.xmppMam.pending = false;
    state.xmppMam.loaded = true;
    window.clearTimeout(state.xmppMam.timerId);
    state.xmppMam.timerId = null;
    appendDebug("xmpp-mam", `fin complete=${fin.getAttribute("complete") || "false"}`);
    if (state.xmppMam.resultCount === 0) {
      reloadLocalHistoryAfterEmptyMam("empty");
    }
    syncAllConversationMessageState("mam-load");
    return true;
  }

  function reloadLocalHistoryAfterEmptyMam(reason) {
    if (state.xmppMam.fallbackHistoryReloaded) {
      return;
    }

    state.xmppMam.fallbackHistoryReloaded = true;
    appendDebug("xmpp-mam", `no archive messages (${reason}); reloading local history fallback`);
    loadMessageHistory().then((loaded) => {
      if (loaded) {
        appendDebug("history", "Local history fallback restored after empty MAM.");
      }
    }).catch((error) => appendDebug("history-error", error.message || String(error)));
  }

  function handleXmppFeatures(features) {
    if (!state.xmppSession) {
      return;
    }

    state.xmppSession.streamManagement.offered = Boolean(
      features.getElementsByTagNameNS(xmppStreamManagementNamespace, "sm")[0]);

    const mechanisms = Array.from(features.getElementsByTagNameNS("urn:ietf:params:xml:ns:xmpp-sasl", "mechanism"))
      .map((item) => item.textContent || "");
    if (mechanisms.length && !state.xmppSession.authenticated && state.xmppSession.phase !== "authenticating") {
      if (mechanisms.includes("PLAIN")) {
        sendXmppPlainAuth();
      } else {
        setConnectionStatus(t("status.xmpp_plain_missing", "XMPP server does not advertise PLAIN over WebSocket."), "danger");
        returnToLoginScreenAfterDisconnect(t("account.connection_failed_login_required", "Connection failed. Sign in to try again."));
        closeXmppWebSocket();
      }
      return;
    }

    const bindFeature = features.getElementsByTagNameNS("urn:ietf:params:xml:ns:xmpp-bind", "bind")[0];
    if (bindFeature && maybeResumeXmppStreamManagement()) {
      return;
    }

    if (bindFeature && !state.xmppSession.authenticated && state.xmppSession.phase !== "binding") {
      sendXmppBind();
    }
  }

  function trackIncomingXmppStanzas(doc) {
    const sm = state.xmppSession?.streamManagement;
    if (!sm?.enabled) {
      return;
    }

    const count = Array.from(doc.documentElement?.children || [])
      .filter((element) => ["message", "presence", "iq"].includes(element.localName))
      .length;
    if (count > 0) {
      sm.inboundHandled += count;
      saveXmppStreamManagementState();
    }
  }

  function handleXmppStreamManagement(doc) {
    const sm = state.xmppSession?.streamManagement;
    if (!sm) {
      return false;
    }

    const enabled = doc.getElementsByTagNameNS(xmppStreamManagementNamespace, "enabled")[0];
    if (enabled) {
      window.clearTimeout(sm.fallbackTimer);
      sm.pending = false;
      sm.pendingResume = false;
      sm.enabled = true;
      sm.id = enabled.getAttribute("id") || "";
      sm.resumeSupported = ["true", "1"].includes((enabled.getAttribute("resume") || "").toLowerCase());
      sm.inboundHandled = 0;
      sm.outboundSent = 0;
      sm.outboundAcked = 0;
      appendDebug("xmpp-sm", `enabled id=${sm.id || "-"} resume=${sm.resumeSupported ? "true" : "false"}`);
      saveXmppStreamManagementState();
      finishXmppReady();
      return true;
    }

    const resumed = doc.getElementsByTagNameNS(xmppStreamManagementNamespace, "resumed")[0];
    if (resumed && sm.pendingResume) {
      window.clearTimeout(sm.fallbackTimer);
      sm.pendingResume = false;
      sm.pending = false;
      sm.enabled = true;
      sm.id = resumed.getAttribute("previd") || sm.resumeCandidate?.id || "";
      sm.resumeSupported = true;
      const handled = Number(resumed.getAttribute("h") || "0");
      sm.outboundAcked = Number.isFinite(handled) ? handled : Number(sm.resumeCandidate?.outboundAcked || 0);
      sm.outboundSent = Math.max(Number(sm.resumeCandidate?.outboundSent || 0), sm.outboundAcked);
      sm.inboundHandled = Number(sm.resumeCandidate?.inboundHandled || 0);
      state.xmppSession.authenticated = true;
      state.xmppSession.boundJid = sm.resumeCandidate?.boundJid || state.xmppSession.accountJid;
      appendDebug("xmpp-sm", `resumed id=${sm.id || "-"} h=${sm.outboundAcked}`);
      saveXmppStreamManagementState();
      finishXmppReady();
      return true;
    }

    const failed = doc.getElementsByTagNameNS(xmppStreamManagementNamespace, "failed")[0];
    if (failed && sm.pendingResume) {
      window.clearTimeout(sm.fallbackTimer);
      sm.pendingResume = false;
      clearStoredXmppStreamManagement();
      appendDebug("xmpp-sm", "resume failed, binding new stream");
      sendXmppBind();
      return true;
    }

    if (failed && sm.pending) {
      window.clearTimeout(sm.fallbackTimer);
      sm.pending = false;
      sm.enabled = false;
      clearStoredXmppStreamManagement();
      appendDebug("xmpp-sm", "enable failed");
      finishXmppReady();
      return true;
    }

    const ack = doc.getElementsByTagNameNS(xmppStreamManagementNamespace, "a")[0];
    if (ack) {
      const handled = Number(ack.getAttribute("h") || "0");
      if (Number.isFinite(handled)) {
        sm.outboundAcked = Math.max(sm.outboundAcked, handled);
        appendDebug("xmpp-sm", `server ack h=${sm.outboundAcked}`);
        saveXmppStreamManagementState();
      }
      return true;
    }

    const request = doc.getElementsByTagNameNS(xmppStreamManagementNamespace, "r")[0];
    if (request && sm.enabled) {
      sendXmppStreamManagementElement(`<a xmlns="${xmppStreamManagementNamespace}" h="${sm.inboundHandled}"/>`);
      appendDebug("xmpp-sm", `ack sent h=${sm.inboundHandled}`);
      saveXmppStreamManagementState();
      return true;
    }

    return false;
  }

  function sendComposerMessage(event) {
    event.preventDefault();
    if (!hasActiveConversation()) {
      return;
    }

    if (isActiveConversationBlocked()) {
      setConnectionStatus(t("status.contact_blocked_cannot_send", "This contact is blocked. Unblock to send messages."), "warn");
      return;
    }

    const text = el.messageInput.value;
    if (!text.trim()) {
      return;
    }

    const edit = activeEditTarget();
    const outgoingId = createMessageId(edit ? "edit" : "msg");
    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN && state.xmppSession?.authenticated) {
      const conversation = activeConversation();
      joinXmppGroupConversation(conversation);
      const messageType = conversation?.kind === "group" ? "groupchat" : "chat";
      const xml = createMessageStanza(text, outgoingId, edit?.replaceId ?? null, false, currentToJid(), "", messageType);
      sendXmppStanza(xml);
      if (edit) {
        applyMessageCorrection(edit.conversation, edit.replaceId, text, "self", outgoingId);
        clearMessageEdit();
      } else {
        addMessage("self", text, "RFC 7395", null, null, null, null, outgoingId, false, true, null, "sent");
      }
      el.messageInput.value = "";
      syncComposerActionButtons();
      state.previousText = "";
      return;
    }

    sendRelayFinalMessage(text, edit, outgoingId);
  }

  function handleComposerKeydown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      el.composerForm.requestSubmit();
    }
  }

  function handleComposerInput() {
    sendRttEdit();
    syncComposerActionButtons();
  }

  function syncComposerActionButtons() {
    const hasText = el.messageInput.value.trim().length > 0;
    const recording = state.voiceRecorder.recorder?.state === "recording";
    const videoRecording = state.videoRecorder.recorder?.state === "recording";
    const hasVoiceDraft = Boolean(state.voiceRecorder.blob);
    const hasVideoDraft = Boolean(state.videoRecorder.blob);
    const recorderActive = recording || hasVoiceDraft || videoRecording || hasVideoDraft;
    el.composerInputRow.hidden = recorderActive;
    el.sendButton.hidden = !hasText;
    el.videoMessageButton.hidden = hasText || recorderActive;
    el.voiceMessageButton.hidden = hasText || recorderActive;
  }

  function sendRelayFinalMessage(text, edit = null, outgoingId = createMessageId("msg")) {
    if (!hasActiveConversation()) {
      return;
    }

    if (isActiveConversationBlocked()) {
      setConnectionStatus(t("status.contact_blocked_cannot_send", "This contact is blocked. Unblock to send messages."), "warn");
      return;
    }

    if (sendJingleRttSyncPacket("message", text, {
      messageId: outgoingId,
      replaceId: edit?.replaceId ?? null
    })) {
      if (edit) {
        applyMessageCorrection(edit.conversation, edit.replaceId, text, "self", outgoingId);
        clearMessageEdit();
      } else {
        clearLocalRttDraftMessage();
        addMessage("self", text, "jingle-rtt", null, null, null, null, outgoingId);
      }
      el.messageInput.value = "";
      syncComposerActionButtons();
      state.previousText = "";
      state.sequence = 0;
      clearLocalRttDraftMessage();
      updateTotalConversationTextPanel();
      return;
    }

    if (!state.relaySocket || state.relaySocket.readyState !== WebSocket.OPEN) {
      showNotConnectedStatus();
      return;
    }

    const envelope = createRelayEnvelope("message", text, "");
    envelope.messageId = outgoingId;
    if (edit) {
      envelope.replaceId = edit.replaceId;
    }
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("relay-out", JSON.stringify(redactEnvelopeForLog(envelope)));
    recordTotalConversationTextForConversation(activeConversation(), "self", text, currentFromJid(), {
      final: true
    });
    if (edit) {
      applyMessageCorrection(edit.conversation, edit.replaceId, text, "self", outgoingId);
      clearMessageEdit();
    } else {
      clearLocalRttDraftMessage();
      addMessage("self", text, "sent", null, null, null, null, outgoingId);
    }
    el.messageInput.value = "";
    syncComposerActionButtons();
    state.previousText = "";
    state.sequence = 0;
    clearLocalRttDraftMessage();
    updateTotalConversationTextPanel();
  }

  function sendRttReset() {
    if (!hasActiveConversation()) {
      return;
    }

    if (!activeJingleRttSyncCall() && !isRelayConnected()) {
      showNotConnectedStatus();
      return;
    }

    state.sequence = 0;
    state.previousText = el.messageInput.value;
    updateLocalRttDraftMessage();
    updateTotalConversationTextPanel();
    if (sendJingleRttSyncPacket("reset", el.messageInput.value)) {
      return;
    }
    sendRttPacket("reset", el.messageInput.value);
  }

  function sendRttEdit() {
    if (!hasActiveConversation() || !el.rttToggle.checked) {
      clearLocalRttDraftMessage();
      return;
    }

    const hasJingleRtt = Boolean(activeJingleRttSyncCall());
    if (!hasJingleRtt && state.mode !== "relay") {
      return;
    }

    const text = el.messageInput.value;
    const previousText = state.previousText;
    const actions = createDeltaActions(previousText, text);
    state.previousText = text;
    updateLocalRttDraftMessage();
    updateTotalConversationTextPanel();
    if (sendJingleRttSyncPacket("edit", text, { actions, previousText })) {
      return;
    }
    sendRttPacket("edit", text, actions);
  }

  function sendRttPacket(eventName, text, actions = null) {
    if (!hasActiveConversation() || !state.relaySocket || state.relaySocket.readyState !== WebSocket.OPEN || !el.rttToggle.checked) {
      return;
    }

    if (isActiveConversationBlocked()) {
      return;
    }

    const xml = eventName === "edit"
      ? `<rtt xmlns="urn:xmpp:rtt:0" seq="${state.sequence++}">${actions ?? `<t p="0">${escapeXml(text)}</t>`}</rtt>`
      : `<rtt xmlns="urn:xmpp:rtt:0" event="${eventName}" seq="${state.sequence++}"><t p="0">${escapeXml(text)}</t></rtt>`;
    const envelope = createRelayEnvelope("rtt", text, xml);
    if (eventName === "reset" || state.sequence === 1) {
      Object.assign(envelope, currentAvatarEnvelope(true));
    }
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("rtt-out", xml);
    recordTotalConversationTextForConversation(activeConversation(), "self", text, currentFromJid());
  }

  function createRelayEnvelope(type, text, xml, to = null) {
    const conversation = activeConversation();
    return {
      type,
      text,
      xml,
      clientId: state.clientInstance.id,
      from: currentFromJid(),
      to: to || currentToJid(),
      conversationKind: conversation?.kind === "group" ? "group" : "contact",
      ...currentAvatarEnvelope(type !== "rtt" && type !== "client-state")
    };
  }

  function sendPresence(presence, options = {}) {
    const normalizedPresence = presence === "offline" ? "offline" : "online";
    const notificationState = normalizedPresence === "online" && state.doNotDisturb ? "dnd" : "available";
    if (isRelayConnected()) {
      const envelope = createRelayEnvelope("presence", "", "", "relay@localhost");
      envelope.presence = normalizedPresence;
      envelope.notificationState = notificationState;
      envelope.probe = options.probe === true;
      envelope.responseTo = options.responseTo || null;
      state.relaySocket.send(JSON.stringify(envelope));
      appendDebug("presence-out", `${envelope.presence}/${notificationState} ${envelope.probe ? "probe" : "announce"}`);
    }

    if (state.xmppSocket?.readyState === WebSocket.OPEN && state.xmppSession?.authenticated) {
      sendXmppStanza(createXmppPresenceStanza(normalizedPresence, notificationState), `<presence ${normalizedPresence}/${notificationState}/>`);
    }
  }

  function createXmppPresenceStanza(presence, notificationState) {
    if (presence === "offline") {
      return '<presence xmlns="jabber:client" type="unavailable"/>';
    }

    const show = notificationState === "dnd" ? "<show>dnd</show>" : "";
    const status = notificationState === "dnd"
      ? `<status>${escapeXml(t("presence.do_not_disturb", "Do not disturb"))}</status>`
      : "";
    return `<presence xmlns="jabber:client">${show}${status}</presence>`;
  }

  function currentSenderName() {
    return el.displayNameInput.value.trim() || "Me";
  }

  function currentAvatarDataUrl() {
    return isValidAvatarDataUrl(state.account?.avatarDataUrl) ? state.account.avatarDataUrl : "";
  }

  function currentAvatarColor() {
    return normalizeAvatarColor(el.avatarColorInput.value || state.account?.avatarColor || avatarColorFor(currentSenderName()));
  }

  function setAvatarColorControls(color) {
    const normalized = normalizeAvatarColor(color);
    el.avatarColorInput.value = normalized;
    if (el.dialogAvatarColorInput) {
      el.dialogAvatarColorInput.value = normalized;
    }
  }

  function currentAvatarEnvelope(includeDataUrl = false) {
    const avatar = {
      displayName: currentSenderName(),
      avatarColor: currentAvatarColor()
    };
    const dataUrl = currentAvatarDataUrl();
    if (includeDataUrl && dataUrl) {
      avatar.avatarDataUrl = dataUrl;
    }

    return avatar;
  }

  function updateAccountAvatarPreview() {
    const source = {
      displayName: currentSenderName(),
      avatarDataUrl: currentAvatarDataUrl(),
      avatarColor: currentAvatarColor()
    };
    renderAvatarInto(el.accountAvatarPreview, source);
    renderAvatarInto(el.dialogAccountAvatarPreview, source);
  }

  function renderAvatarInto(container, source) {
    if (!container) {
      return;
    }

    container.replaceChildren();
    const { dataUrl, color, initials } = avatarVisual(source);
    container.style.setProperty("--avatar-bg", color);
    container.title = source?.displayName || source?.name || source?.peer || initials;
    if (dataUrl) {
      const image = document.createElement("img");
      image.src = dataUrl;
      image.alt = "";
      image.decoding = "async";
      image.addEventListener("error", () => {
        container.replaceChildren();
        container.textContent = initials;
      }, { once: true });
      container.appendChild(image);
      return;
    }

    container.textContent = initials;
  }

  function createAvatarElement(source, className = "") {
    const avatar = document.createElement("span");
    avatar.className = ["avatar", className].filter(Boolean).join(" ");
    avatar.setAttribute("aria-hidden", "true");
    renderAvatarInto(avatar, source);
    return avatar;
  }

  function avatarVisual(source) {
    const name = source?.displayName || (source ? conversationDisplayName(source) : "") || source?.name || source?.peer || "TX";
    const avatarDataUrl = source?.avatarDataUrl || source?.roomAvatarDataUrl || "";
    const dataUrl = isValidAvatarDataUrl(avatarDataUrl) ? avatarDataUrl : "";
    const color = normalizeAvatarColor(source?.avatarColor || avatarColorFor(`${name}:${source?.peer ?? ""}`));
    return {
      dataUrl,
      color,
      initials: avatarInitials(name)
    };
  }

  function avatarInitials(value) {
    const parts = String(value || "TX")
      .replace(/@.*/, "")
      .split(/[\s._-]+/g)
      .filter(Boolean);
    const letters = parts.length > 1
      ? parts.slice(0, 2).map((part) => part[0]).join("")
      : (parts[0] || "TX").slice(0, 2);
    return letters.toUpperCase();
  }

  function avatarColorFor(value) {
    const hue = consistentColorHue(String(value || "teletyptel"));
    return hsluvToHex(hue, 100, 50);
  }

  function consistentColorHue(value) {
    const hash = sha1Bytes(utf8Bytes(value));
    return ((hash[0] + (hash[1] << 8)) / 65536) * 360;
  }

  function hsluvToHex(hue, saturation, lightness) {
    const color = hsluvToRgb(hue, saturation, lightness);
    return `#${color.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  }

  function hsluvToRgb(hue, saturation, lightness) {
    const refU = 0.19783000664283;
    const refV = 0.46831999493879;
    const kappa = 903.2962962;
    const epsilon = 0.0088564516;
    const matrix = [
      [3.240969941904521, -1.537383177570093, -0.498610760293],
      [-0.96924363628087, 1.87596750150772, 0.041555057407175],
      [0.055630079696993, -0.20397695888897, 1.056971514242878]
    ];
    const normalizedHue = ((hue % 360) + 360) % 360;
    const boundedSaturation = Math.min(Math.max(saturation, 0), 100);
    const boundedLightness = Math.min(Math.max(lightness, 0), 100);
    const chroma = boundedLightness > 99.9999999 || boundedLightness < 0.00000001
      ? 0
      : maxChromaForLightnessAndHue(boundedLightness, normalizedHue, matrix, kappa, epsilon) / 100 * boundedSaturation;
    const hueRad = normalizedHue / 360 * Math.PI * 2;
    const u = Math.cos(hueRad) * chroma;
    const v = Math.sin(hueRad) * chroma;
    if (boundedLightness <= 0) {
      return [0, 0, 0];
    }

    const varU = u / (13 * boundedLightness) + refU;
    const varV = v / (13 * boundedLightness) + refV;
    const y = boundedLightness > 8 ? Math.pow((boundedLightness + 16) / 116, 3) : boundedLightness / kappa;
    const x = -(9 * y * varU) / ((varU - 4) * varV - varU * varV);
    const z = (9 * y - 15 * varV * y - varV * x) / (3 * varV);
    return matrix.map((row) => {
      const linear = row[0] * x + row[1] * y + row[2] * z;
      const gamma = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
      return Math.round(Math.min(Math.max(gamma, 0), 1) * 255);
    });
  }

  function maxChromaForLightnessAndHue(lightness, hue, matrix, kappa, epsilon) {
    const hueRad = hue / 360 * Math.PI * 2;
    return getHsluvBounds(lightness, matrix, kappa, epsilon).reduce((best, line) => {
      const length = line.intercept / (Math.sin(hueRad) - line.slope * Math.cos(hueRad));
      return length >= 0 ? Math.min(best, length) : best;
    }, Number.POSITIVE_INFINITY);
  }

  function getHsluvBounds(lightness, matrix, kappa, epsilon) {
    const sub1 = Math.pow(lightness + 16, 3) / 1560896;
    const sub2 = sub1 > epsilon ? sub1 : lightness / kappa;
    const bounds = [];
    for (const row of matrix) {
      const [m1, m2, m3] = row;
      for (let t = 0; t <= 1; t++) {
        const top1 = (284517 * m1 - 94839 * m3) * sub2;
        const top2 = (838422 * m3 + 769860 * m2 + 731718 * m1) * lightness * sub2 - 769860 * t * lightness;
        const bottom = (632260 * m3 - 126452 * m2) * sub2 + 126452 * t;
        bounds.push({ slope: top1 / bottom, intercept: top2 / bottom });
      }
    }

    return bounds;
  }

  function utf8Bytes(value) {
    return Array.from(new TextEncoder().encode(value));
  }

  function sha1Bytes(bytes) {
    const words = [];
    for (let index = 0; index < bytes.length; index++) {
      words[index >> 2] = (words[index >> 2] || 0) | (bytes[index] << (24 - (index % 4) * 8));
    }

    const bitLength = bytes.length * 8;
    words[bitLength >> 5] = (words[bitLength >> 5] || 0) | (0x80 << (24 - bitLength % 32));
    words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength;

    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;
    const w = new Array(80);
    for (let block = 0; block < words.length; block += 16) {
      for (let i = 0; i < 80; i++) {
        w[i] = i < 16
          ? (words[block + i] || 0)
          : rotateLeft(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
      }

      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;
      for (let i = 0; i < 80; i++) {
        const f = i < 20 ? ((b & c) | ((~b) & d))
          : i < 40 ? (b ^ c ^ d)
            : i < 60 ? ((b & c) | (b & d) | (c & d))
              : (b ^ c ^ d);
        const k = i < 20 ? 0x5a827999
          : i < 40 ? 0x6ed9eba1
            : i < 60 ? 0x8f1bbcdc
              : 0xca62c1d6;
        const temp = (rotateLeft(a, 5) + f + e + k + w[i]) >>> 0;
        e = d;
        d = c;
        c = rotateLeft(b, 30);
        b = a;
        a = temp;
      }

      h0 = (h0 + a) >>> 0;
      h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0;
    }

    return [h0, h1, h2, h3, h4].flatMap((word) => [
      (word >>> 24) & 255,
      (word >>> 16) & 255,
      (word >>> 8) & 255,
      word & 255
    ]);
  }

  function rotateLeft(value, bits) {
    return (value << bits) | (value >>> (32 - bits));
  }

  function normalizeAvatarColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "#2563eb";
  }

  function isValidAvatarDataUrl(value) {
    const text = String(value || "");
    return text.length <= avatarMaxBytes * 2 && /^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(text);
  }

  function isAvatarSourceDataUrl(value) {
    const text = String(value || "");
    return text.length <= avatarSourceMaxBytes * 2 && /^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(text);
  }

  function dataUrlMediaType(value) {
    const match = String(value || "").match(/^data:([^;,]+);base64,/i);
    return match ? match[1].toLowerCase() : "";
  }

  function dataUrlPayloadBytes(value) {
    const comma = String(value || "").indexOf(",");
    if (comma < 0) {
      return [];
    }

    const binary = atob(String(value).slice(comma + 1));
    return Array.from(binary, (char) => char.charCodeAt(0));
  }

  function hexBytes(bytes) {
    return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function currentFromJid() {
    return el.jidInput.value.trim() || currentSenderName();
  }

  function currentXmppFromJid() {
    if (state.xmppSession?.boundJid) {
      return state.xmppSession.boundJid;
    }

    const accountJid = normalizeJidInput(currentFromJid());
    const localPart = bareJid(accountJid).split("@")[0] || "guest";
    const domain = state.account?.xmppDomain || domainFromJid(accountJid) || "localhost";
    const resource = `web-${state.clientInstance.resourceSuffix}`;
    return `${localPart}@${domain}/${resource}`;
  }

  function currentToJid() {
    const conversation = activeConversation();
    if (conversation?.peer) {
      return conversation.peer;
    }

    return el.peerInput.value.trim() || "tester@localhost";
  }

  function xmppMucNickname() {
    const from = bareJid(currentFromJid());
    return sanitizeXmppResource(currentSenderName())
      || sanitizeXmppResource(from.split("@")[0])
      || `web-${state.clientInstance.resourceSuffix}`;
  }

  function sanitizeXmppResource(value) {
    return String(value || "")
      .trim()
      .replace(/[<>&"']/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 48);
  }

  function resourceFromJid(jid) {
    const value = String(jid || "");
    return value.includes("/") ? value.split("/").slice(1).join("/") : "";
  }

  function isXmppGroupchatType(type) {
    return String(type || "").toLowerCase() === "groupchat";
  }

  function isXmppOwnGroupchatEcho(from, type) {
    return isXmppGroupchatType(type) && resourceFromJid(from).toLowerCase() === xmppMucNickname().toLowerCase();
  }

  function joinActiveXmppGroupConversation() {
    joinXmppGroupConversation(activeConversation());
  }

  function joinXmppGroupConversation(conversation) {
    if (conversation?.kind !== "group"
      || state.mode !== "xmpp"
      || state.xmppSocket?.readyState !== WebSocket.OPEN
      || !state.xmppSession?.authenticated
      || conversation.mucJoined) {
      return false;
    }

    const room = bareJid(conversation.peer);
    if (!room) {
      return false;
    }

    const occupant = `${room}/${xmppMucNickname()}`;
    const xml = `<presence xmlns="jabber:client" to="${escapeXml(occupant)}"><x xmlns="http://jabber.org/protocol/muc"><history maxchars="0"/></x></presence>`;
    const sent = sendXmppStanza(xml, `<presence to="${escapeXml(room)}/..." muc="join"/>`);
    conversation.mucJoined = sent || conversation.mucJoined;
    return sent;
  }

  function envelopeFrom(envelope) {
    return typeof envelope.from === "string" && envelope.from.trim()
      ? envelope.from.trim()
      : "";
  }

  function displayNameForJid(jid) {
    if (!jid) {
      return "Remote";
    }

    const normalized = normalizeJidInput(jid);
    const bare = bareJid(normalized);
    const lowerBare = bare.toLowerCase();
    if (lowerBare && lowerBare === currentBareJid()) {
      return currentSenderName();
    }

    if (normalized.startsWith("ai@") || lowerBare === "ai@localhost") {
      return "AI agent";
    }

    const known = state.conversations.find((conversation) =>
      conversation.kind === "contact"
      && addressMatches(conversation.peer, normalized)
      && conversation.name
      && conversation.name !== conversation.peer);
    if (known) {
      return conversationDisplayName(known);
    }

    const local = bare.split("@")[0] || normalized;
    const resource = normalized.includes("/") ? normalized.split("/").slice(1).join("/") : "";
    const generatedWebResource = /^web(?:-[a-z0-9]+)?$/i.test(resource);
    return resource && !generatedWebResource ? `${local}/${resource}` : local;
  }

  function applyRelayEnvelope(envelope) {
    if (!envelope) {
      return;
    }

    if (envelope.type === "error") {
      appendDebug("relay-error", envelope.message || JSON.stringify(envelope));
      setConnectionStatus(envelope.message || t("status.relay_error", "Relay error"), "danger");
      return;
    }

    if (envelope.type === "heartbeat") {
      return;
    }

    if (envelope.type !== "rtt" && envelope.type !== "message" && envelope.type !== "message-delete" && envelope.type !== "message-reaction" && envelope.type !== "message-ack" && envelope.type !== "jingle" && envelope.type !== "presence" && envelope.type !== "client-state" && envelope.type !== "location") {
      appendDebug("relay-skip", `Unsupported envelope type ${envelope.type || "unknown"}`);
      return;
    }

    appendDebug("relay-in", envelope.type === "rtt" || envelope.type === "jingle" || envelope.type === "client-state"
      ? envelope.xml || JSON.stringify(redactJingleForLog(envelope))
      : JSON.stringify(redactEnvelopeForLog(envelope)));

    if (envelope.clientId && envelope.clientId === state.clientInstance.id) {
      appendDebug("relay-skip", "Ignored own echoed envelope");
      return;
    }

    if (isBlockedEnvelope(envelope)) {
      appendDebug("block", `Ignored ${envelope.type} from ${envelopeFrom(envelope) || "unknown"}`);
      return;
    }

    if (envelope.type === "jingle") {
      handleJingleEnvelope(envelope);
      return;
    }

    if (envelope.type === "presence") {
      handlePresenceEnvelope(envelope);
      return;
    }

    if (envelope.type === "client-state") {
      handleClientStateEnvelope(envelope);
      return;
    }

    if (envelope.type === "location") {
      handleLocationEnvelope(envelope);
      return;
    }

    if (envelope.type === "message-delete") {
      handleRelayMessageDelete(envelope);
      return;
    }

    if (envelope.type === "message-reaction") {
      handleRelayMessageReaction(envelope);
      return;
    }

    if (envelope.type === "message-ack") {
      handleRelayMessageAck(envelope);
      return;
    }

    if (envelope.type === "message") {
      const conversation = conversationForEnvelope(envelope);
      if (!conversation) {
        return;
      }

      applyEnvelopeIdentity(conversation, envelope);
      conversation.remoteText = "";
      conversation.remoteFrom = envelopeFrom(envelope);
      conversation.remoteIdentity = mergeMessageIdentity(conversation.remoteIdentity, envelopeMessageIdentity(envelope));
      conversation.remoteDraftUpdatedAt = null;
      conversation.clientState = "active";
      conversation.clientStateUpdatedAt = new Date();
      setPeerPresence(conversation.peer, "online");
      sendRelayMessageAcknowledgements(conversation, envelope);
      recordTotalConversationTextForConversation(conversation, "peer", envelope.text ?? "", conversation.remoteFrom, {
        final: true
      });
      if (envelope.replaceId) {
        applyMessageCorrection(
          conversation,
          String(envelope.replaceId),
          envelope.text ?? "",
          "peer",
          typeof envelope.messageId === "string" ? envelope.messageId : null,
          conversation.remoteFrom);
      } else {
        addMessage(
          "peer",
          envelope.text ?? "",
          "received",
          conversation.remoteFrom,
          envelope.attachment ?? null,
          conversation.id,
          envelope.location ?? null,
          typeof envelope.messageId === "string" ? envelope.messageId : null,
          false,
          true,
          envelopeMessageIdentity(envelope));
      }
      return;
    }

    const conversation = conversationForEnvelope(envelope);
    if (!conversation) {
      return;
    }

    applyEnvelopeIdentity(conversation, envelope);
    conversation.remoteText = envelope.text ?? "";
    conversation.remoteFrom = envelopeFrom(envelope);
    conversation.remoteIdentity = mergeMessageIdentity(conversation.remoteIdentity, envelopeMessageIdentity(envelope));
    conversation.remoteDraftUpdatedAt = new Date();
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    setPeerPresence(conversation.peer, "online");
    recordTotalConversationTextForConversation(conversation, "peer", conversation.remoteText, conversation.remoteFrom);
    updateRemoteDraftMessage(conversation.id);
  }

  function handlePresenceEnvelope(envelope) {
    const from = envelopeFrom(envelope);
    if (!from || isOwnPeer(from)) {
      return;
    }

    const presence = envelope.presence === "offline" ? "offline" : "online";
    const conversation = ensureConversationForPeer(from, "contact", envelope.displayName || displayNameForJid(from));
    if (!conversation) {
      return;
    }

    applyEnvelopeIdentity(conversation, envelope);

    conversation.presence = presence;
    conversation.clientState = envelope.notificationState === "dnd" ? "dnd" : conversation.clientState;
    conversation.clientStateUpdatedAt = envelope.notificationState === "dnd" ? new Date() : conversation.clientStateUpdatedAt;
    if (presence === "offline") {
      conversation.clientState = null;
      conversation.clientStateUpdatedAt = null;
      conversation.lastSeenAt = new Date();
    } else if (envelope.notificationState !== "dnd" && conversation.clientState === "dnd") {
      conversation.clientState = "active";
      conversation.clientStateUpdatedAt = new Date();
    }
    renderConversations();
    renderActiveConversation();

    if (presence === "online" && envelope.probe) {
      sendPresence("online", { responseTo: from });
    }
  }

  function handleClientStateEnvelope(envelope) {
    const from = envelopeFrom(envelope);
    if (!from || isOwnPeer(from)) {
      return;
    }

    const clientState = envelope.notificationState === "dnd"
      ? "dnd"
      : (envelope.clientState === "inactive" ? "inactive" : "active");
    const conversation = ensureConversationForPeer(from, "contact", envelope.displayName || displayNameForJid(from));
    if (!conversation) {
      return;
    }

    applyEnvelopeIdentity(conversation, envelope);
    conversation.presence = "online";
    conversation.clientState = clientState;
    conversation.clientStateUpdatedAt = new Date();
    renderConversations();
    renderActiveConversation();
  }

  function handleRelayMessageDelete(envelope) {
    const targetId = typeof envelope.targetMessageId === "string" ? envelope.targetMessageId : "";
    if (!targetId) {
      return;
    }

    const conversation = conversationForEnvelope(envelope);
    if (!conversation) {
      return;
    }

    applyEnvelopeIdentity(conversation, envelope);
    conversation.remoteText = "";
    conversation.remoteFrom = envelopeFrom(envelope);
    conversation.remoteDraftUpdatedAt = null;
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    setPeerPresence(conversation.peer, "online");
    applyMessageRetraction(conversation, targetId, null, conversation.remoteFrom);
  }

  function handleRelayMessageReaction(envelope) {
    const conversation = conversationForEnvelope(envelope);
    if (!conversation) {
      return;
    }

    applyEnvelopeIdentity(conversation, envelope);
    conversation.presence = "online";
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    applyMessageReaction(
      conversation,
      String(envelope.reactionTargetId || ""),
      envelopeFrom(envelope),
      Array.isArray(envelope.reactions) ? envelope.reactions : []);
  }

  function handleRelayMessageAck(envelope) {
    const conversation = conversationForEnvelope(envelope);
    const ack = String(envelope.ack || "");
    if (!conversation || (ack !== "delivered" && ack !== "displayed")) {
      return;
    }

    applyMessageDeliveryMarker(conversation, String(envelope.targetMessageId || ""), ack);
  }

  function sendRelayMessageAcknowledgements(conversation, envelope) {
    const targetId = typeof envelope.messageId === "string" ? envelope.messageId : "";
    if (!targetId || state.relaySocket?.readyState !== WebSocket.OPEN || isOwnPeer(envelopeFrom(envelope))) {
      return;
    }

    sendRelayMessageAcknowledgement(conversation, targetId, "delivered");
    sendRelayMessageAcknowledgement(conversation, targetId, "displayed");
  }

  function sendRelayMessageAcknowledgement(conversation, targetId, ack) {
    const envelope = createRelayEnvelope("message-ack", "", "", conversation.peer);
    envelope.targetMessageId = targetId;
    envelope.messageId = createMessageId(`ack-${ack}`);
    envelope.ack = ack;
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("relay-ack-out", `${ack} ${targetId}`);
  }

  function syncAllConversationMessageState(reason = "manual") {
    for (const conversation of state.conversations) {
      syncConversationMessageState(conversation, reason);
    }
  }

  function syncConversationMessageState(conversation, reason = "manual") {
    if (!conversation || isOwnContact(conversation) || isBlockedConversation(conversation)) {
      return;
    }

    const now = Date.now();
    const syncKey = `${conversation.id}:${state.mode}`;
    const lastSync = state.messageStateSync.get(syncKey) || 0;
    if (now - lastSync < 5000) {
      return;
    }
    let sent = 0;
    for (const message of conversation.messages) {
      const targetId = bestMessageTargetId(message);
      if (!targetId) {
        continue;
      }

      if (message.direction === "peer") {
        sent += sendStoredMessageReadState(conversation, targetId);
      }

      if (sendStoredOwnReaction(conversation, message, targetId)) {
        sent += 1;
      }
    }

    if (sent > 0) {
      state.messageStateSync.set(syncKey, now);
      appendDebug("message-state-sync", `${reason} ${conversation.peer}: ${sent}`);
    }
  }

  function sendStoredMessageReadState(conversation, targetId) {
    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN && state.xmppSession?.authenticated) {
      sendXmppStanza(createDeliveryReceiptStanza(conversation.peer, targetId), "<message receipt=\"sync\"/>");
      sendXmppStanza(createDisplayedMarkerStanza(conversation.peer, targetId), "<message marker=\"sync\"/>");
      return 2;
    }

    if (state.relaySocket?.readyState === WebSocket.OPEN) {
      sendRelayMessageAcknowledgement(conversation, targetId, "delivered");
      sendRelayMessageAcknowledgement(conversation, targetId, "displayed");
      return 2;
    }

    return 0;
  }

  function sendStoredOwnReaction(conversation, message, targetId) {
    const reactions = normalizeMessageReactions(message.reactions)[reactionActorId()] || [];
    if (!reactions.length) {
      return false;
    }

    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN && state.xmppSession?.authenticated) {
      sendXmppStanza(createMessageReactionStanza(conversation.peer, targetId, reactions), "<message reactions=\"sync\"/>");
      return true;
    }

    if (state.relaySocket?.readyState === WebSocket.OPEN) {
      const envelope = createRelayEnvelope("message-reaction", "", "", conversation.peer);
      envelope.reactionTargetId = targetId;
      envelope.reactions = reactions;
      envelope.messageId = createMessageId("react-sync");
      state.relaySocket.send(JSON.stringify(envelope));
      appendDebug("relay-reaction-sync-out", targetId);
      return true;
    }

    return false;
  }

  function handleLocationEnvelope(envelope) {
    const conversation = conversationForEnvelope(envelope);
    if (!conversation) {
      return;
    }

    applyEnvelopeIdentity(conversation, envelope);
    conversation.presence = "online";
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    const senderIdentity = envelopeMessageIdentity(envelope);
    if (envelope.locationAction === "stop") {
      addMessage(
        "peer",
        envelope.text || t("location.stopped_message", "Location sharing stopped."),
        "location",
        envelopeFrom(envelope),
        null,
        conversation.id,
        null,
        null,
        false,
        true,
        senderIdentity);
      return;
    }

    const location = normalizeIncomingLocation(envelope.location);
    const text = envelope.text || (location ? locationMessageText(location) : t("location.shared_message", "Location shared"));
    const from = envelopeFrom(envelope);
    if (envelope.locationAction === "live") {
      upsertLiveLocationMessage("peer", text, "location live", from, conversation.id, location, senderIdentity);
    } else {
      addMessage("peer", text, "location", from, null, conversation.id, location, typeof envelope.messageId === "string" ? envelope.messageId : null, false, true, senderIdentity);
    }
  }

  function normalizeIncomingLocation(location) {
    if (!location || typeof location !== "object") {
      return null;
    }

    const lat = Number(location.lat);
    const lon = Number(location.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    return {
      lat,
      lon,
      accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
      alt: Number.isFinite(Number(location.alt)) ? Number(location.alt) : null,
      altaccuracy: Number.isFinite(Number(location.altaccuracy)) ? Number(location.altaccuracy) : null,
      bearing: Number.isFinite(Number(location.bearing)) ? Number(location.bearing) : null,
      speed: Number.isFinite(Number(location.speed)) ? Number(location.speed) : null,
      timestamp: typeof location.timestamp === "string" ? location.timestamp : new Date().toISOString(),
      text: typeof location.text === "string" ? location.text : "",
      source: "xep-0080"
    };
  }

  function applyEnvelopeIdentity(conversation, envelope) {
    if (!conversation || conversation.kind === "group") {
      return;
    }

    if (typeof envelope.displayName === "string" && envelope.displayName.trim()) {
      conversation.name = envelope.displayName.trim();
      delete conversation.nameKey;
    }

    if (typeof envelope.avatarColor === "string" && envelope.avatarColor.trim()) {
      conversation.avatarColor = normalizeAvatarColor(envelope.avatarColor);
    }

    if (isValidAvatarDataUrl(envelope.avatarDataUrl)) {
      conversation.avatarDataUrl = envelope.avatarDataUrl;
    } else if (envelope.avatarDataUrl === "") {
      conversation.avatarDataUrl = "";
    }
  }

  function applyMediaSettingsToControls() {
    setMediaControlValues();
    renderMediaDeviceSelects();
    applyRemoteVolume();
  }

  async function refreshMediaDevices(requestPermission) {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMediaStatus(t("media.unsupported", "Media device selection is not available in this browser."));
      return;
    }

    if (requestPermission) {
      await unlockMediaDeviceLabels();
    }

    try {
      state.mediaDevices = await navigator.mediaDevices.enumerateDevices();
      renderMediaDeviceSelects();
      const cameras = state.mediaDevices.filter((device) => device.kind === "videoinput").length;
      const microphones = state.mediaDevices.filter((device) => device.kind === "audioinput").length;
      setMediaStatus(`${t("media.devices_loaded", "Devices loaded")}: ${cameras} ${t("media.cameras", "cameras")}, ${microphones} ${t("media.microphones", "microphones")}`);
    } catch (error) {
      setMediaStatus(`${t("media.load_failed", "Could not load media devices")}: ${error.message}`);
    }
  }

  async function unlockMediaDeviceLabels() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return;
    }

    try {
      markMediaCaptureTransition("unlock-media-labels", 12000);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stopStream(stream);
    } catch (error) {
      appendDebug("media-permission", error.message);
      for (const constraints of [{ audio: true, video: false }, { audio: false, video: true }]) {
        try {
          markMediaCaptureTransition("unlock-media-labels-fallback", 8000);
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          stopStream(stream);
        } catch {
          // Best effort: labels remain hidden until the browser grants access.
        }
      }
    }
  }

  function renderMediaDeviceSelects() {
    const cameras = state.mediaDevices.filter((device) => device.kind === "videoinput");
    const microphones = state.mediaDevices.filter((device) => device.kind === "audioinput");
    for (const select of [el.cameraInput, el.dialogCameraInput, el.callCameraInput]) {
      renderDeviceSelect(
        select,
        cameras,
        state.mediaSettings.cameraDeviceId,
        t("media.default_camera", "Default camera"),
        t("media.camera", "Camera"));
    }
    for (const select of [el.microphoneInput, el.dialogMicrophoneInput, el.callMicrophoneInput]) {
      renderDeviceSelect(
        select,
        microphones,
        state.mediaSettings.microphoneDeviceId,
        t("media.default_microphone", "Default microphone"),
        t("media.microphone", "Microphone"));
    }
    setMediaControlValues();
  }

  function renderDeviceSelect(select, devices, selectedValue, defaultLabel, fallbackLabel) {
    if (!select) {
      return;
    }
    const visibleDevices = devices.filter((device) => shouldShowMediaDeviceOption(device, devices));
    select.replaceChildren(new Option(defaultLabel, ""));
    visibleDevices.forEach((device, index) => {
      select.appendChild(new Option(cleanMediaDeviceLabel(device.label) || `${fallbackLabel} ${index + 1}`, device.deviceId));
    });

    select.value = visibleDevices.some((device) => device.deviceId === selectedValue)
      ? selectedValue
      : "";
  }

  function shouldShowMediaDeviceOption(device, devices) {
    if (!isAppleMobileBrowser()) {
      return true;
    }

    return devices.length > 1 || Boolean(String(device.label || "").trim());
  }

  function setMediaControlValues() {
    const videoQuality = state.mediaSettings.videoQuality || "default";
    for (const select of [el.videoQualityInput, el.dialogVideoQualityInput, el.videoRecorderQualityInput]) {
      if (select) {
        select.value = videoQuality;
      }
    }
    updateVideoRecorderQualityPicker();
    updateVideoRecorderCameraPicker();
    const facingMode = normalizeVideoFacingMode(state.mediaSettings.videoMessageFacingMode);
    for (const select of [el.videoMessageFacingInput, el.dialogVideoMessageFacingInput, el.callVideoFacingInput]) {
      if (select) {
        select.value = facingMode;
      }
    }
    syncCallVideoFacingToggle();
  }

  function updateVideoRecorderQualityPicker() {
    const select = el.videoRecorderQualityInput;
    const button = el.videoRecorderQualityButton;
    const label = el.videoRecorderQualityLabel;
    const menu = el.videoRecorderQualityMenu;
    if (!select || !button || !label || !menu) {
      return;
    }

    if (!select.value && select.options.length) {
      select.value = "default";
    }

    const selectedOption = select.selectedOptions?.[0] || select.options[select.selectedIndex] || select.options[0];
    label.replaceChildren(createVideoQualityLabel(selectedOption));
    button.setAttribute("aria-label", `${t("label.video_quality", "Video quality")}: ${videoQualityOptionText(selectedOption)}`);
    menu.replaceChildren(...Array.from(select.options).map((option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "video-quality-option";
      item.dataset.value = option.value;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", option.value === select.value ? "true" : "false");
      item.appendChild(createVideoQualityLabel(option));
      return item;
    }));
  }

  function createVideoQualityLabel(option) {
    const wrapper = document.createElement("span");
    wrapper.className = "video-quality-label";
    const text = document.createElement("span");
    text.textContent = option?.textContent || "Auto";
    wrapper.appendChild(text);
    const badgeValue = option?.dataset?.badge || "";
    if (badgeValue) {
      const badge = document.createElement("span");
      badge.className = "video-quality-badge";
      badge.textContent = badgeValue;
      wrapper.appendChild(badge);
    }
    return wrapper;
  }

  function videoQualityOptionText(option) {
    const text = option?.textContent || "Auto";
    const badge = option?.dataset?.badge || "";
    return badge ? `${text} ${badge}` : text;
  }

  function toggleVideoRecorderQualityMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!el.videoRecorderQualityMenu || !el.videoRecorderQualityButton) {
      return;
    }

    const open = el.videoRecorderQualityMenu.hidden;
    updateVideoRecorderQualityPicker();
    closeVideoRecorderCameraMenu();
    if (open) {
      positionVideoRecorderMenu(el.videoRecorderQualityMenu, el.videoRecorderQualityButton);
    }
    el.videoRecorderQualityMenu.hidden = !open;
    el.videoRecorderQualityButton.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeVideoRecorderQualityMenu() {
    if (!el.videoRecorderQualityMenu || el.videoRecorderQualityMenu.hidden) {
      return;
    }

    el.videoRecorderQualityMenu.hidden = true;
    el.videoRecorderQualityButton?.setAttribute("aria-expanded", "false");
  }

  function closeVideoRecorderQualityMenuOnOutsideClick(event) {
    if (event.target?.closest?.(".video-recorder-quality, .video-quality-menu, .video-recorder-camera, .video-camera-menu")) {
      return;
    }
    closeVideoRecorderQualityMenu();
    closeVideoRecorderCameraMenu();
  }

  function closeVideoRecorderQualityMenuOnEscape(event) {
    if (event.key === "Escape") {
      closeVideoRecorderQualityMenu();
      closeVideoRecorderCameraMenu();
    }
  }

  function handleVideoRecorderQualityMenuClick(event) {
    const option = event.target?.closest?.(".video-quality-option");
    if (!option || !el.videoRecorderQualityInput) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    el.videoRecorderQualityInput.value = option.dataset.value || "default";
    el.videoRecorderQualityInput.dispatchEvent(new Event("change", { bubbles: true }));
    updateVideoRecorderQualityPicker();
    closeVideoRecorderQualityMenu();
    el.videoRecorderQualityButton?.focus();
  }

  function updateVideoRecorderCameraPicker() {
    const button = el.videoRecorderCameraButton;
    const label = el.videoRecorderCameraLabel;
    const menu = el.videoRecorderCameraMenu;
    if (!button || !label || !menu) {
      return;
    }

    const options = videoRecorderCameraOptions();
    const selected = options.find((option) => option.selected) || options[0];
    label.textContent = selected?.label || t("media.camera", "Camera");
    button.setAttribute("aria-label", `${t("label.camera", "Camera")}: ${label.textContent}`);
    menu.replaceChildren(...options.map((option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "video-camera-option";
      item.dataset.value = option.value;
      item.dataset.mode = option.mode;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", option === selected ? "true" : "false");
      item.textContent = option.label;
      return item;
    }));
  }

  function videoRecorderCameraOptions() {
    if (usesFacingCameraPicker()) {
      const mode = normalizeVideoFacingMode(state.mediaSettings.videoMessageFacingMode);
      return [
        { mode: "facing", value: "user", label: t("camera.front", "Front camera"), selected: mode === "user" },
        { mode: "facing", value: "environment", label: t("camera.back", "Back camera"), selected: mode === "environment" }
      ];
    }

    const cameras = state.mediaDevices
      .filter((device) => device.kind === "videoinput")
      .filter((device) => shouldShowMediaDeviceOption(device, state.mediaDevices.filter((item) => item.kind === "videoinput")));
    const selectedDeviceId = normalizeSelectedMediaDeviceId(state.mediaSettings.cameraDeviceId, "videoinput");
    return [
      {
        mode: "device",
        value: "",
        label: t("media.default_camera", "Default camera"),
        selected: !selectedDeviceId
      },
      ...cameras.map((device, index) => ({
        mode: "device",
        value: device.deviceId,
        label: cleanMediaDeviceLabel(device.label) || `${t("media.camera", "Camera")} ${index + 1}`,
        selected: selectedDeviceId === device.deviceId
      }))
    ];
  }

  function cleanMediaDeviceLabel(label) {
    return String(label || "")
      .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "")
      .replace(/\s*\[[0-9a-f]{4}:[0-9a-f]{4}\]\s*$/i, "")
      .trim();
  }

  function usesFacingCameraPicker() {
    return document.body.dataset.platform === "ios"
      || document.body.dataset.platform === "android"
      || (isPhoneViewport() && state.mediaDevices.filter((device) => device.kind === "videoinput").length <= 2);
  }

  function toggleVideoRecorderCameraMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!el.videoRecorderCameraMenu || !el.videoRecorderCameraButton) {
      return;
    }

    const open = el.videoRecorderCameraMenu.hidden;
    updateVideoRecorderCameraPicker();
    closeVideoRecorderQualityMenu();
    if (open) {
      positionVideoRecorderMenu(el.videoRecorderCameraMenu, el.videoRecorderCameraButton);
    }
    el.videoRecorderCameraMenu.hidden = !open;
    el.videoRecorderCameraButton.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function positionVideoRecorderMenu(menu, button) {
    const card = el.videoPreviewDialog?.querySelector(".video-preview-dialog-card");
    if (!menu || !button || !card) {
      return;
    }

    menu.hidden = false;
    const cardRect = card.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gap = 8;
    const minLeft = 10;
    const maxLeft = Math.max(minLeft, cardRect.width - menuRect.width - minLeft);
    const preferredLeft = buttonRect.left - cardRect.left;
    const left = Math.max(minLeft, Math.min(maxLeft, preferredLeft));
    const bottom = Math.max(48, cardRect.bottom - buttonRect.top + gap);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.bottom = `${Math.round(bottom)}px`;
  }

  function closeVideoRecorderCameraMenu() {
    if (!el.videoRecorderCameraMenu || el.videoRecorderCameraMenu.hidden) {
      return;
    }

    el.videoRecorderCameraMenu.hidden = true;
    el.videoRecorderCameraButton?.setAttribute("aria-expanded", "false");
  }

  function handleVideoRecorderCameraMenuClick(event) {
    const option = event.target?.closest?.(".video-camera-option");
    if (!option) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (option.dataset.mode === "facing") {
      if (el.videoMessageFacingInput) {
        el.videoMessageFacingInput.value = option.dataset.value || "user";
      }
    } else if (el.cameraInput) {
      el.cameraInput.value = option.dataset.value || "";
    }
    handleMediaSettingsChange("video", "recorder");
    updateVideoRecorderCameraPicker();
    closeVideoRecorderCameraMenu();
    el.videoRecorderCameraButton?.focus();
  }

  async function toggleCallVideoFacingMode() {
    const currentMode = normalizeVideoFacingMode(el.callVideoFacingInput?.value || state.mediaSettings.videoMessageFacingMode);
    if (el.callVideoFacingInput) {
      el.callVideoFacingInput.value = currentMode === "user" ? "environment" : "user";
    }
    await handleMediaSettingsChange("video", "call");
    syncCallVideoFacingToggle();
  }

  function syncCallVideoFacingToggle() {
    if (!el.callVideoFacingToggle) {
      return;
    }
    const mode = normalizeVideoFacingMode(el.callVideoFacingInput?.value || state.mediaSettings.videoMessageFacingMode);
    const label = mode === "user"
      ? t("camera.front", "Front camera")
      : t("camera.back", "Back camera");
    const title = `${t("button.switch_camera", "Switch camera")}: ${label}`;
    el.callVideoFacingToggle.title = title;
    el.callVideoFacingToggle.setAttribute("aria-label", title);
  }

  function mediaControlsForSource(source) {
    if (source === "call") {
      return {
        camera: el.callCameraInput,
        microphone: el.callMicrophoneInput,
        quality: el.videoQualityInput,
        facing: el.callVideoFacingInput
      };
    }

    if (source === "recorder") {
      return {
        camera: el.cameraInput,
        microphone: el.microphoneInput,
        quality: el.videoRecorderQualityInput,
        facing: el.videoMessageFacingInput
      };
    }

    return source === "dialog"
      ? {
        camera: el.dialogCameraInput,
        microphone: el.dialogMicrophoneInput,
        quality: el.dialogVideoQualityInput,
        facing: el.dialogVideoMessageFacingInput
      }
      : {
        camera: el.cameraInput,
        microphone: el.microphoneInput,
        quality: el.videoQualityInput,
        facing: el.videoMessageFacingInput
      };
  }

  function saveMediaSettingsFromControls(announce = true, source = "main") {
    const controls = mediaControlsForSource(source);
    state.mediaSettings = {
      cameraDeviceId: normalizeSelectedMediaDeviceId(controls.camera?.value, "videoinput"),
      microphoneDeviceId: normalizeSelectedMediaDeviceId(controls.microphone?.value, "audioinput"),
      videoQuality: controls.quality?.value || state.mediaSettings.videoQuality || "default",
      videoMessageFacingMode: normalizeVideoFacingMode(controls.facing?.value || state.mediaSettings.videoMessageFacingMode),
      remoteVolume: Number.isFinite(Number(state.mediaSettings.remoteVolume))
        ? state.mediaSettings.remoteVolume
        : 1,
      remoteSoundMuted: Boolean(state.mediaSettings.remoteSoundMuted)
    };
    localStorage.setItem(mediaSettingsStorageKey, JSON.stringify(state.mediaSettings));
    renderMediaDeviceSelects();
    if (announce) {
      setMediaStatus(t("media.saved", "Media settings saved. They are used for the next call or preview."));
    }
  }

  function normalizeSelectedMediaDeviceId(deviceId, kind) {
    const value = String(deviceId ?? "").trim();
    if (!value) {
      return "";
    }

    if (!isAppleMobileBrowser()) {
      return value;
    }

    const devices = state.mediaDevices.filter((device) => device.kind === kind);
    const device = devices.find((item) => item.deviceId === value);
    if (device && !shouldShowMediaDeviceOption(device, devices)) {
      return "";
    }

    return value;
  }

  async function handleMediaSettingsChange(kind, source = "main") {
    saveMediaSettingsFromControls(false, source);
    if ((source === "dialog" || source === "recorder")
      && state.videoRecorder.previewStream
      && !state.videoRecorder.blob
      && state.videoRecorder.recorder?.state !== "recording") {
      startVideoDialogPreview();
      setMediaStatus(t("media.saved", "Media settings saved. They are used for the next call or preview."));
      return;
    }

    const call = state.call;
    if (!call?.localStream || !call.pc) {
      setMediaStatus(t("media.saved", "Media settings saved. They are used for the next call or preview."));
      return;
    }

    if (kind === "video" && call.mediaKind !== "video") {
      setMediaStatus(t("media.video_next_call", "Camera settings apply to the next video call."));
      return;
    }

    try {
      setMediaStatus(kind === "audio"
        ? t("media.switching_microphone", "Switching microphone...")
        : t("media.switching_camera", "Switching camera..."));
      await replaceLocalMediaTrack(kind);
      setMediaStatus(kind === "audio"
        ? t("media.microphone_switched", "Microphone switched for this call.")
        : t("media.camera_switched", "Camera switched for this call."));
    } catch (error) {
      setMediaStatus(`${kind === "audio"
        ? t("media.microphone_switch_failed", "Microphone switch failed")
        : t("media.camera_switch_failed", "Camera switch failed")}: ${error.message}`);
    }
  }

  function saveRemoteVolumeFromControl() {
    const value = Number(el.remoteVolumeInput.value);
    state.mediaSettings.remoteVolume = Number.isFinite(value)
      ? Math.min(1, Math.max(0, value / 100))
      : 1;
    state.mediaSettings.remoteSoundMuted = state.mediaSettings.remoteVolume === 0;
    localStorage.setItem(mediaSettingsStorageKey, JSON.stringify(state.mediaSettings));
    applyRemoteVolume();
  }

  function applyRemoteVolume() {
    const rawVolume = Number(state.mediaSettings.remoteVolume ?? 1);
    const volume = Number.isFinite(rawVolume) ? Math.min(1, Math.max(0, rawVolume)) : 1;
    const percent = Math.round(volume * 100);
    const muted = Boolean(state.mediaSettings.remoteSoundMuted) || volume === 0;
    el.remoteVideo.volume = volume;
    el.remoteVideo.muted = muted;
    el.remoteVolumeInput.value = String(percent);
    el.remoteVolumeValue.textContent = `${percent}%`;
    setIconButtonAction(
      el.muteRemoteAudioButton,
      muted ? "volumeOff" : "volumeUp",
      muted ? "button.unmute_sound" : "button.mute_sound",
      muted ? "Unmute sound" : "Mute sound",
      muted
    );
  }

  function setIconButtonAction(button, iconName, labelKey, fallback, selected = false) {
    if (!button) {
      return;
    }

    const label = t(labelKey, fallback);
    const icon = button.querySelector("[data-icon]");
    if (icon) {
      icon.dataset.icon = iconName;
    }

    const srText = button.querySelector(".sr-only");
    if (srText) {
      srText.textContent = label;
    }

    button.setAttribute("title", label);
    button.setAttribute("aria-label", label);
    button.classList.toggle("selected", selected);
    renderMaterialIcons(button);
  }

  async function previewMedia() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaStatus(mediaAccessUnavailableMessage());
      return;
    }

    stopMediaPreview();
    saveMediaSettingsFromControls();

    try {
      markMediaCaptureTransition("media-preview", 12000);
      const stream = await navigator.mediaDevices.getUserMedia(createMediaConstraints("video"));
      state.mediaPreviewStream = stream;
      updateVideoElementSource(el.localVideo, stream);
      el.callPanel.hidden = false;
      await refreshMediaDevices(false);
      setMediaStatus(t("media.previewing", "Previewing selected camera and microphone."));
    } catch (error) {
      setMediaStatus(`${t("media.preview_failed", "Preview failed")}: ${error.message}`);
    }
  }

  function stopMediaPreview() {
    if (!state.mediaPreviewStream) {
      return;
    }

    stopStream(state.mediaPreviewStream);
    state.mediaPreviewStream = null;
    if (!state.call?.localStream) {
      updateVideoElementSource(el.localVideo, null);
    }

    if (!state.call?.localStream && !state.call?.remoteStream) {
      el.callPanel.hidden = true;
    }
    updateCallUi();

    setMediaStatus(t("media.preview_stopped", "Preview stopped."));
  }

  function envelopeMessageIdentity(envelope) {
    const peer = envelopeFrom(envelope);
    return {
      displayName: typeof envelope?.displayName === "string" && envelope.displayName.trim()
        ? envelope.displayName.trim()
        : displayNameForJid(peer),
      peer,
      avatarColor: typeof envelope?.avatarColor === "string" && envelope.avatarColor.trim()
        ? normalizeAvatarColor(envelope.avatarColor)
        : avatarColorFor(peer || "remote"),
      avatarDataUrl: isValidAvatarDataUrl(envelope?.avatarDataUrl) ? envelope.avatarDataUrl : ""
    };
  }

  function mergeMessageIdentity(previous, next) {
    return {
      displayName: next?.displayName || previous?.displayName || "",
      peer: next?.peer || previous?.peer || "",
      avatarColor: next?.avatarColor || previous?.avatarColor || "",
      avatarDataUrl: isValidAvatarDataUrl(next?.avatarDataUrl)
        ? next.avatarDataUrl
        : (isValidAvatarDataUrl(previous?.avatarDataUrl) ? previous.avatarDataUrl : "")
    };
  }

  async function startCall(mediaKind) {
    if (!hasActiveConversation()) {
      setCallStatus(t("call.select_contact_first", "Select a contact first."));
      return;
    }

    if (isActiveConversationBlocked()) {
      setCallStatus(t("status.contact_blocked_cannot_send", "This contact is blocked. Unblock to send messages."));
      return;
    }

    if (!supportsWebRtc()) {
      setCallStatus(t("call.unsupported", "WebRTC is not available in this browser."));
      return;
    }

    if (state.call) {
      setCallStatus(t("call.already_active", "A call is already active."));
      return;
    }

    const mode = normalizeCallMode(mediaKind);
    const sid = "td-" + createShortId();
    const call = createCallState(sid, currentToJid(), "caller", mode.mediaKind, mode.rttEnabled);
    state.call = call;
    updateCallUi();
    setCallStatus(t("call.starting", "Starting call..."));

    try {
      await ensureXmppCallSignalingReady();
      await openLocalMedia(call);
      createPeerConnection(call);
      const offer = await call.pc.createOffer();
      appendSdpDebug("offer-created", offer.sdp);
      await call.pc.setLocalDescription(offer);
      appendSdpDebug("offer-local", call.pc.localDescription?.sdp);
      await ensureXmppCallSignalingReady();
      sendJingleEnvelope("session-initiate", {
        sid: call.sid,
        mediaKind: call.mediaKind,
        sdp: offer.sdp,
        descriptionType: offer.type,
        rttSync: call.rttSync
      });
      setCallStatus(t("call.ringing", "Ringing..."));
      addCallNotificationMessage(call, "started", callStartedText(call));
    } catch (error) {
      setCallStatus(`${t("call.failed", "Call failed")}: ${error.message}`);
      cleanupCall(false, "failed");
    }
  }

  async function answerIncomingCall() {
    const call = state.call;
    if (!call?.incomingOffer) {
      return;
    }

    setCallStatus(t("call.answering", "Answering..."));
    try {
      await openLocalMedia(call);
      createPeerConnection(call);
      await call.pc.setRemoteDescription({ type: "offer", sdp: call.incomingOffer });
      appendSdpDebug("offer-remote", call.incomingOffer);
      call.remoteDescriptionSet = true;
      await flushPendingIceCandidates(call);
      const answer = await call.pc.createAnswer();
      appendSdpDebug("answer-created", answer.sdp);
      await call.pc.setLocalDescription(answer);
      appendSdpDebug("answer-local", call.pc.localDescription?.sdp);
      await ensureXmppCallSignalingReady();
      sendJingleEnvelope("session-accept", {
        sid: call.sid,
        mediaKind: call.mediaKind,
        sdp: answer.sdp,
        descriptionType: answer.type,
        rttSync: call.rttSync
      });
      call.incomingOffer = null;
      closeIncomingCallBrowserNotification();
      setCallStatus(jingleRttSyncStatusText(call));
      updateCallUi();
    } catch (error) {
      setCallStatus(`${t("call.failed", "Call failed")}: ${error.message}`);
      sendJingleEnvelope("session-terminate", {
        sid: call.sid,
        reason: "failed-application",
        reasonText: error.message
      });
      cleanupCall(false, "failed");
    }
  }

  function rejectIncomingCall() {
    const call = state.call;
    if (!call) {
      return;
    }

    sendJingleEnvelope("session-terminate", {
      sid: call.sid,
      reason: "decline",
      reasonText: t("call.rejected", "Call rejected")
    });
    closeIncomingCallBrowserNotification();
    cleanupCall(false, "rejected");
    setCallStatus(t("call.rejected", "Call rejected"));
  }

  function hangupCall() {
    const call = state.call;
    if (!call) {
      return;
    }

    sendJingleEnvelope("session-terminate", {
      sid: call.sid,
      reason: "success",
      reasonText: t("call.ended", "Call ended")
    });
    cleanupCall(false, "ended");
    setCallStatus(t("call.ended", "Call ended"));
  }

  function toggleMicrophoneMute() {
    const tracks = state.call?.localStream?.getAudioTracks() ?? [];
    if (!tracks.length) {
      return;
    }

    const shouldMute = tracks.some((track) => track.enabled);
    for (const track of tracks) {
      track.enabled = !shouldMute;
    }

    updateCallUi();
  }

  function toggleCameraVideo() {
    const call = state.call;
    const tracks = call?.localStream?.getVideoTracks() ?? [];
    if (!call || !tracks.length) {
      return;
    }

    const shouldTurnOff = tracks.some((track) => track.enabled);
    for (const track of tracks) {
      track.enabled = !shouldTurnOff;
    }

    sendJingleEnvelope("session-info", {
      sid: call.sid,
      mediaKind: "video",
      info: shouldTurnOff ? "mute" : "unmute"
    });
    setCallStatus(shouldTurnOff
      ? t("call.camera_off_local", "Camera off")
      : t("call.camera_on_local", "Camera on"));
    updateCallUi();
  }

  function toggleRemoteAudioMute() {
    const rawVolume = Number(state.mediaSettings.remoteVolume ?? 1);
    const volume = Number.isFinite(rawVolume) ? Math.min(1, Math.max(0, rawVolume)) : 1;
    const currentlyMuted = Boolean(state.mediaSettings.remoteSoundMuted) || volume === 0;
    state.mediaSettings.remoteSoundMuted = !currentlyMuted;
    if (currentlyMuted && volume === 0) {
      state.mediaSettings.remoteVolume = 1;
    }

    localStorage.setItem(mediaSettingsStorageKey, JSON.stringify(state.mediaSettings));
    applyRemoteVolume();
  }

  function toggleTotalConversationText() {
    state.totalConversationTextVisible = !state.totalConversationTextVisible;
    updateCallUi();
  }

  function handleJingleEnvelope(envelope) {
    if (!isAddressedToMe(envelope)) {
      appendDebug("jingle-skip", `Ignored ${envelope.action || "jingle"} for ${envelope.to || "unknown"}; this client is ${currentFromJid()}`);
      return;
    }

    const action = String(envelope.action ?? "");
    if (action === "session-initiate") {
      handleIncomingSessionInitiate(envelope);
    } else if (action === "session-accept") {
      handleIncomingSessionAccept(envelope);
    } else if (action === "transport-info") {
      handleIncomingTransportInfo(envelope);
    } else if (action === "session-info") {
      handleIncomingSessionInfo(envelope);
    } else if (action === "session-terminate") {
      cleanupCall(false, state.call?.incomingOffer ? "missed" : "ended");
      setCallStatus(envelope.reasonText || t("call.remote_ended", "Remote ended the call"));
    }
  }

  function handleIncomingSessionInitiate(envelope) {
    if (!envelope.sdp || typeof envelope.sdp !== "string") {
      appendDebug("jingle-error", "session-initiate without SDP");
      return;
    }

    if (state.call) {
      sendJingleEnvelope("session-terminate", {
        sid: envelope.sid,
        to: envelope.from,
        reason: "busy",
        reasonText: t("call.busy", "Busy")
      });
      return;
    }

    const callerPeer = envelopeFrom(envelope);
    if (state.doNotDisturb) {
      sendJingleEnvelope("session-terminate", {
        sid: envelope.sid,
        to: callerPeer,
        reason: "busy",
        reasonText: t("call.do_not_disturb", "Do not disturb")
      });
      setCallStatus(t("call.do_not_disturb_rejected", "Call rejected because Do not disturb is on."));
      appendDebug("jingle-dnd", `Rejected incoming call from ${callerPeer || "unknown"}`);
      return;
    }

    const roomPeer = groupRoomFromJingleEnvelope(envelope);
    const call = createCallState(
      String(envelope.sid || "td-" + createShortId()),
      callerPeer,
      "receiver",
      envelope.mediaKind === "video" ? "video" : "audio",
      Boolean(envelope.rttSync));
    call.roomJid = roomPeer;
    call.rttSync = call.rttEnabled
      ? normalizeJingleRttSyncDescriptor(envelope.rttSync, call.sid, "offered")
      : null;
    call.incomingOffer = envelope.sdp;
    state.call = call;
    updateCallUi();
    const conversationPeer = roomPeer || call.peer;
    const conversation = ensureConversationForPeer(
      conversationPeer,
      roomPeer ? "group" : "contact",
      displayNameForJid(conversationPeer));
    if (conversation) {
      applyEnvelopeIdentity(conversation, envelope);
      selectConversation(conversation);
      el.peerInput.value = conversation.peer;
    }

    sendJingleEnvelope("session-info", {
      sid: call.sid,
      to: call.peer,
      info: "ringing"
    });
    setCallStatus(`${t("call.incoming", "Incoming call from")} ${displayNameForJid(call.peer)}`);
    addCallNotificationMessage(call, "started", incomingCallTitle(call), conversation);
    renderConversations();
    renderActiveConversation();
    updateCallUi();
  }

  async function handleIncomingSessionAccept(envelope) {
    const call = state.call;
    if (!call || call.sid !== envelope.sid || !envelope.sdp || !call.pc) {
      return;
    }

    try {
      if (call.roomJid && envelopeFrom(envelope)) {
        call.peer = envelopeFrom(envelope);
      }
      if (envelope.rttSync || call.rttEnabled) {
        call.rttEnabled = true;
        call.callMode = callModeName(call.mediaKind, true);
        call.rttSync = normalizeJingleRttSyncDescriptor(envelope.rttSync || call.rttSync, call.sid, "accepted");
      }
      await call.pc.setRemoteDescription({ type: "answer", sdp: envelope.sdp });
      appendSdpDebug("answer-remote", envelope.sdp);
      call.remoteDescriptionSet = true;
      await flushPendingIceCandidates(call);
      setCallStatus(jingleRttSyncStatusText(call));
      updateCallUi();
    } catch (error) {
      setCallStatus(`${t("call.failed", "Call failed")}: ${error.message}`);
    }
  }

  async function handleIncomingTransportInfo(envelope) {
    const call = state.call;
    if (!call || call.sid !== envelope.sid || !envelope.candidate) {
      return;
    }

    if (!call.pc || !call.remoteDescriptionSet) {
      call.pendingCandidates.push(envelope.candidate);
      return;
    }

    try {
      await call.pc.addIceCandidate(new RTCIceCandidate(envelope.candidate));
    } catch (error) {
      appendDebug("jingle-ice-error", error.message);
    }
  }

  function handleIncomingSessionInfo(envelope) {
    const call = state.call;
    if (call && (!envelope.sid || call.sid === envelope.sid) && envelope.mediaKind === "video") {
      if (envelope.info === "mute") {
        call.remoteVideoMuted = true;
      } else if (envelope.info === "unmute") {
        call.remoteVideoMuted = false;
      }
      updateCallUi();
    }

    setCallStatus(jingleInfoText(envelope.info, envelope.mediaKind));
  }

  async function flushPendingIceCandidates(call) {
    while (call.pendingCandidates.length > 0 && call.pc && call.remoteDescriptionSet) {
      const candidate = call.pendingCandidates.shift();
      await call.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  function createCallState(sid, peer, role, mediaKind, rttEnabled = false) {
    return {
      sid,
      peer,
      roomJid: "",
      role,
      mediaKind,
      callMode: callModeName(mediaKind, rttEnabled),
      rttEnabled,
      pc: null,
      localStream: null,
      remoteStream: null,
      remoteVideoMuted: false,
      rttChannel: null,
      rttSync: rttEnabled ? createJingleRttSyncDescriptor(sid, "offered") : null,
      notificationMessageId: "",
      transcript: [],
      transcriptDrafts: {
        self: null,
        peer: null
      },
      media: [],
      recorder: null,
      recordingStartTimer: null,
      recordingChunks: [],
      recordingMimeType: "",
      recordingKind: "",
      historyEntry: null,
      incomingOffer: null,
      pendingCandidates: [],
      remoteDescriptionSet: false,
      historyStartedAt: new Date()
    };
  }

  function isTotalConversationCall(call) {
    return call?.mediaKind === "video" && Boolean(call.rttEnabled);
  }

  function callStartedText(call) {
    if (isTotalConversationCall(call)) {
      return t("call.total_started", "Total conversation started");
    }

    return call?.mediaKind === "video"
      ? t("call.video_started", "Audio + video call started")
      : t("call.audio_started", "Audio call started");
  }

  function incomingCallTitle(call) {
    if (isTotalConversationCall(call)) {
      return t("call.total_incoming", "Incoming total conversation");
    }

    return call?.mediaKind === "video"
      ? t("call.video_incoming", "Incoming audio + video call")
      : t("call.audio_incoming", "Incoming audio call");
  }

  function incomingCallText(call) {
    return `${t("call.incoming", "Incoming call from")} ${displayNameForJid(call.peer)}`;
  }

  function selectConversationForPeer(peer) {
    const conversation = state.conversations.find((item) => addressMatches(item.peer, peer))
      || ensureConversationForPeer(peer, peer.includes("@conference.") ? "group" : "contact", displayNameForJid(peer));
    if (conversation) {
      selectConversation(conversation);
    }
  }

  function requestCallNotificationPermissionFromGesture() {
    if (!("Notification" in window) || Notification.permission !== "default") {
      return;
    }

    Notification.requestPermission()
      .then((permission) => appendDebug("notification", `permission ${permission}`))
      .catch((error) => appendDebug("notification-error", error.message || String(error)));
  }

  function showIncomingCallBrowserNotification(call) {
    if (!call?.incomingOffer || !("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    if (state.doNotDisturb) {
      return;
    }

    if (isBlockedPeer(call.peer) || isNotificationMutedPeer(call.peer)) {
      return;
    }

    if (state.incomingCallNotificationSid === call.sid && state.incomingCallNotification) {
      return;
    }

    closeIncomingCallBrowserNotification();
    let notification = null;
    try {
      notification = new Notification(incomingCallTitle(call), {
        body: incomingCallText(call),
        tag: `teletyptel-call-${call.sid}`,
        renotify: true,
        requireInteraction: true,
        icon: "assets/brand/teletyptel-icon-192.png",
        badge: "assets/brand/teletyptel-icon-192.png"
      });
    } catch (error) {
      appendDebug("notification-error", error.message || String(error));
      return;
    }
    notification.onclick = () => {
      window.focus();
      selectConversationForPeer(call.roomJid || call.peer);
      updateCallUi();
    };
    notification.onclose = () => {
      if (state.incomingCallNotification === notification) {
        state.incomingCallNotification = null;
        state.incomingCallNotificationSid = "";
      }
    };
    state.incomingCallNotification = notification;
    state.incomingCallNotificationSid = call.sid;
  }

  function showBrowserNotification(title, body, options = {}) {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    if (state.doNotDisturb) {
      return;
    }

    if (options.notificationPeer && (isBlockedPeer(options.notificationPeer) || isNotificationMutedPeer(options.notificationPeer))) {
      return;
    }

    try {
      const notification = new Notification(title, {
        body,
        tag: options.tag || "",
        renotify: options.renotify === true,
        icon: "assets/brand/teletyptel-icon-192.png",
        badge: "assets/brand/teletyptel-icon-192.png"
      });
      notification.onclick = () => {
        window.focus();
        if (options.conversationId) {
          const conversation = state.conversations.find((item) => item.id === options.conversationId);
          if (conversation) {
            selectConversation(conversation);
          }
        }
        notification.close();
      };
    } catch (error) {
      appendDebug("notification-error", error.message || String(error));
    }
  }

  function shouldNotifyForConversation(conversation) {
    return Boolean(conversation)
      && conversation.id !== state.activeConversationId;
  }

  function showMessageBrowserNotification(conversation, message) {
    if (!shouldNotifyForConversation(conversation) || !message || isCallMessage(message)) {
      return;
    }

    const sender = message.senderDisplayName || displayNameForJid(message.from || conversation.peer);
    const title = conversation.kind === "group"
      ? `${conversationDisplayName(conversation)} - ${sender}`
      : sender;
    const body = visibleMessageText(message)
      || (message.attachment ? t("upload.shared_file", "Shared file") : t("message.new_message", "New message"));
    showBrowserNotification(title, body, {
      tag: `teletyptel-message-${conversation.id}`,
      renotify: true,
      conversationId: conversation.id,
      notificationPeer: message.from || conversation.peer
    });
  }

  function showReactionBrowserNotification(conversation, message, actor, reactions) {
    if (!shouldNotifyForConversation(conversation) || !message || !Array.isArray(reactions) || !reactions.length) {
      return;
    }

    const sender = displayNameForJid(actor || conversation.peer);
    const body = t("reaction.notification_body", "{sender} reageerde met {reaction}")
      .replace("{sender}", sender)
      .replace("{reaction}", reactions.join(" "));
    showBrowserNotification(conversationDisplayName(conversation), body, {
      tag: `teletyptel-reaction-${conversation.id}-${message.id}`,
      renotify: true,
      conversationId: conversation.id,
      notificationPeer: actor || conversation.peer
    });
  }

  function closeIncomingCallBrowserNotification() {
    if (state.incomingCallNotification) {
      state.incomingCallNotification.close();
    }
    state.incomingCallNotification = null;
    state.incomingCallNotificationSid = "";
  }

  function createJingleRttSyncDescriptor(sid, stateName = "offered") {
    return {
      namespace: jingleRttSyncNamespace,
      profile: "datachannel-t140",
      label: jingleRttSyncDataChannelLabel,
      role: "conversation",
      source: "human",
      syncMode: "co-session",
      maxSkewMs: jingleRttSyncMaxSkewMs,
      finality: "mixed",
      state: stateName,
      sequence: 0
    };
  }

  function normalizeJingleRttSyncDescriptor(value, sid, stateName = "offered") {
    const fallback = createJingleRttSyncDescriptor(sid, stateName);
    if (!value || typeof value !== "object") {
      return fallback;
    }

    return {
      ...fallback,
      ...value,
      namespace: value.namespace || jingleRttSyncNamespace,
      label: value.label || jingleRttSyncDataChannelLabel,
      state: value.state || stateName,
      sequence: Number.isInteger(value.sequence) ? value.sequence : 0
    };
  }

  function createPeerConnection(call) {
    if (call.pc) {
      return call.pc;
    }

    const pc = new RTCPeerConnection(rtcPeerConnectionConfig());
    call.pc = pc;
    appendDebug("webrtc-config", rtcConfigDebugSummary(state.rtcConfig));

    pc.addEventListener("datachannel", (event) => {
      if (event.channel?.label === jingleRttSyncDataChannelLabel) {
        configureJingleRttSyncChannel(call, event.channel);
      }
    });

    if (call.rttEnabled && call.role === "caller" && typeof pc.createDataChannel === "function") {
      configureJingleRttSyncChannel(
        call,
        pc.createDataChannel(jingleRttSyncDataChannelLabel, {
          ordered: true,
          protocol: "t140"
        }));
    }

    if (call.localStream) {
      for (const track of call.localStream.getTracks()) {
        pc.addTrack(track, call.localStream);
      }
    }

    pc.addEventListener("icecandidate", (event) => {
      if (!event.candidate || !state.call || state.call.sid !== call.sid) {
        return;
      }

      appendDebug("webrtc-ice-candidate", candidateDebugSummary(event.candidate));
      sendJingleEnvelope("transport-info", {
        sid: call.sid,
        mediaKind: call.mediaKind,
        candidate: event.candidate.toJSON()
      });
    });

    pc.addEventListener("track", (event) => {
      if (!call.remoteStream) {
        call.remoteStream = new MediaStream();
      }

      call.remoteStream.addTrack(event.track);
      watchCallVideoTrack(call, event.track);
      updateVideoElementSource(el.remoteVideo, call.remoteStream);
      el.callPanel.hidden = false;
      scheduleTotalConversationRecorder(call);
      updateCallUi();
    });

    pc.addEventListener("connectionstatechange", () => {
      appendWebRtcStateDebug(call, "connectionstatechange");
      if (pc.connectionState === "connected") {
        setCallStatus(jingleRttSyncStatusText(call));
        scheduleTotalConversationRecorder(call);
      } else if (pc.connectionState === "failed") {
        setCallStatus(t("call.failed", "Call failed"));
      } else if (pc.connectionState === "disconnected") {
        setCallStatus(t("call.disconnected", "Call disconnected"));
      }
    });
    pc.addEventListener("iceconnectionstatechange", () => appendWebRtcStateDebug(call, "iceconnectionstatechange"));
    pc.addEventListener("icegatheringstatechange", () => appendWebRtcStateDebug(call, "icegatheringstatechange"));
    pc.addEventListener("signalingstatechange", () => appendWebRtcStateDebug(call, "signalingstatechange"));

    return pc;
  }

  function rtcPeerConnectionConfig() {
    const config = state.rtcConfig || {};
    return {
      iceServers: Array.isArray(config.iceServers) ? config.iceServers : [],
      iceTransportPolicy: config.iceTransportPolicy === "relay" ? "relay" : "all",
      bundlePolicy: ["balanced", "max-bundle", "max-compat"].includes(config.bundlePolicy) ? config.bundlePolicy : "balanced",
      rtcpMuxPolicy: config.rtcpMuxPolicy === "negotiate" ? "negotiate" : "require"
    };
  }

  function rtcConfigDebugSummary(config) {
    const servers = Array.isArray(config?.iceServers) ? config.iceServers : [];
    const parts = servers.map((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.filter(Boolean).map((url) => String(url).replace(/\/\/([^:@]+):([^@]+)@/g, "//***:***@")).join(",");
    }).filter(Boolean);
    return `iceServers=${parts.length ? parts.join(" | ") : "none"} policy=${config?.iceTransportPolicy || "all"}`;
  }

  function appendWebRtcStateDebug(call, reason) {
    const pc = call?.pc;
    if (!pc) {
      return;
    }

    appendDebug(
      "webrtc-state",
      `${reason} sid=${call.sid} connection=${pc.connectionState} ice=${pc.iceConnectionState}/${pc.iceGatheringState} signaling=${pc.signalingState} sctp=${pc.sctp?.transport?.state || pc.sctp?.state || "n/a"} rtt=${call.rttChannel?.readyState || "none"}`
    );
  }

  function candidateDebugSummary(candidate) {
    const text = String(candidate?.candidate || "");
    const type = text.match(/\btyp\s+(\w+)/)?.[1] || "unknown";
    const protocol = text.match(/\b(udp|tcp)\b/i)?.[1] || "";
    return `type=${type}${protocol ? ` protocol=${protocol.toLowerCase()}` : ""}`;
  }

  function appendSdpDebug(label, sdp) {
    const text = String(sdp || "");
    const hasDataChannel = /^m=application\s/m.test(text) || /webrtc-datachannel/i.test(text);
    const media = Array.from(text.matchAll(/^m=([a-z]+)/gmi), (match) => match[1]).join(",");
    appendDebug("webrtc-sdp", `${label} media=${media || "none"} datachannel=${hasDataChannel ? "yes" : "no"}`);
  }

  function dataChannelDebugSummary(call, channel) {
    const pc = call?.pc;
    return `sid=${call?.sid || "-"} label=${channel?.label || "-"} id=${channel?.id ?? "-"} ready=${channel?.readyState || "-"} protocol=${channel?.protocol || "-"} negotiated=${channel?.negotiated ? "true" : "false"} buffered=${channel?.bufferedAmount ?? "-"} sctp=${pc?.sctp?.transport?.state || pc?.sctp?.state || "n/a"}`;
  }

  function scheduleTotalConversationRecorder(call) {
    if (!isTotalConversationCall(call) || call.recorder || call.recordingStartTimer || typeof MediaRecorder === "undefined") {
      return;
    }

    call.recordingStartTimer = setTimeout(() => {
      call.recordingStartTimer = null;
      startTotalConversationRecorder(call);
    }, 600);
  }

  function startTotalConversationRecorder(call) {
    if (!isTotalConversationCall(call) || call.recorder || typeof MediaRecorder === "undefined") {
      return;
    }

    const recordingSource = totalConversationRecordingSource(call);
    const tracks = recordingSource.tracks;
    if (!tracks.length) {
      return;
    }

    const stream = new MediaStream(tracks);
    const mimeType = recordingSource.kind === "video"
      ? preferredVideoRecordingMimeType()
      : preferredVoiceRecordingMimeType();

    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      call.recorder = recorder;
      call.recordingChunks = [];
      call.recordingKind = recordingSource.kind;
      call.recordingMimeType = recorder.mimeType || mimeType || (recordingSource.kind === "video" ? "video/webm" : "audio/webm");
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          call.recordingChunks.push(event.data);
        }
      });
      recorder.addEventListener("stop", () => {
        uploadTotalConversationRecording(call).catch((error) => {
          appendDebug("tc-recording-upload-error", error.message || String(error));
        });
      });
      recorder.start(1000);
      appendDebug("tc-recording", `Started ${call.recordingKind} ${call.recordingMimeType}`);
    } catch (error) {
      appendDebug("tc-recording-error", error.message || String(error));
      call.recorder = null;
      call.recordingChunks = [];
      call.recordingMimeType = "";
      call.recordingKind = "";
    }
  }

  function totalConversationRecordingSource(call) {
    const tracks = [];
    const remoteVideo = activeVideoTracks(call?.remoteStream)[0];
    const localVideo = activeVideoTracks(call?.localStream)[0];
    if (remoteVideo) {
      tracks.push(remoteVideo);
    } else if (localVideo) {
      tracks.push(localVideo);
    }

    for (const track of call?.remoteStream?.getAudioTracks?.() || []) {
      if (track.readyState === "live") {
        tracks.push(track);
      }
    }
    for (const track of call?.localStream?.getAudioTracks?.() || []) {
      if (track.readyState === "live") {
        tracks.push(track);
      }
    }
    return {
      kind: tracks.some((track) => track.kind === "video") ? "video" : "audio",
      tracks
    };
  }

  function stopTotalConversationRecorder(call) {
    if (call?.recordingStartTimer) {
      clearTimeout(call.recordingStartTimer);
      call.recordingStartTimer = null;
    }
    if (call?.recorder?.state === "recording") {
      try {
        call.recorder.stop();
      } catch (error) {
        appendDebug("tc-recording-stop-error", error.message || String(error));
      }
    }
  }

  async function uploadTotalConversationRecording(call) {
    const chunks = Array.isArray(call?.recordingChunks) ? call.recordingChunks : [];
    if (!chunks.length) {
      return;
    }

    const kind = call.recordingKind === "audio" ? "audio" : "video";
    const mimeType = call.recordingMimeType || (kind === "video" ? "video/webm" : "audio/webm");
    const extension = kind === "video" ? videoFileExtension(mimeType) : voiceFileExtension(mimeType);
    const fileName = `total-conversation-${voiceTimestamp()}.${extension}`;
    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) {
      return;
    }

    const file = new File([blob], fileName, { type: mimeType });
    const payload = file.size > uploadChunkSize
      ? await uploadFileInChunks(file)
      : await uploadFileDirect(file);
    if (!payload?.file) {
      return;
    }

    call.media = Array.isArray(call.media) ? call.media : [];
    call.media.push({
      ...payload.file,
      kind,
      role: "total-conversation-recording",
      recordedAt: new Date().toISOString()
    });

    if (call.historyEntry) {
      call.historyEntry.media = call.media;
      upsertConversationHistoryCall(call.historyEntry);
      postConversationHistoryEntry(call.historyEntry);
    }
    appendDebug("tc-recording", `Saved ${fileName}`);
  }

  function configureJingleRttSyncChannel(call, channel) {
    if (!call || !channel) {
      return;
    }

    if (channel.teletyptelRttConfigured) {
      call.rttChannel = channel;
      return;
    }

    channel.teletyptelRttConfigured = true;
    channel.binaryType = "arraybuffer";
    call.rttEnabled = true;
    call.callMode = callModeName(call.mediaKind, true);
    call.rttChannel = channel;
    call.rttSync = normalizeJingleRttSyncDescriptor(call.rttSync, call.sid, "negotiating");
    call.rttSync.label = channel.label || jingleRttSyncDataChannelLabel;
    call.rttSync.state = channel.readyState === "open" ? "connected" : "negotiating";
    appendDebug("jingle-rtt", `Datachannel configured ${dataChannelDebugSummary(call, channel)}`);

    channel.addEventListener("open", () => {
      if (!state.call || state.call.sid !== call.sid) {
        return;
      }

      call.rttSync.state = "connected";
      setCallStatus(t("call.connected_total", "Total conversation connected - live text synchronized"));
      appendDebug("jingle-rtt", `Datachannel open ${dataChannelDebugSummary(call, channel)}`);
      updateCallUi();
    });

    channel.addEventListener("close", () => {
      if (!state.call || state.call.sid !== call.sid) {
        return;
      }

      call.rttSync.state = "fallback";
      setCallStatus(t("call.connected_total", "Total conversation connected - live text synchronized"));
      appendDebug("jingle-rtt", `Datachannel closed ${dataChannelDebugSummary(call, channel)}`);
      updateCallUi();
    });

    channel.addEventListener("error", (event) => {
      call.rttSync.state = "fallback";
      appendDebug("jingle-rtt-error", `Datachannel error ${dataChannelDebugSummary(call, channel)} ${event?.error?.message || ""}`.trim());
    });

    channel.addEventListener("message", (event) => {
      void handleJingleRttSyncPacket(call, event.data);
    });
  }

  function activeJingleRttSyncCall() {
    const call = state.call;
    const conversation = activeConversation();
    if (!call?.rttEnabled || !conversation || !addressMatches(conversation.peer, call.peer)) {
      return null;
    }

    return call.rttChannel?.readyState === "open" ? call : null;
  }

  function sendJingleRttSyncPacket(eventName, text, options = {}) {
    const call = activeJingleRttSyncCall();
    if (!call || isActiveConversationBlocked()) {
      return false;
    }

    call.rttSync = normalizeJingleRttSyncDescriptor(call.rttSync, call.sid, "connected");
    if (eventName === "edit") {
      const t140Delta = createT140LinearDelta(options.previousText ?? "", String(text ?? ""));
      if (t140Delta !== null) {
        if (t140Delta !== "") {
          call.rttChannel.send(t140Delta);
          appendDebug("jingle-rtt-t140-out", `<t140 sid="${escapeXml(call.sid)}">${escapeXml(t140Delta)}</t140>`);
        }

        recordTotalConversationText(call, "self", text, currentFromJid());
        return true;
      }
    }

    const packet = {
      type: "jingle-rtt-sync",
      namespace: jingleRttSyncNamespace,
      profile: call.rttSync.profile,
      event: eventName,
      sid: call.sid,
      from: currentFromJid(),
      to: call.peer,
      role: call.rttSync.role,
      source: call.rttSync.source,
      syncMode: call.rttSync.syncMode,
      maxSkewMs: call.rttSync.maxSkewMs,
      seq: call.rttSync.sequence++,
      text: String(text ?? ""),
      actions: options.actions || null,
      messageId: options.messageId || null,
      replaceId: options.replaceId || null,
      timestamp: new Date().toISOString()
    };

    try {
      call.rttChannel.send(JSON.stringify(packet));
      appendDebug("jingle-rtt-out", createJingleRttPacketDebugXml(packet));
      recordTotalConversationText(call, "self", text, currentFromJid(), {
        timestamp: packet.timestamp,
        final: eventName === "message"
      });
      return true;
    } catch (error) {
      call.rttSync.state = "fallback";
      appendDebug("jingle-rtt-error", error.message);
      return false;
    }
  }

  async function handleJingleRttSyncPacket(call, data) {
    const text = await decodeRttDataChannelText(data);
    if (text === null || text === "") {
      appendDebug("jingle-rtt-skip", "Ignored empty RTT datachannel packet");
      return;
    }

    let packet;
    try {
      packet = JSON.parse(text);
    } catch {
      applyT140DataChannelText(call, text);
      return;
    }

    if (packet?.type !== "jingle-rtt-sync" || packet.namespace !== jingleRttSyncNamespace) {
      appendDebug("jingle-rtt-skip", "Ignored unknown datachannel packet");
      return;
    }

    if (packet.sid && packet.sid !== call.sid) {
      appendDebug("jingle-rtt-skip", `Ignored packet for sid=${packet.sid}`);
      return;
    }

    appendDebug("jingle-rtt-in", createJingleRttPacketDebugXml(packet));
    if (packet.event === "message") {
      applyJingleRttSyncFinal(call, packet);
      return;
    }

    applyJingleRttSyncDraft(call, packet);
  }

  async function decodeRttDataChannelText(data) {
    if (typeof data === "string") {
      return data;
    }

    if (data instanceof ArrayBuffer) {
      return new TextDecoder("utf-8", { fatal: false }).decode(data);
    }

    if (ArrayBuffer.isView(data)) {
      return new TextDecoder("utf-8", { fatal: false }).decode(data);
    }

    if (typeof Blob !== "undefined" && data instanceof Blob) {
      return await data.text();
    }

    return data == null ? null : String(data);
  }

  function applyT140DataChannelText(call, payload) {
    const conversation = ensureConversationForPeer(call.peer, "contact", displayNameForJid(call.peer));
    if (!conversation) {
      return;
    }

    conversation.remoteText = applyT140Delta(conversation.remoteText || "", payload);
    conversation.remoteFrom = call.peer;
    conversation.remoteDraftUpdatedAt = new Date();
    recordTotalConversationText(call, "peer", conversation.remoteText, conversation.remoteFrom);
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    setPeerPresence(conversation.peer, "online");
    appendDebug("jingle-rtt-t140-in", `<t140 sid="${escapeXml(call.sid)}">${escapeXml(payload)}</t140>`);
    updateRemoteDraftMessage(conversation.id);
    updateTotalConversationTextPanel(conversation);
  }

  function createT140LinearDelta(previous, next) {
    const previousText = String(previous ?? "");
    const nextText = String(next ?? "");
    if (nextText.startsWith(previousText)) {
      return nextText.slice(previousText.length);
    }

    if (previousText.startsWith(nextText)) {
      return t140Backspace.repeat(Array.from(previousText.slice(nextText.length)).length);
    }

    return null;
  }

  function applyT140Delta(previous, payload) {
    let result = String(previous ?? "");
    let previousWasCarriageReturn = false;

    for (const char of Array.from(String(payload ?? ""))) {
      if (char === t140Backspace || char === t140Delete) {
        result = Array.from(result).slice(0, -1).join("");
        previousWasCarriageReturn = false;
        continue;
      }

      if (char === "\r") {
        result += "\n";
        previousWasCarriageReturn = true;
        continue;
      }

      if (char === "\n") {
        if (!previousWasCarriageReturn) {
          result += "\n";
        }
        previousWasCarriageReturn = false;
        continue;
      }

      previousWasCarriageReturn = false;
      if (isIgnoredT140Control(char)) {
        continue;
      }

      result += char;
    }

    return result;
  }

  function isIgnoredT140Control(char) {
    if (char === "\t") {
      return false;
    }

    const code = char.codePointAt(0);
    return code < 0x20 || (code >= 0x80 && code <= 0x9f);
  }

  function applyJingleRttSyncDraft(call, packet) {
    const conversation = ensureConversationForPeer(call.peer, "contact", displayNameForJid(call.peer));
    if (!conversation) {
      return;
    }

    const text = String(packet.text ?? "");
    conversation.remoteText = packet.event === "reset" ? text : text;
    conversation.remoteFrom = packet.from || call.peer;
    conversation.remoteDraftUpdatedAt = new Date(packet.timestamp || Date.now());
    recordTotalConversationText(call, "peer", conversation.remoteText, conversation.remoteFrom, {
      timestamp: conversation.remoteDraftUpdatedAt.toISOString()
    });
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    setPeerPresence(conversation.peer, "online");
    updateRemoteDraftMessage(conversation.id);
    updateTotalConversationTextPanel(conversation);
  }

  function applyJingleRttSyncFinal(call, packet) {
    const conversation = ensureConversationForPeer(call.peer, "contact", displayNameForJid(call.peer));
    if (!conversation) {
      return;
    }

    conversation.remoteText = "";
    conversation.remoteFrom = packet.from || call.peer;
    conversation.remoteDraftUpdatedAt = null;
    recordTotalConversationText(call, "peer", String(packet.text ?? ""), conversation.remoteFrom, {
      timestamp: packet.timestamp || new Date().toISOString(),
      final: true
    });
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    setPeerPresence(conversation.peer, "online");

    if (packet.replaceId) {
      applyMessageCorrection(
        conversation,
        String(packet.replaceId),
        String(packet.text ?? ""),
        "peer",
        typeof packet.messageId === "string" ? packet.messageId : null,
        conversation.remoteFrom);
      updateRemoteDraftMessage(conversation.id);
      updateTotalConversationTextPanel(conversation);
      return;
    }

    addMessage(
      "peer",
      String(packet.text ?? ""),
      "jingle-rtt",
      conversation.remoteFrom,
      null,
      conversation.id,
      null,
      typeof packet.messageId === "string" ? packet.messageId : null);
    updateRemoteDraftMessage(conversation.id);
    updateTotalConversationTextPanel(conversation);
  }

  async function openLocalMedia(call) {
    if (call.localStream) {
      return call.localStream;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(mediaAccessUnavailableMessage());
    }

    const wantsVideo = call.mediaKind === "video";
    stopMediaPreview();
    saveMediaSettingsFromControls();
    markMediaCaptureTransition("get-user-media-start", 20000);
    try {
      call.localStream = await navigator.mediaDevices.getUserMedia(createMediaConstraints(call.mediaKind));
      markMediaCaptureTransition("get-user-media-ready", 8000);
      await refreshMediaDevices(false);
      scheduleTotalConversationRecorder(call);
    } catch (error) {
      if (!wantsVideo) {
        throw error;
      }

      if (state.mediaSettings.cameraDeviceId || state.mediaSettings.microphoneDeviceId) {
        try {
          appendDebug("media", `Selected device unavailable, trying defaults: ${error.message}`);
          markMediaCaptureTransition("get-user-media-defaults", 12000);
          call.localStream = await navigator.mediaDevices.getUserMedia(createDefaultMediaConstraints("video"));
          markMediaCaptureTransition("get-user-media-ready", 8000);
          setMediaStatus(t("media.default_fallback", "Selected device was unavailable; using browser defaults."));
          await refreshMediaDevices(false);
          scheduleTotalConversationRecorder(call);
        } catch (fallbackError) {
          appendDebug("media", `Default video fallback failed: ${fallbackError.message}`);
        }
      }

      if (call.localStream) {
        watchCallVideoTracks(call, call.localStream);
        updateVideoElementSource(el.localVideo, call.localStream);
        el.callPanel.hidden = false;
        updateCallUi();
        return call.localStream;
      }

      appendDebug("media", `Video unavailable, falling back to audio: ${error.message}`);
      call.mediaKind = "audio";
      markMediaCaptureTransition("get-user-media-audio-fallback", 12000);
      call.localStream = await navigator.mediaDevices.getUserMedia(createMediaConstraints("audio"));
      markMediaCaptureTransition("get-user-media-ready", 8000);
      scheduleTotalConversationRecorder(call);
    }

    updateVideoElementSource(el.localVideo, call.localStream);
    watchCallVideoTracks(call, call.localStream);
    el.callPanel.hidden = false;
    updateCallUi();
    return call.localStream;
  }

  function createMediaConstraints(mediaKind) {
    if (mediaKind !== "video") {
      return createAudioOnlyConstraints();
    }

    const { audio } = createAudioOnlyConstraints();
    const { video } = createVideoOnlyConstraints();
    return { audio, video };
  }

  function createAudioOnlyConstraints() {
    const microphoneDeviceId = normalizeSelectedMediaDeviceId(state.mediaSettings.microphoneDeviceId, "audioinput");
    const audio = microphoneDeviceId
      ? { deviceId: { ideal: microphoneDeviceId } }
      : true;
    return { audio, video: false };
  }

  function createVideoMessageConstraints(ignoreFacingMode = false) {
    const { audio } = createAudioOnlyConstraints();
    const video = videoConstraintsForQuality(state.mediaSettings.videoQuality);
    const cameraDeviceId = normalizeSelectedMediaDeviceId(state.mediaSettings.cameraDeviceId, "videoinput");
    if (!ignoreFacingMode && isAppleMobileBrowser()) {
      video.facingMode = { ideal: selectedVideoFacingModeForCapture() };
    } else if (cameraDeviceId) {
      video.deviceId = { ideal: cameraDeviceId };
    }

    return { audio, video };
  }

  function createVideoOnlyConstraints() {
    const video = videoConstraintsForQuality(state.mediaSettings.videoQuality);
    const cameraDeviceId = normalizeSelectedMediaDeviceId(state.mediaSettings.cameraDeviceId, "videoinput");
    if (isAppleMobileBrowser()) {
      video.facingMode = { ideal: selectedVideoFacingModeForCapture() };
    } else if (cameraDeviceId) {
      video.deviceId = { ideal: cameraDeviceId };
    }

    return { audio: false, video };
  }

  function selectedVideoFacingModeForCapture() {
    const mode = normalizeVideoFacingMode(state.mediaSettings.videoMessageFacingMode);
    return isAppleMobileBrowser()
      ? mode === "environment" ? "user" : "environment"
      : mode;
  }

  function normalizeVideoFacingMode(value) {
    return value === "environment" ? "environment" : "user";
  }

  function isAppleMobileBrowser() {
    const userAgent = navigator.userAgent || "";
    return /iP(?:hone|ad|od)/.test(userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function mediaAccessUnavailableMessage() {
    const insecurePage = window.isSecureContext === false
      && location.protocol !== "https:"
      && !["localhost", "127.0.0.1", "::1"].includes(location.hostname);
    if (insecurePage) {
      const secureHost = location.hostname.toLowerCase() === "dev.teletyptel.nl"
        ? " https://dev.teletyptel.nl"
        : "";
      return t("call.media_requires_secure_context", "Camera and microphone require HTTPS on this device.{0}")
        .replace("{0}", secureHost);
    }

    return t("call.media_unavailable", "Camera/microphone access is not available.");
  }

  function createDefaultMediaConstraints(mediaKind) {
    if (mediaKind !== "video") {
      return { audio: true, video: false };
    }

    return {
      audio: true,
      video: videoConstraintsForQuality(state.mediaSettings.videoQuality)
    };
  }

  function videoConstraintsForQuality(quality) {
    if (quality === "qvga") {
      return { width: { ideal: 320 }, height: { ideal: 240 }, aspectRatio: { ideal: 4 / 3 } };
    }

    if (quality === "vga") {
      return { width: { ideal: 640 }, height: { ideal: 480 }, aspectRatio: { ideal: 4 / 3 } };
    }

    if (quality === "hd") {
      return { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } };
    }

    if (quality === "fullhd") {
      return { width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 16 / 9 } };
    }

    if (quality === "uhd") {
      return { width: { ideal: 2560 }, height: { ideal: 1440 }, aspectRatio: { ideal: 16 / 9 } };
    }

    return { width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 16 / 9 } };
  }

  function setMediaStatus(text) {
    for (const status of [el.mediaStatus, el.dialogMediaStatus]) {
      if (!status) {
        continue;
      }
      status.removeAttribute("data-i18n");
      status.textContent = text;
    }
  }

  function stopStream(stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  async function replaceLocalMediaTrack(kind) {
    const call = state.call;
    if (!call?.localStream || !call.pc) {
      return;
    }

    const constraints = kind === "audio"
      ? createAudioOnlyConstraints()
      : createVideoOnlyConstraints();
    markMediaCaptureTransition(`replace-${kind}-track`, 12000);
    const replacementStream = await navigator.mediaDevices.getUserMedia(constraints);
    const replacementTrack = replacementStream.getTracks().find((track) => track.kind === kind);
    if (!replacementTrack) {
      stopStream(replacementStream);
      throw new Error(kind === "audio"
        ? t("media.no_microphone_track", "No microphone track was returned.")
        : t("media.no_camera_track", "No camera track was returned."));
    }

    const oldTracks = kind === "audio"
      ? call.localStream.getAudioTracks()
      : call.localStream.getVideoTracks();
    const wasEnabled = oldTracks.length === 0 || oldTracks.some((track) => track.enabled);
    replacementTrack.enabled = wasEnabled;

    const sender = call.pc.getSenders().find((item) => item.track?.kind === kind);
    if (!sender) {
      stopStream(replacementStream);
      throw new Error(kind === "audio"
        ? t("media.no_microphone_sender", "No active microphone sender was found.")
        : t("media.no_camera_sender", "No active camera sender was found."));
    }

    await sender.replaceTrack(replacementTrack);
    for (const oldTrack of oldTracks) {
      call.localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }

    call.localStream.addTrack(replacementTrack);
    watchCallVideoTrack(call, replacementTrack);
    for (const extraTrack of replacementStream.getTracks()) {
      if (extraTrack !== replacementTrack) {
        extraTrack.stop();
      }
    }

    updateVideoElementSource(el.localVideo, call.localStream);
    el.callPanel.hidden = false;
    await refreshMediaDevices(false);
    updateCallUi();
  }

  function totalConversationTranscript(call) {
    const buffered = Array.isArray(call?.transcript) ? [...call.transcript] : [];
    for (const draft of Object.values(call?.transcriptDrafts || {})) {
      if (draft?.text?.trim()) {
        buffered.push({ ...draft, final: false });
      }
    }

    const seen = new Set();
    return buffered
      .filter((line) => String(line.text || "").trim() !== "")
      .map((line) => ({
        direction: line.direction === "self" ? "self" : "peer",
        from: line.from || "",
        text: String(line.text || ""),
        timestamp: line.timestamp || new Date().toISOString(),
        final: line.final === true
      }))
      .filter((line) => {
        const key = `${line.direction}\n${line.from}\n${line.text}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(-200);
  }

  function recordTotalConversationText(call, direction, text, from = "", options = {}) {
    if (!isTotalConversationCall(call)) {
      return;
    }

    const value = String(text ?? "");
    const key = direction === "self" ? "self" : "peer";
    const line = {
      direction: key,
      from,
      text: value,
      timestamp: options.timestamp || new Date().toISOString(),
      final: options.final === true
    };

    if (line.final) {
      if (line.text.trim()) {
        const duplicate = call.transcript.some((item) =>
          item.direction === line.direction
          && item.from === line.from
          && item.text === line.text);
        if (!duplicate) {
          call.transcript.push(line);
        }
      }
      call.transcriptDrafts[key] = null;
      return;
    }

    call.transcriptDrafts[key] = line.text.trim() ? line : null;
  }

  function recordTotalConversationTextForConversation(conversation, direction, text, from = "", options = {}) {
    const call = state.call;
    if (!conversation || !isTotalConversationCall(call) || !addressMatches(conversation.peer, call.peer)) {
      return;
    }

    recordTotalConversationText(call, direction, text, from, options);
  }

  function persistConversationHistoryCall(call, status = "ended") {
    if (!state.historySettings.saveTotalConversation || !state.account?.accountId || !isTotalConversationCall(call)) {
      return;
    }

    const conversation = state.conversations.find((item) => addressMatches(item.peer, call.peer))
      || ensureConversationForPeer(call.peer, "contact", displayNameForJid(call.peer));
    const startedAt = call.historyStartedAt instanceof Date ? call.historyStartedAt : new Date();
    const endedAt = new Date();
    const entry = normalizeConversationHistoryCall({
      callId: call.sid,
      conversationPeer: call.peer,
      conversationName: conversation ? conversationDisplayName(conversation) : displayNameForJid(call.peer),
      conversationKind: conversation?.kind === "group" ? "group" : "contact",
      direction: call.role === "caller" ? "self" : "peer",
      callType: "total",
      status,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationSeconds: Math.round(Math.max(0, endedAt.getTime() - startedAt.getTime()) / 1000),
      transcript: totalConversationTranscript(call),
      media: Array.isArray(call.media) ? call.media : [],
      note: t("history.tc_saved_note", "Total Conversation saved in conversation history.")
    });

    call.historyEntry = entry;
    upsertConversationHistoryCall(entry);
    postConversationHistoryEntry(entry);
  }

  function postConversationHistoryEntry(entry) {
    if (!state.account?.accountId || !entry) {
      return;
    }

    postHistory({
      action: "save_call",
      accountId: state.account.accountId,
      callId: entry.callId,
      conversationPeer: entry.conversationPeer,
      conversationName: entry.conversationName,
      conversationKind: entry.conversationKind,
      direction: entry.direction,
      callType: entry.callType,
      status: entry.status,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      durationSeconds: entry.durationSeconds,
      transcript: entry.transcript,
      media: entry.media,
      note: entry.note
    });
  }

  function conversationHistoryTranscript(conversation, startedAt) {
    const since = startedAt instanceof Date ? startedAt.getTime() : 0;
    const messages = (conversation.messages || [])
      .filter((message) => {
        const time = message.timestamp instanceof Date ? message.timestamp.getTime() : 0;
        return time >= since && ["jingle-rtt", "rtt", "message"].includes(message.status || "message");
      })
      .slice(-100)
      .map((message) => ({
        direction: message.direction === "self" ? "self" : "peer",
        from: message.from || "",
        text: message.text || "",
        timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : new Date().toISOString()
      }))
      .filter((message) => message.text.trim() !== "");

    if (conversation.remoteText) {
      messages.push({
        direction: "peer",
        from: conversation.remoteFrom || conversation.peer,
        text: conversation.remoteText,
        timestamp: new Date().toISOString()
      });
    }

    const localText = el.messageInput?.value || "";
    if (activeConversation()?.id === conversation.id && localText.trim()) {
      messages.push({
        direction: "self",
        from: currentFromJid(),
        text: localText,
        timestamp: new Date().toISOString()
      });
    }

    return messages;
  }

  function upsertConversationHistoryCall(entry) {
    const normalized = normalizeConversationHistoryCall(entry);
    const index = state.conversationHistory.calls.findIndex((item) => item.callId === normalized.callId);
    if (index >= 0) {
      state.conversationHistory.calls[index] = normalized;
    } else {
      state.conversationHistory.calls.unshift(normalized);
    }
    state.conversationHistory.calls.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    refreshOpenTabPanel();
  }

  function addCallNotificationMessage(call, status, text, conversationOverride = null) {
    if (!call) {
      return null;
    }

    const conversation = conversationOverride
      || state.conversations.find((item) => addressMatches(item.peer, call.peer))
      || ensureConversationForPeer(call.peer, call.peer.includes("@conference.") ? "group" : "contact", displayNameForJid(call.peer));
    if (!conversation) {
      return null;
    }

    const direction = call.role === "caller" ? "self" : "peer";
    const messageStatus = callNotificationMessageStatus(status);
    const notificationMessageId = `call-${call.sid}`;
    const message = addMessage(
      direction,
      text,
      messageStatus,
      direction === "peer" ? call.peer : null,
      null,
      conversation.id,
      null,
      notificationMessageId,
      false,
      false);
    if (message) {
      const startedAt = call.historyStartedAt instanceof Date ? call.historyStartedAt : new Date();
      message.callInfo = {
        status,
        callId: call.sid,
        mediaKind: call.mediaKind,
        rttEnabled: call.rttEnabled,
        durationSeconds: Math.round(Math.max(0, Date.now() - startedAt.getTime()) / 1000),
        peer: call.peer,
        startedAt: startedAt.toISOString(),
        endedAt: ""
      };
      message.jingleHistory = createJingleHistoryEventFromCallInfo(message.callInfo, message.direction);
      call.notificationMessageId = message.xmppId || message.id;
      persistHistoryMessage(conversation, message);
      sendXmppCallNotificationMessage(conversation, message);
      if (conversation.id === state.activeConversationId) {
        renderActiveConversation();
      }
    }
    return message;
  }

  function callNotificationMessageStatus(status) {
    if (status === "missed") {
      return "call-missed";
    }
    if (status === "failed") {
      return "call-failed";
    }
    if (status === "rejected") {
      return "call-rejected";
    }
    if (status === "ended") {
      return "call-ended";
    }
    return "jingle";
  }

  function missedCallText(call) {
    const title = isTotalConversationCall(call)
      ? t("button.call_total_conversation", "Total conversation")
      : (call?.mediaKind === "video" ? t("button.call_audio_video", "Audio + video") : t("button.call_audio", "Audio"));
    return `${t("call.missed", "Missed call")} - ${title}`;
  }

  function callEndedText(call, status) {
    const title = isTotalConversationCall(call)
      ? t("button.call_total_conversation", "Total conversation")
      : (call?.mediaKind === "video" ? t("button.call_audio_video", "Audio + video") : t("button.call_audio", "Audio"));
    if (status === "failed") {
      return `${title} - ${t("history.status_failed", "mislukt")}`;
    }
    if (status === "rejected") {
      return `${title} - ${t("history.status_rejected", "geweigerd")}`;
    }
    if (status === "missed") {
      return missedCallText(call);
    }
    return `${title} - ${t("history.status_ended", "beeindigd")}`;
  }

  function updateCallNotificationMessage(call, status) {
    if (!call?.notificationMessageId) {
      return false;
    }

    const conversation = state.conversations.find((item) => addressMatches(item.peer, call.peer));
    if (!conversation) {
      return false;
    }

    const message = conversation.messages.find((item) => item.id === call.notificationMessageId || item.xmppId === call.notificationMessageId);
    if (!message) {
      return false;
    }

    const startedAt = call.historyStartedAt instanceof Date ? call.historyStartedAt : new Date();
    message.text = callEndedText(call, status);
    message.status = callNotificationMessageStatus(status);
    message.callInfo = {
      status,
      callId: call.sid,
      mediaKind: call.mediaKind,
      rttEnabled: call.rttEnabled,
      durationSeconds: Math.round(Math.max(0, Date.now() - startedAt.getTime()) / 1000),
      peer: call.peer,
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString()
    };
    message.jingleHistory = createJingleHistoryEventFromCallInfo(message.callInfo, message.direction);
    persistHistoryMessage(conversation, message);
    sendXmppCallNotificationMessage(conversation, message, true);
    if (conversation.id === state.activeConversationId) {
      renderActiveConversation();
    }
    renderConversations();
    return true;
  }

  function sendXmppCallNotificationMessage(conversation, message, correction = false) {
    if (state.mode !== "xmpp"
      || state.xmppSocket?.readyState !== WebSocket.OPEN
      || !state.xmppSession?.authenticated
      || conversation.kind !== "contact"
      || message.direction !== "self"
      || isOwnPeer(conversation.peer)) {
      return false;
    }

    const messageId = correction ? createMessageId("call-update") : bestMessageTargetId(message) || createMessageId("call");
    const replaceId = correction ? bestMessageTargetId(message) : null;
    const xml = createMessageStanza(
      message.text || "",
      messageId,
      replaceId,
      false,
      conversation.peer,
      createXmppCallInfoElement(message.callInfo) + createXmppJingleHistoryElement(message.jingleHistory));
    return sendXmppStanza(xml, `<message type="chat" call-info="${message.callInfo?.status || ""}">...</message>`);
  }

  function createXmppCallInfoElement(callInfo) {
    if (!callInfo || typeof callInfo !== "object") {
      return "";
    }

    const startedAt = callInfo.startedAt ? ` started-at="${escapeXml(callInfo.startedAt)}"` : "";
    const endedAt = callInfo.endedAt ? ` ended-at="${escapeXml(callInfo.endedAt)}"` : "";
    return `<call-info xmlns="${teletyptelCallInfoNamespace}" status="${escapeXml(callInfo.status || "")}" call-id="${escapeXml(callInfo.callId || "")}" media-kind="${escapeXml(callInfo.mediaKind || "")}" rtt-enabled="${callInfo.rttEnabled === true ? "true" : "false"}" duration-seconds="${escapeXml(Math.max(0, Number(callInfo.durationSeconds || 0)))}" peer="${escapeXml(callInfo.peer || "")}"${startedAt}${endedAt}/>`;
  }

  function createXmppJingleHistoryElement(event) {
    const api = jingleHistoryApi();
    if (!api?.jingleHistoryXml || !event || event.localOnly === true) {
      return "";
    }

    try {
      return api.jingleHistoryXml(event);
    } catch (error) {
      appendDebug("jingle-history-error", error.message || String(error));
      return "";
    }
  }

  async function openConversationHistoryCall(callId) {
    const normalizedId = String(callId || "").trim();
    if (!normalizedId) {
      return;
    }

    if (!state.conversationHistory.loaded) {
      await loadConversationHistory();
    }
    state.conversationHistory.selectedId = `call:${normalizedId}`;
    activateTab("history");
  }

  function cleanupCall(notifyRemote, historyStatus = "ended") {
    const call = state.call;
    if (!call) {
      closeIncomingCallBrowserNotification();
      updateCallUi();
      return;
    }

    closeIncomingCallBrowserNotification();
    persistConversationHistoryCall(call, historyStatus);
    stopTotalConversationRecorder(call);
    const updatedNotification = updateCallNotificationMessage(call, historyStatus);
    if (historyStatus === "missed" && !updatedNotification) {
      addCallNotificationMessage(call, "missed", missedCallText(call));
    } else if (!updatedNotification) {
      addCallNotificationMessage(call, historyStatus, callEndedText(call, historyStatus));
    }

    if (notifyRemote) {
      sendJingleEnvelope("session-terminate", {
        sid: call.sid,
        reason: "success",
        reasonText: t("call.ended", "Call ended")
      });
    }

    call.rttChannel?.close();
    call.rttChannel = null;
    call.pc?.close();
    if (call.localStream) {
      stopStream(call.localStream);
    }

    if (call.remoteStream) {
      stopStream(call.remoteStream);
    }
    updateVideoElementSource(el.localVideo, null);
    updateVideoElementSource(el.remoteVideo, null);
    el.callPanel.hidden = true;
    state.call = null;
    updateCallUi();
  }

  function sendJingleEnvelope(action, payload = {}) {
    const active = activeConversation();
    const roomJid = state.call?.roomJid || (active?.kind === "group" ? active.peer : "");
    const envelope = {
      ...createRelayEnvelope("jingle", "", ""),
      action,
      sid: payload.sid || state.call?.sid || "td-" + createShortId(),
      to: payload.to || state.call?.peer || currentToJid(),
      roomJid: payload.roomJid || roomJid || null,
      mediaKind: payload.mediaKind || state.call?.mediaKind || "audio",
      info: payload.info || null,
      reason: payload.reason || null,
      reasonText: payload.reasonText || null,
      sdp: payload.sdp || null,
      descriptionType: payload.descriptionType || null,
      candidate: payload.candidate || null,
      rttSync: Object.prototype.hasOwnProperty.call(payload, "rttSync")
        ? payload.rttSync
        : (action === "session-initiate" || action === "session-accept" ? state.call?.rttSync || null : null)
    };
    envelope.xml = createJingleDebugXml(action, envelope);
    if (sendXmppJingleEnvelope(envelope)) {
      appendDebug("jingle-out", envelope.xml);
      return;
    }

    if (isRelayConnected()) {
      state.relaySocket.send(JSON.stringify(envelope));
      appendDebug("jingle-out", envelope.xml);
      return;
    }

    appendDebug("jingle-error", "No call signaling transport is connected");
  }

  function sendXmppJingleEnvelope(envelope) {
    if (state.mode !== "xmpp"
      || state.xmppSocket?.readyState !== WebSocket.OPEN
      || !state.xmppSession?.authenticated) {
      return false;
    }

    const id = createMessageId("jingle");
    const to = envelope.to || state.call?.peer || currentToJid();
    const groupSignal = Boolean(envelope.roomJid && addressMatches(to, envelope.roomJid));
    if (groupSignal) {
      const conversation = state.conversations.find((item) => addressMatches(item.peer, envelope.roomJid || to));
      joinXmppGroupConversation(conversation);
    }
    const payload = base64Utf8(JSON.stringify(redactTransientJingleEnvelope(envelope)));
    const signal = `<signal xmlns="${teletyptelJingleSignalNamespace}" encoding="json-base64">${payload}</signal>`;
    const messageType = groupSignal ? "groupchat" : "chat";
    const xml = `<message xmlns="jabber:client" type="${messageType}" from="${escapeXml(currentXmppFromJid())}" to="${escapeXml(to)}" id="${escapeXml(id)}">${signal}<no-store xmlns="urn:xmpp:hints"/></message>`;
    return sendXmppStanza(xml, `<message type="${messageType}" jingle-signal="${escapeXml(envelope.action || "")}" sid="${escapeXml(envelope.sid || "")}">...</message>`);
  }

  function redactTransientJingleEnvelope(envelope) {
    return {
      ...envelope,
      xml: envelope.xml || ""
    };
  }

  function createJingleDebugXml(action, envelope) {
    const sid = escapeXml(envelope.sid);
    const to = escapeXml(envelope.to || currentToJid());
    const from = escapeXml(currentFromJid());
    const initiator = state.call?.role === "caller" ? from : escapeXml(envelope.from || currentFromJid());
    const responder = state.call?.role === "receiver" ? from : to;
    const attrs = `xmlns="urn:xmpp:jingle:1" action="${escapeXml(action)}" sid="${sid}" initiator="${initiator}" responder="${responder}"`;
    let payload = "";

    if (action === "session-initiate" || action === "session-accept") {
      const hasVideo = envelope.mediaKind === "video";
      const hasText = Boolean(envelope.rttSync);
      payload = createJingleGroupingXml({ hasVideo, hasText })
        + createJingleContentXml("audio", "audio")
        + (hasVideo ? createJingleContentXml("video", "video") : "")
        + (envelope.rttSync ? createJingleRttSyncContentXml(envelope) : "");
    } else if (action === "transport-info") {
      payload = `<content creator="initiator" name="${escapeXml(envelope.mediaKind || "audio")}"><transport xmlns="urn:xmpp:jingle:transports:ice-udp:1">${createJingleCandidateXml(envelope.candidate)}</transport></content>`;
    } else if (action === "session-info") {
      const info = escapeXml(envelope.info || "ringing");
      const media = escapeXml(envelope.mediaKind || "audio");
      const creator = state.call?.role === "receiver" ? "responder" : "initiator";
      const mediaAttrs = envelope.info === "mute" || envelope.info === "unmute"
        ? ` creator="${creator}" name="${media}"`
        : "";
      payload = `<${info} xmlns="urn:xmpp:jingle:apps:rtp:info:1"${mediaAttrs}/>`;
    } else if (action === "session-terminate") {
      const reason = escapeXml(envelope.reason || "success");
      payload = `<reason><${reason}/>${envelope.reasonText ? `<text>${escapeXml(envelope.reasonText)}</text>` : ""}</reason>`;
    }

    return `<iq xmlns="jabber:client" type="set" from="${from}" to="${to}" id="call-${sid}"><jingle ${attrs}>${payload}</jingle></iq>`;
  }

  function createJingleContentXml(name, media) {
    const payload = media === "video"
      ? '<payload-type id="96" name="VP8" clockrate="90000"/>'
      : '<payload-type id="111" name="opus" clockrate="48000" channels="2"><parameter name="minptime" value="10"/><parameter name="useinbandfec" value="1"/></payload-type>';
    return `<content creator="initiator" name="${name}" senders="both"><description xmlns="urn:xmpp:jingle:apps:rtp:1" media="${media}">${payload}</description><transport xmlns="urn:xmpp:jingle:transports:ice-udp:1"><fingerprint xmlns="urn:xmpp:jingle:apps:dtls:0" hash="sha-256" setup="actpass">browser-managed</fingerprint></transport></content>`;
  }

  function createJingleGroupingXml({ hasVideo = false, hasText = false } = {}) {
    if (!hasText) {
      return "";
    }

    const contents = ['<content name="audio"/>']
      .concat(hasVideo ? ['<content name="video"/>'] : [])
      .concat('<content name="text"/>')
      .join("");
    return `<group xmlns="${jingleGroupingNamespace}" semantics="LS">${contents}</group>`;
  }

  function createJingleRttSyncContentXml(envelope) {
    if (!envelope.rttSync) {
      return "";
    }

    const rttSync = normalizeJingleRttSyncDescriptor(envelope.rttSync, envelope.sid, "offered");
    const attrs = [
      `profile="${escapeXml(rttSync.profile)}"`,
      `label="${escapeXml(rttSync.label)}"`,
      `role="${escapeXml(rttSync.role)}"`,
      `source="${escapeXml(rttSync.source)}"`,
      `sync-mode="${escapeXml(rttSync.syncMode)}"`,
      `max-skew="${escapeXml(rttSync.maxSkewMs)}"`,
      `finality="${escapeXml(rttSync.finality)}"`
    ].join(" ");

    return `<content creator="initiator" name="text" senders="both"><description xmlns="${jingleRttSyncNamespace}"><rtt-sync ${attrs}/></description><transport xmlns="urn:xmpp:jingle:transports:dtls-sctp:1"/></content>`;
  }

  function createJingleRttPacketDebugXml(packet) {
    const attrs = [
      `xmlns="${jingleRttSyncNamespace}"`,
      `event="${escapeXml(packet.event || "edit")}"`,
      `sid="${escapeXml(packet.sid || "")}"`,
      `seq="${escapeXml(packet.seq ?? "")}"`,
      `sync-mode="${escapeXml(packet.syncMode || "co-session")}"`
    ].join(" ");
    const actions = packet.actions ? `<actions>${packet.actions}</actions>` : "";
    const messageId = packet.messageId ? `<message-id>${escapeXml(packet.messageId)}</message-id>` : "";
    const replaceId = packet.replaceId ? `<replace-id>${escapeXml(packet.replaceId)}</replace-id>` : "";
    return `<rtt-sync ${attrs}><t>${escapeXml(packet.text || "")}</t>${actions}${messageId}${replaceId}</rtt-sync>`;
  }

  function createJingleCandidateXml(candidate) {
    if (!candidate?.candidate) {
      return "";
    }

    const parsed = parseIceCandidateLine(candidate.candidate);
    return `<candidate component="${parsed.component}" foundation="${escapeXml(parsed.foundation)}" generation="0" id="${escapeXml(createShortId())}" ip="${escapeXml(parsed.ip)}" network="0" port="${parsed.port}" priority="${parsed.priority}" protocol="${escapeXml(parsed.protocol)}" type="${escapeXml(parsed.type)}"/>`;
  }

  function parseIceCandidateLine(line) {
    const parts = String(line).replace(/^candidate:/, "").split(/\s+/);
    const typIndex = parts.indexOf("typ");
    return {
      foundation: parts[0] || "browser",
      component: Number(parts[1]) || 1,
      protocol: (parts[2] || "udp").toLowerCase(),
      priority: Number(parts[3]) || 1,
      ip: parts[4] || "0.0.0.0",
      port: Number(parts[5]) || 0,
      type: typIndex >= 0 ? parts[typIndex + 1] || "host" : "host"
    };
  }

  function updateCallUi() {
    const call = state.call;
    const incoming = Boolean(call?.incomingOffer);
    el.incomingCallBanner.hidden = !incoming;
    el.incomingCallDialog.hidden = !incoming;
    if (incoming) {
      const title = incomingCallTitle(call);
      const text = incomingCallText(call);
      el.incomingCallTitle.textContent = title;
      el.incomingCallDialogTitle.textContent = title;
      el.incomingCallText.textContent = text;
      el.incomingCallDialogText.textContent = text;
      showIncomingCallBrowserNotification(call);
      el.incomingCallBanner.scrollIntoView({ block: "nearest" });
      el.dialogAnswerButton.focus();
    } else {
      closeIncomingCallBrowserNotification();
    }

    el.answerCallButton.hidden = !incoming;
    el.rejectCallButton.hidden = !incoming;
    setCallButtonsDisabled(Boolean(call));
    setCallModeButtonsHidden(Boolean(call));
    el.hangupCallButton.hidden = !call || incoming;
    el.hangupCallButton.disabled = !call;
    el.hangupCallPanelButton.hidden = !call || incoming;
    el.hangupCallPanelButton.disabled = !call;
    const hasLocalVideo = hasVideoTrack(call?.localStream);
    const hasRemoteVideo = hasVideoTrack(call?.remoteStream);
    const conversation = activeConversation();
    const totalConversationVisible = Boolean(
      call?.rttEnabled
      && conversation
      && addressMatches(conversation.peer, call.peer)
      && !call.incomingOffer
      && state.totalConversationTextVisible
    );
    const totalConversationCallActive = Boolean(
      call?.rttEnabled
      && conversation
      && addressMatches(conversation.peer, call.peer)
      && !call.incomingOffer
    );
    const showLocalPreview = hasLocalVideo;
    const showCallPanel = hasRemoteVideo || hasLocalVideo || totalConversationVisible;
    el.callPanel.hidden = !showCallPanel;
    el.localVideo.hidden = !showLocalPreview;
    el.remoteVideo.hidden = !hasRemoteVideo;
    el.callPanel.classList.toggle("has-local-video", showLocalPreview);
    el.callPanel.classList.toggle("local-video-main", hasLocalVideo && !hasRemoteVideo);
    el.callPanel.classList.toggle("remote-video-main", hasRemoteVideo);
    el.callPanel.classList.toggle("no-remote-video", !hasRemoteVideo);
    document.body.classList.toggle("call-active", showCallPanel);
    document.body.classList.toggle("tc-call-active", totalConversationCallActive && showCallPanel);
    applyCallVideoHeight();
    updateCameraToggleUi();
    updateMicrophoneMuteUi();
    updateTotalConversationTextToggleUi();
    applyRemoteVolume();
    updateTotalConversationTextPanel();
  }

  function savedCallVideoHeight() {
    const value = Number(localStorage.getItem(callVideoHeightStorageKey));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function clampCallVideoHeight(height) {
    const viewportHeight = Math.max(window.innerHeight || 0, 360);
    const min = 180;
    const max = Math.max(min, Math.min(760, viewportHeight - 170));
    return Math.round(Math.min(max, Math.max(min, height)));
  }

  function applyCallVideoHeight(height = savedCallVideoHeight()) {
    if (!height) {
      el.callPanel.style.removeProperty("--call-panel-height");
      return;
    }

    el.callPanel.style.setProperty("--call-panel-height", `${clampCallVideoHeight(height)}px`);
  }

  function startCallVideoResize(event) {
    if (!state.call || el.callPanel.hidden) {
      return;
    }

    event.preventDefault();
    state.callVideoResize.pointerId = event.pointerId;
    state.callVideoResize.startY = event.clientY;
    state.callVideoResize.startHeight = el.callPanel.getBoundingClientRect().height;
    el.callResizeHandle.setPointerCapture?.(event.pointerId);
    document.body.classList.add("call-resizing");
    window.addEventListener("pointermove", resizeCallVideo);
    window.addEventListener("pointerup", stopCallVideoResize, { once: true });
    window.addEventListener("pointercancel", stopCallVideoResize, { once: true });
  }

  function resizeCallVideo(event) {
    if (state.callVideoResize.pointerId !== event.pointerId) {
      return;
    }

    const nextHeight = clampCallVideoHeight(
      state.callVideoResize.startHeight + event.clientY - state.callVideoResize.startY);
    el.callPanel.style.setProperty("--call-panel-height", `${nextHeight}px`);
  }

  function stopCallVideoResize(event) {
    if (state.callVideoResize.pointerId !== null && event?.pointerId !== state.callVideoResize.pointerId) {
      return;
    }

    const height = clampCallVideoHeight(el.callPanel.getBoundingClientRect().height);
    localStorage.setItem(callVideoHeightStorageKey, String(height));
    state.callVideoResize.pointerId = null;
    document.body.classList.remove("call-resizing");
    window.removeEventListener("pointermove", resizeCallVideo);
  }

  function hasVideoTrack(stream) {
    return Boolean(stream?.getVideoTracks?.().some((track) => track.readyState !== "ended"));
  }

  function activeVideoTracks(stream) {
    return stream?.getVideoTracks?.().filter((track) => track.readyState !== "ended") ?? [];
  }

  function updateVideoElementSource(video, stream) {
    if (!video) {
      return;
    }

    const hasVideo = hasVideoTrack(stream);
    video.hidden = !hasVideo;
    video.playsInline = true;
    video.autoplay = true;
    if (video === el.localVideo) {
      video.muted = true;
      video.defaultMuted = true;
    }

    const nextSource = hasVideo ? stream : null;
    if (video.srcObject !== nextSource) {
      video.srcObject = nextSource;
    }

    if (hasVideo) {
      updateVideoOrientationClass(video);
      startVideoPlayback(video);
    } else {
      video.classList.remove("portrait-video", "landscape-video");
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }

  function updateVideoOrientationClass(video) {
    if (!video) {
      return;
    }

    const apply = () => {
      const portrait = Number(video.videoHeight) > Number(video.videoWidth);
      video.classList.toggle("portrait-video", portrait);
      video.classList.toggle("landscape-video", !portrait && Number(video.videoWidth) > 0);
      if (video.videoWidth && video.videoHeight) {
        appendDebug(
          "video-size",
          `${video.id || "video"} ${video.videoWidth}x${video.videoHeight} ${portrait ? "portrait" : "landscape"}`);
      }
    };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth && video.videoHeight) {
      apply();
      return;
    }

    video.addEventListener("loadedmetadata", apply, { once: true });
    video.addEventListener("resize", apply);
  }

  function startVideoPlayback(video) {
    if (!video || video.hidden || !video.srcObject) {
      return;
    }

    const play = () => {
      const promise = video.play?.();
      if (promise?.catch) {
        promise.catch((error) => appendDebug("video-playback", error.message || String(error)));
      }
    };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      play();
      return;
    }

    video.addEventListener("loadedmetadata", play, { once: true });
  }

  function watchCallVideoTracks(call, stream) {
    for (const track of activeVideoTracks(stream)) {
      watchCallVideoTrack(call, track);
    }
  }

  function watchCallVideoTrack(call, track) {
    if (!call || track?.kind !== "video" || track.teletyptelVideoWatcherAttached) {
      return;
    }

    track.teletyptelVideoWatcherAttached = true;
    const refresh = () => {
      if (state.call?.sid !== call.sid) {
        return;
      }

      updateVideoElementSource(el.localVideo, call.localStream);
      updateVideoElementSource(el.remoteVideo, call.remoteStream);
      updateCallUi();
    };

    track.addEventListener("mute", refresh);
    track.addEventListener("unmute", refresh);
    track.addEventListener("ended", refresh);
  }

  function isLocalCameraOff(call = state.call) {
    const tracks = call?.localStream?.getVideoTracks?.() ?? [];
    return tracks.length > 0 && tracks.every((track) => !track.enabled);
  }

  function isRemoteCameraOff(call = state.call) {
    if (call?.remoteVideoMuted) {
      return true;
    }

    const tracks = activeVideoTracks(call?.remoteStream);
    return tracks.length > 0 && tracks.every((track) => track.muted);
  }

  function isVideoMissingForTotalConversation(call = state.call) {
    if (!call?.rttEnabled) {
      return false;
    }

    const hasLocalStreamWithoutVideo = Boolean(call.localStream) && !hasVideoTrack(call.localStream);
    const hasRemoteStreamWithoutVideo = Boolean(call.remoteStream) && !hasVideoTrack(call.remoteStream);
    const audioOnlyRttCall = call.mediaKind !== "video" && !hasVideoTrack(call.localStream) && !hasVideoTrack(call.remoteStream);
    return hasLocalStreamWithoutVideo || hasRemoteStreamWithoutVideo || audioOnlyRttCall;
  }

  function shouldUseFullTotalConversationText(call = state.call) {
    return Boolean(call?.rttEnabled)
      && (isVideoMissingForTotalConversation(call) || isLocalCameraOff(call) || isRemoteCameraOff(call));
  }

  function updateCameraToggleUi() {
    const tracks = state.call?.localStream?.getVideoTracks() ?? [];
    const hasVideo = tracks.length > 0;
    const cameraOff = isLocalCameraOff(state.call);
    el.toggleCameraButton.disabled = !hasVideo;
    setIconButtonAction(
      el.toggleCameraButton,
      cameraOff ? "videocamOff" : "videocam",
      cameraOff ? "button.turn_camera_on" : "button.turn_camera_off",
      cameraOff ? "Turn camera on" : "Turn camera off",
      cameraOff
    );
    el.localVideo.classList.toggle("camera-off", cameraOff);
  }

  function setCallModeButtonsHidden(hidden) {
    el.startAudioCallOption.closest(".call-mode-buttons").hidden = hidden;
  }

  function updateMicrophoneMuteUi() {
    const tracks = state.call?.localStream?.getAudioTracks() ?? [];
    const hasAudio = tracks.length > 0;
    const muted = hasAudio && tracks.every((track) => !track.enabled);
    el.muteMicrophoneButton.disabled = !hasAudio;
    setIconButtonAction(
      el.muteMicrophoneButton,
      muted ? "micOff" : "mic",
      muted ? "button.unmute_microphone" : "button.mute_microphone",
      muted ? "Unmute microphone" : "Mute microphone",
      muted
    );
  }

  function updateTotalConversationTextToggleUi() {
    const hasTotalConversation = Boolean(state.call?.rttEnabled && !state.call?.incomingOffer);
    el.toggleTotalConversationTextButton.disabled = !hasTotalConversation;
    setIconButtonAction(
      el.toggleTotalConversationTextButton,
      "rtt",
      state.totalConversationTextVisible ? "button.hide_tc_text" : "button.show_tc_text",
      state.totalConversationTextVisible ? "Hide real-time text" : "Show real-time text",
      !state.totalConversationTextVisible
    );
  }

  function setCallStatus(text) {
    el.callStatus.textContent = text;
  }

  function supportsWebRtc() {
    return typeof RTCPeerConnection === "function";
  }

  function isRelayConnected() {
    return state.relaySocket?.readyState === WebSocket.OPEN;
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function ensureXmppCallSignalingReady() {
    if (state.xmppSocket?.readyState !== WebSocket.OPEN || !state.xmppSession?.authenticated) {
      connectXmppWebSocket();
      throw new Error(t("call.xmpp_connect_first", "Connect XMPP first, then start the call again."));
    }

    return true;
  }

  function hasActiveMessageTransport() {
    if (activeJingleRttSyncCall()) {
      return true;
    }

    return state.mode === "xmpp"
      ? state.xmppSocket?.readyState === WebSocket.OPEN
      : isRelayConnected();
  }

  function showNotConnectedStatus() {
    const text = t("status.not_connected", "Not connected.");
    setConnectionStatus(text, "danger");
    el.composerState.textContent = text;
  }

  function isAddressedToMe(envelope) {
    if (!envelope.to || envelope.to === "relay@localhost") {
      return true;
    }

    const room = groupRoomFromJingleEnvelope(envelope);
    if (room && addressMatches(envelope.to, room)) {
      return true;
    }

    return jidMatches(envelope.to, currentFromJid());
  }

  function groupRoomFromJingleEnvelope(envelope) {
    const room = bareJid(envelope?.roomJid || "");
    if (room) {
      return room;
    }

    const to = bareJid(envelope?.to || "");
    if (envelope?.conversationKind === "group" || to.includes("@conference.")) {
      return to;
    }

    return "";
  }

  function jidMatches(left, right) {
    const a = String(left || "").trim().toLowerCase();
    const b = String(right || "").trim().toLowerCase();
    return a === b || a.split("/")[0] === b.split("/")[0];
  }

  function jingleInfoText(info, mediaKind = "") {
    if (info === "ringing") {
      return t("call.ringing", "Ringing...");
    }

    if (info === "mute" && mediaKind === "video") {
      return t("call.remote_camera_off", "Other side turned camera off");
    }

    if (info === "unmute" && mediaKind === "video") {
      return t("call.remote_camera_on", "Other side turned camera on");
    }

    if (info === "hold") {
      return t("call.hold", "Call on hold");
    }

    if (info === "unhold" || info === "active") {
      return t("call.connected", "Call connected");
    }

    return t("call.session_info", "Call status updated");
  }

  function jingleRttSyncStatusText(call = state.call) {
    if (!call?.rttEnabled) {
      return t("call.connected", "Call connected");
    }

    if (call?.rttChannel?.readyState === "open" || call?.rttSync?.state === "connected") {
      return t("call.connected_total", "Total conversation connected - live text synchronized");
    }

    if (call?.rttSync?.state === "fallback") {
      return t("call.connected_total", "Total conversation connected - live text synchronized");
    }

    return t("call.connected", "Call connected");
  }

  function redactJingleForLog(envelope) {
    return {
      ...envelope,
      avatarDataUrl: envelope.avatarDataUrl ? `${envelope.avatarDataUrl.length} chars` : undefined,
      sdp: envelope.sdp ? `${envelope.sdp.length} bytes` : null
    };
  }

  function redactEnvelopeForLog(envelope) {
    if (!envelope) {
      return envelope;
    }

    const redacted = { ...envelope };
    if (redacted.avatarDataUrl) {
      redacted.avatarDataUrl = `${redacted.avatarDataUrl.length} chars`;
    }

    if (redacted.location) {
      redacted.location = {
        accuracy: redacted.location.accuracy ?? null,
        timestamp: redacted.location.timestamp ?? null,
        redacted: true
      };
      redacted.xml = redacted.xml ? "geoloc redacted" : redacted.xml;
    }

    return redacted;
  }

  function activeEditTarget() {
    if (!state.editingMessage) {
      return null;
    }

    const conversation = activeConversation();
    if (!conversation || conversation.id !== state.editingMessage.conversationId) {
      clearMessageEdit();
      return null;
    }

    const message = conversation.messages.find((item) => item.id === state.editingMessage.messageId);
    if (!message || message.direction !== "self") {
      clearMessageEdit();
      return null;
    }

    return {
      conversation,
      message,
      replaceId: state.editingMessage.replaceId || bestMessageTargetId(message)
    };
  }

  function startMessageEdit(messageId) {
    const conversation = activeConversation();
    if (!conversation) {
      return;
    }

    const message = conversation.messages.find((item) => item.id === messageId);
    if (!message || message.direction !== "self" || message.attachment || message.location) {
      return;
    }

    state.editingMessage = {
      conversationId: conversation.id,
      messageId: message.id,
      replaceId: bestMessageTargetId(message)
    };
    el.messageInput.value = message.text;
    syncComposerActionButtons();
    el.messageInput.focus();
    el.composerState.textContent = t("composer.editing", "Editing message; sending will replace it.");
  }

  function clearMessageEdit() {
    state.editingMessage = null;
    setDefaultComposerState();
  }

  function setDefaultComposerState() {
    el.composerState.textContent = state.mode === "relay"
      ? t("composer.relay_state", "Enter sends, Shift+Enter inserts a line")
      : t("composer.xmpp_state", "RFC 7395 mode sends XML message stanzas");
  }

  function applyMessageCorrection(conversation, replaceId, text, direction, newId = null, from = null, stylingDisabled = false) {
    const message = conversation.messages.find((item) => messageMatchesAnyId(item, replaceId));
    if (!message) {
      addMessage(direction, text, "edited", from, null, conversation.id, null, newId, stylingDisabled);
      return;
    }

    message.text = text;
    message.stylingDisabled = stylingDisabled;
    message.edited = true;
    message.status = "edited";
    if (newId) {
      message.xmppId = newId;
      message.xmppMessageId = newId;
      message.xmppOriginId = newId;
    }
    if (from) {
      message.from = from;
    }

    if (conversation.id === state.activeConversationId) {
      renderTimeline(conversation);
    }

    renderConversations();
    persistHistoryMessage(conversation, message);
  }

  function applyMessageRetraction(conversation, targetId, moderation = null, from = null) {
    if (!targetId) {
      return;
    }

    const message = conversation.messages.find((item) => messageMatchesAnyId(item, targetId));
    if (!message) {
      addMessage(
        "peer",
        retractedMessageText(moderation),
        "retracted",
        from,
        null,
        conversation.id,
        null,
        null,
        true);
      return;
    }

    message.text = retractedMessageText(moderation);
    message.retracted = true;
    message.retraction = moderation;
    message.attachment = null;
    message.location = null;
    message.edited = false;
    message.status = "retracted";
    if (from) {
      message.from = from;
    }

    if (conversation.id === state.activeConversationId) {
      renderTimeline(conversation);
    }

    renderConversations();
    persistHistoryMessage(conversation, message);
  }

  function parseModeratedRetraction(parent) {
    const moderated = parent.getElementsByTagNameNS("urn:xmpp:message-moderate:1", "moderated")[0];
    if (!moderated) {
      return null;
    }

    const reason = parent.getElementsByTagNameNS("urn:xmpp:message-moderate:1", "reason")[0]?.textContent || "";
    return {
      moderated: true,
      by: moderated.getAttribute("by") || "",
      reason
    };
  }

  function retractedMessageText(moderation = null) {
    if (moderation?.moderated) {
      return moderation.reason
        ? `${t("message.moderated_retracted", "Message removed by moderator")}: ${moderation.reason}`
        : t("message.moderated_retracted", "Message removed by moderator");
    }

    return t("message.retracted", "Message retracted");
  }

  function createMessageId(prefix) {
    const token = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID().replace(/-/g, "")
      : String(Date.now()) + String(Math.random()).slice(2);
    return `${prefix}-${token}`;
  }

  function addMessage(direction, text, status, from = null, attachment = null, conversationId = null, location = null, xmppId = null, stylingDisabled = false, persist = true, senderIdentity = null, deliveryStatus = null) {
    const conversation = conversationId
      ? state.conversations.find((item) => item.id === conversationId)
      : activeConversation();
    if (!conversation) {
      return null;
    }

    const message = {
      id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now() + Math.random()),
      direction,
      from,
      text,
      attachment,
      location,
      status,
      xmppId,
      xmppMessageId: xmppId || "",
      xmppOriginId: xmppId || "",
      xmppStanzaId: "",
      stylingDisabled,
      jingleHistory: null,
      senderDisplayName: senderIdentity?.displayName || null,
      senderAvatarColor: senderIdentity?.avatarColor || null,
      senderAvatarDataUrl: isValidAvatarDataUrl(senderIdentity?.avatarDataUrl) ? senderIdentity.avatarDataUrl : null,
      retracted: false,
      retraction: null,
      edited: false,
      reactions: {},
      deliveryStatus: deliveryStatus || (direction === "self" ? "sent" : ""),
      timestamp: new Date()
    };

    conversation.messages.push(message);
    if (conversation.id === state.activeConversationId) {
      appendMessageToTimeline(message);
    } else if (direction === "peer" && persist) {
      conversation.unreadCount = Math.min((Number(conversation.unreadCount) || 0) + 1, 99);
      showMessageBrowserNotification(conversation, message);
    }

    renderConversations();
    if (persist) {
      persistHistoryMessage(conversation, message);
    }
    return message;
  }

  function upsertLiveLocationMessage(direction, text, status, from, conversationId, location, senderIdentity = null) {
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    const fromAddress = bareJid(from);
    const matchesLiveLocation = (message) => {
      if ((!message.locationLive && message.status !== "location live") || message.direction !== direction) {
        return false;
      }

      if (direction === "self") {
        return true;
      }

      return bareJid(message.from) === fromAddress;
    };
    const existing = conversation.messages.find(matchesLiveLocation);

    if (!existing) {
      addMessage(direction, text, status, from, null, conversation.id, location, null, false, true, senderIdentity);
      const inserted = conversation.messages[conversation.messages.length - 1];
      if (inserted) {
        inserted.locationLive = true;
      }
      return;
    }

    existing.text = text;
    existing.status = status;
    existing.from = from;
    existing.location = location;
    if (senderIdentity?.displayName) {
      existing.senderDisplayName = senderIdentity.displayName;
    }
    if (senderIdentity?.avatarColor) {
      existing.senderAvatarColor = senderIdentity.avatarColor;
    }
    if (isValidAvatarDataUrl(senderIdentity?.avatarDataUrl)) {
      existing.senderAvatarDataUrl = senderIdentity.avatarDataUrl;
    }
    existing.timestamp = new Date();

    conversation.messages = conversation.messages.filter((message) => message === existing || !matchesLiveLocation(message));

    if (conversation.id === state.activeConversationId) {
      updateLiveLocationMessageElement(existing);
    }

    renderConversations();
  }

  function appendMessageToTimeline(message) {
    const existingDraft = message.direction === "peer"
      ? el.messageTimeline.querySelector('[data-remote-draft="true"]')
      : null;

    if (existingDraft) {
      updateMessageElement(existingDraft, message);
      el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
      return;
    }

    appendMessageElementToTimeline(message);
    el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
  }

  function addConversation() {
    const name = prompt(t("prompt.contact_name", "Contact name"), "Tester");
    if (!name) {
      return;
    }

    const peer = prompt(t("prompt.contact_jid", "Contact email"), `${name.trim().toLowerCase()}@localhost`);
    if (!peer) {
      return;
    }

    const conversation = ensureConversationForPeer(peer, "contact", name.trim());
    if (!conversation) {
      return;
    }

    selectConversation(conversation);
    el.peerInput.value = conversation.peer;
    if (state.activeTabId !== "chat") {
      activateTab("chat");
    }
    renderConversations();
    renderActiveConversation();
  }

  function handleXmppPresenceElement(presenceElement) {
    const from = presenceElement.getAttribute("from") || "";
    if (!from || isOwnPeer(from)) {
      return;
    }

    const presence = presenceElement.getAttribute("type") === "unavailable" ? "offline" : "online";
    const show = presenceElement.getElementsByTagNameNS("jabber:client", "show")[0]?.textContent || "";
    const peer = bareJid(from);
    const conversation = ensureConversationForPeer(peer, "contact", displayNameForJid(peer));
    if (!conversation) {
      return;
    }

    conversation.presence = presence;
    if (presence === "offline") {
      conversation.clientState = null;
      conversation.clientStateUpdatedAt = null;
      conversation.lastSeenAt = new Date();
    } else {
      conversation.clientState = show === "dnd" ? "dnd" : "active";
      conversation.clientStateUpdatedAt = new Date();
    }
    renderConversations();
    renderActiveConversation();
  }

  function activeConversation() {
    return state.conversations.find((conversation) => conversation.id === state.activeConversationId) ?? null;
  }

  function selectConversation(conversation) {
    if (!conversation) {
      return;
    }

    state.activeConversationId = conversation.id;
    conversation.unreadCount = 0;
    joinXmppGroupConversation(conversation);
  }

  function renderConversations() {
    el.conversationItems.replaceChildren();
    const query = normalizeConversationSearchText(el.conversationSearchInput.value);
    let visibleCount = 0;
    for (const conversation of state.conversations) {
      if (isOwnContact(conversation) || isBlockedConversation(conversation)) {
        continue;
      }
      if (query && !conversationMatchesSearch(conversation, query)) {
        continue;
      }
      ensurePublicProfileForConversation(conversation);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "conversation-item"
        + (conversation.id === state.activeConversationId ? " selected" : "");
      const avatar = createAvatarElement(conversation, "avatar-list");
      const text = document.createElement("span");
      text.className = "conversation-text";
      const name = document.createElement("strong");
      const meta = document.createElement("span");
      name.textContent = conversationDisplayName(conversation);
      meta.textContent = conversationListPreviewText(conversation);
      text.append(name, meta);
      const time = document.createElement("span");
      time.className = "conversation-time";
      time.textContent = conversationListTimeText(conversation);
      if (!time.textContent) {
        time.hidden = true;
      }
      const presence = document.createElement("span");
      presence.className = `presence-dot presence-${conversationPresence(conversation)}`;
      const unread = createConversationUnreadBadge(conversation);
      const rowMeta = document.createElement("span");
      rowMeta.className = "conversation-row-meta";
      rowMeta.append(time, unread, presence);
      button.append(avatar, text, rowMeta);
      button.addEventListener("click", () => {
        selectConversation(conversation);
        ensurePublicProfileForConversation(conversation);
        el.peerInput.value = conversation.peer;
        state.previousText = "";
        el.messageInput.value = "";
        closeConversationContextMenu();
        if (state.activeTabId !== "chat") {
          activateTab("chat");
        }
        renderConversations();
        renderActiveConversation();
        syncConversationMessageState(conversation, "select");
        el.messageInput.focus();
      });
      button.addEventListener("contextmenu", (event) => showConversationContextMenu(event, conversation, button));
      button.addEventListener("keydown", (event) => {
        if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
          showConversationContextMenu(event, conversation, button);
        }
      });
      el.conversationItems.appendChild(button);
      visibleCount += 1;
    }

    if (!visibleCount && query) {
      const empty = document.createElement("p");
      empty.className = "conversation-empty";
      empty.textContent = t("contacts.search_empty", "No contacts found.");
      el.conversationItems.appendChild(empty);
    }

    updateComposerAvailability();
  }

  function normalizeConversationSearchText(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function conversationMatchesSearch(conversation, query) {
    const haystack = [
      conversationDisplayName(conversation),
      conversation.peer,
      conversation.kind,
      conversationListPreviewText(conversation)
    ]
      .map(normalizeConversationSearchText)
      .join(" ");
    return haystack.includes(query);
  }

  function createConversationUnreadBadge(conversation) {
    const badge = document.createElement("span");
    badge.className = "conversation-unread-badge";
    const count = Number(conversation?.unreadCount) || 0;
    if (count <= 0) {
      badge.hidden = true;
      badge.setAttribute("aria-hidden", "true");
      return badge;
    }

    const label = count > 99 ? "99+" : String(count);
    badge.textContent = label;
    badge.setAttribute("aria-label", t("conversation.unread_count", "{0} unread messages").replace("{0}", label));
    return badge;
  }

  function closeActiveConversation() {
    state.activeConversationId = null;
    state.previousText = "";
    el.messageInput.value = "";
    closeCallMenus();
    closeConversationContextMenu();
    renderConversations();
    renderActiveConversation();
  }

  function syncActiveConversationAvatarButton(conversation) {
    const label = canViewContactProfile(conversation)
      ? t("button.view_profile", "View profile")
      : t("button.profile", "Profile");
    el.activeConversationAvatar.classList.add("avatar-clickable");
    el.activeConversationAvatar.removeAttribute("aria-hidden");
    el.activeConversationAvatar.setAttribute("role", "button");
    el.activeConversationAvatar.tabIndex = 0;
    el.activeConversationAvatar.title = label;
    el.activeConversationAvatar.setAttribute("aria-label", label);
  }

  function renderActiveConversation() {
    const conversation = activeConversation();
    document.body.classList.toggle("conversation-open", Boolean(conversation));
    if (!conversation) {
      renderAvatarInto(el.activeConversationAvatar, {
        displayName: "TX",
        avatarColor: "#2563eb"
      });
      syncActiveConversationAvatarButton(null);
      el.activeConversationName.textContent = t("conversation.none_title", "Select a contact");
      el.activeConversationMeta.textContent = t("conversation.none_meta", "Click a contact to open the chat room.");
      el.messageTimeline.replaceChildren(createNoConversationElement());
      el.remoteDraft.hidden = true;
      el.remoteDraftPreviousText.textContent = "";
      el.remoteDraftText.textContent = "";
      el.messageInput.value = "";
      updateComposerAvailability();
      return;
    }

    el.activeConversationName.textContent = conversationDisplayName(conversation);
    el.activeConversationMeta.textContent = conversationMeta(conversation);
    renderAvatarInto(el.activeConversationAvatar, conversation);
    syncActiveConversationAvatarButton(conversation);
    el.messageTimeline.replaceChildren();

    for (const message of conversation.messages) {
      appendMessageElementToTimeline(message);
    }

    if (conversation.remoteText) {
      appendMessageElementToTimeline({
        direction: "peer",
        from: conversation.remoteFrom,
        text: conversation.remoteText,
        status: "typing",
        timestamp: conversation.remoteDraftUpdatedAt ?? new Date(),
        draft: true,
        senderDisplayName: conversation.remoteIdentity?.displayName || null,
        senderAvatarColor: conversation.remoteIdentity?.avatarColor || null,
        senderAvatarDataUrl: conversation.remoteIdentity?.avatarDataUrl || null
      });
      el.remoteDraft.hidden = false;
      el.remoteDraftName.textContent = displayNameForJid(conversation.remoteFrom || conversation.peer);
      el.remoteDraftPreviousText.textContent = lastPeerConversationText(conversation);
      el.remoteDraftText.textContent = conversation.remoteText || "";
    } else {
      el.remoteDraft.hidden = true;
      el.remoteDraftPreviousText.textContent = "";
      el.remoteDraftText.textContent = "";
    }

    updateLocalRttDraftMessage(conversation, false);
    updateComposerAvailability();
    el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
    updateTotalConversationTextPanel(conversation);
  }

  function updateRemoteDraftMessage(conversationId = state.activeConversationId) {
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    if (conversation.id !== state.activeConversationId) {
      renderConversations();
      return;
    }

    const existing = el.messageTimeline.querySelector('[data-remote-draft="true"]');
    if (!conversation.remoteText) {
      existing?.remove();
      cleanupOrphanMessageDateSeparators();
      el.remoteDraft.hidden = true;
      el.remoteDraftPreviousText.textContent = "";
      el.remoteDraftText.textContent = "";
      updateTotalConversationTextPanel(conversation);
      return;
    }

    el.activeConversationName.textContent = conversationDisplayName(conversation);
    el.activeConversationMeta.textContent = conversationMeta(conversation);
    renderAvatarInto(el.activeConversationAvatar, conversation);
    syncActiveConversationAvatarButton(conversation);
    el.remoteDraft.hidden = false;
    el.remoteDraftName.textContent = displayNameForJid(conversation.remoteFrom || conversation.peer);
    el.remoteDraftPreviousText.textContent = lastPeerConversationText(conversation);
    el.remoteDraftText.textContent = conversation.remoteText || "";

    const message = {
      direction: "peer",
      from: conversation.remoteFrom,
      text: conversation.remoteText,
      status: "typing",
      timestamp: conversation.remoteDraftUpdatedAt ?? new Date(),
      draft: true,
      senderDisplayName: conversation.remoteIdentity?.displayName || null,
      senderAvatarColor: conversation.remoteIdentity?.avatarColor || null,
      senderAvatarDataUrl: conversation.remoteIdentity?.avatarDataUrl || null
    };

    if (!existing) {
      appendMessageElementToTimeline(message);
      el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
      updateTotalConversationTextPanel(conversation);
      return;
    }

    updateMessageElement(existing, message);
    el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
    updateTotalConversationTextPanel(conversation);
  }

  function updateLocalRttDraftMessage(conversation = activeConversation(), scroll = true) {
    const existing = el.messageTimeline.querySelector('[data-local-draft="true"]');
    if (!conversation || conversation.id !== state.activeConversationId || !el.rttToggle.checked) {
      existing?.remove();
      cleanupOrphanMessageDateSeparators();
      return;
    }

    const text = el.messageInput.value;
    if (!text) {
      existing?.remove();
      cleanupOrphanMessageDateSeparators();
      return;
    }

    const message = {
      direction: "self",
      from: currentFromJid(),
      text,
      status: "typing",
      timestamp: new Date(),
      draft: true,
      localDraft: true,
      senderDisplayName: currentSenderName(),
      senderAvatarColor: currentAvatarColor(),
      senderAvatarDataUrl: currentAvatarDataUrl()
    };

    if (!existing) {
      appendMessageElementToTimeline(message);
    } else {
      updateMessageElement(existing, message);
    }

    if (scroll) {
      el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
    }
  }

  function clearLocalRttDraftMessage() {
    el.messageTimeline.querySelector('[data-local-draft="true"]')?.remove();
    cleanupOrphanMessageDateSeparators();
  }

  function updateTotalConversationTextPanel(conversation = activeConversation()) {
    const call = state.call;
    const visible = Boolean(
      call?.rttEnabled
      && conversation
      && addressMatches(conversation.peer, call.peer)
      && !call.incomingOffer
      && state.totalConversationTextVisible
    );
    const fullTextMode = visible && shouldUseFullTotalConversationText(call);

    el.callPanel.classList.toggle("tc-text-full", fullTextMode);
    document.body.classList.toggle("tc-text-visible-active", visible);
    document.body.classList.toggle("tc-text-full-active", fullTextMode);
    updatePhoneLandscapeCallMode(visible);
    el.totalConversationTextPanel.hidden = !visible;
    if (!visible) {
      el.totalConversationRemotePreviousText.textContent = "";
      el.totalConversationRemoteText.textContent = "";
      el.totalConversationLocalPreviousText.textContent = "";
      el.totalConversationLocalText.textContent = "";
      return;
    }

    el.totalConversationRemoteName.textContent = displayNameForJid(conversation.remoteFrom || call.peer);
    el.totalConversationRemotePreviousText.textContent = lastPeerConversationText(conversation);
    el.totalConversationRemoteText.textContent = conversation.remoteText || "";
    el.totalConversationLocalPreviousText.textContent = lastLocalConversationText(conversation);
    el.totalConversationLocalText.textContent = el.messageInput.value || "";
  }

  function lastLocalConversationText(conversation) {
    for (let index = conversation.messages.length - 1; index >= 0; index--) {
      const message = conversation.messages[index];
      if (message.direction === "self" && !message.draft && !message.attachment && !message.location && message.text) {
        return message.text;
      }
    }

    return "";
  }

  function lastPeerConversationText(conversation) {
    for (let index = conversation.messages.length - 1; index >= 0; index--) {
      const message = conversation.messages[index];
      if (message.direction === "peer" && !message.draft && !message.attachment && !message.location && message.text) {
        return message.text;
      }
    }

    return "";
  }

  function addGroupConversation() {
    const groupNumber = state.conversations.filter((conversation) => conversation.kind === "group").length + 1;
    const defaultName = t("conversation.group_default", "Group {0}").replace("{0}", groupNumber);
    const name = prompt(t("prompt.group_name", "Group name"), defaultName);
    if (!name) {
      return;
    }

    const peer = prompt(t("prompt.group_jid", "Room address"), `group${groupNumber}@conference.localhost`);
    if (!peer) {
      return;
    }

    const conversation = ensureConversationForPeer(peer, "group", name.trim());
    selectConversation(conversation);
    el.peerInput.value = conversation.peer;
    renderConversations();
    renderActiveConversation();
  }

  function inviteContactToActiveGroup() {
    const group = activeConversation();
    if (!group || group.kind !== "group") {
      setConnectionStatus(t("status.select_group_first", "Select a group first"), "warn");
      return;
    }

    const contacts = state.conversations.filter((conversation) =>
      conversation.kind === "contact"
      && !isOwnContact(conversation)
      && !isBlockedConversation(conversation));
    if (!contacts.length) {
      setConnectionStatus(t("status.no_contacts", "No contacts available"), "warn");
      return;
    }

    const contactText = contacts.map((conversation) => conversation.peer).join(", ");
    const peer = prompt(t("prompt.invite_contact", "Invite contact email"), contacts[0].peer);
    if (!peer) {
      return;
    }

    const contact = ensureConversationForPeer(peer, "contact", displayNameForJid(peer));
    if (!contact) {
      return;
    }

    if (isBlockedConversation(contact)) {
      setConnectionStatus(t("status.contact_blocked_cannot_send", "This contact is blocked. Unblock to send messages."), "warn");
      return;
    }

    const inviteText = t("message.group_invite", "{0} invited you to {1} ({2}).")
      .replace("{0}", currentSenderName())
      .replace("{1}", conversationDisplayName(group))
      .replace("{2}", group.peer);
    const statusText = t("message.group_invite_sent", "Invitation sent to {0}.").replace("{0}", conversationDisplayName(contact));

    addMessage("peer", statusText, t("sender.system", "System"), t("sender.system", "System"), null, group.id);
    addMessage("peer", inviteText, t("sender.system", "System"), t("sender.system", "System"), null, contact.id);
    if (state.relaySocket?.readyState === WebSocket.OPEN) {
      const envelope = createRelayEnvelope("message", inviteText, "", contact.peer);
      state.relaySocket.send(JSON.stringify(envelope));
      appendDebug("relay-out", JSON.stringify(redactEnvelopeForLog(envelope)));
    }

    setConnectionStatus(statusText, "good");
    appendDebug("invite", `${statusText} (${contactText})`);
  }

  function toggleBlockContextConversation() {
    const conversation = state.conversations.find((item) => item.id === state.contextConversationId) ?? activeConversation();
    closeConversationContextMenu();
    toggleBlockConversation(conversation);
  }

  function toggleMuteContextConversationNotifications() {
    const conversation = state.conversations.find((item) => item.id === state.contextConversationId) ?? activeConversation();
    closeConversationContextMenu();
    toggleMuteConversationNotifications(conversation);
  }

  function toggleMuteConversationNotifications(conversation) {
    if (!canMuteConversationNotifications(conversation)) {
      setConnectionStatus(t("status.select_contact_first", "Select a contact first"), "warn");
      return;
    }

    const shouldMute = !isNotificationMutedConversation(conversation);
    setNotificationMutedPeer(conversation.peer, shouldMute);
    const statusText = shouldMute
      ? t("status.notifications_muted", "Notifications muted for {0}")
      : t("status.notifications_unmuted", "Notifications enabled for {0}");
    setConnectionStatus(statusText.replace("{0}", conversationDisplayName(conversation)), shouldMute ? "warn" : "good");
    renderConversations();
    updateConversationContextMenu();
  }

  function toggleBlockConversation(conversation) {
    if (!canBlockConversation(conversation)) {
      setConnectionStatus(t("status.select_contact_first", "Select a contact first"), "warn");
      return;
    }

    const peer = conversation.peer;
    const shouldBlock = !isBlockedConversation(conversation);
    const wasActive = state.activeConversationId === conversation.id;
    setBlockedPeer(peer, shouldBlock);
    if (shouldBlock) {
      conversation.remoteText = "";
      conversation.remoteFrom = "";
      conversation.remoteDraftUpdatedAt = null;
      if (wasActive) {
        state.activeConversationId = null;
        state.previousText = "";
        el.messageInput.value = "";
        el.peerInput.value = "";
      }
      if (state.call && addressMatches(state.call.peer, peer)) {
        cleanupCall(true);
      }
    }

    sendXmppBlockingCommand(shouldBlock ? "block" : "unblock", peer);
    const statusText = shouldBlock
      ? t("status.contact_blocked", "Contact blocked: {0}")
      : t("status.contact_unblocked", "Contact unblocked: {0}");
    setConnectionStatus(statusText.replace("{0}", conversationDisplayName(conversation)), shouldBlock ? "warn" : "good");
    renderConversations();
    renderActiveConversation();
    refreshOpenTabPanel();
  }

  function setBlockedPeer(peer, blocked) {
    const key = normalizeBlockJid(peer);
    if (!key) {
      return;
    }

    if (blocked) {
      state.blockedJids.add(key);
    } else {
      state.blockedJids.delete(key);
    }

    saveBlockedJids();
  }

  function setNotificationMutedPeer(peer, muted) {
    const key = normalizeBlockJid(peer);
    if (!key) {
      return;
    }

    if (muted) {
      state.mutedNotificationJids.add(key);
    } else {
      state.mutedNotificationJids.delete(key);
    }

    saveMutedNotificationJids();
  }

  function updateConversationContextMenu() {
    const conversation = state.conversations.find((item) => item.id === state.contextConversationId) ?? null;
    const canViewProfile = canViewContactProfile(conversation);
    const canBlock = canBlockConversation(conversation);
    const canMute = canMuteConversationNotifications(conversation);
    const blocked = isBlockedConversation(conversation);
    const muted = isNotificationMutedConversation(conversation);
    const canChangeRoomAvatar = canChangeMucAvatar(conversation);
    el.contextProfileButton.hidden = !canViewProfile;
    el.contextProfileButton.disabled = !canViewProfile;
    el.contextRoomAvatarButton.hidden = !canChangeRoomAvatar;
    el.contextRoomAvatarButton.disabled = !canChangeRoomAvatar;
    el.contextMuteNotificationsButton.disabled = !canMute;
    el.contextMuteNotificationsButton.hidden = !canMute;
    el.contextMuteNotificationsButton.textContent = muted
      ? t("button.unmute_notifications", "Enable notifications")
      : t("button.mute_notifications", "Mute notifications");
    el.contextMuteNotificationsButton.classList.toggle("selected", muted);
    el.contextBlockButton.disabled = !canBlock;
    el.contextBlockButton.hidden = !canBlock;
    el.contextBlockButton.textContent = blocked
      ? t("button.unblock_contact", "Unblock")
      : t("button.block_contact", "Block");
    el.contextBlockButton.classList.toggle("selected", blocked);
    el.contextBlockButton.classList.toggle("danger-action", !blocked);
  }

  function canBlockConversation(conversation) {
    return Boolean(conversation)
      && conversation.kind === "contact"
      && !isOwnPeer(conversation.peer)
      && !isInfrastructurePeer(conversation.peer);
  }

  function canMuteConversationNotifications(conversation) {
    return Boolean(conversation)
      && conversation.kind === "contact"
      && !isOwnPeer(conversation.peer)
      && !isInfrastructurePeer(conversation.peer)
      && !isBlockedConversation(conversation);
  }

  function canOpenConversationContextMenu(conversation) {
    return canViewContactProfile(conversation)
      || canMuteConversationNotifications(conversation)
      || canBlockConversation(conversation)
      || canChangeMucAvatar(conversation);
  }

  function canViewContactProfile(conversation) {
    return Boolean(conversation)
      && conversation.kind === "contact"
      && !isOwnPeer(conversation.peer)
      && !isInfrastructurePeer(conversation.peer);
  }

  function canChangeMucAvatar(conversation) {
    return Boolean(conversation)
      && conversation.kind === "group"
      && !isBlockedConversation(conversation);
  }

  function chooseContextRoomAvatar() {
    const conversation = state.conversations.find((item) => item.id === state.contextConversationId) ?? null;
    if (!canChangeMucAvatar(conversation)) {
      return;
    }

    state.pendingMucAvatarConversationId = conversation.id;
    closeConversationContextMenu();
    el.mucAvatarFileInput.value = "";
    el.mucAvatarFileInput.click();
  }

  function handleMucAvatarFileSelected() {
    const conversationId = state.pendingMucAvatarConversationId || state.contextConversationId;
    const conversation = state.conversations.find((item) => item.id === conversationId) ?? activeConversation();
    state.pendingMucAvatarConversationId = null;
    const file = el.mucAvatarFileInput.files?.[0] ?? null;
    if (!file || !canChangeMucAvatar(conversation)) {
      return;
    }

    if (!/^image\/(?:png|jpeg|gif|webp|svg\+xml)$/i.test(file.type)) {
      setConnectionStatus(t("avatar.unsupported", "Choose a PNG, JPEG, GIF, WebP or SVG avatar."), "warn");
      return;
    }

    if (file.size > avatarMaxBytes) {
      setConnectionStatus(t("avatar.file_too_large", "Avatar file is too large. Choose an image up to 256 KB."), "warn");
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = String(reader.result ?? "");
      if (!isValidAvatarDataUrl(dataUrl)) {
        setConnectionStatus(t("avatar.read_failed", "Avatar could not be read."), "danger");
        return;
      }

      conversation.avatarDataUrl = dataUrl;
      conversation.mucAvatarHash = hexBytes(sha1Bytes(dataUrlPayloadBytes(dataUrl)));
      conversation.mucAvatarMediaType = file.type || dataUrlMediaType(dataUrl) || "image/png";
      conversation.mucAvatarUpdatedAt = new Date().toISOString();
      setConnectionStatus(t("status.group_avatar_changed", "Group avatar changed."), "good");
      appendDebug("muc-avatar", `${conversation.peer} ${conversation.mucAvatarHash}`);
      renderConversations();
      renderActiveConversation();
      refreshOpenTabPanel();
    });
    reader.addEventListener("error", () => setConnectionStatus(t("avatar.read_failed", "Avatar could not be read."), "danger"));
    reader.readAsDataURL(file);
  }

  function refreshOpenTabPanel() {
    if (!el.accountDialog.hidden) {
      renderSettingsPanels();
    }

    if (state.activeTabId === "chat") {
      return;
    }

    const tab = allTabs().find((item) => item.id === state.activeTabId);
    if (!tab) {
      return;
    }

    if (isHistoryTab(tab)) {
      if (!el.historyPage.hidden) {
        renderHistoryPage(tab);
      }
      return;
    }

    if (!el.tabPanel.hidden) {
      renderTabPanel(tab);
    }
  }

  function blockedContactEntries() {
    const conversationsByPeer = new Map();
    for (const conversation of state.conversations) {
      const key = normalizeBlockJid(conversation.peer);
      if (key && state.blockedJids.has(key)) {
        conversationsByPeer.set(key, conversation);
      }
    }

    return Array.from(state.blockedJids)
      .filter((jid) => !isOwnPeer(jid))
      .map((jid) => conversationsByPeer.get(jid) ?? createBlockedContactEntry(jid))
      .sort((left, right) => conversationDisplayName(left).localeCompare(conversationDisplayName(right)));
  }

  function createBlockedContactEntry(jid) {
    return {
      id: `blocked-${jid}`,
      name: displayNameForJid(jid),
      peer: jid,
      kind: "contact",
      avatarColor: avatarColorFor(jid),
      presence: "blocked",
      meta: "",
      messages: [],
      remoteText: "",
      remoteFrom: "",
      remoteDraftUpdatedAt: null
    };
  }

  function isActiveConversationBlocked() {
    return isBlockedConversation(activeConversation());
  }

  function isBlockedConversation(conversation) {
    return Boolean(conversation) && isBlockedPeer(conversation.peer);
  }

  function isBlockedEnvelope(envelope) {
    const from = envelopeFrom(envelope);
    return Boolean(from) && isBlockedPeer(from);
  }

  function isBlockedPeer(peer) {
    const key = normalizeBlockJid(peer);
    return Boolean(key) && state.blockedJids.has(key);
  }

  function isNotificationMutedConversation(conversation) {
    return Boolean(conversation) && isNotificationMutedPeer(conversation.peer);
  }

  function isNotificationMutedPeer(peer) {
    const key = normalizeBlockJid(peer);
    return Boolean(key) && state.mutedNotificationJids.has(key);
  }

  function normalizeBlockJid(peer) {
    const bare = bareJid(peer).trim().toLowerCase();
    return bare && !isInfrastructurePeer(bare) ? bare : "";
  }

  function sendXmppBlockingCommand(action, peer) {
    if (state.xmppSocket?.readyState !== WebSocket.OPEN) {
      return;
    }

    const jid = escapeXml(bareJid(peer));
    const id = `${action}-${Date.now().toString(36)}`;
    const child = action === "block"
      ? `<block xmlns="urn:xmpp:blocking"><item jid="${jid}"/></block>`
      : `<unblock xmlns="urn:xmpp:blocking"><item jid="${jid}"/></unblock>`;
      const xml = `<iq xmlns="jabber:client" type="set" id="${id}">${child}</iq>`;
    sendXmppStanza(xml);
  }

  function createNoConversationElement() {
    const item = document.createElement("div");
    item.className = "no-conversation";
    const title = document.createElement("strong");
    const text = document.createElement("span");
    title.textContent = t("conversation.none_title", "Select a contact");
    text.textContent = t("conversation.none_meta", "Click a contact to open the chat room.");
    item.append(title, text);
    return item;
  }

  function updateComposerAvailability() {
    const hasConversation = Boolean(activeConversation());
    const blocked = isActiveConversationBlocked();
    const selectedGroup = activeConversation()?.kind === "group";

    el.composerForm.classList.toggle("composer-disabled", !hasConversation || blocked);
    el.messageInput.disabled = !hasConversation || blocked;
    el.sendButton.disabled = !hasConversation || blocked;
    el.resetRttButton.disabled = !hasConversation || blocked;
    el.attachmentMenuButton.disabled = !hasConversation || blocked;
    el.attachmentPhotoButton.disabled = !hasConversation || blocked;
    el.attachmentVideoButton.disabled = !hasConversation || blocked;
    el.uploadFileButton.disabled = !hasConversation || blocked;
    el.attachmentLocationButton.disabled = !hasConversation || blocked;
    el.emojiButton.disabled = !hasConversation || blocked;
    el.videoMessageButton.disabled = !hasConversation || blocked;
    el.voiceMessageButton.disabled = !hasConversation || blocked;
    syncComposerActionButtons();
    syncRttToolbarState();
    if (!hasConversation || blocked) {
      closeAttachmentMenu();
      closeSmileyPicker();
    }
    syncEmojiButtonState();
    setCallButtonsDisabled(!hasConversation || Boolean(state.call) || blocked);
    el.inviteConversationButton.disabled = !selectedGroup;
  }

  function setAccountReady(ready) {
    state.accountReady = ready === true;
    if (state.accountReady) {
      scheduleSessionInactivityTimeout();
    } else {
      window.clearTimeout(state.sessionIdleTimerId);
      state.sessionIdleTimerId = null;
    }
    updateConnectButtonAvailability();
    updateComposerAvailability();
  }

  function autoConnectIfReady() {
    if (!state.accountReady || state.accountGateRequired) {
      return;
    }

    if (state.relaySocket?.readyState === WebSocket.CONNECTING
      || state.relaySocket?.readyState === WebSocket.OPEN
      || state.xmppSocket?.readyState === WebSocket.CONNECTING
      || state.xmppSocket?.readyState === WebSocket.OPEN) {
      return;
    }

    window.setTimeout(() => {
      if (!state.accountReady || state.accountGateRequired) {
        return;
      }

      connectXmppWebSocket();
    }, 0);
  }

  function updateConnectButtonAvailability() {
    if (!el.connectButton || !el.disconnectButton) {
      return;
    }

    const relayBusy = state.relaySocket?.readyState === WebSocket.CONNECTING
      || state.relaySocket?.readyState === WebSocket.OPEN;
    const relayOpen = state.relaySocket?.readyState === WebSocket.OPEN;
    const xmppOpen = state.xmppSocket?.readyState === WebSocket.OPEN;
    const connected = relayOpen || xmppOpen;
    el.connectButton.disabled = !state.accountReady || state.accountGateRequired || relayBusy;
    el.disconnectButton.hidden = !state.developerMode || !connected;
    el.disconnectButton.disabled = !connected;
    el.logoutButton.disabled = state.accountGateRequired && !hasStoredAccountSession();
    updateServerSettingsReadonly();
  }

  function hasActiveConversation() {
    return Boolean(activeConversation());
  }

  function conversationMeta(conversation) {
    if (isBlockedConversation(conversation)) {
      return t("presence.blocked", "Blocked");
    }

    if (conversation.kind === "group") {
      return t("presence.group", "Group");
    }

    if (conversation.presence === "online") {
      return conversation.clientState === "dnd"
        ? t("presence.do_not_disturb", "Do not disturb")
        : conversation.clientState === "inactive"
        ? t("presence.online_inactive", "Online - inactive")
        : t("presence.online", "Online");
    }

    return conversation.lastSeenAt
      ? t("presence.last_seen", "last seen: {0}").replace("{0}", formatLastSeen(conversation.lastSeenAt))
      : t("presence.offline", "Offline");
  }

  function conversationListPreviewText(conversation) {
    const message = lastConversationPreviewMessage(conversation);
    if (!message) {
      return conversationListFallbackMeta(conversation);
    }

    const body = conversationPreviewBody(message);
    if (!body) {
      return conversationListFallbackMeta(conversation);
    }

    const prefix = conversationPreviewPrefix(conversation, message);
    return prefix ? `${prefix}: ${body}` : body;
  }

  function conversationListTimeText(conversation) {
    const message = lastConversationPreviewMessage(conversation);
    const timestamp = message?.timestamp || conversation.lastSeenAt || null;
    if (!timestamp) {
      return "";
    }

    return conversationListDateLabel(timestamp);
  }

  function conversationListDateLabel(value) {
    const date = normalizeMessageDate(value);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return formatTime(date);
    }

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return t("history.yesterday", "Yesterday");
    }

    const dayBeforeYesterday = new Date(today);
    dayBeforeYesterday.setDate(today.getDate() - 2);
    if (date.toDateString() === dayBeforeYesterday.toDateString()) {
      return t("history.day_before_yesterday", "The day before yesterday");
    }

    const weekAgo = new Date(today);
    weekAgo.setHours(0, 0, 0, 0);
    weekAgo.setDate(weekAgo.getDate() - 6);
    if (date >= weekAgo) {
      return date.toLocaleDateString(undefined, { weekday: "long" });
    }

    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function conversationListFallbackMeta(conversation) {
    return conversationMeta(conversation);
  }

  function lastConversationPreviewMessage(conversation) {
    for (let index = conversation.messages.length - 1; index >= 0; index--) {
      const message = conversation.messages[index];
      if (!message?.draft) {
        return message;
      }
    }
    return null;
  }

  function conversationPreviewPrefix(conversation, message) {
    if (message.direction === "self") {
      return t("tc.local_label", "Ik");
    }

    if (conversation.kind === "group") {
      return message.senderDisplayName || displayNameForJid(message.from);
    }

    return "";
  }

  function conversationPreviewBody(message) {
    if (message.retracted) {
      return retractedMessageText(message.retraction);
    }

    if (isCallMessage(message)) {
      const text = visibleMessageText(message) || t("button.call_total_conversation", "Totale conversatie");
      const meta = callMessageMetaText(message);
      return meta ? `${text} - ${meta}` : text;
    }

    if (message.attachment) {
      const kind = message.attachment.kind || classifyAttachment(message.attachment);
      return attachmentKindText(kind);
    }

    if (message.location) {
      return message.text || t("location.shared_message", "Locatie gedeeld");
    }

    return String(message.text || "").replace(/\s+/g, " ").trim();
  }

  function conversationDisplayName(conversation) {
    return conversation?.nameKey
      ? t(conversation.nameKey, conversation.name)
      : conversation?.name ?? "";
  }

  function conversationPresence(conversation) {
    if (isBlockedConversation(conversation)) {
      return "blocked";
    }

    return conversation.kind === "group" ? "group" : conversation.presence || "offline";
  }

  function ensureConversationForPeer(peer, kind = "contact", name = null) {
    const normalizedPeer = bareJid(peer || "relay@localhost");
    if (kind === "contact" && isOwnPeer(normalizedPeer)) {
      setConnectionStatus(t("status.cannot_add_self", "You cannot add your own account as a contact."), "warn");
      return null;
    }

    const existing = state.conversations.find((conversation) => addressMatches(conversation.peer, normalizedPeer));
    if (existing) {
      if (kind === "group" && existing.kind !== "group") {
        existing.kind = "group";
        existing.presence = "group";
      }
      if (name && existing.name === existing.peer) {
        existing.name = name;
      }

      return existing;
    }

    const conversation = {
      id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name || displayNameForJid(normalizedPeer),
      peer: normalizedPeer,
      kind,
      avatarColor: avatarColorFor(`${name || normalizedPeer}:${normalizedPeer}`),
      presence: kind === "group" ? "group" : "offline",
      clientState: null,
      clientStateUpdatedAt: null,
      lastSeenAt: null,
      meta: "",
      messages: [],
      remoteText: "",
      remoteFrom: "",
      remoteDraftUpdatedAt: null
    };
    state.conversations.push(conversation);
    return conversation;
  }

  function conversationForEnvelope(envelope) {
    const to = typeof envelope.to === "string" ? envelope.to.trim() : "";
    const from = envelopeFrom(envelope);
    const knownGroup = to
      ? state.conversations.find((conversation) => conversation.kind === "group" && addressMatches(conversation.peer, to))
      : null;
    if (knownGroup) {
      return knownGroup;
    }

    const peer = from || to || "relay@localhost";
    if (isOwnPeer(peer)) {
      return null;
    }

    return ensureConversationForPeer(peer, "contact", displayNameForJid(peer));
  }

  function setPeerPresence(peer, presence) {
    if (isOwnPeer(peer) || isBlockedPeer(peer)) {
      return;
    }

    const conversation = state.conversations.find((item) => addressMatches(item.peer, peer));
    if (!conversation || conversation.kind === "group") {
      return;
    }

    conversation.presence = presence;
    if (presence === "offline") {
      conversation.clientState = null;
      conversation.clientStateUpdatedAt = null;
      conversation.lastSeenAt = new Date();
    }
    renderConversations();
  }

  function setInfrastructurePresence(presence) {
    for (const conversation of state.conversations) {
      if (conversation.kind === "group" || addressMatches(conversation.peer, "relay@localhost")) {
        conversation.presence = presence;
      }
    }

    renderConversations();
  }

  function setAllContactPresence(presence) {
    for (const conversation of state.conversations) {
      if (conversation.kind === "contact" && !isOwnContact(conversation)) {
        conversation.presence = presence;
        if (presence === "offline") {
          conversation.clientState = null;
          conversation.clientStateUpdatedAt = null;
          conversation.lastSeenAt = new Date();
        }
      }
    }
  }

  function isOwnContact(conversation) {
    return conversation?.kind === "contact"
      && !isInfrastructurePeer(conversation.peer)
      && isOwnPeer(conversation.peer);
  }

  function isOwnPeer(peer) {
    const self = currentBareJid();
    return Boolean(self) && !isInfrastructurePeer(peer) && addressMatches(peer, self);
  }

  function isInfrastructurePeer(peer) {
    return addressMatches(peer, "relay@localhost");
  }

  function currentBareJid() {
    return bareJid(currentFromJid()).toLowerCase();
  }

  function addressMatches(left, right) {
    if (!left || !right) {
      return false;
    }

    return String(left).trim().toLowerCase() === String(right).trim().toLowerCase()
      || bareJid(left).toLowerCase() === bareJid(right).toLowerCase();
  }

  function bareJid(jid) {
    return String(jid ?? "").trim().split("/")[0];
  }

  function createMessageElement(message) {
    const item = document.createElement("article");
    applyMessageElementClass(item, message);
    item.dataset.dateKey = messageDayKey(message.timestamp);
    if (message.id) {
      item.dataset.messageId = message.id;
    }
    item.addEventListener("contextmenu", (event) => showMessageContextMenu(event, message, item));
    applyMessageDraftDataset(item, message);
    renderMessageElementChildren(item, message);
    return item;
  }

  function appendMessageElementToTimeline(message) {
    appendMessageDateSeparatorIfNeeded(message.timestamp);
    el.messageTimeline.appendChild(createMessageElement(message));
  }

  function appendMessageDateSeparatorIfNeeded(value) {
    const key = messageDayKey(value);
    if (!key || lastTimelineDateKey() === key) {
      return;
    }

    const separator = document.createElement("div");
    separator.className = "message-date-separator";
    separator.dataset.dateKey = key;
    separator.setAttribute("role", "separator");
    const label = document.createElement("span");
    label.textContent = messageDateSeparatorLabel(value);
    separator.appendChild(label);
    el.messageTimeline.appendChild(separator);
  }

  function lastTimelineDateKey() {
    for (let node = el.messageTimeline.lastElementChild; node; node = node.previousElementSibling) {
      if (node.dataset?.dateKey) {
        return node.dataset.dateKey;
      }
    }
    return "";
  }

  function cleanupOrphanMessageDateSeparators() {
    const separators = Array.from(el.messageTimeline.querySelectorAll(".message-date-separator"));
    for (const separator of separators) {
      let hasMessage = false;
      for (let node = separator.nextElementSibling; node; node = node.nextElementSibling) {
        if (node.classList.contains("message-date-separator")) {
          break;
        }
        if (node.classList.contains("message")) {
          hasMessage = true;
          break;
        }
      }
      if (!hasMessage) {
        separator.remove();
      }
    }
  }

  function messageDayKey(value) {
    const date = normalizeMessageDate(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function messageDateSeparatorLabel(value) {
    const date = normalizeMessageDate(value);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return t("history.today", "Vandaag");
    }

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return t("history.yesterday", "Gisteren");
    }

    const dayBeforeYesterday = new Date(today);
    dayBeforeYesterday.setDate(today.getDate() - 2);
    if (date.toDateString() === dayBeforeYesterday.toDateString()) {
      return t("history.day_before_yesterday", "Eergisteren");
    }

    const tenDaysAgo = new Date(today);
    tenDaysAgo.setHours(0, 0, 0, 0);
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 9);
    if (date >= tenDaysAgo) {
      return date.toLocaleDateString(undefined, { weekday: "long" });
    }

    return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  }

  function normalizeMessageDate(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  function updateLiveLocationMessageElement(message) {
    const item = Array.from(el.messageTimeline.querySelectorAll("[data-message-id]"))
      .find((element) => element.dataset.messageId === message.id);
    if (!item) {
      renderActiveConversation();
      return;
    }

    applyMessageElementClass(item, message);
    const meta = item.querySelector(".message-meta");
    if (meta) {
      renderMessageMeta(meta, message);
    }

    const body = item.querySelector(".message-body");
    const card = body?.querySelector(".location-card");
    if (!body || !card || !message.location) {
      updateMessageElement(item, message);
      return;
    }

    for (const node of Array.from(body.childNodes)) {
      if (node === card) {
        break;
      }
      node.remove();
    }
    body.insertBefore(document.createTextNode(message.text), card);
    updateLocationElement(card, message.location, message);
  }

  function updateMessageElement(item, message) {
    applyMessageElementClass(item, message);
    item.dataset.dateKey = messageDayKey(message.timestamp);
    if (message.id) {
      item.dataset.messageId = message.id;
    }
    applyMessageDraftDataset(item, message);
    if (message.draft) {
      updateDraftMessageElement(item, message);
      return;
    }
    renderMessageElementChildren(item, message);
  }

  function updateMessageElementById(message) {
    if (!message || activeConversation()?.messages?.includes(message) !== true) {
      renderConversations();
      return;
    }

    const item = Array.from(el.messageTimeline.querySelectorAll("[data-message-id]"))
      .find((element) => element.dataset.messageId === message.id);
    if (item) {
      updateMessageElement(item, message);
    }
    renderConversations();
  }

  function updateDraftMessageElement(item, message) {
    const meta = item.querySelector(".message-meta");
    if (meta) {
      renderMessageMeta(meta, message);
    }

    const body = item.querySelector(".message-text-content") || item.querySelector(".message-body");
    if (body) {
      renderRichText(body, message.text, message.stylingDisabled);
      return;
    }

    renderMessageElementChildren(item, message);
  }

  function applyMessageElementClass(item, message) {
    const withAvatar = shouldShowMessageAvatar(message);
    item.className = "message " + message.direction
      + (message.draft ? " draft" : "")
      + (message.retracted ? " retracted" : "")
      + (shouldRenderInlineMessageMeta(message) ? " has-inline-meta" : "")
      + (shouldRenderMessageBubbleTail(message) ? " has-bubble-tail" : "")
      + (withAvatar ? " with-avatar" : "")
      + (activeConversation()?.kind === "group" ? " group-message" : "");
  }

  function applyMessageDraftDataset(item, message) {
    if (message.draft && !message.localDraft) {
      item.dataset.remoteDraft = "true";
    } else {
      delete item.dataset.remoteDraft;
    }

    if (message.localDraft) {
      item.dataset.localDraft = "true";
    } else {
      delete item.dataset.localDraft;
    }
  }

  function renderMessageElementChildren(item, message) {
    const meta = document.createElement("div");
    meta.className = "message-meta";
    renderMessageMeta(meta, message);

    const body = document.createElement("div");
    body.className = "message-body";
    if (shouldRenderGroupSenderInBubble(message)) {
      appendGroupSenderLabel(body, message);
    }
    if (isCallMessage(message)) {
      body.appendChild(createCallMessageCard(message));
    } else {
      const textContent = document.createElement("span");
      textContent.className = "message-text-content";
      renderRichText(textContent, visibleMessageText(message), message.stylingDisabled);
      body.appendChild(textContent);
    }
    if (!message.retracted && message.attachment) {
      body.appendChild(createAttachmentElement(message.attachment));
    }
    if (!message.retracted && message.location) {
      body.appendChild(createLocationElement(message.location, message));
    }
    appendLinkPreviewIfNeeded(body, message);
    if (shouldRenderInlineMessageMeta(message)) {
      appendInlineMessageMeta(body, message);
    }
    const reactionButton = canReactToMessage(message) ? createMessageReactionButton(message) : null;
    const reactionsElement = canReactToMessage(message) ? createMessageReactionsElement(message) : null;
    const bodyWrap = createMessageBodyWrap(body, reactionButton, reactionsElement);

    if (!shouldShowMessageAvatar(message)) {
      item.replaceChildren(...messageContentChildren(message, meta, bodyWrap));
      return;
    }

    const content = document.createElement("div");
    content.className = "message-content";
    content.append(...messageContentChildren(message, meta, bodyWrap));
    const avatar = createAvatarElement(messageAvatarSource(message), "message-avatar");
    makeMessageAvatarInteractive(avatar, message);
    item.replaceChildren(avatar, content);
  }

  function makeMessageAvatarInteractive(avatar, message) {
    if (!avatar || !message) {
      return;
    }

    avatar.classList.add("message-avatar-clickable");
    avatar.removeAttribute("aria-hidden");
    avatar.setAttribute("role", "button");
    avatar.tabIndex = 0;
    avatar.title = t("button.view_profile", "View profile");
    avatar.setAttribute("aria-label", t("button.view_profile", "View profile"));
    avatar.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMessageAvatarProfile(message);
    });
    avatar.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      openMessageAvatarProfile(message);
    });
  }

  function openMessageAvatarProfile(message) {
    if (message?.direction === "self") {
      openAccountDialog({ mode: "profile" });
      return;
    }

    const conversation = conversationForMessageProfile(message);
    if (!conversation || isInfrastructurePeer(conversation.peer)) {
      return;
    }

    openContactProfileDialog(conversation);
  }

  function conversationForMessageProfile(message) {
    const peer = bareJid(message?.from || "");
    if (!peer && !message?.senderDisplayName) {
      return activeConversation();
    }

    const existing = state.conversations.find((conversation) => {
      return conversation.kind === "contact" && addressMatches(conversation.peer, peer);
    });
    if (existing) {
      return existing;
    }

    return {
      id: `message-profile:${peer || message.senderDisplayName || "unknown"}`,
      kind: "contact",
      name: message.senderDisplayName || displayNameForJid(peer),
      displayName: message.senderDisplayName || displayNameForJid(peer),
      peer,
      email: peer,
      presence: "",
      avatarColor: message.senderAvatarColor || avatarColorFor(peer || message.senderDisplayName || "message-profile"),
      avatarDataUrl: message.senderAvatarDataUrl || ""
    };
  }

  function messageContentChildren(message, meta, bodyWrap) {
    return [meta, bodyWrap];
  }

  function createMessageBodyWrap(body, reactionButton, reactionsElement) {
    const wrap = document.createElement("div");
    wrap.className = "message-body-wrap";
    wrap.appendChild(body);
    if (reactionButton) {
      wrap.appendChild(reactionButton);
    }
    if (reactionsElement) {
      wrap.appendChild(reactionsElement);
    }
    return wrap;
  }

  function canReactToMessage(message) {
    return Boolean(message) && !message.draft && !message.retracted && !isCallMessage(message);
  }

  function shouldRenderInlineMessageMeta(message) {
    return Boolean(message) && !message.draft && !isCallMessage(message);
  }

  function shouldRenderMessageBubbleTail(message) {
    return shouldRenderInlineMessageMeta(message)
      && !message.retracted;
  }

  function shouldRenderGroupSenderInBubble(message) {
    return Boolean(message)
      && activeConversation()?.kind === "group"
      && shouldRenderInlineMessageMeta(message);
  }

  function appendGroupSenderLabel(body, message) {
    const label = document.createElement("span");
    label.className = "message-group-sender-label";
    label.textContent = message.direction === "self"
      ? currentSenderName()
      : message.senderDisplayName || displayNameForJid(message.from);
    body.appendChild(label);
  }

  function appendInlineMessageMeta(body, message) {
    const inlineMeta = document.createElement("span");
    inlineMeta.className = "message-inline-meta";
    renderInlineMessageMeta(inlineMeta, message);
    body.append(" ", inlineMeta);
  }

  function createMessageReactionButton(message) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "message-reaction-button";
    button.title = t("reaction.add", "React");
    button.setAttribute("aria-label", t("reaction.add", "React"));
    button.appendChild(createMaterialIcon("mood"));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMessageReactionPicker(message, button);
    });
    return button;
  }

  function createMessageReactionsElement(message) {
    const wrapper = document.createElement("div");
    wrapper.className = "message-reactions";
    const counts = aggregateMessageReactions(message.reactions);
    wrapper.hidden = counts.length === 0;
    for (const item of counts) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "message-reaction-chip";
      appendReactionChipContent(chip, item);
      chip.title = t("reaction.toggle", "Toggle reaction");
      chip.setAttribute("aria-label", t("reaction.toggle", "Toggle reaction"));
      chip.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleMessageReaction(message, item.emoji);
      });
      wrapper.appendChild(chip);
    }
    return wrapper;
  }

  function appendReactionChipContent(chip, item) {
    const value = String(item?.emoji || "");
    const tokens = tokenizeSmilies(value);
    if (tokens.length === 1 && tokens[0].kind === "smiley") {
      chip.appendChild(createSmileyImage(tokens[0]));
    } else {
      chip.appendChild(document.createTextNode(value));
    }

    if (item.count > 1) {
      const count = document.createElement("span");
      count.className = "message-reaction-count";
      count.textContent = String(item.count);
      chip.appendChild(count);
    }
  }

  function visibleMessageText(message) {
    if (!message?.attachment) {
      return message?.text || "";
    }

    const kind = message.attachment.kind || classifyAttachment(message.attachment);
    if (kind === "photo") {
      return "";
    }

    return message.text || "";
  }

  function isCallMessage(message) {
    return isCallMessageStatus(message?.status);
  }

  function isCallMessageStatus(status) {
    const value = String(status || "");
    return value === "jingle" || value.startsWith("call-");
  }

  function createCallMessageCard(message) {
    const card = document.createElement("div");
    card.className = "call-message-card";
    const status = String(message.status || "");
    card.classList.toggle("missed", status === "call-missed" || status === "call-failed");

    const icon = document.createElement("span");
    icon.className = "call-message-icon";
    icon.appendChild(createMaterialIcon(status === "call-missed" || status === "call-failed" ? "callEnd" : "call"));

    const text = document.createElement("div");
    text.className = "call-message-text";
    const title = document.createElement("strong");
    title.textContent = visibleMessageText(message) || t("button.call_total_conversation", "Total conversation");
    const meta = document.createElement("span");
    meta.textContent = callMessageMetaText(message);
    text.append(title, meta);

    card.append(icon, text);
    const callInfo = message.callInfo || {};
    if (callInfo.callId && message.status === "call-ended") {
      const historyButton = document.createElement("button");
      historyButton.type = "button";
      historyButton.className = "call-message-history-button";
      const label = t("history.watch_back", "Terugkijken");
      historyButton.title = label;
      historyButton.setAttribute("aria-label", label);
      historyButton.appendChild(createMaterialIcon("event"));
      historyButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openConversationHistoryCall(callInfo.callId);
      });
      card.appendChild(historyButton);
    }
    return card;
  }

  function callMessageMetaText(message) {
    const info = message.callInfo || {};
    const status = String(message.status || "");
    if (status === "call-missed") {
      return t("call.missed_action", "Gemist - terugbellen mogelijk");
    }
    if (status === "call-rejected") {
      return t("call.rejected", "Call rejected");
    }
    if (status === "call-failed") {
      return t("call.failed", "Call failed");
    }
    if (Number(info.durationSeconds) > 0) {
      return formatDuration(info.durationSeconds);
    }
    if (status === "jingle") {
      return t("call.started", "Oproep gestart");
    }
    return t("history.status_ended", "beeindigd");
  }

  function openMessageReactionPicker(message, anchor) {
    closeMessageReactionPicker();
    state.reactionMessageId = message.id;
    const picker = document.createElement("div");
    picker.className = "message-reaction-picker";
    picker.dataset.messageId = message.id;
    picker.setAttribute("role", "menu");
    for (const emoji of quickReactionEmojis) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = emoji;
      button.setAttribute("role", "menuitem");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleMessageReaction(message, emoji);
        closeMessageReactionPicker();
      });
      picker.appendChild(button);
    }
    const customButton = document.createElement("button");
    customButton.type = "button";
    customButton.textContent = "+";
    customButton.setAttribute("role", "menuitem");
    customButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openReactionSmileyPicker(message, customButton);
    });
    picker.appendChild(customButton);
    document.body.appendChild(picker);
    const rect = anchor.getBoundingClientRect();
    picker.style.left = `${Math.min(window.innerWidth - picker.offsetWidth - 8, Math.max(8, rect.left))}px`;
    picker.style.top = `${Math.max(8, rect.top - picker.offsetHeight - 8)}px`;
  }

  function closeMessageReactionPicker() {
    document.querySelector(".message-reaction-picker")?.remove();
    state.reactionMessageId = null;
  }

  function closeMessageReactionPickerOnOutsideClick(event) {
    if (event.target instanceof Element && event.target.closest(".message-reaction-picker, .message-reaction-button")) {
      return;
    }
    closeMessageReactionPicker();
  }

  function closeMessageReactionPickerOnEscape(event) {
    if (event.key === "Escape") {
      closeMessageReactionPicker();
    }
  }

  function openReactionSmileyPicker(message, anchor) {
    state.reactionMessageId = message.id;
    state.smileyPickerMode = "reaction";
    el.smileyPickerPanel.classList.add("reaction-mode");
    el.smileyPickerPanel.hidden = false;
    el.emojiButton.setAttribute("aria-expanded", "false");
    const rect = anchor.getBoundingClientRect();
    el.smileyPickerPanel.style.left = `${Math.min(window.innerWidth - el.smileyPickerPanel.offsetWidth - 8, Math.max(8, rect.left))}px`;
    el.smileyPickerPanel.style.top = `${Math.max(8, rect.bottom + 8)}px`;
    syncEmojiButtonState();
  }

  function reactWithSmileyCode(code) {
    const message = findMessageById(state.reactionMessageId);
    if (!message || !code) {
      return;
    }
    toggleMessageReaction(message, code);
  }

  function toggleMessageReaction(message, emoji) {
    const normalizedEmoji = String(emoji || "").trim();
    if (!normalizedEmoji || !canReactToMessage(message)) {
      return;
    }

    const conversation = conversationForMessage(message);
    if (!conversation) {
      return;
    }

    const actor = reactionActorId();
    const reactions = normalizeMessageReactions(message.reactions);
    const current = Array.isArray(reactions[actor]) ? reactions[actor] : [];
    reactions[actor] = current.includes(normalizedEmoji) ? [] : [normalizedEmoji];
    if (!reactions[actor].length) {
      delete reactions[actor];
    }

    applyMessageReaction(conversation, bestMessageTargetId(message), actor, reactions[actor] || []);
    sendMessageReaction(conversation, message, reactions[actor] || []);
  }

  function sendMessageReaction(conversation, message, reactions) {
    const targetId = bestMessageTargetId(message);
    if (!targetId) {
      return;
    }

    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN && state.xmppSession?.authenticated) {
      sendXmppStanza(createMessageReactionStanza(conversation.peer, targetId, reactions), "<message reactions=\"redacted\"/>");
      return;
    }

    if (state.relaySocket?.readyState === WebSocket.OPEN) {
      const envelope = createRelayEnvelope("message-reaction", "", "", conversation.peer);
      envelope.reactionTargetId = targetId;
      envelope.reactions = reactions;
      state.relaySocket.send(JSON.stringify(envelope));
      appendDebug("relay-out", JSON.stringify(redactEnvelopeForLog(envelope)));
    }
  }

  function createMessageReactionStanza(to, targetId, reactions) {
    const id = createMessageId("react");
    const reactionXml = reactions
      .map((emoji) => `<reaction>${escapeXml(emoji)}</reaction>`)
      .join("");
    return `<message xmlns="jabber:client" type="chat" from="${escapeXml(currentXmppFromJid())}" to="${escapeXml(to)}" id="${escapeXml(id)}"><reactions xmlns="urn:xmpp:reactions:0" id="${escapeXml(targetId)}">${reactionXml}</reactions><store xmlns="urn:xmpp:hints"/></message>`;
  }

  function applyMessageReaction(conversation, targetId, actor, reactions, persist = true) {
    const match = findMessageRecordByAnyId(targetId, { conversation });
    if (!match) {
      return;
    }

    const actorId = bareJid(actor || "").toLowerCase() || reactionActorId();
    const normalized = normalizeMessageReactions(match.message.reactions);
    const list = Array.from(new Set((Array.isArray(reactions) ? reactions : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean))).slice(0, 1);
    if (list.length) {
      normalized[actorId] = list;
    } else {
      delete normalized[actorId];
    }
    match.message.reactions = normalized;
    if (actorId !== reactionActorId() && persist) {
      showReactionBrowserNotification(match.conversation, match.message, actor, list);
    }

    if (match.conversation.id === state.activeConversationId) {
      renderActiveConversation();
    }
    renderConversations();
    if (persist) {
      persistHistoryMessage(match.conversation, match.message);
    }
  }

  function findConversationMessageByAnyId(conversation, targetId) {
    const id = String(targetId || "");
    if (!conversation || !id) {
      return null;
    }
    return conversation.messages.find((item) => messageMatchesAnyId(item, id)) || null;
  }

  function messageMatchesAnyId(message, targetId) {
    const id = String(targetId || "");
    if (!message || !id) {
      return false;
    }

    return [
      message.id,
      message.xmppId,
      message.xmppMessageId,
      message.xmppOriginId,
      message.xmppStanzaId
    ].some((value) => String(value || "") === id);
  }

  function findMessageRecordByAnyId(targetId, options = {}) {
    const id = String(targetId || "");
    if (!id) {
      return null;
    }

    const direction = options.direction || "";
    const matches = (message) => (!direction || message.direction === direction)
      && messageMatchesAnyId(message, id);
    const preferredConversation = options.conversation || null;
    if (preferredConversation) {
      const message = preferredConversation.messages.find(matches);
      if (message) {
        return { conversation: preferredConversation, message };
      }
    }

    for (const conversation of state.conversations) {
      if (conversation === preferredConversation) {
        continue;
      }
      const message = conversation.messages.find(matches);
      if (message) {
        return { conversation, message };
      }
    }
    return null;
  }

  function conversationForMessage(message) {
    return state.conversations.find((conversation) => conversation.messages.includes(message)) || null;
  }

  function findMessageById(messageId) {
    const id = String(messageId || "");
    if (!id) {
      return null;
    }
    for (const conversation of state.conversations) {
      const message = findConversationMessageByAnyId(conversation, id);
      if (message) {
        return message;
      }
    }
    return null;
  }

  function reactionActorId() {
    return currentBareJid() || bareJid(currentFromJid()).toLowerCase() || "self";
  }

  function bestMessageTargetId(message) {
    return message?.xmppOriginId || message?.xmppId || message?.xmppStanzaId || message?.xmppMessageId || message?.id || "";
  }

  function normalizeMessageReactions(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const normalized = {};
    for (const [actor, reactions] of Object.entries(value)) {
      const actorId = bareJid(actor || "").toLowerCase() || String(actor || "").trim();
      const list = Array.from(new Set((Array.isArray(reactions) ? reactions : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean))).slice(0, 12);
      if (actorId && list.length) {
        normalized[actorId] = list;
      }
    }
    return normalized;
  }

  function aggregateMessageReactions(value) {
    const counts = new Map();
    const reactions = normalizeMessageReactions(value);
    for (const list of Object.values(reactions)) {
      for (const emoji of list) {
        counts.set(emoji, (counts.get(emoji) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((left, right) => right.count - left.count || left.emoji.localeCompare(right.emoji));
  }

  function shouldShowMessageAvatar(message) {
    return Boolean(message);
  }

  function messageMetaText(message) {
    const sender = message.direction === "self"
      ? currentSenderName()
      : message.senderDisplayName || displayNameForJid(message.from);
    const status = message.edited
      ? `${message.status} (${t("message.edited", "edited")})`
      : message.status;
    return `${sender} - ${status} - ${formatTime(message.timestamp)}`;
  }

  function renderMessageMeta(meta, message) {
    meta.replaceChildren(document.createTextNode(messageMetaText(message)));
    const receipt = messageReceiptLabel(message);
    if (!receipt) {
      return;
    }

    const indicator = document.createElement("span");
    indicator.className = `message-receipt message-receipt-${receipt.state}`;
    indicator.textContent = receipt.label;
    indicator.title = receipt.title;
    indicator.setAttribute("aria-label", receipt.title);
    meta.append(" ", indicator);
  }

  function renderInlineMessageMeta(meta, message) {
    meta.replaceChildren(document.createTextNode(formatTime(message.timestamp)));
    const receipt = messageReceiptLabel(message);
    if (!receipt) {
      return;
    }

    const indicator = document.createElement("span");
    indicator.className = `message-receipt message-receipt-${receipt.state}`;
    indicator.textContent = receipt.label;
    indicator.title = receipt.title;
    indicator.setAttribute("aria-label", receipt.title);
    meta.append(" ", indicator);
  }

  function messageReceiptLabel(message) {
    if (message?.direction !== "self") {
      return null;
    }

    switch (normalizeDeliveryStatus(message.deliveryStatus, message.direction)) {
      case "displayed":
        return { state: "displayed", label: "✓✓", title: t("receipt.displayed", "Gelezen") };
      case "delivered":
        return { state: "delivered", label: "✓✓", title: t("receipt.delivered", "Afgeleverd") };
      case "sent":
      default:
        return { state: "sent", label: "✓", title: t("receipt.sent", "Verzonden") };
    }
  }

  function normalizeDeliveryStatus(value, direction = "self") {
    const status = String(value || "");
    if (["sent", "delivered", "displayed"].includes(status)) {
      return status;
    }
    return direction === "self" ? "sent" : "";
  }

  function messageAvatarSource(message) {
    if (message?.direction === "self") {
      return {
        displayName: currentSenderName(),
        peer: currentFromJid(),
        avatarDataUrl: currentAvatarDataUrl(),
        avatarColor: currentAvatarColor()
      };
    }

    if (message?.senderDisplayName || message?.senderAvatarColor || message?.senderAvatarDataUrl) {
      return {
        displayName: message.senderDisplayName || displayNameForJid(message.from),
        peer: message.from || "",
        avatarDataUrl: message.senderAvatarDataUrl || "",
        avatarColor: message.senderAvatarColor || avatarColorFor(message.from || message.senderDisplayName || "remote")
      };
    }

    return locationMarkerSource(message);
  }

  function createMessageActions(message) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = t("button.edit_message", "Edit");
    editButton.addEventListener("click", () => startMessageEdit(message.id));
    actions.append(editButton);
    return actions;
  }

  function openPhotoViewer(attachment) {
    if (!attachment?.url) {
      return;
    }

    resetPhotoViewerState();
    state.photoViewer.attachment = attachment;
    el.photoViewerTitle.textContent = attachment.name || t("photo.viewer_title", "Photo");
    el.photoViewerImage.alt = attachment.name || t("upload.photo", "Photo");
    el.photoViewerImage.src = attachment.url;
    el.photoViewerDialog.hidden = false;
    updatePhotoViewerTransform();
    el.photoViewerCloseButton.focus();
  }

  function closePhotoViewer() {
    el.photoViewerDialog.hidden = true;
    el.photoViewerImage.removeAttribute("src");
    state.photoViewer.attachment = null;
    endPhotoViewerDrag();
  }

  function closePhotoViewerOnBackdrop(event) {
    if (event.target === el.photoViewerDialog) {
      closePhotoViewer();
    }
  }

  function closePhotoViewerOnEscape(event) {
    if (event.key === "Escape" && !el.photoViewerDialog.hidden) {
      closePhotoViewer();
    }
  }

  function openVideoPreviewDialog() {
    if (!state.videoRecorder.objectUrl) {
      return;
    }

    el.videoPreviewDialogVideo.src = state.videoRecorder.objectUrl;
    el.videoPreviewDialog.hidden = false;
    document.body.classList.add("modal-open");
    el.closeVideoPreviewDialogButton.focus();
    updatePreviewPlaybackButton("video");
  }

  function openVideoRecorderDialog(options = {}) {
    const reset = options.reset !== false;
    closeAttachmentMenu();
    closeSmileyPicker();
    if (reset && !state.videoRecorder.blob && state.videoRecorder.recorder?.state !== "recording") {
      clearRecordedVoiceMessage();
      clearRecordedVideoMessage();
    }
    el.videoPreviewDialogVideo.pause();
    el.videoPreviewDialogVideo.srcObject = null;
    if (!state.videoRecorder.objectUrl) {
      el.videoPreviewDialogVideo.removeAttribute("src");
      el.videoPreviewDialogVideo.load();
    }
    el.videoPreviewDialogVideo.muted = true;
    el.videoPreviewDialogVideo.controls = false;
    el.videoPreviewDialog.hidden = false;
    document.body.classList.add("modal-open");
    updateVideoDialogActionButtons(state.videoRecorder.blob ? "preview" : "setup");
    el.startVideoRecordingButton.focus();
    if (!state.videoRecorder.blob) {
      startVideoDialogPreview();
    }
  }

  async function toggleDialogVideoRecording() {
    if (state.videoRecorder.recorder?.state === "recording") {
      stopVideoRecording();
      return;
    }

    await startVideoRecording();
  }

  function updateVideoDialogActionButtons(mode) {
    const recording = mode === "recording";
    const preview = mode === "preview";
    const recordingLabel = recording
      ? t("video.stop_recording", "Stop recording")
      : t("video.start_recording", "Start recording");
    const startIcon = el.startVideoRecordingButton.querySelector(".material-icon");
    el.startVideoRecordingButton.hidden = preview;
    el.startVideoRecordingButton.disabled = false;
    el.startVideoRecordingButton.title = recordingLabel;
    el.startVideoRecordingButton.setAttribute("aria-label", recordingLabel);
    el.startVideoRecordingButton.classList.toggle("recording", recording);
    if (startIcon) {
      startIcon.dataset.icon = recording ? "stop" : "videocam";
    }
    el.dialogCancelVideoMessageButton.hidden = false;
    el.dialogRerecordVideoMessageButton.hidden = !preview;
    el.dialogSendVideoMessageButton.hidden = !preview;
    el.dialogRerecordVideoMessageButton.disabled = !preview;
    el.dialogSendVideoMessageButton.disabled = !preview;
    renderMaterialIcons(el.videoPreviewDialog);
  }

  function closeVideoPreviewDialog() {
    if (!el.videoPreviewDialog || el.videoPreviewDialog.hidden) {
      return;
    }

    if (state.videoRecorder.recorder?.state === "recording") {
      cancelVideoMessage();
      return;
    }

    el.videoPreviewDialogVideo.pause();
    closeVideoRecorderQualityMenu();
    stopVideoPreviewStream();
    el.videoPreviewDialogVideo.srcObject = null;
    el.videoPreviewDialog.hidden = true;
    document.body.classList.remove("modal-open");
    updatePreviewPlaybackButton("video");
  }

  function closeVideoPreviewDialogOnBackdrop(event) {
    if (event.target === el.videoPreviewDialog) {
      closeVideoPreviewDialog();
    }
  }

  function closeVideoPreviewDialogOnEscape(event) {
    if (event.key === "Escape" && !el.videoPreviewDialog.hidden) {
      closeVideoPreviewDialog();
    }
  }

  function resetPhotoViewer() {
    resetPhotoViewerState();
    updatePhotoViewerTransform();
  }

  function resetPhotoViewerState() {
    state.photoViewer.scale = 1;
    state.photoViewer.offsetX = 0;
    state.photoViewer.offsetY = 0;
    state.photoViewer.dragging = false;
    state.photoViewer.pointerId = null;
  }

  function zoomPhotoViewer(factor) {
    state.photoViewer.scale = Math.max(.25, Math.min(6, state.photoViewer.scale * factor));
    updatePhotoViewerTransform();
  }

  function updatePhotoViewerTransform() {
    const viewer = state.photoViewer;
    el.photoViewerImage.style.transform =
      `translate(calc(-50% + ${viewer.offsetX}px), calc(-50% + ${viewer.offsetY}px)) scale(${viewer.scale})`;
  }

  function startPhotoViewerDrag(event) {
    if (el.photoViewerDialog.hidden || event.button > 0) {
      return;
    }

    const viewer = state.photoViewer;
    viewer.dragging = true;
    viewer.pointerId = event.pointerId;
    viewer.startX = event.clientX;
    viewer.startY = event.clientY;
    viewer.startOffsetX = viewer.offsetX;
    viewer.startOffsetY = viewer.offsetY;
    el.photoViewerCanvas.classList.add("dragging");
    el.photoViewerCanvas.setPointerCapture?.(event.pointerId);
  }

  function movePhotoViewerDrag(event) {
    const viewer = state.photoViewer;
    if (!viewer.dragging || viewer.pointerId !== event.pointerId) {
      return;
    }

    viewer.offsetX = viewer.startOffsetX + event.clientX - viewer.startX;
    viewer.offsetY = viewer.startOffsetY + event.clientY - viewer.startY;
    updatePhotoViewerTransform();
  }

  function endPhotoViewerDrag(event) {
    const viewer = state.photoViewer;
    if (event && viewer.pointerId !== event.pointerId) {
      return;
    }

    if (viewer.pointerId !== null) {
      el.photoViewerCanvas.releasePointerCapture?.(viewer.pointerId);
    }
    viewer.dragging = false;
    viewer.pointerId = null;
    el.photoViewerCanvas.classList.remove("dragging");
  }

  function handlePhotoViewerWheel(event) {
    if (el.photoViewerDialog.hidden) {
      return;
    }

    event.preventDefault();
    zoomPhotoViewer(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  }

  function downloadAttachment(attachment) {
    const url = attachment?.downloadUrl || attachment?.url;
    if (!url) {
      return;
    }

    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.name || "download";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function downloadPhotoViewerAttachment(event) {
    if (el.photoViewerDialog.hidden || !state.photoViewer.attachment) {
      return;
    }

    event.preventDefault();
    downloadAttachment(state.photoViewer.attachment);
  }

  function openMapViewer(location, source = null) {
    if (!location?.lat || !location?.lon) {
      return;
    }

    state.mapViewer.location = location;
    state.mapViewer.source = source;
    state.mapViewer.provider = normalizeMapProvider(state.location.settings.mapProvider);
    state.mapViewer.zoom = 16;
    el.mapViewerDialog.hidden = false;
    updateMapViewer();
    el.mapViewerCloseButton.focus();
  }

  function closeMapViewer() {
    el.mapViewerDialog.hidden = true;
    el.mapViewerTiles.replaceChildren();
    state.mapViewer.googleMap = null;
    state.mapViewer.googleMarker = null;
    state.mapViewer.location = null;
    state.mapViewer.source = null;
  }

  function closeMapViewerOnBackdrop(event) {
    if (event.target === el.mapViewerDialog) {
      closeMapViewer();
    }
  }

  function closeMapViewerOnEscape(event) {
    if (event.key === "Escape" && !el.mapViewerDialog.hidden) {
      closeMapViewer();
    }
  }

  function setMapViewerProvider(provider) {
    state.mapViewer.provider = normalizeMapProvider(provider);
    updateMapViewer();
  }

  function zoomMapViewer(direction) {
    state.mapViewer.zoom = Math.max(3, Math.min(20, state.mapViewer.zoom + direction));
    updateMapViewer();
  }

  async function updateMapViewer(location = state.mapViewer.location, source = state.mapViewer.source) {
    if (!location || el.mapViewerDialog.hidden) {
      return;
    }

    state.mapViewer.location = location;
    if (source) {
      state.mapViewer.source = source;
    }
    const provider = normalizeMapProvider(state.mapViewer.provider);
    el.mapViewerTitle.textContent = t("location.card_title", "Shared location");
    el.mapViewerMeta.textContent = locationCardMetaText(location);
    el.mapViewerExternalLink.href = locationMapExternalHref(provider, location);
    el.mapViewerExternalLink.textContent = t("location.open_map", "Open map");
    el.mapViewerOpenStreetMapButton.classList.toggle("selected", provider === "openstreetmap");
    el.mapViewerGoogleButton.classList.toggle("selected", provider === "google");

    if (provider === "google" && state.mapViewer.googleApiKey) {
      await renderGoogleMapViewer(location, state.mapViewer.source || locationMarkerSource({ direction: "self" }));
      return;
    }

    renderEmbeddedMapViewer(provider, location);
  }

  async function loadGoogleMapsApi() {
    if (globalThis.google?.maps?.importLibrary) {
      return globalThis.google.maps;
    }

    if (!state.mapViewer.googleApiKey) {
      throw new Error("Google Maps API key missing.");
    }

    if (!googleMapsApiPromise) {
      googleMapsApiPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector("script[data-teletyptel-google-maps]");
        if (existing) {
          existing.addEventListener("load", () => resolve(globalThis.google.maps), { once: true });
          existing.addEventListener("error", reject, { once: true });
          return;
        }

        const callbackName = `teletyptelGoogleMapsReady${Date.now()}`;
        globalThis[callbackName] = () => {
          delete globalThis[callbackName];
          resolve(globalThis.google.maps);
        };
        const script = document.createElement("script");
        script.dataset.teletyptelGoogleMaps = "true";
        script.async = true;
        script.defer = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(state.mapViewer.googleApiKey)}&v=weekly&libraries=marker&callback=${callbackName}`;
        script.addEventListener("error", () => {
          delete globalThis[callbackName];
          reject(new Error("Google Maps API failed to load."));
        }, { once: true });
        document.head.appendChild(script);
      });
    }

    return googleMapsApiPromise;
  }

  async function renderGoogleMapViewer(location, source) {
    try {
      el.mapViewerDialog.querySelector(".map-viewer-canvas")?.classList.add("google-active");
      el.mapViewerDialog.querySelector(".map-viewer-canvas")?.classList.remove("embed-active");
      const maps = await loadGoogleMapsApi();
      const { Map } = await maps.importLibrary("maps");
      const { AdvancedMarkerElement } = await maps.importLibrary("marker");
      const position = {
        lat: Number(location.lat),
        lng: Number(location.lon)
      };
      if (!state.mapViewer.googleMap) {
        el.mapViewerTiles.replaceChildren();
        state.mapViewer.googleMap = new Map(el.mapViewerTiles, {
          center: position,
          zoom: state.mapViewer.zoom,
          mapId: state.mapViewer.googleMapId,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        });
      } else {
        state.mapViewer.googleMap.setCenter(position);
        state.mapViewer.googleMap.setZoom(state.mapViewer.zoom);
      }

      const markerContent = createLocationMarker(source);
      markerContent.classList.add("map-viewer-google-marker");
      markerContent.classList.remove("map-viewer-position-dot");
      if (!state.mapViewer.googleMarker) {
        state.mapViewer.googleMarker = new AdvancedMarkerElement({
          map: state.mapViewer.googleMap,
          position,
          content: markerContent,
          title: source?.displayName || source?.name || t("location.card_title", "Shared location")
        });
      } else {
        state.mapViewer.googleMarker.position = position;
        state.mapViewer.googleMarker.content = markerContent;
      }
    } catch (error) {
      appendDebug("maps-error", error.message);
      renderEmbeddedMapViewer("openstreetmap", location);
    }
  }

  function renderEmbeddedMapViewer(provider, location) {
    state.mapViewer.googleMap = null;
    state.mapViewer.googleMarker = null;
    el.mapViewerDialog.querySelector(".map-viewer-canvas")?.classList.remove("google-active");
    el.mapViewerDialog.querySelector(".map-viewer-canvas")?.classList.add("embed-active");
    el.mapViewerTiles.replaceChildren();
    const frame = document.createElement("iframe");
    frame.title = t("location.map_title", "Location map");
    frame.loading = "lazy";
    frame.referrerPolicy = "no-referrer-when-downgrade";
    frame.allowFullscreen = true;
    frame.src = locationMapEmbedHref(provider, location, state.mapViewer.zoom, { includeProviderMarker: true });
    el.mapViewerTiles.appendChild(frame);
  }

  function createAttachmentElement(attachment) {
    const kind = attachment.kind || classifyAttachment(attachment);
    const wrapper = document.createElement("div");
    wrapper.className = `attachment-card ${kind}`;

    const icon = document.createElement("span");
    icon.className = "attachment-icon";
    icon.textContent = attachmentKindLabel(kind);

    const text = document.createElement("span");
    text.className = "attachment-text";
    const titleText = attachmentTitleText(attachment, kind);
    if (titleText) {
      const name = document.createElement("strong");
      name.textContent = titleText;
      text.appendChild(name);
    }
    const meta = document.createElement("small");
    meta.textContent = attachmentMetaText(attachment, kind);
    if (meta.textContent) {
      text.appendChild(meta);
    }
    const downloadButton = createAttachmentDownloadButton(attachment);

    if (kind === "photo") {
      const preview = document.createElement("img");
      preview.className = "attachment-preview";
      preview.src = attachment.url;
      preview.alt = attachment.name || t("upload.photo", "Photo");
      preview.loading = "lazy";
      wrapper.append(preview, text, downloadButton);
      wrapper.addEventListener("click", (event) => {
        if (event.target.closest(".attachment-download-button")) {
          return;
        }
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
          return;
        }

        event.preventDefault();
        openPhotoViewer(attachment);
      });
    } else if (kind === "audio") {
      const player = document.createElement("audio");
      player.className = "attachment-audio-player";
      player.controls = true;
      player.preload = "metadata";
      player.src = attachment.url;
      player.addEventListener("click", (event) => event.stopPropagation());
      wrapper.append(player, downloadButton);
    } else if (kind === "video") {
      const stage = document.createElement("div");
      stage.className = "attachment-video-stage video-preview-loading";
      const placeholder = document.createElement("span");
      placeholder.className = "attachment-video-placeholder";
      placeholder.appendChild(createMaterialIcon("videocam"));
      const player = document.createElement("video");
      player.className = "attachment-video-player";
      player.controls = true;
      player.preload = "auto";
      player.playsInline = true;
      player.src = attachment.url;
      player.addEventListener("click", (event) => event.stopPropagation());
      setupAttachmentVideoPreview(player, stage);
      stage.append(player, placeholder);
      wrapper.append(stage, downloadButton);
    } else {
      wrapper.append(icon, text, downloadButton);
    }
    renderMaterialIcons(wrapper);

    return wrapper;
  }

  function setupAttachmentVideoPreview(player, stage) {
    const markReady = () => {
      stage.classList.remove("video-preview-loading");
      stage.classList.add("video-preview-ready");
    };
    const seekPreviewFrame = () => {
      if (player.dataset.previewSeeked === "true") {
        return;
      }
      player.dataset.previewSeeked = "true";
      const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 1;
      const previewTime = Math.min(0.1, Math.max(0, duration - 0.05));
      try {
        player.currentTime = previewTime;
      } catch {
        markReady();
      }
    };

    player.addEventListener("loadedmetadata", seekPreviewFrame, { once: true });
    player.addEventListener("loadeddata", markReady, { once: true });
    player.addEventListener("canplay", markReady, { once: true });
    player.addEventListener("seeked", markReady, { once: true });
    player.addEventListener("error", markReady, { once: true });
  }

  function attachmentMetaText(attachment, kind) {
    const parts = kind === "audio" || kind === "video" || kind === "photo"
      ? [formatBytes(attachment.size), attachment.type]
      : [attachmentKindText(kind), formatBytes(attachment.size), attachment.type];
    return parts
      .filter(Boolean)
      .join(" - ");
  }

  function attachmentTitleText(attachment, kind) {
    if (kind === "video") {
      return "";
    }
    if (kind === "audio") {
      return "";
    }
    if (kind === "photo") {
      return "";
    }
    return attachment.name || "download";
  }

  function createAttachmentDownloadButton(attachment) {
    const kind = attachment.kind || classifyAttachment(attachment);
    const metaText = attachmentMetaText(attachment, kind);
    const label = metaText
      ? `${t("button.download", "Download")} - ${metaText}`
      : t("button.download", "Download");
    const button = document.createElement("button");
    button.className = "icon-button attachment-download-button";
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    const icon = document.createElement("span");
    icon.className = "material-icon";
    icon.dataset.icon = "download";
    icon.setAttribute("aria-hidden", "true");
    button.appendChild(icon);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      downloadAttachment(attachment);
    });
    return button;
  }

  function appendLinkPreviewIfNeeded(body, message) {
    if (message.retracted || message.attachment || message.location || !message.text) {
      return;
    }

    const url = firstUrlFromText(message.text);
    if (!url) {
      return;
    }

    const existing = linkPreviewCache.get(url);
    const card = createLinkPreviewElement(url, existing?.preview || null, existing?.error || "");
    if (card) {
      body.appendChild(card);
    }
    if (existing) {
      return;
    }

    linkPreviewCache.set(url, { loading: true });
    fetchLinkPreview(url).then((preview) => {
      linkPreviewCache.set(url, { preview });
      updateRenderedLinkPreview(url, preview);
    }).catch((error) => {
      linkPreviewCache.set(url, { error: error.message || "preview_failed" });
      updateRenderedLinkPreview(url, null, error.message || "preview_failed");
      appendDebug("link-preview", error.message || String(error));
    });
  }

  function firstUrlFromText(text) {
    const match = String(text || "").match(/\bhttps?:\/\/[^\s<>"']+/i);
    if (!match) {
      return "";
    }
    return trimTrailingUrlPunctuation(match[0]);
  }

  async function fetchLinkPreview(url) {
    const target = `${linkPreviewApiPath}?url=${encodeURIComponent(url)}`;
    const payload = await fetchJson(target);
    if (!payload.ok || !payload.preview) {
      throw new Error(payload.error || "preview_failed");
    }
    return payload.preview;
  }

  function updateRenderedLinkPreview(url, preview, error = "") {
    document.querySelectorAll(".link-preview-card[data-preview-url]").forEach((card) => {
      if (card.dataset.previewUrl !== url) {
        return;
      }
      const replacement = createLinkPreviewElement(url, preview, error);
      if (replacement) {
        card.replaceWith(replacement);
      } else {
        card.remove();
      }
    });
  }

  function createLinkPreviewElement(url, preview = null, error = "") {
    if (error || (!preview && error)) {
      return null;
    }

    const wrapper = document.createElement("a");
    wrapper.className = "link-preview-card";
    wrapper.href = preview?.url || url;
    wrapper.target = "_blank";
    wrapper.rel = "noopener noreferrer";
    wrapper.dataset.previewUrl = url;
    wrapper.classList.toggle("no-image", !preview?.image);

    if (!preview && !error) {
      const loading = document.createElement("span");
      loading.className = "link-preview-loading";
      loading.textContent = t("link.loading", "Loading link preview...");
      wrapper.appendChild(loading);
      return wrapper;
    }

    if (!preview?.title && !preview?.description && !preview?.image) {
      return null;
    }

    if (preview.image) {
      const image = document.createElement("img");
      image.className = "link-preview-image";
      image.src = preview.image;
      image.alt = "";
      image.loading = "lazy";
      wrapper.appendChild(image);
    }

    const text = document.createElement("span");
    text.className = "link-preview-text";
    const titleText = String(preview.title || "").trim();
    const descriptionText = String(preview.description || "").trim();
    if (titleText) {
      const title = document.createElement("strong");
      title.textContent = titleText;
      text.appendChild(title);
    }
    if (descriptionText && descriptionText !== titleText) {
      const description = document.createElement("small");
      description.textContent = descriptionText;
      text.appendChild(description);
    }
    const site = document.createElement("span");
    site.className = "link-preview-site";
    site.textContent = preview.siteName || new URL(preview.url || url).hostname;
    text.appendChild(site);
    wrapper.appendChild(text);
    return wrapper;
  }

  function createLocationElement(location, message = null) {
    const wrapper = document.createElement("div");
    wrapper.className = "location-card";
    wrapper.dataset.mapUpdatedAt = String(Date.now());

    const title = document.createElement("strong");
    title.className = "location-card-title";
    title.textContent = t("location.card_title", "Shared location");

    const meta = document.createElement("span");
    meta.className = "location-card-meta";
    meta.textContent = locationCardMetaText(location);

    const provider = normalizeMapProvider(state.location.settings.mapProvider);
    wrapper.dataset.mapProvider = provider;
    wrapper.dataset.mapLat = String(location.lat);
    wrapper.dataset.mapLon = String(location.lon);
    const map = document.createElement("iframe");
    map.className = "location-card-map";
    map.title = t("location.map_title", "Location map");
    map.loading = "lazy";
    map.referrerPolicy = "no-referrer-when-downgrade";
    map.allowFullscreen = true;
    map.tabIndex = 0;
    map.src = locationMapEmbedHref(provider, location);

    const mapShell = document.createElement("div");
    mapShell.className = "location-map-preview";
    const marker = createLocationMarker(locationMarkerSource(message));
    mapShell.append(map, marker);

    const links = document.createElement("div");
    links.className = "location-map-links";
    links.appendChild(createLocationMapLink(provider, location, mapProviderLabel(provider)));

    wrapper.append(title, meta, mapShell, links);
    wrapper.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) {
        return;
      }
      openMapViewer(location, locationMarkerSource(message));
    });
    return wrapper;
  }

  function updateLocationElement(card, location, message = null) {
    const title = card.querySelector(".location-card-title");
    if (title) {
      title.textContent = t("location.card_title", "Shared location");
    }

    const meta = card.querySelector(".location-card-meta");
    if (meta) {
      meta.textContent = locationCardMetaText(location);
    }

    const provider = normalizeMapProvider(state.location.settings.mapProvider);
    const links = card.querySelector(".location-map-links");
    if (links) {
      links.replaceChildren(createLocationMapLink(provider, location, mapProviderLabel(provider)));
    }

    const map = card.querySelector(".location-card-map");
    if (!map) {
      return;
    }

    const marker = card.querySelector(".location-position-marker");
    if (marker) {
      renderAvatarInto(marker, locationMarkerSource(message));
    }

    const previousProvider = card.dataset.mapProvider || provider;
    const previousLat = Number(card.dataset.mapLat);
    const previousLon = Number(card.dataset.mapLon);
    const previousUpdateAt = Number(card.dataset.mapUpdatedAt || "0");
    const movedMeters = Number.isFinite(previousLat) && Number.isFinite(previousLon)
      ? distanceMeters(previousLat, previousLon, location.lat, location.lon)
      : Infinity;
    const shouldRefreshMap = previousProvider !== provider
      || movedMeters >= 75
      || Date.now() - previousUpdateAt >= 60000;

    card.dataset.mapProvider = provider;
    card.dataset.mapLat = String(location.lat);
    card.dataset.mapLon = String(location.lon);

    if (shouldRefreshMap) {
      card.dataset.mapUpdatedAt = String(Date.now());
      map.src = locationMapEmbedHref(provider, location);
    }

    updateMapViewer(location, locationMarkerSource(message));
  }

  function createLocationMarker(source) {
    const marker = document.createElement("div");
    marker.className = "location-position-marker";
    marker.setAttribute("aria-hidden", "true");
    renderAvatarInto(marker, source);
    return marker;
  }

  function locationMarkerSource(message) {
    if (message?.direction === "self") {
      return {
        displayName: currentSenderName(),
        peer: currentFromJid(),
        avatarDataUrl: currentAvatarDataUrl(),
        avatarColor: currentAvatarColor()
      };
    }

    const conversation = activeConversation();
    if (message?.from) {
      const peer = bareJid(message.from);
      const known = state.conversations.find((item) => addressMatches(item.peer, peer));
      if (known) {
        return known;
      }
      return {
        displayName: peer || t("message.remote", "Remote"),
        peer,
        avatarColor: avatarColorFor(peer)
      };
    }

    return conversation || {
      displayName: t("message.remote", "Remote"),
      avatarColor: "#2563eb"
    };
  }

  function locationCardMetaText(location) {
    return [
      `${formatCoordinate(location.lat)}, ${formatCoordinate(location.lon)}`,
      location.accuracy === null ? null : `${location.accuracy} m`,
      formatLocationTimestamp(location.timestamp)
    ].filter(Boolean).join(" - ");
  }

  function distanceMeters(latA, lonA, latB, lonB) {
    const earthRadiusMeters = 6371000;
    const toRadians = (value) => Number(value) * Math.PI / 180;
    const phiA = toRadians(latA);
    const phiB = toRadians(latB);
    const deltaPhi = toRadians(Number(latB) - Number(latA));
    const deltaLambda = toRadians(Number(lonB) - Number(lonA));
    const a = Math.sin(deltaPhi / 2) ** 2
      + Math.cos(phiA) * Math.cos(phiB) * Math.sin(deltaLambda / 2) ** 2;
    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function preferredMapProviderLabel() {
    return mapProviderLabel(state.location.settings.mapProvider);
  }

  function createLocationMapLink(provider, location, text) {
    const link = document.createElement("a");
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = text;
    link.href = locationMapExternalHref(provider, location);
    return link;
  }

  function locationMapExternalHref(provider, location) {
    const lat = encodeURIComponent(location.lat);
    const lon = encodeURIComponent(location.lon);
    return normalizeMapProvider(provider) === "google"
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
      : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
  }

  function locationMapEmbedHref(provider, location, zoom = 16, options = {}) {
    const latNumber = Number(location.lat);
    const lonNumber = Number(location.lon);
    const lat = encodeURIComponent(location.lat);
    const lon = encodeURIComponent(location.lon);
    const safeZoom = Math.max(3, Math.min(20, Number(zoom) || 16));
    const includeProviderMarker = options.includeProviderMarker === true;
    if (normalizeMapProvider(provider) === "google") {
      const query = includeProviderMarker ? `&q=${lat},${lon}` : "";
      return `https://maps.google.com/maps?ll=${lat},${lon}&z=${safeZoom}&t=m${query}&output=embed`;
    }

    const delta = Math.max(0.00035, 180 / (2 ** safeZoom));
    const left = encodeURIComponent((lonNumber - delta).toFixed(6));
    const right = encodeURIComponent((lonNumber + delta).toFixed(6));
    const bottom = encodeURIComponent((latNumber - delta).toFixed(6));
    const top = encodeURIComponent((latNumber + delta).toFixed(6));
    const marker = includeProviderMarker ? `&marker=${lat}%2C${lon}` : "";
    return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik${marker}`;
  }

  function mapProviderLabel(provider) {
    return normalizeMapProvider(provider) === "google"
      ? t("map.google_maps", "Google Maps")
      : t("map.openstreetmap", "OpenStreetMap");
  }

  function classifyAttachment(attachment) {
    const type = String(attachment.type || "").toLowerCase();
    const name = String(attachment.name || "").toLowerCase();
    const extension = name.includes(".") ? name.split(".").pop() : "";

    if (type.startsWith("image/")) {
      return "photo";
    }

    if (
      type.startsWith("video/") ||
      (name.startsWith("video-message-") && ["webm", "mp4", "m4v", "mov", "ogv"].includes(extension))
    ) {
      return "video";
    }

    if (
      type.startsWith("audio/") ||
      (!type.startsWith("video/") && ["webm", "ogg", "oga", "opus", "mp3", "wav", "m4a", "aac", "flac"].includes(extension))
    ) {
      return "audio";
    }

    if (
      ["mp4", "m4v", "mov", "ogv", "avi", "mkv"].includes(extension)
    ) {
      return "video";
    }

    if (
      type.startsWith("text/") ||
      type.includes("pdf") ||
      type.includes("word") ||
      type.includes("spreadsheet") ||
      type.includes("presentation") ||
      type.includes("opendocument") ||
      ["pdf", "txt", "md", "rtf", "csv", "doc", "docx", "odt", "xls", "xlsx", "ods", "ppt", "pptx", "odp"].includes(extension)
    ) {
      return "document";
    }

    if (
      type === "application/octet-stream" ||
      type.includes("zip") ||
      type.includes("compressed") ||
      ["bin", "exe", "dll", "msi", "zip", "7z", "rar", "tar", "gz", "tgz", "deb", "rpm", "apk", "jar"].includes(extension)
    ) {
      return "binary";
    }

    return "file";
  }

  function attachmentKindLabel(kind) {
    return kind === "photo"
      ? "PHOTO"
      : kind === "audio"
        ? "AUDIO"
        : kind === "video"
          ? "VIDEO"
          : kind === "document"
            ? "DOC"
            : kind === "binary"
              ? "BIN"
              : "FILE";
  }

  function attachmentKindText(kind) {
    if (kind === "photo") {
      return t("upload.photo", "Photo");
    }

    if (kind === "audio") {
      return t("upload.voice_message", "Voice message");
    }

    if (kind === "video") {
      return t("upload.video_message", "Video message");
    }

    if (kind === "document") {
      return t("upload.document", "Document");
    }

    if (kind === "binary") {
      return t("upload.binary", "Binary file");
    }

    return t("upload.file", "File");
  }

  async function uploadSelectedFiles() {
    const files = Array.from(el.fileInput.files ?? []);
    el.fileInput.value = "";
    el.fileInput.accept = "";
    el.fileInput.multiple = true;
    el.fileInput.removeAttribute("capture");
    await uploadFiles(files);
  }

  async function uploadFiles(files) {
    if (!hasActiveConversation()) {
      setConnectionStatus(t("status.select_contact_first", "Select a contact first"), "warn");
      return;
    }

    if (!hasActiveMessageTransport()) {
      showNotConnectedStatus();
      return;
    }

    const uploadable = files.filter((file) => file instanceof File);
    if (uploadable.length === 0) {
      return;
    }

    el.uploadFileButton.disabled = true;
    setConnectionStatus(t("button.uploading", "Uploading..."), "warn");
    try {
      for (const file of uploadable) {
        await uploadOneFile(file);
      }
    } finally {
      el.uploadFileButton.disabled = false;
    }
  }

  async function uploadOneFile(file, options = {}) {
    appendDebug("upload", `${file.name} (${file.size} bytes)`);
    try {
      const payload = file.size > uploadChunkSize
        ? await uploadFileInChunks(file)
        : await uploadFileDirect(file);
      sendFileMessage(payload.file);
    } catch (error) {
      appendDebug("upload-error", error.message);
      addMessage("self", `${t("upload.failed", "Upload failed")}: ${file.name}`, "error");
      if (options.throwOnError) {
        throw error;
      }
    }
  }

  async function uploadFileDirect(file) {
    const data = new FormData();
    data.append("file", file);
    const response = await fetch(uploadApiPath, {
      method: "POST",
      body: data
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.file) {
      throw new Error(uploadErrorText(payload, response.status));
    }

    return payload;
  }

  async function uploadFileInChunks(file) {
    const uploadId = createUploadId();
    const totalChunks = Math.ceil(file.size / uploadChunkSize);
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * uploadChunkSize;
      const chunk = file.slice(start, Math.min(start + uploadChunkSize, file.size), file.type || "application/octet-stream");
      const data = new FormData();
      data.append("file", chunk, `${file.name}.part${chunkIndex}`);
      data.append("uploadId", uploadId);
      data.append("chunkIndex", String(chunkIndex));
      data.append("totalChunks", String(totalChunks));
      data.append("originalName", file.name);
      data.append("mimeType", file.type || "");
      data.append("totalSize", String(file.size));
      const response = await fetch(uploadApiPath, {
        method: "POST",
        body: data
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(uploadErrorText(payload, response.status));
      }

      const sent = chunkIndex + 1;
      setConnectionStatus(`${t("upload.uploading", "Uploading...")} ${sent}/${totalChunks}`, "warn");
      if (payload.file) {
        return payload;
      }
    }

    throw new Error("chunked upload did not return a file");
  }

  function createUploadId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  function uploadErrorText(payload, status) {
    const error = String(payload?.error || "");
    const maxBytes = Number(payload?.maxBytes || 0);
    const limitText = maxBytes > 0 ? ` (${formatBytes(maxBytes)})` : "";
    if (["file_too_large", "post_too_large", "file_exceeds_server_limit", "file_exceeds_form_limit"].includes(error)) {
      return `${t("upload.too_large", "File is too large")}${limitText}`;
    }

    if (error === "upload_partial") {
      return t("upload.partial", "Upload was interrupted");
    }

    return error || `upload returned ${status}`;
  }

  function handleDragEnter(event) {
    if (!eventHasFiles(event)) {
      return;
    }

    event.preventDefault();
    showDropOverlay(true);
  }

  function handleDragOver(event) {
    if (!eventHasFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    showDropOverlay(true);
  }

  function handleDragLeave(event) {
    if (event.relatedTarget && document.body.contains(event.relatedTarget)) {
      return;
    }

    showDropOverlay(false);
  }

  function handleDrop(event) {
    if (!eventHasFiles(event)) {
      return;
    }

    event.preventDefault();
    showDropOverlay(false);
    activateTab("chat");
    uploadFiles(Array.from(event.dataTransfer.files ?? []));
  }

  function eventHasFiles(event) {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  function showDropOverlay(show) {
    el.dropOverlay.hidden = !show;
    el.dropOverlay.classList.toggle("visible", show);
  }

  function sendFileMessage(file) {
    if (!hasActiveConversation()) {
      return;
    }

    const kind = classifyAttachment(file);
    const text = kind === "audio"
      ? t("upload.voice_message", "Voice message")
      : kind === "video"
        ? t("upload.video_message", "Video message")
        : `${t("upload.shared_file", "Shared file")}: ${file.name}`;
    const messageId = createMessageId(kind === "audio" ? "voice" : kind === "video" ? "video" : "file");
    const attachment = {
      id: file.id || "",
      name: file.name,
      url: file.url,
      downloadUrl: file.downloadUrl || file.url,
      size: file.size,
      type: file.type,
      kind,
      storage: file.storage || ""
    };

    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN) {
      const xml = createMessageStanza(`${text}\n${new URL(file.url, location.href).href}`, messageId);
      sendXmppStanza(xml);
      addMessage("self", text, "RFC 7395", null, attachment, null, null, messageId);
      return;
    }

    if (!state.relaySocket || state.relaySocket.readyState !== WebSocket.OPEN) {
      showNotConnectedStatus();
      return;
    }

    const envelope = createRelayEnvelope("message", text, "");
    envelope.messageId = messageId;
    envelope.attachment = attachment;
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("upload-out", JSON.stringify(redactEnvelopeForLog(envelope)));
    addMessage("self", text, "sent", null, attachment, null, null, messageId);
  }

  function renderRichText(container, text, stylingDisabled = false) {
    text = String(text ?? "");
    const hasUrl = messageUrlPattern().test(text);
    const styledRuns = stylingDisabled || hasUrl ? null : parseMessageStyling(text);
    const mode = `${el.smileyToggle.checked ? "smiley" : "plain"}:${styledRuns ? "styled" : "unstyled"}`;
    if (container.dataset.richText === text && container.dataset.richTextMode === mode) {
      return;
    }

    container.dataset.richText = text;
    container.dataset.richTextMode = mode;
    if (styledRuns) {
      renderStyledRichText(container, styledRuns);
      return;
    }

    if (hasUrl) {
      renderTextWithLinks(container, text);
      return;
    }

    if (!el.smileyToggle.checked) {
      container.textContent = text;
      return;
    }

    const existing = Array.from(container.childNodes);
    const nextNodes = [];
    let index = 0;
    for (const token of tokenizeSmilies(text)) {
      if (token.kind === "text") {
        nextNodes.push(reuseTextNode(existing[index], token.text));
      } else {
        nextNodes.push(reuseSmileyNode(existing[index], token));
      }

      index++;
    }

    patchChildren(container, nextNodes);
  }

  function renderStyledRichText(container, runs) {
    const nextNodes = [];
    for (const run of runs) {
      const parent = run.kind === "plain" ? null : document.createElement(styleElementName(run.kind));
      if (parent) {
        parent.className = `message-style-${run.kind}`;
        appendTextOrSmilies(parent, run.text);
        nextNodes.push(parent);
      } else {
        appendTextOrSmilies({ appendChild: (node) => nextNodes.push(node) }, run.text);
      }
    }

    patchChildren(container, nextNodes);
  }

  function appendTextOrSmilies(parent, text) {
    if (!el.smileyToggle.checked) {
      parent.appendChild(document.createTextNode(text));
      return;
    }

    for (const token of tokenizeSmilies(text)) {
      parent.appendChild(token.kind === "text" ? document.createTextNode(token.text) : createSmileyImage(token));
    }
  }

  function renderTextWithLinks(container, text) {
    const nodes = [];
    let position = 0;
    for (const match of text.matchAll(messageUrlPattern())) {
      const url = trimTrailingUrlPunctuation(match[0]);
      const start = match.index ?? 0;
      const end = start + url.length;
      if (start > position) {
        appendPlainMessageNodes(nodes, text.slice(position, start));
      }
      nodes.push(createMessageLink(url));
      position = end;
    }
    if (position < text.length) {
      appendPlainMessageNodes(nodes, text.slice(position));
    }
    patchChildren(container, nodes);
  }

  function appendPlainMessageNodes(nodes, text) {
    if (!text) {
      return;
    }
    if (!el.smileyToggle.checked) {
      nodes.push(document.createTextNode(text));
      return;
    }
    for (const token of tokenizeSmilies(text)) {
      nodes.push(token.kind === "text" ? document.createTextNode(token.text) : createSmileyImage(token));
    }
  }

  function createMessageLink(url) {
    const link = document.createElement("a");
    link.className = "message-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = url;
    return link;
  }

  function messageUrlPattern() {
    return /\bhttps?:\/\/[^\s<>"']+/gi;
  }

  function trimTrailingUrlPunctuation(url) {
    return String(url || "").replace(/[),.;!?]+$/u, "");
  }

  function styleElementName(kind) {
    if (kind === "strong") {
      return "strong";
    }
    if (kind === "emphasis") {
      return "em";
    }
    if (kind === "strikethrough") {
      return "s";
    }
    return "code";
  }

  function parseMessageStyling(text) {
    const runs = [];
    let position = 0;
    let hasStyle = false;
    while (position < text.length) {
      const marker = text[position];
      const closing = isMessageStyleMarker(marker) && isValidStyleOpening(text, position)
        ? findStyleClosing(text, position, marker)
        : -1;
      if (!isMessageStyleMarker(marker)
        || !isValidStyleOpening(text, position)
        || closing < 0) {
        const next = findNextStyleCandidate(text, position + 1);
        runs.push({ kind: "plain", text: text.slice(position, next) });
        position = next;
        continue;
      }

      runs.push({ kind: styleKindForMarker(marker), text: text.slice(position + 1, closing) });
      hasStyle = true;
      position = closing + 1;
    }

    return hasStyle ? mergeAdjacentPlainRuns(runs) : null;
  }

  function mergeAdjacentPlainRuns(runs) {
    const merged = [];
    for (const run of runs) {
      if (run.kind === "plain" && merged.at(-1)?.kind === "plain") {
        merged[merged.length - 1].text += run.text;
      } else if (run.text) {
        merged.push(run);
      }
    }

    return merged;
  }

  function findNextStyleCandidate(text, start) {
    for (let index = start; index < text.length; index++) {
      if (isMessageStyleMarker(text[index])) {
        return index;
      }
    }

    return text.length;
  }

  function findStyleClosing(text, opening, marker) {
    for (let index = opening + 1; index < text.length; index++) {
      if (text[index] === "\n" || text[index] === "\r") {
        return -1;
      }

      if (text[index] !== marker) {
        continue;
      }

      if (index === opening + 1 || /\s/.test(text[index - 1])) {
        continue;
      }

      return index;
    }

    return -1;
  }

  function isValidStyleOpening(text, position) {
    return position + 1 < text.length
      && !/\s/.test(text[position + 1])
      && (position === 0 || /\s/.test(text[position - 1]) || isMessageStyleMarker(text[position - 1]));
  }

  function isMessageStyleMarker(value) {
    return value === "*" || value === "_" || value === "~" || value === "`";
  }

  function styleKindForMarker(marker) {
    if (marker === "*") {
      return "strong";
    }
    if (marker === "_") {
      return "emphasis";
    }
    if (marker === "~") {
      return "strikethrough";
    }
    return "preformatted";
  }

  function patchChildren(container, nextNodes) {
    for (let index = 0; index < nextNodes.length; index++) {
      const nextNode = nextNodes[index];
      const currentNode = container.childNodes[index] ?? null;
      if (currentNode === nextNode) {
        continue;
      }

      container.insertBefore(nextNode, currentNode);
    }

    while (container.childNodes.length > nextNodes.length) {
      container.removeChild(container.lastChild);
    }
  }

  function reuseTextNode(node, text) {
    if (node?.nodeType === Node.TEXT_NODE) {
      if (node.textContent !== text) {
        node.textContent = text;
      }

      return node;
    }

    return document.createTextNode(text);
  }

  function reuseSmileyNode(node, token) {
    if (node instanceof HTMLElement
      && node.dataset.smileyCode === token.text
      && node.dataset.smileyName === token.smiley.name) {
      return node;
    }

    return createSmileyImage(token);
  }

  function createSmileyImage(token) {
    const fallback = document.createElement("span");
    fallback.className = "smiley";
    fallback.dataset.smileyCode = token.text;
    fallback.dataset.smileyName = token.smiley.name;
    fallback.title = `${token.smiley.name} (${token.smiley.fileName})`;
    fallback.textContent = token.text;

    const image = document.createElement("img");
    image.className = "smiley-image";
    image.dataset.smileyCode = token.text;
    image.dataset.smileyName = token.smiley.name;
    image.src = smileyBasePath + encodeURIComponent(token.smiley.fileName);
    image.alt = token.text;
    image.title = `${token.smiley.name} (${token.smiley.fileName})`;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      const fallbackFile = token.smiley.fileName.replace(/\.[^.]+$/, ".svg");
      if (fallbackFile !== token.smiley.fileName && !image.dataset.triedSvg) {
        image.dataset.triedSvg = "true";
        image.src = smileyBasePath + encodeURIComponent(fallbackFile);
        return;
      }

      image.replaceWith(fallback);
    });
    return image;
  }

  function tokenizeSmilies(text) {
    const tokens = [];
    let textStart = 0;
    let index = 0;

    while (index < text.length) {
      const match = smileIndex.find((item) => text.startsWith(item.code, index));
      if (!match) {
        index++;
        continue;
      }

      if (index > textStart) {
        tokens.push({ kind: "text", text: text.slice(textStart, index) });
      }

      tokens.push({ kind: "smiley", text: match.code, smiley: match.smiley });
      index += match.code.length;
      textStart = index;
    }

    if (textStart < text.length) {
      tokens.push({ kind: "text", text: text.slice(textStart) });
    }

    return tokens;
  }

  function createDeltaActions(oldText, newText) {
    if (oldText === newText) {
      return "";
    }

    const oldChars = Array.from(oldText);
    const newChars = Array.from(newText);
    let prefix = 0;
    while (prefix < oldChars.length && prefix < newChars.length && oldChars[prefix] === newChars[prefix]) {
      prefix++;
    }

    let suffix = 0;
    while (
      oldChars.length - 1 - suffix >= prefix &&
      newChars.length - 1 - suffix >= prefix &&
      oldChars[oldChars.length - 1 - suffix] === newChars[newChars.length - 1 - suffix]
    ) {
      suffix++;
    }

    const removed = oldChars.length - prefix - suffix;
    const inserted = newChars.length - prefix - suffix;
    let xml = "";

    if (removed > 0) {
      xml += `<e p="${prefix + removed}" n="${removed}"/>`;
    }

    if (inserted > 0) {
      xml += `<t p="${prefix}">${escapeXml(newChars.slice(prefix, prefix + inserted).join(""))}</t>`;
    }

    return xml;
  }

  function createMessageStanza(text, id = createMessageId("msg"), replaceId = null, stylingDisabled = false, to = el.peerInput.value, extraXml = "", type = "chat") {
    const replace = replaceId
      ? `<replace xmlns="urn:xmpp:message-correct:0" id="${escapeXml(replaceId)}"/>`
      : "";
    const unstyled = stylingDisabled ? `<unstyled xmlns="urn:xmpp:styling:0"/>` : "";
    const originId = `<origin-id xmlns="urn:xmpp:sid:0" id="${escapeXml(id)}"/>`;
    const messageType = isXmppGroupchatType(type) ? "groupchat" : "chat";
    const receiptRequest = replaceId || messageType === "groupchat" ? "" : `<request xmlns="urn:xmpp:receipts"/>`;
    const markable = replaceId || messageType === "groupchat" ? "" : `<markable xmlns="urn:xmpp:chat-markers:0"/>`;
    return `<message xmlns="jabber:client" type="${messageType}" from="${escapeXml(currentXmppFromJid())}" to="${escapeXml(to)}" id="${escapeXml(id)}"><body>${escapeXml(text)}</body>${originId}${replace}${unstyled}${extraXml || ""}${receiptRequest}${markable}</message>`;
  }

  function createDeliveryReceiptStanza(to, messageId, id = createMessageId("receipt")) {
    return `<message xmlns="jabber:client" type="chat" from="${escapeXml(currentXmppFromJid())}" to="${escapeXml(to)}" id="${escapeXml(id)}"><received xmlns="urn:xmpp:receipts" id="${escapeXml(messageId)}"/></message>`;
  }

  function createDisplayedMarkerStanza(to, messageId, id = createMessageId("displayed")) {
    return `<message xmlns="jabber:client" type="chat" from="${escapeXml(currentXmppFromJid())}" to="${escapeXml(to)}" id="${escapeXml(id)}"><displayed xmlns="urn:xmpp:chat-markers:0" id="${escapeXml(messageId)}"/><store xmlns="urn:xmpp:hints"/></message>`;
  }

  function createMessageRetractionStanza(to, targetId, id = createMessageId("retract")) {
    const fallback = t(
      "message.retract_fallback",
      "/me retracted a previous message, but your client does not support message retraction."
    );
    return `<message xmlns="jabber:client" type="chat" from="${escapeXml(currentXmppFromJid())}" to="${escapeXml(to)}" id="${escapeXml(id)}"><retract xmlns="urn:xmpp:message-retract:1" id="${escapeXml(targetId)}"/><fallback xmlns="urn:xmpp:fallback:0" for="urn:xmpp:message-retract:1"/><body>${escapeXml(fallback)}</body><store xmlns="urn:xmpp:hints"/></message>`;
  }

  function createUniqueJid(jid) {
    const value = String(jid ?? "").trim();
    if (!value) {
      return `guest@localhost/web-${state.clientInstance.resourceSuffix}`;
    }

    const slash = value.indexOf("/");
    if (slash < 0) {
      return `${value}/web-${state.clientInstance.resourceSuffix}`;
    }

    const bare = value.slice(0, slash);
    const resource = value.slice(slash + 1) || "web";
    if (resource.endsWith(`-${state.clientInstance.resourceSuffix}`)) {
      return value;
    }

    return `${bare}/${resource}-${state.clientInstance.resourceSuffix}`;
  }

  function stripGeneratedResourceSuffix(jid) {
    const value = String(jid ?? "").trim();
    const marker = `-${state.clientInstance.resourceSuffix}`;
    const withoutGeneratedSuffix = value.endsWith(marker) ? value.slice(0, -marker.length) : value;
    return bareJid(withoutGeneratedSuffix);
  }

  function normalizeJidInput(jid) {
    return String(jid ?? "")
      .trim()
      .replace(/@locolhost(?=\/|$)/i, "@localhost");
  }

  function domainFromJid(jid) {
    const bare = normalizeJidInput(jid).split("/")[0];
    const parts = bare.split("@");
    return parts.length > 1 ? parts[1] : bare;
  }

  function isLocalAccountDomain(domain) {
    const normalized = String(domain ?? "").trim().toLowerCase();
    return normalized === "localhost"
      || normalized === "127.0.0.1"
      || normalized === "::1"
      || normalized === "dev.teletyptel.nl"
      || normalized === "teletyptel";
  }

  function isLocalXmppWebSocketUrl(url) {
    try {
      const parsed = new URL(String(url ?? "").trim());
      return isLocalAccountDomain(parsed.hostname);
    } catch {
      return false;
    }
  }

  function normalizeLocalWebSocketUrlForCurrentHost(url, fallbackPort = 8787) {
    const pageHost = location.hostname || "127.0.0.1";
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const fallback = location.protocol === "https:"
      ? `${protocol}//${pageHost}/rtt-relay`
      : `${protocol}//${pageHost}:${fallbackPort}`;
    const value = String(url ?? "").trim();
    if (!value) {
      return fallback;
    }

    try {
      const parsed = new URL(value);
      if (isLocalAccountDomain(parsed.hostname) && location.protocol !== "file:") {
        const useHttpsRelayProxy = location.protocol === "https:"
          && (parsed.port === String(fallbackPort)
            || parsed.protocol === "ws:"
            || parsed.pathname === "/"
            || parsed.pathname === "/rtt-relay");
        parsed.hostname = pageHost;
        if (location.protocol === "https:") {
          parsed.protocol = "wss:";
          if (useHttpsRelayProxy) {
            parsed.port = "";
            parsed.pathname = "/rtt-relay";
            parsed.search = "";
            parsed.hash = "";
          }
        }
      }

      return parsed.toString();
    } catch {
      return fallback;
    }
  }

  function normalizeLocalXmppWebSocketUrlForCurrentHost(url) {
    const value = String(url ?? "").trim();
    const fallback = "wss://localhost:5443/websocket/";
    if (!value || value === "ws://127.0.0.1:8787" || value === "ws://localhost:8787") {
      return fallback;
    }

    try {
      const parsed = new URL(value);
      if (isLocalAccountDomain(parsed.hostname) && (parsed.port === "8787" || parsed.pathname === "/rtt-relay")) {
        return fallback;
      }
      return parsed.toString();
    } catch {
      return fallback;
    }
  }

  function normalizeXmppPort(value) {
    const port = Number.parseInt(String(value ?? ""), 10);
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 5222;
  }

  function normalizeTlsMode(value) {
    const mode = String(value ?? "").trim().toLowerCase();
    return ["starttls", "direct-tls", "websocket"].includes(mode) ? mode : "starttls";
  }

  function escapeXml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatLastSeen(value) {
    const date = normalizeMessageDate(value);
    const time = formatTime(date);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return t("presence.today_at", "vandaag om {0}").replace("{0}", time);
    }

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return t("presence.yesterday_at", "gisteren om {0}").replace("{0}", time);
    }

    return date.toLocaleString(undefined, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) {
      return "";
    }

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const units = ["KB", "MB", "GB"];
    let amount = bytes / 1024;
    for (const unit of units) {
      if (amount < 1024 || unit === "GB") {
        return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${unit}`;
      }
      amount /= 1024;
    }

    return `${bytes} B`;
  }

  function setConnectionStatus(text, level) {
    el.connectionSummary.textContent = text;
    el.connectionSummary.className = level === "good"
      ? "status-good"
      : level === "danger"
        ? "status-danger"
        : "status-warn";
    updateServerSettingsReadonly();
  }

  function appendDebug(prefix, message) {
    if (!state.developerMode) {
      return;
    }

    const line = `[${new Date().toLocaleTimeString()}] ${prefix}: ${message}`;
    el.debugLog.textContent = el.debugLog.textContent
      ? el.debugLog.textContent + "\n" + line
      : line;
    el.debugLog.scrollTop = el.debugLog.scrollHeight;
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      let reloadedForServiceWorker = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadedForServiceWorker) {
          return;
        }

        reloadedForServiceWorker = true;
        location.reload();
      });

      navigator.serviceWorker.register("service-worker.js")
        .then((registration) => registration.update())
        .catch(() => {});
    }
  }
})();
