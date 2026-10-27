"use strict";
window.TeleTypTelSupportLanguage = (() => {
  const languages = { nl: "Nederlands", en: "English", de: "Deutsch", fr: "Français", es: "Español" };
  const messages = {
    "Translate automatically on my screen": ["Auf meinem Bildschirm automatisch übersetzen", "Traduire automatiquement sur mon écran", "Traducir automáticamente en mi pantalla"],
    "When the visitor permits it, Google translates messages and live RTT, including before sending. No extra confirmation needed. Unchecking stops only your translation view. Translations may contain errors.": ["Wenn der Besucher es erlaubt, übersetzt Google Nachrichten und Live-RTT, auch vor dem Senden. Keine zusätzliche Bestätigung nötig. Das Entfernen des Häkchens stoppt nur Ihre Übersetzungsanzeige. Übersetzungen können Fehler enthalten.", "Si le visiteur l'autorise, Google traduit les messages et le RTT en direct, même avant l'envoi. Aucune confirmation supplémentaire nécessaire. Décocher arrête seulement votre affichage des traductions. Elles peuvent contenir des erreurs.", "Si el visitante lo permite, Google traduce mensajes y RTT en directo, incluso antes de enviarlos. No hace falta otra confirmación. Desmarcar solo detiene tu vista de traducción. Las traducciones pueden contener errores."],
    "Translation is off for this chat.": ["Die Übersetzung ist für diesen Chat ausgeschaltet.", "La traduction est désactivée pour ce chat.", "La traducción está desactivada para este chat."],
    "No extra confirmation from the agent is needed. Translations may contain errors. No audio translation. Uncheck and save to stop translation for this chat; text chat and RTT keep working.": ["Keine zusätzliche Bestätigung der Servicekraft nötig. Übersetzungen können Fehler enthalten. Keine Audioübersetzung. Zum Stoppen der Übersetzung für diesen Chat Häkchen entfernen und speichern; Textchat und RTT funktionieren weiter.", "Aucune confirmation supplémentaire de l'agent n'est nécessaire. Les traductions peuvent contenir des erreurs. Pas de traduction audio. Décochez et enregistrez pour arrêter la traduction de ce chat ; le chat et le RTT restent disponibles.", "No hace falta confirmación adicional del agente. Las traducciones pueden contener errores. No se traduce el audio. Desmarca y guarda para detener la traducción de este chat; el chat y RTT siguen funcionando."],
    "Check the translation settings for this chat or refresh the chat.": ["Prüfen Sie die Übersetzungseinstellungen dieses Chats oder laden Sie den Chat neu.", "Vérifiez les paramètres de traduction de ce chat ou actualisez le chat.", "Comprueba los ajustes de traducción de este chat o actualiza el chat."],
    "Close everything": ["Alles beenden", "Tout fermer", "Cerrar todo"],
    "Close everything? The chat, RTT, camera and microphone will stop. Unsent text and selected files will be discarded.": ["Alles beenden? Chat, RTT, Kamera und Mikrofon werden gestoppt. Nicht gesendeter Text und ausgewählte Dateien werden verworfen.", "Tout fermer ? Le chat, le RTT, la caméra et le microphone seront arrêtés. Le texte non envoyé et les fichiers sélectionnés seront abandonnés.", "¿Cerrar todo? Se detendrán el chat, RTT, la cámara y el micrófono. Se descartarán el texto sin enviar y los archivos seleccionados."],
    "Choose emoji": ["Emoji auswählen", "Choisir un emoji", "Elegir emoji"],
    "Type a message": ["Nachricht eingeben", "Écrivez un message", "Escribe un mensaje"],
    "Start video call": ["Videoanruf starten", "Démarrer un appel vidéo", "Iniciar videollamada"],
    "Microphone available during video call": ["Mikrofon während des Videoanrufs verfügbar", "Microphone disponible pendant un appel vidéo", "Micrófono disponible durante la videollamada"],
    "Camera off": ["Kamera ausschalten", "Désactiver la caméra", "Apagar cámara"],
    "Camera on": ["Kamera einschalten", "Activer la caméra", "Encender cámara"],
    "Microphone off": ["Mikrofon ausschalten", "Désactiver le microphone", "Apagar micrófono"],
    "Microphone on": ["Mikrofon einschalten", "Activer le microphone", "Encender micrófono"],
    "Attachments are deleted with the chat and are not sent to Google. Only open files you trust.": ["Anhänge werden mit dem Chat gelöscht und nicht an Google gesendet. Öffnen Sie nur vertrauenswürdige Dateien.", "Les pièces jointes sont supprimées avec le chat et ne sont pas envoyées à Google. N'ouvrez que les fichiers auxquels vous faites confiance.", "Los adjuntos se eliminan con el chat y no se envían a Google. Abre solo archivos de confianza."],
    "Attach photo or document": ["Foto oder Dokument anhängen", "Joindre une photo ou un document", "Adjuntar foto o documento"],
    "Send file": ["Datei senden", "Envoyer le fichier", "Enviar archivo"],
    "Cancel": ["Abbrechen", "Annuler", "Cancelar"],
    "Choose PDF, Word or a photo, maximum 5 MB.": ["PDF, Word oder Foto wählen, höchstens 5 MB.", "Choisissez un PDF, Word ou une photo, 5 Mo maximum.", "Elige PDF, Word o una foto, máximo 5 MB."],
    "File upload failed. Check the file type and size (maximum 5 MB), then try again.": ["Datei-Upload fehlgeschlagen. Dateityp und Größe prüfen (höchstens 5 MB), dann erneut versuchen.", "Échec de l'envoi. Vérifiez le type et la taille du fichier (5 Mo maximum), puis réessayez.", "No se pudo enviar el archivo. Comprueba el tipo y tamaño (máximo 5 MB) y vuelve a intentarlo."],
    "I accept the chat terms: share live RTT and automatically translate messages and draft text through Google Cloud Translation, including before sending.": ["Ich akzeptiere die Chatbedingungen: Live-RTT teilen und Nachrichten sowie Entwürfe automatisch durch Google Cloud Translation übersetzen lassen, auch vor dem Senden.", "J'accepte les conditions du chat : partager le RTT en direct et faire traduire automatiquement les messages et brouillons par Google Cloud Translation, même avant l'envoi.", "Acepto las condiciones del chat: compartir RTT en directo y traducir automáticamente mensajes y borradores mediante Google Cloud Translation, incluso antes de enviarlos."],
    "Messages and live text are translated automatically through Google Cloud Translation, including before sending. Translations may contain errors. Use the globe to withdraw translation consent; text chat and RTT remain available.": ["Nachrichten und Live-Text werden automatisch durch Google Cloud Translation übersetzt, auch vor dem Senden. Übersetzungen können Fehler enthalten. Über die Weltkugel können Sie die Zustimmung widerrufen; Textchat und RTT bleiben verfügbar.", "Les messages et le texte en direct sont traduits automatiquement par Google Cloud Translation, même avant l'envoi. Les traductions peuvent contenir des erreurs. Utilisez le globe pour retirer votre consentement ; le chat et le RTT restent disponibles.", "Los mensajes y el texto en directo se traducen automáticamente mediante Google Cloud Translation, incluso antes de enviarlos. Las traducciones pueden contener errores. Usa el globo para retirar el consentimiento; el chat y RTT siguen disponibles."],
    "I allow automatic translation of messages and live RTT through Google Cloud Translation, including before sending.": ["Ich erlaube die automatische Übersetzung von Nachrichten und Live-RTT durch Google Cloud Translation, auch vor dem Senden.", "J'autorise la traduction automatique des messages et du RTT en direct par Google Cloud Translation, même avant l'envoi.", "Permito la traducción automática de mensajes y RTT en directo mediante Google Cloud Translation, incluso antes de enviarlos."],
    "Both participants must agree. Translations may contain errors. No audio translation. Uncheck and save to withdraw consent; text chat and RTT keep working.": ["Beide Personen müssen zustimmen. Übersetzungen können Fehler enthalten. Keine Audioübersetzung. Zum Widerruf Häkchen entfernen und speichern; Textchat und RTT funktionieren weiter.", "Les deux personnes doivent accepter. Les traductions peuvent contenir des erreurs. Pas de traduction audio. Décochez et enregistrez pour retirer votre consentement ; le chat et le RTT restent disponibles.", "Ambas personas deben aceptar. Las traducciones pueden contener errores. Sin traducción de audio. Desmarca y guarda para retirar el consentimiento; el chat y RTT siguen funcionando."],
    "Customer service": ["Kundenservice", "Service client", "Atención al cliente"],
    "Questions? Chat with us.": ["Fragen? Schreiben Sie uns.", "Une question ? Écrivez-nous.", "¿Preguntas? Escríbenos."],
    "Close window and stop any RTT or TC call": ["Fenster schließen und RTT-/TC-Verbindung beenden", "Fermer la fenêtre et arrêter la communication RTT ou TC", "Cerrar la ventana y finalizar la conexión RTT o TC"],
    "Checking availability…": ["Verfügbarkeit wird geprüft…", "Vérification de la disponibilité…", "Comprobando disponibilidad…"],
    "What should we call you?": ["Wie dürfen wir Sie nennen?", "Comment vous appelez-vous ?", "¿Cómo te llamas?"],
    "First name or nickname": ["Vorname oder Spitzname", "Prénom ou pseudonyme", "Nombre o apodo"],
    "Language": ["Sprache", "Langue", "Idioma"],
    "Window language": ["Sprache dieses Fensters", "Langue de cette fenêtre", "Idioma de esta ventana"],
    "RTT shares text while typing with the assigned agent, before sending. Camera and microphone stay off until you allow them. This chat uses a necessary session cookie. Your name and messages are removed during cleanup 30 days after closing. Do not share identity numbers, medical information or passwords. Not an emergency service.": [
      "RTT teilt Text bereits beim Tippen mit der zuständigen Person, vor dem Senden. Kamera und Mikrofon bleiben aus, bis Sie sie erlauben. Dieser Chat verwendet ein notwendiges Sitzungscookie. Name und Nachrichten werden bei der Bereinigung 30 Tage nach dem Schließen gelöscht. Teilen Sie keine Identifikationsnummern, medizinischen Angaben oder Passwörter. Kein Notfalldienst.",
      "Le RTT partage le texte pendant la saisie avec votre interlocuteur, avant l'envoi. La caméra et le microphone restent désactivés sans votre accord. Ce chat utilise un cookie de session nécessaire. Votre nom et vos messages sont supprimés lors du nettoyage 30 jours après la clôture. Ne partagez pas de numéros d'identification, de données médicales ou de mots de passe. Ce n'est pas un service d'urgence.",
      "RTT comparte el texto mientras escribes con el agente asignado, antes de enviarlo. La cámara y el micrófono permanecen apagados hasta que los autorices. Este chat utiliza una cookie de sesión necesaria. El nombre y los mensajes se eliminan durante la limpieza 30 días después del cierre. No compartas números de identificación, información médica ni contraseñas. No es un servicio de emergencias."],
    "I agree to share live text while typing and have read the information.": ["Ich stimme dem Teilen von Text während des Tippens zu und habe die Hinweise gelesen.", "J'accepte le partage du texte pendant la saisie et j'ai lu les informations.", "Acepto compartir el texto mientras escribo y he leído la información."],
    "Information and privacy": ["Informationen und Datenschutz", "Informations et confidentialité", "Información y privacidad"],
    "Start chat": ["Chat starten", "Démarrer le chat", "Iniciar chat"],
    "Your message": ["Ihre Nachricht", "Votre message", "Tu mensaje"],
    "Type your question…": ["Geben Sie Ihre Frage ein…", "Écrivez votre question…", "Escribe tu pregunta…"],
    "Send": ["Senden", "Envoyer", "Enviar"],
    "Close chat": ["Chat beenden", "Clore le chat", "Cerrar chat"],
    "New chat": ["Neuer Chat", "Nouveau chat", "Nuevo chat"],
    "Do not share sensitive information.": ["Teilen Sie keine vertraulichen Daten.", "Ne partagez pas de données sensibles.", "No compartas información sensible."],
    "Close this chat? You can start a new chat afterwards.": ["Diesen Chat beenden? Danach können Sie einen neuen Chat starten.", "Clore ce chat ? Vous pourrez ensuite en démarrer un autre.", "¿Cerrar este chat? Después podrás iniciar otro."],
    "Yes, close": ["Ja, beenden", "Oui, clore", "Sí, cerrar"],
    "Back": ["Zurück", "Retour", "Volver"],
    "Chat messages": ["Chatnachrichten", "Messages du chat", "Mensajes del chat"],
    "An agent is available. A reply may take a moment.": ["Eine Servicekraft ist verfügbar. Eine Antwort kann etwas dauern.", "Un agent est disponible. La réponse peut prendre un instant.", "Hay un agente disponible. La respuesta puede tardar un momento."],
    "No agent is available now. Leave a message and keep this page open for a reply.": ["Zurzeit ist niemand verfügbar. Hinterlassen Sie eine Nachricht und lassen Sie die Seite für eine Antwort geöffnet.", "Aucun agent n'est disponible. Laissez un message et gardez cette page ouverte pour recevoir la réponse.", "Ahora no hay agentes disponibles. Deja un mensaje y mantén esta página abierta para recibir la respuesta."],
    "This chat is closed.": ["Dieser Chat ist beendet.", "Ce chat est clos.", "Este chat está cerrado."],
    "An agent": ["Eine Servicekraft", "Un agent", "Un agente"],
    " is helping you in this chat.": [" hilft Ihnen in diesem Chat.", " vous aide dans ce chat.", " te atiende en este chat."],
    " has picked up your chat but is offline. Your message is saved.": [" hat den Chat übernommen, ist aber offline. Ihre Nachricht wird gespeichert.", " a pris votre chat en charge mais est hors ligne. Votre message est enregistré.", " ha aceptado tu chat, pero está desconectado. Tu mensaje está guardado."],
    "You are in the queue. Waiting for an agent to pick up your chat.": ["Sie sind in der Warteschlange. Warten auf die Übernahme Ihres Chats.", "Vous êtes dans la file d'attente. Un agent doit prendre votre chat en charge.", "Estás en la cola. Esperando a que un agente acepte tu chat."],
    "No agent available yet. Your message is queued; keep this page open for a reply.": ["Noch niemand verfügbar. Ihre Nachricht wartet; lassen Sie diese Seite für eine Antwort geöffnet.", "Aucun agent disponible pour le moment. Votre message est en attente ; gardez cette page ouverte pour la réponse.", "Todavía no hay agentes disponibles. Tu mensaje está en la cola; mantén esta página abierta para recibir la respuesta."],
    "You": ["Sie", "Vous", "Tú"],
    "You: ": ["Sie: ", "Vous : ", "Tú: "],
    " · agent": [" · Service", " · agent", " · agente"],
    " · live text": [" · Live-Text", " · texte en direct", " · texto en directo"],
    "Connection interrupted. Availability unknown.": ["Verbindung unterbrochen. Verfügbarkeit unbekannt.", "Connexion interrompue. Disponibilité inconnue.", "Conexión interrumpida. Disponibilidad desconocida."],
    "Connection failed. Your text is preserved. Please try again.": ["Verbindung fehlgeschlagen. Ihr Text bleibt erhalten. Bitte erneut versuchen.", "Échec de la connexion. Votre texte est conservé. Veuillez réessayer.", "Error de conexión. Tu texto se conserva. Inténtalo de nuevo."],
    "Too many requests. Please try again later.": ["Zu viele Anfragen. Bitte später erneut versuchen.", "Trop de demandes. Veuillez réessayer plus tard.", "Demasiadas solicitudes. Inténtalo más tarde."],
    "Refresh the chat and try again.": ["Laden Sie den Chat neu und versuchen Sie es erneut.", "Actualisez le chat et réessayez.", "Actualiza el chat e inténtalo de nuevo."],
    "Please allow translation and check the other participant's consent.": ["Erlauben Sie die Übersetzung und prüfen Sie die Zustimmung der anderen Person.", "Autorisez la traduction et vérifiez l'accord de l'autre personne.", "Autoriza la traducción y comprueba el consentimiento de la otra persona."],
    "About this chat": ["Über diesen Chat", "À propos de ce chat", "Información sobre este chat"],
    "RTT is on by default once the agent joins: text is shared while typing, before sending. Camera and microphone only start when you call an interpreter or accept a video invitation. Translation works automatically after consent. Do not share sensitive information.": [
      "RTT ist standardmäßig aktiv, sobald die Servicekraft teilnimmt: Text wird bereits beim Tippen geteilt. Kamera und Mikrofon starten nur, wenn Sie eine dolmetschende Person anrufen oder eine Videoeinladung annehmen. Übersetzung erfolgt nach Zustimmung automatisch. Teilen Sie keine vertraulichen Daten.",
      "Le RTT est activé dès que l'agent rejoint le chat : le texte est partagé pendant la saisie, avant l'envoi. La caméra et le microphone démarrent seulement si vous appelez un interprète ou acceptez une invitation vidéo. La traduction est automatique après consentement. Ne partagez pas de données sensibles.",
      "RTT está activo cuando se une el agente: el texto se comparte mientras escribes, antes de enviarlo. La cámara y el micrófono solo se activan al llamar a un intérprete o aceptar una invitación de vídeo. La traducción funciona automáticamente tras el consentimiento. No compartas información sensible."],
    "Allow the sign language interpreter to receive your video, audio and live text? Earlier chat history is not shared.": ["Darf die gebärdensprachdolmetschende Person Ihr Bild, Ihren Ton und Live-Text empfangen? Frühere Chatnachrichten werden nicht geteilt.", "Autoriser l'interprète en langue des signes à recevoir votre vidéo, votre audio et votre texte en direct ? Les messages précédents ne sont pas partagés.", "¿Permites que el intérprete de lengua de signos reciba tu vídeo, audio y texto en directo? No se comparte el historial anterior."],
    "Call a sign language interpreter": ["Gebärdensprachdolmetscher anrufen", "Appeler un interprète en langue des signes", "Llamar a un intérprete de lengua de signos"],
    "Sign language interpreter": ["Gebärdensprachdolmetscher", "Interprète en langue des signes", "Intérprete de lengua de signos"],
    "Decline": ["Ablehnen", "Refuser", "Rechazar"],
    "Allow interpreter": ["Dolmetscher zulassen", "Autoriser l'interprète", "Permitir al intérprete"],
    "End video and audio": ["Bild und Ton beenden", "Arrêter la vidéo et l'audio", "Finalizar vídeo y audio"],
    "Remove interpreter": ["Dolmetscher entfernen", "Retirer l'interprète", "Retirar al intérprete"],
    "Cancel interpreter request": ["Dolmetschanfrage abbrechen", "Annuler la demande d'interprète", "Cancelar la solicitud de intérprete"],
    "Call ended. Text chat remains available.": ["Anruf beendet. Der Textchat bleibt verfügbar.", "Appel terminé. Le chat textuel reste disponible.", "Llamada finalizada. El chat de texto sigue disponible."],
    "Call stopped. Text chat remains available.": ["Anruf gestoppt. Der Textchat bleibt verfügbar.", "Appel arrêté. Le chat textuel reste disponible.", "Llamada detenida. El chat de texto sigue disponible."],
    "Call stopped.": ["Anruf gestoppt.", "Appel arrêté.", "Llamada detenida."],
    "This call is open in another window. End it there before starting here.": ["Dieser Anruf ist in einem anderen Fenster geöffnet. Beenden Sie ihn dort, bevor Sie hier starten.", "Cet appel est ouvert dans une autre fenêtre. Terminez-le là-bas avant de commencer ici.", "Esta llamada está abierta en otra ventana. Finalízala allí antes de empezar aquí."],
    "Incoming call: choose whether to join.": ["Eingehender Anruf: Wählen Sie, ob Sie teilnehmen möchten.", "Appel entrant : choisissez de participer ou non.", "Llamada entrante: elige si quieres participar."],
    "Waiting for the other participant to agree…": ["Warten auf die Zustimmung der anderen Person…", "En attente de l'accord de l'autre personne…", "Esperando el consentimiento de la otra persona…"],
    "Interpreter requested; waiting for consent and an available interpreter.": ["Dolmetscher angefragt; warten auf Zustimmung und Verfügbarkeit.", "Interprète demandé ; en attente d'accord et de disponibilité.", "Intérprete solicitado; esperando consentimiento y disponibilidad."],
    "The interpreter is joining. Live text is shared once connected.": ["Der Dolmetscher tritt bei. Live-Text wird nach dem Verbindungsaufbau geteilt.", "L'interprète rejoint l'appel. Le texte en direct est partagé une fois la connexion établie.", "El intérprete se está uniendo. El texto en directo se comparte al conectarse."],
    "Connecting RTT… Text chat remains available.": ["RTT wird verbunden… Der Textchat bleibt verfügbar.", "Connexion RTT… Le chat textuel reste disponible.", "Conectando RTT… El chat de texto sigue disponible."],
    "TC with interpreter connected. What you type is shared live.": ["TC mit Dolmetscher verbunden. Ihr Text wird beim Tippen geteilt.", "TC connecté avec l'interprète. Votre texte est partagé pendant la saisie.", "TC conectado con intérprete. Lo que escribes se comparte en directo."],
    "Live RTT connected. What you type from now on is shared live.": ["RTT verbunden. Was Sie ab jetzt tippen, wird live geteilt.", "RTT connecté. Ce que vous tapez désormais est partagé en direct.", "RTT conectado. Lo que escribas a partir de ahora se comparte en directo."],
    "RTT, TC and an interpreter become available once an agent picks up this chat.": ["RTT, TC und Dolmetscher sind verfügbar, sobald eine Servicekraft den Chat übernimmt.", "RTT, TC et interprète seront disponibles lorsqu'un agent prendra ce chat en charge.", "RTT, TC e intérprete estarán disponibles cuando un agente acepte el chat."],
    "Camera or microphone permission denied. You can still use text chat or RTT without a camera.": ["Zugriff auf Kamera oder Mikrofon abgelehnt. Textchat und RTT ohne Kamera bleiben nutzbar.", "Accès à la caméra ou au microphone refusé. Le chat textuel et le RTT sans caméra restent utilisables.", "Permiso de cámara o micrófono denegado. Puedes seguir usando el chat de texto o RTT sin cámara."],
    "This browser does not support calls. Use an up-to-date browser with HTTPS; text chat still works.": ["Dieser Browser unterstützt keine Anrufe. Nutzen Sie einen aktuellen Browser mit HTTPS; der Textchat funktioniert weiterhin.", "Ce navigateur ne prend pas en charge les appels. Utilisez un navigateur récent avec HTTPS ; le chat textuel fonctionne toujours.", "Este navegador no admite llamadas. Usa un navegador actualizado con HTTPS; el chat de texto sigue funcionando."],
    "Interpreter connection interrupted. Your call with the agent continues.": ["Dolmetschverbindung unterbrochen. Ihr Gespräch mit der Servicekraft läuft weiter.", "Connexion de l'interprète interrompue. Votre appel avec l'agent continue.", "Conexión del intérprete interrumpida. Tu llamada con el agente continúa."],
    "Call unavailable. Please try again; text chat remains available.": ["Anruf nicht verfügbar. Bitte erneut versuchen; der Textchat bleibt verfügbar.", "Appel indisponible. Réessayez ; le chat textuel reste disponible.", "Llamada no disponible. Inténtalo de nuevo; el chat de texto sigue disponible."],
    "Live text from participants": ["Live-Text der Teilnehmenden", "Texte en direct des participants", "Texto en directo de los participantes"],
    "Camera": ["Kamera", "Caméra", "Cámara"],
    "Microphone": ["Mikrofon", "Microphone", "Micrófono"],
    " off": [" ausschalten", " : désactiver", " — desactivar"],
    " on": [" einschalten", " : activer", " — activar"],
    "Start video / audio": ["Bild / Ton starten", "Démarrer la vidéo / l'audio", "Iniciar vídeo / audio"],
    "Join Total Conversation? You will share live text, camera and microphone.": ["An Total Conversation teilnehmen? Sie teilen Live-Text, Kamera und Mikrofon.", "Rejoindre Total Conversation ? Vous partagerez texte en direct, caméra et microphone.", "¿Unirte a Total Conversation? Compartirás texto en directo, cámara y micrófono."],
    "Join RTT? What you type is shared live, without camera or microphone.": ["An RTT teilnehmen? Ihr Text wird live geteilt, ohne Kamera oder Mikrofon.", "Rejoindre le RTT ? Votre texte est partagé en direct, sans caméra ni microphone.", "¿Unirte a RTT? Lo que escribes se comparte en directo, sin cámara ni micrófono."],
    "Join with video, audio and RTT": ["Mit Bild, Ton und RTT teilnehmen", "Rejoindre avec vidéo, audio et RTT", "Unirse con vídeo, audio y RTT"],
    "Translate into": ["Übersetzen ins", "Traduire en", "Traducir al"],
    "Translation": ["Übersetzung", "Traduction", "Traducción"],
    "Off": ["Aus", "Désactivée", "Desactivada"],
    "Manual": ["Manuell", "Manuelle", "Manual"],
    "Automatic": ["Automatisch", "Automatique", "Automática"],
    "I allow chat messages to be sent to Google Cloud Translation. Do not share sensitive information.": ["Ich erlaube, Chatnachrichten an Google Cloud Translation zu senden. Keine vertraulichen Daten teilen.", "J'autorise l'envoi des messages à Google Cloud Translation. Ne partagez pas de données sensibles.", "Permito enviar los mensajes a Google Cloud Translation. No compartas información sensible."],
    "In Automatic mode, also translate live RTT: send my own and received text to Google before sending the message.": ["Im automatischen Modus auch Live-RTT übersetzen: eigenen und empfangenen Text vor dem Absenden an Google senden.", "En mode automatique, traduire aussi le RTT : envoyer à Google mon texte et celui reçu avant l'envoi du message.", "En modo automático, traducir también RTT: enviar a Google mi texto y el recibido antes de enviar el mensaje."],
    "Both participants must agree. Translations may contain errors. No audio translation. Consent applies only to this chat; choose Off and save to withdraw it.": ["Beide Personen müssen zustimmen. Übersetzungen können Fehler enthalten. Keine Audioübersetzung. Die Zustimmung gilt nur für diesen Chat; zum Widerruf Aus wählen und speichern.", "Les deux personnes doivent accepter. Les traductions peuvent contenir des erreurs. Pas de traduction audio. L'accord concerne uniquement ce chat ; choisissez Désactivée et enregistrez pour le retirer.", "Ambas personas deben aceptar. Las traducciones pueden contener errores. Sin traducción de audio. El consentimiento solo se aplica a este chat; selecciona Desactivada y guarda para retirarlo."],
    "Save": ["Speichern", "Enregistrer", "Guardar"],
    "Provisional translation": ["Vorläufige Übersetzung", "Traduction provisoire", "Traducción provisional"],
    "May contain errors · Google Cloud Translation": ["Kann Fehler enthalten · Google Cloud Translation", "Peut contenir des erreurs · Google Cloud Translation", "Puede contener errores · Google Cloud Translation"],
    "Translating…": ["Wird übersetzt…", "Traduction en cours…", "Traduciendo…"],
    "Translation unavailable. The original chat still works.": ["Übersetzung nicht verfügbar. Der ursprüngliche Chat funktioniert weiterhin.", "Traduction indisponible. Le chat original fonctionne toujours.", "Traducción no disponible. El chat original sigue funcionando."],
    "Translation is off.": ["Übersetzung ist ausgeschaltet.", "La traduction est désactivée.", "La traducción está desactivada."],
    "Waiting for the other participant's consent.": ["Warten auf die Zustimmung der anderen Person.", "En attente de l'accord de l'autre personne.", "Esperando el consentimiento de la otra persona."],
    "Translation enabled. Originals are preserved.": ["Übersetzung eingeschaltet. Originale bleiben erhalten.", "Traduction activée. Les originaux sont conservés.", "Traducción activada. Se conservan los originales."],
    "Translate": ["Übersetzen", "Traduire", "Traducir"]
  };
  const normalize = (value) => Object.keys(languages).find((code) => String(value).toLowerCase().split("-")[0] === code) || "en";
  const create = (initial = "nl", remember = false) => {
    let language = normalize(initial);
    if (remember) { try { const saved = sessionStorage.getItem("teletyptel_support_language"); if (Object.hasOwn(languages, saved)) language = saved; } catch {} }
    const listeners = new Set();
    const word = (dutch, english) => language === "nl" ? dutch : language === "en" ? english : messages[english]?.[["de", "fr", "es"].indexOf(language)] || english;
    return {
      languages,
      get language() { return language; },
      word,
      onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      set(value) {
        if (!Object.hasOwn(languages, value) || value === language) return;
        language = value;
        if (remember) { try { sessionStorage.setItem("teletyptel_support_language", language); } catch {} }
        listeners.forEach((listener) => listener());
      },
      options(select) {
        select.replaceChildren(...Object.entries(languages).map(([code, name]) => { const option = document.createElement("option"); option.value = code; option.textContent = name; return option; }));
        select.value = language;
      },
      failure(error, translation = false) {
        if (error?.status === 429) return word("Te veel aanvragen. Probeer het later opnieuw.", "Too many requests. Please try again later.");
        if ([401, 403].includes(error?.status)) return translation ? word("Controleer de vertaalinstellingen voor dit gesprek of ververs de chat.", "Check the translation settings for this chat or refresh the chat.") : word("Ververs de chat en probeer opnieuw.", "Refresh the chat and try again.");
        return translation ? word("Vertaling niet beschikbaar. De originele chat blijft werken.", "Translation unavailable. The original chat still works.") : word("Verbinding mislukt. Je tekst blijft staan; probeer opnieuw.", "Connection failed. Your text is preserved. Please try again.");
      }
    };
  };
  return { create, languages, messages };
})();
