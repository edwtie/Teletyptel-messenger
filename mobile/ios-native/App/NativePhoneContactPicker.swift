import SwiftUI
import ContactsUI

struct NativePhoneContactPicker: UIViewControllerRepresentable {
    let selected: (String?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(selected: selected) }
    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let picker = CNContactPickerViewController()
        picker.delegate = context.coordinator
        picker.displayedPropertyKeys = [CNContactPhoneNumbersKey]
        picker.predicateForEnablingContact = NSPredicate(format: "phoneNumbers.@count > 0")
        picker.predicateForSelectionOfContact = NSPredicate(value: false)
        picker.predicateForSelectionOfProperty = NSPredicate(format: "key == %@", CNContactPhoneNumbersKey)
        return picker
    }
    func updateUIViewController(_ controller: CNContactPickerViewController, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, CNContactPickerDelegate {
        private var selected: ((String?) -> Void)?
        init(selected: @escaping (String?) -> Void) { self.selected = selected }
        nonisolated func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
            MainActor.assumeIsolated { finish(nil) }
        }
        nonisolated func contactPicker(_ picker: CNContactPickerViewController, didSelect contactProperty: CNContactProperty) {
            MainActor.assumeIsolated {
                guard contactProperty.key == CNContactPhoneNumbersKey,
                      let phone = contactProperty.value as? CNPhoneNumber, phone.stringValue.utf8.count <= 160 else { finish(nil); return }
                finish(NativeDialing.normalized(phone.stringValue))
            }
        }
        private func finish(_ value: String?) {
            let callback = selected; selected = nil; callback?(value)
        }
    }
}
