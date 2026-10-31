import Contacts
import ContactsUI

@objc(TeleTypTelContactsPlugin)
final class TeleTypTelContactsPlugin: CAPPlugin, CAPBridgedPlugin, CNContactPickerDelegate {
    let identifier = "TeleTypTelContactsPlugin"
    let jsName = "TeleTypTelContacts"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickPhoneNumber", returnType: CAPPluginReturnPromise)
    ]
    private var pendingCall: CAPPluginCall?

    @objc func pickPhoneNumber(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard isBundledMessenger(self.bridge?.webView?.url),
                  let presenter = self.bridge?.viewController else {
                call.reject("Contacts are only available in the bundled Messenger.", "UNTRUSTED_ORIGIN")
                return
            }
            guard self.pendingCall == nil, presenter.presentedViewController == nil else {
                call.reject("Another selection is already open.", "BUSY")
                return
            }
            self.pendingCall = call
            let english = call.getString("language") == "en"
            let consent = UIAlertController(
                title: english ? "Choose an iPhone contact?" : "Een iPhone-contact kiezen?",
                message: english
                    ? "Only the phone number you select will fill the dialer. Your address book is not imported or uploaded. Nothing is saved and no call starts automatically."
                    : "Alleen het gekozen telefoonnummer wordt ingevuld. Je adresboek wordt niet geïmporteerd of geüpload. Er wordt niets opgeslagen en niet automatisch gebeld.",
                preferredStyle: .alert)
            consent.addAction(UIAlertAction(title: english ? "Cancel" : "Annuleren", style: .cancel) { _ in
                self.finish(number: nil, code: "CANCELLED")
            })
            consent.addAction(UIAlertAction(title: english ? "Allow selection" : "Kiezen toestaan", style: .default) { [weak consent] _ in
                consent?.dismiss(animated: true) {
                    guard isBundledMessenger(self.bridge?.webView?.url), self.pendingCall != nil else {
                        self.finish(number: nil, code: "UNTRUSTED_ORIGIN")
                        return
                    }
                    let picker = CNContactPickerViewController()
                    picker.delegate = self
                    picker.displayedPropertyKeys = [CNContactPhoneNumbersKey]
                    picker.predicateForEnablingContact = NSPredicate(format: "phoneNumbers.@count > 0")
                    picker.predicateForSelectionOfContact = NSPredicate(value: false)
                    picker.predicateForSelectionOfProperty = NSPredicate(format: "key == %@", CNContactPhoneNumbersKey)
                    picker.modalPresentationStyle = .fullScreen
                    presenter.present(picker, animated: true)
                }
            })
            presenter.present(consent, animated: true)
        }
    }

    func contactPicker(_ picker: CNContactPickerViewController, didSelect contactProperty: CNContactProperty) {
        guard contactProperty.key == CNContactPhoneNumbersKey,
              let phone = contactProperty.value as? CNPhoneNumber else {
            finish(number: nil, code: "INVALID_SELECTION")
            return
        }
        let number = phone.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !number.isEmpty, number.count <= 40 else {
            finish(number: nil, code: "INVALID_SELECTION")
            return
        }
        finish(number: number, code: nil)
    }

    func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
        finish(number: nil, code: "CANCELLED")
    }

    private func finish(number: String?, code: String?) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        guard isBundledMessenger(bridge?.webView?.url) else {
            call.reject("Contacts selection is no longer available on this page.", "UNTRUSTED_ORIGIN")
            return
        }
        if let number = number {
            call.resolve(["phoneNumber": number])
        } else {
            call.reject("No phone number selected.", code ?? "CANCELLED")
        }
    }
}
