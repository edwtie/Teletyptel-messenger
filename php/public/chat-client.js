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
  const callModeDefinitions = {
    audio: { mediaKind: "audio", rttEnabled: false },
    video: { mediaKind: "video", rttEnabled: false },
    total: { mediaKind: "video", rttEnabled: true }
  };
  const accountStorageKeyBase = "teletyptel.serverAccountSession";
  const clientInstanceStorageKeyBase = "teletyptel.clientInstance";
  const sessionProfileStorageKey = "teletyptel.sessionProfile";
  const mediaSettingsStorageKey = "teletyptel.mediaSettings";
  const blockedJidsStorageKeyBase = "teletyptel.blockedJids";
  const locationSettingsStorageKeyBase = "teletyptel.locationSettings";
  const chatBackgroundStorageKeyBase = "teletyptel.chatBackground";
  const accountApiPath = "api/account.php";
  const historyApiPath = "api/history.php";
  const uploadApiPath = "api/upload.php";
  const languageBasePath = "lang/";
  const avatarMaxBytes = 256 * 1024;
  const avatarSourceMaxBytes = 5 * 1024 * 1024;
  const geolocNamespace = "http://jabber.org/protocol/geoloc";
  const jingleRttSyncNamespace = "urn:xmpp:jingle:apps:rtt-sync:0";
  const jingleRttSyncDataChannelLabel = "rtt";
  const jingleRttSyncMaxSkewMs = 700;
  const t140Backspace = "\b";
  const t140Delete = "\u007f";
  const locationStaleAfterMs = 5 * 60 * 1000;
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
    event: {
      viewBox: "0 -960 960 960",
      paths: ["M580-240q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Z"]
    },
    fileUpload: {
      viewBox: "0 -960 960 960",
      paths: ["M440-200h80v-167l64 64 56-57-160-160-160 160 57 56 63-63v167ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"]
    },
    gpsFixed: {
      viewBox: "0 0 24 24",
      paths: ["M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"]
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
    photoCamera: {
      viewBox: "0 -960 960 960",
      paths: ["M480-260q75 0 127.5-52.5T660-440q0-75-52.5-127.5T480-620q-75 0-127.5 52.5T300-440q0 75 52.5 127.5T480-260Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM160-120q-33 0-56.5-23.5T80-200v-480q0-33 23.5-56.5T160-760h126l74-80h240l74 80h126q33 0 56.5 23.5T880-680v480q0 33-23.5 56.5T800-120H160Zm0-80h640v-480H638l-73-80H395l-73 80H160v480Zm320-240Z"]
    },
    photoLibrary: {
      viewBox: "0 -960 960 960",
      paths: ["M360-400h400L622-580l-92 120-62-80-108 140Zm-40 160q-33 0-56.5-23.5T240-320v-480q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H320Zm0-80h480v-480H320v480ZM160-80q-33 0-56.5-23.5T80-160v-560h80v560h560v80H160Zm160-720v480-480Z"]
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
    mode: "relay",
    theme: loadTheme(),
    relaySocket: null,
    xmppSocket: null,
    xmppSession: null,
    intentionalDisconnect: false,
    account: null,
    passwordResetToken: locationSearchParams.get("reset") || "",
    developerMode,
    provider: null,
    translations: new Map(),
    languageCode: "eng",
    sessionProfile,
    clientInstance: loadClientInstance(sessionProfile),
    clientLifecycle: {
      current: "active",
      relayLastSent: null,
      xmppLastSent: null,
      nativeLastPosted: null,
      blurTimer: null
    },
    activeTabId: "chat",
    sequence: 0,
    previousText: "",
    editingMessage: null,
    call: null,
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
    blockedJids: new Set(loadBlockedJids(sessionProfile)),
    accountReady: false,
    pendingMucAvatarConversationId: null,
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
    accountGateRequired: !hasInitialAccountProfile,
    accountDialogMode: !hasInitialAccountProfile ? "signin" : "settings",
    conversations: [
      {
        id: "relay",
        name: "Relay room",
        nameKey: "conversation.relay_room",
        peer: "relay@localhost",
        kind: "contact",
        avatarColor: "#0f766e",
        presence: "offline",
        meta: "Offline",
        clientState: null,
        clientStateUpdatedAt: null,
        messages: [],
        remoteText: "",
        remoteFrom: "",
        remoteDraftUpdatedAt: null
      },
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
        messages: [],
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
        messages: [],
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
    profileButton: byId("profileButton"),
    accountButton: byId("accountButton"),
    connectButton: byId("connectButton"),
    disconnectButton: byId("disconnectButton"),
    addConversationButton: byId("addConversationButton"),
    addGroupButton: byId("addGroupButton"),
    inviteConversationButton: byId("inviteConversationButton"),
    developerPanel: byId("developerPanel"),
    conversationContextMenu: byId("conversationContextMenu"),
    contextRoomAvatarButton: byId("contextRoomAvatarButton"),
    contextBlockButton: byId("contextBlockButton"),
    mucAvatarFileInput: byId("mucAvatarFileInput"),
    messageContextMenu: byId("messageContextMenu"),
    messageContextEditButton: byId("messageContextEditButton"),
    messageContextDeleteButton: byId("messageContextDeleteButton"),
    messageContextDownloadButton: byId("messageContextDownloadButton"),
    messageContextForwardButton: byId("messageContextForwardButton"),
    conversationItems: byId("conversationItems"),
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
    remoteVideo: byId("remoteVideo"),
    localVideo: byId("localVideo"),
    toggleCameraButton: byId("toggleCameraButton"),
    muteMicrophoneButton: byId("muteMicrophoneButton"),
    muteRemoteAudioButton: byId("muteRemoteAudioButton"),
    toggleTotalConversationTextButton: byId("toggleTotalConversationTextButton"),
    remoteVolumeInput: byId("remoteVolumeInput"),
    remoteVolumeValue: byId("remoteVolumeValue"),
    totalConversationTextPanel: byId("totalConversationTextPanel"),
    totalConversationRemoteName: byId("totalConversationRemoteName"),
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
    voiceMessageButton: byId("voiceMessageButton"),
    fileInput: byId("fileInput"),
    rttToggle: byId("rttToggle"),
    smileyToggle: byId("smileyToggle"),
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
    dialogXmppDomainInput: byId("dialogXmppDomainInput"),
    dialogXmppHostInput: byId("dialogXmppHostInput"),
    dialogXmppPortInput: byId("dialogXmppPortInput"),
    dialogXmppTlsModeInput: byId("dialogXmppTlsModeInput"),
    dialogRelayUrlInput: byId("dialogRelayUrlInput"),
    dialogXmppUrlInput: byId("dialogXmppUrlInput"),
    dialogProviderInput: byId("dialogProviderInput"),
    dialogLanguageInput: byId("dialogLanguageInput"),
    dialogPeerInput: byId("dialogPeerInput"),
    dialogPhoneInput: byId("dialogPhoneInput"),
    dialogBirthDateInput: byId("dialogBirthDateInput"),
    accountSecuritySection: byId("accountSecuritySection"),
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
    dialogMediaStatus: byId("dialogMediaStatus"),
    dialogRefreshMediaButton: byId("dialogRefreshMediaButton"),
    dialogPreviewMediaButton: byId("dialogPreviewMediaButton"),
    dialogStopMediaPreviewButton: byId("dialogStopMediaPreviewButton"),
    dialogContactsPanel: byId("dialogContactsPanel"),
    dialogAccessibilityPanel: byId("dialogAccessibilityPanel"),
    dialogServerSettingsLockNote: byId("dialogServerSettingsLockNote"),
    dialogAccountStatus: byId("dialogAccountStatus"),
    dialogCreateAccountButton: byId("dialogCreateAccountButton"),
    dialogGoogleLoginButton: byId("dialogGoogleLoginButton"),
    dialogSaveAccountButton: byId("dialogSaveAccountButton"),
    dialogConnectButton: byId("dialogConnectButton"),
    dialogResetPasswordButton: byId("dialogResetPasswordButton"),
    dialogServerSettingsButton: byId("dialogServerSettingsButton"),
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

  document.body.classList.toggle("account-gate", state.accountGateRequired);
  document.body.classList.toggle("developer-mode", state.developerMode);
  updateDeveloperPanelVisibility();
  bindEvents();
  el.sessionProfileInput.value = state.sessionProfile;
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
  resetServiceWorkerCachesIfRequested();
  loadPlatformConfig();
  applyMediaSettingsToControls();
  refreshMediaDevices(false);
  registerServiceWorker();
  setupMobileLifecycle();

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
    el.profileButton.addEventListener("click", () => openAccountDialog({ mode: "profile" }));
    el.accountButton.addEventListener("click", () => openAccountDialog({ mode: "settings" }));
    el.connectButton.addEventListener("click", connectRelay);
    el.disconnectButton.addEventListener("click", disconnectAll);
    el.addConversationButton.addEventListener("click", addConversation);
    el.addGroupButton.addEventListener("click", addGroupConversation);
    el.inviteConversationButton.addEventListener("click", inviteContactToActiveGroup);
    el.backToContactsButton.addEventListener("click", closeActiveConversation);
    el.contextRoomAvatarButton.addEventListener("click", chooseContextRoomAvatar);
    el.contextBlockButton.addEventListener("click", toggleBlockContextConversation);
    el.mucAvatarFileInput.addEventListener("change", handleMucAvatarFileSelected);
    el.conversationContextMenu.addEventListener("click", (event) => event.stopPropagation());
    el.messageContextMenu.addEventListener("click", (event) => event.stopPropagation());
    el.messageContextEditButton.addEventListener("click", editContextMessage);
    el.messageContextDeleteButton.addEventListener("click", deleteContextMessage);
    el.messageContextDownloadButton.addEventListener("click", downloadContextMessageAttachment);
    el.messageContextForwardButton.addEventListener("click", forwardContextMessage);
    el.startAudioCallOption.addEventListener("click", () => startCallFromMenu("audio"));
    el.startVideoCallOption.addEventListener("click", () => startCallFromMenu("video"));
    el.startTotalCallOption.addEventListener("click", () => startCallFromMenu("total"));
    el.answerCallButton.addEventListener("click", answerIncomingCall);
    el.rejectCallButton.addEventListener("click", rejectIncomingCall);
    el.incomingAnswerButton.addEventListener("click", answerIncomingCall);
    el.incomingRejectButton.addEventListener("click", rejectIncomingCall);
    el.dialogAnswerButton.addEventListener("click", answerIncomingCall);
    el.dialogRejectButton.addEventListener("click", rejectIncomingCall);
    el.hangupCallButton.addEventListener("click", hangupCall);
    el.toggleCameraButton.addEventListener("click", toggleCameraVideo);
    el.muteMicrophoneButton.addEventListener("click", toggleMicrophoneMute);
    el.muteRemoteAudioButton.addEventListener("click", toggleRemoteAudioMute);
    el.toggleTotalConversationTextButton.addEventListener("click", toggleTotalConversationText);
    el.remoteVolumeInput.addEventListener("input", saveRemoteVolumeFromControl);
    el.relayModeButton.addEventListener("click", () => setMode("relay"));
    el.xmppModeButton.addEventListener("click", () => setMode("xmpp"));
    el.closeTabPanelButton.addEventListener("click", () => activateTab("chat"));
    el.resetRttButton.addEventListener("click", sendRttReset);
    el.enableRttButton.addEventListener("click", enableLiveRttFromToolbar);
    el.attachmentMenuButton.addEventListener("click", toggleAttachmentMenu);
    el.attachmentPhotoButton.addEventListener("click", () => openAttachmentFilePicker("image/*", ""));
    el.attachmentVideoButton.addEventListener("click", () => openAttachmentFilePicker("video/*", ""));
    el.uploadFileButton.addEventListener("click", () => openAttachmentFilePicker("", ""));
    el.attachmentLocationButton.addEventListener("click", shareLocationFromAttachmentMenu);
    el.emojiButton.addEventListener("click", toggleSmileyPicker);
    el.smileyPickerPanel.addEventListener("click", handleSmileyPickerClick);
    el.voiceMessageButton.addEventListener("click", () => showAttachmentPlaceholder("attachment.voice_message"));
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
    document.addEventListener("keydown", closeCallMenusOnEscape);
    document.addEventListener("keydown", closeAttachmentMenuOnEscape);
    document.addEventListener("keydown", closeSmileyPickerOnEscape);
    document.addEventListener("keydown", closeConversationContextMenuOnEscape);
    document.addEventListener("keydown", closeMessageContextMenuOnEscape);
    document.addEventListener("keydown", closeAccountDialogOnEscape);
    document.addEventListener("keydown", closeAvatarCropDialogOnEscape);
    document.addEventListener("keydown", closeLocationShareDialogOnEscape);
    document.addEventListener("keydown", closePhotoViewerOnEscape);
    document.addEventListener("keydown", closeMapViewerOnEscape);
    window.addEventListener("resize", closeConversationContextMenu);
    window.addEventListener("resize", closeMessageContextMenu);
    window.addEventListener("scroll", closeConversationContextMenu, true);
    window.addEventListener("scroll", closeMessageContextMenu, true);
    document.addEventListener("visibilitychange", handleVisibilityLifecycleChange);
    window.addEventListener("focus", () => setClientLifecycleState("active", "focus"));
    window.addEventListener("blur", handleWindowLifecycleBlur);
    window.addEventListener("pageshow", () => setClientLifecycleState("active", "pageshow"));
    window.addEventListener("pagehide", () => setClientLifecycleState("inactive", "pagehide", { force: true }));
    document.addEventListener("freeze", () => setClientLifecycleState("inactive", "freeze", { force: true }));
    document.addEventListener("pause", () => setClientLifecycleState("inactive", "app-pause", { force: true }));
    document.addEventListener("resume", () => setClientLifecycleState("active", "app-resume"));
    window.addEventListener("teletyptel:lifecycle", handleNativeLifecycleEvent);
    el.composerForm.addEventListener("submit", sendComposerMessage);
    el.messageInput.addEventListener("input", sendRttEdit);
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
    el.dialogCreateAccountButton.addEventListener("click", createAccountFromDialog);
    el.dialogGoogleLoginButton.addEventListener("click", startGoogleLoginFromDialog);
    el.dialogSaveAccountButton.addEventListener("click", () => saveAccountDialogProfile(false));
    el.dialogConnectButton.addEventListener("click", () => saveAccountDialogProfile(true));
    el.dialogForgotPasswordButton.addEventListener("click", requestPasswordResetFromDialog);
    el.dialogResetPasswordButton.addEventListener("click", resetPasswordFromDialog);
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
    el.refreshMediaButton.addEventListener("click", () => refreshMediaDevices(true));
    el.previewMediaButton.addEventListener("click", previewMedia);
    el.stopMediaPreviewButton.addEventListener("click", stopMediaPreview);
    el.dialogCameraInput.addEventListener("change", () => handleMediaSettingsChange("video", "dialog"));
    el.dialogMicrophoneInput.addEventListener("change", () => handleMediaSettingsChange("audio", "dialog"));
    el.dialogVideoQualityInput.addEventListener("change", () => handleMediaSettingsChange("video", "dialog"));
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
    el.passwordInput.addEventListener("input", updateAccountPasswordStatus);
    el.rememberPasswordToggle.addEventListener("change", updateAccountPasswordStatus);
    el.languageInput.addEventListener("change", () => loadLanguage(el.languageInput.value));
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
    const changed = state.clientLifecycle.current !== normalized;
    state.clientLifecycle.current = normalized;
    if (changed || options.force === true) {
      flushClientLifecycleState(reason, options.force === true);
    }
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
    state.xmppSocket.send(xml);
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

  function locationSettingsStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? locationSettingsStorageKeyBase : `${locationSettingsStorageKeyBase}.${normalized}`;
  }

  function chatBackgroundStorageKeyFor(profile) {
    const normalized = sanitizeSessionProfile(profile);
    return normalized === "default" ? chatBackgroundStorageKeyBase : `${chatBackgroundStorageKeyBase}.${normalized}`;
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
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      state.theme === "dark" ? "#111827" : "#eef2f7");
  }

  function setMode(mode) {
    state.mode = mode;
    el.relayModeButton.classList.toggle("selected", mode === "relay");
    el.xmppModeButton.classList.toggle("selected", mode === "xmpp");
    setDefaultComposerState();
    updateComposerAvailability();
  }

  async function loadPlatformConfig() {
    let savedAccount = null;
    let databaseLoaded = false;
    try {
      savedAccount = loadSavedAccountProfile();
      const account = mergeAccountProfiles(
        applySessionAccountDefaults(await fetchJson("config/account-profile.json"), savedAccount),
        savedAccount);
      if (oauthAccountId) {
        account.accountId = oauthAccountId;
      }
      state.account = account;
      applyAccountProfile(account);
      databaseLoaded = await loadDatabaseAccount(account.accountId, oauthLoginToken);
      if (databaseLoaded) {
        if (oauthAccountId) {
          storeServerAccountBrowserSession(state.account);
          cleanOauthUrl();
        }
        await loadMessageHistory();
      }
      await loadLanguage(state.account.preferredLanguage ?? "eng");
      const provider = await fetchJson(`config/providers/${encodeURIComponent(state.account.providerId)}.json`);
      state.provider = provider;
      await loadGoogleMapsConfig();
      renderProvider();
      renderTabs();
      showAccountStartIfRequired(!databaseLoaded);
      setAccountReady(databaseLoaded);
      autoConnectIfReady();
      openPasswordResetDialogIfRequested();
      appendDebug("config", `Loaded provider ${provider.providerId}`);
    } catch (error) {
      el.providerSummary.textContent = t("provider.unavailable", "Provider manifest unavailable.");
      appendDebug("config-error", error.message);
      await loadLanguage(state.account?.preferredLanguage ?? "eng");
      await loadGoogleMapsConfig();
      renderTabs();
      showAccountStartIfRequired(!databaseLoaded);
      setAccountReady(databaseLoaded);
      autoConnectIfReady();
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

  async function loadLanguage(code) {
    const normalized = normalizeLanguageCode(code);
    state.languageCode = normalized;
    el.languageInput.value = normalized;

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
      const response = await fetch(`${historyApiPath}?accountId=${encodeURIComponent(state.account.accountId)}&limit=300`, {
        cache: "no-store"
      });
      if (response.status === 404 || response.status === 401) {
        appendDebug("history", `History unavailable: ${response.status}`);
        return false;
      }

      if (!response.ok) {
        throw new Error(`history API returned ${response.status}`);
      }

      const payload = await response.json();
      if (!payload.ok || !Array.isArray(payload.messages)) {
        return false;
      }

      for (const item of payload.messages) {
        restoreHistoryMessage(item);
      }

      renderConversations();
      renderActiveConversation();
      appendDebug("history", `Loaded ${payload.messages.length} messages`);
      return true;
    } catch (error) {
      appendDebug("history-error", error.message);
      return false;
    }
  }

  function restoreHistoryMessage(item) {
    const peer = String(item.conversationPeer || "").trim();
    if (!peer) {
      return;
    }

    const conversation = ensureConversationForPeer(
      peer,
      item.conversationKind === "group" ? "group" : "contact",
      item.conversationName || displayNameForJid(peer));
    if (!conversation) {
      return;
    }

    const messageId = String(item.messageId || "").trim();
    if (messageId && conversation.messages.some((message) => message.xmppId === messageId || message.id === messageId)) {
      return;
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
      return;
    }

    message.edited = item.edited === true;
    message.retracted = item.retracted === true;
    message.retraction = item.retraction || null;
    const timestamp = new Date(item.timestamp || Date.now());
    message.timestamp = Number.isNaN(timestamp.valueOf()) ? new Date() : timestamp;
  }

  function persistHistoryMessage(conversation, message) {
    if (!state.account?.accountId || !conversation || !message || message.draft || message.status === "history") {
      return;
    }

    const messageId = message.xmppId || message.id;
    if (!messageId) {
      return;
    }

    postHistory({
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
      stylingDisabled: message.stylingDisabled === true,
      edited: message.edited === true,
      retracted: message.retracted === true,
      retraction: message.retraction || null,
      timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : new Date().toISOString()
    });
  }

  function deleteHistoryMessage(message, text = null, retraction = null) {
    if (!state.account?.accountId || !message) {
      return;
    }

    const messageId = message.xmppId || message.id;
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
      twoFactorEnabled: account.twoFactorEnabled === true || state.account?.twoFactorEnabled === true,
      twoFactorMethod: account.twoFactorMethod || state.account?.twoFactorMethod || ""
    };
    setAvatarColorControls(normalizeAvatarColor(state.account.avatarColor));
    el.passwordInput.value = account.rememberPassword ? account.password ?? "" : "";
    el.rememberPasswordToggle.checked = account.rememberPassword === true;
    el.rttToggle.checked = account.liveRttEnabled !== false;
    el.smileyToggle.checked = account.showSmileys !== false;
    syncRttToolbarState();
    el.peerInput.value = account.peer ?? el.peerInput.value;
    el.phoneInput.value = account.phoneNumber ?? "";
    if (state.account) {
      state.account.birthDate = normalizeBirthDate(account.birthDate ?? state.account.birthDate ?? "");
    }
    el.languageInput.value = normalizeLanguageCode(account.preferredLanguage ?? "eng");
    el.providerInput.value = account.providerId ?? "";
    el.relayUrlInput.value = account.relayWebSocket ?? el.relayUrlInput.value;
    el.xmppUrlInput.value = account.xmppWebSocket ?? el.xmppUrlInput.value;
    state.account.xmppHost = account.xmppHost ?? state.account.xmppHost ?? domainFromJid(account.jid ?? "");
    state.account.xmppPort = account.xmppPort ?? state.account.xmppPort ?? 5222;
    state.account.xmppDomain = account.xmppDomain ?? state.account.xmppDomain ?? domainFromJid(account.jid ?? "");
    state.account.xmppTlsMode = account.xmppTlsMode ?? state.account.xmppTlsMode ?? "starttls";
    updateAccountStatus(account.savedInDatabase === true ? t("account.database_loaded", "Server account loaded") : t("account.default_profile", "Default account profile"));
    updateAccountAvatarPreview();
    updateRelayConversationMeta();
    reconcileContactsForCurrentAccount();
    syncAccountDialogFromControls();
  }

  function showAccountStartIfRequired(required) {
    setAccountGateRequired(required);
    if (required) {
      openAccountDialog({ required: true });
    }
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
    window.setTimeout(() => {
      const focusTarget = mode === "profile"
        ? el.dialogDisplayNameInput
        : (mode === "settings" ? (el.dialogCameraInput || el.dialogChatBackgroundInput) : (mode === "reset" ? el.dialogPasswordInput : el.dialogJidInput));
      focusTarget.focus();
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
    el.accountDialogTitle.textContent = resetMode
      ? t("account.reset_title", "Reset password")
      : startMode
      ? t("account.start_title", "Sign in")
      : (profileMode ? t("account.profile_title", "Profile") : t("account.settings_title", "Settings"));
    el.accountDialogSubtitle.textContent = resetMode
      ? t("account.reset_subtitle", "Use the reset link from your e-mail and choose a new password.")
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
    el.dialogAdvancedDetails.open = settingsMode;
    el.accountSecuritySection.hidden = startMode || resetMode;
    el.dialogSaveAccountButton.hidden = startMode || resetMode;
    el.dialogConnectButton.hidden = resetMode || (!startMode && !state.developerMode);
    el.dialogResetPasswordButton.hidden = !resetMode;
    el.dialogForgotPasswordButton.hidden = resetMode;
    el.dialogGoogleLoginButton.closest(".social-login-row").hidden = resetMode || !startMode;
    el.dialogCreateAccountButton.hidden = resetMode;
    el.dialogRememberPasswordToggle.closest("label").hidden = resetMode;
    el.dialogPasswordInput.autocomplete = resetMode ? "new-password" : "current-password";
    el.dialogConnectButton.textContent = startMode
      ? t("button.sign_in", "Sign in")
      : t("button.save_connect", "Save and connect");
    if (!resetMode) {
      el.dialogCreateAccountButton.hidden = false;
      el.dialogCreateAccountButton.textContent = startMode
        ? t("button.sign_up", "New account")
        : t("button.create_account", "Create account");
    }
    el.dialogServerSettingsButton.hidden = profileMode || resetMode;
    updateServerSettingsReadonly();
  }

  function openDialogServerSettings() {
    state.accountDialogMode = "settings";
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

  function startGoogleLoginFromDialog() {
    updateAccountStatus(t("account.google_redirecting", "Opening Google sign-in..."));
    const target = new URL("api/auth/google/start", location.href);
    location.assign(target.toString());
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
    el.dialogXmppDomainInput.value = state.account?.xmppDomain || domainFromJid(el.dialogJidInput.value);
    el.dialogXmppHostInput.value = state.account?.xmppHost || el.dialogXmppDomainInput.value || "localhost";
    el.dialogXmppPortInput.value = String(state.account?.xmppPort || 5222);
    el.dialogXmppTlsModeInput.value = normalizeTlsMode(state.account?.xmppTlsMode || "starttls");
    el.dialogRelayUrlInput.value = el.relayUrlInput.value;
    el.dialogXmppUrlInput.value = el.xmppUrlInput.value;
    el.dialogProviderInput.value = el.providerInput.value;
    el.dialogLanguageInput.value = el.languageInput.value;
    el.dialogPeerInput.value = el.peerInput.value;
    el.dialogPhoneInput.value = el.phoneInput.value;
    el.dialogBirthDateInput.value = normalizeBirthDate(state.account?.birthDate ?? "");
    el.dialogChatBackgroundInput.value = state.chatBackground;
    el.dialogMapProviderInput.value = normalizeMapProvider(state.location.settings.mapProvider);
    updateTwoFactorStatus();
    renderMediaDeviceSelects();
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

    const qr = qrcode(0, "M");
    qr.addData(uri);
    qr.make();
    el.twoFactorQrCode.innerHTML = qr.createSvgTag(4, 0);
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
    const xmppWebSocket = el.dialogXmppUrlInput.value.trim() || el.xmppUrlInput.value;
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
    el.relayUrlInput.value = el.dialogRelayUrlInput.value.trim() || el.relayUrlInput.value;
    el.xmppUrlInput.value = xmppWebSocket;
    el.providerInput.value = el.dialogProviderInput.value.trim() || "example-provider";
    el.languageInput.value = normalizeLanguageCode(el.dialogLanguageInput.value);
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
        throw new Error(accountApiErrorText(payload.error || `account API returned ${response.status}`));
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
        throw new Error(accountApiErrorText(payload.error || `account API returned ${response.status}`));
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
      throw new Error(accountApiErrorText(payload.error || `account API returned ${response.status}`));
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
      const result = await saveAccountProfile();
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
    el.requestTwoFactorButton.disabled = busy || state.account?.twoFactorEnabled === true;
    el.confirmTwoFactorButton.disabled = busy || state.account?.twoFactorEnabled === true || state.security.twoFactorVerificationId <= 0;
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
      peer: defaultAccount.peer ?? "relay@localhost"
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
      password: el.passwordInput.value,
      phoneNumber: el.phoneInput.value.trim(),
      birthDate: normalizeBirthDate(state.account?.birthDate ?? el.dialogBirthDateInput?.value ?? ""),
      providerId: el.providerInput.value.trim() || state.account?.providerId || "example-provider",
      accessibilityProfileId: state.account?.accessibilityProfileId ?? "default-live-text",
      preferredLanguage: el.languageInput.value,
      relayWebSocket: el.relayUrlInput.value.trim(),
      xmppWebSocket: el.xmppUrlInput.value.trim(),
      xmppHost: state.account?.xmppHost || domainFromJid(el.jidInput.value.trim()),
      xmppPort: state.account?.xmppPort || 5222,
      xmppDomain: state.account?.xmppDomain || domainFromJid(el.jidInput.value.trim()),
      xmppTlsMode: normalizeTlsMode(state.account?.xmppTlsMode || "starttls"),
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
    state.account = { ...state.account, ...profile, ...account, savedInDatabase: true };
    storeServerAccountSession(state.account, profile.rememberPassword);
    el.jidInput.value = createUniqueJid(state.account.jid);
    updateAccountAvatarPreview();
    updateRelayConversationMeta();
    reconcileContactsForCurrentAccount();
    updateAccountStatus(t("account.database_saved", "Server account saved"));
    appendDebug("account", `Server saved ${el.jidInput.value}`);
    setAccountReady(true);
    await loadMessageHistory();
    return { profile: state.account, databaseSaved: true };
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
      throw new Error(accountApiErrorText(payload.error || `account API returned ${response.status}`));
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
      sessionProfile: state.sessionProfile
    }));
  }

  function cleanOauthUrl() {
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("oauth");
    cleanUrl.searchParams.delete("accountId");
    cleanUrl.searchParams.delete("loginToken");
    history.replaceState(null, document.title, cleanUrl.toString());
  }

  function accountApiErrorText(error) {
    if (error === "invalid_credentials") {
      return t("account.invalid_credentials", "The server rejected this email or password.");
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

    return (localStorage.getItem(accountStorageKeyFor(state.sessionProfile)) || sessionStorage.getItem(accountStorageKeyFor(state.sessionProfile)))
      ? t("account.server_session", "Server account session")
      : t("account.default_profile", "Default account profile");
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
    el.newsButton.hidden = !newsTab;
    el.newsButton.classList.toggle("selected", state.activeTabId === "news");
    el.supportButton.hidden = !supportTab;
    el.supportButton.textContent = supportTab?.title ?? "Support";
    el.supportButton.classList.toggle("selected", Boolean(supportTab) && state.activeTabId === supportTab.id);

    const tabs = panels.filter((tab) => tab.id !== "news" && !isSupportTab(tab));
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
      ...providerTabs
    ];
  }

  function isSupportTab(tab) {
    return tab?.id === "support" || tab?.service === "support";
  }

  function activateSupportTab() {
    const supportTab = allTabs().find(isSupportTab);
    activateTab(supportTab?.id ?? "chat");
  }

  function activateTab(tabId) {
    state.activeTabId = tabId;
    renderTabs();

    if (tabId === "chat") {
      el.messageTimeline.hidden = false;
      el.tabPanel.hidden = true;
      return;
    }

    const tab = allTabs().find((item) => item.id === tabId);
    if (!tab) {
      activateTab("chat");
      return;
    }

    el.messageTimeline.hidden = true;
    el.tabPanel.hidden = false;
    renderTabPanel(tab);
  }

  function renderTabPanel(tab) {
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
      state.xmppSocket.send(iq);
      appendDebug("C", "geoloc publish redacted");
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
      state.xmppSocket.send(iq);
      appendDebug("C", iq);
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

  function connectRelay() {
    if (!state.accountReady || state.accountGateRequired) {
      openAccountDialog({ required: true });
      return;
    }

    if (state.relaySocket && (state.relaySocket.readyState === WebSocket.CONNECTING || state.relaySocket.readyState === WebSocket.OPEN)) {
      return;
    }

    state.intentionalDisconnect = false;
    const socket = new WebSocket(el.relayUrlInput.value.trim());
    state.relaySocket = socket;
    updateConnectButtonAvailability();
    setConnectionStatus(t("status.connecting_relay", "Connecting relay"), "warn");
    appendDebug("relay", "Connecting " + el.relayUrlInput.value.trim());

    socket.addEventListener("open", () => {
      setConnectionStatus(t("status.relay_connected", "Relay connected"), "good");
      setDefaultComposerState();
      updateConnectButtonAvailability();
      setInfrastructurePresence("online");
      sendPresence("online", { probe: true });
      flushClientLifecycleState("relay-open", true);
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
      setConnectionStatus(t("status.relay_disconnected", "Relay disconnected"), "warn");
      state.relaySocket = null;
      state.clientLifecycle.relayLastSent = null;
      setAllContactPresence("offline");
      renderConversations();
      updateConnectButtonAvailability();
      updateComposerAvailability();
      if (!state.intentionalDisconnect && state.accountReady) {
        returnToLoginScreenAfterDisconnect(t("account.disconnected_login_required", "Connection closed. Sign in to continue."));
      }
    });

    socket.addEventListener("error", () => {
      setConnectionStatus(t("status.relay_error", "Relay error"), "danger");
      if (!state.intentionalDisconnect && state.accountReady) {
        window.setTimeout(() => {
          if (!state.relaySocket || state.relaySocket.readyState === WebSocket.CLOSED) {
            returnToLoginScreenAfterDisconnect(t("account.connection_failed_login_required", "Connection failed. Sign in to try again."));
          }
        }, 0);
      }
    });
  }

  function disconnectAll() {
    state.intentionalDisconnect = true;
    cleanupCall(true);

    if (state.location.live) {
      stopLocationSharing();
    }

    if (state.relaySocket) {
      sendPresence("offline");
      state.relaySocket.close();
    }

    closeXmppWebSocket();
    updateConnectButtonAvailability();
    returnToLoginScreenAfterDisconnect();
  }

  function returnToLoginScreenAfterDisconnect(message) {
    state.intentionalDisconnect = true;
    setAccountReady(false);
    state.clientLifecycle.relayLastSent = null;
    state.clientLifecycle.xmppLastSent = null;
    state.previousText = "";
    state.activeConversationId = null;
    el.messageInput.value = "";
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
    setAccountGateRequired(true);
    openAccountDialog({ required: true });
    el.dialogAccountStatus.textContent = message || t("account.disconnected_login_required", "Connection closed. Sign in to continue.");
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
    const focusTarget = !el.contextRoomAvatarButton.hidden
      ? el.contextRoomAvatarButton
      : el.contextBlockButton;
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
      selectConversation(target.conversation.id);
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
        state.xmppSocket.send(xml);
        appendDebug("C", xml);
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
      state.xmppSocket.send(xml);
      appendDebug("C", xml);
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
    el.fileInput.accept = accept;
    el.fileInput.multiple = !capture;
    if (capture) {
      el.fileInput.setAttribute("capture", capture);
    } else {
      el.fileInput.removeAttribute("capture");
    }

    el.fileInput.click();
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

  function toggleSmileyPicker(event) {
    event?.stopPropagation();
    if (el.emojiButton.disabled) {
      return;
    }

    const shouldOpen = el.smileyPickerPanel.hidden;
    closeCallMenus();
    closeAttachmentMenu();
    closeSmileyPicker();
    el.smileyPickerPanel.hidden = !shouldOpen;
    el.emojiButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    syncEmojiButtonState();
  }

  function closeSmileyPickerOnOutsideClick(event) {
    if (event.target instanceof Element && event.target.closest(".smiley-menu")) {
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
    syncEmojiButtonState();
  }

  function handleSmileyPickerClick(event) {
    const button = event.target instanceof Element
      ? event.target.closest("[data-smiley-code]")
      : null;
    if (!(button instanceof HTMLButtonElement)) {
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
    const url = normalizeXmppWebSocketUrl(el.xmppUrlInput.value.trim());
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
      el.xmppOpenButton.disabled = false;
      el.xmppCloseButton.disabled = true;
      const wasReady = state.accountReady;
      state.xmppSocket = null;
      state.xmppSession = null;
      state.clientLifecycle.xmppLastSent = null;
      appendDebug("xmpp", "Closed");
      updateComposerAvailability();
      updateConnectButtonAvailability();
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
      boundJid: ""
    };
  }

  function sendXmppOpenFrame() {
    if (state.xmppSocket?.readyState !== WebSocket.OPEN || !state.xmppSession) {
      return;
    }

    const open = `<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="${escapeXml(state.xmppSession.domain)}" version="1.0"/>`;
    state.xmppSocket.send(open);
    appendDebug("C", open);
    flushClientLifecycleState("xmpp-open", true);
  }

  function sendXmppPlainAuth() {
    const password = state.account?.password || el.passwordInput.value || "";
    if (!password) {
      setConnectionStatus(t("account.password_required", "Enter a password for a real server account."), "danger");
      returnToLoginScreenAfterDisconnect(t("account.password_required", "Enter a password for a real server account."));
      closeXmppWebSocket();
      return;
    }

    const authzid = "";
    const authcid = state.xmppSession?.localPart || bareJid(currentFromJid()).split("@")[0];
    const payload = base64Utf8(`${authzid}\u0000${authcid}\u0000${password}`);
    const xml = `<auth xmlns="urn:ietf:params:xml:ns:xmpp-sasl" mechanism="PLAIN">${payload}</auth>`;
    state.xmppSession.phase = "authenticating";
    state.xmppSocket.send(xml);
    appendDebug("C", "<auth mechanism=\"PLAIN\">...</auth>");
  }

  function sendXmppBind() {
    if (!state.xmppSession) {
      return;
    }

    state.xmppSession.phase = "binding";
    const xml = `<iq xmlns="jabber:client" type="set" id="${escapeXml(state.xmppSession.bindId)}"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><resource>${escapeXml(state.xmppSession.resource)}</resource></bind></iq>`;
    state.xmppSocket.send(xml);
    appendDebug("C", xml);
  }

  function completeXmppBind(iq) {
    const jidElement = iq.getElementsByTagNameNS("urn:ietf:params:xml:ns:xmpp-bind", "jid")[0];
    const boundJid = jidElement?.textContent || currentFromJid();
    state.xmppSession.boundJid = boundJid;
    state.xmppSession.authenticated = true;
    state.xmppSession.phase = "ready";
    if (state.account) {
      state.account.xmppBoundJid = boundJid;
    }
    state.clientLifecycle.xmppLastSent = null;
    const presence = '<presence xmlns="jabber:client"/>';
    state.xmppSocket.send(presence);
    appendDebug("C", presence);
    flushClientLifecycleState("xmpp-ready", true);
    setConnectionStatus(t("status.xmpp_connected", "XMPP connected"), "good");
    updateComposerAvailability();
  }

  function base64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  function closeXmppWebSocket() {
    if (!state.xmppSocket) {
      return;
    }

    if (state.xmppSocket.readyState === WebSocket.OPEN) {
      const close = '<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>';
      state.xmppSocket.send(close);
      appendDebug("C", close);
    }

    state.xmppSocket.close();
  }

  function handleXmppIncomingFrame(xmlText) {
    const text = String(xmlText ?? "");
    handleXmppSessionFrame(text);
    if (!text.includes("<message")) {
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

    const messages = Array.from(doc.getElementsByTagNameNS("jabber:client", "message"));
    for (const message of messages) {
      const from = message.getAttribute("from") || "";
      if (!from || isOwnPeer(from)) {
        continue;
      }

      const conversation = ensureConversationForPeer(from, "contact", displayNameForJid(from));
      if (!conversation) {
        continue;
      }

      conversation.presence = "online";
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
      const messageId = message.getAttribute("id") || null;
      const stylingDisabled = Boolean(message.getElementsByTagNameNS("urn:xmpp:styling:0", "unstyled")[0]);
      if (replaceId) {
        applyMessageCorrection(conversation, replaceId, bodyElement.textContent || "", "peer", messageId, from, stylingDisabled);
      } else {
        addMessage("peer", bodyElement.textContent || "", "received", from, null, conversation.id, null, messageId, stylingDisabled);
      }
    }
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

  function handleXmppFeatures(features) {
    if (!state.xmppSession) {
      return;
    }

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
    if (bindFeature && !state.xmppSession.authenticated && state.xmppSession.phase !== "binding") {
      sendXmppBind();
    }
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
      const xml = createMessageStanza(text, outgoingId, edit?.replaceId ?? null);
      state.xmppSocket.send(xml);
      appendDebug("C", xml);
      if (edit) {
        applyMessageCorrection(edit.conversation, edit.replaceId, text, "self", outgoingId);
        clearMessageEdit();
      } else {
        addMessage("self", text, "RFC 7395", null, null, null, null, outgoingId);
      }
      el.messageInput.value = "";
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
        addMessage("self", text, "jingle-rtt", null, null, null, null, outgoingId);
      }
      el.messageInput.value = "";
      state.previousText = "";
      state.sequence = 0;
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
    if (edit) {
      applyMessageCorrection(edit.conversation, edit.replaceId, text, "self", outgoingId);
      clearMessageEdit();
    } else {
      addMessage("self", text, "sent", null, null, null, null, outgoingId);
    }
    el.messageInput.value = "";
    state.previousText = "";
    state.sequence = 0;
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
    updateTotalConversationTextPanel();
    if (sendJingleRttSyncPacket("reset", el.messageInput.value)) {
      return;
    }
    sendRttPacket("reset", el.messageInput.value);
  }

  function sendRttEdit() {
    if (!hasActiveConversation() || !el.rttToggle.checked) {
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
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("rtt-out", xml);
  }

  function createRelayEnvelope(type, text, xml, to = null) {
    return {
      type,
      text,
      xml,
      clientId: state.clientInstance.id,
      from: currentFromJid(),
      to: to || currentToJid(),
      ...currentAvatarEnvelope(type !== "rtt" && type !== "client-state")
    };
  }

  function sendPresence(presence, options = {}) {
    if (!isRelayConnected()) {
      return;
    }

    const envelope = createRelayEnvelope("presence", "", "", "relay@localhost");
    envelope.presence = presence === "offline" ? "offline" : "online";
    envelope.probe = options.probe === true;
    envelope.responseTo = options.responseTo || null;
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("presence-out", `${envelope.presence} ${envelope.probe ? "probe" : "announce"}`);
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

    return el.peerInput.value.trim() || "relay@localhost";
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

    const bare = jid.split("/")[0];
    if (jid === currentFromJid()) {
      return currentSenderName();
    }

    if (jid.startsWith("ai@") || bare === "ai@localhost") {
      return "AI agent";
    }

    const local = bare.split("@")[0] || jid;
    const resource = jid.includes("/") ? jid.split("/").slice(1).join("/") : "";
    return resource ? `${local}/${resource}` : local;
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

    if (envelope.type !== "rtt" && envelope.type !== "message" && envelope.type !== "message-delete" && envelope.type !== "jingle" && envelope.type !== "presence" && envelope.type !== "client-state" && envelope.type !== "location") {
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

    if (envelope.type === "message") {
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
          typeof envelope.messageId === "string" ? envelope.messageId : null);
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
    conversation.remoteDraftUpdatedAt = new Date();
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    setPeerPresence(conversation.peer, "online");
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
    if (presence === "offline") {
      conversation.clientState = null;
      conversation.clientStateUpdatedAt = null;
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

    const clientState = envelope.clientState === "inactive" ? "inactive" : "active";
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

  function handleLocationEnvelope(envelope) {
    const conversation = conversationForEnvelope(envelope);
    if (!conversation) {
      return;
    }

    applyEnvelopeIdentity(conversation, envelope);
    conversation.presence = "online";
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    if (envelope.locationAction === "stop") {
      addMessage(
        "peer",
        envelope.text || t("location.stopped_message", "Location sharing stopped."),
        "location",
        envelopeFrom(envelope),
        null,
        conversation.id);
      return;
    }

    const location = normalizeIncomingLocation(envelope.location);
    const text = envelope.text || (location ? locationMessageText(location) : t("location.shared_message", "Location shared"));
    const from = envelopeFrom(envelope);
    if (envelope.locationAction === "live") {
      upsertLiveLocationMessage("peer", text, "location live", from, conversation.id, location);
    } else {
      addMessage("peer", text, "location", from, null, conversation.id, location, typeof envelope.messageId === "string" ? envelope.messageId : null);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stopStream(stream);
    } catch (error) {
      appendDebug("media-permission", error.message);
      for (const constraints of [{ audio: true, video: false }, { audio: false, video: true }]) {
        try {
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
    for (const select of [el.cameraInput, el.dialogCameraInput]) {
      renderDeviceSelect(
        select,
        cameras,
        state.mediaSettings.cameraDeviceId,
        t("media.default_camera", "Default camera"),
        t("media.camera", "Camera"));
    }
    for (const select of [el.microphoneInput, el.dialogMicrophoneInput]) {
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
    select.replaceChildren(new Option(defaultLabel, ""));
    devices.forEach((device, index) => {
      select.appendChild(new Option(device.label || `${fallbackLabel} ${index + 1}`, device.deviceId));
    });

    select.value = devices.some((device) => device.deviceId === selectedValue)
      ? selectedValue
      : "";
  }

  function setMediaControlValues() {
    const videoQuality = state.mediaSettings.videoQuality || "default";
    for (const select of [el.videoQualityInput, el.dialogVideoQualityInput]) {
      if (select) {
        select.value = videoQuality;
      }
    }
  }

  function mediaControlsForSource(source) {
    return source === "dialog"
      ? {
        camera: el.dialogCameraInput,
        microphone: el.dialogMicrophoneInput,
        quality: el.dialogVideoQualityInput
      }
      : {
        camera: el.cameraInput,
        microphone: el.microphoneInput,
        quality: el.videoQualityInput
      };
  }

  function saveMediaSettingsFromControls(announce = true, source = "main") {
    const controls = mediaControlsForSource(source);
    state.mediaSettings = {
      cameraDeviceId: controls.camera?.value ?? state.mediaSettings.cameraDeviceId ?? "",
      microphoneDeviceId: controls.microphone?.value ?? state.mediaSettings.microphoneDeviceId ?? "",
      videoQuality: controls.quality?.value || state.mediaSettings.videoQuality || "default",
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

  async function handleMediaSettingsChange(kind, source = "main") {
    saveMediaSettingsFromControls(false, source);
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
      setMediaStatus(t("call.media_unavailable", "Camera/microphone access is not available."));
      return;
    }

    stopMediaPreview();
    saveMediaSettingsFromControls();

    try {
      const stream = await navigator.mediaDevices.getUserMedia(createMediaConstraints("video"));
      state.mediaPreviewStream = stream;
      el.localVideo.srcObject = stream;
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
      el.localVideo.srcObject = null;
    }

    if (!state.call?.localStream && !state.call?.remoteStream) {
      el.callPanel.hidden = true;
    }

    setMediaStatus(t("media.preview_stopped", "Preview stopped."));
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

    if (!isRelayConnected()) {
      showNotConnectedStatus();
      setCallStatus(t("status.not_connected", "Not connected."));
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
      await openLocalMedia(call);
      createPeerConnection(call);
      const offer = await call.pc.createOffer();
      await call.pc.setLocalDescription(offer);
      sendJingleEnvelope("session-initiate", {
        sid: call.sid,
        mediaKind: call.mediaKind,
        sdp: offer.sdp,
        descriptionType: offer.type,
        rttSync: call.rttSync
      });
      setCallStatus(t("call.ringing", "Ringing..."));
      addMessage("self", callStartedText(call), "jingle");
    } catch (error) {
      setCallStatus(`${t("call.failed", "Call failed")}: ${error.message}`);
      cleanupCall(false);
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
      call.remoteDescriptionSet = true;
      await flushPendingIceCandidates(call);
      const answer = await call.pc.createAnswer();
      await call.pc.setLocalDescription(answer);
      sendJingleEnvelope("session-accept", {
        sid: call.sid,
        mediaKind: call.mediaKind,
        sdp: answer.sdp,
        descriptionType: answer.type,
        rttSync: call.rttSync
      });
      call.incomingOffer = null;
      setCallStatus(jingleRttSyncStatusText(call));
      updateCallUi();
    } catch (error) {
      setCallStatus(`${t("call.failed", "Call failed")}: ${error.message}`);
      sendJingleEnvelope("session-terminate", {
        sid: call.sid,
        reason: "failed-application",
        reasonText: error.message
      });
      cleanupCall(false);
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
    cleanupCall(false);
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
    cleanupCall(false);
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
    updateTotalConversationTextToggleUi();
    updateTotalConversationTextPanel();
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
      setCallStatus(jingleInfoText(envelope.info, envelope.mediaKind));
    } else if (action === "session-terminate") {
      cleanupCall(false);
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

    const call = createCallState(
      String(envelope.sid || "td-" + createShortId()),
      envelopeFrom(envelope),
      "receiver",
      envelope.mediaKind === "video" ? "video" : "audio",
      Boolean(envelope.rttSync));
    call.rttSync = call.rttEnabled
      ? normalizeJingleRttSyncDescriptor(envelope.rttSync, call.sid, "offered")
      : null;
    call.incomingOffer = envelope.sdp;
    state.call = call;
    updateCallUi();
    const conversation = ensureConversationForPeer(call.peer, "contact", displayNameForJid(call.peer));
    if (conversation) {
      applyEnvelopeIdentity(conversation, envelope);
      state.activeConversationId = conversation.id;
      el.peerInput.value = conversation.peer;
    }

    sendJingleEnvelope("session-info", {
      sid: call.sid,
      to: call.peer,
      info: "ringing"
    });
    setCallStatus(`${t("call.incoming", "Incoming call from")} ${displayNameForJid(call.peer)}`);
    addMessage("peer", incomingCallTitle(call), "jingle", call.peer, null, conversation?.id ?? null);
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
      if (envelope.rttSync || call.rttEnabled) {
        call.rttEnabled = true;
        call.callMode = callModeName(call.mediaKind, true);
        call.rttSync = normalizeJingleRttSyncDescriptor(envelope.rttSync || call.rttSync, call.sid, "accepted");
      }
      await call.pc.setRemoteDescription({ type: "answer", sdp: envelope.sdp });
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
      role,
      mediaKind,
      callMode: callModeName(mediaKind, rttEnabled),
      rttEnabled,
      pc: null,
      localStream: null,
      remoteStream: null,
      rttChannel: null,
      rttSync: rttEnabled ? createJingleRttSyncDescriptor(sid, "offered") : null,
      incomingOffer: null,
      pendingCandidates: [],
      remoteDescriptionSet: false
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

  function createJingleRttSyncDescriptor(sid, stateName = "offered") {
    return {
      namespace: jingleRttSyncNamespace,
      profile: "datachannel-t140",
      label: jingleRttSyncDataChannelLabel,
      role: "conversation",
      source: "human",
      lang: jingleRttSyncLanguage(),
      syncGroup: jingleRttSyncGroup(sid),
      syncReference: "audio",
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
      lang: value.lang || fallback.lang,
      syncGroup: value.syncGroup || fallback.syncGroup,
      state: value.state || stateName,
      sequence: Number.isInteger(value.sequence) ? value.sequence : 0
    };
  }

  function jingleRttSyncLanguage() {
    return normalizeLanguageCode(state.languageCode || el.languageInput.value) === "ned"
      ? "nl-NL"
      : "en";
  }

  function jingleRttSyncGroup(sid) {
    return `tc-${String(sid || "call").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  }

  function createPeerConnection(call) {
    if (call.pc) {
      return call.pc;
    }

    const pc = new RTCPeerConnection({ iceServers: [] });
    call.pc = pc;

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
      el.remoteVideo.srcObject = call.remoteStream;
      el.callPanel.hidden = false;
      updateCallUi();
    });

    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "connected") {
        setCallStatus(jingleRttSyncStatusText(call));
      } else if (pc.connectionState === "failed") {
        setCallStatus(t("call.failed", "Call failed"));
      } else if (pc.connectionState === "disconnected") {
        setCallStatus(t("call.disconnected", "Call disconnected"));
      }
    });

    return pc;
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

    channel.addEventListener("open", () => {
      if (!state.call || state.call.sid !== call.sid) {
        return;
      }

      call.rttSync.state = "connected";
      setCallStatus(t("call.connected_total", "Total conversation connected - live text synchronized"));
      appendDebug("jingle-rtt", `Datachannel open sid=${call.sid}`);
      updateCallUi();
    });

    channel.addEventListener("close", () => {
      if (!state.call || state.call.sid !== call.sid) {
        return;
      }

      call.rttSync.state = "fallback";
      setCallStatus(t("call.rtt_sync_fallback", "Call connected - live text fallback uses XEP-0301"));
      appendDebug("jingle-rtt", `Datachannel closed sid=${call.sid}`);
      updateCallUi();
    });

    channel.addEventListener("error", () => {
      call.rttSync.state = "fallback";
      appendDebug("jingle-rtt-error", `Datachannel error sid=${call.sid}`);
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
      lang: call.rttSync.lang || jingleRttSyncLanguage(),
      role: call.rttSync.role,
      source: call.rttSync.source,
      syncGroup: call.rttSync.syncGroup || jingleRttSyncGroup(call.sid),
      syncReference: call.rttSync.syncReference,
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
    conversation.clientState = "active";
    conversation.clientStateUpdatedAt = new Date();
    setPeerPresence(conversation.peer, "online");
    updateTotalConversationTextPanel(conversation);

    if (packet.replaceId) {
      applyMessageCorrection(
        conversation,
        String(packet.replaceId),
        String(packet.text ?? ""),
        "peer",
        typeof packet.messageId === "string" ? packet.messageId : null,
        conversation.remoteFrom);
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
  }

  async function openLocalMedia(call) {
    if (call.localStream) {
      return call.localStream;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(t("call.media_unavailable", "Camera/microphone access is not available."));
    }

    const wantsVideo = call.mediaKind === "video";
    stopMediaPreview();
    saveMediaSettingsFromControls();
    try {
      call.localStream = await navigator.mediaDevices.getUserMedia(createMediaConstraints(call.mediaKind));
      await refreshMediaDevices(false);
    } catch (error) {
      if (!wantsVideo) {
        throw error;
      }

      if (state.mediaSettings.cameraDeviceId || state.mediaSettings.microphoneDeviceId) {
        try {
          appendDebug("media", `Selected device unavailable, trying defaults: ${error.message}`);
          call.localStream = await navigator.mediaDevices.getUserMedia(createDefaultMediaConstraints("video"));
          setMediaStatus(t("media.default_fallback", "Selected device was unavailable; using browser defaults."));
          await refreshMediaDevices(false);
        } catch (fallbackError) {
          appendDebug("media", `Default video fallback failed: ${fallbackError.message}`);
        }
      }

      if (call.localStream) {
        el.localVideo.srcObject = call.localStream;
        el.callPanel.hidden = false;
        updateCallUi();
        return call.localStream;
      }

      appendDebug("media", `Video unavailable, falling back to audio: ${error.message}`);
      call.mediaKind = "audio";
      call.localStream = await navigator.mediaDevices.getUserMedia(createMediaConstraints("audio"));
    }

    el.localVideo.srcObject = call.localStream;
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
    const audio = state.mediaSettings.microphoneDeviceId
      ? { deviceId: { exact: state.mediaSettings.microphoneDeviceId } }
      : true;
    return { audio, video: false };
  }

  function createVideoOnlyConstraints() {
    const video = videoConstraintsForQuality(state.mediaSettings.videoQuality);
    if (state.mediaSettings.cameraDeviceId) {
      video.deviceId = { exact: state.mediaSettings.cameraDeviceId };
    }

    return { audio: false, video };
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
      return { width: { ideal: 320 }, height: { ideal: 240 } };
    }

    if (quality === "vga") {
      return { width: { ideal: 640 }, height: { ideal: 480 } };
    }

    if (quality === "hd") {
      return { width: { ideal: 1280 }, height: { ideal: 720 } };
    }

    if (quality === "fullhd") {
      return { width: { ideal: 1920 }, height: { ideal: 1080 } };
    }

    return { width: { ideal: 640 }, height: { ideal: 360 } };
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
    for (const extraTrack of replacementStream.getTracks()) {
      if (extraTrack !== replacementTrack) {
        extraTrack.stop();
      }
    }

    el.localVideo.srcObject = call.localStream;
    el.callPanel.hidden = false;
    await refreshMediaDevices(false);
    updateCallUi();
  }

  function cleanupCall(notifyRemote) {
    const call = state.call;
    if (!call) {
      updateCallUi();
      return;
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
    el.localVideo.srcObject = null;
    el.remoteVideo.srcObject = null;
    el.callPanel.hidden = true;
    state.call = null;
    updateCallUi();
  }

  function sendJingleEnvelope(action, payload = {}) {
    if (!isRelayConnected()) {
      appendDebug("jingle-error", "Relay is not connected");
      return;
    }

    const envelope = {
      ...createRelayEnvelope("jingle", "", ""),
      action,
      sid: payload.sid || state.call?.sid || "td-" + createShortId(),
      to: payload.to || state.call?.peer || currentToJid(),
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
    state.relaySocket.send(JSON.stringify(envelope));
    appendDebug("jingle-out", envelope.xml);
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
      payload = createJingleContentXml("audio", "audio")
        + (envelope.mediaKind === "video" ? createJingleContentXml("video", "video") : "")
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
      `lang="${escapeXml(rttSync.lang)}"`,
      `sync-group="${escapeXml(rttSync.syncGroup)}"`,
      `sync-reference="${escapeXml(rttSync.syncReference)}"`,
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
      `sync-group="${escapeXml(packet.syncGroup || "")}"`,
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
      const caller = displayNameForJid(call.peer);
      const title = incomingCallTitle(call);
      const text = `${t("call.incoming", "Incoming call from")} ${caller}`;
      el.incomingCallTitle.textContent = title;
      el.incomingCallDialogTitle.textContent = title;
      el.incomingCallText.textContent = text;
      el.incomingCallDialogText.textContent = text;
      el.incomingCallBanner.scrollIntoView({ block: "nearest" });
      el.dialogAnswerButton.focus();
    }

    el.answerCallButton.hidden = !incoming;
    el.rejectCallButton.hidden = !incoming;
    setCallButtonsDisabled(Boolean(call));
    setCallModeButtonsHidden(Boolean(call));
    el.hangupCallButton.hidden = !call || incoming;
    el.hangupCallButton.disabled = !call;
    const hasLocalVideo = hasVideoTrack(call?.localStream);
    const hasRemoteVideo = hasVideoTrack(call?.remoteStream);
    const hasMedia = Boolean(call?.localStream || call?.remoteStream);
    el.callPanel.hidden = !hasMedia;
    el.callPanel.classList.toggle("local-video-main", hasLocalVideo && !hasRemoteVideo);
    el.callPanel.classList.toggle("remote-video-main", hasRemoteVideo);
    document.body.classList.toggle("call-active", hasMedia);
    updateCameraToggleUi();
    updateMicrophoneMuteUi();
    updateTotalConversationTextToggleUi();
    applyRemoteVolume();
    updateTotalConversationTextPanel();
  }

  function hasVideoTrack(stream) {
    return Boolean(stream?.getVideoTracks?.().length);
  }

  function isLocalCameraOff(call = state.call) {
    const tracks = call?.localStream?.getVideoTracks?.() ?? [];
    return tracks.length > 0 && tracks.every((track) => !track.enabled);
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

    return jidMatches(envelope.to, currentFromJid());
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
      return t("call.rtt_sync_fallback", "Call connected - live text fallback uses XEP-0301");
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
      replaceId: state.editingMessage.replaceId || message.xmppId || message.id
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
      replaceId: message.xmppId || message.id
    };
    el.messageInput.value = message.text;
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
    const message = conversation.messages.find((item) =>
      (item.xmppId && item.xmppId === replaceId) || item.id === replaceId);
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

    const message = conversation.messages.find((item) =>
      (item.xmppId && item.xmppId === targetId) || item.id === targetId);
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

  function addMessage(direction, text, status, from = null, attachment = null, conversationId = null, location = null, xmppId = null, stylingDisabled = false, persist = true) {
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
      stylingDisabled,
      retracted: false,
      retraction: null,
      edited: false,
      timestamp: new Date()
    };

    conversation.messages.push(message);
    if (conversation.id === state.activeConversationId) {
      appendMessageToTimeline(message);
    }

    renderConversations();
    if (persist) {
      persistHistoryMessage(conversation, message);
    }
    return message;
  }

  function upsertLiveLocationMessage(direction, text, status, from, conversationId, location) {
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
      addMessage(direction, text, status, from, null, conversation.id, location);
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

    el.messageTimeline.appendChild(createMessageElement(message));
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

    state.activeConversationId = conversation.id;
    el.peerInput.value = conversation.peer;
    renderConversations();
    renderActiveConversation();
  }

  function activeConversation() {
    return state.conversations.find((conversation) => conversation.id === state.activeConversationId) ?? null;
  }

  function renderConversations() {
    el.conversationItems.replaceChildren();
    for (const conversation of state.conversations) {
      if (isOwnContact(conversation) || isBlockedConversation(conversation)) {
        continue;
      }

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
      meta.textContent = conversationMeta(conversation);
      text.append(name, meta);
      const presence = document.createElement("span");
      presence.className = `presence-dot presence-${conversationPresence(conversation)}`;
      button.append(avatar, text, presence);
      button.addEventListener("click", () => {
        state.activeConversationId = conversation.id;
        el.peerInput.value = conversation.peer;
        state.previousText = "";
        el.messageInput.value = "";
        closeConversationContextMenu();
        renderConversations();
        renderActiveConversation();
        el.messageInput.focus();
      });
      button.addEventListener("contextmenu", (event) => showConversationContextMenu(event, conversation, button));
      button.addEventListener("keydown", (event) => {
        if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
          showConversationContextMenu(event, conversation, button);
        }
      });
      el.conversationItems.appendChild(button);
    }

    updateComposerAvailability();
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

  function renderActiveConversation() {
    const conversation = activeConversation();
    document.body.classList.toggle("conversation-open", Boolean(conversation));
    if (!conversation) {
      renderAvatarInto(el.activeConversationAvatar, {
        displayName: "TX",
        avatarColor: "#2563eb"
      });
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
    el.messageTimeline.replaceChildren();

    for (const message of conversation.messages) {
      el.messageTimeline.appendChild(createMessageElement(message));
    }

    if (conversation.remoteText) {
      el.messageTimeline.appendChild(createMessageElement({
        direction: "peer",
        from: conversation.remoteFrom,
        text: conversation.remoteText,
        status: "typing",
        timestamp: conversation.remoteDraftUpdatedAt ?? new Date(),
        draft: true
      }));
      el.remoteDraft.hidden = false;
      el.remoteDraftName.textContent = displayNameForJid(conversation.remoteFrom || conversation.peer);
      el.remoteDraftPreviousText.textContent = lastPeerConversationText(conversation);
      el.remoteDraftText.textContent = conversation.remoteText || "";
    } else {
      el.remoteDraft.hidden = true;
      el.remoteDraftPreviousText.textContent = "";
      el.remoteDraftText.textContent = "";
    }

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
      el.remoteDraft.hidden = true;
      el.remoteDraftPreviousText.textContent = "";
      el.remoteDraftText.textContent = "";
      updateTotalConversationTextPanel(conversation);
      return;
    }

    el.activeConversationName.textContent = conversationDisplayName(conversation);
    el.activeConversationMeta.textContent = conversationMeta(conversation);
    renderAvatarInto(el.activeConversationAvatar, conversation);
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
      draft: true
    };

    if (!existing) {
      el.messageTimeline.appendChild(createMessageElement(message));
      el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
      updateTotalConversationTextPanel(conversation);
      return;
    }

    updateMessageElement(existing, message);
    el.messageTimeline.scrollTop = el.messageTimeline.scrollHeight;
    updateTotalConversationTextPanel(conversation);
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

    el.callPanel.classList.toggle("tc-text-full", visible && isLocalCameraOff(call));
    el.totalConversationTextPanel.hidden = !visible;
    if (!visible) {
      el.totalConversationRemoteText.textContent = "";
      el.totalConversationLocalPreviousText.textContent = "";
      el.totalConversationLocalText.textContent = "";
      return;
    }

    el.totalConversationRemoteName.textContent = displayNameForJid(conversation.remoteFrom || call.peer);
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
    state.activeConversationId = conversation.id;
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

  function updateConversationContextMenu() {
    const conversation = state.conversations.find((item) => item.id === state.contextConversationId) ?? null;
    const canBlock = canBlockConversation(conversation);
    const blocked = isBlockedConversation(conversation);
    const canChangeRoomAvatar = canChangeMucAvatar(conversation);
    el.contextRoomAvatarButton.hidden = !canChangeRoomAvatar;
    el.contextRoomAvatarButton.disabled = !canChangeRoomAvatar;
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

  function canOpenConversationContextMenu(conversation) {
    return canBlockConversation(conversation) || canChangeMucAvatar(conversation);
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

    if (state.activeTabId === "chat" || el.tabPanel.hidden) {
      return;
    }

    const tab = allTabs().find((item) => item.id === state.activeTabId);
    if (tab) {
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
    state.xmppSocket.send(xml);
    appendDebug("C", xml);
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
    el.voiceMessageButton.disabled = !hasConversation || blocked;
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

      const preferXmpp = state.mode === "xmpp" || normalizeTlsMode(state.account?.xmppTlsMode) === "websocket";
      if (preferXmpp) {
        connectXmppWebSocket();
      } else {
        connectRelay();
      }
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
    el.disconnectButton.hidden = !connected;
    el.disconnectButton.disabled = !connected;
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

    return conversation.presence === "online"
      ? conversation.clientState === "inactive"
        ? t("presence.online_inactive", "Online - inactive")
        : t("presence.online", "Online")
      : t("presence.offline", "Offline");
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
    item.className = "message " + message.direction + (message.draft ? " draft" : "") + (message.retracted ? " retracted" : "");
    if (message.id) {
      item.dataset.messageId = message.id;
    }
    item.addEventListener("contextmenu", (event) => showMessageContextMenu(event, message, item));
    if (message.draft) {
      item.dataset.remoteDraft = "true";
    } else {
      delete item.dataset.remoteDraft;
    }

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = messageMetaText(message);
    const body = document.createElement("div");
    body.className = "message-body";
    renderRichText(body, message.text, message.stylingDisabled);
    if (!message.retracted && message.attachment) {
      body.appendChild(createAttachmentElement(message.attachment));
    }
    if (!message.retracted && message.location) {
      body.appendChild(createLocationElement(message.location, message));
    }
    item.append(meta, body);
    return item;
  }

  function updateLiveLocationMessageElement(message) {
    const item = Array.from(el.messageTimeline.querySelectorAll("[data-message-id]"))
      .find((element) => element.dataset.messageId === message.id);
    if (!item) {
      renderActiveConversation();
      return;
    }

    item.className = "message " + message.direction;
    const meta = item.querySelector(".message-meta");
    if (meta) {
      meta.textContent = messageMetaText(message);
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
    item.className = "message " + message.direction + (message.draft ? " draft" : "") + (message.retracted ? " retracted" : "");
    if (message.id) {
      item.dataset.messageId = message.id;
    }
    if (message.draft) {
      item.dataset.remoteDraft = "true";
    } else {
      delete item.dataset.remoteDraft;
    }

    const meta = item.querySelector(".message-meta");
    if (meta) {
      meta.textContent = messageMetaText(message);
    }

    const body = item.querySelector(".message-body");
    if (body) {
      renderRichText(body, message.text, message.stylingDisabled);
      if (!message.retracted && message.attachment) {
        body.appendChild(createAttachmentElement(message.attachment));
      }
      if (!message.retracted && message.location) {
        body.appendChild(createLocationElement(message.location, message));
      }
    }
  }

  function messageMetaText(message) {
    const sender = message.direction === "self"
      ? currentSenderName()
      : displayNameForJid(message.from);
    const status = message.edited
      ? `${message.status} (${t("message.edited", "edited")})`
      : message.status;
    return `${sender} - ${status} - ${formatTime(message.timestamp)}`;
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
    const wrapper = document.createElement("a");
    wrapper.className = `attachment-card ${kind}`;
    wrapper.href = attachment.url;
    wrapper.target = "_blank";
    wrapper.rel = "noopener";
    wrapper.download = attachment.name || "";

    const icon = document.createElement("span");
    icon.className = "attachment-icon";
    icon.textContent = attachmentKindLabel(kind);

    const text = document.createElement("span");
    text.className = "attachment-text";
    const name = document.createElement("strong");
    name.textContent = attachment.name || "download";
    const meta = document.createElement("small");
    meta.textContent = [attachmentKindText(kind), formatBytes(attachment.size), attachment.type]
      .filter(Boolean)
      .join(" - ");
    text.append(name, meta);

    if (kind === "photo") {
      const preview = document.createElement("img");
      preview.className = "attachment-preview";
      preview.src = attachment.url;
      preview.alt = attachment.name || t("upload.photo", "Photo");
      preview.loading = "lazy";
      wrapper.append(preview, text);
      wrapper.addEventListener("click", (event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
          return;
        }

        event.preventDefault();
        openPhotoViewer(attachment);
      });
    } else {
      wrapper.append(icon, text);
    }

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
    return kind === "photo" ? "PHOTO" : kind === "document" ? "DOC" : kind === "binary" ? "BIN" : "FILE";
  }

  function attachmentKindText(kind) {
    if (kind === "photo") {
      return t("upload.photo", "Photo");
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

  async function uploadOneFile(file) {
    appendDebug("upload", `${file.name} (${file.size} bytes)`);
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await fetch(uploadApiPath, {
        method: "POST",
        body: data
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !payload.file) {
        throw new Error(payload.error || `upload returned ${response.status}`);
      }

      sendFileMessage(payload.file);
    } catch (error) {
      appendDebug("upload-error", error.message);
      addMessage("self", `${t("upload.failed", "Upload failed")}: ${file.name}`, "error");
    }
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

    const text = `${t("upload.shared_file", "Shared file")}: ${file.name}`;
    const messageId = createMessageId("file");
    const attachment = {
      id: file.id || "",
      name: file.name,
      url: file.url,
      downloadUrl: file.downloadUrl || file.url,
      size: file.size,
      type: file.type,
      kind: classifyAttachment(file),
      storage: file.storage || ""
    };

    if (state.mode === "xmpp" && state.xmppSocket?.readyState === WebSocket.OPEN) {
      const xml = createMessageStanza(`${text}\n${new URL(file.url, location.href).href}`, messageId);
      state.xmppSocket.send(xml);
      appendDebug("C", xml);
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
    const styledRuns = stylingDisabled ? null : parseMessageStyling(text);
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

  function createMessageStanza(text, id = createMessageId("msg"), replaceId = null, stylingDisabled = false, to = el.peerInput.value) {
    const replace = replaceId
      ? `<replace xmlns="urn:xmpp:message-correct:0" id="${escapeXml(replaceId)}"/>`
      : "";
    const unstyled = stylingDisabled ? `<unstyled xmlns="urn:xmpp:styling:0"/>` : "";
    return `<message xmlns="jabber:client" type="chat" from="${escapeXml(currentXmppFromJid())}" to="${escapeXml(to)}" id="${escapeXml(id)}"><body>${escapeXml(text)}</body>${replace}${unstyled}</message>`;
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
    return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
  }

  function isLocalXmppWebSocketUrl(url) {
    try {
      const parsed = new URL(String(url ?? "").trim());
      return isLocalAccountDomain(parsed.hostname);
    } catch {
      return false;
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
